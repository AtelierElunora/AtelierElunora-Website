import {build} from 'esbuild';
import {readFile,writeFile} from 'node:fs/promises';
const entries=[
 ['dashboard','shopify-owner-app/dashboard/app.jsx','atelier-owner-studio.js'],
 ['station','station/atelier-station.mjs','atelier-station.js'],
 ['experience','experience/guest.mjs','atelier-experience.js'],
 ['experience','experience/later-product.mjs','atelier-upload-later.js'],
];
const only=process.argv.find(a=>a.startsWith('--only='))?.slice(7);
for(const [group,entry,asset] of entries){
 if(only&&group!==only)continue;
 const result=await build({entryPoints:[entry],bundle:true,format:'iife',target:'es2020',jsxFactory:'h',jsxFragment:'Fragment',minify:true,legalComments:'none',write:false});
 const output='theme/assets/'+asset;
 const generated=result.outputFiles[0].text,existing=await readFile(output,'utf8');
 if(generated.replace(/[\r\n]+$/,'')===existing.replace(/[\r\n]+$/,''))console.log('PASS: recovered source rebuilds '+asset+' (final newline ignored).');
 else if(process.argv.includes('--write')){await writeFile(output,generated);console.log('Built '+asset+'. Review and update production provenance before deployment.');}
 else throw Error('Recovered source no longer matches '+asset);
}
