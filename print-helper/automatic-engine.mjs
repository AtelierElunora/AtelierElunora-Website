import {createHash,randomUUID} from 'node:crypto';
import {readFile} from 'node:fs/promises';
// Pairing must reconcile a server-resolved run without submitting or retrying a sheet.
export async function reconcileBeforePairing(journal,check){
 const run=await journal.read();if(!run)return {cleared:false};
 const remote=await check(run.runId);
 if(!['operator','released','completed'].includes(remote.runState))throw Error('Resolve the active run in the owner dashboard before pairing a different event.');
 await journal.archive({...run,reconciledAs:remote.runState,finishedAt:new Date().toISOString()});
 return {cleared:true};
}
// A durable submitting state is an uncertainty barrier, never an automatic retry.
export async function tickAutomatic({journal,api,adapter,prepare,read=readFile,dashboardConfirmation=false}){
 let run=await journal.read();
 const save=async()=>journal.write(run);
 if(run){const remote=await api({action:'heartbeat',runId:run.runId});if(['operator','released','completed'].includes(remote.runState)){await journal.archive({...run,reconciledAs:remote.runState,finishedAt:new Date().toISOString()});return {state:'reconciled'};}for(const sheet of run.sheets){if(sheet.localState==='awaiting-confirmation'&&remote.confirmedSheets?.includes(sheet.id)){sheet.localState='recorded';sheet.completionSource='operator';await save();}}}
 if(!run){const claim=await api({action:'claim',requestId:randomUUID()});if(claim.waiting)return {state:'waiting'};if(claim.recovery)throw Error('Reserved run has no local journal. Resolve it in the owner dashboard.');run={...claim,id:claim.runId,createdAt:new Date().toISOString()};await save();}
 const sheet=run.sheets.find(s=>s.localState!=='recorded');
 if(!sheet){await journal.archive({...run,finishedAt:new Date().toISOString()});return {state:'recorded'};}
 const context={runId:run.runId,fence:run.fence,sheetId:sheet.id};
 if(!sheet.localState){const artifact=await prepare(sheet,run);Object.assign(sheet,artifact,{attemptId:randomUUID(),localState:'prepared'});await save();}
 if(sheet.localState==='prepared'){
  const heartbeat=await api({action:'heartbeat'});if(!['running','ending'].includes(heartbeat.mode)||heartbeat.attention)return {state:'paused'};
  await api({action:'renew',...context});
  const bytes=await read(sheet.file);if(createHash('sha256').update(bytes).digest('hex')!==sheet.sha256)throw Error('Prepared sheet changed. Inspect before printing.');
  await adapter.preflight?.();
  const permission=await api({action:'submit',...context,attemptId:sheet.attemptId,sha256:sheet.sha256});if(permission.authorized!==true)return {state:'waiting'};
  sheet.localState='submitting';await save();
  sheet.spoolerJob=await adapter.submit(sheet.file,sheet.attemptId);
  if(!/^[A-Za-z0-9_.-]+-[0-9]+$/.test(sheet.spoolerJob))throw Error('No exact spooler job ID. Inspect before continuing.');
  sheet.localState='submitted';await save();
 }
 if(sheet.localState==='submitting')throw Error('Submission outcome uncertain. Do not resend; inspect the computer’s printer queue and physical sheets.');
 if(sheet.localState==='attention')throw Error('Printer needs attention. Resolve the reserved run manually.');
 if(sheet.localState==='awaiting-confirmation')return {state:'awaiting-confirmation'};
 if(sheet.localState==='submitted'){
  await api({action:'report',...context,attemptId:sheet.attemptId,state:'submitted',spoolerJob:sheet.spoolerJob});
  let state;
  try{state=await adapter.status(sheet.spoolerJob);}catch(e){
   if(!dashboardConfirmation||e.code!=='SENT_NOT_CONFIRMED')throw e;
   await api({action:'report',...context,attemptId:sheet.attemptId,state:'awaiting_confirmation',spoolerJob:sheet.spoolerJob});
   sheet.localState='awaiting-confirmation';await save();return {state:'awaiting-confirmation'};
  }
  if(state?.recoverable){sheet.error=state.message||'Printer needs attention. Monitoring this same job; no new sheets will be sent.';await save();return {state:'printer-attention',spoolerJob:sheet.spoolerJob,message:sheet.error};}
  if(sheet.error){delete sheet.error;await save();}
  if(state===9){sheet.localState='computer-completed';await save();}
  else if(![3,5].includes(state)){sheet.localState='attention';sheet.error='Printer job failed, canceled, stopped, or cannot be verified.';await save();await api({action:'report',...context,attemptId:sheet.attemptId,state:'attention',error:sheet.error});throw Error(sheet.error);}
  else return {state:'submitted',spoolerJob:sheet.spoolerJob};
 }
 if(sheet.localState==='computer-completed'){
  await api({action:'report',...context,attemptId:sheet.attemptId,state:'completed',spoolerJob:sheet.spoolerJob});sheet.localState='recorded';await save();
 }
 return {state:sheet.localState};
}
export function simulatedAdapter({states=[9],loseAcknowledgement=false}={}){
 let submitted=0;return {format:'pdf',extension:'.pdf',get submissions(){return submitted;},async submit(){submitted++;if(loseAcknowledgement)throw Error('Simulated lost submission acknowledgment');return 'SIMULATED-'+submitted;},async status(){return states.length>1?states.shift():states[0];}};
}
