import { useEffect, useId, useState } from "react";
import { useFetcher } from "react-router";
import type { loader } from "./routes/wedding-keepsakes.$shop";
import { liveBookingShop } from "./live-store";
import { keepsakeCheckoutUrl, productUrl, type KeepsakeProduct, type KeepsakeItem } from "./wedding-keepsakes";

export function WeddingKeepsakes({ shop, visible = true, confirmed = false, items = [], onChange }: { shop: string; visible?: boolean; confirmed?: boolean; items?: KeepsakeItem[]; onChange?: (items: KeepsakeItem[]) => void }) {
  const catalogue = useFetcher<typeof loader>();
  const enabled = visible && shop === liveBookingShop;
  useEffect(() => { if (enabled && catalogue.state === "idle" && !catalogue.data) catalogue.load("/wedding-keepsakes/" + shop); }, [enabled, shop, catalogue]);
  if (!enabled) return null;
  return <section className="wedding-keepsakes" aria-label="Wedding keepsakes">
    <p className="eyebrow">BEFORE & AFTER YOUR CELEBRATION</p><h3>Wedding keepsakes</h3>
    <p>Save-the-dates, meaningful displays and a few more memories to keep.</p>
    <div className="keepsakes-checkout-note"><strong>{onChange ? "One booking. One checkout." : "Keep celebrating"}</strong><p>{onChange ? "Add a keepsake below. Keepsakes are paid in full alongside your wedding prepayment or full payment. Shopify calculates shipping and any tax at checkout; your remaining wedding balance stays separate." : "These additional purchases use a separate Shopify checkout with shipping and any tax calculated there."}</p></div>
    {!catalogue.data && <p role="status">Loading current options…</p>}
    {catalogue.data?.unavailable && <p role="status">We couldn’t load the current options. <button type="button" onClick={() => catalogue.load("/wedding-keepsakes/" + shop)}>Try again</button></p>}
    {catalogue.data?.incomplete && !catalogue.data.unavailable && <p role="status">Some options couldn’t load. <button type="button" onClick={() => catalogue.load("/wedding-keepsakes/" + shop)}>Reload options</button></p>}
    {catalogue.data && !catalogue.data.unavailable && !catalogue.data.products.length && <p>Our keepsake collection is being updated. Please check back soon.</p>}
    {onChange && catalogue.data && <button type="button" onClick={() => catalogue.load("/wedding-keepsakes/" + shop)}>Refresh current options</button>}
    <div className="keepsake-grid">{catalogue.data?.products.map(product => <KeepsakeCard key={product.handle} product={product} confirmed={confirmed} item={items.find(i => i.handle === product.handle)} onChange={onChange ? item => onChange([...items.filter(i => i.handle !== product.handle), ...(item ? [item] : [])]) : undefined}/>)}</div>
  </section>;
}

export function KeepsakeCard({ product, confirmed, item, onChange }: { product: KeepsakeProduct; confirmed: boolean; item?: KeepsakeItem; onChange?: (item: KeepsakeItem | null) => void }) {
  const inputId = useId();
  const [selected, setSelected] = useState(item?.variantId || product.variants.find(v => v.available)?.id || "");
  const variant = product.variants.find(v => v.id === selected);
  const money = (cents: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
  return <article className="keepsake-card">
    {product.image && <img src={product.image} alt={product.name} loading="lazy" width="560" height="420"/>}
    <div className="keepsake-card-body"><h4>{product.name}</h4><p>{product.description}</p>
      <label htmlFor={inputId}>{product.handle === "save-the-date-photo-magnets" ? "Magnet set" : product.variants.length > 1 ? "Choose your option" : "Your collection"}</label>
      <select id={inputId} value={selected} onChange={e => { setSelected(e.target.value); if (item && onChange) { const v = product.variants.find(v => v.id === e.target.value)!; onChange({ handle: product.handle, name: product.name, variantId: v.id, variantName: v.name, quantity: 1, unitCents: v.priceCents, note: product.note }); } }}>{product.variants.map(v => <option key={v.id} value={v.id} disabled={!v.available}>{v.name} · {money(v.priceCents)}{v.available ? "" : " · Unavailable"}</option>)}</select>
      {variant && <p className="keepsake-price">{money(variant.priceCents)} <span>USD · shipping at checkout</span></p>}
      <p className="keepsake-note">{product.note}</p>
      {onChange && variant?.available ? <button type="button" className={'keepsake-buy'+(item ? ' keepsake-added' : '')} aria-pressed={!!item} onClick={() => onChange(item ? null : { handle: product.handle, name: product.name, variantId: variant.id, variantName: variant.name, quantity: 1, unitCents: variant.priceCents, note: product.note })}>{item ? "✓ Added · Remove" : "Add to my booking"}</button> : variant?.available && (confirmed ? <a className="keepsake-buy" href={keepsakeCheckoutUrl(variant)} target="_blank" rel="noopener noreferrer" aria-label={`Buy ${product.name} separately in Shopify (opens a new tab)`}>Buy separately in Shopify <span aria-hidden="true">↗</span></a> : <a className="keepsake-buy" href={productUrl(product, variant)} target="_blank" rel="noopener noreferrer" aria-label={`View ${product.name} (opens a new tab)`}>View product & details <span aria-hidden="true">↗</span></a>)}
    </div>
  </article>;
}
