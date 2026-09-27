export function sheetProfile(id='ds820-8x12'){
 if(id==='photo-4x6-single')return {id,width:1200,height:1800,capacity:1,paper:'4x6'};
 if(id==='letter-four')return {id,width:2550,height:3300,capacity:4,paper:'letter'};
 if(id==='ds820-8x12')return {id,width:2400,height:3600,capacity:6,paper:'8x12'};
 throw Error('Unsupported print profile.');
}
export function letterFourLayout(cuts){
 if(!cuts.length||cuts.length>4||cuts.some(c=>!Number.isFinite(c)||c<2.5||c>3.6))throw Error('Letter sheets support four cuts up to 3.6 inches.');
 const step=1110,left=(2550-(2*1080+30))/2,top=(3300-(2*1080+30))/2;
 return cuts.map((cut,i)=>{const size=Math.round(cut*300);return {x:left+(i%2)*step+(1080-size)/2,y:top+Math.floor(i/2)*step+(1080-size)/2,size};});
}

export function fourSixLayout(cuts){
 if(cuts.length!==1||!Number.isFinite(cuts[0])||cuts[0]<2.5||cuts[0]>3.6)throw Error('4 x 6 test sheets support one cut up to 3.6 inches.');
 const size=Math.round(cuts[0]*300);return [{x:(1200-size)/2,y:(1800-size)/2,size}];
}
