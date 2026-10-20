import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {rm} from 'node:fs/promises';
await build({entryPoints:['app/portal-links.ts'],bundle:true,platform:'node',format:'esm',outfile:'tests/.portal-links.mjs'});
const {validPortalLink,addEmailPortalLink}=await import('./.portal-links.mjs');
try {
 await test('email links preserve the original link, expire independently, and are revoked with owner reset',()=>{
  const now=Date.now(), original='a'.repeat(64), emailed='b'.repeat(64);
  const d={portalHash:original,portalExpiresAt:new Date(now+10000).toISOString(),emailPortalLinks:addEmailPortalLink([],emailed,now)};
  assert.ok(validPortalLink(d,original,now)); assert.ok(validPortalLink(d,emailed,now));
  assert.equal(validPortalLink(d,original,now+10001),false); assert.ok(validPortalLink(d,emailed,now+10001));
  assert.equal(validPortalLink(d,emailed,now+31*86400000),false);
  assert.equal(validPortalLink({...d,portalHash:'c'.repeat(64),emailPortalLinks:[]},emailed,now),false);
  assert.equal(validPortalLink({...d,portalHash:'bad',portalExpiresAt:'bad'},original,now),false);
  assert.equal(validPortalLink(d,'bad',now),false);
 });
} finally {await rm('tests/.portal-links.mjs',{force:true});}
