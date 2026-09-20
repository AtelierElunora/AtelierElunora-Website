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
