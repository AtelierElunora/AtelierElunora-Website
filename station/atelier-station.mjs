import {cropRect,sheetLayout,letterCopyLayout,letterLayout,drawVerticalCutGuides,normalizeTemplate,templateSides,resolveTemplateText,drawMagnet} from '../theme/assets/atelier-station-core.js';
const API='https://gefdlubvqymyxrguhtnc.supabase.co/functions/v1/gallery-api/station';
const $=id=>document.getElementById(id),notice=message=>{$('notice').textContent=message;};
const demo=new URLSearchParams(location.search).get('demo');
const fragment=new URLSearchParams(location.hash.slice(1));
let purpose=fragment.has('capture')?'capture':fragment.has('print')?'print':null;
let token=purpose?fragment.get(purpose):null;
if(token){sessionStorage.setItem('ae-station',JSON.stringify({purpose,token}));history.replaceState(null,'',location.pathname+location.search);}
else{try{({purpose,token}=JSON.parse(sessionStorage.getItem('ae-station')||'{}'));}catch{}}
if(demo==='capture'||demo==='print'){purpose=demo;token='demo';$('demo-label').hidden=false;}
let stream,face='user',jpeg=null,requestId=null,attempted=false,busy=false,closed=false,selected=null,picture=null,timer,loadGeneration=0;
let eventName='',template=normalizeTemplate();
let autoLetter=false,letterBatch=null,letterReady=false,letterRequest=null;
let demoJobs=[{id:'DEMO-001',status:'pending',quantity:2,x:50,y:50,zoom:1,version:1,created_at:new Date().toISOString()}];
if(demo==='print'&&new URLSearchParams(location.search).has('batch'))demoJobs=Array.from({length:12},(_,i)=>({id:'DEMO-'+String(i+1).padStart(3,'0'),status:'pending',quantity:1,x:50,y:50,zoom:1,version:1,created_at:new Date().toISOString()}));
async function api(body){
 if(closed)throw Error('This station is closed.');
 if(token==='demo'){
  if(body.action==='info')return {name:'Sample celebration',purpose};
  if(body.action==='template')return {template:normalizeTemplate({enabled:true,sides:{top:{source:'company'},bottom:{source:'event'}}})};
  if(body.action==='submit')return {received:true,photoId:'DEMO'};
  if(body.action==='batch-status'){const jobs=demoJobs.filter(j=>j.letter_batch_id&&j.status==='printing');return {batch:jobs.length?{id:jobs[0].letter_batch_id,jobs,created:false}:null};}
  if(body.action==='batch-claim'){
   const existing=demoJobs.filter(j=>j.letter_batch_id===body.requestId||(j.letter_batch_id&&j.status==='printing'));
   if(existing.length)return {id:existing[0].letter_batch_id,jobs:existing,created:false};
   const jobs=demoJobs.filter(j=>j.status==='pending'&&j.quantity===1).slice(0,6);
   if(!jobs.length||(!body.partial&&jobs.length<6))return {waiting:true,count:jobs.length};
   jobs.forEach((j,i)=>Object.assign(j,{status:'printing',letter_batch_id:body.requestId,letter_slot:i,version:j.version+1,template:normalizeTemplate({enabled:true,cutInches:3.6,sides:{top:{source:'company'},bottom:{source:'event'}}})}));
   return {id:body.requestId,jobs,created:true};
  }
  if(body.action==='batch-finish'){const jobs=demoJobs.filter(j=>j.letter_batch_id===body.id&&j.status==='printing');jobs.forEach(j=>Object.assign(j,{status:body.operation==='printed'?'printed':'pending',version:j.version+1,...(body.operation==='release'?{letter_batch_id:null,letter_slot:null}:{})}));return {updated:jobs.length};}
  if(body.action==='queue')return {jobs:demoJobs.filter(j=>j.status===($('queue-filter').value||'pending'))};
  if(body.action==='update'){
   const j=demoJobs.find(j=>j.id===body.id);if(!j||j.version!==body.version)throw Error('Refresh the queue.');
   Object.assign(j,{version:j.version+1,status:({claim:'printing',printed:'printed',retry:'pending',hold:'held'})[body.operation]},body.operation==='claim'?{quantity:body.quantity,x:body.x,y:body.y,zoom:body.zoom,template:body.template}:{});return {job:{...j}};
  }
 }
 const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),90000);
 try{const r=await fetch(API,{method:'POST',headers:{'Content-Type':'application/json','X-Elunora-Request':'1'},body:JSON.stringify({...body,token,purpose}),signal:controller.signal});const d=await r.json();if(!r.ok)throw Error(d.error||'Please retry.');return d;}
 catch(e){if(e.name==='AbortError'||e instanceof TypeError)throw Error('Connection interrupted. Keep this screen open and retry.');throw e;}finally{clearTimeout(timeout);}
}
async function run(fn){if(busy||closed)return;busy=true;sync();try{await fn();}catch(e){notice(e.message);}finally{busy=false;sync();}}
function sync(){
 document.querySelectorAll('button').forEach(b=>{b.disabled=busy||closed||b.dataset.batchJob==='true';});
 $('letter-toggle').textContent=autoLetter?'Pause automatic sheets':'Start automatic six-photo sheets';
 $('letter-toggle').disabled=busy||closed||Boolean(selected);
 $('letter-partial').disabled=busy||closed||Boolean(selected)||Boolean(letterBatch);
 $('letter-active').hidden=!letterBatch;
 $('letter-print').disabled=busy||closed||!letterBatch;
 $('letter-confirm').disabled=busy||closed||!letterBatch;
 document.querySelectorAll('#jobs button').forEach(b=>{b.disabled=busy||closed||autoLetter||Boolean(letterBatch)||b.dataset.batchJob==='true';});
 $('retake').disabled=busy||attempted||closed;
 $('prepare').disabled=busy||!picture||selected?.status!=='pending'||closed;
 $('hold').disabled=busy||selected?.status!=='pending'||closed;
 $('printed').hidden=selected?.status!=='printing';$('retry').hidden=!['printing','held'].includes(selected?.status);
 document.querySelectorAll('#template-editor input,#template-editor select,#template-editor button').forEach(el=>{el.disabled=busy||selected?.status!=='pending'||closed;});
 for(const id of ['x','y','zoom','reset-crop','quantity','cut','sheet-format'])$(id).disabled=busy||selected?.status!=='pending';
}
function stopCamera(){stream?.getTracks().forEach(t=>t.stop());stream=null;}
async function camera(){
 stopCamera();
 if(!navigator.mediaDevices?.getUserMedia)throw Error('Open this page in Safari or Chrome over HTTPS to use the camera.');
 stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:face},width:{ideal:2400},height:{ideal:1800}},audio:false});
 $('camera').srcObject=stream;await $('camera').play();$('start').hidden=true;$('take').hidden=false;$('switch').hidden=false;notice('Ready for your photo.');
}
function reset(){$('start').hidden=Boolean(stream);jpeg=null;requestId=null;attempted=false;$('review').removeAttribute('src');$('review').hidden=true;$('camera').hidden=false;$('retake').hidden=true;$('accept').hidden=true;$('accept').textContent='Use this photo';$('take').hidden=!stream;$('switch').hidden=!stream;}
$('start').onclick=()=>run(camera);
$('switch').onclick=()=>run(async()=>{face=face==='user'?'environment':'user';await camera();});
$('take').onclick=()=>run(async()=>{
 const v=$('camera');if(!v.videoWidth||v.readyState<2)throw Error('Camera is still starting. Please try again.');
 const c=document.createElement('canvas'),scale=Math.min(1,2400/Math.max(v.videoWidth,v.videoHeight));c.width=Math.round(v.videoWidth*scale);c.height=Math.round(v.videoHeight*scale);c.getContext('2d').drawImage(v,0,0,c.width,c.height);
 let url;for(const quality of [.9,.8,.65]){url=c.toDataURL('image/jpeg',quality);if(url.length<5500000)break;}
 if(url.length>=5500000)throw Error('Photo too large. Try again.');
 jpeg=url.split(',')[1];requestId=crypto.randomUUID();attempted=false;$('review').src=url;$('review').hidden=false;v.hidden=true;$('take').hidden=true;$('switch').hidden=true;$('retake').hidden=false;$('accept').hidden=false;notice('Happy with your photo?');
});
$('retake').onclick=()=>{if(!busy&&!attempted){reset();notice('Ready for another photo.');}};
$('accept').onclick=()=>run(async()=>{
 if(!jpeg||!requestId)return;attempted=true;notice('Sending your photo. Please keep this screen open.');
 try{const r=await api({action:'submit',requestId,jpeg});if(!r.received)throw Error('Receipt not confirmed. Retry this photo.');reset();notice(token==='demo'?'Demo complete. Nothing was uploaded.':'Photo received! Your attendant will prepare your magnet. Ready for the next guest.');}
 catch(e){$('accept').textContent='Retry this photo';throw e;}
});
function drawCrop(){$('zoom-value').textContent=Number($('zoom').value).toFixed(2)+'×';if(!picture)return;const c=$('crop'),ctx=c.getContext('2d'),r=cropRect(picture.naturalWidth,picture.naturalHeight,Number($('x').value),Number($('y').value),Number($('zoom').value));ctx.drawImage(picture,r.sx,r.sy,r.size,r.size,0,0,c.width,c.height);drawTemplatePreview();}
$('x').oninput=drawCrop;$('y').oninput=drawCrop;$('zoom').oninput=drawCrop;
$('reset-crop').onclick=()=>{if(busy||selected?.status!=='pending')return;$('x').value=50;$('y').value=50;$('zoom').value=1;drawCrop();};

function templateContext(){return {name:eventName,photo:selected?.id.slice(0,8)??''};}
function populateTemplate(value){
 template=normalizeTemplate(value);$('template-enabled').checked=template.enabled;
 $('cut').value=template.enabled?template.cutInches:template.photoCutInches;
 $('template-background').value=template.background;$('template-background-hex').value=template.background;$('template-color').value=template.color;$('template-font').value=template.fontSize;$('template-inset').value=Math.round(((template.cutInches-2.5)/2-template.edgeInset)*1000000)/1000000;
 $('template-sides').replaceChildren();
 for(const side of templateSides){
  const label=document.createElement('label');label.textContent=side[0].toUpperCase()+side.slice(1)+' text';
  const input=document.createElement('input');input.id='wrap-'+side;input.maxLength=100;input.value=resolveTemplateText(template,side,templateContext());input.oninput=drawTemplatePreview;label.append(input);$('template-sides').append(label);
  const rotationLabel=document.createElement('label');rotationLabel.textContent=side+' orientation';const rotation=document.createElement('select');rotation.id='rotate-'+side;
  for(const [value,text] of [['0','Standard'],['180','Rotate 180°']]){const option=document.createElement('option');option.value=value;option.textContent=text;rotation.append(option);}rotation.value=String(template.sides[side].rotate);rotation.onchange=drawTemplatePreview;rotationLabel.append(rotation);$('template-sides').append(rotationLabel);
 }
 drawTemplatePreview();sync();
}
function currentTemplate(){
 const enabled=$('template-enabled').checked;
 return normalizeTemplate({...template,enabled,photoCutInches:Number($('cut').value),cutInches:enabled?Number($('cut').value):template.cutInches,background:$('template-background-hex').value.trim(),color:$('template-color').value,fontSize:Number($('template-font').value),edgeInset:Math.round((((enabled?Number($('cut').value):template.cutInches)-2.5)/2-($('template-inset').value.trim()===''?NaN:Number($('template-inset').value)))*1000000)/1000000,sides:Object.fromEntries(templateSides.map(side=>[side,{...template.sides[side],source:'custom',text:$('wrap-'+side)?.value??'',rotate:Number($('rotate-'+side)?.value??0)}]))});
}
function drawTemplatePreview(){
 if(!picture)return;
 const c=$('template-preview'),ctx=c.getContext('2d');ctx.clearRect(0,0,c.width,c.height);
 try{const t=currentTemplate(),r=cropRect(picture.naturalWidth,picture.naturalHeight,Number($('x').value),Number($('y').value),Number($('zoom').value));drawMagnet(ctx,picture,r,{x:0,y:0,size:c.width},t,templateContext(),true);$('template-status').textContent=t.enabled?'Preview only: dashed fold guide does not print.':'Photo-only printing; wrap text is disabled.';}
 catch(e){$('template-status').textContent=e.message;}
}
for(const id of ['cut','template-color','template-font','template-inset'])$(id).oninput=drawTemplatePreview;
$('template-background').oninput=()=>{$('template-background-hex').value=$('template-background').value;drawTemplatePreview();};
$('template-background-hex').oninput=()=>{const color=$('template-background-hex').value.trim();if(/^#[a-f0-9]{6}$/i.test(color))$('template-background').value=color;drawTemplatePreview();};
$('template-enabled').onchange=()=>{if($('template-enabled').checked&&Number($('cut').value)<3)$('cut').value=template.cutInches;drawTemplatePreview();};
$('template-reset').onclick=()=>run(async()=>{populateTemplate((await api({action:'template'})).template);notice('Event template loaded.');});

async function loadImage(url){const image=new Image();image.crossOrigin='anonymous';await new Promise((resolve,reject)=>{image.onload=resolve;image.onerror=()=>reject(Error('Photo could not load. Open the job again to refresh its link.'));image.src=url;});return image;}
function sampleImage(){const c=document.createElement('canvas');c.width=1200;c.height=900;const x=c.getContext('2d');x.fillStyle='#d6d2bc';x.fillRect(0,0,1200,900);x.fillStyle='#4a4b36';x.fillRect(150,100,900,650);x.fillStyle='#fff';x.font='50px Georgia';x.fillText('DEMO · crop and print test',270,400);return c.toDataURL('image/jpeg');}
function clearSheets(){$('sheets').classList.remove('letter-sheets');$('sheets').replaceChildren();$('downloads').replaceChildren();$('sheet-controls').hidden=true;}
async function openJob(job){
 if(autoLetter||letterBatch||job.letter_batch_id)throw Error('Pause automatic sheets and finish the active sheet before opening individual photos.');
 clearSheets();selected={...job};picture=null;$('editor').hidden=false;$('job-title').textContent='Photo '+job.id.slice(0,8)+' · '+job.status;
 $('zoom').value=job.zoom??1;$('zoom-value').textContent=Number($('zoom').value).toFixed(2)+'×';$('quantity').value=job.quantity;$('x').value=job.x;$('y').value=job.y;$('print-note').textContent=job.status==='printing'?'This job is reserved for printing. Check physical output before confirming or returning it to pending.':'';sync();
 const generation=++loadGeneration;
 const templateData=job.template??(await api({action:'template'})).template;
 if(closed||generation!==loadGeneration)return;populateTemplate(templateData);
 const url=token==='demo'?sampleImage():(await api({action:'image',id:job.id})).url;
 const loaded=await loadImage(url);if(closed||generation!==loadGeneration)return;picture=loaded;drawCrop();sync();
}
async function queue(){
 const r=await api({action:'queue',status:$('queue-filter').value});if(closed)return;
 $('jobs').replaceChildren();
 if(!r.jobs.length){const p=document.createElement('p');p.textContent='No photos in this queue.';$('jobs').append(p);}
 r.jobs.forEach(job=>{const b=document.createElement('button');b.textContent=job.id.slice(0,8)+' · '+job.status+' · '+new Date(job.created_at).toLocaleTimeString();b.dataset.batchJob=String(Boolean(job.letter_batch_id));if(job.letter_batch_id)b.textContent+=' · reserved in letter sheet';b.onclick=()=>run(()=>openJob(job));b.disabled=busy||autoLetter||Boolean(letterBatch)||Boolean(job.letter_batch_id);$('jobs').append(b);});
 if(r.jobs.length===100){const p=document.createElement('p');p.textContent='Showing the oldest 100 jobs in this status. Completing jobs reveals the next ones.';$('jobs').append(p);}
 if(selected){const fresh=r.jobs.find(j=>j.id===selected.id);if(fresh&&fresh.version!==selected.version){picture=null;clearSheets();sync();notice('This job changed in another window. Open it again before printing.');}}
}
async function update(operation,printTemplate){const r=await api({action:'update',...(printTemplate?{template:printTemplate}:{}),id:selected.id,version:selected.version,operation,quantity:Number($('quantity').value),x:Number($('x').value),y:Number($('y').value),zoom:Number($('zoom').value)});selected=r.job;return r.job;}
$('prepare').onclick=()=>run(async()=>{
 const printTemplate=currentTemplate();
 if(printTemplate.enabled){const loaded=await document.fonts.load('12px "Brown Carolina"');if(!loaded.length)throw Error('Print font could not load. Check your connection and retry.');}
 const letter=$('sheet-format').value==='letter';
 const pages=(letter?letterCopyLayout:sheetLayout)(Number($('quantity').value),Number($('cut').value));
 const r=cropRect(picture.naturalWidth,picture.naturalHeight,Number($('x').value),Number($('y').value),Number($('zoom').value));
 // Render first; reserve atomically before exposing a printable sheet.
 const urls=pages.map(slots=>{const c=document.createElement('canvas');c.width=letter?2550:1800;c.height=letter?3300:1200;const ctx=c.getContext('2d');ctx.fillStyle='white';ctx.fillRect(0,0,c.width,c.height);for(const slot of slots){drawMagnet(ctx,picture,r,slot,printTemplate,templateContext());}if(letter)drawVerticalCutGuides(ctx,slots);return c.toDataURL('image/png');});
 await update('claim',printTemplate);clearSheets();if(letter)$('sheets').classList.add('letter-sheets');
 urls.forEach((url,i)=>{const img=document.createElement('img');img.src=url;img.alt='Print sheet '+(i+1);$('sheets').append(img);const a=document.createElement('a');a.href=url;a.download='AE-'+selected.id+'-sheet-'+(i+1)+'.png';a.textContent='Download sheet '+(i+1);$('downloads').append(a);});
 $('sheet-controls').hidden=false;notice(pages.length+' '+(letter?'Letter':'4 × 6')+' sheet(s) ready for '+$('quantity').value+' magnets. Print at 100% / actual size, with margins set to None and headers/footers off.');await queue();
});
$('print').onclick=()=>{if(letterBatch){$('letter-print').click();return;}if(!busy&&!closed)window.print();};
$('printed').onclick=()=>run(async()=>{if(!confirm('Have all magnets for this job physically printed correctly?'))return;await update('printed');clearSheets();selected=null;picture=null;$('editor').hidden=true;await queue();notice('Marked printed.');});
$('retry').onclick=()=>run(async()=>{if(!confirm('Check the printer first to avoid duplicate prints. Return this job to pending?'))return;await update('retry');clearSheets();selected=null;picture=null;$('editor').hidden=true;await queue();notice('Returned to pending.');});
$('hold').onclick=()=>run(async()=>{await update('hold');selected=null;picture=null;$('editor').hidden=true;await queue();});
$('refresh').onclick=()=>run(async()=>{await queue();await checkLetter();});$('queue-filter').onchange=()=>run(queue);
function end(){autoLetter=false;letterBatch=null;letterReady=false;closed=true;clearTimeout(timer);loadGeneration++;stopCamera();sessionStorage.removeItem('ae-station');jpeg=null;token=null;picture=null;selected=null;$('review').removeAttribute('src');$('capture').hidden=true;$('printing').hidden=true;clearSheets();notice('Station closed on this device. Revoke its link in the owner app to disable it everywhere.');sync();}
$('close').onclick=()=>{if(!busy&&(!jpeg||confirm('An unconfirmed photo is on screen. Closing may lose it. Close this device?')))end();};
window.addEventListener('beforeunload',e=>{if(jpeg){e.preventDefault();e.returnValue='';}});
window.addEventListener('pagehide',stopCamera);
document.addEventListener('visibilitychange',()=>{if(document.hidden)stopCamera();else if(purpose==='capture'&&!jpeg&&!closed){$('start').hidden=false;$('take').hidden=true;$('switch').hidden=true;notice('Tap Enable camera to resume.');}});
async function poll(){if(closed)return;try{if(!busy&&!document.hidden){busy=true;sync();try{await queue();await checkLetter();}finally{busy=false;sync();}}}catch(e){autoLetter=false;sync();notice('Queue refresh failed; automatic sheets paused: '+e.message);}finally{if(!closed)timer=setTimeout(poll,5000);}}
(async()=>{try{if(!token||!['capture','print'].includes(purpose))throw Error('Open an event-specific station link created in your owner app.');const info=await api({action:'info'});eventName=info.name;$('event-name').textContent=info.name;$('title').textContent=purpose==='capture'?'Make a memory':'Event print desk';$(purpose==='capture'?'capture':'printing').hidden=false;notice(purpose==='capture'?'Tap Enable camera to begin.':'Print desk connected.');if(purpose==='print'){document.fonts.load('12px "Brown Carolina"').then(drawTemplatePreview).catch(()=>{});await poll();}}catch(e){notice(e.message);}sync();})();

// A browser print request is not a receipt from the physical printer.
// Never auto-reprint a recovered batch or mark it printed after the dialog closes.
function showLetter(message){$('letter-status').textContent=message;sync();}
async function renderLetter(){
 letterReady=false;clearSheets();
 const batch=letterBatch;
 const templates=batch.jobs.map(j=>normalizeTemplate(j.template));
 const slots=letterLayout(templates.map(t=>t.enabled?t.cutInches:t.photoCutInches));
 if(templates.some(t=>t.enabled)&&!(await document.fonts.load('12px "Brown Carolina"')).length)throw Error('Print font could not load. Retry preparing this sheet.');
 const images=await Promise.all(batch.jobs.map(async j=>loadImage(token==='demo'?sampleImage():(await api({action:'image',id:j.id})).url)));
 if(closed||letterBatch!==batch)return;
 const canvas=document.createElement('canvas');canvas.width=2550;canvas.height=3300;const ctx=canvas.getContext('2d');ctx.fillStyle='white';ctx.fillRect(0,0,2550,3300);
 batch.jobs.forEach((j,i)=>{const im=images[i];drawMagnet(ctx,im,cropRect(im.naturalWidth,im.naturalHeight,j.x,j.y,j.zoom??1),slots[i],templates[i],{name:eventName,photo:j.id.slice(0,8)});});
 drawVerticalCutGuides(ctx,slots);
 const url=canvas.toDataURL('image/png');
 // Wait for decoding before opening print, otherwise some browsers print a blank sheet.
 await loadImage(url);
 if(closed||letterBatch!==batch)return;
 const img=document.createElement('img');img.src=url;img.alt='Letter sheet with '+batch.jobs.length+' magnets';
 $('sheets').classList.add('letter-sheets');$('sheets').append(img);
 const a=document.createElement('a');a.href=url;a.download='AE-letter-'+batch.id+'.png';a.textContent='Download letter sheet';$('downloads').append(a);$('sheet-controls').hidden=false;
 letterReady=true;showLetter(batch.jobs.length+' photos reserved. Dashed vertical guides mark the outer cut edges; cut along the side nearest the design. Print Letter at 100% / actual size, then confirm the physical sheet.');
}
async function recoverLetter(){
 const r=await api({action:'batch-status'});
 const recovered=r?.batch??null;
 if(letterBatch&&letterBatch.id!==recovered?.id){autoLetter=false;clearSheets();letterReady=false;letterBatch=null;showLetter('Sheet changed in another window. Automatic sheets paused.');}
 if(recovered&&!letterBatch){letterBatch=recovered;letterReady=false;autoLetter=false;showLetter('A sheet is already reserved. Check the printer before choosing Prepare / print this sheet. It will not print again automatically.');}
 return Boolean(letterBatch);
}
async function claimLetter(partial=false){
 letterRequest??=crypto.randomUUID();
 try{
  const r=await api({action:'batch-claim',requestId:letterRequest,partial});
  letterRequest=null;
  if(closed)return;
  if(r.waiting){showLetter(r.count+' of 6 eligible photos ready. '+(autoLetter?'Waiting for a full sheet.':'Automatic sheets paused.'));return;}
  if(!r.jobs?.length||r.jobs.some(j=>j.status!=='printing')){autoLetter=false;showLetter('This sheet has already been completed. Refresh the queue.');return;}
  letterBatch=r;letterReady=false;
  if(!r.created){autoLetter=false;showLetter('Recovered a reserved sheet. Check the printer before preparing it; automatic reprinting is blocked.');return;}
  await renderLetter();
  if(!closed&&letterReady){window.print();notice('Print requested. Check the dialog and actual output, then confirm the sheet.');}
 }catch(e){autoLetter=false;showLetter('Automatic sheets paused. '+e.message+(letterBatch?' Your sheet remains reserved. Use Prepare / print to retry.':' Check for a reserved sheet before retrying.'));throw e;}
 finally{sync();}
}
async function checkLetter(){
 if(selected)return;
 if(await recoverLetter())return;
 if(autoLetter)await claimLetter();
}
$('letter-toggle').onclick=()=>run(async()=>{
 if(autoLetter){autoLetter=false;showLetter('Automatic sheets paused.');return;}
 if(selected)throw Error('Close the photo editor before starting automatic sheets.');
 if(await recoverLetter())throw Error('Finish the reserved sheet before starting automatic sheets.');
 const t=normalizeTemplate((await api({action:'template'})).template);letterLayout([t.enabled?t.cutInches:t.photoCutInches]);
 if(!confirm('Use Letter paper and a tested cut size of 3.6 inches or smaller. Photos use their saved crop and the event template, one magnet each. The print dialog opens when six are ready. Continue?'))return;
 autoLetter=true;await claimLetter();
});
$('letter-partial').onclick=()=>run(async()=>{if(selected||letterBatch)return;autoLetter=false;if(!confirm('Print the next available photos, up to six, even if the sheet is not full?'))return;await claimLetter(true);});
$('letter-print').onclick=()=>run(async()=>{
 if(!letterBatch)return;
 if(!confirm('Check the printer first. Printing this sheet again can create duplicates. Continue?'))return;
 await recoverLetter();if(!letterBatch)throw Error('This sheet was completed or returned to the queue in another window.');
 if(!letterReady)await renderLetter();if(!closed&&letterReady)window.print();
});
$('letter-confirm').onclick=()=>run(async()=>{
 if(!letterBatch||!confirm('Have all '+letterBatch.jobs.length+' magnets on this reserved sheet physically printed correctly? Only confirm after checking the actual output.'))return;
 await api({action:'batch-finish',id:letterBatch.id,operation:'printed'});
 letterBatch=null;letterReady=false;clearSheets();showLetter('Sheet confirmed printed.');await queue();await checkLetter();
});
$('letter-release').onclick=()=>run(async()=>{
 if(!letterBatch||!confirm('Check the printer and cancel any queued copy first. Return every photo on this sheet to pending?'))return;
 autoLetter=false;await api({action:'batch-finish',id:letterBatch.id,operation:'release'});letterBatch=null;letterReady=false;clearSheets();showLetter('Photos returned to pending. Automatic sheets paused.');await queue();
});
$('editor-close').onclick=()=>run(async()=>{if(selected?.status==='printing')throw Error('Confirm the printed photo or return it to pending first.');selected=null;picture=null;loadGeneration++;clearSheets();$('editor').hidden=true;await queue();});
