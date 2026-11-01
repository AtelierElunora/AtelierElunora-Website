import {borderThemes,normalizeBorder,drawBorder,defaultBorderPolicy} from './magnet-borders.mjs';
export const titles={none:'No border',fineLine:'Fine line',christmas:'Christmas',winter:'Winter',celebration:'Celebration',botanical:'Botanical',custom:'Custom PNG'};
const colors={christmas:'#8B2536',winter:'#53788B',celebration:'#B59B62',botanical:'#576248'};
const el=(tag,text)=>{const n=document.createElement(tag);if(text)n.textContent=text;return n;};
const fromBase64=value=>Uint8Array.from(atob(value),c=>c.charCodeAt(0));
export async function borderImage(border){return border?.theme==='custom'?createImageBitmap(new Blob([fromBase64(border.artwork)],{type:'image/png'})):null;}
const previews=new WeakMap();
export async function showBorder(img,value){
 const parent=img.parentElement;if(!parent)return;
 let state=previews.get(img);if(!state){const canvas=el('canvas');canvas.width=canvas.height=800;canvas.setAttribute('aria-hidden','true');canvas.style.cssText='position:absolute;inset:0;width:100%;height:100%;pointer-events:none;z-index:1';parent.style.position='relative';parent.append(canvas);state={canvas,stamp:0};previews.set(img,state);}
 const stamp=++state.stamp,ctx=state.canvas.getContext('2d');ctx.clearRect(0,0,800,800);state.canvas.hidden=!value;
 if(!value)return;
 let artwork;try{artwork=await borderImage(value);if(stamp===state.stamp)drawBorder(ctx,value,800,artwork);}catch{if(stamp===state.stamp){state.canvas.hidden=false;ctx.fillStyle='#8B2536';ctx.font='24px sans-serif';ctx.fillText('Border preview unavailable',24,50);}}finally{artwork?.close();}
}
export async function prepareBorder(file){
 if(file.size>10*1024*1024)throw Error('Use a transparent PNG up to 10 MB.');
 const bytes=new Uint8Array(await file.arrayBuffer());if(![137,80,78,71,13,10,26,10].every((n,i)=>bytes[i]===n))throw Error('Choose a square PNG border with a transparent centre.');
 const image=await createImageBitmap(file);try{
 if(image.width!==image.height||image.width<100||image.width>12000)throw Error('Use a square border at least 100 pixels wide.');
 const test=el('canvas');test.width=test.height=100;const ctx=test.getContext('2d');ctx.drawImage(image,0,0,100,100);const pixels=ctx.getImageData(35,35,30,30).data;let covered=0;for(let i=3;i<pixels.length;i+=4)if(pixels[i]>25)covered++;if(covered>45)throw Error('The centre must be transparent so your photo stays visible.');
 for(const limit of [1600,1200,900,600]){const canvas=el('canvas');canvas.width=canvas.height=Math.min(image.width,limit);canvas.getContext('2d').drawImage(image,0,0,canvas.width,canvas.height);const blob=await new Promise(r=>canvas.toBlob(r,'image/png'));if(blob?.size<=131072){let raw='';for(const byte of new Uint8Array(await blob.arrayBuffer()))raw+=String.fromCharCode(byte);return btoa(raw);}}
 throw Error('Simplify this artwork so the prepared border is under 128 KB.');
 }finally{image.close();}
}
export function createBorderEditor({value=null,onChange=()=>{},policy=defaultBorderPolicy,allowCustom=true}={}){
 let current=normalizeBorder(value),loading=false,version=0;
 const root=el('fieldset'),legend=el('legend','Photo border'),choices=el('div'),colorLabel=el('label','Border color '),color=el('input'),widthLabel=el('label','Border width '),width=el('input'),widthValue=el('output'),customLabel=el('label','Upload transparent PNG border '),file=el('input'),selected=el('p'),help=el('p','Optional. Your original photo is preserved. Custom artwork needs a clear, transparent centre.'),error=el('p');
 selected.setAttribute('role','status');root.className='ae-border-editor';root.style.cssText='border:1px solid #d4d0bf;border-radius:14px;padding:16px;margin:16px 0;background:#faf8f1;color:#484c36;display:grid;gap:12px';choices.style.cssText='display:flex;gap:8px;flex-wrap:wrap';error.setAttribute('role','alert');
 color.type='color';color.style.minHeight='44px';colorLabel.append(color);width.type='range';width.min=.015;width.max=.12;width.step=.005;width.style.width='100%';widthLabel.append(widthValue,width);file.type='file';file.accept='image/png';customLabel.append(file);
 const buttons=[];function choice(title,border){const b=el('button',title);b.type='button';b.style.cssText='min-height:44px;padding:10px 14px;border:1px solid #686c52;border-radius:10px;background:#f5f1e7;color:#484c36;cursor:pointer';b.onclick=()=>{version++;current=border;error.textContent='';notify();};choices.append(b);buttons.push([b,border]);}
 for(const theme of borderThemes){if(theme==='custom'||theme==='none')continue;if(policy.enabled&&policy.themes.includes(theme))choice(titles[theme],{theme,color:colors[theme]||'#4A4B36',width:.045});}choice('No border',null);
 if(policy.enabled)for(const entry of policy.custom)choice(entry.name,entry.border);
 function paint(){for(const [button,border]of buttons){const selected=(border?.theme??'none')===(current?.theme??'none')&&(border?.theme!=='custom'||border.artwork===current.artwork);button.setAttribute('aria-pressed',String(selected));button.style.background=selected?'#4A4B36':'#f5f1e7';button.style.color=selected?'#fffdf3':'#484c36';}color.value=current?.color??'#4A4B36';width.value=current?.width??.045;widthValue.textContent=Math.round((current?.width??.045)*100)+'% per edge';colorLabel.hidden=widthLabel.hidden=!current||current.theme==='custom';customLabel.hidden=!allowCustom||!policy.enabled;file.disabled=loading;selected.textContent=current?.theme==='custom'?'Custom border selected.':'';selected.hidden=!selected.textContent;}
 function notify(){paint();onChange(current?structuredClone(current):null);}
 color.oninput=()=>{if(current){current.color=color.value;notify();}};width.oninput=()=>{if(current){current.width=Number(width.value);notify();}};
 file.onchange=async()=>{const chosen=file.files[0];file.value='';if(!chosen)return;const stamp=++version;loading=true;paint();error.textContent='';try{const artwork=await prepareBorder(chosen);if(stamp===version){current={theme:'custom',color:'#4A4B36',width:.045,artwork};notify();}}catch(e){if(stamp===version)error.textContent=e.message;}finally{loading=false;paint();}};
 root.append(legend,choices,selected,colorLabel,widthLabel,customLabel,help,error);paint();
 return {element:root,set(value){version++;current=normalizeBorder(value);paint();},get value(){return current;},disable(value){root.disabled=value;}};
}
