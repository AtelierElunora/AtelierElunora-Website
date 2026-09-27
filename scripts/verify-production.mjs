import assert from 'node:assert/strict';
import {readFile, readdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolve, dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {transform} from 'esbuild';

const root=fileURLToPath(new URL('../',import.meta.url));
const manifest=JSON.parse(await readFile(root+'docs/production-source-manifest.json','utf8'));
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const candidateMode=process.argv.includes('--candidate');
const overrides=new Map();
if(candidateMode){
 const candidate=JSON.parse(await readFile(root+'docs/source-candidate.json','utf8'));
 assert.equal(candidate.status,'not-deployed');
 for(const change of candidate.changes){
  assert.ok(!overrides.has(change.path),`Duplicate candidate path: ${change.path}`);
  const baseline=manifest.files.find(f=>f.path===change.path);
  assert.ok(baseline,`Candidate has no production baseline: ${change.path}`);
  assert.equal(change.productionSha256,baseline.sha256,`Candidate baseline changed: ${change.path}`);
  assert.match(change.sha256,/^[a-f0-9]{64}$/);
  overrides.set(change.path,change.sha256);
 }
}
let checked=0;
for(const file of manifest.files){
 const bytes=await readFile(resolve(root,file.path));
 assert.equal(hash(bytes),overrides.get(file.path)??file.sha256,`Production snapshot differs: ${file.path}. Review and update provenance when intentionally changing source.`);
 checked++;
}
for(const fn of manifest.functions){
 const directory=resolve(root,'supabase/functions',fn.slug);
 assert.deepEqual((await readdir(directory)).sort(),fn.files.map(f=>f.name).sort(),`Function file set differs: ${fn.slug}`);
 for(const f of fn.files){
  if(!/\.(?:mjs|mts|js|ts)$/.test(f.name))continue;
  const code=await readFile(resolve(directory,f.name),'utf8');
  await transform(code,{loader:/\.(?:mts|ts)$/.test(f.name)?'ts':'js',target:'esnext'});
  for(const match of code.matchAll(/(?:from\s*|import\s*\()\s*['"](\.\.?\/[^'"]+)['"]/g)){
   await readFile(resolve(dirname(resolve(directory,f.name)),match[1]));
  }
 }
}
for(const f of manifest.files.filter(f=>f.path.startsWith('theme/'))){
 const path=resolve(root,f.path);
 if(f.path.endsWith('.js'))await transform(await readFile(path,'utf8'),{loader:'js',target:'es2020'});
 if(f.path.endsWith('.json')){
  const json=(await readFile(path,'utf8')).replace(/"(?:\\.|[^"\\])*"|\/\*[\s\S]*?\*\/|\/\/[^\r\n]*/g,part=>part.startsWith('"')?part:'');
  JSON.parse(json);
 }
}
assert.equal((await readdir(root+'supabase/migrations')).filter(f=>f.endsWith('.sql')).length,manifest.migrations.length);
console.log(`PASS: ${checked} ${candidateMode?'candidate/baseline':'recovered'} source hashes, exact deployed function file sets, local imports, theme/backend JavaScript syntax, theme JSON, and ${manifest.migrations.length} migration files.`);
if(candidateMode)console.log(`Includes ${overrides.size} explicitly recorded, not-deployed changes. Production baseline is retained separately.`);
console.log('This verifies the captured source, not physical camera/printing behavior or a full disaster-recovery restore.');
