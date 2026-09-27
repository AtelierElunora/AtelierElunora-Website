import {cropRect} from '../theme/assets/atelier-station-core.js';

export function approvalLabel(status){return status==='approved'?'Approved':status==='pending'?'Waiting for host approval':status==='rejected'?'Not approved':'Submitted';}

// Work on a local copy. Nothing is reserved or uploaded until Submit is pressed.
export async function prepareGuestDraft(item,normalize){
 const file=await normalize(item.file),bitmap=await createImageBitmap(file);
 if(bitmap.width*bitmap.height>60000000){bitmap.close();throw Error('Choose a smaller photo (up to 60 megapixels).');}
 item.bitmap=bitmap;item.crop={x:50,y:50,zoom:1};item.state='Ready to submit';
}

export function paintGuestDraft(item,host,{remove,busy}){
 const el=(tag,text)=>{const n=document.createElement(tag);if(text)n.textContent=text;return n;};
 const canvas=el('canvas');canvas.width=canvas.height=360;canvas.setAttribute('aria-label','Magnet crop preview for '+item.file.name);
 const draw=()=>{const r=cropRect(item.bitmap.width,item.bitmap.height,item.crop.x,item.crop.y,item.crop.zoom);canvas.getContext('2d').drawImage(item.bitmap,r.sx,r.sy,r.size,r.size,0,0,360,360);};
 host.append(canvas,el('strong',item.file.name),el('p',item.state));
 for(const [key,title,min,max,step]of [['zoom','Zoom',1,3,.05],['x','Left / right',0,100,1],['y','Up / down',0,100,1]]){
  const label=el('label',title),input=el('input');input.type='range';input.min=min;input.max=max;input.step=step;input.value=item.crop[key];input.disabled=!!item.prepared;
  input.oninput=()=>{if(busy()||item.prepared)return;item.crop[key]=Number(input.value);draw();};label.append(input);host.append(label);
 }
 const button=el('button','Remove photo');button.type='button';button.disabled=!!item.prepared;button.onclick=()=>{if(!busy()&&!item.prepared)remove();};host.append(button);draw();
}

export async function renderGuestDraft(item){
 const r=cropRect(item.bitmap.width,item.bitmap.height,item.crop.x,item.crop.y,item.crop.zoom),canvas=document.createElement('canvas');
 canvas.width=canvas.height=Math.max(1,Math.min(4096,Math.round(r.size)));
 canvas.getContext('2d').drawImage(item.bitmap,r.sx,r.sy,r.size,r.size,0,0,canvas.width,canvas.height);
 const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/jpeg',.94));if(!blob)throw Error('Could not prepare this crop. Please retry.');
 return new File([blob],item.file.name.replace(/\.[^.]+$/,'')+'.jpg',{type:'image/jpeg'});
}
