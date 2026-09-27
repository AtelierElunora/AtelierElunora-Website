const encoder=new TextEncoder();
export async function laterToken(id,secret){
 if(!secret)throw Error('Upload links are not configured.');
 const key=await crypto.subtle.importKey('raw',encoder.encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);
 return Array.from(new Uint8Array(await crypto.subtle.sign('HMAC',key,encoder.encode('atelier-upload-later-v1:'+id))),b=>b.toString(16).padStart(2,'0')).join('');
}
export async function laterLink(service,id,secret){
 const token=await laterToken(id,secret),digest=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',encoder.encode(token))),b=>b.toString(16).padStart(2,'0')).join('');
 const r=await service.rpc('gallery_later_link',{p_id:id,p_hash:digest});if(r.error)throw Error('This order needs review before sharing an upload link.');
 return {url:'https://www.atelierelunora.com/pages/client-gallery?view=upload-later#event='+token,upload:r.data};
}
// Email-safe HTML: inline styles, presentation tables and system font fallbacks.
const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function laterEmail(upload, url) {
 const subject = 'Your photo upload link — Order ' + upload.order_name;
 const expiryDate = new Date(upload.expires_at);
 const expiry = Number.isFinite(expiryDate.getTime()) ? expiryDate.toLocaleDateString('en-US', {timeZone:'UTC', month:'long', day:'numeric', year:'numeric'}) : null;
 const expiryText = expiry ? 'This link expires on ' + expiry + '.' : '';
 const text = `ATELIER ELUNORA\nYour memories, made into keepsakes.\n\nHello,\nThank you for choosing Atelier Elunora. Whenever you are ready, your private photo upload space is waiting.\n\nOrder ${upload.order_name}\n${upload.product_title} · ${upload.required_count} magnets\n\nUpload your photos: ${url}\n\nChoose your photographs, adjust their crops and copies, then select Submit photos. Your order is already purchased; there is no additional checkout.\n\nWe begin preparation after receiving your complete photo selection.\n\nKeep this link private. Anyone with it can access this order’s photos. ${expiryText}\n\nWith care,\nAtelier Elunora\nWhere cherished memories become keepsakes\nsupport@atelierelunora.com\nhttps://www.atelierelunora.com\n\nQuestions? Reply to this email—we are happy to help.`;
 const html = `<!doctype html><html lang="en" dir="ltr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${escape(subject)}</title></head>
<body style="margin:0;padding:0;background-color:#E8E5D9;color:#343728;font-family:Arial,Helvetica,sans-serif;-webkit-text-size-adjust:100%">
<div lang="en" dir="ltr" style="display:none;max-height:0;overflow:hidden;mso-hide:all">Your private upload link for order ${escape(upload.order_name)}. Choose your photos whenever you are ready.</div>
<table lang="en" dir="ltr" role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#E8E5D9"><tr><td align="center" style="padding:24px 12px">
<!--[if mso]><table role="presentation" width="600"><tr><td><![endif]-->
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;background-color:#F8F7F3">
<tr><td align="center" bgcolor="#4A4B36" style="padding:28px 24px;background-color:#4A4B36"><a href="https://www.atelierelunora.com" style="text-decoration:none"><img src="https://cdn.shopify.com/s/files/1/1017/1069/2640/files/atelier-elunora-main-logo-web.png?v=1790015151" width="184" height="130" alt="Atelier Elunora website" style="display:block;border:0;width:184px;height:130px;max-width:100%"></a></td></tr>
<tr><td style="padding:32px 24px 24px"><p style="margin:0 0 16px;font-size:12px;line-height:18px;letter-spacing:2px;color:#4A4B36">YOUR PHOTO COLLECTION</p>
<h1 style="margin:0 0 24px;font-family:Georgia,'Times New Roman',serif;font-size:32px;line-height:39px;font-weight:normal;color:#343728">Your memories,<br>made into keepsakes.</h1>
<p style="margin:0 0 12px;font-size:16px;line-height:26px">Hello,</p><p style="margin:0 0 24px;font-size:16px;line-height:26px">Thank you for choosing Atelier Elunora. Whenever you are ready, your private photo upload space is waiting.</p>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#E8E5D9"><tr><td style="padding:20px"><h2 style="margin:0 0 8px;font-size:18px;line-height:25px;color:#343728">Order ${escape(upload.order_name)}</h2><p style="margin:0;font-size:15px;line-height:24px">${escape(upload.product_title)}<br>${escape(upload.required_count)} magnets</p></td></tr></table>
<p style="margin:24px 0;font-size:16px;line-height:26px">Choose your photographs, adjust their crops and copies, then select <strong>Submit photos</strong>. Your order is already purchased; there is no additional checkout.</p>
<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td bgcolor="#4A4B36" style="background-color:#4A4B36;border-radius:4px;text-align:center;mso-padding-alt:16px 24px"><a href="${escape(url)}" style="display:inline-block;padding:16px 24px;color:#FFFFFF;font-size:16px;line-height:24px;font-weight:bold;text-decoration:none;border-radius:4px;box-sizing:border-box">Upload your photos</a></td></tr></table>
<p style="margin:24px 0 0;font-size:15px;line-height:24px">We begin preparation after receiving your complete photo selection.</p>
<p style="margin:16px 0 0;font-size:13px;line-height:21px;color:#555744">Keep this link private. Anyone with it can access this order’s photos. ${escape(expiryText)}</p>
<p style="margin:16px 0 0;font-size:13px;line-height:21px">Button not opening? <a href="${escape(url)}" style="color:#4A4B36;text-decoration:underline">Open your private upload page</a>.</p>
</td></tr><tr><td style="padding:0 24px 32px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td style="border-top:1px solid #CECCBD;padding-top:24px"><p style="margin:0 0 8px;font-size:15px;line-height:24px">With care,</p><p style="margin:0 0 8px;font-family:Georgia,'Times New Roman',serif;font-size:24px;line-height:30px;color:#4A4B36">Atelier Elunora</p><p style="margin:0 0 16px;font-size:13px;line-height:21px">Where cherished memories become keepsakes</p><p style="margin:0;font-size:14px;line-height:24px"><a href="mailto:support@atelierelunora.com" style="color:#4A4B36;text-decoration:underline">support@atelierelunora.com</a><br><a href="https://www.atelierelunora.com" style="color:#4A4B36;text-decoration:underline">atelierelunora.com</a></p></td></tr></table></td></tr>
</table><!--[if mso]></td></tr></table><![endif]-->
<p style="margin:20px 0 0;font-size:13px;line-height:21px;color:#4A4B36">Questions? Reply to this email—we are happy to help.</p>
</td></tr></table></body></html>`;
 return {from:'Atelier Elunora <support@atelierelunora.com>',reply_to:'support@atelierelunora.com',to:[upload.email_recipient],subject,text,html};
}


export async function sendLaterEmail(service,id,{secret,key,fetcher=fetch},resend=false){
 if(!key)throw Error('Automatic upload email is not configured.');
 const claim=crypto.randomUUID(),r=await service.rpc('gallery_later_email_claim',{p_id:id,p_claim:claim,p_resend:resend});
 if(r.error)throw Error('Email could not be prepared. Review the order and retry.');if(!r.data?.id)return {sent:false};
 try{
  const {url}=await laterLink(service,id,secret);
  const response=await fetcher('https://api.resend.com/emails',{method:'POST',headers:{Authorization:'Bearer '+key,'Content-Type':'application/json','Idempotency-Key':'order-upload/'+id+'/'+r.data.email_version},body:JSON.stringify(laterEmail(r.data,url)),signal:AbortSignal.timeout(8000)});
  if(!response.ok)throw Error('Email provider did not accept the message.');
  const saved=await service.from('gallery_order_uploads').update({email_sent_at:new Date().toISOString(),email_lease_until:null,email_error:null}).eq('id',id).eq('email_claim',claim);
  if(saved.error)throw Error('Email receipt could not be saved.');
  return {sent:true};
 }catch(e){
  await service.from('gallery_order_uploads').update({email_lease_until:null,email_error:'Email delivery needs retry. Use Resend upload email.'}).eq('id',id).eq('email_claim',claim);
  throw e;
 }
}
