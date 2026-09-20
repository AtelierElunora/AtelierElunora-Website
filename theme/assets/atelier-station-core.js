export function cropRect(width,height,x=50,y=50,zoom=1){
 if(!(width>0&&height>0)||!Number.isFinite(zoom)||zoom<1||zoom>3||![x,y].every(v=>Number.isFinite(v)&&v>=0&&v<=100))throw Error('Invalid crop');
 const size=Math.min(width,height)/zoom;return {sx:(width-size)*x/100,sy:(height-size)*y/100,size};
}
export function sheetLayout(quantity,cutInches=2.5){
 if(!Number.isInteger(quantity)||quantity<1||quantity>12||!Number.isFinite(cutInches)||cutInches<2.5||cutInches>3.75)throw Error('Use 1–12 magnets and a cut size of 2.5–3.75 inches.');
 const size=Math.round(cutInches*300),gap=30,perPage=2*size+gap<=1800?2:1;
 return Array.from({length:Math.ceil(quantity/perPage)},(_,page)=>{const count=Math.min(perPage,quantity-page*perPage),left=(1800-count*size-(count-1)*gap)/2;return Array.from({length:count},(_,i)=>({x:left+i*(size+gap),y:(1200-size)/2,size}));});
}

export const templateSides=['top','right','bottom','left'];
export function normalizeTemplate(input={}){
 if(!input||typeof input!=='object'||Array.isArray(input))throw Error('Invalid magnet template.');
 const num=(key,fallback,min,max)=>{const v=input[key]??fallback;if(typeof v!=='number'||!Number.isFinite(v)||v<min||v>max)throw Error('Invalid '+key+'.');return v;};
 const text=(v,max=100)=>{if(typeof v!=='string'||v.length>max||/[\u0000-\u001f]/.test(v))throw Error('Use a single text line of at most '+max+' characters.');return v;};
 const color=(v)=>{if(typeof v!=='string'||!/^#[a-f0-9]{6}$/i.test(v))throw Error('Use a six-digit hex color.');return v;};
 if(input.enabled!==undefined&&typeof input.enabled!=='boolean')throw Error('Invalid template switch.');
 const t={enabled:input.enabled??false,photoCutInches:num('photoCutInches',2.5,2.5,3.75),cutInches:num('cutInches',3.25,3,3.75),fontSize:num('fontSize',7,5,12),edgeInset:num('edgeInset',0.12,0.06,0.25),background:color(input.background??'#EBE5D9'),color:color(input.color??'#252B1D'),company:text(input.company??'Atelier Elunora'),couple:text(input.couple??''),date:text(input.date??'',40),sides:{}};
 // Leave room between text and both the outer cut and front fold.
 if(t.edgeInset+t.fontSize/144>(t.cutInches-2.5)/2-0.06)throw Error('Move text closer to the outside edge or reduce its size.');
 for(const side of templateSides){const row=input.sides?.[side]??{source:({top:'company',right:'date',bottom:'couple',left:'photo'})[side],text:'',offset:0,rotate:0};if(!['blank','custom','company','couple','date','event','photo'].includes(row.source))throw Error('Invalid text source.');const offset=row.offset??0,rotate=row.rotate??0;if(typeof offset!=='number'||!Number.isFinite(offset)||Math.abs(offset)>0.04||![0,180].includes(rotate))throw Error('Invalid side positioning.');if(t.edgeInset+offset-t.fontSize/144<0.015||t.edgeInset+offset+t.fontSize/144>(t.cutInches-2.5)/2-0.04)throw Error('Text is too close to a cut or fold. Adjust position or text size.');t.sides[side]={source:row.source,text:text(row.text??''),offset,rotate};}
 return t;
}
export function resolveTemplateText(t,side,context={}){const row=t.sides[side];return row.source==='blank'?'':row.source==='custom'?row.text:row.source==='event'?context.name??'':row.source==='photo'?String(context.photo??''):t[row.source]??'';}

export function drawMagnet(ctx,picture,crop,slot,template,context={},guides=false){
 const t=normalizeTemplate(template),scale=slot.size/t.cutInches,face=2.5*scale,margin=(slot.size-face)/2;
 if(!t.enabled){ctx.drawImage(picture,crop.sx,crop.sy,crop.size,crop.size,slot.x,slot.y,slot.size,slot.size);return;}
 ctx.save();ctx.translate(slot.x,slot.y);ctx.fillStyle=t.background;ctx.fillRect(0,0,slot.size,slot.size);
 ctx.drawImage(picture,crop.sx,crop.sy,crop.size,crop.size,margin,margin,face,face);
 ctx.fillStyle=t.color;ctx.textAlign='center';ctx.textBaseline='middle';ctx.font=(t.fontSize*scale/72)+'px "Brown Carolina", Arial, sans-serif';
 templateSides.forEach((side,i)=>{const row=t.sides[side],text=resolveTemplateText(t,side,context);if(!text)return;ctx.save();ctx.translate(slot.size/2,slot.size/2);ctx.rotate(i*Math.PI/2);ctx.translate(0,-slot.size/2+(t.edgeInset+row.offset)*scale);ctx.rotate(row.rotate*Math.PI/180);ctx.fillText(text,0,0,face-0.3*scale);ctx.restore();});
 if(guides){ctx.strokeStyle='#b34c26';ctx.lineWidth=1;ctx.setLineDash([6,4]);ctx.strokeRect(margin,margin,face,face);ctx.setLineDash([]);}
 ctx.restore();
}

export function letterLayout(cuts){
 if(!Array.isArray(cuts)||cuts.length<1||cuts.length>6||cuts.some(c=>!Number.isFinite(c)||c<2.5||c>3.6))throw Error('Letter sheets hold up to six designs with cuts of 2.5–3.6 inches.');
 const cell=Math.round(Math.max(...cuts)*300),gap=30,left=(2550-2*cell-gap)/2,top=(3300-3*cell)/2;
 return cuts.map((cut,i)=>{const size=Math.round(cut*300);return {x:left+(i%2)*(cell+gap)+(cell-size)/2,y:top+Math.floor(i/2)*cell+(cell-size)/2,size};});
}
