import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile,mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {windowsAdapter,windowsState,validateWindowsConfig} from '../print-helper/windows.mjs';
import {renderSheets,calibrationSheet} from '../print-helper/render.mjs';
import {advance,Journal} from '../print-helper/engine.mjs';
import {createCanvas,loadImage} from '../print-helper/node_modules/@napi-rs/canvas/index.js';
const doc='Atelier-Win'+'a'.repeat(32),status=s=>windowsState({jobId:42,document:doc,status:s},42,doc);
assert.equal(status(0),3);assert.equal(status(8),5);assert.equal(status(16),5);assert.equal(status(128),9);assert.equal(status(128|8192),9);
for(const bit of [1,2,4,32,64,256,512,1024])assert.equal(status(bit|128),6);
assert.throws(()=>status(4096),/not printed/);assert.throws(()=>status(8192),/review/);assert.throws(()=>status(2048),/review/);
assert.throws(()=>windowsState({jobId:43,document:doc,status:128},42,doc),/exact/);assert.throws(()=>windowsState({jobId:42,document:'Another job',status:128},42,doc),/exact/);
validateWindowsConfig({printer:'DNP DS820A (USB 1)',media:'257'});assert.throws(()=>validateWindowsConfig({printer:'DNP\nInjected',media:'257'}));assert.throws(()=>validateWindowsConfig({printer:'DNP',media:'8x12;run'}));
let calls=[],nativeDoc,state=16;
const adapter=windowsAdapter({printer:'DNP DS820A (USB 1)',media:'257'},async body=>{calls.push(body);if(body.action==='diagnostics')return {status:0};if(body.action==='submit'){nativeDoc=body.document;return {jobId:42};}return {jobId:42,document:nativeDoc,status:state};});
const receipt=await adapter.submit('C:\\Private photos\\sheet.print.json');assert.match(receipt,/^Win[a-f0-9]{32}-42$/);assert.equal(calls[0].file,'C:\\Private photos\\sheet.print.json');assert.equal(calls[0].media,'257');assert.equal(await adapter.status(receipt),5);state=128;assert.equal(await adapter.status(receipt),9);await assert.rejects(adapter.status('DNP-42'),/Invalid/);
const image=createCanvas(100,100);image.getContext('2d').fillRect(0,0,100,100);
const bytes=await renderSheets([{id:'photo',quantity:7,x:50,y:50,zoom:1,template:{enabled:false,photoCutInches:3.75}}],new Map([['photo',image.toBuffer('image/png')]]),'Test',null,'windows');
const sheets=JSON.parse(bytes);assert.equal(sheets.format,'atelier-windows-sheets-v1');assert.equal(sheets.pages.length,2);
for(const png of sheets.pages){const raster=await loadImage(Buffer.from(png,'base64'));assert.equal(raster.width,2400);assert.equal(raster.height,3600);}
const calibration=JSON.parse(await calibrationSheet('windows'));assert.equal(calibration.pages.length,1);assert.equal((await loadImage(Buffer.from(calibration.pages[0],'base64'))).width,2400);
// Real journal serialization plus adapter ensures a restart polls the same ID without resubmission.
const dir=await mkdtemp(join(tmpdir(),'atelier-windows-test-'));
try {
 const journal=new Journal(dir),job={id:'test',state:'prepared',file:'sheet.print.json',sha256:createHash('sha256').update(bytes).digest('hex')};let acks=0;state=16;
 const deps={journal,...adapter,read:async()=>bytes,authorize:async()=>{},complete:async()=>{acks++;}};
 await advance(job,deps);const submitted=await journal.read(),count=calls.filter(c=>c.action==='submit').length;
 assert.equal(submitted.state,'submitted');await advance(submitted,deps);assert.equal(calls.filter(c=>c.action==='submit').length,count);
 state=128;await advance(await journal.read(),deps);assert.equal(acks,1);assert.equal(await journal.read(),null);
 assert.equal(JSON.parse(await readFile(join(dir,'test.json'),'utf8')).state,'recorded');
} finally {await rm(dir,{recursive:true});}
console.log('PASS: Windows job identity and error precedence, no completion from disappearance/sent status, safe argument transport, 8×12 raster sheets, calibration, durable restart without duplicate submission.');
