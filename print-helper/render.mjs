import {createCanvas,loadImage,GlobalFonts} from '@napi-rs/canvas';
import {PDFDocument} from 'pdf-lib';
import {sheetProfile,letterFourLayout,fourSixLayout} from './profiles.mjs';
import {cropRect,ds820Layout,drawMagnet,drawVerticalCutGuides,normalizeTemplate} from '../theme/assets/atelier-station-core.js';
export function windowsSheets(pages,width=2400,height=3600){return Buffer.from(JSON.stringify({format:'atelier-windows-sheets-v1',width,height,pages:pages.map(p=>p.toString('base64'))}));}
export async function renderSheets(jobs,images,eventName,fontPath,format='pdf',profileId='ds820-8x12'){
 const profile=sheetProfile(profileId);
 if(jobs.some(j=>j.template?.enabled)&&(!fontPath||!GlobalFonts.registerFromPath(fontPath,'Brown Carolina')))throw Error('Select your licensed Brown Carolina print font before printing wrap text.');
 const copies=jobs.flatMap(j=>Array.from({length:j.quantity},()=>j));if(!copies.length||copies.length>72)throw Error('Invalid sheet quantity.');
 const decoded=new Map();for(const [id,data]of images)decoded.set(id,await loadImage(data));
 const pdf=await PDFDocument.create(),rasters=[];
 for(let offset=0;offset<copies.length;offset+=profile.capacity){
  const group=copies.slice(offset,offset+profile.capacity),templates=group.map(j=>normalizeTemplate(j.template)),slots=(profileId==='photo-4x6-single'?fourSixLayout:profileId==='letter-four'?letterFourLayout:ds820Layout)(templates.map(t=>t.enabled?t.cutInches:t.photoCutInches));
  const canvas=createCanvas(profile.width,profile.height),ctx=canvas.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,profile.width,profile.height);
  group.forEach((j,i)=>{const image=decoded.get(j.id);if(!image)throw Error('Missing photo');drawMagnet(ctx,image,cropRect(image.width,image.height,j.x,j.y,j.zoom??1),slots[i],templates[i],{name:eventName,photo:j.id.slice(0,8)});});
  drawVerticalCutGuides(ctx,slots);const png=canvas.toBuffer('image/png');
  if(format==='windows'){rasters.push(png);continue;}
  const image=await pdf.embedPng(png);const width=profile.width/300*72,height=profile.height/300*72;const page=pdf.addPage([width,height]);page.drawImage(image,{x:0,y:0,width,height});
 }
 return format==='windows'?windowsSheets(rasters,profile.width,profile.height):pdf.save();
}
export async function calibrationSheet(format='pdf',profile='8x12'){
 if(profile==='4x6'){
  const canvas=createCanvas(1200,1800),ctx=canvas.getContext('2d');ctx.fillStyle='white';ctx.fillRect(0,0,1200,1800);ctx.fillStyle='black';ctx.strokeStyle='black';ctx.lineWidth=2;ctx.font='32px sans-serif';ctx.fillText('Atelier Elunora | 4 x 6 test',70,150);ctx.strokeRect(60,360,1080,1080);ctx.fillText('Square: 3.6 x 3.6 inches. No scaling.',70,1580);
  const png=canvas.toBuffer('image/png');if(format==='windows')return windowsSheets([png],1200,1800);
  const pdf=await PDFDocument.create(),page=pdf.addPage([288,432]),image=await pdf.embedPng(png);page.drawImage(image,{x:0,y:0,width:288,height:432});return pdf.save();
 }
 if(profile==='letter'){
  if(format==='windows'){
   const canvas=createCanvas(2550,3300),ctx=canvas.getContext('2d');ctx.fillStyle='white';ctx.fillRect(0,0,2550,3300);ctx.fillStyle='black';ctx.strokeStyle='black';ctx.lineWidth=2;ctx.font='48px sans-serif';ctx.fillText('Atelier Elunora | Letter 8.5 x 11 test',150,225);ctx.strokeRect(300,600,1080,1080);ctx.fillText('Square: exactly 3.6 x 3.6 inches.',150,1900);ctx.fillText('Measure both axes. No fit-to-page scaling.',150,2000);ctx.fillText('Connection test only — confirm physical output.',150,2120);return windowsSheets([canvas.toBuffer('image/png')],2550,3300);
  }
  const pdf=await PDFDocument.create(),p=pdf.addPage([612,792]);p.drawText('Atelier Elunora | Letter 8.5 x 11 test',{x:36,y:738,size:14});p.drawRectangle({x:72,y:378,width:259.2,height:259.2,borderWidth:.5});p.drawText('Square: exactly 3.6 x 3.6 inches. No scaling.',{x:36,y:330,size:12});return pdf.save();
 }
 if(format==='windows'){
  const canvas=createCanvas(2400,3600),ctx=canvas.getContext('2d');ctx.fillStyle='white';ctx.fillRect(0,0,2400,3600);ctx.fillStyle='black';ctx.strokeStyle='black';ctx.lineWidth=2;
  ctx.font='58px sans-serif';ctx.fillText('Atelier Elunora | DS820A 8 x 12 calibration',150,225);ctx.strokeRect(300,675,1080,1080);
  ctx.font='50px sans-serif';ctx.fillText('This square must measure exactly 3.6 x 3.6 inches.',150,1933);ctx.fillText('Measure both axes and verify cutter fit.',150,2025);
  return windowsSheets([canvas.toBuffer('image/png')]);
 }
 const pdf=await PDFDocument.create(),p=pdf.addPage([576,864]);p.drawText('Atelier Elunora | DS820A 8 x 12 calibration',{x:36,y:810,size:14});p.drawRectangle({x:72,y:432,width:259.2,height:259.2,borderWidth:0.5});p.drawText('This square must measure exactly 3.6 x 3.6 inches.',{x:36,y:400,size:12});p.drawText('Measure all sides. Disable scaling and verify cutter fit.',{x:36,y:378,size:12});return pdf.save();
}
