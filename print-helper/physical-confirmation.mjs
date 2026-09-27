import {createInterface} from 'node:readline';
// A leftover Enter from the launcher is not an answer. Require an explicit word.
export function askPhysicalConfirmation({input=process.stdin,output=process.stdout}={}){
 return new Promise(resolve=>{
  let finished=false;
  const reader=createInterface({input,output,terminal:Boolean(input.isTTY&&output.isTTY)});
  const prompt=()=>output.write('Inspect the physical sheet. Did all four magnets print correctly? Type yes to confirm, or no to stop, then press Enter: ');
  const finish=value=>{if(finished)return;finished=true;reader.close();resolve(value);};
  reader.on('line',line=>{
   const answer=line.trim().toLowerCase();
   if(answer==='yes')return finish(true);
   if(answer==='no')return finish(false);
   output.write('\nWaiting for an explicit yes or no. An empty Enter does not confirm or stop printing.\n');prompt();
  });
  reader.once('close',()=>finish(false));
  input.once('error',()=>finish(false));
  prompt();
 });
}
