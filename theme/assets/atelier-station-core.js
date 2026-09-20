export function cropRect(width,height,x=50,y=50,zoom=1){
 if(!(width>0&&height>0)||!Number.isFinite(zoom)||zoom<1||zoom>3||![x,y].every(v=>Number.isFinite(v)&&v>=0&&v<=100))throw Error('Invalid crop');
 const size=Math.min(width,height)/zoom;return {sx:(width-size)*x/100,sy:(height-size)*y/100,size};
}
export function sheetLayout(quantity,cutInches=2.5){
 if(!Number.isInteger(quantity)||quantity<1||quantity>12||!Number.isFinite(cutInches)||cutInches<2.5||cutInches>2.9)throw Error('Use 1–12 magnets and a cut size of 2.5–2.9 inches.');
 const size=Math.round(cutInches*300),gap=30,left=(1800-2*size-gap)/2,top=(1200-size)/2;
 return Array.from({length:Math.ceil(quantity/2)},(_,page)=>Array.from({length:Math.min(2,quantity-page*2)},(_,i)=>({x:left+i*(size+gap),y:top,size})));
}
