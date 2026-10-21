import { saveLead, linkLead } from "../leads.server";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { Form, redirect, useActionData, useLoaderData, useNavigation, useFetcher } from "react-router";
import db from "../db.server";
import { useEffect, useState } from "react";
import { BookingCalendar } from "../BookingCalendar";
import { createBooking, requireOrigin } from "../booking.server";
import { allocate, parseConfig, percentAmount } from "../booking-rules";
import { customerBookingAllowed, liveBookingShop } from "../live-store";
export const headers=()=>({"Cache-Control":"no-store","Referrer-Policy":"no-referrer"});
function allowed(shop: string | undefined) {
  if (!customerBookingAllowed(shop))
    throw new Response("Booking is not open for this store", { status: 404 });
  return shop!;
}
export async function loader({ params, request }: LoaderFunctionArgs) {
  const shop = allowed(params.shop),
    s = await db.bookingSettings.findUnique({ where: { shop } });
  if (!s) throw new Response("Booking setup is incomplete", { status: 503 });
  const requestedCollection = new URL(request.url).searchParams.get("collection");
  const c = parseConfig(s.configJson),
    bookings = await db.weddingBooking.findMany({ where: { shop } });
  if (requestedCollection && !c.packages.some(p=>p.name===requestedCollection)) throw new Response("This collection needs an Atelier Elunora quote or booking configuration. Please contact support@atelierelunora.com before payment.",{status:409});
  const availability = Array.from({ length: 730 }, (_, i) => {
    const d = new Date();
    d.setUTCDate(d.getUTCDate() + i);
    const date = d.toISOString().slice(0, 10);
    try {
      allocate(c, s.dailyCapacity, bookings, date);
      return { date, open: true };
    } catch {
      return { date, open: false };
    }
  });
  return {
    availability,
    shop,
    embedded: new URL(request.url).searchParams.get("embed") === "1",
    initialPackage: new URL(request.url).searchParams.get("collection") || "",
    packages: c.packages,
    addons: c.addons,
    currency: c.currency,
    agreement: s.agreementText,
    version: c.agreementVersion,
    percent: s.prepaymentPercent,
    balanceDaysBefore: s.balanceDaysBefore,
    travelApprovalRequired:c.travelApprovalRequired,
  };
}
export async function action({ request, params }: ActionFunctionArgs) {
  requireOrigin(request);
  const shop = allowed(params.shop),
    f = await request.formData();
  try {
    if (f.get("intent") === "save-lead") {
      await db.bookingSettings.findUniqueOrThrow({where:{shop}});
      await saveLead(shop,f);
      return { error: "", saved:true, nextStep: f.get("nextStep")==="3"?3:1, savedToken:String(f.get("leadToken")) };
    }
    const s = await db.bookingSettings.findUniqueOrThrow({ where: { shop } }),
      c = parseConfig(s.configJson);
    if (String(f.get("email") || "").trim().toLowerCase() !== String(f.get("confirmEmail") || "").trim().toLowerCase()) throw Error("Your email addresses must match.");
    if (!String(f.get("phone") || "").trim() || !String(f.get("startTime") || "").trim() || !String(f.get("venue") || "").trim()) throw Error("Enter your phone number, venue address and preferred service start time.");
    const addons = Object.fromEntries(
      c.addons.map((a) => [a.id, Number(f.get("addon_" + a.id) || 0)]),
    );
    const { booking, portalToken } = await createBooking(shop, {
      name: String(f.get("name") || ""),
      email: String(f.get("email") || ""),
      venue: String(f.get("venue") || ""),
      weddingDate: String(f.get("date") || ""),
      packageId: String(f.get("package") || ""),
      guests: Number(f.get("guests")),
      addons,
      accepted: f.get("accepted") === "yes",
      source: "customer",
      waitlist: f.get("waitlist") === "yes",
      quoteRequest:f.get("quoteRequest")==="yes",
      phone: String(f.get("phone") || ""),
      preferredStartTime: String(f.get("startTime") || ""),
      customerNotes: String(f.get("notes") || ""),
      paymentChoice: String(f.get("paymentChoice") || ""),
    });
    await linkLead(shop,String(f.get("leadToken") || ""),booking);
    return redirect("/portal/" + booking.id + "?token=" + portalToken);
  } catch (error) {
    return {
      error:
        error instanceof Error ? error.message : "Could not reserve this date.",
    };
  }
}
export default function Booking() {
  const c = useLoaderData<typeof loader>(), r = useActionData<typeof action>(), navigation = useNavigation();
  const lead = useFetcher<typeof action>();
  const [leadToken,setLeadToken]=useState("");
  const [leadError,setLeadError]=useState("");
  useEffect(()=>{if(lead.data && "saved" in lead.data && lead.data.saved){setLeadToken(lead.data.savedToken);setStep(lead.data.nextStep);setLeadError("")}},[lead.data]);
  function saveDetails(form:HTMLFormElement,nextStep:number){
    const fields=nextStep===1?["name","email","confirmEmail","followUpConsent"]:[];
    for(const name of fields){const input=form.elements.namedItem(name) as HTMLInputElement;if(!input.checkValidity()){input.reportValidity();return}}
    const email=form.elements.namedItem("email") as HTMLInputElement, confirmation=form.elements.namedItem("confirmEmail") as HTMLInputElement;
    if(email.value.trim().toLowerCase()!==confirmation.value.trim().toLowerCase()){setLeadError("Your email addresses must match.");return}
    const data=new FormData(form);data.set("intent","save-lead");data.set("nextStep",String(nextStep));
    const token=leadToken || crypto.randomUUID();setLeadToken(token);data.set("leadToken",token);
    lead.submit(data,{method:"post"});
  }
  const [waitlist,setWaitlist]=useState(false), [open,setOpen]=useState(c.embedded), [step,setStep]=useState(0), [weddingDate,setWeddingDate]=useState("");
  const [packageId,setPackageId]=useState(c.packages.find(p=>p.name===c.initialPackage)?.id || c.packages[0]?.id || ""), [quantities,setQuantities]=useState<Record<string,number>>({}), [payment,setPayment]=useState("prepayment");
  const selected=c.packages.find(p=>p.id===packageId);
  const [guestCount,setGuestCount]=useState("");
  const exceedsCollection=Number(guestCount)>(selected?.maxGuests || 0);
  const suggestedCollection=exceedsCollection ? [...c.packages].sort((a,b)=>a.maxGuests-b.maxGuests).find(p=>p.maxGuests>=Number(guestCount)) : undefined;
  const total=(selected?.priceCents || 0)+c.addons.reduce((sum,a)=>sum+a.priceCents*(quantities[a.id] || 0),0);
  const [quoteRequested,setQuoteRequested]=useState(false);
  const reviewRequired=!waitlist && (c.travelApprovalRequired || quoteRequested || (c.shop===liveBookingShop && (selected?.maxGuests || 0)>200));
  const deposit=percentAmount(total,c.percent), due=waitlist||reviewRequired?0:payment==="full" ? total : deposit;
  const money=(n:number)=>new Intl.NumberFormat("en-US",{style:"currency",currency:c.currency}).format(n/100);
  const busy=navigation.state!=="idle" || lead.state!=="idle";
  useEffect(()=>{if(!open)return;const previous=document.activeElement as HTMLElement|null;const background=Array.from(document.querySelectorAll<HTMLElement>(".experience-page > :not(.booking-window)"));background.forEach(el=>el.inert=true);const overflow=document.body.style.overflow;document.body.style.overflow="hidden";document.querySelector<HTMLElement>(".booking-close")?.focus();return()=>{background.forEach(el=>el.inert=false);document.body.style.overflow=overflow;previous?.focus()};},[open]);
  useEffect(()=>{if(!open)return;const panel=document.querySelector<HTMLElement>(".booking-panel");if(panel)panel.scrollTop=0;const heading=document.querySelector<HTMLElement>(".booking-steps section:not([hidden]) h2");heading?.setAttribute("tabindex","-1");heading?.focus({preventScroll:true});},[step,open]);
  return <main className={`experience-page${c.embedded ? " booking-embedded" : ""}`} >
    {!c.embedded && <>
    <header className="experience-brand"><img src="/elunora-logo.png" alt="Atelier Elunora"/><span>{c.shop===liveBookingShop?"WEDDING BOOKING STUDIO":"DEVELOPMENT STORE PREVIEW"}</span></header>
    <div className="experience-intro"><p className="eyebrow">MADE FOR YOUR CELEBRATION</p><h1>Wedding & Event<br/>Photo Magnet Experience</h1><p>Select your collection, explore available dates, and make the experience yours.</p></div>
    <fieldset className="collection-options"><legend>Your collection</legend>{c.packages.map(p=><label key={p.id} className={packageId===p.id?"selected":""}><input type="radio" name="collection" checked={packageId===p.id} onChange={()=>setPackageId(p.id)}/><strong>{p.name}</strong><span>{money(p.priceCents)} · up to {p.maxGuests} guests</span></label>)}</fieldset>
    {selected ? <button className="book-now" onClick={()=>{setWaitlist(false);setWeddingDate("");setStep(0);setOpen(true)}}>Book now</button>:<p>Collections are being prepared.</p>}
    <p className="availability-note">Don’t see your date? <button type="button" onClick={()=>{setWaitlist(true);setStep(0);setWeddingDate("");setOpen(true)}}>Join the waitlist</button> for an owner availability review.</p>
    </>}
    {open && <section className="booking-window" role={c.embedded ? undefined : "dialog"} aria-modal={c.embedded ? undefined : true} aria-labelledby="booking-title" onKeyDown={e=>{if(e.key==="Escape"&&!busy){if(c.embedded)window.parent.postMessage({type:"elunora:booking-close"},"*");else setOpen(false)}if(e.key==="Tab"&&!c.embedded){const controls=Array.from(e.currentTarget.querySelectorAll<HTMLElement>('button:not([disabled]),input:not([type="hidden"]),textarea,select,a[href],summary')).filter(el=>el.getClientRects().length);const first=controls[0],last=controls[controls.length-1];if(e.shiftKey&&document.activeElement===first){e.preventDefault();last?.focus()}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first?.focus()}}}}>
      {!c.embedded && <div className="booking-shade"/>}<div className="booking-panel">{!c.embedded && <button className="booking-close" aria-label="Close booking" disabled={busy} onClick={()=>setOpen(false)}>×</button>}
      <aside className="booking-summary"><img src="/elunora-logo.png" alt="Atelier Elunora"/><h2 id="booking-title">Wedding & Event Photo Magnet Experience</h2><p>{selected?.name}</p><p>{weddingDate ? new Date(weddingDate+"T12:00:00Z").toLocaleDateString("en-US",{weekday:"long",month:"long",day:"numeric",year:"numeric",timeZone:"UTC"}):"Choose your celebration date"}</p><dl><dt>Experience total</dt><dd>{money(total)}</dd><dt>Due now {!waitlist && !reviewRequired && payment!=="full" && `(${c.percent}%)`}</dt><dd>{money(due)}</dd><dt>{waitlist||reviewRequired?"Payment status":"Remaining balance"}</dt><dd>{waitlist?"No payment requested":reviewRequired?"Pending quote approval":money(total-due)}</dd></dl><p>Additional tax, if applicable, appears at Shopify checkout. {waitlist?"Waitlist requests do not reserve a date.":reviewRequired?"Your quote and travel need owner approval before payment. No date is reserved yet.":"Your date is confirmed after payment is verified."}</p></aside>
      <Form method="post" className="booking-steps">
        <input type="hidden" name="leadToken" value={leadToken}/>
        <input type="hidden" name="quoteRequest" value={reviewRequired?"yes":"no"}/><input type="hidden" name="waitlist" value={waitlist?"yes":"no"}/><input type="hidden" name="package" value={packageId}/><input type="hidden" name="date" value={weddingDate}/>
        <nav aria-label="Booking progress">{["Date","Details & extras",waitlist?"Review":"Payment"].map((label,i)=><span key={label} aria-current={step===i?"step":undefined}>{i+1}. {label}</span>)}</nav>
        {r?.error && <p role="alert" className="booking-error">{r.error}</p>}
        {(leadError || lead.data?.error) && <p role="alert" className="booking-error">{leadError || lead.data?.error}</p>}
        <section hidden={step!==0}><h2>Where can we reach you?</h2><div className="customer-fields">
          <label>Name<input name="name" required maxLength={200} autoComplete="name"/></label>
          <label>Email<input name="email" type="email" required autoComplete="email"/></label>
          <label>Confirm email<input name="confirmEmail" type="email" required autoComplete="off"/></label>
          <label><input type="checkbox" name="followUpConsent" value="yes" required/>Save my inquiry and allow Atelier Elunora to contact me about this event.</label>
        </div><p>Saving your details lets us follow up if you leave before booking. It does not reserve a date, create a contract or collect payment.</p>
        <button type="button" disabled={busy} onClick={e=>saveDetails(e.currentTarget.form!,1)}>{busy?"Saving…":"Save my details & continue"}</button></section>
        <section hidden={step!==1}><h2 id="booking-heading">{waitlist?"Join the date waitlist":"Choose your date"}</h2><BookingCalendar availability={c.availability} onSelect={setWeddingDate} allowUnavailable={waitlist}/><p>{weddingDate || (waitlist?"Select your requested date to continue.":"Select an available date to continue.")}</p><button type="button" disabled={!weddingDate} onClick={()=>setStep(2)}>Continue</button></section>
        <section hidden={step!==2}><h2>Your celebration</h2><p>Final service timing is confirmed with Atelier Elunora.</p><div className="customer-fields">

          <label>Phone number<input name="phone" type="tel" required maxLength={40} autoComplete="tel"/></label>
          <label>Venue name and full address<textarea name="venue" required maxLength={500}/></label>
          <label>Estimated guest count<input name="guests" type="number" min={1} max={5000} required value={guestCount} aria-describedby={exceedsCollection ? "guest-upgrade-help" : undefined} onChange={e=>setGuestCount(e.target.value)}/></label>
          {exceedsCollection && <div className="guest-upgrade" id="guest-upgrade-help" role="status">{suggestedCollection ? <><strong>{guestCount} guests requires the {suggestedCollection.name} collection.</strong><p>Collection price: {money(suggestedCollection.priceCents)}. Your selected extras stay included in the updated total.{c.shop===liveBookingShop && suggestedCollection.maxGuests>200 ? " Owner review is required before payment." : ` Your ${c.percent}% prepayment and remaining balance will update too.`}</p><button type="button" onClick={()=>setPackageId(suggestedCollection.id)}>Update collection to {money(suggestedCollection.priceCents)}</button></> : <><strong>This guest count needs a custom quote.</strong><p>Please contact Atelier Elunora before booking, or adjust your guest count.</p><a href="https://www.atelierelunora.com/pages/contact" target="_blank" rel="noreferrer">Request a custom quote</a></>}</div>}
          <label>Preferred service start time<input name="startTime" required maxLength={100} placeholder="For example, 5:00 PM"/></label>
          <div className="quote-request"><label className="quote-request-choice"><input type="checkbox" checked={quoteRequested} aria-describedby="quote-request-help" onChange={e=>setQuoteRequested(e.target.checked)}/><span>Request a custom quote or travel review before payment</span></label><p id="quote-request-help">Optional. Your experience price stays the same. Checking this sends a request for owner review: nothing is due now and your date is not reserved. You can choose prepayment or full payment after accepting your approved quote.</p></div>
          <label>Anything else we should know?<textarea name="notes" maxLength={4000}/></label>
        </div><h3>Make it yours</h3>{c.addons.length ? c.addons.map(a=><label className="extra-option" key={a.id}><span><strong>{a.name}</strong><small>{money(a.priceCents)} each</small></span><input aria-label={a.name+" quantity"} name={"addon_"+a.id} type="number" min={0} max={24} value={quantities[a.id] || 0} onChange={e=>setQuantities({...quantities,[a.id]:Number(e.target.value)})}/></label>):<p>No optional extras are configured yet.</p>}
        <div className="step-actions"><button type="button" onClick={()=>setStep(1)}>Back to dates</button><button type="button" onClick={e=>{const form=e.currentTarget.form!;if(exceedsCollection){document.getElementById("guest-upgrade-help")?.scrollIntoView({block:"center"});return}const confirmation=form.elements.namedItem("confirmEmail") as HTMLInputElement;const email=form.elements.namedItem("email") as HTMLInputElement;confirmation.setCustomValidity(confirmation.value.trim().toLowerCase()===email.value.trim().toLowerCase()?"":"Email addresses must match.");const invalid=Array.from(form.elements).find(el=>el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement ? el.name!=="accepted"&&!el.checkValidity():false) as HTMLInputElement|undefined;if(invalid){invalid.reportValidity();return}saveDetails(form,3)}}>{waitlist||reviewRequired?"Review request":"Review payment"}</button></div></section>
        <section hidden={step!==3}><h2>Reserve with confidence</h2>{waitlist?<p>This request does not reserve the date or collect payment. Atelier Elunora will review capacity before inviting you to book.</p>:reviewRequired?<p>Atelier Elunora will confirm travel and your final quote before payment. This request does not hold the date. You will review and accept the quote in your private booking page.</p>:<fieldset className="payment-options"><legend>How would you like to pay?</legend><label><input type="radio" name="paymentChoice" value="prepayment" checked={payment==="prepayment"} onChange={()=>setPayment("prepayment")}/><strong>Pay {c.percent}% prepayment · {money(deposit)}</strong><span>{money(total-deposit)} remains due {c.balanceDaysBefore} days before your event.</span></label><label><input type="radio" name="paymentChoice" value="full" checked={payment==="full"} onChange={()=>setPayment("full")}/><strong>Pay in full · {money(total)}</strong><span>No remaining booking balance.</span></label></fieldset>}
        <div hidden={waitlist||reviewRequired}><details><summary>Read your booking agreement · version {c.version}</summary><p style={{whiteSpace:"pre-wrap"}}>{c.agreement}</p></details><label className="agreement-check"><input name="accepted" type="checkbox" value="yes" required={!waitlist&&!reviewRequired}/>I accept this booking agreement.</label></div><p hidden={waitlist||reviewRequired}>Continue creates a temporary 15-minute hold. You can then open secure Shopify checkout. No payment is collected by this form.</p><div className="step-actions"><button type="button" onClick={()=>setStep(2)}>Back to details</button><button disabled={busy}>{busy?"Preparing your booking…":waitlist?"Submit waitlist request":reviewRequired?"Request quote review":"Continue to payment"}</button></div></section>
      </Form></div></section>}
  </main>;
}
