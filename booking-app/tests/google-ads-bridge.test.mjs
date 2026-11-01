import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
const source=await readFile('tests/fixtures/storefront/atelier-wedding-inquiry.js','utf8');
function bridge({consent=true,origin='https://www.atelierelunora.com',stored=null,gclid='synthetic_gclid_12345'}={}){
 const listeners={},messages=[],storage=new Map(stored?[['elunora:google-ads-click',JSON.stringify(stored)]]:[]),contentWindow={postMessage:(data,origin)=>messages.push({data,origin})};
 const frame={contentWindow,dataset:{inquiryUrl:'https://app-elunora-bookings-nvo32m3ban2cc.azurewebsites.net/wedding-inquiry-simple/v0j63n-ms.myshopify.com'}};
 const section={dataset:{},querySelector:()=>frame};
 const window={Shopify:{customerPrivacy:{analyticsProcessingAllowed:()=>consent,marketingAllowed:()=>consent,saleOfDataAllowed:()=>consent}},addEventListener:(name,fn)=>listeners[name]=fn};
 const sessionStorage={getItem:k=>storage.get(k),setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)};
 vm.runInNewContext(source,{window,location:{origin,href:origin+'/pages/packages?gclid='+gclid},sessionStorage,URL,Date,Set,document:{querySelectorAll:s=>s==='[data-wedding-inquiry]'?[section]:[],addEventListener(){}}});
 return{messages,storage,request:(overrides={})=>listeners.message({source:contentWindow,origin:'https://app-elunora-bookings-nvo32m3ban2cc.azurewebsites.net',data:{type:'elunora:ads-attribution-request'},...overrides})};
}
await test('only the exact inquiry frame receives consented attribution',()=>{const b=bridge();b.request({origin:'https://evil.example.invalid'});b.request({source:{}});assert.equal(b.messages.length,0);b.request();assert.equal(b.messages[0].data.attribution.gclid,'synthetic_gclid_12345');assert.equal(b.messages[0].origin,'https://app-elunora-bookings-nvo32m3ban2cc.azurewebsites.net');const first=b.messages[0].data.attribution.capturedAt;b.request();assert.equal(b.messages[1].data.attribution.capturedAt,first);});
await test('denied consent or unknown storefront never transmits a click ID',()=>{for(const options of [{consent:false},{origin:'https://evil.example.invalid'}]){const b=bridge(options);b.request();assert.equal(b.messages[0].data.attribution,null);assert.equal(b.storage.size,0);}});
await test('expired URL click is not renewed by repeated frame requests',()=>{const b=bridge({stored:{gclid:'synthetic_gclid_12345',capturedAt:new Date(Date.now()-91*86400000).toISOString()}});b.request();b.request();assert.equal(b.messages[0].data.attribution,null);assert.equal(b.messages[1].data.attribution,null);});
