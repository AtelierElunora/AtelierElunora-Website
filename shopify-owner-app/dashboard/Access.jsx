import {h} from 'preact';
import {useState} from 'preact/hooks';
import {galleryLink,galleryMessage} from './gallery-handoff.mjs';
import {RemoveGuestAccess} from '../extensions/gallery-owner/src/shared-owner.jsx';
import {accessState} from '../extensions/gallery-owner/src/workflows.mjs';
export function Access({detail,call,run,busy,reload,galleryUrl}){
 const [email,setEmail]=useState(''),[expiry,setExpiry]=useState(''),[status,setStatus]=useState(''),[message,setMessage]=useState(''),[sendEmail,setSendEmail]=useState(true);
 const link=galleryLink(detail.event.id,galleryUrl,location.origin),route='owner/events/'+detail.event.id;
 async function copy(value,label){try{await navigator.clipboard.writeText(value);setStatus(label);}catch{setStatus('Select and copy the text below.');}}
 async function refreshAfterEmail(text){setStatus(text);try{await reload();}catch{setStatus(text+' Refresh the gallery to load the latest status.');}}
 async function resend(recipient){const result=await call(route+'/invitation-email',{email:recipient});await refreshAfterEmail(result.email?.message||'Email status is unavailable. Refresh before retrying.');}
 async function save(){
  const expiresAt=expiry+'T23:59:59Z';if(!Number.isFinite(Date.parse(expiresAt))||Date.parse(expiresAt)<=Date.now())throw Error('Choose a future expiry date.');
  const recipient=email.trim().toLowerCase();
  const result=await call(route+'/access',{email:recipient,expiresAt,revoked:false,sendEmail});
  setMessage(galleryMessage(detail.event.name,recipient,link,expiresAt));setEmail('');setExpiry('');
  await refreshAfterEmail(sendEmail?(result.email?.message||'Access is saved. Email status is unavailable; refresh before retrying.'):'Access saved without sending an email.');
 }
 return <section class="panel"><h2>Couple & full-gallery access</h2><p>Invite the couple by email to view the full approved gallery. Saving access sends a branded invitation automatically when the email option below is selected. QR guests see only their own uploads.</p>
  <label class="field">Couple’s gallery link<input readOnly value={link}/></label><div class="row"><button disabled={busy} onClick={()=>copy(link,'Gallery link copied.')}>Copy gallery link</button><a href={link} target="_blank" rel="noopener noreferrer">Open client gallery ↗</a></div>
  <p class="muted">The invitation includes your event name, a private gallery button and sign-in instructions. The recipient must sign in with the email you invite.</p>
  {!detail.event.active&&<p role="status">Guest access is paused. Open it in Event settings before sending invitations, or uncheck the email option to save access only.</p>}
  {detail.invitationEmailStatusUnavailable&&<p role="status">Email history could not load. Refresh before resending an invitation.</p>}
  {status&&<p role="status">{status}</p>}
  {message&&<details><summary>Copy an invitation manually</summary><label class="field">Invitation message<textarea readOnly value={message} rows={8}/></label><button onClick={()=>copy(message,'Invitation message copied.')}>Copy invitation message</button></details>}
  {detail.invitations.map(i=>{const receipt=detail.invitationEmails?.find(r=>r.email===i.email),sent=receipt?.status==='accepted',eligible=!i.revoked&&Date.parse(i.expires_at)>Date.now();return <div class="connection" key={i.email}><div><h3>{i.email}</h3><p>{accessState(i)} · {new Date(i.expires_at).toLocaleDateString()}</p>
   <p class="muted">{sent?'Email accepted for sending '+new Date(receipt.accepted_at).toLocaleString():receipt?'Email needs retry or status review.':'No invitation email sent from Studio yet.'}</p>
   {eligible&&<div class="row"><button disabled={busy||!detail.event.active||detail.invitationEmailStatusUnavailable} onClick={()=>run(()=>resend(i.email))}>{sent?'Resend invitation email':receipt?'Retry invitation email':'Send invitation email'}</button><button disabled={busy} onClick={()=>{setMessage(galleryMessage(detail.event.name,i.email,link,i.expires_at));setStatus('');}}>Prepare invitation message</button></div>}
  </div><button disabled={busy} onClick={()=>{setEmail(i.email);setExpiry(i.expires_at.slice(0,10));}}>Edit expiry</button><RemoveGuestAccess eventId={detail.event.id} email={i.email} call={call} run={run} busy={busy} reload={reload}/></div>;})}
  {detail.grants.map(g=><div class="connection" key={g.user_id}><div><h3>Account {g.user_id.slice(0,8)}</h3><p>{accessState(g)}</p></div>{g.revoked&&<button disabled={busy} onClick={()=>run(async()=>{await call(route+'/grants',{userId:g.user_id,revoked:false});await reload();})}>Restore account access</button>}<RemoveGuestAccess eventId={detail.event.id} userId={g.user_id} call={call} run={run} busy={busy} reload={reload}/></div>)}
  <form onSubmit={e=>{e.preventDefault();run(save);}}><label class="field">Couple or invited guest email<input type="email" required value={email} disabled={busy} onInput={e=>setEmail(e.currentTarget.value)}/></label><label class="field">Access expires (end of day UTC)<input type="date" required value={expiry} disabled={busy} onInput={e=>setExpiry(e.currentTarget.value)}/></label>
   <label class="check"><input type="checkbox" checked={sendEmail} disabled={busy} onChange={e=>setSendEmail(e.currentTarget.checked)}/>Email the branded invitation automatically</label>
   <button class="primary" disabled={busy||(sendEmail&&!detail.event.active)}>{sendEmail?'Save access and send invitation':'Save guest access'}</button>
  </form>
 </section>;
}
