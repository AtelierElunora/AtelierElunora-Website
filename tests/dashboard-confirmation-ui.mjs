import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {Window} from 'happy-dom';
const w=new Window({url:'http://127.0.0.1:4174/?demo=1&simulation=1'});
w.document.body.innerHTML='<div id="atelier-owner-studio"></div>';w.structuredClone=structuredClone;
let confirmed=false;
const sheet={id:'sheet',sheet_index:0,state:'awaiting_confirmation',spooler_job:'TEST-7',items:[{id:'photo'}]};
w.fetch=async(url,options)=>{
 assert.equal(url,'/simulation');const b=JSON.parse(options.body);
 if(b.action==='confirm-sheet'){assert.equal(b.sheetId,'sheet');assert.equal(b.spoolerJob,'TEST-7');assert.equal(b.confirm,true);confirmed=true;sheet.state='operator';}
 else assert.equal(b.action,'status');
 return {ok:true,json:()=>({helpers:[{id:'helper',paired:true,mode:'running',heartbeat_at:new Date().toISOString(),printer:{printer:'HP'},partial_seconds:120}],runs:[{id:'run',helper_id:'helper',state:confirmed?'completed':'active',gallery_helper_sheets:[sheet]}],waiting:{jobs:0,copies:0,uniquePhotos:0}})};
};
w.eval(await readFile(new URL('../theme/assets/atelier-owner-studio.js',import.meta.url),'utf8'));
const button=t=>[...w.document.querySelectorAll('button')].find(b=>b.textContent.trim()===t);
const until=async fn=>{for(let n=0;n<100;n++){if(fn())return;await new Promise(r=>setTimeout(r,40));}assert.fail('UI did not settle');};
await until(()=>button('Events'));button('Events').click();await until(()=>w.document.querySelector('.event-card button'));w.document.querySelector('.event-card button').click();await until(()=>button('Print desk'));button('Print desk').click();await until(()=>button('Printed successfully—continue'));
button('Printed successfully—continue').click();await until(()=>confirmed&&!button('Printed successfully—continue'));
assert.match(w.document.body.textContent,/Operator confirmed/);
await w.happyDOM.abort();console.log('PASS: dashboard confirms the exact sheet receipt and updates its completion history.');
