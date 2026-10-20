import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {build} from 'esbuild';
import {rm} from 'node:fs/promises';
const raw='a'.repeat(64),hashed=createHash('sha256').update(raw).digest('hex');
await build({entryPoints:['app/routes/calendar-feed.$shop.tsx'],bundle:true,platform:'node',format:'esm',outfile:'tests/.calendar-feed.mjs',plugins:[{name:'fixtures',setup(b){b.onResolve({filter:/db\.server$/},()=>({path:'db',namespace:'fixture'}));b.onResolve({filter:/booking\.server$/},()=>({path:'hash',namespace:'fixture'}));b.onLoad({filter:/.*/,namespace:'fixture'},args=>({contents:args.path==='hash'?`import {createHash} from 'node:crypto'; export const hash=t=>createHash('sha256').update(t).digest('hex');`:`export default {bookingSettings:{findUnique:async()=>({shop:'test',configJson:JSON.stringify({calendarFeed:{hash:'${hashed}',expiresAt:'2099-01-01'}})})},weddingBooking:{findMany:async()=>[{id:'test-booking',weddingDate:'2026-12-12',customerName:'Synthetic test',venue:'Test venue',status:'confirmed',updatedAt:new Date('2026-10-09T12:00:00Z')}]}};`,loader:'js'}));}}]});
try {
 const {loader}=await import('./.calendar-feed.mjs');
 await test('subscription response contains complete event boundaries and selected date',async()=>{
  const response=await loader({request:new Request('https://example.invalid/calendar?token='+raw),params:{shop:'test'}});
  const text=await response.text();
  assert.equal(response.status,200);
  const stack=[];
  for(const line of text.split('\r\n')){if(line.startsWith('BEGIN:'))stack.push(line.slice(6));if(line.startsWith('END:'))assert.equal(stack.pop(),line.slice(4));}
  assert.equal(stack.length,0);assert.match(text,/BEGIN:VEVENT\r\nUID:test-booking/);assert.match(text,/DTSTART;VALUE=DATE:20261212/);assert.match(text,/STATUS:CONFIRMED/);
 });
}finally{await rm('tests/.calendar-feed.mjs',{force:true});}
