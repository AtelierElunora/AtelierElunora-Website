import {LetteringColorControls} from "./LetteringColorControls";
import { MatchingCardPreview } from "./MatchingCardPreview";
import { SaveDateDesigner, type SaveDatePreview } from "./SaveDateDesigner";
import { SAVE_DATE_HANDLE, type SaveDateDesign } from "./save-date-design";
import { useEffect, useId, useState } from "react";
import { useFetcher } from "react-router";
import type { loader } from "./routes/wedding-keepsakes.$shop";
import { liveBookingShop } from "./live-store";
import { bookingBundlePrice, bookingKeepsakeItem, magnetPrice, keepsakeLineTotal, keepsakeCheckoutUrl, productUrl, type KeepsakeProduct, type KeepsakeItem } from "./wedding-keepsakes";

export function WeddingKeepsakes({ shop, visible = true, confirmed = false, items = [], onChange, weddingDate = "", customerName = "", onPreview }: { customerName?:string; onPreview?:(value:SaveDatePreview|null)=>void; shop: string; visible?: boolean; confirmed?: boolean; items?: KeepsakeItem[]; weddingDate?: string; onChange?: (items: KeepsakeItem[]) => void }) {
  const catalogue = useFetcher<typeof loader>();
  const enabled = visible && shop === liveBookingShop;
  useEffect(() => { if (enabled && catalogue.state === "idle" && !catalogue.data) catalogue.load("/wedding-keepsakes/" + shop); }, [enabled, shop, catalogue]);
  if (!enabled) return null;
  return <section className="wedding-keepsakes" aria-label="Wedding keepsakes">
    <p className="eyebrow">BEFORE & AFTER YOUR CELEBRATION</p><h3>Wedding keepsakes</h3>
    <p>Save-the-dates, meaningful displays and a few more memories to keep.</p>{onChange && <div className="keepsake-bundle-banner"><strong>Save 15% when you bundle</strong><p>Add magnet sets or frames to your wedding booking and enjoy 15% off each selected keepsake. Your savings apply automatically at checkout.</p></div>}
    <div className="keepsakes-checkout-note"><strong>{onChange ? "One booking. One checkout." : "Keep celebrating"}</strong><p>{onChange ? "Add a keepsake below. Keepsakes are paid in full alongside your wedding prepayment or full payment. Shopify calculates shipping and any tax at checkout; your remaining wedding balance stays separate." : "These additional purchases use a separate Shopify checkout with shipping and any tax calculated there."}</p></div>
    {!catalogue.data && <p role="status">Loading current options…</p>}
    {catalogue.data?.unavailable && <p role="status">We couldn’t load the current options. <button type="button" onClick={() => catalogue.load("/wedding-keepsakes/" + shop)}>Try again</button></p>}
    {catalogue.data?.incomplete && !catalogue.data.unavailable && <p role="status">Some options couldn’t load. <button type="button" onClick={() => catalogue.load("/wedding-keepsakes/" + shop)}>Reload options</button></p>}
    {catalogue.data && !catalogue.data.unavailable && !catalogue.data.products.length && <p>Our keepsake collection is being updated. Please check back soon.</p>}
    {onChange && catalogue.data && <button type="button" onClick={() => catalogue.load("/wedding-keepsakes/" + shop)}>Refresh current options</button>}
    <div className="keepsake-grid">{catalogue.data?.products.map(product => <KeepsakeCard key={product.handle} product={product} confirmed={confirmed} weddingDate={weddingDate} customerName={customerName} onPreview={onPreview} item={items.find(i => i.handle === product.handle)} onChange={onChange ? item => onChange([...items.filter(i => i.handle !== product.handle), ...(item ? [item] : [])]) : undefined}/>)}</div>
  </section>;
}

export function KeepsakeCard({ product, confirmed, item, onChange, weddingDate = "", customerName = "", onPreview }: { customerName?:string; onPreview?:(value:SaveDatePreview|null)=>void; product: KeepsakeProduct; confirmed: boolean; weddingDate?: string; item?: KeepsakeItem; onChange?: (item: KeepsakeItem | null) => void }) {
  const inputId = useId();
  const [personalize, setPersonalize] = useState(!!item?.personalization);
  const [design, setDesign] = useState<SaveDateDesign | null>(item?.personalization || null);
  const isSaveDate = product.handle === SAVE_DATE_HANDLE;
  const [cardColor,setCardColor]=useState(item?.cardColor || "#4a4b36");
  const [cardPreview,setCardPreview]=useState<SaveDatePreview|null>(null);
  const [cardWording, setCardWording] = useState(item?.cardWording || "");
  const personalization = (value: SaveDateDesign | null) => {
    setDesign(value);
    if (item && onChange) onChange({...item, personalization:value || undefined, personalizationRequested:personalize});
  };
  const bulkVariant = isSaveDate && (!item || item.bulkPricing) ? product.variants.find(v=>v.bulk && v.available) : undefined;
  const [quantity,setQuantity] = useState(String(item?.bulkPricing ? item.quantity : 25));
  const quantityNumber=Number(quantity), validQuantity=Number.isSafeInteger(quantityNumber)&&quantityNumber>=25&&quantityNumber<=7158278;
  const [selected, setSelected] = useState(item?.variantId || bulkVariant?.id || product.variants.find(v => v.available)?.id || "");
  const variant = bulkVariant || product.variants.find(v => v.id === selected);
  const bulk = bulkVariant && validQuantity ? magnetPrice(quantityNumber,!!onChange) : null;
  const bundled = onChange && variant && !bulkVariant ? bookingBundlePrice(variant.priceCents) : null;
  const money = (cents: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
  return <article className="keepsake-card">
    {product.image && <img src={product.image} alt={product.name} loading="lazy" width="560" height="420"/>}
    <div className="keepsake-card-body"><h4>{product.name}</h4><p>{product.description}</p>
      {bulkVariant ? <div className="magnet-quantity">
        <label htmlFor={inputId}>How many magnets?</label><input id={inputId} type="number" inputMode="numeric" min="25" step="1" value={quantity} onChange={e=>{setQuantity(e.target.value);const n=Number(e.target.value);if(item&&onChange){if(Number.isSafeInteger(n)&&n>=25&&n<=7158278)onChange({...item,...bookingKeepsakeItem(product,bulkVariant,n)});else onChange(null);}}}/>
        <p>Order any whole-number quantity from 25. One design per order.</p>
        <div className="magnet-tier-list" aria-label="Volume pricing">{[{minimum:25,label:"25–49",price:300},{minimum:50,label:"50–99",price:250},{minimum:100,label:"100–249",price:225},{minimum:250,label:"250+",price:200}].map(t=><span key={t.minimum} data-active={bulk?.unitCents===t.price}><strong>{t.label}</strong>{money(t.price)} each</span>)}</div>
        {bulk ? <div className="keepsake-price" aria-live="polite"><p>{quantityNumber} magnets × {money(bulk.unitCents)} each</p>{onChange&&<del>{money(bulk.subtotalCents)}</del>} <strong>{money(bulk.totalCents)}</strong>{onChange&&<span className="keepsake-bundle-saving">Extra 15% with your booking · Save {money(bulk.savingCents)}</span>}<p>{quantityNumber<250 ? `Add ${([50,100,250].find(n=>n>quantityNumber)!-quantityNumber)} more to reach the next price tier.` : "You’ve reached our best volume price."}</p><span>USD · shipping and tax at checkout</span></div> : <p role="alert">Enter a whole-number quantity of at least 25.</p>}
      </div> : <>      <label htmlFor={inputId}>{product.handle === "save-the-date-photo-magnets" ? "Magnet set" : product.variants.length > 1 ? "Choose your option" : "Your collection"}</label>
      <select id={inputId} value={selected} onChange={e => { setSelected(e.target.value); if (item && onChange) { const v = product.variants.find(v => v.id === e.target.value)!; onChange({ ...item, ...bookingKeepsakeItem(product,v) }); } }}>{product.variants.filter(v=>!v.bulk).map(v => <option key={v.id} value={v.id} disabled={!v.available}>{v.name} · {money(onChange ? bookingBundlePrice(v.priceCents).unitCents : v.priceCents)}{onChange ? " · Save 15%" : ""}{v.available ? "" : " · Unavailable"}</option>)}</select>
      {variant && <p className="keepsake-price">{bundled ? <><del aria-label="Regular price">{money(variant.priceCents)}</del> <strong>{money(bundled.unitCents)}</strong><span className="keepsake-bundle-saving">Save 15% · {money(bundled.bundleDiscount.savingCents)} off with your booking</span></> : money(variant.priceCents)} <span>USD · shipping at checkout</span></p>}
</>}
      <p className="keepsake-note">{product.note}</p>
      {isSaveDate && onChange && <><label className="save-date-toggle"><input type="checkbox" checked={personalize} onChange={e=>{const enabled=e.target.checked;setPersonalize(enabled);if(item)onChange({...item,personalization:enabled?design||undefined:undefined,personalizationRequested:enabled});}}/><span>Personalize with your photo and date now</span></label>{personalize ? <SaveDateDesigner onPreview={value=>{setCardPreview(value);onPreview?.(value)}} initialDate={weddingDate} initialDesign={design} onChange={personalization}/> : <p className="save-date-help">You can send your photo and wording after booking if you prefer.</p>}</>}
      {isSaveDate && onChange && <div className="matching-card-customization">
        <h5>Your matching save-the-date card</h5>
        <label htmlFor={inputId+"-card"}>Wording to print on your card (optional)</label>
        <textarea id={inputId+"-card"} maxLength={1000} rows={5} value={cardWording} placeholder="Names, wedding date, venue or a personal message" aria-describedby={inputId+"-card-help"} onChange={e=>{const value=e.target.value;setCardWording(value);if(item)onChange({...item,cardWording:value.trim()||undefined});}}/>
        <LetteringColorControls label="Card lettering color" value={cardColor} onChange={value=>{setCardColor(value);if(item)onChange({...item,cardColor:value});}}/>
        <MatchingCardPreview view="set" wording={cardWording} names={customerName} color={cardColor} date={cardPreview?.date||weddingDate} magnetSrc={personalize ? cardPreview?.src : ""}/>
        <p id={inputId+"-card-help"} className="save-date-help">One matching card is included per magnet. Add your wording here, or leave blank to use the names and date from your magnet details. We’ll confirm the layout in your digital proof.</p>
      </div>}
      {onChange && variant?.available ? <button type="button" className={'keepsake-buy'+(item ? ' keepsake-added' : '')} aria-pressed={!!item} disabled={!item && ((personalize && !design) || (!!bulkVariant && !validQuantity))} onClick={() => onChange(item ? null : { ...bookingKeepsakeItem(product,variant,quantityNumber), ...(isSaveDate ? {cardColor} : {}), ...(isSaveDate && cardWording.trim() ? {cardWording:cardWording.trim()} : {}), ...(personalize ? {personalization:design||undefined,personalizationRequested:true} : {}) })}>{item ? "✓ Added · Remove" : "Add to my booking"}</button> : variant?.available && (confirmed && !isSaveDate ? <a className="keepsake-buy" href={keepsakeCheckoutUrl(variant)} target="_blank" rel="noopener noreferrer" aria-label={`Buy ${product.name} separately in Shopify (opens a new tab)`}>Buy separately in Shopify <span aria-hidden="true">↗</span></a> : <a className="keepsake-buy" href={productUrl(product, variant)} target="_blank" rel="noopener noreferrer" aria-label={`View ${product.name} (opens a new tab)`}>View product & details <span aria-hidden="true">↗</span></a>)}
    </div>
  </article>;
}
