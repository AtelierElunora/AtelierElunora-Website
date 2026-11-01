import { Links, Meta, Outlet, Scripts, ScrollRestoration } from "react-router";

export default function App() {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="referrer" content="no-referrer"/>
        <meta name="viewport" content="width=device-width,initial-scale=1" />
        <link rel="preconnect" href="https://cdn.shopify.com/" />
        <link
          rel="stylesheet"
          href="https://cdn.shopify.com/static/fonts/inter/v4/styles.css"
        />
        <link rel="stylesheet" href="/booking.css?v=20261022-keepsakes"/>
        <link rel="stylesheet" href="/keepsakes.css?v=20261022"/>
        <link rel="stylesheet" href="/save-date.css?v=20261026-matching-card"/>
        <script type="module" src="/matching-card-preview.js?v=20261026-dynamic"/>
        <Meta />
        <Links />
      </head>
      <body>
        <Outlet />
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}
