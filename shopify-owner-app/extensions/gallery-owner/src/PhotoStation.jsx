/** @jsxRuntime classic */
/** @jsx h */
import {h} from 'preact';
import {MagnetTemplate} from './MagnetTemplate.jsx';
import {useEffect,useRef,useState} from 'preact/hooks';

export function PhotoStation({event,call,run,busy}){
 const [state,setState]=useState(null),[error,setError]=useState(''),[links,setLinks]=useState([]);
 const api=useRef(call);api.current=call;
 const refreshNow=useRef(()=>{});
 const [refreshing,setRefreshing]=useState(false),[updatedAt,setUpdatedAt]=useState(null),[now,setNow]=useState(Date.now()),[filter,setFilter]=useState('all');
 const route='owner/station/'+event.id;
 const count=status=>state?.counts?.[status]??state?.jobs.filter(j=>j.status===status).length??0;
 const statusLabel={pending:'Queued',printing:'Awaiting print confirmation',held:'On hold',printed:'Printed'};
 useEffect(()=>{
  let alive=true;
  let cancelTimer=()=>{},inFlight=false;
  setState(null);setLinks([]);setError('');setUpdatedAt(null);setFilter('all');
  const clock=setInterval(()=>setNow(Date.now()),1000);
  async function refresh(){
   if(!alive||inFlight)return;
   cancelTimer();inFlight=true;setRefreshing(true);
   try{const next=await api.current(route);if(alive){setState(next);setError('');setUpdatedAt(Date.now());setNow(Date.now());}}
   catch(e){if(alive)setError(e instanceof Error?e.message:'Could not refresh photo station.');}
   finally{inFlight=false;if(alive){setRefreshing(false);const timer=setTimeout(refresh,5000);cancelTimer=()=>clearTimeout(timer);}}
  }
  refreshNow.current=refresh;refresh();return()=>{alive=false;cancelTimer();clearInterval(clock);};
 },[event.id]);
 async function create(purpose){const result=await call(route,{action:'create',purpose});setLinks(current=>[...current,{...result,purpose}]);await refreshNow.current();}
 const stale=Boolean(error)||(updatedAt!==null&&now-updatedAt>15000);
 const jobs=state?.jobs??[];
 const visibleJobs=jobs.filter(j=>filter==='all'||j.status===filter);
 const outstanding=count('pending')+count('printing')+count('held');
 const stations=(state?.stations??[]).filter(s=>Date.parse(s.expires_at)>now);
 return <s-section heading="Photo station & live print queue">
  <s-paragraph>Pair a tablet to this event for guest capture. Accepted photos arrive in the gallery and print queue automatically. Open the print desk on your printer-connected computer to review crops and prepare sheets.</s-paragraph>
  <s-paragraph>Station links last 12 hours. Share the capture link only with your station device; keep the print link private. Use iPad Guided Access to keep guests in the capture screen.</s-paragraph>
  <s-stack direction="inline" gap="base">
   <s-badge tone={stale?'warning':updatedAt?'success':'info'}>{stale?'Updates interrupted':updatedAt?'Updating':'Loading'}</s-badge>
   <s-button disabled={refreshing} onClick={()=>refreshNow.current()}>Refresh status</s-button>
  </s-stack>
  {updatedAt&&<s-paragraph>Last updated {new Date(updatedAt).toLocaleTimeString()}. Refreshes every 5 seconds while this dashboard is open.</s-paragraph>}
  {stale&&<s-banner tone="warning">Live updates are interrupted. {updatedAt?'The figures below are from the last successful refresh.':'Queue status is unavailable.'} {error} Check your connection or refresh status.</s-banner>}
  {state&&<s-stack gap="base">
   <s-heading>Print progress</s-heading>
   <s-grid gridTemplateColumns="1fr 1fr" gap="base">
    <s-box padding="base" background="subdued"><s-paragraph>{count('pending')} pending photos</s-paragraph></s-box>
    <s-box padding="base" background="subdued"><s-paragraph>{count('printing')} awaiting print confirmation</s-paragraph></s-box>
    <s-box padding="base" background="subdued"><s-paragraph>{count('held')} held photos</s-paragraph></s-box>
    <s-box padding="base" background="subdued"><s-paragraph>{state.counts?`${state.counts.printed} printed photos`:'Printed total unavailable'}</s-paragraph></s-box>
   </s-grid>
   <s-paragraph>Totals count photo jobs, not individual magnet copies. In the print desk, choose Printed — clear from queue after checking the sheet. Confirmed photos leave this list and the printed total updates within 5 seconds.</s-paragraph>
   {!state.counts&&<s-paragraph>Showing loaded queue counts. The event-wide printed total is currently unavailable.</s-paragraph>}
   {count('printing')>0&&<s-banner tone="info">Check the physical sheets, then confirm them in the print desk. This dashboard does not receive automatic printer-completion reports.</s-banner>}
   {count('held')>0&&<s-paragraph>Held photos need review in the print desk before they can continue.</s-paragraph>}
   <s-select label="Show queue" value={filter} onChange={e=>setFilter(e.currentTarget.value)}>
    <s-option value="all">All outstanding photos</s-option>
    <s-option value="pending">Pending photos</s-option>
    <s-option value="printing">Awaiting print confirmation</s-option>
    <s-option value="held">Held photos</s-option>
   </s-select>
   {outstanding===0&&<s-paragraph>No photos waiting to print.</s-paragraph>}
   {outstanding>0&&visibleJobs.length===0&&<s-paragraph>No matching photos in the loaded queue. Open the print desk to review this status.</s-paragraph>}
   {visibleJobs.length>0&&<s-paragraph>Showing {Math.min(8,visibleJobs.length)} of {visibleJobs.length} matching loaded photos, oldest first.</s-paragraph>}
   {outstanding>jobs.length&&<s-paragraph>The overview loads the oldest 100 outstanding photos. Totals include the entire event; use the print desk to review additional photos.</s-paragraph>}
   {visibleJobs.slice(0,8).map(j=><s-paragraph key={j.id}>Photo {j.id.slice(0,8)} · {statusLabel[j.status]??j.status} · {j.quantity??1} {(j.quantity??1)===1?'copy':'copies'} · {new Date(j.created_at).toLocaleTimeString()}</s-paragraph>)}
  </s-stack>}
  <s-heading>Station access</s-heading>
  <s-paragraph>Authorized links allow device access until they expire or you revoke them. They do not confirm that a tablet or printer is connected.</s-paragraph>
  <s-stack direction="inline" gap="base">
   <s-button disabled={busy} onClick={()=>run(()=>create('capture'))}>Create tablet capture link</s-button>
   <s-button disabled={busy} onClick={()=>run(()=>create('print'))}>Open event print desk</s-button>
  </s-stack>
  {links.map(link=><s-box key={link.id} padding="base" background="subdued">
   <s-paragraph>{link.purpose==='capture'?'Open this private link on the tablet.':'Open this private link on the printing computer.'} Expires {new Date(link.expiresAt).toLocaleString()}.</s-paragraph>
   <s-link href={link.url} target="_blank">{link.purpose==='capture'?'Open capture screen':'Open print desk'}</s-link>
   <s-text-field label={link.purpose==='capture'?'Private capture link — copy the complete link':'Private print link — copy the complete link'} value={link.url} readOnly />
  </s-box>)}
  {state&&<s-stack gap="base">
   <s-heading>Authorized station links</s-heading>
   {stations.length===0&&<s-paragraph>No unexpired station links. Create a link above to set up a device.</s-paragraph>}
   {stations.map(s=><s-stack key={s.id} direction="inline" gap="base"><s-paragraph>{s.purpose==='capture'?'Tablet capture':'Print desk'} · expires {new Date(s.expires_at).toLocaleString()}</s-paragraph><s-button disabled={busy} onClick={()=>run(async()=>{await call(route,{action:'revoke',id:s.id});setLinks(current=>current.filter(link=>link.id!==s.id));await refreshNow.current();})}>Revoke link</s-button></s-stack>)}
  </s-stack>}
  {state&&<MagnetTemplate key={event.id} initial={state.template} eventName={event.name} call={call} route={route} run={run} busy={busy} />}
 </s-section>;
}
