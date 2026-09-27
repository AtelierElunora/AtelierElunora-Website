import {spawn} from 'node:child_process';
import {join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {randomUUID,createHash} from 'node:crypto';
import {readFile,mkdir,access,rename} from 'node:fs/promises';
const here=fileURLToPath(new URL('.',import.meta.url));
function execute(exe,args,input,limit=120000){
 return new Promise((resolve,reject)=>{
  const child=spawn(exe,args,{windowsHide:true,stdio:['pipe','pipe','pipe']});let stdout='',stderr='',settled=false;
  const finish=(error,value)=>{if(settled)return;settled=true;clearTimeout(timer);error?reject(error):resolve(value);};
  const timer=setTimeout(()=>{child.kill();finish(Error('Windows printing timed out. Inspect the queue before retrying.'));},limit);
  child.stdout.on('data',b=>{stdout+=b.toString('utf8');if(stdout.length>1048576){child.kill();finish(Error('Unexpected printer response.'));}});
  child.stderr.on('data',b=>{stderr=(stderr+b.toString('utf8')).slice(-4000);});child.on('error',e=>finish(e));child.stdin.on('error',e=>finish(e));
  child.on('close',code=>finish(code===0?null:Error(stderr||stdout||'Windows printer operation failed.'),stdout));child.stdin.end(input);
 });
}
// Native .NET bridge: no PowerShell execution-policy changes or external PDF viewer.
let bridgeBuild;
async function nativeBridge(){
 const sources=['NativePrinter.cs','Bridge.cs'].map(n=>join(here,'windows',n));
 const hash=createHash('sha256');for(const path of sources)hash.update(await readFile(path));
 const dir=join(resolve(process.env.ATELIER_PRINT_STATE||join(here,'atelier-print-state')),'bin');await mkdir(dir,{recursive:true});
 const exe=join(dir,'windows-'+hash.digest('hex').slice(0,24)+'.exe');
 try{await access(exe);return exe;}catch(e){if(e.code!=='ENOENT')throw e;}
 const temporary=exe+'.'+randomUUID()+'.exe';
 const compiler=join(process.env.SystemRoot||'C:\\Windows','Microsoft.NET','Framework64','v4.0.30319','csc.exe');
 await execute(compiler,['/nologo','/target:exe','/optimize+','/out:'+temporary,'/reference:System.Drawing.dll','/reference:System.Web.Extensions.dll','/reference:System.Security.dll',...sources],'');
 try{await rename(temporary,exe);}catch(e){if(e.code!=='EEXIST')throw e;}
 return exe;
}
export async function windowsBridge(body){
 if(process.platform!=='win32')throw Error('This printer adapter requires Windows.');
 bridgeBuild??=nativeBridge().catch(e=>{bridgeBuild=null;throw e;});
 const output=await execute(await bridgeBuild,[],JSON.stringify(body));const r=JSON.parse(output.replace(/^\uFEFF/,''));if(r.error)throw Error(r.error);return r;
}
export function validateWindowsConfig(config){
 if(typeof config.printer!=='string'||!config.printer.trim()||config.printer.length>256||/[\x00-\x1f]/.test(config.printer))throw Error('Select an installed Windows printer.');
 if(typeof config.media!=='string'||!/^\d{1,5}$/.test(config.media))throw Error('Enter the numeric 8 × 12 media code shown by the Windows driver.');
}
export function windowsState(job,expectedId,expectedDocument){
 if(job.jobId!==expectedId||job.document!==expectedDocument||!Number.isInteger(job.status)||job.status<0)throw Error('Windows could not verify this exact print job. Inspect the queue.');
 const s=job.status;
 // Error flags take precedence even when a driver also reports Printed.
 if(s&(1|2|4|32|64|256|512|1024))return 6;
 if(s&128)return 9; // JOB_STATUS_PRINTED. COMPLETE (4096) is only sent-to-printer.
 if(s&4096)throw Object.assign(Error('Windows reports sent to printer, but not printed. Inspect the output and resolve in the print desk.'),{code:'SENT_NOT_CONFIRMED'});
 if(s&(8|16))return 5;
 if(s===0)return 3;
 throw Error('Windows print status needs operator review.');
}
export function windowsAdapter(config,bridge=windowsBridge){
 validateWindowsConfig(config);
 return {format:'windows',extension:'.print.json',
  async preflight(){const p=await bridge({action:'diagnostics',printer:config.printer});if(p.status&(1|2|8|16|64|128|4096|1048576|4194304))throw Error('Printer needs attention before a new sheet can be submitted.');if(!(p.attributes&256))throw Error('Enable Keep printed documents before automatic printing.');},
  async submit(file){const document='Atelier-Win'+randomUUID().replaceAll('-','');const r=await bridge({action:'submit',printer:config.printer,media:config.media,profile:config.profile||'ds820-8x12',file,document});if(!Number.isInteger(r.jobId)||r.jobId<1)throw Error('Windows returned no verifiable print job ID. Inspect the printer.');return document.slice(8)+'-'+r.jobId;},
  async status(spoolerJob){const match=/^(Win[a-f0-9]{32})-([1-9][0-9]*)$/.exec(spoolerJob);if(!match)throw Error('Invalid Windows print receipt.');const jobId=Number(match[2]),document='Atelier-'+match[1];const job=await bridge({action:'status',printer:config.printer,jobId});const state=windowsState(job,jobId,document);if(job.status&(4|256))return 6;if(state===9)return 9;const health=await bridge({action:'diagnostics',printer:config.printer});if((health.status&(1|2|8|16|64|128|4096|1048576|4194304))||(job.status&(1|2|32|64|512|1024)))return {recoverable:true,message:'Printer needs attention (paper, connection or driver). Correct the condition. Monitoring this same job; no new sheets will be sent.'};return state;}
 };
}
export async function listWindowsPrinters(){return (await windowsBridge({action:'printers'})).text;}
export async function listWindowsMedia(printer){validateWindowsConfig({printer,media:'0'});return (await windowsBridge({action:'media',printer})).text;}
