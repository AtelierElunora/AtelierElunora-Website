import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {Window} from 'happy-dom';
const script=(await readFile('theme/sections/atelier-client-gallery.liquid','utf8')).split('{% javascript %}')[1].split('{% endjavascript %}')[0];
const locale=JSON.parse((await readFile('theme/locales/en.default.json','utf8')).replace(/\/\*[\s\S]*?\*\//g,''));
const token='a'.repeat(64),session={access_token:'test',refresh_token:'refresh',expires_at:9999999999,email:'guest@example.test'};
const pause=()=>new Promise(r=>setTimeout(r,30));
for(const signedIn of [false,true]){
 const w=new Window({url:'https://www.atelierelunora.com/pages/client-gallery#booth='+token});
 w.document.body.innerHTML='<div data-ae-customer-gallery><script data-gallery-copy type="application/json">'+JSON.stringify(locale.atelier_customer_gallery)+'</script></div>';
 if(signedIn)w.sessionStorage.setItem('elunora-shopify-gallery-session',JSON.stringify(session));
 let claimed=false;const calls=[],revoked=[];w.IntersectionObserver=class{observe(){}disconnect(){}};w.URL.createObjectURL=()=> 'blob:private';w.URL.revokeObjectURL=url=>revoked.push(url);
 w.fetch=async(url,options)=>{const path=url.split('/gallery-api/')[1];calls.push({path,body:options.body&&JSON.parse(options.body),authorization:options.headers.Authorization});
  if(path==='customer/booth/claim'){claimed=true;return Response.json({claimed:true,photoId:'photo'});}
  if(path==='customer/booth/photos')return Response.json({photos:claimed?[{id:'photo',filename:'photo.jpg',eventName:'Test booth'}]:[]});
  if(path.endsWith('/preview'))return new Response(new Blob(['jpeg']));
  if(path==='events')return Response.json({events:[]});
  if(path==='session')return Response.json({owner:false,email:session.email});
  if(path==='logout')return Response.json({});throw Error(path);
 };
 w.eval(script);await pause();await pause();
 const button=text=>[...w.document.querySelectorAll('button')].find(b=>b.textContent===text);
 assert.equal(w.document.querySelector('.ag-booth-open').href,'elunora://booth?booth='+token);
 assert.equal(calls.some(c=>c.path==='customer/booth/claim'),false);
 assert.equal(button(locale.atelier_customer_gallery.boothClaim).hidden,!signedIn);
 if(signedIn){button(locale.atelier_customer_gallery.boothClaim).click();await pause();await pause();assert.ok(claimed);assert.equal(calls.find(c=>c.path==='customer/booth/claim').authorization,'Bearer test');assert.equal(w.location.hash,'');assert.equal(w.localStorage.length,0);assert.ok(!w.sessionStorage.getItem('elunora-shopify-gallery-session').includes(token));assert.equal(w.document.querySelector('.ag-grid img').src,'blob:private');button(locale.atelier_customer_gallery.logout).click();await pause();assert.ok(revoked.includes('blob:private'));assert.equal(w.document.querySelector('.ag-grid img'),null);}
 await w.happyDOM.abort();
}
console.log('PASS: website requires explicit authenticated photo claim, opens strict app link, clears claimed fragment, keeps token out of storage and revokes private images on sign-out.');
