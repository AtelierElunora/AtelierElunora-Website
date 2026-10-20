import {eventAgreementSource, EVENT_AGREEMENT_SOURCE_VERSION, EVENT_AGREEMENT_SOURCE_SHA256} from "./event-agreement-source";

export type EventAgreementSettings = {
  enabled:boolean; providerLegalName:string; providerAddress:string; providerPhone:string;
  providerEmail:string; backupDeletionPeriod:string; additionalHourAddonId:string;
};
export const agreementSettingFields = [
  ["providerLegalName","Legal business name"], ["providerAddress","Business mailing address"],
  ["providerPhone","Business phone"], ["providerEmail","Email for notices"],
  ["backupDeletionPeriod","Backup deletion timing, or confirmation that no photo backups are retained"],
] as const;
export function eventAgreementSettings(raw:unknown):EventAgreementSettings {
  const value=raw && typeof raw==="object" ? raw as Record<string,unknown> : {};
  const result={enabled:value.enabled===true,additionalHourAddonId:String(value.additionalHourAddonId||"")} as EventAgreementSettings;
  for(const [key] of agreementSettingFields)result[key]=String(value[key]||"").trim();
  return result;
}
export function validateAgreementSettings(value:EventAgreementSettings) {
  for(const [key,label] of agreementSettingFields){
    if(value[key].length>1000)throw Error(label+" is too long.");
    if(value.enabled&&!value[key])throw Error("Complete "+label.toLowerCase()+" before enabling the full agreement.");
    if(/\[|\]|\{\{|\}\}/.test(value[key]))throw Error("Replace placeholders in "+label.toLowerCase()+".");
  }
  if(value.enabled&&!/^\S+@\S+\.\S+$/.test(value.providerEmail))throw Error("Enter the provider email for notices.");
  if(value.additionalHourAddonId.length>200)throw Error("Choose a valid additional-hour add-on.");
  return value;
}
export const customerAgreementFields = [
  ["mailingAddress","Your mailing address",true],
  ["entitySigner","Authorized signer and title, if booking for an entity",false],
  ["eventName","Event name",false],
  ["eventDayContact","Event-day contact name and phone",false],
] as const;
export const ownerAgreementFields = [
  ...customerAgreementFields,
  ["serviceEnd","Confirmed service end and pickup closing time",false],
  ["removalTime","Equipment removal completed by",false],
  ["stationLocation","Approved station location",false],
  ["travelDistance","Confirmed one-way travel distance",false],
  ["approvedExpenses","Approved parking, tolls, lodging or venue charges",false],
  ["shippingAddress","Shipping recipient and address, if already known",false],
  ["specialTerms","Special negotiated terms and dated attachments",false],
] as const;
export function readAgreementFields(input:Record<string,unknown>|FormData,owner=false):Record<string,string> {
  const result:Record<string,string>={};
  for(const [key,label] of owner?ownerAgreementFields:customerAgreementFields){
    const raw=typeof (input as FormData).get==="function"?(input as FormData).get("contract_"+key):(input as Record<string,unknown>)[key];
    const value=String(raw||"").normalize("NFC").trim();
    if(value.length>1000||/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value))throw Error(label+" is too long or contains unsupported characters.");
    result[key]=value;
  }
  return result;
}
export type ServiceAgreement = {
  sourceVersion:string; sourceSha256:string; title:string; introduction:string;
  sections:{heading:string;paragraphs:string[]}[]; missingFields:string[]; requiresProviderSignature:true;
};
type EventBooking = {reference:string;customerName:string;customerEmail:string;phone:string;weddingDate:string;venue:string;preferredStartTime:string;guests:number;collection:string;extras:{name:string;quantity:number;unitCents:number}[];currency:string;totalCents:number;prepaymentPercent:number;prepaymentCents:number;balanceCents:number;balanceDueDate:string;quoteNotes:string;bookingNotes:string};

export function buildServiceAgreement(b:EventBooking,d:any):ServiceAgreement {
  const cfg=eventAgreementSettings(d.agreement.eventTemplate), fields=d.agreement.fields||{}, missing:string[]=[];
  for(const [key,label]of agreementSettingFields)if(!cfg[key])missing.push(label);
  if(!fields.mailingAddress)missing.push("Customer mailing address");
  if(!b.venue)missing.push("Venue and address");
  if(!b.preferredStartTime)missing.push("Preferred service start time");
  if(!b.phone)missing.push("Customer phone");
  if(!b.balanceDueDate)missing.push("Balance deadline");
  if(b.prepaymentPercent!==30)missing.push("This agreement requires the approved 30% retainer setting");
  if(b.currency!=="USD")missing.push("This agreement requires USD pricing");
  const prepared=String(d.agreement.preparedAt||"").slice(0,10);
  if(!/^\d{4}-\d{2}-\d{2}$/.test(prepared))missing.push("Agreement preparation date");
  const money=(n:number)=>new Intl.NumberFormat("en-US",{style:"currency",currency:b.currency}).format(n/100);
  const extras=b.extras.map(a=>a.name+" × "+a.quantity+" — "+money(a.unitCents*a.quantity));
  const addons=b.extras.reduce((n,a)=>n+a.quantity*a.unitCents,0), travel=Number(d.quoteReview?.travelCents||0);
  const collection=Number(d.package?.priceCents ?? (b.totalCents-addons-travel));
  const adjustment=b.totalCents-collection-addons-travel;
  if(!Number.isSafeInteger(travel)||travel<0||!Number.isSafeInteger(collection)||collection<0)missing.push("Owner pricing review");
  const additional=(d.addons||[]).find((a:any)=>cfg.additionalHourAddonId&&a.id===cfg.additionalHourAddonId);
  const hours=4+Number(additional?.qty||0);
  const pending="To be confirmed during pre-event planning";
  const replace:Record<number,string>={
    0:"Atelier Elunora", 1:"Photo Booth and Live Photo Magnet Service Agreement",
    4:"Agreement date: "+(prepared||"Pending owner preparation")+"     Booking reference: "+b.reference,
    5:"Provider legal name: "+(cfg.providerLegalName||"Pending owner setup")+" (Provider)\nBusiness mailing address: "+(cfg.providerAddress||"Pending owner setup")+"\nEmail for notices: "+(cfg.providerEmail||"Pending owner setup")+"     Telephone: "+(cfg.providerPhone||"Pending owner setup"),
    6:"Client legal name or entity: "+b.customerName+" (Client)\nMailing address: "+(fields.mailingAddress||"Required before signing")+"\nEmail for notices: "+b.customerEmail+"     Telephone: "+b.phone+"\nAuthorized signer and title if an entity: "+(fields.entitySigner||"Not applicable unless Client is an entity; an authorized entity signer must be identified before signing."),
    7:"Event type and name: Wedding — "+(fields.eventName||b.customerName)+"\nEvent date: "+b.weddingDate+"     Expected total guests: "+b.guests+"\nVenue name and full address: "+b.venue+"\nVenue contact and telephone: "+(d.venueContact||pending)+"\nClient event-day contact and telephone: "+(fields.eventDayContact||b.customerName+" — "+b.phone),
    8:"Setup access: 1–2 hours before live service\nPreferred service start: "+b.preferredStartTime+"\nService end and pickup closing: "+(fields.serviceEnd||"At the end of the "+hours+" booked live-service hours following the confirmed start")+"\nRemoval completed by: "+(fields.removalTime||pending)+"\nAll times are local to the venue. Booked live service: "+hours+" hours.\nStation location: "+(fields.stationLocation||pending)+". Planning space: approximately 10 × 10 feet.\nVenue must provide access to electrical power. See Section 9 for final arrangements.",
    10:"The selected collection, extras and completed booking price below control this booking. Any later change requires written agreement. Special events require a written custom quote.",
    11:"Selected collection: "+b.collection,12:"",13:"",14:"",15:"",
    16:"Collection price: "+money(collection)+"\nSelected add-ons: "+money(addons)+"     Approved travel: "+money(travel)+"\nApproved quote adjustment or discount: "+money(adjustment)+"\nBOOKING TOTAL BEFORE APPLICABLE TAX: "+money(b.totalCents)+"\nApplicable sales tax is calculated and displayed at Shopify Checkout before payment; the amounts above and below exclude that additional tax.\n30% reservation retainer credited to total: "+money(b.prepaymentCents)+", payable when checkout is available.\nBalance after retainer: "+money(b.balanceCents)+", due "+b.balanceDueDate+". Client may instead pay the full booking amount at checkout.",
    26:"Only the selected enhancements listed below are included. No unselected option authorizes a charge.",
    27:extras.length?extras.join("\n"):"No optional enhancements selected.",28:"",29:"",30:"",31:"",32:"",33:"",34:"",
    36:eventAgreementSource[36].text.replace("[ ] miles",fields.travelDistance||"Confirmed in the approved travel arrangements").replace("$[ ]",money(travel)).replace("[ITEMIZED AMOUNTS OR NONE]",fields.approvedExpenses||"None approved in this contract"),
    57:eventAgreementSource[57].text.replace("[BACKUP DELETION PERIOD, IF APPLICABLE]",cfg.backupDeletionPeriod||"Owner must complete backup deletion timing before signing"),
    59:eventAgreementSource[59].text.replace("[NON-WEDDING INCLUSIONS TO BE AGREED IN WRITING]","Not applicable to this wedding booking; non-wedding inclusions require a separate written quote"),
    60:eventAgreementSource[60].text.replace("[DETAILS]",fields.shippingAddress||"Client will confirm the recipient and shipping address before dispatch"),
    65:eventAgreementSource[65].text.replace("Live-service fee allocation for this calculation: $[ ].", "No separate live-service fee allocation is specified in this booking."),
    95:"Authorized event-day purchaser: None unless separately authorized by Client in writing with a spending limit.\nAdditional spend authorized by this contract: $0.00.\nApproved quote notes: "+(b.quoteNotes||"None")+"\nBooking notes: "+(b.bookingNotes||"None")+"\nSpecial negotiated terms and dated attachments: "+(fields.specialTerms||"None"),
    97:"",98:"",
  };
  const sections:ServiceAgreement["sections"]=[];
  for(let i=3;i<eventAgreementSource.length;i++){
    const text=replace[i]??eventAgreementSource[i].text;
    if(/^\d{1,2} /.test(text)&&eventAgreementSource[i].style==="Heading 2")sections.push({heading:text,paragraphs:[]});
    else if(text.trim()&&eventAgreementSource[i].style!=="Heading 1")sections.at(-1)?.paragraphs.push(text);
  }
  return {sourceVersion:EVENT_AGREEMENT_SOURCE_VERSION,sourceSha256:EVENT_AGREEMENT_SOURCE_SHA256,title:eventAgreementSource[1].text,introduction:eventAgreementSource[2].text,sections,missingFields:missing,requiresProviderSignature:true};
}
