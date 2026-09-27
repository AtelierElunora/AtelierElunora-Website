import {cropRect} from '../theme/assets/atelier-station-core.js';

// The server owns payment validation, the purchased count and final submission.
export function createLaterEditor({host,call,photos,notice,onSubmitted}){
 let order,items=[],known=new Set(),pending=Promise.resolve(),dirty=false,loaded=false;
 const el=(tag,text)=>{const n=document.createElement(tag);if(text)n.textContent=text;return n;};
 const task=fn=>{pending=pending.catch(()=>{}).then(fn);return pending;};
 async function save(submit=false){
  try{order=await call({action:submit?'submit':'save',items:structuredClone(items),revision:order.revision});}catch(e){if(e.status===409)dirty=false;throw e;}
  dirty=false;
  notice(submit?'Thank you. Your photos have been submitted for preparation.':'Your photo selection is saved.');
  if(submit)onSubmitted();
 }
 function paint(all){
  host.replaceChildren();const locked=order.status!=='awaiting_photos';
  host.append(el('h2',order.productTitle),el('p','Order '+order.orderName+' · '+order.requiredCount+' magnets'));
  if(locked){host.append(el('p','Your photos have been submitted. We’ll prepare your order using the saved crops below. Contact Atelier Elunora if you need a change.'));onSubmitted();}
  const count=el('p'),grid=el('div');grid.className='ae-later-grid';
  const updateCount=()=>{count.textContent=items.reduce((n,i)=>n+i.quantity,0)+' of '+order.requiredCount+' magnets selected';};updateCount();host.append(count,grid);
  for(const photo of all){
   let item=items.find(i=>i.photoId===photo.id);
   const card=el('article'),canvas=el('canvas'),image=new Image();canvas.width=canvas.height=480;canvas.setAttribute('aria-label','Magnet preview: '+photo.filename);card.append(canvas,el('p',photo.filename));
   const draw=()=>{if(!image.naturalWidth)return;const i=item||{x:50,y:50,zoom:1},r=cropRect(image.naturalWidth,image.naturalHeight,i.x,i.y,i.zoom);canvas.getContext('2d').drawImage(image,r.sx,r.sy,r.size,r.size,0,0,480,480);};
   image.onload=draw;image.onerror=()=>notice('A preview expired. Use Refresh saved photos to load it again.');image.src=photo.url;
   if(!locked){
    const controls=el('fieldset'),legend=el('legend','Crop and copies');controls.append(legend);
    const label=el('label','Copies (0 removes this photo)'),copies=el('input');copies.type='number';copies.min='0';copies.max='12';copies.value=String(item?.quantity||0);label.append(copies);controls.append(label);
    copies.onchange=()=>{const quantity=Number(copies.value);if(!Number.isInteger(quantity)||quantity<0||quantity>12){copies.value=String(item?.quantity||0);return;}
     const total=items.filter(i=>i!==item).reduce((n,i)=>n+i.quantity,0)+quantity;
     if(total>order.requiredCount){copies.value=String(item?.quantity||0);notice('Your order includes '+order.requiredCount+' magnets. Reduce another photo’s copies first.');return;}
     if(!quantity){items=items.filter(i=>i!==item);item=null;}else if(item)item.quantity=quantity;else{item={photoId:photo.id,quantity,x:50,y:50,zoom:1};items.push(item);}dirty=true;updateCount();draw();};
    for(const [key,title,min,max,step]of [['x','Move left or right',0,100,1],['y','Move up or down',0,100,1],['zoom','Zoom',1,3,0.01]]){
     const label=el('label',title),input=el('input');input.type='range';input.min=min;input.max=max;input.step=step;input.value=item?.[key]??(key==='zoom'?1:50);input.oninput=()=>{if(item){item[key]=Number(input.value);dirty=true;draw();}};label.append(input);controls.append(label);
    }
    card.append(controls);
   }
   grid.append(card);
  }
  if(!locked){const actions=el('div');actions.className='ae-actions';
   for(const [label,submit]of [['Save changes',false],['Submit photos',true]]){const b=el('button',label);b.type='button';b.onclick=()=>task(async()=>{host.querySelectorAll('button,input').forEach(n=>n.disabled=true);try{if(submit&&items.reduce((n,i)=>n+i.quantity,0)!==order.requiredCount)throw Error('Choose exactly '+order.requiredCount+' magnets before submitting.');await save(submit);paint(all);}catch(e){notice(e.status===409?'Your saved selection changed in another tab. Refresh saved photos before continuing.':e.message);}finally{host.querySelectorAll('button,input').forEach(n=>n.disabled=false);}});actions.append(b);}host.append(actions,el('p','Save changes to keep your crops. Submit photos when your selection is final. There is no additional checkout.'));
  }
 }
 return {flush:()=>task(async()=>{if(dirty)await save();}),refresh:()=>task(async()=>{
  if(dirty)await save();
  order=await call({action:'load'});items=structuredClone(order.items);const all=[];let cursor=0;
  do{const r=await photos(cursor);all.push(...r.photos);cursor=r.next;}while(cursor!==null&&all.length<1000);
  // Only a brand-new selection is automatically filled after opening on another device.
  let total=items.reduce((n,i)=>n+i.quantity,0),added=false;
  if(order.status==='awaiting_photos')for(const p of all){if(!items.some(i=>i.photoId===p.id)&&!known.has(p.id)&&(loaded||order.revision===0)&&total<order.requiredCount){items.push({photoId:p.id,quantity:1,x:50,y:50,zoom:1});total++;added=true;}}
  known=new Set(all.map(p=>p.id));loaded=true;if(added)await save();paint(all);
 })};
}
