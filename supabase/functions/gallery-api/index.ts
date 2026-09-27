let handler,step='import';try{
const runtime=(await import('./runtime.mts')).runtime;
handler=(await import('./handler.mts')).default;
step='target';runtime.url=Deno.env.get('SUPABASE_URL')||'';
if(!runtime.url.includes('gefdlubvqymyxrguhtnc.supabase.co'))throw Error('Target mismatch');
step='keys';const keys=Deno.env.get('SUPABASE_PUBLISHABLE_KEYS');runtime.key=(keys?JSON.parse(keys).default:null)||Deno.env.get('SUPABASE_ANON_KEY')||'';
// Production launch authorized after successful checkout and physical print tests.
runtime.checkoutEnabled=true;
runtime.checkoutPilot={};
step='flags';
step='ready';
}catch(e){console.error('Production startup',step,e?.name);}
Deno.serve(req=>step==='ready'?handler(req):Response.json({error:'Production startup incomplete',step},{status:503}));

