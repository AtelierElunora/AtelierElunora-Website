import db from "./db.server";
import { checkoutCredit } from "./checkout-credit.mjs";
import { details, locked, reservePayment } from "./booking.server";
import { allocate, parseConfig, percentAmount } from "./booking-rules";
import { moneyToCents, reconcileOrder } from "./payment-ledger.mjs";
type Admin = {
  graphql: (
    query: string,
    options?: { variables: Record<string, unknown> },
  ) => Promise<Response>;
};
const create = `mutation ElunoraCreateInvoice($input: DraftOrderInput!) { draftOrderCreate(input:$input) { draftOrder { id invoiceUrl totalPriceSet { presentmentMoney { amount currencyCode } } } userErrors { field message } } }`;
export const paymentSnapshotQuery = `query ElunoraVerifyPayment($id: ID!) { order(id:$id) { id updatedAt taxesIncluded customAttributes { key value } lineItems(first:2) { nodes { quantity originalUnitPriceSet { presentmentMoney { amount currencyCode } } } } totalPriceSet { presentmentMoney { amount currencyCode } } totalTaxSet { presentmentMoney { amount currencyCode } } currentTotalTaxSet { presentmentMoney { amount currencyCode } } totalDiscountsSet { presentmentMoney { amount currencyCode } } totalReceivedSet { presentmentMoney { amount currencyCode } } totalRefundedSet { presentmentMoney { amount currencyCode } } } }`;
const verify = paymentSnapshotQuery;
const draft = `query ElunoraDraftPayment($id: ID!) { draftOrder(id:$id) { id order { id } } }`;
export async function graphql(
  admin: Admin,
  q: string,
  variables: Record<string, unknown>,
) {
  const r = await admin.graphql(q, { variables });
  const body = await r.json();
  if (!r.ok || body.errors?.length)
    throw Error(
      "Shopify could not complete this request. Try refreshing the payment status.",
    );
  return body.data;
}
export async function invoice(
  admin: Admin,
  shop: string,
  id: string,
  kind: string,
) {
  const p = await reservePayment(shop, id, kind);
  if (p.invoiceUrl) return p.invoiceUrl;
  const b = await db.weddingBooking.findFirstOrThrow({ where: { id, shop } });
  try {
    const result = await graphql(admin, create, {
      input: {
        email: b.customerEmail,
        presentmentCurrencyCode: p.currency,
        acceptAutomaticDiscounts: false,
        allowDiscountCodesInCheckout: false,
        customAttributes: [
          { key: "elunora_booking_id", value: id },
          { key: "elunora_payment_id", value: p.id },
        ],
        tags: ["elunora-booking", `elunora-pay-${p.id}`],
        lineItems: [
          {
            title: `Atelier Elunora ${kind} · wedding ${b.weddingDate}`,
            quantity: 1,
            requiresShipping: false,
            taxable: details(b).taxable !== false,
            originalUnitPriceWithCurrency: {
              amount: (p.amountCents / 100).toFixed(2),
              currencyCode: p.currency,
            },
          },
        ],
      },
    });
    if (result.draftOrderCreate.userErrors.length) {
      await db.bookingPayment.update({
        where: { id: p.id },
        data: { status: "failed" },
      });
      throw Error(
        "Shopify rejected the invoice: " + result.draftOrderCreate.userErrors.map((e: {message: string}) => String(e.message).replace(/[^\s<>]+@[^\s<>]+/g,"[email]").slice(0,200)).join("; "),
      );
    }
    const order = result.draftOrderCreate.draftOrder;
    const grand = moneyToCents(
      order.totalPriceSet.presentmentMoney,
      p.currency,
    );
    await db.bookingPayment.update({
      where: { id: p.id },
      data: {
        draftOrderId: order.id,
        expectedGrandTotalCents: grand,
        status: grand >= p.amountCents ? "ready" : "review",
        invoiceUrl: grand >= p.amountCents ? order.invoiceUrl : null,
      },
    });
    if (grand < p.amountCents)
      throw Error(
        "Shopify added tax or changed the quote. This invoice needs owner review before collection; no checkout link was released.",
      );
    return order.invoiceUrl as string;
  } catch (error) {
    await db.bookingPayment.updateMany({
      where: { id: p.id, status: "creating" },
      data: { status: "review" },
    });
    throw error;
  }
}
export async function refreshPayment(
  admin: Admin,
  shop: string,
  paymentId: string,
) {
  let p = await db.bookingPayment.findFirstOrThrow({
    where: { id: paymentId, shop },
  });
  if (!p.orderId && p.draftOrderId) {
    const data = await graphql(admin, draft, { id: p.draftOrderId });
    if (data.draftOrder?.order?.id)
      p = await db.bookingPayment.update({
        where: { id: p.id },
        data: { orderId: data.draftOrder.order.id },
      });
  }
  if (!p.orderId) return;
  const data = await graphql(admin, verify, { id: p.orderId });
  if (!data.order)
    throw Error(
      "Shopify order is unavailable. Historical orders may require owner review.",
    );
  return recordPayment(shop, p.id, data.order);
}
export async function refreshBookingPayments(admin: Admin, shop: string, bookingId: string) {
  const payments = await db.bookingPayment.findMany({where:{shop,bookingId}});
  let unavailable = 0;
  for (const payment of payments) {
    try { await refreshPayment(admin,shop,payment.id); }
    catch { unavailable++; }
  }
  return unavailable
    ? `Available payments refreshed. ${unavailable} payment record(s) need owner review; previously verified credit is retained.`
    : "Payments refreshed from Shopify.";
}
export async function recordPayment(
  shop: string,
  paymentId: string,
  order: unknown,
  eventId?: string,
  topic = "manual_refresh",
) {
  return locked(shop, async (tx) => {
    if (
      eventId &&
      (await tx.bookingWebhook.findUnique({ where: { id: eventId } }))
    )
      return;
    const p = await tx.bookingPayment.findFirstOrThrow({
        where: { id: paymentId, shop },
      }),
      b = await tx.weddingBooking.findFirstOrThrow({
        where: { id: p.bookingId, shop },
      }),
      d = details(b);
    const snapshot = order as { updatedAt: string };
    if (
      p.orderUpdatedAt &&
      Date.parse(snapshot.updatedAt) < p.orderUpdatedAt.getTime()
    )
      return;
    const allocation = checkoutCredit(p.amountCents, p.currency, order);
    const payments = await tx.bookingPayment.findMany({
      where: {
        shop,
        bookingId: b.id,
        orderId: { not: null },
        orderUpdatedAt: { not: null },
      },
    });
    const receipts = payments.map((x) => ({
      orderId: x.orderId,
      paymentId: x.id,
      kind: x.kind,
      receivedCents: x.receivedCents,
      refundedCents: x.refundedCents,
      updatedAt: x.orderUpdatedAt!.toISOString(),
      creditedCents:
        d.paymentCredits?.[x.id] ?? x.receivedCents - x.refundedCents,
    }));
    const result = reconcileOrder(
      {
        ...b,
        totalCents: b.totalCents - (d.openingPaidCents || 0),
        currency: d.currency,
        receipts,
      },
      {
        bookingId: b.id,
        shop,
        paymentId: p.id,
        orderId: p.orderId,
        kind: p.kind,
        expectedGrandTotalCents: allocation.grandCents,
        creditCents: allocation.creditCents,
      },
      order,
    );
    const receipt = result.receipts.find(
      (r: { paymentId: string }) => r.paymentId === p.id,
    );
    let status = b.status;
    if (
      result.paidCents > 0 &&
      receipt.receivedCents === allocation.grandCents &&
      b.status === "hold"
    ) {
      try {
        const s = await tx.bookingSettings.findUniqueOrThrow({
          where: { shop },
        });
        d.resources = allocate(
          parseConfig(s.configJson),
          s.dailyCapacity,
          await tx.weddingBooking.findMany({
            where: { shop, weddingDate: b.weddingDate },
          }),
          b.weddingDate,
          b.id,
        );
        status = "confirmed";
      } catch {
        status = "paid_review";
      }
    }
    if (result.overpaymentCents && status !== "cancelled")
      status = "paid_review";
    if (status === "cancelled")
      d.refundProposalCents = percentAmount(
        result.paidCents + (d.openingPaidCents || 0),
        d.cancellationRefundPercent,
      );
    d.paymentCredits = {
      ...d.paymentCredits,
      [p.id]: result.receipts.find(
        (r: { paymentId: string }) => r.paymentId === p.id,
      ).creditedCents,
    };
    d.paymentTaxes = {
      ...d.paymentTaxes,
      [p.id]: allocation.netAdditionalTaxCents,
    };
    d.paymentStatus = result.paymentStatus;
    await tx.bookingPayment.update({
      where: { id: p.id },
      data: {
        expectedGrandTotalCents: allocation.grandCents,
        receivedCents: receipt.receivedCents,
        refundedCents: receipt.refundedCents,
        orderUpdatedAt: new Date(receipt.updatedAt),
        status:
          receipt.receivedCents === allocation.grandCents ? "settled" : "ready",
      },
    });
    await tx.weddingBooking.update({
      where: { id: b.id },
      data: {
        paidCents: result.paidCents + (d.openingPaidCents || 0),
        status,
        detailsJson: JSON.stringify(d),
      },
    });
    if (eventId)
      await tx.bookingWebhook.create({ data: { id: eventId, shop, topic } });
    if (result.paidCents + (d.openingPaidCents || 0) !== b.paidCents)
      await tx.bookingEvent.create({
        data: {
          shop,
          bookingId: b.id,
          kind: "payment",
          text: `Shopify verified payment: ${p.currency} ${(result.paidCents/100).toFixed(2)} applied to booking; ${p.currency} ${(result.remainingCents/100).toFixed(2)} remaining.`,
        },
      });
    return result;
  });
}
export async function enablePaymentWebhooks(admin: Admin) {
  const q = `mutation ElunoraPaymentWebhook($topic: WebhookSubscriptionTopic!, $webhookSubscription: WebhookSubscriptionInput!) { webhookSubscriptionCreate(topic:$topic,webhookSubscription:$webhookSubscription) { webhookSubscription { id topic uri } userErrors { field message } } }`;
  const existing = await graphql(
    admin,
    `
      query ElunoraExistingWebhooks {
        webhookSubscriptions(first: 250) {
          nodes {
            topic
            uri
          }
        }
      }
    `,
    {},
  );
  const targets = [
    ["ORDERS_PAID", "/webhooks/payments"],
    ["REFUNDS_CREATE", "/webhooks/payments"],
    ["ORDERS_CANCELLED", "/webhooks/payments"],
    ["APP_UNINSTALLED", "/webhooks/app/uninstalled"],
    ["APP_SCOPES_UPDATE", "/webhooks/app/scopes_update"],
  ];
  for (const [topic, path] of targets) {
    const uri = process.env.SHOPIFY_APP_URL + path;
    if (
      existing.webhookSubscriptions.nodes.some(
        (w: { topic: string; uri: string }) =>
          w.topic === topic && w.uri === uri,
      )
    )
      continue;
    const result = await graphql(admin, q, {
      topic,
      webhookSubscription: { uri },
    });
    if (result.webhookSubscriptionCreate.userErrors.length)
      throw Error(
        "Could not register payment notifications. Check the app permissions.",
      );
  }
}

export async function recoverInvoice(
  admin: Admin,
  shop: string,
  id: string,
  paymentId: string,
) {
  const p = await db.bookingPayment.findFirstOrThrow({
    where: { id: paymentId, bookingId: id, shop, status: "review" },
  });
  const result = await graphql(
    admin,
    `
      query ElunoraRecoverInvoice($query: String!) {
        draftOrders(first: 2, query: $query) {
          nodes {
            id
            invoiceUrl
            customAttributes {
              key
              value
            }
            totalPriceSet {
              presentmentMoney {
                amount
                currencyCode
              }
            }
            order {
              id
            }
          }
        }
      }
    `,
    { query: "tag:elunora-pay-" + p.id },
  );
  if (result.draftOrders.nodes.length !== 1)
    throw Error(
      "Recovery requires exactly one matching Shopify invoice. Inspect Shopify draft orders before retrying.",
    );
  const draft = result.draftOrders.nodes[0],
    attrs = new Map(
      draft.customAttributes.map((a: { key: string; value: string }) => [
        a.key,
        a.value,
      ]),
    );
  if (
    attrs.get("elunora_booking_id") !== id ||
    attrs.get("elunora_payment_id") !== p.id
  )
    throw Error("Invoice linkage does not match.");
  const total = moneyToCents(draft.totalPriceSet.presentmentMoney, p.currency);
  await db.bookingPayment.update({
    where: { id: p.id },
    data: {
      draftOrderId: draft.id,
      orderId: draft.order?.id || null,
      expectedGrandTotalCents: total,
      invoiceUrl: total >= p.amountCents ? draft.invoiceUrl : null,
      status: total >= p.amountCents ? "ready" : "review",
    },
  });
  if (draft.order?.id) await refreshPayment(admin, shop, p.id);
  if (total < p.amountCents)
    throw Error(
      "Recovered invoice has a different tax-inclusive total. Void it and review the quote.",
    );
}
