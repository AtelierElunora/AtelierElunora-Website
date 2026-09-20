// Only fixed route labels and verified identities enter the log. Never log request bodies.
export function activityFor(request,parts) {
 if(request.method!=='POST'||parts[0]!=='owner')return null;
 if(parts[1]==='events'&&parts.length===2)return {action:'event.create',event_id:null};
 if(parts[1]!=='events'||!/^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i.test(parts[2]||''))return null;
 if(parts.length===3)return {action:'event.update',event_id:parts[2]};
 if(parts.length!==4)return null;
 const actions={'access':'invitation.save','grants':'grant.update','remove-access':'guest.remove_all_access','permanent-delete':'event.permanent_delete'};
 return actions[parts[3]]?{action:actions[parts[3]],event_id:parts[2]}:null;
}
export async function auditedOwnerAction({service,actor,activity,run,reply,id=crypto.randomUUID()}) {
 const base={source:'backend',operation_id:id,actor_user_id:actor,event_id:activity.event_id,action:activity.action};
 async function write(outcome,details={}) {
  try { const r=await service.from('gallery_activity_log').insert({...base,outcome,details});return !r.error; }
  catch {return false;}
 }
 // Refuse to start a sensitive action if a durable attempt cannot be recorded.
 if(!await write('started'))return reply({error:'Activity logging is temporarily unavailable. No action was started. Please retry.'},503);
 let response;
 try {response=await run();}
 catch(error) {
  if(!await write('failed',{reason:'handler_exception'}))console.error('Gallery activity outcome unavailable',id);
  throw error;
 }
 let outcome=response.ok?'succeeded':response.status>=500?'failed':'rejected';
 if(response.ok&&activity.action==='event.permanent_delete') {
  try {if((await response.clone().json()).deleted!==true)outcome='incomplete';}
  catch {outcome='incomplete';}
 }
 // A committed action must not be reported as failed just because its follow-up log failed.
 // The durable started record and transactional database records remain available.
 if(!await write(outcome,{http_status:response.status}))console.error('Gallery activity outcome unavailable',id);
 return response;
}
