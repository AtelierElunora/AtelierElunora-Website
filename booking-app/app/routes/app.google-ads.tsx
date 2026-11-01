import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { Form, Link, useActionData, useLoaderData } from "react-router";
import { authenticate } from "../shopify.server";
import { requireOrigin } from "../booking.server";
import {
  createGoogleAdsFeed,
  disableGoogleAdsFeed,
  googleAdsDashboard,
} from "../google-ads.server";
export const headers = () => ({
  "Cache-Control": "no-store",
  "Referrer-Policy": "no-referrer",
});
export async function loader({ request }: LoaderFunctionArgs) {
  const { session } = await authenticate.admin(request);
  return {
    shop: session.shop,
    ...(await googleAdsDashboard(session.shop)),
    base: process.env.SHOPIFY_APP_URL || "",
  };
}
export async function action({ request }: ActionFunctionArgs) {
  const { session } = await authenticate.admin(request);
  requireOrigin(request);
  const f = await request.formData();
  try {
    if (f.get("intent") === "create") {
      if (f.get("confirm") !== "yes")
        throw Error("Confirm sharing the conversion feed with Google Ads.");
      return {
        credentials: await createGoogleAdsFeed(session.shop),
        error: "",
      };
    }
    if (f.get("intent") === "disable") {
      await disableGoogleAdsFeed(session.shop);
      return { credentials: null, error: "" };
    }
    throw Error("Unknown action.");
  } catch (e) {
    return {
      credentials: null,
      error: e instanceof Error ? e.message : "Could not update connection.",
    };
  }
}
export default function GoogleAds() {
  const c = useLoaderData<typeof loader>(),
    r = useActionData<typeof action>();
  return (
    <main style={{ maxWidth: 850, margin: "auto", padding: 24 }}>
      <h1>Google Ads conversion connection</h1>
      <p>
        <Link to="/app/leads">Back to inquiries</Link>
      </p>
      <p>
        Export status: {c.enabled ? "Feed enabled" : "Feed disabled"}. Google
        connection and import status must be checked in Google Ads Data Manager.
      </p>
      <p>
        This connection shares consented Google click IDs, qualification or
        confirmed-booking timestamps, and anonymous event IDs. It does not
        export names, email addresses, venue details, private inquiry links or
        payment amounts. Website inquiries continue using the existing GA4
        conversion.
      </p>
      <p>
        Mark a genuine inquiry qualified after confirming it fits your service
        and the customer is actively considering booking. Contacting someone
        alone does not qualify them. A confirmed booking is reported only after
        a verified payment. Existing bookings and inquiries without captured
        ad-click consent are not backfilled.
      </p>
      {r?.error && <p role="alert">{r.error}</p>}
      {r?.credentials && (
        <section role="status">
          <h2>Copy these credentials now</h2>
          <p>
            These credentials allow access to the conversion feed. Store them
            only in Google Ads Data Manager. Creating new credentials
            immediately invalidates the old ones.
          </p>
          <p>
            Username: <code>{r.credentials.username}</code>
          </p>
          <p>
            Password: <code>{r.credentials.password}</code>
          </p>
        </section>
      )}
      <h2>Google Ads Data Manager setup</h2>
      <ol>
        <li>
          Create two imported conversion actions, initially Secondary, counting
          one conversion per click: CRM Qualified Wedding Lead and CRM Confirmed
          Wedding Booking.
        </li>
        <li>
          Connect each using HTTPS with its matching URL below and the feed
          username and password.
        </li>
        <li>
          Required: in Select data, add a filter where Record_Type equals conversion.
          For empty feeds, use qualified-preview.csv or booked-preview.csv instead of the normal filename during setup.
          The opt-in preview contains one setup_test row with no customer data,
          an invalid placeholder instead of a click ID and a year-2000 timestamp. Normal URLs contain no sample rows.
          Verify the setup row is excluded before activating the connection.
        </li>
        <li>
          Map Google_Click_ID to Google click ID, Conversion_Time to conversion
          time, and Order_ID to transaction/order ID. Times include UTC offsets.
        </li>
        <li>
          Schedule daily imports and review Google’s import history. Keep
          existing budgets and bidding unchanged.
        </li>
      </ol>
      {["qualified", "booked"].map((k) => (
        <p key={k}>
          {k === "qualified" ? "Qualified lead feed" : "Confirmed booking feed"}
          :<br />
          <code style={{ overflowWrap: "anywhere" }}>
            {c.base}/google-ads-feed/{c.shop}/{k}.csv
          </code>
        </p>
      ))}
      <p>
        Last authenticated feed read: {c.lastFetchedAt || "Never"}. A read is
        not proof of a successful Google import. Google click IDs expire after
        90 days. This first version exports GCLID-attributed website leads only;
        iOS-only identifiers and manually entered leads are not included. Later
        refunds or cancellations require review in Google Ads.
      </p>
      <Form method="post">
        <input type="hidden" name="intent" value="create" />
        <label>
          <input type="checkbox" name="confirm" value="yes" required />
          Allow Google Ads to read the conversion data described above.
        </label>
        <p>
          <button>
            {c.enabled ? "Rotate feed credentials" : "Create feed credentials"}
          </button>
        </p>
      </Form>
      {c.enabled && (
        <Form method="post">
          <input type="hidden" name="intent" value="disable" />
          <button>Disable feed and revoke credentials</button>
        </Form>
      )}
    </main>
  );
}
