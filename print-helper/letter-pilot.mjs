// Explicit two-sheet sample pilot. Never calls the live gallery or marks an order printed.
import {readFile,writeFile,mkdir,open,unlink} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {randomUUID,createHash} from 'node:crypto';
import {currentPilotDirectory,createPilotRun} from './pilot-runs.mjs';
import {Journal} from './engine.mjs';
import {tickAutomatic} from './automatic-engine.mjs';
import {windowsAdapter} from './windows.mjs';
import {renderSheets} from './render.mjs';
import {askPhysicalConfirmation} from './physical-confirmation.mjs';
import {confirmPilotSheet} from './pilot-confirmation.mjs';
const base=resolve(process.env.ATELIER_PRINT_STATE||'./atelier-letter-pilot');await mkdir(base,{recursive:true});
const lock=join(base,'pilot.lock');const lockHandle=await open(lock,'wx');
try{
const dir=process.argv.includes('--new')?await createPilotRun(base):await currentPilotDirectory(base);process.env.ATELIER_PRINT_STATE=dir;
await mkdir(dir,{recursive:true});const manifestPath=join(dir,'pilot.json');
let manifest;try{manifest=JSON.parse(await readFile(manifestPath,'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;}
if(!manifest&&await new Journal(join(dir,'journal')).read())throw Error('Saved printer jobs exist but the manifest is missing. Inspect before preparing anything.');
if(process.argv.includes('--prepare')||process.argv.includes('--new')||(!manifest&&process.argv.includes('--resume'))){
 if(manifest)throw Error('Pilot already prepared. Reuse its saved sheets; do not create an accidental duplicate.');
 const sheets=[];
 for(let page=0;page<2;page++){
  const jobs=[],images=new Map();for(let i=0;i<4;i++){const id='sample-'+(page*4+i+1);jobs.push({id,quantity:1,x:50,y:50,zoom:1,template:{enabled:false,photoCutInches:3.6}});images.set(id,await readFile(new URL('../theme/assets/atelier-studio-demo-'+((page*4+i)%3+1)+'.jpg',import.meta.url)));}
  const file=join(dir,'sheet-'+(page+1)+'.print.json'),bytes=await renderSheets(jobs,images,'Sample print pilot',null,'windows','letter-four');await writeFile(file,bytes);
  await writeFile(join(dir,'sheet-'+(page+1)+'.pdf'),await renderSheets(jobs,images,'Sample print pilot',null,'pdf','letter-four'));
  sheets.push({id:randomUUID(),sheet_index:page,items:jobs,file,sha256:createHash('sha256').update(bytes).digest('hex')});
 }
 manifest={runId:randomUUID(),fence:randomUUID(),profile:{id:'letter-four'},sheets,reports:[],completed:false};await writeFile(manifestPath,JSON.stringify(manifest,null,2));console.log('Prepared two Letter sheets: eight sample magnets at 3.6 inches. No printing submitted.');
}
if(!process.argv.includes('--prepare')){
 if(!manifest)throw Error('Prepare the pilot first.');if(manifest.completed){console.log('Pilot already completed; no new copies submitted.');}else{
 try{
  const journal=new Journal(join(dir,'journal'));let claimed=Boolean(await journal.read());
  const save=()=>writeFile(manifestPath,JSON.stringify(manifest,null,2));
  const api=async body=>{
   if(body.action==='heartbeat')return {mode:'running'};
   if(body.action==='claim'){if(claimed)return {waiting:true};claimed=true;return structuredClone(manifest);}
   if(body.action==='submit')return {authorized:true};
   if(body.action==='report'){if(!manifest.reports.some(r=>r.sheetId===body.sheetId&&r.state===body.state))manifest.reports.push(body);await save();return {saved:true};}
   return {};
  };
  const adapter=windowsAdapter({printer:'HP39273A.localdomain (HP OfficeJet Pro 8020 series) (Copy 1)',media:'1',profile:'letter-four'});
  let deadline=Date.now()+180000;
  let lastMessage='';
  while(Date.now()<deadline){let result;
   try{result=await tickAutomatic({journal,api,adapter,prepare:async s=>({file:s.file,sha256:s.sha256})});}
   catch(e){
    if(e.code!=='SENT_NOT_CONFIRMED'||!process.stdin.isTTY)throw e;
    const saved=await journal.read(),sheet=saved?.sheets.find(s=>s.localState!=='recorded');
    if(!sheet||sheet.localState!=='submitted')throw e;
    console.log('The driver only confirmed delivery of sheet '+(sheet.sheet_index+1)+'. No duplicate has been sent.');
    if(!await askPhysicalConfirmation())throw Error('Physical output not confirmed or console input closed. Saved job retained; nothing resent.');
    manifest.reports.push(await confirmPilotSheet(journal,sheet.spoolerJob));await save();deadline=Date.now()+180000;console.log('Sheet recorded as operator-confirmed. Continuing without reprinting it.');continue;
   }
   const message=result.state==='printer-attention'?result.message:result.state==='submitted'?'Monitoring existing printer job '+result.spoolerJob:result.state;if(message!==lastMessage){console.log(message);lastMessage=message;}
   if(claimed&&!await journal.read()){manifest.completed=true;await save();console.log('Both sheets reconciled. History distinguishes operator-confirmed and computer-reported completion.');break;}
   await new Promise(r=>setTimeout(r,2500));
  }
  if(!manifest.completed)console.log('Monitoring paused at time limit. Restart resumes the same saved job; no automatic resend.');
 }catch(e){console.error('PAUSED: '+e.message);process.exitCode=1;}
 }
}

}finally{await lockHandle.close();await unlink(lock);}
