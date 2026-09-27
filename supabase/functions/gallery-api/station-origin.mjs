const storefronts = new Set(['https://www.atelierelunora.com','https://atelierelunora.com','https://v0j63n-ms.myshopify.com','https://admin.shopify.com','https://extensions.shopifycdn.com']);
// Native URLSession has no Origin. This permits transport only; stationRequest
// still validates the event-specific bearer token, purpose, expiry and revocation.
export function stationOriginAllowed(request, nativeEnabled = false) {
  if (request.headers.has('origin')) return storefronts.has(request.headers.get('origin'));
  return nativeEnabled && request.method === 'POST'
    && ['/functions/v1/gallery-api/station','/gallery-api/station'].includes(new URL(request.url).pathname)
    && request.headers.get('x-elunora-request') === '1';
}
