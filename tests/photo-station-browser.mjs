import {Window} from 'happy-dom';
import {readFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';
const root=fileURLToPath(new URL('../',import.meta.url));
const html=(await readFile(root+'theme/templates/page.photo-station.liquid','utf8')).replace(/{%.*?%}/g,'').replace(/<script[\s\S]*?<\/script>/g,'');
const script=(await build({entryPoints:[root+'theme/assets/atelier-station.js'],bundle:true,format:'iife',write:false})).outputFiles[0].text;
const settle=()=>new Promise(r=>setTimeout(r,20));
function windowFor(purpose){const w=new Window({url:'https://www.atelierelunora.com/pages/photo-station#'+purpose+'='+'a'.repeat(64)});w.document.write(html);Object.defineProperty(w.document,'fonts',{value:{load:async()=>[{}]}});w.HTMLCanvasElement.prototype.getContext=()=>({drawImage(){},fillRect(){},fillText(){},clearRect(){},save(){},restore(){},translate(){},rotate(){},setLineDash(){},strokeRect(){}});w.HTMLCanvasElement.prototype.toDataURL=()=> 'data:image/jpeg;base64,/9j/AAAA';return w;}
const w=windowFor('capture');let attempts=[],failure=true;
Object.defineProperty(w.navigator,'mediaDevices',{value:{getUserMedia:async()=>({getTracks:()=>[{stop(){}}]})}});
const video=w.document.getElementById('camera');Object.defineProperties(video,{videoWidth:{value:1200},videoHeight:{value:900},readyState:{value:4}});video.play=async()=>{};
w.fetch=async(_,options)=>{const b=JSON.parse(options.body);if(b.action==='info')return {ok:true,json:async()=>({name:'Test event'})};attempts.push(b);if(failure){failure=false;throw new TypeError('offline');}return {ok:true,json:async()=>({received:true})};};
w.eval(script);await settle();assert.equal(w.document.getElementById('capture').hidden,false);assert.equal(w.location.hash,'');
w.document.getElementById('start').click();await settle();w.document.getElementById('take').click();await settle();assert.equal(w.document.getElementById('review').hidden,false);assert.equal(attempts.length,0);
w.document.getElementById('accept').click();await settle();assert.equal(w.document.getElementById('accept').textContent,'Retry this photo');assert.equal(w.document.getElementById('retake').disabled,true);
w.document.getElementById('accept').click();await settle();assert.equal(attempts[0].requestId,attempts[1].requestId);assert.equal(attempts[0].jpeg,attempts[1].jpeg);assert.equal(w.document.getElementById('review').hidden,true);assert.equal(w.document.getElementById('review').hasAttribute('src'),false);assert.match(w.document.getElementById('notice').textContent,/received/);w.happyDOM.abort();
const p=windowFor('print');let state={id:'11111111-1111-4111-8111-111111111111',status:'pending',version:1,quantity:3,x:50,y:50,created_at:new Date().toISOString()},updates=[],prints=0,draws=[],claimZoom,claimTemplate;
p.HTMLCanvasElement.prototype.getContext=()=>({drawImage(...args){draws.push(args);},fillRect(){},fillText(){},clearRect(){},save(){},restore(){},translate(){},rotate(){},setLineDash(){},strokeRect(){}});
p.Image=class{naturalWidth=1200;naturalHeight=900;set src(v){queueMicrotask(()=>this.onload());}};p.print=()=>prints++;p.confirm=()=>true;
p.fetch=async(_,options)=>{const b=JSON.parse(options.body);let data;if(b.action==='info')data={name:'Print test'};if(b.action==='template')data={template:{enabled:true}};if(b.action==='queue')data={jobs:state.status===b.status?[state]:[]};if(b.action==='image')data={url:'https://example.test/photo.jpg'};if(b.action==='update'){updates.push(b.operation);if(b.operation==='claim'){claimZoom=b.zoom;claimTemplate=b.template;}state={...state,version:state.version+1,status:b.operation==='claim'?'printing':'printed'};data={job:state};}return {ok:true,json:async()=>data};};
p.eval(script);await settle();p.document.querySelector('#jobs button').click();await settle();assert.equal(p.document.getElementById('editor').hidden,false);
p.document.getElementById('zoom').value=2;p.document.getElementById('zoom').dispatchEvent(new p.Event('input'));
assert.equal(draws.at(-1)[3],450);assert.equal(p.document.getElementById('zoom-value').textContent,'2.00×');
p.document.getElementById('reset-crop').click();assert.equal(p.document.getElementById('zoom').value,'1');
p.document.getElementById('zoom').value=2;p.document.getElementById('zoom').dispatchEvent(new p.Event('input'));
assert.equal(p.document.getElementById('template-inset').value,'0.255');p.document.getElementById('template-inset').value='0.2';
p.document.getElementById('template-background-hex').value='#123456';p.document.getElementById('template-background-hex').dispatchEvent(new p.Event('input'));assert.equal(p.document.getElementById('template-background').value,'#123456');
p.document.getElementById('prepare').click();await settle();assert.equal(p.document.querySelectorAll('#sheets img').length,3);assert.deepEqual(updates,['claim']);assert.equal(claimZoom,2);assert.equal(claimTemplate.background,'#123456');assert.equal(claimTemplate.edgeInset,0.175);assert.equal(draws.at(-1)[3],450);
p.document.getElementById('print').click();assert.equal(prints,1);assert.deepEqual(updates,['claim']);p.document.getElementById('printed').click();await settle();assert.deepEqual(updates,['claim','printed']);assert.equal(p.document.querySelectorAll('#sheets img').length,0);p.happyDOM.abort();
console.log('PASS: simulated browser capture, approval, failed upload retry with same ID, reset/privacy, queue loading, 3-copy/3-sheet rendering, claim before print and explicit physical-print confirmation.');
// Full sheets trigger one print request; recovery and polling never reprint them.
const l=windowFor('print');let jobs=Array.from({length:5},(_,i)=>({id:'00000000-0000-4000-8000-'+String(i+10).padStart(12,'0'),status:'pending',version:1,quantity:1,x:50,y:50,zoom:1,created_at:new Date().toISOString()})),active=null,letterPrints=0,claims=0;
l.Image=class{naturalWidth=1200;naturalHeight=900;set src(v){queueMicrotask(()=>this.onload());}};l.print=()=>letterPrints++;l.confirm=()=>true;
const fetchLetter=async(_,options)=>{const b=JSON.parse(options.body);let data;
 if(b.action==='info')data={name:'Letter event'};
 if(b.action==='template')data={template:{enabled:true,cutInches:3.6,background:'#123456'}};
 if(b.action==='queue')data={jobs:jobs.filter(j=>j.status===b.status)};
 if(b.action==='batch-status')data={batch:active};
 if(b.action==='image')data={url:'https://example.test/photo.jpg'};
 if(b.action==='batch-claim'){claims++;const eligible=jobs.filter(j=>j.status==='pending').slice(0,6);if(active)data={...active,created:false};else if(eligible.length<6&&!b.partial)data={waiting:true,count:eligible.length};else{eligible.forEach((j,i)=>Object.assign(j,{status:'printing',letter_batch_id:b.requestId,letter_slot:i,template:{enabled:true,cutInches:3.6,background:'#123456'}}));active={id:b.requestId,jobs:eligible};data={...active,created:true};}}
 if(b.action==='batch-finish'){active.jobs.forEach(j=>j.status=b.operation==='printed'?'printed':'pending');data={updated:active.jobs.length};active=null;}
 return {ok:true,json:async()=>data};};
l.fetch=fetchLetter;l.eval(script);await settle();l.document.getElementById('letter-toggle').click();await settle();assert.equal(letterPrints,0);assert.match(l.document.getElementById('letter-status').textContent,/5 of 6/);
jobs.push({...jobs[0],id:'00000000-0000-4000-8000-000000000099'});l.document.getElementById('refresh').click();await settle();assert.equal(letterPrints,1);assert.equal(l.document.querySelectorAll('#sheets.letter-sheets img').length,1);
l.document.getElementById('refresh').click();await settle();assert.equal(letterPrints,1);
const recovery=windowFor('print');recovery.fetch=fetchLetter;recovery.print=()=>letterPrints++;recovery.confirm=()=>true;recovery.eval(script);await settle();assert.match(recovery.document.getElementById('letter-status').textContent,/already reserved/);assert.equal(letterPrints,1);assert.equal(recovery.document.getElementById('letter-confirm').disabled,false);recovery.happyDOM.abort();
for(let i=0;i<6;i++)jobs.push({...jobs[0],id:'00000000-0000-4000-8000-'+String(i+200).padStart(12,'0'),status:'pending',letter_batch_id:null});
l.document.getElementById('refresh').click();await settle();assert.equal(letterPrints,1);
l.document.getElementById('letter-confirm').click();await settle();assert.equal(letterPrints,2);assert.equal(jobs.filter(j=>j.status==='printed').length,6);
l.document.getElementById('letter-release').click();await settle();assert.equal(l.document.querySelectorAll('#sheets img').length,0);assert.equal(l.document.getElementById('letter-toggle').textContent,'Start automatic six-photo sheets');l.happyDOM.abort();
console.log('PASS: five-photo wait, sixth-photo automatic print, no repeat on polling/recovery, next batch after confirmation and cancellation pauses queue.');
// A rendering failure reserves the sheet but pauses automation without printing.
const broken=windowFor('print');let brokenPrints=0;broken.fetch=fetchLetter;broken.confirm=()=>true;broken.print=()=>brokenPrints++;broken.Image=class{set src(v){queueMicrotask(()=>this.onerror());}};
broken.eval(script);await settle();broken.document.getElementById('letter-toggle').click();await settle();assert.equal(brokenPrints,0);assert.ok(active);assert.match(broken.document.getElementById('letter-status').textContent,/paused/);assert.equal(broken.document.querySelectorAll('#sheets img').length,0);broken.happyDOM.abort();
active=null;jobs=jobs.filter(j=>j.status==='pending'||j.status==='printing').slice(0,2).map(j=>({...j,status:'pending',letter_batch_id:null}));
const partialWindow=windowFor('print');let partialPrints=0;partialWindow.fetch=fetchLetter;partialWindow.confirm=()=>true;partialWindow.print=()=>partialPrints++;partialWindow.Image=l.Image;partialWindow.eval(script);await settle();partialWindow.document.getElementById('letter-partial').click();await settle();assert.equal(partialPrints,1);assert.equal(active.jobs.length,2);partialWindow.happyDOM.abort();
console.log('PASS: image-load failure leaves a recoverable reservation and pauses automation; explicit partial-sheet printing works.');
