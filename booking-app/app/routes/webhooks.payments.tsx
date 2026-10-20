import type { ActionFunctionArgs } from "react-router";
import { authenticate, unauthenticated } from "../shopify.server";
import db from "../db.server";
import { refreshPayment, paymentSnapshotQuery } from "../payment.server";
export async function action({ request }: ActionFunctionArgs) {
  const { shop, payload, topic } = await authenticate.webhook(request);
  if (!["ORDERS_PAID", "REFUNDS_CREATE", "ORDERS_CANCELLED"].includes(topic))
    return new Response(null, { status: 204 });
  const body = payload as {
    admin_graphql_api_id?: string;
    order_id?: number;
    id?: number;
  };
  const orderId =
    topic === "REFUNDS_CREATE"
      ? `gid://shopify/Order/${body.order_id}`
      : body.admin_graphql_api_id;
  if (!orderId || !/^gid:\/\/shopify\/Order\/\d+$/.test(orderId))
    return new Response(null, { status: 400 });
  const eventId = request.headers.get("X-Shopify-Event-Id");
  if (!eventId) return new Response(null, { status: 400 });
  if (await db.bookingWebhook.findUnique({ where: { id: eventId } }))
    return new Response(null, { status: 204 });
  let p = await db.bookingPayment.findFirst({ where: { shop, orderId } });
  const { admin } = await unauthenticated.admin(shop);
  if (!p) {
    const data = await (
      await admin.graphql(paymentSnapshotQuery, { variables: { id: orderId } })
    ).json();
    if ((data as { errors?: unknown }).errors)
      return new Response(null, { status: 503 });
    const attrs = new Map<string, string>(
      (data.data?.order?.customAttributes || []).map(
        (a: { key: string; value: string }) => [a.key, a.value],
      ),
    );
    const paymentId = attrs.get("elunora_payment_id");
    if (paymentId) {
      p = await db.bookingPayment.findFirst({
        where: {
          id: paymentId,
          shop,
          bookingId: attrs.get("elunora_booking_id"),
        },
      });
      if (p?.orderId && p.orderId !== orderId)
        return new Response(null, { status: 409 });
      if (p) {
        if (!p.draftOrderId) return new Response(null, { status: 409 });
        const source = await (
          await admin.graphql(
            `query ElunoraDraftPayment($id: ID!) { draftOrder(id:$id) { id order { id } } }`,
            { variables: { id: p.draftOrderId } },
          )
        ).json();
        if ((source as { errors?: unknown }).errors)
          return new Response(null, { status: 503 });
        if (source.data?.draftOrder?.order?.id !== orderId)
          return new Response(null, { status: 409 });
      }
      if (p)
        p = await db.bookingPayment.update({
          where: { id: p.id },
          data: { orderId },
        });
    }
  }
  if (p) {
    try {
      await refreshPayment(admin, shop, p.id);
    } catch {
      return new Response(null, { status: 503 });
    }
  }
  await db.bookingWebhook.upsert({
    where: { id: eventId },
    create: { id: eventId, shop, topic },
    update: {},
  });
  return new Response(null, { status: 204 });
}
