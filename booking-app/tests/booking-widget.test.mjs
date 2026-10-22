import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

const source=readFileSync(new URL('../extensions/elunora-booking/assets/booking-widget.js',import.meta.url),'utf8');
function open({checked,query='',form}) {
  let click,message,closed=0;
  const events=[];
  const trigger={dataset:{elunoraUrl:'https://book.example.com/book/store',elunoraCollection:'Small'},addEventListener:(_event,handler)=>{click=handler;}};
  const frame={contentWindow:{},getAttribute(name){return this[name]}};
  const dialog={showModal(){},close(){closed++},addEventListener(){}};
  const variants=[{id:1,title:'Small'},{id:2,title:'Large'}];
  const product={querySelector:selector=>selector.includes('radio')?checked&&{dataset:{variantId:checked}}:form&&{value:form}};
  const block={closest:()=>product,querySelector:selector=>({'.elunora-booking-trigger':trigger,dialog,iframe:frame,'.elunora-product-variants':{textContent:JSON.stringify(variants)},'.elunora-booking-dismiss':{addEventListener(){}}})[selector]};
  const document={querySelectorAll:()=>[block],querySelector:()=>({value:'1'})};
  runInNewContext(source,{document,URL,window:{Shopify:{analytics:{publish:(...args)=>events.push(args)}},addEventListener:(_event,handler)=>{message=handler}},location:{origin:'https://shop.example.com',href:'https://shop.example.com/products/wedding'+query}});
  click();
  const result=new URL(frame.src).searchParams;
  result.sendClose=event=>{message(event);return closed};
  result.frame=frame;
  result.events=events;
  return result;
}
test('checked product tier overrides stale form and URL, rather than unrelated document input',()=>{
  const result=open({checked:'2',query:'?variant=1',form:'1'});
  assert.equal(result.get('collection'),'Large');
  assert.equal(result.get('variant'),'2');
});

test('successful inquiry from the booking frame publishes once, with no contact or token data',()=>{
  const result=open({});
  assert.equal(result.get('parentOrigin'),'https://shop.example.com');
  const event={source:result.frame.contentWindow,origin:'https://book.example.com',data:{type:'elunora:inquiry-saved',conversionId:'a'.repeat(64),email:'private@example.invalid',savedToken:'private-token'}};
  result.sendClose({...event,origin:'https://evil.example.com'});
  result.sendClose({...event,source:{}});
  result.sendClose({...event,data:{type:'elunora:inquiry-saved',conversionId:'invalid'}});
  assert.equal(result.events.length,0);
  result.sendClose(event);result.sendClose(event);
  assert.equal(result.events.length,1);
  assert.equal(JSON.stringify(result.events[0]),JSON.stringify(['elunora:inquiry_saved',{conversion_id:'a'.repeat(64)}]));
});
test('variant deep link works when normal buy form is hidden',()=>{
  assert.equal(open({query:'?variant=2'}).get('collection'),'Large');
});
test('unknown variant identifiers cannot select another product collection',()=>{
  const result=open({checked:'999',query:'?variant=999',form:'999'});
  assert.equal(result.get('collection'),'Small');
  assert.equal(result.has('variant'),false);
});

test('only the configured booking iframe can request closing the storefront dialog',()=>{
  const result=open({});
  const event={source:result.frame.contentWindow,origin:'https://book.example.com',data:{type:'elunora:booking-close'}};
  assert.equal(result.sendClose({...event,origin:'https://evil.example.com'}),0);
  assert.equal(result.sendClose({...event,source:{}}),0);
  assert.equal(result.sendClose({...event,data:{type:'other'}}),0);
  assert.equal(result.sendClose(event),1);
});
