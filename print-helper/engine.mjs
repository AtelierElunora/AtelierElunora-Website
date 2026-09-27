import {open,readFile,rename,mkdir} from 'node:fs/promises';
import {join} from 'node:path';
import {createHash} from 'node:crypto';

export class Journal{
 constructor(dir){this.dir=dir;this.path=join(dir,'current.json');}
 async syncDirectory(){if(process.platform==='darwin'){const dir=await open(this.dir,'r');try{await dir.sync();}finally{await dir.close();}}}
 async read(){try{return JSON.parse(await readFile(this.path,'utf8'));}catch(e){if(e.code==='ENOENT')return null;throw e;}}
 async write(value){await mkdir(this.dir,{recursive:true,mode:0o700});const f=await open(this.path+'.tmp','w',0o600);try{await f.writeFile(JSON.stringify(value,null,2));await f.sync();}finally{await f.close();}await rename(this.path+'.tmp',this.path);await this.syncDirectory();}
 async archive(value){const f=await open(join(this.dir,value.id+'.json'),'w',0o600);try{await f.writeFile(JSON.stringify(value,null,2));await f.sync();}finally{await f.close();}await this.write(null);}
}
// The durable "submitting" boundary is intentionally not automatically retryable.
export async function advance(job,{journal,submit,status,complete,authorize,read=readFile}){
 if(job.state==='prepared'){
  const bytes=await read(job.file);if(createHash('sha256').update(bytes).digest('hex')!==job.sha256)throw Error('Prepared sheet changed. Review required.');
  await authorize(job);
  job={...job,state:'submitting'};await journal.write(job);
  const spoolerJob=await submit(job.file,job.id);job={...job,state:'submitted',spoolerJob};await journal.write(job);
 }
 if(job.state==='submitting')throw Error('Printer submission outcome is uncertain. Check the computer print queue before resolving this job.');
 if(job.state==='submitted'){
  const state=await status(job.spoolerJob);
  if([4,6,7,8].includes(state))throw Error('Printer job needs attention (state '+state+'). Check paper, ribbon and the computer print queue.');
  if(state!==9){if(![3,5].includes(state))throw Error('Printer job status is unavailable. Review required.');return job;}
  job={...job,state:'computer-completed'};await journal.write(job);
 }
 if(job.state==='computer-completed'){
  await complete(job);job={...job,state:'recorded',completedAt:new Date().toISOString()};await journal.write(job);
 }
 if(job.state==='recorded')await journal.archive(job);
 return job;
}
