import assert from 'node:assert/strict';
import {normalizeTemplate,drawMagnet,sheetLayout} from '../theme/assets/atelier-station-core.js';
import {normalizeTemplate as serverTemplate} from '../supabase/functions/gallery-api/magnet-template.mjs';
const t=normalizeTemplate({enabled:true,sides:{top:{source:'company'},right:{source:'couple'},bottom:{source:'date'},left:{source:'photo'}},couple:'Alex & Sam',date:'September 20, 2026'});
assert.deepEqual(t,serverTemplate(t));assert.equal(t.cutInches,3.25);
for(const bad of [{cutInches:2.5},{cutInches:4},{fontSize:NaN},{edgeInset:0.251,cutInches:3},{color:'red'},{company:'a'.repeat(101)},{sides:{top:{source:'html'}}}])assert.throws(()=>normalizeTemplate(bad));
const text=[],images=[],guides=[],fills=[];const ctx={save(){},restore(){},translate(){},rotate(){},fillRect(){fills.push(this.fillStyle);},fillText(...a){text.push(a)},drawImage(...a){images.push(a)},setLineDash(){},strokeRect(...a){guides.push(a)}};
drawMagnet(ctx,{}, {sx:0,sy:0,size:900},{x:0,y:0,size:975},t,{photo:'12345678'});
assert.deepEqual(text.map(x=>x[0]),['Atelier Elunora','Alex & Sam','September 20, 2026','12345678']);
assert.deepEqual(images[0].slice(-4),[112.5,112.5,750,750]);assert.equal(guides.length,0);
drawMagnet(ctx,{}, {sx:0,sy:0,size:900},{x:0,y:0,size:975},t,{},true);assert.equal(guides.length,1);
assert.equal(sheetLayout(2,3.25).length,2);assert.equal(sheetLayout(2,2.9).length,1);
console.log('PASS: template validation, server/client parity, text sources, 2.5-inch face, preview-only guides, 3.25-inch layout.');

for(const background of ['#123456','#252B1D','#FFFFFF']){drawMagnet(ctx,{}, {sx:0,sy:0,size:900},{x:0,y:0,size:975},{...t,background},{},false);assert.equal(fills.at(-1),background);assert.match(ctx.font,/Brown Carolina/);}

for(const cutInches of [3,3.25,3.6,3.75])for(const distance of [0,0.01,0.1]){const input={enabled:true,cutInches,edgeInset:Math.round(((cutInches-2.5)/2-distance)*1e6)/1e6};const normalized=normalizeTemplate(input);assert.deepEqual(normalized,serverTemplate(input));assert.ok(Math.abs((cutInches-2.5)/2-normalized.edgeInset-distance)<1e-6);drawMagnet(ctx,{}, {sx:0,sy:0,size:900},{x:0,y:0,size:cutInches*300},normalized);}
assert.throws(()=>normalizeTemplate({edgeInset:-0.001}));assert.throws(()=>normalizeTemplate({cutInches:3.25,edgeInset:0.4}));
console.log('PASS: zero and near-zero image distance validate and render across all cut sizes with server/client parity.');

for(const shift of [-0.5,0,0.5]){const value={sides:{top:{source:'company',shift}}};assert.equal(normalizeTemplate(value).sides.top.shift,shift);assert.deepEqual(normalizeTemplate(value),serverTemplate(value));}
for(const shift of [NaN,Infinity,'0',0.51])assert.throws(()=>normalizeTemplate({sides:{top:{source:'company',shift}}}));
const moves=[];const movedCtx={...ctx,translate(x,y){moves.push([x,y]);}};
for(const rotate of [0,180]){moves.length=0;const positioned={...t,sides:Object.fromEntries(['top','right','bottom','left'].map(side=>[side,{...t.sides[side],shift:0.1,rotate}]))};drawMagnet(movedCtx,{}, {sx:0,sy:0,size:900},{x:0,y:0,size:975},positioned,{photo:'test'});assert.deepEqual(moves.filter(([x])=>Math.abs(x)===30).map(([x])=>x),[30,30,-30,-30]);}
console.log('PASS: per-edge shift bounds, legacy zero default, API parity and physical direction preserved for rotated text.');
