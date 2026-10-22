import {isIP} from 'node:net';

export function privateIPv4(address) {
  if (isIP(address)!=='IPv4' && isIP(address)!==4) return false;
  const [a,b]=address.split('.').map(Number);
  return a===10 || (a===172 && b>=16 && b<=31) || (a===192 && b===168);
}
export function previewAddress({lan=false,interfaces={},port=lan?4319:4317}={}) {
  port=Number(port);
  if(!Number.isSafeInteger(port)||port<1024||port>65535)throw Error('Choose a preview port between 1024 and 65535.');
  if(!lan)return {host:'127.0.0.1',port,origin:`http://127.0.0.1:${port}`};
  const names=Object.keys(interfaces).sort((a,b)=>Number(!/^en[0-9]+$/.test(a))-Number(!/^en[0-9]+$/.test(b)));
  for(const name of names)for(const item of interfaces[name]||[])if(!item.internal&&privateIPv4(item.address))return {host:item.address,port,origin:`http://${item.address}:${port}`};
  throw Error('No private Wi-Fi or Ethernet IPv4 address found. Connect this Mac to the same network as your phone.');
}
export function configuredChatOrigin(env,previewOrigin) {
  try {
    const url=new URL(env.SHOPIFY_APP_URL);
    if(url.username||url.password)return undefined;
    if(url.protocol==='https:')return url.origin;
    if(url.protocol!=='http:')return undefined;
    if(env.NODE_ENV!=='production'&&['localhost','127.0.0.1'].includes(url.hostname))return url.origin;
    if(env.NODE_ENV==='development'&&previewOrigin===url.origin&&privateIPv4(url.hostname))return url.origin;
  }catch{}
  return undefined;
}
