import http from 'node:http';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {randomBytes} from 'node:crypto';
import {spawn} from 'node:child_process';
import {listPrinters,listMedia,printerAdapter} from './platform.mjs';
import {printerChoices,mediaChoices,requireSavedPrinterSelection} from './setup.mjs';
import {sheetProfile} from './profiles.mjs';
import {windowsBridge} from './windows.mjs';
import {calibrationSheet} from './render.mjs';
const here=fileURLToPath(new URL('.',import.meta.url)),dir=resolve(process.env.ATELIER_PRINT_STATE||join(here,'atelier-print-state'));
await mkdir(dir,{recursive:true,mode:0o700});
const origin='http://127.0.0.1:4318',csrf=randomBytes(32).toString('hex');let child=null,log='',running=false,paired=false,calibrationJob=null;
const pauseChild=()=>{if(child?.connected)child.send({action:'pause'},()=>{});};
const append=s=>{log=(log+s).slice(-12000);};
const configPath=join(dir,'printer.json');
async function config(){try{return JSON.parse(await readFile(configPath,'utf8'));}catch(e){if(e.code==='ENOENT')return {};throw e;}}
const server=http.createServer(async(req,res)=>{
 res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; frame-ancestors 'none'; base-uri 'none'");
 const send=(body,status=200)=>{res.writeHead(status,{'Content-Type':'application/json'});res.end(JSON.stringify(body));};
 try{
  if(req.headers.host!=='127.0.0.1:4318')return send({error:'Open the local helper window.'},403);
  if(req.method==='GET'&&req.url==='/health')return send({app:'atelier-print-helper',version:'connection-recovery-2'});
  if(req.method==='GET'&&req.url==='/'){res.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});return res.end((await readFile(new URL('control.html',import.meta.url),'utf8')).replace('__CSRF__',csrf));}
  if(req.method!=='POST'||req.headers.origin!==origin||req.headers['x-atelier-control']!==csrf)return send({error:'Open the local helper window.'},403);
  let raw='';for await(const chunk of req){raw+=chunk;if(raw.length>8192){send({error:'Request too large.'},413);req.destroy();return;}}const body=JSON.parse(raw||'{}');
  if(req.url==='/status')return send({version:'connection-recovery-2',running,log,paired,platform:process.platform,calibrationJob,config:await config()});
  if(req.url==='/automatic-pair'||req.url==='/automatic-start'||req.url==='/automatic-reconcile'){
   if(running)throw Error('Pause the running helper first.');
   if(!['darwin','win32'].includes(process.platform))throw Error('Use Windows or macOS.');
   const pairing=req.url==='/automatic-pair',reconciling=req.url==='/automatic-reconcile';
   if(pairing&&!(typeof body.code==='string'&&/^[a-f0-9]{64}$/.test(body.code)))throw Error('Paste the single-use pairing code.');
   if(!pairing&&!reconciling){const c=await config();if(!c.calibrated||!c.jobMonitoring)throw Error('Verify physical calibration and job monitoring first.');}
   log=reconciling?'Checking saved run against the dashboard…\n':'Connecting automatic helper…\n';running=true;if(pairing)paired=false;
   child=spawn(process.execPath,[join(here,'automatic-main.mjs'),reconciling?'--reconcile':pairing?'--pair':'--run'],{cwd:here,env:{...process.env,ATELIER_PRINT_STATE:dir},windowsHide:true,stdio:['pipe','pipe','pipe','ipc']});
   child.on('message',message=>{if(message?.type==='connection-invalid')paired=false;if(message?.type==='paired'){paired=true;append('Event paired successfully. Select and test your printer next.\n');}});
   const redact=s=>body.code?s.replaceAll(body.code,'[pairing code]'):s;
   child.stdout.on('data',b=>append(redact(b.toString())));child.stderr.on('data',b=>append(redact(b.toString())));
   child.on('error',()=>{running=false;append('Helper could not start.\n');});child.on('exit',()=>{running=false;child=null;if(!reconciling)append('Helper stopped. Review any attention message before restarting.\n');});
   child.stdin.on('error',()=>append('Pairing input was interrupted.\n'));child.stdin.end(pairing?body.code+'\n':'');return send({started:true});
  }
  if(req.url==='/mute'){if(child?.connected)child.send({action:'mute',value:body.muted===true});return send({muted:body.muted===true});}
  if(req.url==='/printers'){const printers=await listPrinters();return send({printers,choices:printerChoices(printers)});}
  if(req.url==='/letter-test')throw Error('The Letter-only test has been retired. Refresh this page, save your selected paper size, then use Print calibration on saved paper size.');
  if(req.url==='/media'){const media=await listMedia(body.printer);return send({media,choices:mediaChoices(media,process.platform,body.profile)});}
  if(req.url==='/save'){
   if(running)throw Error('Pause the helper before changing printer settings.');
   const installed=printerChoices(await listPrinters());if(!installed.some(p=>p.value===body.printer))throw Error('Select an installed printer.');
   const profile=sheetProfile(body.profile).id;const options=mediaChoices(await listMedia(body.printer),process.platform,profile);if(!options.some(p=>p.value===body.media))throw Error('Select the driver paper option for this profile.');
   calibrationJob=null;const next={profile,printer:body.printer,media:body.media,fontPath:body.fontPath||'',calibrated:false};printerAdapter(next);if(next.fontPath){if(typeof next.fontPath!=='string'||next.fontPath.length>1000)throw Error('Invalid font path.');await readFile(next.fontPath);}
   await writeFile(configPath,JSON.stringify(next,null,2),{mode:0o600});return send({saved:true});
  }
  if(req.url==='/calibrate'){
   if(running)throw Error('Pause the helper first.');const c=await config();requireSavedPrinterSelection(c,body);const adapter=printerAdapter(c),file=join(dir,'calibration'+adapter.extension);await writeFile(file,await calibrationSheet(adapter.format,sheetProfile(c.profile).paper),{mode:0o600});calibrationJob={id:await adapter.submit(file,'calibration'),printer:c.printer,media:c.media};return send({job:calibrationJob.id});
  }
  if(req.url==='/calibration-status'){if(!calibrationJob)throw Error('Print a calibration sheet first.');const c=await config();return send({job:calibrationJob.id,state:await printerAdapter(c).status(calibrationJob.id)});}
  if(req.url==='/confirm'){
   if(running||!calibrationJob||body.confirm!==true)throw Error('Inspect the physical calibration first.');const c=await config();const adapter=printerAdapter(c);if(body.jobMonitoring===true&&await adapter.status(calibrationJob.id)!==9)throw Error('The exact test job has not reported completion. Manual printing remains available.');await writeFile(configPath,JSON.stringify({...c,calibrated:true,jobMonitoring:body.jobMonitoring===true,calibratedAt:new Date().toISOString()},null,2),{mode:0o600});return send({saved:true});
  }
  if(req.url==='/start'){
   if(running)throw Error('The helper is already running.');const c=await config();if(!c.calibrated)throw Error('Complete printer calibration first.');
   const url=new URL(body.link);if(url.origin!=='https://www.atelierelunora.com'||url.pathname!=='/pages/photo-station'||!/^[a-f0-9]{64}$/.test(new URLSearchParams(url.hash.slice(1)).get('print')||''))throw Error('Paste the private print-desk link from your owner app.');
   log='Starting…\n';running=true;try{child=spawn(process.execPath,[join(here,'main.mjs'),'--run'],{cwd:here,env:{...process.env,ATELIER_PRINT_STATE:dir},windowsHide:true,stdio:['pipe','pipe','pipe','ipc']});}catch(e){running=false;throw e;}
   const privateLink=body.link;
   child.stdout.on('data',b=>append(b.toString().replaceAll(privateLink,'[private link]')));child.stderr.on('data',b=>append(b.toString().replaceAll(privateLink,'[private link]')));
   child.on('error',e=>{running=false;append('Helper could not start: '+e.message+'\n');});child.on('exit',code=>{running=false;child=null;append(code?'Paused — review the message above.\n':'Paused.\n');});
   child.stdin.on('error',e=>append('Event connection input failed: '+e.message+'\n'));
   child.stdin.end(privateLink+'\n');return send({started:true});
  }
  if(req.url==='/pause'){pauseChild();return send({pausing:true});}
  return send({error:'Not found.'},404);
 }catch(e){send({error:e.message},400);}
});
server.listen(4318,'127.0.0.1',()=>{console.log('Atelier Print Helper: '+origin);if(process.platform==='darwin'&&process.env.ATELIER_PRINT_NO_OPEN!=='1')spawn('/usr/bin/open',[origin],{stdio:'ignore'});});
process.on('SIGINT',()=>{pauseChild();server.close();});
