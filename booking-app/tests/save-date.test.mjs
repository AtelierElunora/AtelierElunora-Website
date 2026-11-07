import test from "node:test";
import assert from "node:assert/strict";
import { readFile, rm } from "node:fs/promises";
import { build } from "esbuild";

await build({ stdin:{contents:"export * from './app/save-date-fonts.server';export * from './app/save-date-design';export * from './app/save-date-artwork.server';export * from './app/wedding-keepsakes';export * from './app/booking-contract.server';",resolveDir:process.cwd(),loader:"ts"},bundle:true,platform:"node",format:"esm",packages:"external",outfile:"tests/.save-date-bundle.mjs" });
const { renderSaveDateSvg, validateSaveDateDesign, photoBytes, saveDateSvg, designSummary, saveDateArtworkAttributes, validArtworkLink, resolveKeepsakeSelection, contractDocument, contractHash, suggestedDate } = await import("./.save-date-bundle.mjs");
const photoDataUrl="data:image/jpeg;base64,"+(await readFile(new URL("./save-date-fixture.jpg",import.meta.url))).toString("base64");
const design={version:1,topEnabled:true,topText:"Save the date",bottomText:"July 24, 2027",ink:"white",photoDataUrl};
const booking={id:"synthetic-artwork-booking",shop:"v0j63n-ms.myshopify.com",weddingDate:"2027-07-24",customerName:"Synthetic",customerEmail:"example@example.invalid",venue:"Test",totalCents:149500,balanceDueDate:"2027-06-24"};
const product={handle:"save-the-date-photo-magnets",name:"Save-the-dates",note:"Proof required",variants:[{id:"67923044827424",name:"25 magnets",priceCents:8900,available:true}]};
process.env.SHOPIFY_API_SECRET ||= "unit-test-only-placeholder";
process.env.SHOPIFY_APP_URL ||= "https://example.invalid";
try {
await test("photo borders are included in printable artwork and private design identity",()=>{
 const border={theme:"christmas",color:"#8B2536",width:.045},bordered={...design,border};
 assert.match(saveDateSvg(bordered),/stroke="#8B2536"/);
 assert.notEqual(designSummary(bordered).designHash,designSummary(design).designHash);
 assert.deepEqual(validateSaveDateDesign(bordered).border,border);
 const attrs=saveDateArtworkAttributes(booking,bordered),url=new URL(attrs.find(x=>x.key==="Save-the-date design").value);
 assert.equal(validArtworkLink(booking,bordered,url,Date.parse("2027-01-01")),true);
 assert.equal(validArtworkLink(booking,design,url,Date.parse("2027-01-01")),false);
 assert.throws(()=>validateSaveDateDesign({...design,border:{...border,color:'url(bad)'}}));
});
await test("both text overlays and date-only designs preserve the photograph and bottom date",()=>{
  assert.equal(photoBytes(photoDataUrl).length>1000,true);
  assert.match(saveDateSvg(design),/>Save the date<\/text>/);
  const onlyDate=saveDateSvg({...design,topEnabled:false});
  assert.doesNotMatch(onlyDate,/>Save the date<\/text>/);assert.match(onlyDate,/>July 24, 2027<\/text>/);assert.match(onlyDate,/width="2.5in"/);
  assert.equal(suggestedDate("2027-07-24"),"July 24, 2027");
  assert.equal(validateSaveDateDesign({...design,bottomText:"  07.24.2027 "}).bottomText,"07.24.2027");
});
await test("bounded raster validation rejects remote URLs, SVG, malformed photos and invalid text",()=>{
  for(const change of [{photoDataUrl:"https://example.invalid/photo.jpg"},{photoDataUrl:"data:image/svg+xml;base64,PHN2Zy8+"},{photoDataUrl:"data:image/jpeg;base64,/9j/2Q=="},{photoDataUrl:photoDataUrl+"A".repeat(700000)},{bottomText:""},{bottomText:"a".repeat(61)},{topEnabled:"false"},{ink:"javascript:bad"},{topText:"Save\nthe date"}])assert.throws(()=>validateSaveDateDesign({...design,...change}));
  const escaped=saveDateSvg({...design,topText:'<script>alert("x")</script>'});assert.doesNotMatch(escaped,/<script>/);assert.match(escaped,/&lt;script&gt;/);
});
await test("custom magnet colors survive validation, outlined artwork, order metadata and signatures",()=>{
 const custom={...design,ink:"#7B428C",typography:{topFont:"script",bottomFont:"modern",topSize:20,bottomSize:12}};
 assert.equal(validateSaveDateDesign(custom).ink,"#7b428c");
 assert.match(renderSaveDateSvg(custom),/fill="#7b428c"/);
 assert.equal(saveDateArtworkAttributes(booking,custom).find(a=>a.key==="Lettering").value,"#7B428C");
 assert.notEqual(designSummary(custom).designHash,designSummary({...custom,ink:"#28394d"}).designHash);
 for(const ink of [null,{},"#123","red","var(--ink)","#000000;display:none","#12345678","url(https://invalid)"])assert.throws(()=>validateSaveDateDesign({...design,ink}));
 assert.equal(validateSaveDateDesign(design).ink,"white");
 assert.equal(validateSaveDateDesign({...design,ink:"olive"}).ink,"olive");
});
await test("private artwork links bind the booking, shop, complete design, download kind and expiry",()=>{
  const attrs=saveDateArtworkAttributes(booking,design), url=new URL(attrs.find(a=>a.key==="Save-the-date design").value);
  assert.equal(validArtworkLink(booking,design,url,Date.parse("2027-01-01")),true);
  for(const pair of [[{...booking,id:"other"},design],[{...booking,shop:"other.myshopify.com"},design],[booking,{...design,topEnabled:false}],[booking,{...design,bottomText:"Other date"}]])assert.equal(validArtworkLink(...pair,url,Date.parse("2027-01-01")),false);
  for(const [key,value] of [["kind","photo"],["until","1999999999"],["hash","0".repeat(64)],["signature","0".repeat(64)]]){const bad=new URL(url);bad.searchParams.set(key,value);assert.equal(validArtworkLink(booking,design,bad,Date.parse("2027-01-01")),false);}
  assert.equal(validArtworkLink(booking,design,url,Date.parse("2029-01-01")),false);
});
await test("selected artwork survives catalogue validation without changing price or other keepsakes",()=>{
  const item={variantId:product.variants[0].id,unitCents:8900,quantity:1,personalization:design,personalizationRequested:true};
  const selection=resolveKeepsakeSelection([item],[product]);assert.equal(selection.subtotalCents,8900);assert.equal(selection.items[0].personalization.bottomText,design.bottomText);
  assert.throws(()=>resolveKeepsakeSelection([{...item,personalization:undefined}],[product]),/Finish/);
  assert.throws(()=>resolveKeepsakeSelection([item],[{...product,handle:"unrelated"}]),/unavailable/);
  assert.equal(resolveKeepsakeSelection([{variantId:item.variantId,unitCents:8900,quantity:1}],[product]).items[0].personalization,undefined);
});
await test("contract summaries bind the design without copying photo data or invalidating legacy keepsakes",()=>{
  const details={currency:"USD",prepaymentPercent:30,agreement:{text:"Test terms",version:1},keepsakes:{version:1,subtotalCents:8900,items:[{name:"Save-the-dates",variantName:"25 magnets",unitCents:8900,quantity:1,note:"Proof required",personalization:design}]}};
  const doc=contractDocument(booking,details);assert.doesNotMatch(JSON.stringify(doc),/data:image/);assert.equal(doc.keepsakes.items[0].personalization.designHash,designSummary(design).designHash);
  const changed=structuredClone(details);changed.keepsakes.items[0].personalization.topEnabled=false;assert.notEqual(contractHash(doc),contractHash(contractDocument(booking,changed)));
  const legacy=structuredClone(details);delete legacy.keepsakes.items[0].personalization;assert.deepEqual(contractDocument(booking,legacy).keepsakes,legacy.keepsakes);
});
await test("brand font and size choices are bounded and included in private artwork fingerprints",()=>{
 const typography={topFont:"script",bottomFont:"modern",topSize:20,bottomSize:12};
 const branded={...design,typography};
 assert.deepEqual(validateSaveDateDesign(branded).typography,typography);
 for(const change of [{topFont:"anything"},{bottomSize:25},{topSize:7},{topSize:NaN},{topSize:Infinity},{topSize:"20"},{topSize:12.1}])assert.throws(()=>validateSaveDateDesign({...branded,typography:{...typography,...change}}));
 assert.throws(()=>validateSaveDateDesign({...branded,topText:"Save 🎉"}),/support/);
 const summary=designSummary(branded);
 assert.notEqual(summary.designHash,designSummary({...branded,typography:{...typography,topSize:21}}).designHash);
 assert.notEqual(summary.designHash,designSummary({...branded,typography:{...typography,topFont:"modern"}}).designHash);
 assert.equal(Object.hasOwn(designSummary(design),"typography"),false);
});
await test("branded print artwork uses portable letter outlines and honors date-only selections",()=>{
 const typography={topFont:"script",bottomFont:"modern",topSize:20,bottomSize:12};
 const branded={...design,typography},svg=renderSaveDateSvg(branded);
 assert.match(svg,/<path /);assert.doesNotMatch(svg,/<text /);assert.doesNotMatch(svg,/@font-face/);
 assert.match(svg,/<title>Top: Save the date.*Atelier Script, 20 pt/);
 assert.match(svg,/Bottom: July 24, 2027.*Atelier Modern, 12 pt/);
 const dateOnly=renderSaveDateSvg({...branded,topEnabled:false});
 assert.match(dateOnly,/<title>Top line: off/);assert.ok(dateOnly.length<svg.length);
 assert.notEqual(svg,renderSaveDateSvg({...branded,typography:{...typography,topSize:24}}));
 assert.equal(renderSaveDateSvg(design),saveDateSvg(design));
 assert.throws(()=>saveDateSvg(branded),/font outlines/);
 const attrs=saveDateArtworkAttributes(booking,branded);
 assert.equal(attrs.find(a=>a.key==="Top lettering").value,"Atelier Script, 20 pt");
 assert.equal(attrs.find(a=>a.key==="Date lettering").value,"Atelier Modern, 12 pt");
});
} finally { await rm("tests/.save-date-bundle.mjs",{force:true}); }

test("non-wedding occasions may leave the bottom line empty",()=>{
  assert.equal(validateSaveDateDesign({...design,topText:"Merry Christmas",bottomText:""},{bottomOptional:true}).bottomText,"");
  assert.throws(()=>validateSaveDateDesign({...design,bottomText:""}));
});
