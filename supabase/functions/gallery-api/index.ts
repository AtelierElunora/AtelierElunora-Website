import {runtime} from './runtime.mts';
import handler from './handler.mts';
runtime.url=Deno.env.get('SUPABASE_URL')||'';
const keys=Deno.env.get('SUPABASE_PUBLISHABLE_KEYS');
runtime.key=(keys?JSON.parse(keys).default:null)||Deno.env.get('SUPABASE_ANON_KEY')||'';
// Preserve the existing authorization for paid packs; singles remain unavailable.
runtime.checkoutEnabled=true;
// Handler performs getUser verification and user-scoped RLS on every data route.
Deno.serve(handler);
