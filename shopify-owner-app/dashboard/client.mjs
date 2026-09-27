const API='https://gefdlubvqymyxrguhtnc.supabase.co/functions/v1/gallery-api/';
export function createOwnerClient({fetcher=fetch,onExpired=()=>{},onMfa=()=>{}}={}){
 let session=null,generation=0,refreshing=null;
 const setSession=value=>{generation++;session=value;refreshing=null;};
 async function call(path,body,override){
  const stamp=generation;let current=override===undefined?session:override;
  if(current&&current===session&&path!=='refresh'&&current.expires_at*1000<Date.now()+120000){
   refreshing??=call('refresh',{refresh_token:current.refresh_token},current).then(next=>{if(generation!==stamp)throw Error('Owner session changed.');session=next;return next;}).finally(()=>{if(stamp===generation)refreshing=null;});current=await refreshing;
  }
  const r=await fetcher(API+path,{method:body===undefined?'GET':'POST',headers:{'X-Elunora-Request':'1',...(current?{Authorization:'Bearer '+current.access_token}:{}),...(body===undefined?{}:{'Content-Type':'application/json'})},body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(120000)});
  const d=await r.json().catch(()=>({error:'Unexpected service response. Please retry.'}));
  if(stamp!==generation)throw Error('Owner session changed.');
  if(!r.ok){if(r.status===401&&current){setSession(null);onExpired();}if(r.status===403&&d.code==='MFA_REQUIRED')onMfa();throw Object.assign(Error(d.error||'Please retry.'),{status:r.status});}return d;
 }
 return {call,setSession,getSession:()=>session,async logout(){try{if(session)await call('logout',{refresh_token:session.refresh_token});}finally{setSession(null);}}};
}
