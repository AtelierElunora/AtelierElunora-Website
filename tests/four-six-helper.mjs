import assert from 'node:assert/strict';
import {sheetProfile,fourSixLayout} from '../print-helper/profiles.mjs';
import {mediaChoices,requireSavedPrinterSelection} from '../print-helper/setup.mjs';
import {renderSheets,calibrationSheet} from '../print-helper/render.mjs';
import {createRequire} from 'node:module';
const require=createRequire(new URL('../print-helper/package.json',import.meta.url));
const {PDFDocument}=require('pdf-lib'),{createCanvas}=require('@napi-rs/canvas');
assert.equal(sheetProfile('photo-4x6-single').capacity,1);
assert.deepEqual(fourSixLayout([3.6]),[{x:60,y:360,size:1080}]);
assert.throws(()=>fourSixLayout([3.75]));assert.throws(()=>fourSixLayout([3.6,3.6]));
assert.equal(mediaChoices('2 : Photo (4 x 6 inches)\n1 : Letter (Letter 8.5 x 11 test only)','win32','photo-4x6-single')[0].value,'2');
assert.equal(mediaChoices('PageSize/Media: *4x6 Letter 8x12','darwin','photo-4x6-single')[0].value,'4x6');
const c=createCanvas(30,30);c.getContext('2d').fillRect(0,0,30,30);
const jobs=[{id:'sample',quantity:2,x:50,y:50,zoom:1,template:{enabled:false,photoCutInches:3.6}}];
const images=new Map([['sample',c.toBuffer('image/png')]]);
const result=JSON.parse(await renderSheets(jobs,images,'Test',null,'windows','photo-4x6-single'));
assert.equal(result.width,1200);assert.equal(result.height,1800);assert.equal(result.pages.length,2);
for(const bytes of [await renderSheets(jobs,images,'Test',null,'pdf','photo-4x6-single'),await calibrationSheet('pdf','4x6')]){
 const pdf=await PDFDocument.load(bytes);for(const page of pdf.getPages()){assert.equal(page.getWidth(),288);assert.equal(page.getHeight(),432);}
}
const cal=JSON.parse(await calibrationSheet('windows','4x6'));assert.equal(cal.width,1200);assert.equal(cal.pages.length,1);
const selected={profile:'photo-4x6-single',printer:'Test HP',media:'127',fontPath:''};
assert.doesNotThrow(()=>requireSavedPrinterSelection(selected,selected));
assert.throws(()=>requireSavedPrinterSelection({...selected,profile:'letter-four',media:'1'},selected),/Save printer settings/);
assert.throws(()=>requireSavedPrinterSelection(selected,{}),/Save printer settings/);
console.log('PASS: 4x6 media filtering, one 3.6-inch magnet per sheet, exact PDF/raster dimensions, oversize rejection and calibration.');
