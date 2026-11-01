import {letteringHex} from "./lettering-color";
import {openSync} from "fontkit";
import path from "node:path";
import {fontFor,pointUnits,LETTERING_WIDTH,LETTERING_HEIGHT,type SaveDateFont} from "./save-date-fonts";
import {saveDateSvg,validateSaveDateDesign,type SaveDateDesign} from "./save-date-design";
const cache=new Map<SaveDateFont,ReturnType<typeof openSync>>();
function font(id:SaveDateFont){let f=cache.get(id);if(!f){f=openSync(path.join(process.cwd(),"public/fonts",fontFor(id).file));cache.set(id,f);}return f;}
export function outlinedLettering(text:string,id:SaveDateFont,points:number,centerY:number,ink:string){
  const f=font(id),run=f.layout(text.normalize("NFC")),b=run.bbox;
  const requested=pointUnits(points)/f.unitsPerEm;
  const width=b.maxX-b.minX,height=b.maxY-b.minY;
  const scale=Math.min(requested,LETTERING_WIDTH/Math.max(1,width),LETTERING_HEIGHT/Math.max(1,height));
  let x=0,y=0;
  const paths=run.glyphs.map((glyph,index)=>{const p=run.positions[index],d=glyph.path.toSVG(),output=d?`<path transform="translate(${x+p.xOffset},${y+p.yOffset})" d="${d}"/>`:"";x+=p.xAdvance;y+=p.yAdvance;return output;}).join("");
  const tx=500-(b.minX+b.maxX)*scale/2,ty=centerY+(b.minY+b.maxY)*scale/2;
  return `<g fill="${ink}" filter="url(#shade)"><g transform="translate(${tx},${ty}) scale(${scale},${-scale})">${paths}</g></g>`;
}
export function renderSaveDateSvg(design:SaveDateDesign){
 const d=validateSaveDateDesign(design),t=d.typography;
 if(!t)return saveDateSvg(d);
 const ink=letteringHex(d.ink);
 return saveDateSvg(d,(d.topEnabled?outlinedLettering(d.topText,t.topFont,t.topSize,110,ink):"")+outlinedLettering(d.bottomText,t.bottomFont,t.bottomSize,890,ink));
}
