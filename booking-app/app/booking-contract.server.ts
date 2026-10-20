import {createHash} from "node:crypto";
import {percentAmount} from "./booking-rules";
import {SIGNATURE_CONSENT,type BookingContract,type ContractDocument} from "./booking-contract";
type Booking = {id:string;customerName:string;customerEmail:string;venue:string;weddingDate:string;totalCents:number;balanceDueDate:string|null};
export function contractDocument(b: Booking,d: any): ContractDocument {
  const percent=Number(d.prepaymentPercent), total=b.totalCents;
  if(!Number.isInteger(percent)||percent<1||percent>100||!Number.isSafeInteger(total)||total<1) throw Error("Contract payment settings need owner review.");
  return {templateVersion:1,reference:b.id,business:"Atelier Elunora",customerName:b.customerName,customerEmail:b.customerEmail,
    phone:String(d.phone||""),weddingDate:b.weddingDate,venue:b.venue,preferredStartTime:String(d.preferredStartTime||""),
    guests:Number(d.finalGuests||d.guests||0),collection:String(d.package?.name||"Custom booking"),
    extras:(d.addons||[]).map((a:any)=>({name:String(a.name),quantity:Number(a.qty),unitCents:Number(a.priceCents)})),
    currency:String(d.currency||"USD"),totalCents:total,prepaymentPercent:percent,prepaymentCents:percentAmount(total,percent),
    balanceCents:total-percentAmount(total,percent),balanceDueDate:b.balanceDueDate||"",bookingNotes:String(d.customerNotes||""),
    quoteNotes:String(d.quoteReview?.notes||""),quoteRevision:Number(d.quoteReview?.revision||0),
    termsVersion:Number(d.agreement?.version||1),termsText:String(d.agreement?.text||"")};
}
export const contractHash=(document:ContractDocument)=>createHash("sha256").update(JSON.stringify(document)).digest("hex");
export function currentContract(b:Booking,d:any):BookingContract|null {
  if(!d.agreement?.text?.trim())return null;
  const document=contractDocument(b,d), hash=contractHash(document), stored=d.agreement.contract as BookingContract|undefined;
  if(stored?.hash===hash && contractHash(stored.document)===hash)return stored;
  return {revision:(stored?.revision||0)+1,hash,document,signature:null};
}
export function refreshContract(b:Booking,d:any) {
  const next=currentContract(b,d);if(!next)return null;
  const previous=d.agreement?.contract as BookingContract|undefined;
  if(previous && previous.hash!==next.hash){
    if(previous.signature){
      const history=(d.agreement.contractHistory||[]) as BookingContract[];
      if(!history.some(c=>c.hash===previous.hash && c.signature?.signedAt===previous.signature?.signedAt)) history.push(previous);
      d.agreement.contractHistory=history;
    }
    if(previous.signature || d.agreement.signatureRequired){
      d.agreement.acceptedAt=null;
      d.agreement.signatureRequired=true;
    }
  }
  d.agreement.contract=next;
  return next;
}
export function applyContractSignature(b:Booking,d:any,form:FormData,userAgent="",now=new Date()) {
  const contract=refreshContract(b,d);if(!contract)throw Error("Your contract is not ready. Contact Atelier Elunora.");
  const expected=String(form.get("contractHash")||"");
  if(!/^[a-f0-9]{64}$/.test(expected)||expected!==contract.hash)throw Error("Your contract changed. Review the latest copy before signing.");
  const name=String(form.get("signatureName")||"").normalize("NFC").trim().replace(/\s+/gu," ");
  if(name.length<2||name.length>200||!/[\p{L}]/u.test(name)||/[\u0000-\u001f\u007f]/u.test(name))throw Error("Enter your full name as your electronic signature.");
  if(form.get("signatureConsent")!=="yes")throw Error("Confirm your electronic signature consent.");
  if(contract.signature){
    if(contract.signature.documentHash!==contract.hash)throw Error("The saved signature needs owner review.");
    if(contract.signature.name!==name)throw Error("This contract already has a saved signature.");
    return {contract,alreadySigned:true};
  }
  contract.signature={name,email:b.customerEmail,signedAt:now.toISOString(),documentHash:contract.hash,
    consent:SIGNATURE_CONSENT,method:"typed-name-private-booking-link",userAgent:userAgent.slice(0,500)};
  d.agreement={...d.agreement,contract,signatureRequired:true,acceptedAt:contract.signature.signedAt};
  return {contract,alreadySigned:false};
}
