import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {Window} from 'happy-dom';
const gallery=(await readFile('theme/sections/atelier-client-gallery.liquid','utf8')).split('{% javascript %}')[1].split('{% endjavascript %}')[0];
const studio=await readFile('theme/assets/atelier-owner-studio.js','utf8');
const pause=()=>new Promise(r=>setTimeout(r,25));
async function until(check){for(let i=0;i<80;i++){if(check())return;await pause();}assert.ok(check(),'UI did not settle');}
function button(w,text){const b=[...w.document.querySelectorAll('button')].find(n=>n.textContent===text&&!n.hidden);assert.ok(b,text);return b;}
async function input(w,selector,value){const n=w.document.querySelector(selector);assert.ok(n,selector);n.value=value;n.dispatchEvent(new w.Event('input',{bubbles:true}));await pause();}
async function submit(w){w.document.querySelector('form').dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));await pause();}
const token={access_token:'test-session',refresh_token:'test-refresh',expires_at:9999999999,email:'test@example.test'};
async function mount(owner=false){
 const w=new Window({url:'https://www.atelierelunora.com/pages/'+(owner?'owner-studio':'client-gallery')});
 w.document.body.innerHTML=owner?'<div id="atelier-owner-studio"></div>':'<div data-ae-customer-gallery><script data-gallery-copy type="application/json">{"send":"Send sign-in code","verify":"Verify code","sent":"Code sent","resend":"Resend code","change":"Change email","logout":"Sign out","galleries":"Galleries","noEvents":"No galleries yet","codeHelp":"Enter eight digits"}</script></div>';
 let callbacks;const requests=[],errors=[];const state={failPassword:false,failSave:false,owner,aal:'aal1'};
 w.addEventListener('error',e=>errors.push(e.message));w.IntersectionObserver=class{observe(){}disconnect(){}};
 w.turnstile={render(_el,options){callbacks=options;queueMicrotask(()=>options.callback('test-challenge'));return 'widget';},reset(){queueMicrotask(()=>callbacks.callback('fresh-challenge'));},remove(){}};
 w.fetch=async(url,options)=>{
  const path=url.split('/gallery-api/')[1],body=options.body?JSON.parse(options.body):undefined;requests.push({path,body,headers:options.headers});let data={},status=200;
  if(path==='password-login'){if(state.failPassword){status=400;data={error:'Email or password was not accepted.'};}else data=token;}
  else if(path==='login')data={message:'Code sent'};
  else if(path==='verify')data=token;
  else if(path==='session')data={owner:state.owner,email:token.email};
  else if(path==='password'){if(state.failSave){status=400;data={error:'Choose a stronger password.'};}else data=token;}
  else if(path==='events')data={events:[]};
  else if(path==='mfa/status')data={aal:state.aal,required:true,factors:[{id:'factor',name:'Authenticator'}]};
  else if(path==='mfa/verify'){state.aal='aal2';data={...token,access_token:'verified-owner'};}
  else if(path==='owner')data={events:[],requests:[],payments:[],usage:[]};
  else if(path==='owner/commerce')data={workspaces:[],laterOrders:[]};
  else if(!['mfa/activate','logout'].includes(path))throw Error('Unexpected endpoint '+path);
  return {ok:status===200,status,json:async()=>data};
 };
 w.eval(owner?studio:gallery);await pause();return {w,state,requests,errors};
}
// Returning customer: password and CAPTCHA are submitted only to the auth endpoint.
{
 const {w,state,requests,errors}=await mount();assert.equal(w.document.querySelector('#ag-password').autocomplete,'current-password');
 await input(w,'#ag-email',token.email);await input(w,'#ag-password','a unique long passphrase');state.failPassword=true;await submit(w);
 assert.match(w.document.querySelector('.ag-error').textContent,/not accepted/);assert.equal(w.sessionStorage.length,0);assert.equal(requests.at(-1).path,'password-login');assert.equal(requests.at(-1).headers.Authorization,undefined);
 state.failPassword=false;await submit(w);await until(()=>w.document.querySelector('.ag-login').hidden);
 assert.equal(w.document.querySelector('#ag-password').value,'');assert.ok(!w.sessionStorage.getItem('elunora-shopify-gallery-session').includes('passphrase'));assert.equal(w.localStorage.length,0);assert.deepEqual(errors,[]);
 button(w,'Sign out').click();await pause();assert.equal(w.document.querySelector('.ag-login').hidden,false);assert.equal(w.document.querySelector('#ag-password').hidden,false);await w.happyDOM.abort();
}
// Create/reset is email proof first, password second; failures can be corrected.
{
 const {w,state,requests,errors}=await mount();button(w,'Create or reset password').click();await pause();
 assert.equal(w.document.querySelector('#ag-password').required,false);assert.equal(w.document.querySelector('#ag-password').hidden,true);
 await input(w,'#ag-email',token.email);await submit(w);assert.equal(requests.at(-1).path,'login');await input(w,'#ag-code','12345678');button(w,'Verify code').click();await pause();
 assert.equal(w.document.querySelector('#ag-password').autocomplete,'new-password');assert.equal(w.document.querySelector('#ag-password').hidden,false);assert.equal(w.document.querySelector('#ag-email').readOnly,true);assert.ok(!requests.some(r=>r.path==='password'));
 await input(w,'#ag-password','first long passphrase');await input(w,'#ag-confirm-password','different passphrase');await submit(w);assert.match(w.document.querySelector('.ag-error').textContent,/do not match/);assert.ok(!requests.some(r=>r.path==='password'));
 await input(w,'#ag-confirm-password','first long passphrase');state.failSave=true;await submit(w);assert.match(w.document.querySelector('.ag-error').textContent,/stronger/);assert.equal(w.document.querySelector('.ag-login').hidden,false);
 state.failSave=false;await submit(w);assert.equal(w.document.querySelector('.ag-login').hidden,true);assert.equal(w.document.querySelector('#ag-password').value,'');assert.deepEqual(requests.find(r=>r.path==='password').body,{password:'first long passphrase',refresh_token:token.refresh_token});assert.deepEqual(errors,[]);await w.happyDOM.abort();
}
// Code fallback still opens the gallery without forcing password creation.
{
 const {w,requests}=await mount();button(w,'Use an email code').click();await input(w,'#ag-email',token.email);await submit(w);await input(w,'#ag-code','12345678');button(w,'Verify code').click();await pause();assert.ok(w.document.querySelector('.ag-login').hidden);assert.ok(!requests.some(r=>r.path==='password'));await w.happyDOM.abort();
}
// Cancel reset revokes its session; owner setup directs to Studio without bypass.
for(const owner of [false,true]){
 const {w,state,requests}=await mount();state.owner=owner;button(w,'Create or reset password').click();await input(w,'#ag-email',token.email);await submit(w);await input(w,'#ag-code','12345678');button(w,'Verify code').click();await pause();
 if(owner)assert.match(w.document.querySelector('.ag-error').textContent,/Owner Studio/);else{button(w,'Cancel and sign out').click();await pause();}
 assert.ok(requests.some(r=>r.path==='logout'));assert.equal(w.sessionStorage.length,0);assert.equal(w.document.querySelector('.ag-login').hidden,false);await w.happyDOM.abort();
}
// Owner password and reset paths both stop at MFA before any workspace or password write.
for(const setup of [false,true]){
 const {w,requests,errors}=await mount(true);if(setup)button(w,'Create or reset password').click();
 await input(w,'input[type=email]',token.email);
 if(!setup)await input(w,'input[type=password]','a unique long passphrase');await submit(w);
 if(setup){await input(w,'input[autocomplete=one-time-code]','12345678');await submit(w);}
 await until(()=>w.document.body.textContent.includes('Protect your owner account'));
 assert.ok(!requests.some(r=>r.path==='owner'||r.path==='password'));assert.equal(w.localStorage.length,0);assert.equal(w.sessionStorage.length,0);
 await input(w,'.auth-wrap input','123456');button(w,'Verify authenticator').click();await pause();
 if(setup){await until(()=>w.document.body.textContent.includes('Choose your password'));assert.ok(!requests.some(r=>r.path==='owner'));await input(w,'input[type=password]','a unique long passphrase');
 // Inputs sit in separate labels; select the confirmation field explicitly.
 const inputs=w.document.querySelectorAll('input[type=password]');inputs[1].value='a unique long passphrase';inputs[1].dispatchEvent(new w.Event('input',{bubbles:true}));await pause();await submit(w);
 assert.ok(requests.some(r=>r.path==='password'&&r.headers.Authorization==='Bearer verified-owner'));
 }
 await until(()=>w.document.querySelector('.studio'));assert.ok(requests.findIndex(r=>r.path==='mfa/verify')<requests.findIndex(r=>r.path==='owner'));assert.deepEqual(errors,[]);await w.happyDOM.abort();
}
console.log('PASS: customer password login, reset, mismatch/error retry, code fallback, cancellation, owner redirect, and complete Studio password/reset → MFA → workspace flows. Credentials stay out of browser storage.');
