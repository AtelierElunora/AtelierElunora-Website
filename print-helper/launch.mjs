import {spawn} from 'node:child_process';
import {openSync,closeSync,mkdirSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {join,resolve} from 'node:path';
const here=fileURLToPath(new URL('.',import.meta.url));
export async function launchHelper({probe,start,open,wait=ms=>new Promise(r=>setTimeout(r,ms))}){
 if(!await probe()){
  await start();
  let ready=false;
  for(let i=0;i<40;i++){await wait(250);if(await probe()){ready=true;break;}}
  if(!ready)throw Error('Helper did not become ready. Close any older helper and open Start Atelier Print Helper to inspect the error.');
 }
 await open();
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const origin='http://127.0.0.1:4318';
 await launchHelper({
  probe:async()=>{try{const r=await fetch(origin+'/health',{signal:AbortSignal.timeout(800)});return r.ok&&(await r.json()).app==='atelier-print-helper';}catch{return false;}},
  start:async()=>{const state=join(here,'atelier-print-state');mkdirSync(state,{recursive:true});const fd=openSync(join(state,'launcher.log'),'a');try{const child=spawn(process.execPath,[join(here,'control.mjs')],{cwd:here,env:{...process.env,ATELIER_PRINT_NO_OPEN:'1'},detached:true,windowsHide:true,stdio:['ignore',fd,fd]});await new Promise((resolve,reject)=>{child.once('spawn',resolve);child.once('error',reject);});child.unref();}finally{closeSync(fd);}},
  open:async()=>{const child=spawn(process.platform==='darwin'?'/usr/bin/open':'explorer.exe',[origin],{windowsHide:true,detached:true,stdio:'ignore'});await new Promise((resolve,reject)=>{child.once('spawn',resolve);child.once('error',reject);});child.unref();}
 });
}
