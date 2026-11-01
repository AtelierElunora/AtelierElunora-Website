// Keep licensed binaries out of Git while making builds reproducible.
import {readFile,writeFile,mkdir,rename,rm} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const manifest=JSON.parse(await readFile(new URL('./brand-fonts.json',import.meta.url),'utf8'));
const root=new URL('../public/fonts/',import.meta.url);
const valid=(bytes,hash)=>bytes.length<=256*1024&&bytes.subarray(0,4).toString()==='OTTO'&&createHash('sha256').update(bytes).digest('hex')===hash;
await mkdir(root,{recursive:true});
for(const {filename,sha256} of manifest){
 if(!/^atelier-(script|modern)\.otf$/.test(filename))throw Error('Unexpected brand font');
 const target=new URL(filename,root);
 try{if(valid(await readFile(target),sha256))continue;}catch{}
 const response=await fetch('https://app-elunora-bookings-nvo32m3ban2cc.azurewebsites.net/fonts/'+filename,{signal:AbortSignal.timeout(30000)});
 if(!response.ok)throw Error('Supply the licensed Atelier font files in public/fonts before building.');
 const chunks=[];let length=0;
 for await(const chunk of response.body){length+=chunk.length;if(length>256*1024)throw Error('Brand font exceeds its expected size');chunks.push(chunk);}
 const bytes=Buffer.concat(chunks);
 if(!valid(bytes,sha256))throw Error('Brand font checksum mismatch; original assets are required.');
 const temporary=new URL(filename+'.tmp',root);
 try{await writeFile(temporary,bytes);await rename(temporary,target);}finally{await rm(temporary,{force:true});}
}
console.log('Atelier brand font checks passed');
