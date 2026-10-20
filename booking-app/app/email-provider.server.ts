import { ManagedIdentityCredential } from "@azure/identity";
type EmailContent = {
  senderAddress: string;
  recipients: { to: { address: string }[] };
  content: { subject: string; plainText: string; html: string };
  replyTo: { address: string; displayName: string }[];
  userEngagementTrackingDisabled: boolean;
};
export function emailProvider(
  env: NodeJS.ProcessEnv = process.env,
  fetcher: typeof fetch = fetch,
  graphToken?: () => Promise<string>,
) {
  const kind = env.BOOKING_EMAIL_PROVIDER || "resend";
  const credential = new ManagedIdentityCredential({
    clientId: env.ELUNORA_PG_IDENTITY_CLIENT_ID,
  });
  const endpoint = (env.BOOKING_ACS_ENDPOINT || "").replace(/\/$/, "");
  const mailbox = env.BOOKING_GRAPH_MAILBOX || "";
  if (kind === "graph" && (!/^\S+@\S+\.\S+$/.test(mailbox) || !env.BOOKING_GRAPH_IDENTITY_CLIENT_ID))
    throw Error("Microsoft 365 sender identity is not configured.");
  const graphCredential = kind === "graph" ? new ManagedIdentityCredential({clientId: env.BOOKING_GRAPH_IDENTITY_CLIENT_ID}) : null;
  if (
    kind === "resend" &&
    !/^re_[A-Za-z0-9_-]+$/.test(env.BOOKING_RESEND_API_KEY || "")
  )
    throw Error("Booking email key is not configured.");
  if (
    kind === "acs" &&
    !/^https:\/\/[a-z0-9.-]+\.communication\.azure\.com$/.test(endpoint)
  )
    throw Error("Azure email endpoint is not configured.");
  if (!["resend", "acs", "graph"].includes(kind))
    throw Error("Unsupported email provider.");
  async function send(payload: EmailContent, operationId: string) {
    try {
      if (kind === "graph") {
        if (payload.senderAddress.toLowerCase() !== mailbox.toLowerCase())
          return {status: "failed", providerId: null};
        const auth = graphToken ? await graphToken() : (await graphCredential!.getToken("https://graph.microsoft.com/.default")).token;
        const r = await fetcher("https://graph.microsoft.com/v1.0/users/" + encodeURIComponent(mailbox) + "/sendMail", {
          method: "POST",
          headers: {Authorization: "Bearer " + auth, "Content-Type": "application/json", "client-request-id": operationId},
          body: JSON.stringify({message: {
            subject: payload.content.subject,
            body: {contentType: "HTML", content: payload.content.html},
            toRecipients: payload.recipients.to.map(to => ({emailAddress: {address: to.address}})),
            replyTo: payload.replyTo.map(reply => ({emailAddress: {address: reply.address, name: reply.displayName}})),
            internetMessageHeaders: [{name: "x-elunora-booking-operation", value: operationId}],
          }, saveToSentItems: true}),
          signal: AbortSignal.timeout(10000), redirect: "error",
        });
        // Graph 202 is submission, not confirmed delivery. There is no idempotency
        // guarantee for sendMail, so ambiguous failures must never be retried.
        return {status: r.status === 202 ? "submitted" : [400,401,403,404,422,429].includes(r.status) ? "failed" : "review", providerId: r.status === 202 ? operationId : null};
      }
      if (kind === "resend") {
        const r = await fetcher("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            Authorization: "Bearer " + env.BOOKING_RESEND_API_KEY,
            "Content-Type": "application/json",
            "Idempotency-Key": "elunora-booking/" + operationId,
          },
          body: JSON.stringify({
            from: `Atelier Elunora <${payload.senderAddress}>`,
            to: payload.recipients.to.map((r) => r.address),
            subject: payload.content.subject,
            text: payload.content.plainText,
            html: payload.content.html,
            reply_to: "support@atelierelunora.com",
          }),
          signal: AbortSignal.timeout(10000),
          redirect: "error",
        });
        if ([400, 401, 403, 422].includes(r.status))
          return { status: "failed", providerId: null };
        if (!r.ok) return { status: "sending", providerId: null };
        const result = await r.json();
        if (!/^[a-f0-9-]{36}$/.test(result.id || ""))
          return { status: "review", providerId: null };
        return { status: "accepted", providerId: result.id as string };
      }
      const auth = (
        await credential.getToken("https://communication.azure.com/.default")
      ).token;
      const r = await fetcher(
        endpoint + "/emails:send?api-version=2023-03-31",
        {
          method: "POST",
          headers: {
            Authorization: "Bearer " + auth,
            "Content-Type": "application/json",
            "Operation-Id": operationId,
          },
          body: JSON.stringify(payload),
          signal: AbortSignal.timeout(10000),
          redirect: "error",
        },
      );
      return {
        status:
          r.status === 202 && (await r.json()).id === operationId
            ? "accepted"
            : "review",
        providerId: operationId,
      };
    } catch {
      return {
        status: kind === "resend" ? "sending" : "review",
        providerId: null,
      };
    }
  }
  return {
    send,
    async poll(
      payload: EmailContent,
      operationId: string,
      providerId: string | null,
      attemptAt: string,
    ) {
      if (kind === "graph") return {status: providerId ? "submitted" : "review", providerId};
      if (kind === "resend" && !providerId) {
        if (Date.now() - Date.parse(attemptAt) > 23 * 3600000)
          return { status: "review", providerId: null };
        return send(payload, operationId);
      }
      try {
        const auth =
          kind === "resend"
            ? env.BOOKING_RESEND_API_KEY
            : (
                await credential.getToken(
                  "https://communication.azure.com/.default",
                )
              ).token;
        const url =
          kind === "resend"
            ? "https://api.resend.com/emails/" + providerId
            : endpoint +
              "/emails/operations/" +
              operationId +
              "?api-version=2023-03-31";
        const r = await fetcher(url, {
          headers: { Authorization: "Bearer " + auth },
          signal: AbortSignal.timeout(10000),
          redirect: "error",
        });
        if (!r.ok)
          return {
            status: r.status === 429 || r.status >= 500 ? "accepted" : "review",
            providerId,
          };
        const result = await r.json();
        if (result.id !== (kind === "resend" ? providerId : operationId))
          return { status: "review", providerId };
        const status =
          kind === "resend"
            ? {
                delivered: "delivered",
                bounced: "bounced",
                suppressed: "suppressed",
                complained: "complained",
                failed: "failed",
                sent: "accepted",
              }[result.last_event as string] || "accepted"
            : { Succeeded: "sent", Failed: "failed", Canceled: "failed" }[
                result.status as string
              ] || "accepted";
        return { status, providerId };
      } catch {
        return { status: "accepted", providerId };
      }
    },
  };
}
