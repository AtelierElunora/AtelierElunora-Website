import {spawn,execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {readFile,writeFile,mkdir,rename} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {windowsBridge} from './windows.mjs';
const directory=()=>resolve(process.env.ATELIER_PRINT_STATE||'./atelier-print-state');
const exec=promisify(execFile),service='com.atelierelunora.print-helper.v1';
export async function saveCredential(token){
 if(!/^[a-f0-9]{64}$/.test(token))throw Error('Invalid helper credential');
 if(process.platform==='win32'){
  const encrypted=await windowsBridge({action:'protect',credential:token});
  await mkdir(directory(),{recursive:true});const file=join(directory(),'credential.dpapi');
  await writeFile(file+'.tmp',encrypted.credential,{mode:0o600});await rename(file+'.tmp',file);
  if(await readCredential()!==token)throw Error('Windows could not verify the saved credential.');return;
 }
 if(process.platform!=='darwin')throw Error('Pairing requires Windows or macOS.');
 await new Promise((resolve,reject)=>{const child=spawn('/usr/bin/security',['-i'],{stdio:['pipe','ignore','pipe']});child.stderr.resume();child.on('error',reject);child.on('exit',code=>code?reject(Error('Could not save helper credential in Keychain.')):resolve());child.stdin.end(`add-generic-password -U -a atelier-helper -s ${service} -w ${token}\n`);});
 if(await readCredential()!==token)throw Error('Keychain did not save the new pairing credential.');
}
export async function readCredential(){
 if(process.platform==='win32'){const encrypted=await readFile(join(directory(),'credential.dpapi'),'utf8');const result=await windowsBridge({action:'unprotect',credential:encrypted});if(!/^[a-f0-9]{64}$/.test(result.credential))throw Error('Re-pair the helper.');return result.credential;}
 if(process.platform!=='darwin')throw Error('Use macOS Keychain for automatic printing.');
 const {stdout}=await exec('/usr/bin/security',['find-generic-password','-a','atelier-helper','-s',service,'-w']);const token=stdout.trim();if(!/^[a-f0-9]{64}$/.test(token))throw Error('Re-pair the helper.');return token;
}
