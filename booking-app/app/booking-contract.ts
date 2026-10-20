import type {ServiceAgreement} from "./event-agreement";
export const SIGNATURE_CONSENT = "I have reviewed this contract, agree to its terms, and intend my typed name to be my electronic signature. I can print or save a copy.";
export type ContractDocument = {
  templateVersion: 1|2; serviceAgreement?:ServiceAgreement; reference: string; business: string; customerName: string; customerEmail: string;
  phone: string; weddingDate: string; venue: string; preferredStartTime: string; guests: number;
  collection: string; extras: {name: string; quantity: number; unitCents: number}[];
  currency: string; totalCents: number; prepaymentPercent: number; prepaymentCents: number;
  balanceCents: number; balanceDueDate: string; bookingNotes: string; quoteNotes: string;
  quoteRevision: number; termsVersion: number; termsText: string;
};
export type BookingContract = {
  revision: number; hash: string; document: ContractDocument; sourceInputHash?:string;
  providerSignature?: {name:string;title:string;signedAt:string;documentHash:string;consent:string;style:SignatureStyle};
  signature: null | {name: string; email: string; signedAt: string; documentHash: string;
    consent: string; style?:SignatureStyle; method: "typed-name-private-booking-link"; userAgent: string};
};
export const SIGNATURE_STYLES = [{id:"classic",label:"Classic",font:"italic 30px Georgia,serif"},{id:"script",label:"Handwritten style",font:'32px "Segoe Print","Bradley Hand",cursive'}] as const;
export type SignatureStyle=typeof SIGNATURE_STYLES[number]["id"];
export const PROVIDER_CONSENT="I am authorized to sign for the Provider, have reviewed this completed agreement and the customer's signature, and intend to countersign this exact document electronically.";
export function contractReadyForPayment(c:BookingContract|null|undefined){
  return !!c?.signature && c.signature.documentHash===c.hash && (!c.document.serviceAgreement?.requiresProviderSignature || c.providerSignature?.documentHash===c.hash);
}
export const contractMoney = (cents: number, currency: string) =>
  new Intl.NumberFormat("en-US", {style:"currency",currency}).format(cents / 100);
export function contractRows(d: ContractDocument): [string,string][] {
  const money = (n: number) => contractMoney(n,d.currency);
  return [
    ["Customer",d.customerName],["Email",d.customerEmail],["Phone",d.phone || "Not supplied"],
    ["Celebration date",d.weddingDate],["Venue and address",d.venue || "To be confirmed"],
    ["Preferred service start",d.preferredStartTime || "To be confirmed"],
    ["Guest count",d.guests?String(d.guests):"To be confirmed"],["Collection",d.collection],
    ...d.extras.map(e => [e.name + " × " + e.quantity,money(e.unitCents * e.quantity)] as [string,string]),
    ["Booking total",money(d.totalCents)],
    ["Prepayment option ("+d.prepaymentPercent+"%)",money(d.prepaymentCents)],
    ["Balance after prepayment",money(d.balanceCents)],
    ["Balance deadline",d.balanceCents===0?"No balance after full prepayment":d.balanceDueDate || "To be confirmed"],
  ];
}
export function contractPlainText(c: BookingContract) {
  const d=c.document;
  return [d.business+" · Booking contract","Booking reference: "+d.reference,"Contract revision: "+c.revision,
    ...contractRows(d).map(([label,value])=>label+": "+value),
    "Payment options: pay the prepayment shown above, or the full booking amount. Additional tax, if applicable, appears at Shopify checkout.",
    ...(d.bookingNotes?["Booking notes: "+d.bookingNotes]:[]),
    ...(d.quoteNotes?["Approved quote notes: "+d.quoteNotes]:[]),
    "Booking and cancellation terms · version "+d.termsVersion,d.termsText,
    c.signature ? "Electronically signed by "+c.signature.name+" ("+c.signature.email+") on "+c.signature.signedAt+"\n"+c.signature.consent : "Unsigned contract",
    ...(c.providerSignature?["Provider electronically signed by "+c.providerSignature.name+" ("+c.providerSignature.title+") on "+c.providerSignature.signedAt+"\n"+c.providerSignature.consent]:[]),
    "Document SHA-256: "+c.hash].join("\n\n");
}
const htmlEscapes:Record<string,string>={"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"};
const escapeHtml = (s: unknown) => String(s).replace(/[&<>"']/g,ch=>htmlEscapes[ch]);
export function contractPrintHtml(c: BookingContract) {
  if(c.document.serviceAgreement)return serviceAgreementPrintHtml(c);
  const d=c.document, rows=contractRows(d).map(([label,value])=>"<tr><th>"+escapeHtml(label)+"</th><td>"+escapeHtml(value)+"</td></tr>").join("");
  return '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="referrer" content="no-referrer"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Atelier Elunora booking contract</title><style>body{max-width:760px;margin:40px auto;padding:24px;color:#454734;background:#fffefa;font:15px/1.65 Arial,sans-serif}h1,h2{font-family:Georgia,serif;font-weight:normal}header{border-bottom:1px solid #d9d5c4;padding-bottom:24px}small{overflow-wrap:anywhere}table{width:100%;border-collapse:collapse}th,td{text-align:left;vertical-align:top;padding:9px 4px;border-bottom:1px solid #e9e5da}th{width:42%;font-weight:normal}section{margin:26px 0}.terms{white-space:pre-wrap}.signature{padding:20px;background:#efeddf;border:1px solid #d9d5c4}footer{font-size:11px;overflow-wrap:anywhere}@page{margin:18mm}@media print{body{margin:0;padding:0;background:white}tr,.signature{break-inside:avoid}h2{break-after:avoid}}</style></head><body><header><p>ATELIER ELUNORA</p><h1>Your celebration, in writing.</h1><p>Booking contract · revision '+c.revision+'</p><small>Reference '+escapeHtml(d.reference)+'</small></header><section><table>'+rows+'</table><p>Payment options: pay the prepayment shown above, or the full booking amount. Additional tax, if applicable, appears at Shopify checkout.</p></section>'+(d.bookingNotes?'<section><h2>Booking notes</h2><p class="terms">'+escapeHtml(d.bookingNotes)+'</p></section>':'')+(d.quoteNotes?'<section><h2>Approved quote notes</h2><p class="terms">'+escapeHtml(d.quoteNotes)+'</p></section>':'')+'<section><h2>Booking and cancellation terms</h2><p>Terms version '+d.termsVersion+'</p><div class="terms">'+escapeHtml(d.termsText)+'</div></section><section class="signature"><h2>'+(c.signature?'Electronically signed':'Awaiting signature')+'</h2>'+(c.signature?'<p>'+escapeHtml(c.signature.name)+'</p><p>'+escapeHtml(c.signature.email)+'<br>'+escapeHtml(c.signature.signedAt)+'</p><p>'+escapeHtml(c.signature.consent)+'</p>':'<p>This copy has not been electronically signed.</p>')+'</section><footer>Document SHA-256: '+escapeHtml(c.hash)+'</footer></body></html>';
}

function serviceAgreementPrintHtml(c:BookingContract){
  const a=c.document.serviceAgreement!;
  const sections=a.sections.map(s=>"<section><h2>"+escapeHtml(s.heading)+"</h2>"+s.paragraphs.map(p=>'<p class="terms">'+escapeHtml(p)+"</p>").join("")+"</section>").join("");
  const receipt=(label:string,person:{name:string;signedAt:string;consent:string;style?:SignatureStyle;title?:string}|null|undefined)=>'<section class="signature"><h2>'+label+"</h2>"+(person?'<p style="'+escapeHtml("font:"+(SIGNATURE_STYLES.find(s=>s.id===person.style)||SIGNATURE_STYLES[0]).font)+'">'+escapeHtml(person.name)+"</p>"+(person.title?"<p>"+escapeHtml(person.title)+"</p>":"")+"<p>"+escapeHtml(person.signedAt)+"</p><p>"+escapeHtml(person.consent)+"</p>":"<p>Awaiting electronic signature.</p>")+"</section>";
  return '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="referrer" content="no-referrer"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Atelier Elunora service agreement</title><style>body{max-width:800px;margin:40px auto;padding:24px;color:#292b24;background:#fffefa;font:15px/1.7 Arial,sans-serif}h1,h2{font-family:Georgia,serif;font-weight:normal}h1{font-size:30px}h2{font-size:21px;margin-top:28px}p{white-space:pre-wrap}small,footer{overflow-wrap:anywhere}footer{font-size:11px}.signature{border:1px solid #d9d5c4;padding:20px;margin:24px 0;break-inside:avoid}@page{margin:18mm}@media print{body{margin:0;padding:0;background:white}h2{break-after:avoid}p{orphans:3;widows:3}}</style></head><body><header><p>ATELIER ELUNORA</p><h1>'+escapeHtml(a.title)+'</h1><p>Reference '+escapeHtml(c.document.reference)+" · Revision "+c.revision+'</p><p>'+escapeHtml(a.introduction)+'</p></header>'+ (a.missingFields.length?'<p>Incomplete agreement — not available for signing. Required: '+escapeHtml(a.missingFields.join("; "))+"</p>":"")+sections+receipt("Client signature",c.signature)+receipt("Provider signature",c.providerSignature)+'<footer>Agreement source '+escapeHtml(a.sourceVersion)+"<br>Document SHA-256: "+escapeHtml(c.hash)+"</footer></body></html>";
}
