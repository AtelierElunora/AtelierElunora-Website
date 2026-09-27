import {AutomaticPrinting} from './AutomaticPrinting.jsx';
import {h} from 'preact';
import {useState} from 'preact/hooks';

export function EventPrintDesk({event,call,run,busy,demo}){
 const [desk,setDesk]=useState(null);
 async function open(){
  if(demo){setDesk({url:'/pages/photo-station?demo=print&embedded=1'});return;}
  const link=await call('owner/station/'+event.id,{action:'create',purpose:'print'});
  const url=new URL(link.url);
  if(url.origin!=='https://www.atelierelunora.com'||url.pathname!=='/pages/photo-station'||!url.hash.startsWith('#print='))throw Error('The print desk returned an unexpected address.');
  url.searchParams.set('embedded','1');
  try{
   const page=new URL(url);page.hash='';
   const response=await fetch(page.href,{credentials:'same-origin',cache:'no-store'});
   if(!response.ok||new URL(response.url).origin!==url.origin)throw Error('Could not load the embedded print desk.');
   const doc=new DOMParser().parseFromString(await response.text(),'text/html');
   if(!doc.getElementById('jobs')||!doc.getElementById('sheets'))throw Error('The print desk page is unavailable.');
   doc.documentElement.dataset.stationUrl=url.href;
   setDesk({...link,url:url.href,html:'<!doctype html>'+doc.documentElement.outerHTML});
  }catch(error){await call('owner/station/'+event.id,{action:'revoke',id:link.id});throw error;}
 }
 async function close(){
  if(desk.id)await call('owner/station/'+event.id,{action:'revoke',id:desk.id});
  setDesk(null);
 }
 return <section class="event-print-desk">
  <AutomaticPrinting event={event} call={call} run={run} busy={busy} demo={demo}/>
  <div class="panel"><div class="section-heading"><div><h2>Event print desk</h2><p>Review crops, prepare sheets and confirm printed photos for {event.name}.</p></div>{desk?<button disabled={busy} onClick={()=>run(close)}>Close print desk</button>:<button class="primary" disabled={busy} onClick={()=>run(open)}>Connect event print desk</button>}</div>
  <p class="muted">Use this on your printer-connected computer. Leaving this tab pauses this desk’s automatic sheets; prepared jobs stay in the queue. The Mac or Windows helper runs separately.</p>
  {desk&&<p class="muted">{demo?'Sample queue only.':`Private access expires ${new Date(desk.expiresAt).toLocaleString()}.`} <a href={desk.url} target="_blank" rel="noopener noreferrer">Open full-size desk ↗</a></p>}
  </div>
  {desk&&<iframe key={desk.url} class="print-desk-frame" title={'Print desk — '+event.name} src={desk.html?undefined:desk.url} srcDoc={desk.html} referrerPolicy="no-referrer"/>}
 </section>;
}
