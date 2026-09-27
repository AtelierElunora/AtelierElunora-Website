// Local sample queue only. Uses the same durable worker as the native helper.
import {randomUUID,createHash} from 'node:crypto';
import {mkdtemp} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {Journal} from './engine.mjs';
import {tickAutomatic} from './automatic-engine.mjs';
export async function createSimulation({now=Date.now}={}){
 const journal=new Journal(await mkdtemp(join(tmpdir(),'atelier-print-demo-'))),runs=[],pending=[];
 const helper={id:randomUUID(),paired:false,mode:'paused',partial_seconds:120,printer:{adapter:'simulation',printer:'Simulated printer · provisional six-slot sheet'},attention:null};
 let pairing=null;
 let busy=false,nextFault=false,counter=0;
 const bytes=Buffer.from('Sample sheet — no customer photos or physical printing');
 function add(n){for(let i=0;i<n;i++)pending.push({id:randomUUID(),quantity:1,created_at:Date.now()});}add(13);
 const api=async b=>{
  const r=runs.find(r=>r.id===b.runId);
  if(b.action==='heartbeat')return {mode:helper.mode,attention:helper.attention,runState:r?.state};
  if(b.action==='claim'){
   if(!helper.paired||!['running','ending'].includes(helper.mode)||!pending.length)return {waiting:true};
   if(pending.length<6&&!helper.flush&&helper.mode!=='ending'&&(!helper.partial_seconds||Date.now()-pending[0].created_at<helper.partial_seconds*1000))return {waiting:true};
   const items=pending.splice(0,200),sheets=[];for(let i=0;i<items.length;i+=6)sheets.push({id:randomUUID(),sheet_index:i/6,items:items.slice(i,i+6),state:'preparing'});
   const run={id:randomUUID(),helper_id:helper.id,state:'active',fence:randomUUID(),allowPartial:helper.flush||helper.mode==='ending',gallery_helper_sheets:sheets};helper.flush=false;runs.unshift(run);
   return {runId:run.id,fence:run.fence,profile:{adapter:'simulation'},sheets:structuredClone(sheets)};
  }
  const s=r?.gallery_helper_sheets.find(s=>s.id===b.sheetId);
  if(b.action==='submit'){
   if(s.items.length<6&&!r.allowPartial&&!helper.flush&&helper.mode!=='ending'&&(!helper.partial_seconds||Date.now()-s.items[0].created_at<helper.partial_seconds*1000))return {authorized:false};
   s.state='submitting';return {authorized:true};
  }
  if(b.action==='report'){s.state=b.state;s.spooler_job=b.spoolerJob;if(r.gallery_helper_sheets.every(s=>s.state==='completed')){r.state='completed';if(helper.mode==='ending')helper.mode='ended';}return {saved:true};}
  return {};
 };
 const adapter={async submit(){counter++;if(nextFault){nextFault=false;throw Error('Simulated lost printer acknowledgement. Inspect and resolve manually.');}return 'SIMULATED-'+counter;},async status(){return 9;}};
 const timer=setInterval(async()=>{if(busy)return;busy=true;try{await tickAutomatic({journal,api,adapter,prepare:async()=>({file:'sample-only',sha256:createHash('sha256').update(bytes).digest('hex')}),read:async()=>bytes});}catch(e){helper.mode='paused';helper.attention=e.message;}finally{busy=false;}},1000);timer.unref();
 return async b=>{
  if(b.action==='pair'){
   if(busy||runs.some(r=>r.state==='active'))throw Error('Resolve the current run before pairing again.');
   pairing={code:randomUUID().replaceAll('-',''),expires:now()+300000};helper.paired=false;helper.mode='paused';
   return {helperId:helper.id,code:pairing.code,expiresAt:new Date(pairing.expires).toISOString()};
  }
  if(b.action==='connect'){
   if(!pairing||pairing.expires<=now()||b.code!==pairing.code)throw Error('Pairing code expired, incorrect, or already used. Generate a new code.');
   pairing=null;helper.paired=true;helper.mode='paused';return {paired:true};
  }
  if(b.action==='status')return {helpers:[{...helper,heartbeat_at:helper.paired?new Date().toISOString():null}],runs,waiting:{jobs:pending.length,copies:pending.length,uniquePhotos:pending.length}};
  if(b.action==='add')add(b.count===1?1:6);
  else if(b.action==='fault-next')nextFault=true;
  else if(b.action==='start'){if(!helper.paired)throw Error('Pair the helper first.');if(helper.attention)throw Error('Resolve the uncertain run first.');helper.mode='running';}
  else if(b.action==='pause')helper.mode='paused';
  else if(b.action==='flush')helper.flush=true;
  else if(b.action==='end'){if(!helper.paired)throw Error('Pair the helper first.');helper.mode='ending';helper.flush=true;}
  else if(b.action==='settings')helper.partial_seconds=b.partialSeconds;
  else if(b.action==='resolve'){
   const r=runs.find(r=>r.id===b.runId);if(!r||busy)throw Error('Wait for the current simulation step.');
   if(b.outcome==='release'&&r.gallery_helper_sheets.some(s=>s.state!=='preparing'))throw Error('A submission may have occurred; verify completion instead.');
   r.state=b.outcome==='release'?'released':'operator';for(const s of r.gallery_helper_sheets){if(s.state!=='completed')s.state=r.state;if(r.state==='released')pending.push(...s.items);}helper.attention=null;helper.mode='paused';
  }else if(b.action==='reprint'){const s=runs.flatMap(r=>r.gallery_helper_sheets).find(s=>s.id===b.sheetId);add(s.items.filter(i=>b.jobIds.includes(i.id)).length);}
  else if(b.action==='revoke'){helper.mode='ended';helper.paired=false;pairing=null;}
  return {saved:true};
 };
}
