import {readFile,writeFile,mkdir,open,unlink} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {createInterface} from 'node:readline/promises';
import {Journal,advance} from './engine.mjs';
import {printerAdapter,listPrinters,listMedia} from './platform.mjs';
import {renderSheets,calibrationSheet} from './render.mjs';
let stopped=false;process.on('message',message=>{if(message?.action==='pause')stopped=true;});
process.on('disconnect',()=>{stopped=true;});
const dir=resolve(process.env.ATELIER_PRINT_STATE||'./atelier-print-state');await mkdir(dir,{recursive:true,mode:0o700});
const configPath=join(dir,'printer.json'),journal=new Journal(dir),arg=process.argv[2];
if(arg==='--setup'){
 if(!['darwin','win32'].includes(process.platform))throw Error('Run printer setup on the Windows PC or Mac connected to your printer.');
 const input=createInterface({input:process.stdin,output:process.stdout});
 try{console.log(await listPrinters());const printer=(await input.question('Installed printer queue name: ')).trim();console.log(await listMedia(printer));const media=(await input.question('Exact driver media option for 8 x 12: ')).trim();const fontPath=(await input.question('Path to your licensed Brown Carolina font (blank for photo-only templates): ')).trim();await writeFile(configPath,JSON.stringify({printer,media,fontPath,calibrated:false},null,2),{mode:0o600});console.log('Saved. Run --calibrate, inspect the paper and cutter fit, then --confirm-calibration.');}finally{input.close();}
}else if(arg==='--calibrate'){
 const config=JSON.parse(await readFile(configPath,'utf8')),adapter=printerAdapter(config),file=join(dir,'calibration'+adapter.extension);await writeFile(file,await calibrationSheet(adapter.format,config.profile==='photo-4x6-single'?'4x6':config.profile==='letter-four'?'letter':'8x12'),{mode:0o600});console.log('Calibration sent:',await adapter.submit(file,'calibration'));
}else if(arg==='--confirm-calibration'){
 const input=createInterface({input:process.stdin,output:process.stdout});try{if((await input.question('Did the printed square measure exactly 3.75 inches on both axes, with correct cutter fit? Type YES: '))!=='YES')throw Error('Calibration not confirmed');const config=JSON.parse(await readFile(configPath,'utf8'));await writeFile(configPath,JSON.stringify({...config,calibrated:true,calibratedAt:new Date().toISOString()},null,2),{mode:0o600});}finally{input.close();}
}else if(arg==='--run'){
 const config=JSON.parse(await readFile(configPath,'utf8'));if(!config.calibrated)throw Error('Complete a physical calibration first.');
 if(config.profile==='photo-4x6-single')throw Error('Use Connect validated printer to dashboard for 4 x 6 sheets. Manual sheet confirmation remains available in the dashboard.');
 const adapter=printerAdapter(config),lockPath=join(dir,'helper.lock');
 try{const lock=await open(lockPath,'wx',0o600);await lock.writeFile(String(process.pid));await lock.close();}catch(e){if(e.code==='EEXIST')throw Error('A helper lock exists. Confirm no helper is running, then remove helper.lock before restart.');throw e;}
 const input=createInterface({input:process.stdin,output:process.stdout});let token;
 try{const url=new URL((await input.question('Paste the private print-desk link from the owner app: ')).trim());if(url.origin!=='https://www.atelierelunora.com'||url.pathname!=='/pages/photo-station')throw Error('Use an Atelier Elunora print-desk link.');token=new URLSearchParams(url.hash.slice(1)).get('print');if(!/^[a-f0-9]{64}$/.test(token))throw Error('Invalid print link');}catch(e){await unlink(lockPath);throw e;}finally{input.close();}
 const api=async body=>{const r=await fetch('https://gefdlubvqymyxrguhtnc.supabase.co/functions/v1/gallery-api/station',{method:'POST',headers:{'Content-Type':'application/json','X-Elunora-Request':'1',Origin:'https://www.atelierelunora.com'},body:JSON.stringify({...body,token,purpose:'print'}),signal:AbortSignal.timeout(30000)});const d=await r.json();if(!r.ok)throw Error(d.error||'Event connection failed');return d;};
 process.on('SIGINT',()=>{stopped=true;});process.on('SIGTERM',()=>{stopped=true;});
 const fingerprint=createHash('sha256').update((process.platform==='win32'?'win32|':'')+config.printer+'|'+config.media).digest('hex');
 try{
  const info=await api({action:'info'});console.log('Connected to '+info.name+'. Press Control-C to pause after the current operation.');
  while(!stopped){
   let job=await journal.read();
   if(job){if(job.eventId!==info.eventId||job.printerFingerprint!==fingerprint)throw Error('The saved job belongs to a different event or printer. Resolve it before switching.');const result=await advance(job,{journal,...adapter,authorize:j=>api({action:'helper-authorize',batchId:j.batchId,jobId:j.jobId,version:j.version}),complete:j=>api({action:'helper-complete',batchId:j.batchId,jobId:j.jobId,version:j.version,spoolerJob:j.spoolerJob})});if(result.state==='recorded')console.log('Computer reported completion: '+result.spoolerJob);}
   else{
    const active=await api({action:'queue',status:'printing'});if(active.jobs.length)throw Error('A print job is already reserved outside this helper. Resolve it in the print desk first.');
    const q=await api({action:'queue',status:'pending'});
    if(q.jobs.length){
     const first=q.jobs[0];let claim;
     if(first.quantity>1){const template=first.template??(await api({action:'template'})).template;const c=await api({action:'update',id:first.id,version:first.version,operation:'claim',quantity:first.quantity,x:first.x,y:first.y,zoom:first.zoom??1,template});claim={id:randomUUID(),jobs:[c.job],jobId:c.job.id,version:c.job.version};}
     else{const partial=Date.now()-Date.parse(first.created_at)>120000;const c=await api({action:'batch-claim',requestId:randomUUID(),partial,profile:config.profile==='photo-4x6-single'?'4x6':config.profile==='letter-four'?'letter':'8x12'});if(!c.waiting){if(!c.created)throw Error('Recovered reservation requires review; it will not print automatically.');claim={...c,batchId:c.id};}}
     if(claim){
      // A crash before journal creation leaves a reserved server job, which pauses on restart.
      const images=new Map();for(const j of claim.jobs){const signed=await api({action:'image',id:j.id});const url=new URL(signed.url);if(url.origin!=='https://gefdlubvqymyxrguhtnc.supabase.co')throw Error('Unexpected photo origin');const r=await fetch(url,{signal:AbortSignal.timeout(60000)});if(!r.ok)throw Error('Photo download failed');images.set(j.id,Buffer.from(await r.arrayBuffer()));}
      const bytes=await renderSheets(claim.jobs,images,info.name,config.fontPath,adapter.format,config.profile),file=join(dir,claim.id+adapter.extension);const out=await open(file,'w',0o600);try{await out.writeFile(bytes);await out.sync();}finally{await out.close();}
      await journal.write({id:claim.id,eventId:info.eventId,printerFingerprint:fingerprint,state:'prepared',file,sha256:createHash('sha256').update(bytes).digest('hex'),batchId:claim.batchId,jobId:claim.jobId,version:claim.version,createdAt:new Date().toISOString()});
     }
    }
   }
   if(!stopped)await new Promise(r=>setTimeout(r,3000));
  }
 }finally{token=null;await unlink(lockPath);if(process.connected)process.disconnect();}
}else console.log('Atelier Elunora Mac / Windows Print Helper\n--setup\n--calibrate (sends one calibration print)\n--confirm-calibration\n--run\nState and recovery files: '+dir);
