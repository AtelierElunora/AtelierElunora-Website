const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function invitationEmail(event,email,expiresAt){
 const url='https://www.atelierelunora.com/pages/client-gallery?event='+encodeURIComponent(event.id);
 const expiry=new Date(expiresAt).toLocaleString('en-US',{timeZone:'UTC',month:'long',day:'numeric',year:'numeric',hour:'numeric',minute:'2-digit'})+' UTC';
 const name=String(event.name).replace(/[\r\n]/g,' ');
 const subject='Your '+name+' photo gallery is ready';
 const text=`ATELIER ELUNORA\nYour celebration, ready to relive.\n\nYour ${name} photo gallery is ready. Browse the approved photographs from your event and revisit the moments you love.\n\nOpen your gallery: ${url}\n\nSign in using ${email}. On your first visit, choose Create or reset password, verify the code sent to your email, and choose a password. Already have a password? Sign in as usual. You can also choose Use an email code.\n\nAccess expires ${expiry}. This gallery is private: only invited accounts can open it.\n\nWith care,\nAtelier Elunora\nWhere cherished memories become keepsakes\nsupport@atelierelunora.com\nhttps://www.atelierelunora.com\n\nQuestions? Reply to this email—we are happy to help.`;
 // Matches the live upload-later email: logo, olive header, cream canvas,
 // serif headline, system-font body, generous spacing and support footer.
 const html=`<!doctype html><html lang="en" dir="ltr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${escape(subject)}</title></head>
<body style="margin:0;padding:0;background-color:#E8E5D9;color:#343728;font-family:Arial,Helvetica,sans-serif;-webkit-text-size-adjust:100%">
<div style="display:none;max-height:0;overflow:hidden;mso-hide:all">Your private event gallery is ready. Relive the moments you love.</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#E8E5D9"><tr><td align="center" style="padding:24px 12px">
<!--[if mso]><table role="presentation" width="600"><tr><td><![endif]-->
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;background-color:#F8F7F3">
<tr><td align="center" bgcolor="#4A4B36" style="padding:28px 24px;background-color:#4A4B36"><a href="https://www.atelierelunora.com" style="text-decoration:none"><img src="https://cdn.shopify.com/s/files/1/1017/1069/2640/files/atelier-elunora-main-logo-web.png?v=1790015151" width="184" height="130" alt="Atelier Elunora website" style="display:block;border:0;width:184px;height:130px;max-width:100%"></a></td></tr>
<tr><td style="padding:32px 24px 24px"><p style="margin:0 0 16px;font-size:12px;line-height:18px;letter-spacing:2px;color:#4A4B36">YOUR EVENT GALLERY</p>
<h1 style="margin:0 0 24px;font-family:Georgia,'Times New Roman',serif;font-size:32px;line-height:39px;font-weight:normal;color:#343728">Your celebration,<br>ready to relive.</h1>
<p style="margin:0 0 24px;font-size:16px;line-height:26px">Your <strong>${escape(name)}</strong> photo gallery is ready. Browse the approved photographs from your event and revisit the moments you love.</p>
<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td bgcolor="#4A4B36" style="background-color:#4A4B36;border-radius:4px;text-align:center;mso-padding-alt:16px 24px"><a href="${escape(url)}" style="display:inline-block;padding:16px 24px;color:#FFFFFF;font-size:16px;line-height:24px;font-weight:bold;text-decoration:none;border-radius:4px">Open your gallery</a></td></tr></table>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:24px;background-color:#E8E5D9"><tr><td style="padding:20px"><h2 style="margin:0 0 8px;font-size:18px;line-height:25px;color:#343728">A collection, just for you.</h2><p style="margin:0;font-size:16px;line-height:26px">Sign in using <strong>${escape(email)}</strong>.</p><p style="margin:12px 0 0;font-size:16px;line-height:26px">First visit? Choose <strong>Create or reset password</strong>, verify the code sent to your email, and choose a password. Already have a password? Sign in as usual.</p><p style="margin:12px 0 0;font-size:16px;line-height:26px">You can also choose <strong>Use an email code</strong>.</p></td></tr></table>
<p style="margin:24px 0 0;font-size:14px;line-height:23px;color:#555744">Access expires ${escape(expiry)}. This gallery is private: only invited accounts can open it.</p>
<p style="margin:16px 0 0;font-size:14px;line-height:23px">Button not opening? <a href="${escape(url)}" style="color:#4A4B36;text-decoration:underline">Open your private gallery</a>.</p>
</td></tr><tr><td style="padding:0 24px 32px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td style="border-top:1px solid #CECCBD;padding-top:24px"><p style="margin:0 0 8px;font-size:15px;line-height:24px">With care,</p><p style="margin:0 0 8px;font-family:Georgia,'Times New Roman',serif;font-size:24px;line-height:30px;color:#4A4B36">Atelier Elunora</p><p style="margin:0 0 16px;font-size:13px;line-height:21px">Where cherished memories become keepsakes</p><p style="margin:0;font-size:14px;line-height:24px"><a href="mailto:support@atelierelunora.com" style="color:#4A4B36;text-decoration:underline">support@atelierelunora.com</a><br><a href="https://www.atelierelunora.com" style="color:#4A4B36;text-decoration:underline">atelierelunora.com</a></p></td></tr></table></td></tr>
</table><!--[if mso]></td></tr></table><![endif]-->
<p style="margin:20px 0 0;font-size:13px;line-height:21px;color:#4A4B36">Questions? Reply to this email—we are happy to help.</p>
</td></tr></table></body></html>`;
 return {from:'Atelier Elunora <support@atelierelunora.com>',reply_to:'support@atelierelunora.com',to:[email],subject,text,html};
}
const messages={accepted:'Invitation email accepted for sending.',already_accepted:'An invitation has already been sent for this access expiry.',busy:'An invitation is already being sent. Refresh in a moment.',cooldown:'Please wait a minute before sending another invitation.',limited:'Invitation email limit reached. Please try again in an hour.',review:'The previous send needs review before retrying. You can copy the gallery link.',unavailable:'The gallery must be open and the invitation active before an email can be sent.',changed:'Access changed during preparation. Refresh and try again.',failed:'Access is saved, but the email was not accepted. Use Retry invitation email.',uncertain:'Access is saved, but email acceptance could not be confirmed. Wait a minute, then retry.',unconfigured:'Access is saved, but invitation email is not configured.'};
const result=(status)=>({status,message:messages[status]||messages.failed});
export async function sendInvitationEmail(service,eventId,email,{key,fetcher=fetch},resend=false){
 if(!key)return result('unconfigured');
 try{
  const event=await service.from('gallery_events').select('id,name,active,deleted_at').eq('id',eventId).maybeSingle();
  const invite=await service.from('gallery_invitations').select('email,expires_at,revoked').eq('event_id',eventId).eq('email',email).maybeSingle();
  if(event.error||invite.error)return result('failed');
  if(!event.data?.active||event.data.deleted_at||!invite.data||invite.data.revoked||Date.parse(invite.data.expires_at)<=Date.now())return result('unavailable');
  const claim=crypto.randomUUID();
  const prepared=await service.rpc('gallery_invitation_email_claim',{p_event:eventId,p_email:email,p_resend:resend,p_claim:claim,p_expires_at:invite.data.expires_at,p_payload:invitationEmail(event.data,email,invite.data.expires_at)});
  if(prepared.error)return result('failed');
  if(prepared.data?.status!=='send')return result(prepared.data?.status||'failed');
  const delivery=prepared.data.delivery;
  let status='uncertain',providerId=null;
  try{
   const response=await fetcher('https://api.resend.com/emails',{method:'POST',headers:{Authorization:'Bearer '+key,'Content-Type':'application/json','Idempotency-Key':'gallery-invitation/'+delivery.version},body:JSON.stringify(delivery.payload),signal:AbortSignal.timeout(10000)});
   if(response.ok){const receipt=await response.json();if(typeof receipt.id==='string'&&receipt.id){status='accepted';providerId=receipt.id;}}
   else if(response.status>=400&&response.status<500&&response.status!==409)status='failed';
  }catch{/* Ambiguous sends retain the same message/version for safe retry. */}
  const saved=await service.from('gallery_invitation_emails').update({status,provider_id:providerId,accepted_at:status==='accepted'?new Date().toISOString():null,lease_until:null}).eq('event_id',eventId).eq('email',email).eq('claim',claim).eq('version',delivery.version).select('status').maybeSingle();
  if(saved.error||!saved.data)return result('uncertain');
  return result(status);
 }catch{return result('uncertain');}
}
