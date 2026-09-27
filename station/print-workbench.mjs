import {cropRect,normalizeTemplate,letterLayout,ds820Layout,drawMagnet,drawVerticalCutGuides} from '../theme/assets/atelier-station-core.js';

export function printPages(jobs){
 const copies=jobs.flatMap(j=>Array.from({length:j.quantity},()=>j));
 return Array.from({length:Math.ceil(copies.length/6)},(_,i)=>copies.slice(i*6,i*6+6));
}

export function installWorkbench({api,run,notice,loadImage,sampleImage,isDemo,state,clearSheets,requestPrint,refresh,eventName}){
 const $=id=>document.getElementById(id);
 const panel=document.createElement('section');panel.id='print-workbench';
 panel.innerHTML=`<h2>Prepare an entire order</h2><p>Edit pending photos together, then prepare all their sheets in one print dialog. Up to 200 magnets per print run; new arrivals stay pending for the next run.</p><div class="actions"><button id="crop-open">Edit multiple photos</button><button id="run-start">Prepare all remaining photos</button></div><p id="run-status" role="status"></p><div id="run-controls" hidden><button id="run-print">Open print dialog for all sheets</button><button id="run-done">Confirm all sheets printed</button><button id="run-release">Return run to pending</button></div><section id="crop-workspace" hidden><h3>Adjust photos before printing</h3><p>Each photo has its own controls. To change several together, tick their selection boxes and use Apply to selected. Saving changes only print crops, not customer originals or purchased quantities.</p><div class="actions"><button id="crop-select-all">Select all</button><button id="crop-select-none">Select none</button></div><fieldset id="crop-shared"><legend>Apply the same adjustment</legend><label>Zoom <input id="crop-shared-zoom" type="number" min="1" max="3" step="0.01" value="1"></label><label>Horizontal position <input id="crop-shared-x" type="number" min="0" max="100" value="50"></label><label>Vertical position <input id="crop-shared-y" type="number" min="0" max="100" value="50"></label><button id="crop-apply">Apply to selected</button></fieldset><p id="crop-status" role="status"></p><div id="crop-grid"></div><div class="actions"><button id="crop-save">Save crop changes</button><button id="crop-close">Close crop editor</button></div></section>`;
 $('letter-queue').before(panel);
 panel.querySelector('.actions').before($('batch-format').parentElement);
 let edits=null,printRun=null,ready=false,request=null,dirty=false,urls=[];
 const active=()=>Boolean(edits||printRun);
 const clean=()=>{urls.forEach(URL.revokeObjectURL);urls=[];};
 function sync(){
  const s=state(),blocked=s.busy||s.closed;
  panel.querySelectorAll('button,input').forEach(e=>e.disabled=blocked);
  $('crop-open').disabled=blocked||Boolean(printRun)||Boolean(edits)||s.selected||s.letterBatch||s.autoLetter;
  $('run-start').disabled=blocked||active()||s.selected||s.letterBatch||s.autoLetter;
  $('run-controls').hidden=!printRun;$('crop-workspace').hidden=!edits;
  $('queue-filter').disabled=blocked||active();
  $('batch-format').disabled=blocked||Boolean(printRun);
  if(active()){
   for(const id of ['letter-toggle','letter-partial','queue-filter'])$(id).disabled=true;
   document.querySelectorAll('#jobs button').forEach(b=>b.disabled=true);
  }
  $('crop-save').disabled=blocked||!dirty;
 }
 function draw(row){
  const ctx=row.canvas.getContext('2d'),r=cropRect(row.image.naturalWidth,row.image.naturalHeight,row.x,row.y,row.zoom);
  ctx.clearRect(0,0,360,360);ctx.drawImage(row.image,r.sx,r.sy,r.size,r.size,0,0,360,360);
  row.output.textContent=`${row.zoom.toFixed(2)}× · ${row.quantity} ${row.quantity===1?'magnet':'magnets'}`;
 }
 function changed(row){row.changed=true;dirty=true;draw(row);$('crop-status').textContent='Unsaved adjustments. Review the previews, then save.';sync();}
 function card(job,image,index){
  const row={...job,image,x:Number(job.x),y:Number(job.y),zoom:Number(job.zoom??1),checked:true,changed:false};
  const box=document.createElement('article');box.className='crop-card';
  const label=document.createElement('label');label.className='crop-selection';const check=document.createElement('input');check.type='checkbox';check.checked=true;check.onchange=()=>row.checked=check.checked;row.check=check;label.append(check,document.createTextNode('Photo '+(index+1)));box.append(label);
  const canvas=document.createElement('canvas');canvas.width=canvas.height=360;canvas.setAttribute('aria-label','Crop preview for photo '+(index+1));row.canvas=canvas;box.append(canvas);
  row.output=document.createElement('p');box.append(row.output);row.inputs={};
  for(const [key,title,min,max,step] of [['zoom','Zoom',1,3,.01],['x','Horizontal position',0,100,1],['y','Vertical position',0,100,1]]){
   const l=document.createElement('label');l.textContent=title;const input=document.createElement('input');input.type='range';input.min=min;input.max=max;input.step=step;input.value=row[key];input.setAttribute('aria-label',title+' for photo '+(index+1));input.oninput=()=>{row[key]=Number(input.value);changed(row);};row.inputs[key]=input;l.append(input);box.append(l);
  }
  const reset=document.createElement('button');reset.textContent='Restore submitted crop';reset.onclick=()=>{Object.assign(row,job.originalCrop??{x:job.x,y:job.y,zoom:job.zoom??1});for(const key of ['x','y','zoom'])row.inputs[key].value=row[key];changed(row);};box.append(reset);
  $('crop-grid').append(box);draw(row);return row;
 }
 $('crop-open').onclick=()=>run(async()=>{
  if(active())return;
  const r=await api({action:'queue',status:'pending'}),jobs=r.jobs.filter(j=>!j.letter_batch_id&&!j.print_run_id);
  if(!jobs.length)throw Error('No pending photos to edit.');
  edits=[];dirty=false;$('crop-grid').replaceChildren();$('crop-status').textContent='Loading photo previews…';sync();
  try{
   // Load sequentially so a large order does not exhaust mobile memory/network connections.
   for(const j of jobs){const im=await loadImage(isDemo()?sampleImage():(await api({action:'image',id:j.id})).url);if(state().closed)return;edits.push(card(j,im,edits.length));}
   $('crop-status').textContent=jobs.length+' pending photos ready. '+(jobs.length===100?'Showing the oldest 100 pending photos.':'');
  }catch(e){edits=null;$('crop-grid').replaceChildren();throw e;}
 });
 $('crop-select-all').onclick=()=>{edits?.forEach(r=>{r.checked=true;r.check.checked=true;});};
 $('crop-select-none').onclick=()=>{edits?.forEach(r=>{r.checked=false;r.check.checked=false;});};
 $('crop-apply').onclick=()=>run(async()=>{
  const values=Object.fromEntries(['x','y','zoom'].map(k=>[k,Number($('crop-shared-'+k).value)]));
  if(['x','y','zoom'].some(k=>$('crop-shared-'+k).value.trim()==='')||!Number.isFinite(values.zoom)||values.zoom<1||values.zoom>3||![values.x,values.y].every(v=>Number.isFinite(v)&&v>=0&&v<=100))throw Error('Use zoom 1–3 and positions 0–100.');
  const rows=edits?.filter(r=>r.checked)??[];if(!rows.length)throw Error('Select at least one photo.');
  for(const r of rows){Object.assign(r,values);for(const k of ['x','y','zoom'])r.inputs[k].value=r[k];changed(r);}
  $('crop-status').textContent='Applied to '+rows.length+' photos. Review the previews, then save.';
 });
 $('crop-save').onclick=()=>run(async()=>{
  const rows=edits?.filter(r=>r.changed)??[];if(!rows.length)return;
  await api({action:'crop-save',items:rows.map(({id,version,x,y,zoom})=>({id,version,x,y,zoom}))});
  rows.forEach(r=>{r.version++;r.changed=false;});dirty=false;$('crop-status').textContent='All crop changes saved. Ready to prepare sheets.';notice('Print crops saved.');
 });
 $('crop-close').onclick=()=>run(async()=>{if(dirty&&!confirm('Discard unsaved crop adjustments?'))return;edits=null;dirty=false;$('crop-grid').replaceChildren();await refresh();});
 async function render(){
  ready=false;clearSheets();clean();
  const pages=printPages(printRun.jobs),ds=printRun.profile==='8x12';
  if(printRun.jobs.some(j=>normalizeTemplate(j.template).enabled)&&!(await document.fonts.load('12px "Brown Carolina"')).length)throw Error('The print font did not load. Retry preparing this run.');
  for(let n=0;n<pages.length;n++){
   if(state().closed)return;
   $('run-status').textContent=`Preparing sheet ${n+1} of ${pages.length}…`;
   const page=pages[n],templates=page.map(j=>normalizeTemplate(j.template));
   const slots=(ds?ds820Layout:letterLayout)(templates.map(t=>t.enabled?t.cutInches:t.photoCutInches));
   const canvas=document.createElement('canvas');canvas.width=ds?2400:2550;canvas.height=ds?3600:3300;const ctx=canvas.getContext('2d');ctx.fillStyle='white';ctx.fillRect(0,0,canvas.width,canvas.height);
   for(let i=0;i<page.length;i++){
    const j=page[i],im=await loadImage(isDemo()?sampleImage():(await api({action:'image',id:j.id})).url);
    drawMagnet(ctx,im,cropRect(im.naturalWidth,im.naturalHeight,j.x,j.y,j.zoom??1),slots[i],templates[i],{name:eventName(),photo:j.id.slice(0,8)});
   }
   drawVerticalCutGuides(ctx,slots);
   const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));if(!blob)throw Error('Could not prepare sheet.');
   const url=URL.createObjectURL(blob);urls.push(url);await loadImage(url);
   const img=document.createElement('img');img.src=url;img.alt='Sheet '+(n+1)+' of '+pages.length;$('sheets').append(img);
   const link=document.createElement('a');link.href=url;link.download=`AE-${printRun.id}-sheet-${n+1}.png`;link.textContent='Download sheet '+(n+1);$('downloads').append(link);
  }
  $('sheets').classList.add(ds?'ds820-sheets':'letter-sheets');$('sheet-controls').hidden=false;
  ready=true;$('run-status').textContent=`${pages.length} sheets ready for ${printRun.jobs.reduce((n,j)=>n+j.quantity,0)} magnets. Open one print dialog and print all pages, copies 1, at actual size. If only some pages print, keep this run and retry just the missing page numbers in the print dialog.`;
 }
 async function poll(){
  if(edits)return true;
  const {run:current}=await api({action:'print-run',operation:'status'});
  if(printRun&&current?.id!==printRun.id){clearSheets();clean();printRun=null;ready=false;notice('The print run changed in another window.');}
  if(current&&!printRun){printRun=current;ready=false;$('run-status').textContent='A multi-sheet run is reserved. Check the printer before opening its print dialog. It will not print again automatically.';}
  return Boolean(printRun);
 }
 $('run-start').onclick=()=>run(async()=>{
  if(active())return;
  request??=crypto.randomUUID();
  const r=await api({action:'print-run',operation:'claim',requestId:request,profile:$('batch-format').value});request=null;
  if(!r.run){notice('No pending photos to print.');return;}if(r.run.status!=='active')throw Error('This run is already finished. Refresh the queue.');
  printRun=r.run;await render();notice('All sheets are prepared. Review them, then open the print dialog.');
 });
 async function print(){
  if(!printRun)return;
  await api({action:'print-run',operation:'authorize',requestId:printRun.id});
  if(!ready)await render();
  if(!state().closed&&ready){requestPrint();$('print-result').hidden=false;}
 }
 async function finish(operation){
  if(!printRun)return;
  if(!confirm(operation==='printed'?'Have ALL sheets in this run physically printed correctly?':'Cancel any queued output first. Returning the whole run to pending can duplicate pages that already printed. Continue?'))return;
  await api({action:'print-run',operation,requestId:printRun.id});printRun=null;ready=false;clearSheets();clean();$('run-status').textContent=operation==='printed'?'All sheets confirmed printed.':'Run returned to pending.';await refresh();
 }
 $('run-print').onclick=()=>run(print);$('run-done').onclick=()=>run(()=>finish('printed'));$('run-release').onclick=()=>run(()=>finish('release'));
 window.addEventListener('beforeunload',e=>{if(dirty){e.preventDefault();e.returnValue='';}});
 return {sync,poll,active,hasRun:()=>Boolean(printRun),print,finish,dispose:()=>{edits=null;printRun=null;clean();$('crop-grid').replaceChildren();}};
}
