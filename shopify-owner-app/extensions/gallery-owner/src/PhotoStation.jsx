/** @jsxRuntime classic */
/** @jsx h */
import {h} from 'preact';
import {MagnetTemplate} from './MagnetTemplate.jsx';
import {useEffect,useRef,useState} from 'preact/hooks';

export function PhotoStation({event,call,run,busy}){
 const [state,setState]=useState(null),[error,setError]=useState(''),[links,setLinks]=useState([]);
 const api=useRef(call);api.current=call;
 const route='owner/station/'+event.id;
 useEffect(()=>{
  let alive=true;
  let cancelTimer=()=>{};
  setState(null);setLinks([]);setError('');
  async function refresh(){
   try{const next=await api.current(route);if(alive){setState(next);setError('');}}
   catch(e){if(alive)setError(e instanceof Error?e.message:'Could not refresh photo station.');}
   finally{if(alive){const timer=setTimeout(refresh,5000);cancelTimer=()=>clearTimeout(timer);}}
  }
  refresh();return()=>{alive=false;cancelTimer();};
 },[event.id]);
 async function create(purpose){const result=await call(route,{action:'create',purpose});setLinks(current=>[...current,{...result,purpose}]);setState(await call(route));}
 return <s-section heading="Photo station & live print queue">
  <s-paragraph>Pair a tablet to this event for guest capture. Accepted photos arrive in the gallery and print queue automatically. Open the print desk on your printer-connected computer to review crops and prepare sheets.</s-paragraph>
  <s-paragraph>Station links last 12 hours. Share the capture link only with your station device; keep the print link private. Use iPad Guided Access to keep guests in the capture screen.</s-paragraph>
  {error&&<s-banner tone="warning">{error}</s-banner>}
  <s-stack direction="inline" gap="base">
   <s-button disabled={busy} onClick={()=>run(()=>create('capture'))}>Create tablet capture link</s-button>
   <s-button disabled={busy} onClick={()=>run(()=>create('print'))}>Open event print desk</s-button>
  </s-stack>
  {links.map(link=><s-box key={link.id} padding="base" background="subdued">
   <s-paragraph>{link.purpose==='capture'?'Open this private link on the tablet.':'Open this private link on the printing computer.'} Expires {new Date(link.expiresAt).toLocaleString()}.</s-paragraph>
   <s-link href={link.url} target="_blank">{link.purpose==='capture'?'Open capture screen':'Open print desk'}</s-link>
   <s-text-field label={link.purpose==='capture'?'Private capture link — copy the complete link':'Private print link — copy the complete link'} value={link.url} readOnly />
  </s-box>)}
  {state&&<MagnetTemplate key={event.id} initial={state.template} eventName={event.name} call={call} route={route} run={run} busy={busy} />}
  {state&&<s-stack gap="base">
   <s-paragraph>{state.jobs.filter(j=>j.status==='pending').length} pending | {state.jobs.filter(j=>j.status==='printing').length} awaiting print confirmation | {state.jobs.filter(j=>j.status==='held').length} held{state.jobs.length===100?' (oldest 100 outstanding jobs)':''}. Refreshes every 5 seconds.</s-paragraph>
   {state.jobs.slice(0,8).map(j=><s-paragraph key={j.id}>Photo {j.id.slice(0,8)} · {j.status} · {new Date(j.created_at).toLocaleTimeString()}</s-paragraph>)}
   {state.stations.map(s=><s-stack key={s.id} direction="inline" gap="base"><s-paragraph>{s.purpose==='capture'?'Tablet capture':'Print desk'} · expires {new Date(s.expires_at).toLocaleTimeString()}</s-paragraph><s-button disabled={busy} onClick={()=>run(async()=>{await call(route,{action:'revoke',id:s.id});setLinks(current=>current.filter(link=>link.id!==s.id));setState(await call(route));})}>Revoke link</s-button></s-stack>)}
  </s-stack>}
 </s-section>;
}
