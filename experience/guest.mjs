import {prepareGuestDraft,paintGuestDraft,renderGuestDraft,approvalLabel} from './guest-drafts.mjs';
import {createLaterEditor} from './later-editor.mjs';
import {zipSync} from 'fflate';
const root=document.querySelector('[data-ae-experience]');
const copy=JSON.parse(root.querySelector('[data-copy]').textContent),t=key=>copy[key];
const API='https://gefdlubvqymyxrguhtnc.supabase.co/functions/v1/gallery-api/';
const sessionKey='elunora-shopify-gallery-session';
const token=()=>Array.from(crypto.getRandomValues(new Uint8Array(32)),b=>b.toString(16).padStart(2,'0')).join('');
let auth=null,link=new URLSearchParams(location.hash.slice(1)).get('event'),session=null,info=null,busy=false,captcha='',cursor=0,next=null;
let studioConsent=false,studioEvent=null;
const inlineStudio=root.dataset.mode==='studio'&&!!new URLSearchParams(location.search).get('upload_variant');
const eventGuest=root.dataset.mode==='event';
const later=root.dataset.mode==='later',linkKey=later?'ae-later-link':'ae-event-link';
const selected=new Set(),queue=[];
let laterEditor=null;
try{auth=JSON.parse(sessionStorage.getItem(sessionKey)||'null');}catch{}
if(link){sessionStorage.setItem(linkKey,link);history.replaceState(null,'',location.pathname+location.search);}else if(root.dataset.mode!=='studio')link=sessionStorage.getItem(linkKey);
function node(tag,text,attrs={}){const e=document.createElement(tag);if(text)e.textContent=text;for(const [k,v]of Object.entries(attrs))e.setAttribute(k,v);return e;}
const heading=node('h1',t('message_1')),welcome=node('p'),notice=node('p','',{role:'status','aria-live':'polite'}),content=node('div'),gallery=node('div',null,{class:'ae-photo-grid'}),uploads=node('ol'),actions=node('div',null,{class:'ae-actions'});
root.append(heading,welcome,notice,content,uploads,actions,gallery);
function message(text){notice.textContent=text;}
function button(text,fn){const b=node('button',text,{type:'button'});b.onclick=()=>run(fn);return b;}
async function run(fn){if(busy)return;busy=true;root.setAttribute('aria-busy','true');root.querySelectorAll('button').forEach(b=>b.disabled=true);try{await fn();}catch(e){if(e.status===401){auth=null;sessionStorage.removeItem(sessionKey);await signIn(info?order:start);}message(e.message);}finally{busy=false;root.removeAttribute('aria-busy');root.querySelectorAll('button').forEach(b=>b.disabled=false);}}
async function request(path,body,withAuth=true){
 if(withAuth&&auth&&auth.expires_at*1000<Date.now()+60000){auth=await request('refresh',{refresh_token:auth.refresh_token},false);sessionStorage.setItem(sessionKey,JSON.stringify(auth));}
 const r=await fetch(API+path,{method:'POST',headers:{'Content-Type':'application/json','X-Elunora-Request':'1',...(withAuth&&auth?{Authorization:'Bearer '+auth.access_token}:{})},body:JSON.stringify(body),signal:AbortSignal.timeout(90000)});
 const d=await r.json();if(!r.ok)throw Object.assign(Error(d.error||t('message_3')),{status:r.status});return d;
}
const api=body=>request('experience',{...body,session},root.dataset.mode==='studio'||['claim','studio'].includes(body.action));
async function signIn(after){
 if(root.dataset.mode==='studio')return guestSession(after);
 content.replaceChildren();const form=node('form'),email=node('input',null,{type:'email',autocomplete:'email',required:'',placeholder:'you@example.com','aria-label':t('message_4')}),code=node('input',null,{inputmode:'numeric',autocomplete:'one-time-code',maxlength:'8','aria-label':t('message_5')}),captchaBox=node('div');
 const send=button(t('message_6'),async()=>{await request('login',{email:email.value,captchaToken:captcha},false);message(t('message_7'));code.hidden=false;verify.hidden=false;code.focus();captcha='';if(window.turnstile)window.turnstile.reset();});
 const verify=button(t('message_8'),async()=>{auth=await request('verify',{email:email.value,token:code.value.trim()},false);sessionStorage.setItem(sessionKey,JSON.stringify(auth));await after();});
 code.hidden=verify.hidden=true;form.onsubmit=e=>{e.preventDefault();(code.hidden?send:verify).click();};form.append(node('p',t('message_9')),email,captchaBox,send,code,verify);content.append(form);
 if(!window.turnstile)await new Promise((resolve,reject)=>{const s=node('script',null,{src:'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'});s.onload=resolve;s.onerror=()=>reject(Error(t('message_10')));document.head.append(s);});
 window.turnstile.render(captchaBox,{sitekey:'0x4AAAAAAE7tigopK_0bbZOB',action:'gallery_login',theme:'light',callback:value=>{captcha=value;},'expired-callback':()=>{captcha='';}});
}
async function guestSession(after){
 content.replaceChildren();const box=node('div'),label=node('label',null,{class:'ae-consent',for:'ae-upload-consent'}),consent=node('input',null,{type:'checkbox',id:'ae-upload-consent'});label.append(consent,node('span',t('message_13')));let widget;
 const proceed=button('Start uploading',async()=>{
  if(!consent.checked)throw Error(t('message_17'));
  if(!auth&&!captcha)throw Error('Complete the security check to continue.');
  try{if(!auth){auth=await request('shop-session',{captchaToken:captcha},false);sessionStorage.setItem(sessionKey,JSON.stringify(auth));}studioConsent=true;await after();}
  finally{captcha='';if(widget!==undefined&&box.isConnected)window.turnstile?.reset(widget);}
 });
 content.append(node('p','Upload your photos without signing in. We’ll use the contact email you enter at checkout for your order.'),node('p','Keep this tab open while choosing your photos. Your private upload session stays in this tab.'),label,box,proceed);
 if(auth)return;
 if(!window.turnstile)await new Promise((resolve,reject)=>{const script=node('script',null,{src:'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'});script.onload=resolve;script.onerror=()=>reject(Error(t('message_10')));document.head.append(script);});
 widget=window.turnstile.render(box,{sitekey:'0x4AAAAAAE7tigopK_0bbZOB',action:'gallery_login',theme:'light',callback:value=>{captcha=value;},'expired-callback':()=>{captcha='';},'error-callback':()=>{captcha='';}});
}
async function start(){
 if(root.dataset.mode==='studio'&&!studioConsent)return guestSession(start);
 if(root.dataset.mode==='studio'&&!link){if(!auth)return signIn(start);const r=await api({action:'studio'});link=r.link;}
 if(!link){if(later)heading.textContent='Your order photos';message(later?'Open the private photo upload link in your order email. If you need a new link, contact support@atelierelunora.com.':t('message_11'));return;}
 info=await api({action:'info',link});heading.textContent=info.studio?t('message_12'):info.name;welcome.textContent=info.welcome;
 const saved=sessionStorage.getItem('ae-guest-'+link);session=saved||token();
 if(info.studio&&studioConsent){await joinUpload();return;}
 content.replaceChildren();
 const label=node('label',null,{class:'ae-consent',for:'ae-upload-consent'}),consent=node('input',null,{type:'checkbox',id:'ae-upload-consent'});
 label.append(consent,node('span',(info.studio||later)?t('message_13'):t('message_14')+(info.downloads?t('message_15'):'.')));
 content.append(label,button(t('message_16'),async()=>{if(!consent.checked)throw Error(t('message_17'));await joinUpload();}));
}
async function joinUpload(){await api({action:'join',link,consent:true});sessionStorage.setItem('ae-guest-'+link,session);message('');showUploader();await loadGallery();}
function showUploader(){
 content.replaceChildren();const files=node('input',null,{type:'file',accept:'image/jpeg,image/png,image/webp,image/heic,image/heif',multiple:'','aria-label':t('message_18')});
 files.hidden=true;
 const pick=node('button',t('message_20'),{type:'button'});
 pick.onclick=()=>files.click();
 const add=async list=>{if(queue.length+list.length>info.guestLimit)throw Error(t('message_22')+info.guestLimit+t('message_23'));for(const file of list){const item={file,id:crypto.randomUUID(),state:t('message_24')};if(eventGuest)await prepareGuestDraft(item,normalized);queue.push(item);}paintQueue();if(!eventGuest)await uploadAll();};
 for(const input of [files])input.onchange=()=>{const selected=[...input.files];input.value='';if(selected.length)run(()=>add(selected));};
 content.append(pick,files,node('p',t('message_25')),button(eventGuest?'Submit photos for approval':t('message_26'),uploadAll));
 if(auth&&!later)content.append(button(t('sign_out'),async()=>{try{await request('logout',{refresh_token:auth.refresh_token});}finally{auth=null;sessionStorage.removeItem(sessionKey);location.reload();}}));
 actions.replaceChildren(button(t('message_27'),()=>loadGallery(0)),...(!info.studio&&info.downloads?[button(t('message_28'),download)]:[]),...(info.studio&&!inlineStudio?[button(t('message_29'),order)]:[]),...(!inlineStudio?[button(t('message_30'),async()=>{if(next!==null)await loadGallery(next);})]:[]));
}
function paintQueue(){uploads.replaceChildren();for(const item of queue){
 const row=node('li');uploads.append(row);
 if(eventGuest&&!item.done)paintGuestDraft(item,row,{busy:()=>busy,remove:()=>{item.bitmap?.close();queue.splice(queue.indexOf(item),1);paintQueue();}});
 else row.textContent=item.file.name+' — '+item.state;
}}
async function refreshApproval(){
 if(!eventGuest||!session||busy||document.hidden)return;
 try{for(const page of new Set([0,cursor])){const r=await api({action:'photos',cursor:page});applyApproval(r.photos);}}catch{}
}
function applyApproval(photos){if(!eventGuest)return;for(const p of photos){
 const item=queue.find(i=>i.photoId===p.id);if(item?.done)item.state=approvalLabel(p.status);
 for(const badge of gallery.querySelectorAll('[data-photo-status]'))if(badge.dataset.photoStatus===p.id)badge.textContent=approvalLabel(p.status);
}for(let index=0;index<queue.length;index++){const item=queue[index];if(item.done&&uploads.children[index])uploads.children[index].textContent=item.file.name+' — '+item.state;}}
setInterval(refreshApproval,10000);
document.addEventListener('visibilitychange',refreshApproval);
async function normalized(file){
 if(!file.size||file.size>15728640)throw Error(t('message_31'));
 if(['image/jpeg','image/png','image/webp'].includes(file.type))return file;
 // Some phones expose HEIC through a browser decoder; convert only when decoding succeeds.
 let bitmap;try{bitmap=await createImageBitmap(file);}catch{throw Error(t('message_32'));}
 if(bitmap.width*bitmap.height>60000000){bitmap.close();throw Error(t('message_33'));}
 const canvas=document.createElement('canvas');const scale=Math.min(1,4096/Math.max(bitmap.width,bitmap.height));canvas.width=Math.round(bitmap.width*scale);canvas.height=Math.round(bitmap.height*scale);canvas.getContext('2d').drawImage(bitmap,0,0,canvas.width,canvas.height);bitmap.close();
 const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/jpeg',0.92));if(!blob)throw Error(t('message_34'));return new File([blob],file.name.replace(/\.[^.]+$/,'')+'.jpg',{type:'image/jpeg'});
}
async function uploadAll(){
 if(laterEditor)await laterEditor.flush();
 window.dispatchEvent(new CustomEvent('ae-upload-busy',{detail:true}));
 try{
 for(const item of queue){if(item.done)continue;try{
  item.prepared??=eventGuest?await renderGuestDraft(item):await normalized(item.file);const f=item.prepared;item.state=t('message_35');paintQueue();
  const r=await api({action:'reserve',requestId:item.id,filename:f.name.slice(0,180),mime:f.type,bytes:f.size});
  if(!r.ready&&!item.transferred){const upload=await fetch(r.uploadUrl,{method:'PUT',headers:{'Content-Type':f.type},body:f,signal:AbortSignal.timeout(120000)});if(!upload.ok&&upload.status!==409)throw Error(t('message_36'));item.transferred=true;}
  const result=r.ready?{status:'received'}:await api({action:'finish',requestId:item.id});item.done=true;item.photoId=result.photoId||r.photoId;item.state=eventGuest?approvalLabel(result.status):result.status==='pending'?t('message_37'):t('message_38');if(eventGuest){item.bitmap?.close();item.bitmap=null;}
 }catch(e){item.state=e.message;}paintQueue();}
 message(t('message_39'));await loadGallery(0);
 }finally{window.dispatchEvent(new CustomEvent('ae-upload-busy',{detail:false}));}
}
async function loadGallery(page=0){
 if(later){actions.replaceChildren(button('Refresh saved photos',()=>loadGallery()));gallery.className='ae-later-editor';laterEditor??=createLaterEditor({host:gallery,call:body=>request('upload-later',{...body,session},false),photos:cursor=>api({action:'photos',cursor}),notice:message,onSubmitted:()=>{content.replaceChildren();uploads.replaceChildren();}});await laterEditor.refresh();return;}

 if(inlineStudio){gallery.hidden=true;if(!studioEvent)studioEvent=(await api({action:'claim'})).eventId;
  for(let i=0;!window.atelierStudioRefresh&&i<100;i++)await new Promise(resolve=>setTimeout(resolve,50));
  if(!window.atelierStudioRefresh)throw Error('The photo editor could not load. Please refresh this page.');
  await window.atelierStudioRefresh(studioEvent);return;
 }
 const r=await api({action:'photos',cursor:page});applyApproval(r.photos);cursor=page;next=r.next;if(!page){gallery.replaceChildren();selected.clear();}
 for(const p of r.photos){
  const preview=info.studio,card=node(preview?'figure':'label',null,{class:preview?'ae-photo ae-upload-preview':'ae-photo'}),image=node('img',null,{src:p.url,alt:p.filename,loading:'lazy'});card.append(image);
  if(!preview){const check=node('input',null,{type:'checkbox','aria-label':t('message_40')+p.filename});check.onchange=()=>{if(check.checked)selected.add(p.id);else selected.delete(p.id);};card.append(check);}
  card.append(node(preview?'figcaption':'span',p.filename));if(eventGuest)card.append(node('p',approvalLabel(p.status),{'data-photo-status':p.id}));gallery.append(card);
 }
 if(!gallery.children.length)message(info.moderation?t('message_41'):t('message_42'));
}
async function download(){
 const r=await api({action:'downloads',ids:[...selected]});const entries={};
 for(const p of r.photos){const response=await fetch(p.url,{signal:AbortSignal.timeout(120000)});if(!response.ok)throw Error(t('message_43'));entries[p.id.slice(0,8)+'-'+p.filename.replace(/[^\w. -]/g,'_')]=new Uint8Array(await response.arrayBuffer());}
 const url=URL.createObjectURL(new Blob([zipSync(entries,{level:0})],{type:'application/zip'})),a=node('a',null,{href:url,download:'Atelier-Elunora-photos.zip'});a.click();setTimeout(()=>URL.revokeObjectURL(url),60000);message(t('message_44'));
}
async function order(){if(!auth)return signIn(order);const r=await api({action:'claim'});const url=new URL('/pages/client-gallery',location.origin);url.searchParams.set('event',r.eventId);url.searchParams.set('atelier','1');const params=new URLSearchParams(location.search);for(const key of ['upload_variant','preview_theme_id']){const value=params.get(key);if(/^\d+$/.test(value||''))url.searchParams.set(key,value);}location.assign(url.href);}
run(start);
