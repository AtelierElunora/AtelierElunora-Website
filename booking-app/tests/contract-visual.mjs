import {build} from "esbuild";
import {readFile,mkdir,writeFile} from "node:fs/promises";
import {createServer} from "node:http";
import assert from "node:assert/strict";
import {chromium,webkit,devices} from "playwright";
const root=process.cwd();
const output="artifacts/contracts";
await mkdir(output,{recursive:true});
const compiled=await build({entryPoints:["app/booking-contract.server.ts"],bundle:true,platform:"node",format:"esm",write:false});
const api=await import("data:text/javascript;base64,"+Buffer.from(compiled.outputFiles[0].text).toString("base64"));
const source=await readFile("app/routes/portal.$id.tsx","utf8");
const component=source.slice(source.indexOf("export default function Portal")).replace("export default function Portal","function Portal");
assert.ok(component.startsWith("function Portal"),"Use the actual portal component");
const entry='import React,{useEffect,useRef} from "react";import {createRoot} from "react-dom/client";import {Form,useLoaderData,useActionData,useNavigation,createMemoryRouter,RouterProvider} from "react-router";import {ContractCopy,ContractSigning} from "./app/BookingContract";import {percentAmount} from "./app/booking-rules";'+component+'\nconst router=createMemoryRouter([{path:"/",loader:()=>fetch("/sample").then(r=>r.json()),action:async({request})=>{const f=await request.formData();return fetch("/simulate",{method:"POST",body:new URLSearchParams([...f])}).then(r=>r.json())},Component:Portal}]);createRoot(document.getElementById("root")).render(<RouterProvider router={router}/>);';
const client=await build({stdin:{contents:entry,resolveDir:root,loader:"tsx"},bundle:true,platform:"browser",format:"iife",write:false,jsx:"automatic",define:{"process.env.NODE_ENV":'"production"'}});
let booking,details;
function reset(){
booking={id:"SAMPLE-AE-2028",customerName:"Alex & Jordan",customerEmail:"couple@example.invalid",venue:"The Garden Estate · Example venue",weddingDate:"2028-07-24",totalCents:149500,paidCents:0,balanceDueDate:"2028-06-24",status:"hold"};
details={currency:"USD",prepaymentPercent:30,guests:150,phone:"+1 555 555 0100",preferredStartTime:"5:00 PM",package:{name:"Up to 150 guests"},addons:[],customerNotes:"Garden reception",agreement:{version:1,text:"SAMPLE TERMS FOR VISUAL TESTING ONLY.\n\nYour actual contract displays the booking and cancellation terms saved for your event.\n\nThis demonstration does not create a reservation, contract or payment.",acceptedAt:null,signatureRequired:true},changePolicy:{enabled:true,cutoffDays:30}};
api.refreshContract(booking,details);
}
reset();
const assets=Object.fromEntries(await Promise.all(["portal.css","contract.css","elunora-logo.png"].map(async p=>["/"+p,await readFile("public/"+p)])));
const html='<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Atelier Elunora · Contract test preview</title></head><body><aside style="text-align:center;padding:12px;background:#e7e4d8;color:#454734;font:13px Arial">SAMPLE BOOKING · Visual test · No real booking or payment</aside><div id="root"></div><script src="/client.js"></script></body></html>';
let submissions=0;
const server=createServer(async(req,res)=>{
try{
res.setHeader("Cache-Control","no-store");
const url=new URL(req.url,"http://localhost");
if(url.pathname==="/sample"){res.setHeader("Content-Type","application/json");res.end(JSON.stringify({booking:{...booking,detailsJson:JSON.stringify(details)},terms:{currency:"USD",percent:30,agreement:details.agreement,contract:api.currentContract(booking,details),contractHistory:[],package:details.package,addons:[],changePolicy:details.changePolicy},token:"LOCAL-SAMPLE",events:[],payments:[]}));}
else if(url.pathname==="/simulate"&&req.method==="POST"){
submissions++;let body="";for await(const c of req)body+=c;const p=new URLSearchParams(body);
res.setHeader("Content-Type","application/json");
try{if(p.get("op")!=="agreement")throw Error("Payments are disabled in this sample fixture.");const f=new FormData();for(const [k,v]of p)f.set(k,v);api.applyContractSignature(booking,details,f,"Automated sample browser");res.end(JSON.stringify({success:"Your signed contract is saved. You can now choose your payment option."}));}
catch(e){res.statusCode=400;res.end(JSON.stringify({error:e.message}));}
}
else if(url.pathname==="/client.js"){res.setHeader("Content-Type","text/javascript");res.end(client.outputFiles[0].text);}
else if(assets[url.pathname]){res.setHeader("Content-Type",url.pathname.endsWith(".png")?"image/png":"text/css");res.end(assets[url.pathname]);}
else{res.setHeader("Content-Type","text/html");res.end(html);}
}catch(e){res.statusCode=500;res.end(e.message)}
});
await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve));
const origin="http://127.0.0.1:"+server.address().port;
const results=[];
async function capture(locator,name){
const buffer=await locator.screenshot({path:output+"/"+name+".jpg",type:"jpeg",quality:75});
console.log("CONTRACT_SCREENSHOT:"+name+":"+buffer.toString("base64"));
}
try{
for(const [engine,name,options]of [[chromium,"desktop",{viewport:{width:1280,height:1000}}],[webkit,"iphone",{...devices["iPhone 13"]}]]){
reset();submissions=0;const browser=await engine.launch();const context=await browser.newContext(options);
const page=await context.newPage();const errors=[];page.on("pageerror",e=>errors.push(e.message));
await page.route("**/*",route=>route.request().url().startsWith(origin)?route.continue():route.abort());
try{
await page.goto(origin);await page.getByRole("heading",{name:"Your celebration, in writing."}).waitFor();
assert.equal(await page.getByRole("button",{name:/Pay 30% prepayment/}).count(),0,"Payment hidden before signing");
assert.match(await page.locator(".contract-facts").innerText(),/\$448\.50/);
assert.match(await page.locator(".contract-facts").innerText(),/\$1,046\.50/);
assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,"No horizontal overflow");
if(name==="desktop")await capture(page.locator(".contract-document"),"01-review-contract-desktop");
const sign=page.getByRole("button",{name:"Sign my contract",exact:true});
await sign.click();assert.equal(submissions,0,"Empty name blocked");
await page.getByRole("textbox",{name:"Full name for your signature"}).fill("Alex Example");
await sign.click();assert.equal(submissions,0,"Consent required");
if(name==="iphone")await capture(page.locator(".contract-sign-form"),"02-sign-contract-iphone");
await page.getByRole("checkbox").check();
await sign.click();
await page.getByText("Your signed contract is saved.",{exact:true}).waitFor();
await page.getByRole("button",{name:"Pay 30% prepayment · $448.50",exact:true}).waitFor();
await page.getByRole("button",{name:"Pay in full · $1,495.00",exact:true}).waitFor();
assert.equal(submissions,1,"Exactly one signature submission");
assert.equal(booking.paidCents,0,"Signature never marks payment");
assert.equal(booking.status,"hold","Signature never confirms date");
assert.equal(details.agreement.contract.signature.name,"Alex Example");
assert.equal(await sign.count(),0,"Saved signature replaces form");
assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
if(name==="iphone"){
await capture(page.locator(".contract-signature"),"03-signed-receipt-iphone");
await page.getByRole("heading",{name:"At a glance",exact:true}).scrollIntoViewIfNeeded();
await capture(page,"04-payment-options-iphone");
}
const popupPromise=page.waitForEvent("popup");
await page.getByRole("button",{name:"Print / save as PDF",exact:true}).click();
const popup=await popupPromise;await popup.getByRole("heading",{name:"Electronically signed",exact:true}).waitFor();
assert.equal(popup.url(),"about:blank","Private URL absent from print headers");
assert.match(await popup.locator("body").innerText(),/SAMPLE TERMS FOR VISUAL TESTING ONLY/);
assert.match(await popup.locator("body").innerText(),/Alex Example/);
if(name==="desktop")await capture(popup,"05-printable-contract");
await popup.close();
assert.deepEqual(errors,[],"No browser runtime errors");
results.push({browser:name,result:"passed",checks:["30/70 amounts","payment hidden until signature","name and consent required","one signature","signature does not confirm or charge","saved receipt","no horizontal overflow","private printable copy"]});
}finally{await browser.close()}
}
await writeFile(output+"/results.json",JSON.stringify({testedSource:process.env.GITHUB_SHA,fixture:"Sample data; actual portal and contract components, actual signature helper. Shopify, email, database and external services disabled.",results},null,2));
console.log("CONTRACT_VISUAL_RESULTS "+JSON.stringify(results));
}finally{await new Promise(resolve=>server.close(resolve))}
