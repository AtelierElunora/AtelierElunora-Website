import {build} from 'esbuild';
import {readFile,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
const entry=fileURLToPath(new URL('../station/atelier-station.mjs',import.meta.url));
const output=new URL('../theme/assets/atelier-station.js',import.meta.url);
const result=await build({entryPoints:[entry],bundle:true,format:'iife',target:'es2020',minify:true,legalComments:'none',write:false});
const content=result.outputFiles[0].text;
if(process.argv.includes('--check')){
 if(await readFile(output,'utf8')!==content)throw Error('Station bundle is out of date. Run npm run build:station.');
 console.log('PASS: station bundle matches source and includes its helpers.');
}else{await writeFile(output,content);console.log('Built self-contained station asset.');}
