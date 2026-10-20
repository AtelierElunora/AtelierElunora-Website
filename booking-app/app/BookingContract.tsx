import {useState} from "react";
import {Form} from "react-router";
import {SIGNATURE_CONSENT,contractRows,contractPrintHtml,type BookingContract} from "./booking-contract";
export function ContractCopy({contract}:{contract:BookingContract}) {
  const [printError,setPrintError]=useState("");
  const d=contract.document;
  function print(){
    const popup=window.open("about:blank","_blank");
    if(!popup){setPrintError("Allow a new tab to print or save your contract, then try again.");return}
    popup.opener=null;
    popup.document.open();popup.document.write(contractPrintHtml(contract));
    popup.addEventListener("load",()=>{popup.focus();popup.print()},{once:true});
    popup.document.close();setPrintError("");
  }
  return <article className="contract-document">
    <header className="contract-header"><p className="eyebrow">ATELIER ELUNORA · BOOKING CONTRACT</p><h2>Your celebration, in writing.</h2><p>Contract revision {contract.revision} · Reference {d.reference}</p>
      <button className="contract-secondary" type="button" onClick={print}>Print / save as PDF</button>
      {printError&&<p role="alert">{printError}</p>}</header>
    <dl className="contract-facts">{contractRows(d).map(([label,value],i)=><div key={label+i}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>
    <p className="contract-note">You may pay the prepayment shown above or the full booking amount. Additional tax, if applicable, appears at Shopify checkout.</p>
    {d.bookingNotes&&<section><h3>Booking notes</h3><p className="contract-terms">{d.bookingNotes}</p></section>}
    {d.quoteNotes&&<section><h3>Approved quote notes</h3><p className="contract-terms">{d.quoteNotes}</p></section>}
    <details className="contract-terms-panel" open={!contract.signature}><summary>Booking and cancellation terms · version {d.termsVersion}</summary><p className="contract-terms">{d.termsText}</p></details>
    {contract.signature&&<section className="contract-signature"><strong>Electronically signed</strong><p className="contract-signed-name">{contract.signature.name}</p><p>{contract.signature.email}<br/><time dateTime={contract.signature.signedAt}>{new Date(contract.signature.signedAt).toLocaleString("en-US",{timeZone:"UTC"})} UTC</time></p><p>{contract.signature.consent}</p></section>}
    <small className="contract-checksum">Document SHA-256: {contract.hash}</small>
  </article>;
}
export function ContractSigning({contract,quoteRevision,busy=false}:{contract:BookingContract;quoteRevision?:number;busy?:boolean}) {
  return <Form method="post" className="contract-sign-form">
    <input type="hidden" name="contractHash" value={contract.hash}/>
    {quoteRevision!==undefined&&<><input type="hidden" name="revision" value={quoteRevision}/><input type="hidden" name="accepted" value="yes"/></>}
    <label>Full name for your signature<input name="signatureName" autoComplete="name" required minLength={2} maxLength={200}/></label>
    <label className="contract-consent"><input type="checkbox" name="signatureConsent" value="yes" required/><span>{SIGNATURE_CONSENT}</span></label>
    <button name="op" value={quoteRevision!==undefined?"accept_quote":"agreement"} disabled={busy}>{busy?"Saving your signature…":quoteRevision!==undefined?"Sign contract & accept quote":"Sign my contract"}</button>
    <p className="contract-note">Signing does not collect payment or confirm your date. {quoteRevision!==undefined?"Availability is checked when you sign. ":""}Your date is confirmed after payment is verified.</p>
  </Form>;
}
