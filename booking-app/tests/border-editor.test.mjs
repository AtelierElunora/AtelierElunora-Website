import test from 'node:test';
import assert from 'node:assert/strict';
import {createBorderEditor} from '../app/border-editor.mjs';

// Exercise the DOM control's state and emitted design, without browser dependencies in CI.
class Element {
  constructor(tag) { this.tagName=tag; this.children=[]; this.style={}; this.attributes={}; this.hidden=false; this.textContent=''; }
  append(...children) { this.children.push(...children); }
  setAttribute(name,value) { this.attributes[name]=value; }
}
const all=node=>[node,...node.children.flatMap(all)];
const find=(node,predicate)=>all(node).find(predicate);
const originalDocument=globalThis.document;
try {
  globalThis.document={createElement:tag=>new Element(tag)};
  await test('border opt-in reveals choices and removes the border from emitted artwork when unchecked',()=>{
    const changes=[],editor=createBorderEditor({optIn:true,onChange:border=>changes.push(border)});
    const toggle=find(editor.element,node=>node.type==='checkbox'),body=editor.element.children[1];
    assert.equal(toggle.checked,false); assert.equal(body.hidden,true); assert.equal(body.style.display,'none');
    assert.equal(editor.value,null); assert.deepEqual(changes,[]);
    assert.ok(!all(editor.element).some(node=>node.tagName==='button'&&node.textContent==='No border'));
    toggle.checked=true; toggle.onchange();
    assert.equal(toggle.checked,true); assert.equal(body.hidden,false); assert.equal(body.style.display,'grid');
    assert.equal(editor.value.theme,'fineLine'); assert.equal(changes.at(-1).theme,'fineLine');
    find(editor.element,node=>node.tagName==='button'&&node.textContent==='Christmas').onclick();
    assert.equal(editor.value.theme,'christmas');
    const color=find(editor.element,node=>node.type==='color'); color.value='#123456'; color.oninput();
    assert.equal(changes.at(-1).color,'#123456');
    toggle.checked=false; toggle.onchange();
    assert.equal(editor.value,null); assert.equal(changes.at(-1),null);
    assert.equal(body.hidden,true); assert.equal(body.style.display,'none');
    assert.equal(changes[0].theme,'fineLine');
  });
  await test('existing custom borders and externally restored designs synchronize the checkbox without emitting changes',()=>{
    const saved={theme:'custom',color:'#4A4B36',width:.045,artwork:'iVBORw0KGgoAAAA='},changes=[];
    const editor=createBorderEditor({optIn:true,value:saved,onChange:value=>changes.push(value)});
    const toggle=find(editor.element,node=>node.type==='checkbox'),body=editor.element.children[1];
    assert.equal(toggle.checked,true); assert.equal(body.hidden,false); assert.equal(body.style.display,'grid');
    assert.deepEqual(editor.value,saved);
    editor.set(null); assert.equal(toggle.checked,false); assert.equal(body.style.display,'none');
    editor.set({theme:'winter',color:'#53788B',width:.06});
    assert.equal(toggle.checked,true); assert.equal(body.style.display,'grid'); assert.equal(editor.value.theme,'winter');
    assert.deepEqual(changes,[]);
  });
  await test('callers without opt-in retain the existing border picker and explicit no-border choice',()=>{
    const changes=[],editor=createBorderEditor({value:{theme:'fineLine',color:'#4A4B36',width:.045},onChange:value=>changes.push(value)});
    assert.equal(find(editor.element,node=>node.type==='checkbox'),undefined);
    const none=find(editor.element,node=>node.tagName==='button'&&node.textContent==='No border');
    assert.ok(none); none.onclick(); assert.equal(editor.value,null); assert.deepEqual(changes,[null]);
  });
} finally {
  if(originalDocument===undefined) delete globalThis.document; else globalThis.document=originalDocument;
}
