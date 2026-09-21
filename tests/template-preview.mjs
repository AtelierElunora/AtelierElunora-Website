import assert from 'node:assert/strict';
import {templatePreview} from '../shopify-owner-app/extensions/gallery-owner/src/template-preview.mjs';
const input={enabled:true,cutInches:3.6,background:'#123456',sides:{top:{source:'event',shift:0.1},right:{source:'date',rotate:180},bottom:{source:'custom',text:'<script>alert("x")</script>'},left:{source:'blank'}},date:'June 20, 2027'};
const a=templatePreview(input,{name:'Alex & Breanna'}),b=templatePreview(input,{name:'Different gallery'});
assert.notEqual(a.url,b.url);assert.match(a.svg,/#123456/);assert.match(a.svg,/Alex &amp; Breanna/);assert.match(a.svg,/&lt;script&gt;/);assert.ok(!a.svg.includes('<script>'));assert.match(a.svg,/rotate\(180\)/);assert.match(a.svg,/Brown Carolina/);assert.match(a.svg,/data:font\/woff2;base64,/);assert.match(a.svg,/stroke-dasharray/);assert.equal(a.cut,3.6);
const off=templatePreview({...input,enabled:false,photoCutInches:2.75});assert.ok(!off.svg.includes('Alex &amp; Breanna'));assert.ok(!off.svg.includes('stroke-dasharray'));assert.equal(off.cut,2.75);
assert.throws(()=>templatePreview({...input,cutInches:NaN}));
console.log('PASS: gallery-specific preview, escaped wording, actual font embedding, wrap colors, rotation, disabled template and invalid draft handling.');
