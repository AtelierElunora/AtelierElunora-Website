/** @jsxRuntime classic */
/** @jsx h */
import {h} from 'preact';
import {useEffect,useState,useRef} from 'preact/hooks';
import QRCode from 'qrcode';

export function GuestExperience({event,call,run,busy}){
 const [config,setConfig]=useState(null),[photos,setPhotos]=useState([]),[url,setUrl]=useState(''),[qr,setQr]=useState(''),[error,setError]=useState(''),[cursor,setCursor]=useState(0),[next,setNext]=useState(null);
 const [needsRestore,setNeedsRestore]=useState(false),[originalLink,setOriginalLink]=useState('');
 const [review,setReview]=useState('pending'),[deleting,setDeleting]=useState(null);
 const [selected,setSelected]=useState(new Set());
 const queueRequests=useRef({});const [queueNotice,setQueueNotice]=useState('');
 const route='owner/experience/'+event.id;
 async function load(page=0,status=review){const r=await call(route,{action:'list',cursor:page,status});setPhotos(r.photos);setSelected(new Set());setNext(r.next);setCursor(page);setUrl(r.url??'');setNeedsRestore(r.qrNeedsRestore===true);if(!config)setConfig(r.config??{enabled:true,welcome:'Share your celebration with Atelier Elunora.',closes_at:new Date(Date.now()+7*86400000).toISOString(),moderation:true,downloads:true,guest_limit:30,event_limit:2000});}
 useEffect(()=>{let alive=true;setUrl('');setQr('');setError('');setCursor(0);setConfig(null);setPhotos([]);setNeedsRestore(false);setOriginalLink('');setSelected(new Set());setReview('pending');setQueueNotice('');call(route,{action:'list',status:'pending'}).then(r=>{if(!alive)return;setConfig(r.config??{enabled:true,welcome:'Share your celebration with Atelier Elunora.',closes_at:new Date(Date.now()+7*86400000).toISOString(),moderation:true,downloads:true,guest_limit:30,event_limit:2000});setPhotos(r.photos);setNext(r.next);setUrl(r.url??'');setNeedsRestore(r.qrNeedsRestore===true);}).catch(e=>{if(alive)setError(e.message);});return()=>{alive=false;};},[event.id]);
 useEffect(()=>{let alive=true;if(!url){setQr('');return;}QRCode.toString(url,{type:'svg',width:900,margin:4,errorCorrectionLevel:'M',color:{dark:'#252B1D',light:'#FFFFFF'}}).then(svg=>{if(alive)setQr('data:image/svg+xml;charset=utf-8,'+encodeURIComponent(svg));}).catch(()=>{if(alive)setError('Could not draw the QR code. Refresh to retry.');});return()=>{alive=false;};},[url]);
 async function approveSelected(){
  const ids=photos.filter(p=>p.status==='pending'&&selected.has(p.id)).map(p=>p.id);
  let approved=0;const failed=[];
  for(const id of ids){try{await call(route,{action:'approve',photoId:id});approved++;}catch(e){failed.push(id);if(e.status===401||e.status===403||e.status===429){failed.push(...ids.slice(approved+failed.length));break;}}}
  const summary=approved+' photo'+(approved===1?'':'s')+' approved.'+(failed.length?' '+failed.length+' could not be approved. Refresh and retry those photos.':' Approved event photos enter the magnet print queue automatically.');
  setQueueNotice(summary);
  try{await load(cursor);}catch(e){setQueueNotice(summary+' Refresh the review list to see the latest status.');throw e;}
 }
 const field=(key,value)=>setConfig(c=>({...c,[key]:value}));
 async function save(rotate=false){const r=await call(route,{action:'save',welcome:config.welcome,closesAt:config.closes_at,guestLimit:Number(config.guest_limit),eventLimit:Number(config.event_limit),enabled:config.enabled,moderation:config.moderation,downloads:config.downloads,rotate});if(r.url)setUrl(r.url);await load();}
 return <s-section heading="Guest photo sharing">
  {error&&<s-banner tone="warning">{error}</s-banner>}
  {config?.studio_user?<s-paragraph>Private online customer workspace. Photos enter production after payment review.</s-paragraph>:config&&<s-stack gap="base">
   <s-paragraph>Guests scan your event QR to upload and see only their own photos in the same browser session. Give the couple access to the full approved gallery separately in Guest access. Approving an event photo adds one magnet to the print queue. Printing follows your print desk settings.</s-paragraph>
   <s-switch label="Event link open" checked={config.enabled} onChange={e=>field('enabled',e.currentTarget.checked)}/>
   <s-text-area label="Welcome message" value={config.welcome} maxLength={500} onInput={e=>field('welcome',e.currentTarget.value)}/>
   <s-text-field label="Closes at (date and time, including timezone)" value={config.closes_at} onInput={e=>field('closes_at',e.currentTarget.value)}/>
   <s-switch label="Approve uploads before showing them to the couple" checked={config.moderation} onChange={e=>field('moderation',e.currentTarget.checked)}/>
   <s-switch label="Allow guests to download their own originals" checked={config.downloads} onChange={e=>field('downloads',e.currentTarget.checked)}/>
   <s-number-field label="Photos per guest session" value={String(config.guest_limit)} min={1} max={200} onInput={e=>field('guest_limit',e.currentTarget.value)}/>
   <s-number-field label="Photos per event" value={String(config.event_limit)} min={1} max={20000} onInput={e=>field('event_limit',e.currentTarget.value)}/>
   <s-button disabled={busy} onClick={()=>run(()=>save())}>Save guest sharing</s-button>
   <s-button disabled={busy} onClick={()=>run(()=>save(true))}>Replace QR link and close previous guest sessions</s-button>
   <s-paragraph>Your QR code is saved with this event and stays visible when you return. Replacing the link invalidates old printed QR signs. Closing guest access does not remove the QR image. Per-session limits can be bypassed with a new browser; the event limit is enforced across all guests.</s-paragraph>
   {needsRestore&&<s-stack gap="base"><s-paragraph>This older QR link was not saved for display. Your printed code still works while guest access is open. Paste its original link to restore the same QR, or explicitly replace it to create a new one.</s-paragraph><s-text-field label="Original event upload link" value={originalLink} onInput={e=>setOriginalLink(e.currentTarget.value)}/><s-button disabled={busy||!originalLink.trim()} onClick={()=>run(async()=>{await call(route,{action:'restore-qr',url:originalLink.trim()});setOriginalLink('');await load();})}>Restore saved QR</s-button></s-stack>}
   {url&&<s-text-field label="Event upload link — save this link" value={url} readOnly/>}
   {qr&&<s-stack gap="base"><s-image src={qr} alt="Event photo upload QR code" aspectRatio="1/1"/><s-link href={qr} target="_blank">Open QR image to save or print</s-link><s-link href={url} target="_blank">Open guest page</s-link></s-stack>}
  </s-stack>}
  <s-stack direction="inline" gap="base">{[['pending','Pending review'],['approved','Approved'],['rejected','Rejected']].map(([key,label])=><s-button disabled={busy} variant={review===key?'primary':undefined} onClick={()=>run(async()=>{await load(0,key);setReview(key);setDeleting(null);})}>{label}</s-button>)}</s-stack>
  <s-paragraph>{review==='pending'?'Approve or reject photos to clear this review queue.':review==='approved'?'Approved photos stay in the gallery and are available for printing.':'Rejected photos are hidden from guests. Delete them permanently to free storage.'}</s-paragraph>
  <s-button disabled={busy} onClick={()=>run(()=>load(cursor))}>Refresh guest photos</s-button>
  {review==='pending'&&photos.length>0&&<s-stack direction="inline" gap="base">
   <s-button disabled={busy} onClick={()=>setSelected(new Set(photos.filter(p=>p.status==='pending').map(p=>p.id)))}>Select all on this page</s-button>
   <s-button disabled={busy||!selected.size} onClick={()=>setSelected(new Set())}>Clear selection</s-button>
   <s-button variant="primary" disabled={busy||!selected.size} onClick={()=>run(approveSelected)}>Approve selected ({selected.size})</s-button>
  </s-stack>}
  {queueNotice&&<s-paragraph>{queueNotice}</s-paragraph>}
  {!photos.length&&<s-paragraph>No photos in this view.</s-paragraph>}
  {photos.map(p=><s-box key={p.id} padding="base" border="base">{review==='pending'&&p.status==='pending'&&<s-checkbox label={'Select '+p.filename} checked={selected.has(p.id)} disabled={busy} onChange={e=>{const checked=e.currentTarget.checked;setSelected(current=>{const next=new Set(current);if(checked)next.add(p.id);else next.delete(p.id);return next;});}}/>}<s-image src={p.url} alt={p.filename} aspectRatio="1/1" objectFit="contain"/><s-paragraph>{p.filename} · {p.status}</s-paragraph><s-stack direction="inline" gap="base">{(p.status==='pending'?['approve','reject']:p.status==='approved'?['reject','print']:p.status==='deleting'?[]:['approve']).map(action=><s-button disabled={busy||(action==='print'&&p.status!=='approved')} onClick={()=>run(async()=>{const requestId=action==='print'?(queueRequests.current[p.id]??=crypto.randomUUID()):undefined;await call(route,{action,photoId:p.id,requestId});if(action==='print'){delete queueRequests.current[p.id];setQueueNotice('One magnet added to the print queue. Click again to add another.');}await load(0);})}>{({approve:'Approve',reject:'Reject',print:'Queue one magnet'})[action]}</s-button>)}{['rejected','deleting'].includes(p.status)&&<s-button disabled={busy} onClick={()=>setDeleting(p.id)}>Delete permanently</s-button>}</s-stack>{deleting===p.id&&<s-stack><s-paragraph>Permanently delete {p.filename} and its original and preview files? This cannot be undone.</s-paragraph><s-button disabled={busy} onClick={()=>run(async()=>{await call(route,{action:'delete',photoId:p.id,confirm:true});setDeleting(null);await load(0);})}>Confirm permanent deletion</s-button><s-button disabled={busy} onClick={()=>setDeleting(null)}>Keep photo</s-button></s-stack>}</s-box>)}
  <s-stack direction="inline" gap="base"><s-button disabled={busy||cursor===0} onClick={()=>run(()=>load(Math.max(0,cursor-50)))}>Previous photos</s-button><s-button disabled={busy||next===null} onClick={()=>run(()=>load(next))}>More photos</s-button></s-stack>
 </s-section>;
}
