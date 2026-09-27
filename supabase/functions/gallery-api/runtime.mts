export const runtime={url:'',key:'',checkoutEnabled:false,checkoutPilot:{} as Record<string,string>};
// The pilot is configured only by the server; event access is still checked with RLS.
export function checkoutOpen(event:{id:string,is_sample?:boolean},now=Date.now()){
 return !event.is_sample && (runtime.checkoutEnabled || Date.parse(runtime.checkoutPilot[event.id]||'')>now);
}

