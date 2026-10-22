import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
const source=readFileSync(new URL('../extensions/elunora-booking/assets/assistant-widget.js',import.meta.url),'utf8');
function widget(url='https://app.example.azurewebsites.net'){
 const handlers={},frame={contentWindow:{},src:''};let removed=false,opened=0,closed=0,focused=0;
 const button={addEventListener:(name,fn)=>handlers[name]=fn,focus:()=>focused++};
 const dismiss={addEventListener:(_name,fn)=>handlers.dismiss=fn,focus(){}};
 const dialog={showModal:()=>opened++,close:()=>closed++,addEventListener:(name,fn)=>handlers['dialog:'+name]=fn};
 const root={dataset:{chatUrl:url,chatShop:'v0j63n-ms.myshopify.com'},querySelector:q=>q==='.elunora-chat-launch'?button:q==='dialog'?dialog:q==='iframe'?frame:dismiss,remove:()=>removed=true};
 runInNewContext(source,{document:{querySelectorAll:()=>[root]},window:{addEventListener:(_name,fn)=>handlers.message=fn},URL});
 return {handlers,frame,state:()=>({removed,opened,closed,focused})};
}
test('chat iframe loads on first open and accepts close messages only from its Azure frame',()=>{
 const w=widget();assert.equal(w.frame.src,'');w.handlers.click();assert.equal(w.frame.src,'https://app.example.azurewebsites.net/assistant/v0j63n-ms.myshopify.com');assert.equal(w.state().opened,1);
 const e={source:w.frame.contentWindow,origin:'https://app.example.azurewebsites.net',data:{type:'elunora:chat-close'}};
 w.handlers.message({...e,origin:'https://evil.invalid'});w.handlers.message({...e,source:{}});w.handlers.message({...e,data:{type:'other'}});assert.equal(w.state().closed,0);
 w.handlers.message(e);assert.equal(w.state().closed,1);assert.equal(w.state().focused,1);
});
test('invalid or non-Azure widget endpoints are not loaded',()=>{
 for(const url of ['http://app.example.azurewebsites.net','https://app.example.azurewebsites.net.evil.invalid','javascript:alert(1)'])assert.equal(widget(url).state().removed,true);
});
