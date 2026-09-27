import {closeWorkerChannel} from './worker-lifecycle.mjs';
import {readFile,open,mkdir,unlink,readdir} from 'node:fs/promises';
import {resolve,join,dirname} from 'node:path';
import {randomBytes,createHash} from 'node:crypto';
import {createInterface} from 'node:readline/promises';
import {Journal} from './engine.mjs';
import {tickAutomatic,reconcileBeforePairing} from './automatic-engine.mjs';
import {readCredential,saveCredential} from './keychain.mjs';
import {printerAdapter} from './platform.mjs';
import {sheetProfile} from './profiles.mjs';
import {renderSheets} from './render.mjs';
const dir=resolve(process.env.ATELIER_PRINT_STATE||'./atelier-print-state');await mkdir(dir,{recursive:true,mode:0o700});
const base='https://gefdlubvqymyxrguhtnc.supabase.co/functions/v1/gallery-api/automatic';let token;
const api=async body=>{const r=await fetch(base,{method:'POST',headers:{'Content-Type':'application/json','X-Elunora-Request':'1',Origin:'https://www.atelierelunora.com'},body:JSON.stringify({...body,token}),signal:AbortSignal.timeout(30000)});const result=await r.json();if(!r.ok)throw Object.assign(Error(result.error||'Print connection unavailable'),{status:r.status});return result;};
const lock=join(dir,'helper.lock');const held=await open(lock,'wx',0o600);await held.writeFile(String(process.pid));await held.close();
try{
 if(process.argv[2]==='--reconcile'){
  try{
   const result=await reconcileBeforePairing(new Journal(join(dir,'automatic')),async runId=>{token=await readCredential();return api({action:'heartbeat',runId});});
   console.log(result.cleared?'Resolved run cleared. History preserved. You can reconnect or pair now. No photos were resent.':'No unfinished local print run. You can reconnect or pair now.');
  }catch(e){console.error('Run was not cleared: '+e.message+' If the dashboard is unavailable, the saved run stays protected.');process.exitCode=1;}
 }else if(process.argv[2]==='--pair'){
  await reconcileBeforePairing(new Journal(join(dir,'automatic')),async runId=>{token=await readCredential();return api({action:'heartbeat',runId});});
  const input=createInterface({input:process.stdin,output:process.stdout});let code;try{code=(await input.question('Single-use pairing code: ')).trim();}finally{input.close();}
  token=randomBytes(32).toString('hex');const paired=await api({action:'pair',code});await saveCredential(token);process.send?.({type:'paired',helperId:paired.helperId});console.log('Paired. Start automatic printing from your owner dashboard after calibration.');
 }else{
  token=await readCredential();const config=JSON.parse(await readFile(join(dir,'printer.json'),'utf8'));
  if(!config.calibrated||config.jobMonitoring!==true)throw Error('Complete physical calibration and exact-job monitoring acceptance first.');
  const fontHash=config.fontPath?createHash('sha256').update(await readFile(config.fontPath)).digest('hex'):null;
  const fingerprint=createHash('sha256').update(JSON.stringify({printer:config.printer,media:config.media,fontHash,calibratedAt:config.calibratedAt,profile:config.profile||'ds820-8x12'})).digest('hex');
  const profile={id:sheetProfile(config.profile).id,adapter:process.platform==='win32'?'windows':'cups',printer:config.printer,media:config.media,fingerprint,calibrated:true,jobMonitoring:true};
  const journal=new Journal(join(dir,'automatic')),prior=await journal.read();
  if(prior&&prior.profile.fingerprint!==fingerprint)throw Error('Resolve saved sheets before changing the calibrated printer.');
  if(!prior)await api({action:'configure',profile});
  const adapter=printerAdapter(config);let stop=false,muted=false,lastAlert='';process.on('SIGINT',()=>stop=true);process.on('SIGTERM',()=>stop=true);process.on('message',m=>{if(m?.action==='pause')stop=true;if(m?.action==='mute')muted=Boolean(m.value);});process.on('disconnect',()=>stop=true);
  const prepare=async(sheet,run)=>{
   if(run.profile.fingerprint!==fingerprint)throw Error('Reserved printer profile differs from this calibrated setup.');
   const images=new Map();for(const job of sheet.items){if(images.has(job.id))continue;const signed=await api({action:'image',runId:run.runId,sheetId:sheet.id,jobId:job.id});const url=new URL(signed.url);if(url.origin!=='https://gefdlubvqymyxrguhtnc.supabase.co')throw Error('Unexpected image origin');const r=await fetch(url,{signal:AbortSignal.timeout(60000)});if(!r.ok)throw Error('Photo download failed');images.set(job.id,Buffer.from(await r.arrayBuffer()));}
   const bytes=await renderSheets(sheet.items,images,run.eventName||'',config.fontPath,adapter.format,profile.id),file=join(dir,'automatic',sheet.id+adapter.extension);await mkdir(join(dir,'automatic'),{recursive:true,mode:0o700});const f=await open(file,'w',0o600);try{await f.writeFile(bytes);await f.sync();}finally{await f.close();}return {file,sha256:createHash('sha256').update(bytes).digest('hex')};
  };
  console.log('Helper connected. Owner dashboard controls Start / Pause. Manual confirmation remains available.');
  while(!stop){try{await api({action:'heartbeat'});const state=await tickAutomatic({journal,api,adapter,prepare,dashboardConfirmation:true});console.log(state.state==='waiting'?'Connected — waiting for queued photos, a full sheet, or dashboard Start.':state.state==='awaiting-confirmation'?'Confirm the printed sheet in your owner dashboard.':state.message||state.state);lastAlert='';}catch(e){if(e.status===403)process.send?.({type:'connection-invalid'});if(lastAlert!==e.message){console.error((muted?'':'\x07')+'Needs attention: '+e.message);lastAlert=e.message;}try{await api({action:'fault'});}catch{}break;}await new Promise(r=>setTimeout(r,3000));}
  // Only reconciled artifacts expire; unresolved journals and PDFs are retained.
  for(const name of await readdir(join(dir,'automatic')).catch(()=>[])){if(!/^[a-f0-9-]{36}\.json$/.test(name))continue;const receipt=join(dir,'automatic',name);const r=JSON.parse(await readFile(receipt,'utf8'));if(!r.finishedAt||Date.now()-Date.parse(r.finishedAt)<86400000)continue;for(const sh of r.sheets){const file=resolve(sh.file);if(dirname(file)===resolve(dir,'automatic'))await unlink(file).catch(()=>{});}await unlink(receipt);}
 }
}finally{token=null;try{await unlink(lock);}finally{closeWorkerChannel();}}
