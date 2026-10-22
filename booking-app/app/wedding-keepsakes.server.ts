import { liveBookingShop } from "./live-store";
import { keepsakeProducts, keepsakeStore, type KeepsakeProduct, resolveKeepsakeSelection, type KeepsakeSelection } from "./wedding-keepsakes";

type ProductResponse = { handle?: unknown; published_at?: unknown; tags?: unknown; variants?: unknown; featured_image?: unknown; requires_selling_plan?: unknown };
export function publishedKeepsake(value: ProductResponse, spec: typeof keepsakeProducts[number]): KeepsakeProduct | null {
  if (!value || value.handle !== spec.handle || !value.published_at || value.requires_selling_plan === true || !Array.isArray(value.tags) || !value.tags.some(t => typeof t === "string" && /^(booking|event)[ -]add[ -]on$/i.test(t))) return null;
  const variants = (Array.isArray(value.variants) ? value.variants : []).flatMap(v => {
    if (!v || typeof v !== "object") return [];
    const { id, title, price, available, requires_shipping, requires_selling_plan } = v;
    if (!Number.isSafeInteger(id) || id <= 0 || typeof title !== "string" || !title.trim() || !Number.isSafeInteger(price) || price < 0 || typeof available !== "boolean" || requires_shipping !== true || requires_selling_plan === true) return [];
    return [{ id: String(id), name: title === "Default Title" || title === "Default" ? "One collection" : title.slice(0,200), priceCents: price, available }];
  });
  if (!variants.some(v => v.available)) return null;
  let image: string | null = null;
  if (typeof value.featured_image === "string") {
    try { const url = new URL(value.featured_image, keepsakeStore); if (url.protocol === "https:" && url.hostname === "cdn.shopify.com") image = url.toString(); } catch { /* Text remains available without an image. */ }
  }
  return { ...spec, image, variants };
}

type Catalogue = { products: KeepsakeProduct[]; incomplete: boolean };
let cache: { value: Catalogue; until: number } | undefined;
let pending: Promise<Catalogue> | undefined;
const productCache = new Map<string,{value:KeepsakeProduct|null;until:number}>();
export async function loadWeddingKeepsakes(shop: string, fetcher: typeof fetch = fetch) {
  if (shop !== liveBookingShop) return { products: [], incomplete: false };
  // No customer data, cookies, access tokens or booking information are sent.
  // Public Shopify prices use this USD storefront's default presentment currency.
  if (fetcher === fetch && cache && cache.until > Date.now()) return cache.value;
  if (fetcher === fetch && pending) return pending;
  const load = async () => {
    const results = await Promise.allSettled(keepsakeProducts.map(async (spec, index) => {
      const cached=fetcher===fetch && productCache.get(spec.handle);
      if(cached && cached.until>Date.now())return cached.value;
      if (fetcher === fetch && index) await new Promise(resolve => setTimeout(resolve, index * 1600));
      const url = `${keepsakeStore}/products/${spec.handle}.js`;
      const options = { signal: AbortSignal.timeout(5000), redirect: "error" as const, headers: { Accept: "application/json" } };
      let response = await fetcher(url, options);
      for(let attempt=0; response.status===429 && attempt<3; attempt++) {
        const retry=Number(response.headers.get("Retry-After") || String(attempt+2));
        if(!Number.isFinite(retry) || retry<0 || retry>5)break;
        if(fetcher===fetch)await new Promise(resolve=>setTimeout(resolve,Math.max(2,retry)*1000));
        response=await fetcher(url,{...options,signal:AbortSignal.timeout(5000)});
      }
      if (response.status === 404) return null;
      if (!response.ok) throw Error("Product catalogue is temporarily unavailable.");
      const value=publishedKeepsake(await response.json(), spec);
      if(fetcher===fetch)productCache.set(spec.handle,{value,until:Date.now()+60000});
      return value;
    }));
    if (results.every(r => r.status === "rejected")) throw Error("Product catalogue is temporarily unavailable.");
    const products = results.flatMap(r => r.status === "fulfilled" && r.value ? [r.value] : []);
    // Failed reads are never cached or substituted with old prices.
    const value = { products, incomplete: results.some(r => r.status === "rejected") };
    if (fetcher === fetch && !value.incomplete) cache = { value, until: Date.now() + 60000 };
    return value;
  };
  if (fetcher !== fetch) return load();
  pending = load();
  try { return await pending; } finally { pending = undefined; }
}

export async function validateWeddingKeepsakes(shop: string, raw: unknown): Promise<KeepsakeSelection | null> {
  if (raw === undefined || raw === null) return null;
  if (!Array.isArray(raw) || raw.length > 4) throw Error("Choose valid wedding keepsakes.");
  if (!raw.length) return null;
  if (shop !== liveBookingShop) throw Error("These keepsakes are unavailable for this store.");
  const catalogue = await loadWeddingKeepsakes(shop);
  return resolveKeepsakeSelection(raw, catalogue.products);
}
