import assert from 'node:assert/strict';
import {createHash,randomUUID} from 'node:crypto';
import {mkdtemp,rm,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {Journal} from '../print-helper/engine.mjs';
import {tickAutomatic,simulatedAdapter} from '../print-helper/automatic-engine.mjs';
const bytes=Buffer.from('immutable simulated sheet'),sha256=createHash('sha256').update(bytes).digest('hex');
const root=await mkdtemp(join(tmpdir(),'atelier-auto-test-'));
try{
 const make=async({count=3,adapter=simulatedAdapter()}={})=>{
  const journal=new Journal(join(root,randomUUID()));let claimCount=0,mode='running',failReport=false;const reports=[];
  const runId=randomUUID(),fence=randomUUID(),sheets=Array.from({length:count},(_,sheet_index)=>({id:randomUUID(),sheet_index,items:[]}));
  const api=async b=>{if(b.action==='claim'){claimCount++;return {runId,fence,profile:{},sheets:structuredClone(sheets)};}if(b.action==='heartbeat')return {mode};if(b.action==='submit')return {authorized:true};if(b.action==='report'){if(failReport)throw Error('network offline');reports.push(b);}return {};};
  const deps={journal,api,adapter,prepare:async()=>({file:'simulated.pdf',sha256}),read:async()=>bytes};
  return {deps,journal,reports,adapter,pause:()=>mode='paused',offline:v=>failReport=v,get claims(){return claimCount;}};
 };
 const full=await make();for(let i=0;i<4;i++)await tickAutomatic(full.deps);assert.equal(full.adapter.submissions,3);assert.equal(await full.journal.read(),null);assert.equal(full.reports.filter(r=>r.state==='completed').length,3);
 const lost=await make({count:1,adapter:simulatedAdapter({loseAcknowledgement:true})});await assert.rejects(tickAutomatic(lost.deps),/lost submission/);assert.equal((await lost.journal.read()).sheets[0].localState,'submitting');await assert.rejects(tickAutomatic(lost.deps),/uncertain/);assert.equal(lost.adapter.submissions,1);
 const cancel=await make({count:1,adapter:simulatedAdapter({states:[7]})});await assert.rejects(tickAutomatic(cancel.deps),/canceled/);await assert.rejects(tickAutomatic(cancel.deps),/attention/);assert.equal(cancel.adapter.submissions,1);
 const offline=await make({count:1});offline.offline(true);await assert.rejects(tickAutomatic(offline.deps),/offline/);assert.equal((await offline.journal.read()).sheets[0].localState,'submitted');offline.offline(false);await tickAutomatic(offline.deps);assert.equal(offline.adapter.submissions,1);
 const pause=await make({count:1});pause.pause();assert.equal((await tickAutomatic(pause.deps)).state,'paused');assert.equal(pause.adapter.submissions,0);
 const corrupt=await make({count:1});await assert.rejects(tickAutomatic({...corrupt.deps,read:async()=>Buffer.from('corrupt')}),/changed/);assert.equal(corrupt.adapter.submissions,0);
 const missing=await make();await assert.rejects(tickAutomatic({...missing.deps,api:async()=>({recovery:true})}),/no local journal/);assert.equal(missing.adapter.submissions,0);
 const acknowledged=await make({count:1});let threw=false;const original=acknowledged.deps.api;acknowledged.deps.api=async b=>{if(b.state==='completed'&&!threw){threw=true;throw Error('lost final acknowledgement');}return original(b);};await assert.rejects(tickAutomatic(acknowledged.deps),/lost final/);assert.equal((await acknowledged.journal.read()).sheets[0].localState,'computer-completed');await tickAutomatic(acknowledged.deps);assert.equal(acknowledged.adapter.submissions,1);
 console.log('PASS: three sheets without operator confirmation; durable pre/post submission crash barriers, exact job completion, cancellation, network recovery without duplicate prints, pause, corrupt artifact, missing journal, final-ack retry.');
}finally{await rm(root,{recursive:true,force:true});}
