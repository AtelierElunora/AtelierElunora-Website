export const borderThemes=['none','fineLine','christmas','winter','celebration','botanical','custom'];
export const stockBorderThemes=borderThemes.filter(x=>x!=='custom');
export const defaultBorderPolicy={enabled:true,themes:stockBorderThemes,custom:[]};
export function normalizeBorder(value){
 if(value==null||value.theme==='none')return null;
 if(!value||typeof value!=='object'||Array.isArray(value)||!borderThemes.includes(value.theme)||typeof value.color!=='string'||!/^#[a-f0-9]{6}$/i.test(value.color)||typeof value.width!=='number'||!Number.isFinite(value.width)||value.width<.015||value.width>.12)throw Error('invalid_photo_border');
 const result={theme:value.theme,color:value.color.toUpperCase(),width:value.width};
 if(value.theme==='custom'){
  if(typeof value.artwork!=='string'||value.artwork.length>174764||!/^iVBORw0KGgo[A-Za-z0-9+/]*={0,2}$/.test(value.artwork))throw Error('invalid_border_artwork');
  result.artwork=value.artwork;
 }
 return result;
}
export function normalizeBorderPolicy(value){
 if(!value||typeof value!=='object'||typeof value.enabled!=='boolean'||!Array.isArray(value.themes)||value.themes.length>stockBorderThemes.length||new Set(value.themes).size!==value.themes.length||value.themes.some(x=>!stockBorderThemes.includes(x))||!Array.isArray(value.custom)||value.custom.length>4)throw Error('invalid_border_policy');
 return {enabled:value.enabled,themes:[...new Set(['none',...value.themes])],custom:value.custom.map(x=>{if(typeof x.name!=='string'||!x.name.trim()||x.name.length>60||/[\x00-\x1f]/.test(x.name))throw Error('invalid_border_name');return {name:x.name,border:normalizeBorder({...x.border,theme:'custom'})};})};
}
export function permittedBorder(value,policy=defaultBorderPolicy){
 const border=normalizeBorder(value);if(!border)return null;
 if(!policy.enabled)throw Error('event_borders_disabled');
 if(border.theme==='custom'){
  if(!policy.custom.some(x=>x.border.artwork===border.artwork))throw Error('choose_an_event_border');
 }else if(!policy.themes.includes(border.theme))throw Error('choose_an_event_border');
 return border;
}
export function drawBorder(ctx,value,side,artwork=null){
 const b=normalizeBorder(value);if(!b)return;
 ctx.save();try{
  if(b.theme==='custom'){if(!artwork)throw Error('border_artwork_not_loaded');ctx.drawImage(artwork,0,0,side,side);return;}
  const w=side*b.width;ctx.strokeStyle=b.color;ctx.lineWidth=w;ctx.strokeRect(w/2,w/2,side-w,side-w);
  ctx.strokeStyle='rgba(255,255,255,0.8)';ctx.lineWidth=side*.002;ctx.strokeRect(w*.7,w*.7,side-w*1.4,side-w*1.4);
  if(b.theme==='fineLine')return;
  [[w,w],[side-w,w],[side-w,side-w],[w,side-w]].forEach(([x,y],i)=>{
   ctx.save();ctx.translate(x,y);ctx.rotate(i*Math.PI/2);const u=Math.max(side*.018,w*.34);
   if(['christmas','botanical'].includes(b.theme)){
    ctx.fillStyle=b.theme==='christmas'?'#2D593D':b.color;
    for(const a of [-.6,.6]){ctx.save();ctx.rotate(a);ctx.beginPath();ctx.ellipse(0,-u,u*.35,u,0,0,Math.PI*2);ctx.fill();ctx.restore();}
    ctx.fillStyle=b.theme==='christmas'?'#C63D46':'#DDD4AA';for(const dx of [-.55,.55]){ctx.beginPath();ctx.ellipse(u*dx,u*.25,u*.4,u*.4,0,0,Math.PI*2);ctx.fill();}
   }else if(b.theme==='winter'){
    ctx.strokeStyle='#FFFFFF';ctx.lineWidth=side*.004;
    for(let j=0;j<6;j++){const a=j*Math.PI/3;ctx.beginPath();ctx.moveTo(0,0);ctx.lineTo(Math.cos(a)*u*1.6,Math.sin(a)*u*1.6);ctx.stroke();}
   }else if(b.theme==='celebration'){
    ctx.fillStyle='#FFF5CF';for(let j=0;j<5;j++){const a=j*Math.PI*.4;ctx.beginPath();ctx.ellipse(Math.cos(a)*u*1.4,Math.sin(a)*u*1.4,u*.25,u*.25,0,0,Math.PI*2);ctx.fill();}
   }
   ctx.restore();
  });
 }finally{ctx.restore();}
}
export async function loadBorderArtwork(border,loader){const b=normalizeBorder(border);return b?.theme==='custom'?loader('data:image/png;base64,'+b.artwork):null;}
export function sameBorder(a,b){return JSON.stringify(normalizeBorder(a))===JSON.stringify(normalizeBorder(b));}
// Server print artwork and browser previews use the same dimensions and geometry.
export function borderSvg(value,side=1000){
 const b=normalizeBorder(value);if(!b)return '';
 if(b.theme==='custom')return `<image width="${side}" height="${side}" href="data:image/png;base64,${b.artwork}"/>`;
 const w=side*b.width,u=Math.max(side*.018,w*.34);let svg=`<rect x="${w/2}" y="${w/2}" width="${side-w}" height="${side-w}" fill="none" stroke="${b.color}" stroke-width="${w}"/><rect x="${w*.7}" y="${w*.7}" width="${side-w*1.4}" height="${side-w*1.4}" fill="none" stroke="white" stroke-opacity=".8" stroke-width="${side*.002}"/>`;
 if(b.theme==='fineLine')return svg;
 for(const [i,[x,y]]of [[w,w],[side-w,w],[side-w,side-w],[w,side-w]].entries()){
  svg+=`<g transform="translate(${x} ${y}) rotate(${i*90})">`;
  if(['christmas','botanical'].includes(b.theme)){
   for(const a of [-.6,.6])svg+=`<ellipse cx="0" cy="${-u}" rx="${u*.35}" ry="${u}" transform="rotate(${a*180/Math.PI})" fill="${b.theme==='christmas'?'#2D593D':b.color}"/>`;
   for(const dx of [-.55,.55])svg+=`<circle cx="${u*dx}" cy="${u*.25}" r="${u*.4}" fill="${b.theme==='christmas'?'#C63D46':'#DDD4AA'}"/>`;
  }else if(b.theme==='winter'){for(let j=0;j<6;j++){const a=j*Math.PI/3;svg+=`<path d="M0 0L${Math.cos(a)*u*1.6} ${Math.sin(a)*u*1.6}" stroke="white" stroke-width="${side*.004}"/>`;}}
  else if(b.theme==='celebration'){for(let j=0;j<5;j++){const a=j*Math.PI*.4;svg+=`<circle cx="${Math.cos(a)*u*1.4}" cy="${Math.sin(a)*u*1.4}" r="${u*.25}" fill="#FFF5CF"/>`;}}
  svg+='</g>';
 }return svg;
}
