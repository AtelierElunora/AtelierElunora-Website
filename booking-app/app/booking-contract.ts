export const SIGNATURE_CONSENT = "I have reviewed this contract, agree to its terms, and intend my typed name to be my electronic signature. I can print or save a copy.";
export type ContractDocument = {
  templateVersion: 1; reference: string; business: string; customerName: string; customerEmail: string;
  phone: string; weddingDate: string; venue: string; preferredStartTime: string; guests: number;
  collection: string; extras: {name: string; quantity: number; unitCents: number}[];
  currency: string; totalCents: number; prepaymentPercent: number; prepaymentCents: number;
  balanceCents: number; balanceDueDate: string; bookingNotes: string; quoteNotes: string;
  quoteRevision: number; termsVersion: number; termsText: string;
};
export type BookingContract = {
  revision: number; hash: string; document: ContractDocument;
  signature: null | {name: string; email: string; signedAt: string; documentHash: string;
    consent: string; method: "typed-name-private-booking-link"; userAgent: string};
};
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
    "Document SHA-256: "+c.hash].join("\n\n");
}
const htmlEscapes:Record<string,string>={"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"};
const escapeHtml = (s: unknown) => String(s).replace(/[&<>"']/g,ch=>htmlEscapes[ch]);
export function contractPrintHtml(c: BookingContract) {
  const d=c.document, rows=contractRows(d).map(([label,value])=>"<tr><th>"+escapeHtml(label)+"</th><td>"+escapeHtml(value)+"</td></tr>").join("");
  return '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="referrer" content="no-referrer"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Atelier Elunora booking contract</title><style>body{max-width:760px;margin:40px auto;padding:24px;color:#454734;background:#fffefa;font:15px/1.65 Arial,sans-serif}h1,h2{font-family:Georgia,serif;font-weight:normal}header{border-bottom:1px solid #d9d5c4;padding-bottom:24px}small{overflow-wrap:anywhere}table{width:100%;border-collapse:collapse}th,td{text-align:left;vertical-align:top;padding:9px 4px;border-bottom:1px solid #e9e5da}th{width:42%;font-weight:normal}section{margin:26px 0}.terms{white-space:pre-wrap}.signature{padding:20px;background:#efeddf;border:1px solid #d9d5c4}footer{font-size:11px;overflow-wrap:anywhere}@page{margin:18mm}@media print{body{margin:0;padding:0;background:white}tr,.signature{break-inside:avoid}h2{break-after:avoid}}</style></head><body><header><p>ATELIER ELUNORA</p><h1>Your celebration, in writing.</h1><p>Booking contract · revision '+c.revision+'</p><small>Reference '+escapeHtml(d.reference)+'</small></header><section><table>'+rows+'</table><p>Payment options: pay the prepayment shown above, or the full booking amount. Additional tax, if applicable, appears at Shopify checkout.</p></section>'+(d.bookingNotes?'<section><h2>Booking notes</h2><p class="terms">'+escapeHtml(d.bookingNotes)+'</p></section>':'')+(d.quoteNotes?'<section><h2>Approved quote notes</h2><p class="terms">'+escapeHtml(d.quoteNotes)+'</p></section>':'')+'<section><h2>Booking and cancellation terms</h2><p>Terms version '+d.termsVersion+'</p><div class="terms">'+escapeHtml(d.termsText)+'</div></section><section class="signature"><h2>'+(c.signature?'Electronically signed':'Awaiting signature')+'</h2>'+(c.signature?'<p>'+escapeHtml(c.signature.name)+'</p><p>'+escapeHtml(c.signature.email)+'<br>'+escapeHtml(c.signature.signedAt)+'</p><p>'+escapeHtml(c.signature.consent)+'</p>':'<p>This copy has not been electronically signed.</p>')+'</section><footer>Document SHA-256: '+escapeHtml(c.hash)+'</footer></body></html>';
}
