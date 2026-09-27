import {readFile,writeFile,rename,mkdir} from 'node:fs/promises';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
async function read(path){try{return JSON.parse(await readFile(path,'utf8'));}catch(e){if(e.code==='ENOENT')return null;throw e;}}
export async function currentPilotDirectory(base){
 const pointer=await read(join(base,'active-run.json'));
 if(!pointer)return base; // Preserve the original pilot in place.
 if(!/^[a-f0-9-]{36}$/.test(pointer.id))throw Error('Invalid saved pilot reference.');
 return join(base,'runs',pointer.id);
}
// Caller holds the shared base/pilot.lock across preparation and printing.
export async function createPilotRun(base){
 const previous=await currentPilotDirectory(base),manifest=await read(join(previous,'pilot.json')),journal=await read(join(previous,'journal','current.json'));
 if(journal||manifest&&!manifest.completed)throw Error('An earlier test is unfinished. Use Start Letter Pilot.cmd to resume it before creating a new test.');
 if(previous!==base&&!manifest)throw Error('The previous test was not fully prepared. Inspect it before creating another run.');
 const id=randomUUID(),directory=join(base,'runs',id);await mkdir(directory,{recursive:true});
 await writeFile(join(base,'active-run.json.tmp'),JSON.stringify({id,createdAt:new Date().toISOString()}));await rename(join(base,'active-run.json.tmp'),join(base,'active-run.json'));
 return directory;
}
