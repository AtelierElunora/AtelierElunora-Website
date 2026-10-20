import {useState} from "react";
import {Form} from "react-router";
import {SIGNATURE_CONSENT,SIGNATURE_STYLES,PROVIDER_CONSENT,contractRows,contractPrintHtml,type BookingContract,type SignatureStyle} from "./booking-contract";
export function SignatureReceipt({label,person}:{label:string;person:{name:string;signedAt:string;consent:string;style?:SignatureStyle;email?:string;title?:string}}){
  return <section className="contract-signature"><strong>{label}</strong><p className="contract-signed-name" data-signature-style={person.style||"classic"}>{person.name}</p><p>{person.title||person.email}<br/><time dateTime={person.signedAt}>{new Date(person.signedAt).toLocaleString("en-US",{timeZone:"UTC"})} UTC</time></p><p>{person.consent}</p></section>;
}
export function ContractCopy({contract}:{contract:BookingContract}) {
  const [printError,setPrintError]=useState("");
  const d=contract.document,a=d.serviceAgreement;
  function print(){
    const popup=window.open("about:blank","_blank");
    if(!popup){setPrintError("Allow a new tab to print or save your contract, then try again.");return}
    popup.opener=null;
    popup.document.open();popup.document.write(contractPrintHtml(contract));
    popup.addEventListener("load",()=>{popup.focus();popup.print()},{once:true});
    popup.document.close();setPrintError("");
  }
  return <article className="contract-document">
    <header className="contract-header"><p className="eyebrow">ATELIER ELUNORA · {a?"SERVICE AGREEMENT":"BOOKING CONTRACT"}</p><h2>{a?a.title:"Your celebration, in writing."}</h2><p>Contract revision {contract.revision} · Reference {d.reference}</p>
      <button className="contract-secondary" type="button" onClick={print}>Print / save as PDF</button>
      {printError&&<p role="alert">{printError}</p>}</header>
    {a?<>
      <p className="contract-terms">{a.introduction}</p>
      {!!a.missingFields.length&&<aside className="contract-status" role="status"><strong>This agreement is being prepared.</strong><p>These fields must be completed before signing: {a.missingFields.join("; ")}.</p></aside>}
      <nav className="agreement-contents" aria-label="Agreement sections">{a.sections.map((s,i)=><a href={"#agreement-"+contract.hash.slice(0,12)+"-"+i} key={s.heading}>{s.heading}</a>)}</nav>
      {a.sections.map((s,i)=><section className="agreement-section" id={"agreement-"+contract.hash.slice(0,12)+"-"+i} key={s.heading}><h3>{s.heading}</h3>{s.paragraphs.map((p,j)=><p className="contract-terms" key={j}>{p}</p>)}</section>)}
    </>:<>
      <dl className="contract-facts">{contractRows(d).map(([label,value],i)=><div key={label+i}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>
      <p className="contract-note">You may pay the prepayment shown above or the full booking amount. Additional tax, if applicable, appears at Shopify checkout.</p>
      {d.bookingNotes&&<section><h3>Booking notes</h3><p className="contract-terms">{d.bookingNotes}</p></section>}
      {d.quoteNotes&&<section><h3>Approved quote notes</h3><p className="contract-terms">{d.quoteNotes}</p></section>}
      <details className="contract-terms-panel" open={!contract.signature}><summary>Booking and cancellation terms · version {d.termsVersion}</summary><p className="contract-terms">{d.termsText}</p></details>
    </>}
    {contract.signature&&<SignatureReceipt label={a?"Client electronically signed":"Electronically signed"} person={contract.signature}/>}
    {a?.requiresProviderSignature&&(contract.providerSignature?<SignatureReceipt label="Provider electronically signed" person={contract.providerSignature}/>:<p className="contract-status">Provider signature pending. Payment becomes available after Atelier Elunora countersigns.</p>)}
    <small className="contract-checksum">Document SHA-256: {contract.hash}</small>
  </article>;
}
export function ContractSigning({contract,quoteRevision,busy=false}:{contract:BookingContract;quoteRevision?:number;busy?:boolean}) {
  const [name,setName]=useState(contract.document.customerName),[style,setStyle]=useState<SignatureStyle>("script"),[consentedHash,setConsentedHash]=useState<string|null>(null);
  const consent=consentedHash===contract.hash;
  if(contract.document.serviceAgreement?.missingFields.length)return <p className="contract-status">Contact Atelier Elunora to complete the agreement before signing. You can already review the current copy above.</p>;
  return <Form method="post" className="contract-sign-form" aria-label="Create your signature">
    <h3>Create your signature</h3><p>Review the completed agreement above, then choose how your name appears. Nothing is signed until you give consent and apply your signature.</p>
    <input type="hidden" name="contractHash" value={contract.hash}/>
    {quoteRevision!==undefined&&<><input type="hidden" name="revision" value={quoteRevision}/><input type="hidden" name="accepted" value="yes"/></>}
    <label>Full name for your signature<input name="signatureName" autoComplete="name" required minLength={2} maxLength={200} value={name} onChange={e=>setName((e.currentTarget as HTMLInputElement).value)}/></label>
    <fieldset className="signature-choices"><legend>Signature appearance</legend>{SIGNATURE_STYLES.map(option=><label className={style===option.id?"selected":""} key={option.id}><input type="radio" name="signatureStyle" value={option.id} checked={style===option.id} onChange={()=>setStyle(option.id)}/><span>{option.label}</span><span className="signature-preview" data-signature-style={option.id}>{name.trim()||"Your name"}</span></label>)}</fieldset>
    <p className="contract-note">This creates a styled version of your typed name. It does not reproduce a handwritten signature.</p>
    <label className="contract-consent"><input type="checkbox" name="signatureConsent" value="yes" required checked={consent} onChange={e=>setConsentedHash((e.currentTarget as HTMLInputElement).checked?contract.hash:null)}/><span>{SIGNATURE_CONSENT}</span></label>
    <button name="op" value={quoteRevision!==undefined?"accept_quote":"agreement"} disabled={busy||!consent}>{busy?"Saving your signature…":quoteRevision!==undefined?"Apply my signature & accept quote":"Apply my signature"}</button>
    <p className="contract-note">Signing does not collect payment or confirm your date. {contract.document.serviceAgreement?"Atelier Elunora will countersign this agreement before payment becomes available. ":""}{quoteRevision!==undefined?"Availability is checked when you sign. ":""}Your date is confirmed after payment is verified.</p>
  </Form>;
}
export function ProviderSigning({contract}:{contract:BookingContract}){
  const [consentedHash,setConsentedHash]=useState<string|null>(null);
  const consent=consentedHash===contract.hash;
  if(!contract.document.serviceAgreement||!contract.signature||contract.providerSignature||contract.document.serviceAgreement.missingFields.length)return null;
  return <Form method="post" className="contract-sign-form"><h3>Countersign for Atelier Elunora</h3><input type="hidden" name="contractHash" value={contract.hash}/>
    <label>Your full name<input name="providerName" autoComplete="name" required minLength={2} maxLength={200}/></label>
    <label>Your title or authority<input name="providerTitle" required maxLength={150}/></label>
    <label className="contract-consent"><input name="providerConsent" type="checkbox" value="yes" required checked={consent} onChange={e=>setConsentedHash((e.currentTarget as HTMLInputElement).checked?contract.hash:null)}/><span>{PROVIDER_CONSENT}</span></label>
    <button name="op" value="countersign_contract" disabled={!consent}>Apply provider signature</button><p className="contract-note">This checks date availability again and opens a new 15-minute payment window for a booking still on hold. No payment is recorded.</p>
  </Form>;
}
