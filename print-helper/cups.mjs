import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
const exec=promisify(execFile);
function attr(tag,name,value){const n=Buffer.from(name),v=Buffer.from(value),b=Buffer.alloc(5+n.length+v.length);b[0]=tag;b.writeUInt16BE(n.length,1);n.copy(b,3);b.writeUInt16BE(v.length,3+n.length);v.copy(b,5+n.length);return b;}
export function statusRequest(jobId){
 if(!Number.isInteger(jobId)||jobId<1)throw Error('Invalid CUPS job ID');
 const header=Buffer.from([1,1,0,9,0,0,0,1,1]);
 return Buffer.concat([header,attr(0x47,'attributes-charset','utf-8'),attr(0x48,'attributes-natural-language','en'),attr(0x45,'job-uri','ipp://localhost/jobs/'+jobId),attr(0x44,'requested-attributes','job-state'),attr(0x44,'','job-id'),Buffer.from([3])]);
}
export function parseStatus(buffer,expectedId){
 const b=Buffer.from(buffer);if(b.length<9||b.readUInt16BE(2)>0xff||b.readUInt32BE(4)!==1)throw Error('CUPS job lookup failed');
 let offset=8,last='',state=null,id=null;
 while(offset<b.length){const tag=b[offset++];if(tag===3)break;if(tag<=0x0f)continue;if(offset+2>b.length)throw Error('Invalid IPP response');const nl=b.readUInt16BE(offset);offset+=2;if(offset+nl+2>b.length)throw Error('Invalid IPP response');const name=nl?b.subarray(offset,offset+nl).toString():last;offset+=nl;last=name;const vl=b.readUInt16BE(offset);offset+=2;if(offset+vl>b.length)throw Error('Invalid IPP response');if(vl===4&&(tag===0x21||tag===0x23)){if(name==='job-state')state=b.readInt32BE(offset);if(name==='job-id')id=b.readInt32BE(offset);}offset+=vl;}
 if(id!==expectedId||!Number.isInteger(state))throw Error('CUPS did not return this job’s status');return state;
}
export function cupsAdapter(config){
 if(process.platform!=='darwin')throw Error('This printer adapter requires macOS.');
 if(!/^[A-Za-z0-9_.-]{1,100}$/.test(config.printer)||typeof config.media!=='string'||! /^[A-Za-z0-9_.-]{1,100}$/.test(config.media))throw Error('Select a valid installed printer and media option.');
 return {
  async submit(file,title){const {stdout}=await exec('/usr/bin/lp',['-d',config.printer,'-n','1','-t','Atelier-'+title,'-o','media='+config.media,'-o','orientation-requested=3','-o','print-scaling=none','-o','scaling=100','-o','number-up=1','-o','job-sheets=none',file],{timeout:30000,env:{...process.env,LANG:'C',LC_ALL:'C'}});const match=stdout.match(/request id is ([A-Za-z0-9_.-]+-([0-9]+))/);if(!match)throw Error('CUPS accepted no verifiable job ID; inspect the printer.');return match[1];},
  async status(spoolerJob){const id=Number(spoolerJob.match(/-([0-9]+)$/)?.[1]);const r=await fetch('http://localhost:631/jobs/'+id,{method:'POST',headers:{'Content-Type':'application/ipp'},body:statusRequest(id),signal:AbortSignal.timeout(10000)});if(!r.ok)throw Error('Mac printer status is unavailable.');return parseStatus(await r.arrayBuffer(),id);}
 };
}
export async function listPrinters(){return (await exec('/usr/bin/lpstat',['-p','-d'],{timeout:10000})).stdout;}
export async function listMedia(printer){if(!/^[A-Za-z0-9_.-]{1,100}$/.test(printer))throw Error('Invalid printer');return (await exec('/usr/bin/lpoptions',['-p',printer,'-l'],{timeout:10000})).stdout;}
