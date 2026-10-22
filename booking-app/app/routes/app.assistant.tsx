import type {ActionFunctionArgs,LoaderFunctionArgs} from "react-router";
import {Form,useActionData,useLoaderData,useNavigation} from "react-router";
import {useState} from "react";
import {authenticate} from "../shopify.server";
import {requireOrigin} from "../booking.server";
import {chatStore} from "../../chat/store.mjs";
import {validateSettings} from "../../chat/core.mjs";

type Faq={id:string;question:string;answer:string;url:string;approved:boolean};
type Settings={enabled:boolean;aiEnabled:boolean;monthlyRequests:number;monthlyTokens:number;faqs:Faq[]};
export async function loader({request}:LoaderFunctionArgs){
  const {session}=await authenticate.admin(request);
  const store=chatStore(), saved=await store.settings(session.shop);
  return {config:saved.config as Settings,revision:saved.revision,usage:await store.usage(session.shop),inquiries:await store.inbox(session.shop),serviceEnabled:process.env.ELUNORA_CHAT_ENABLED==="true"};
}
export async function action({request}:ActionFunctionArgs){
  const {session}=await authenticate.admin(request);requireOrigin(request);
  const form=await request.formData();
  try{
    const store=chatStore();
    if(form.get("intent")==="reviewed"){
      await store.reviewed(session.shop,String(form.get("id")||""));
      return {success:"Inquiry marked as reviewed."};
    }
    const revision=Number(form.get("revision"));
    if(!Number.isSafeInteger(revision)||revision<0)throw Error("Reload this page before saving.");
    const raw=String(form.get("config")||"");if(raw.length>60000)throw Error("FAQ content is too long.");
    const config=validateSettings(JSON.parse(raw));
    await store.save(session.shop,config,revision);
    return {success:"Assistant settings saved."};
  }catch(error){return {error:error instanceof SyntaxError?"Check your FAQ entries.":error instanceof Error?error.message:"Unable to save assistant settings."};}
}
function Editor({initial,revision}:{initial:Settings;revision:number}){
  const [config,setConfig]=useState(initial),navigation=useNavigation();
  const update=(id:string,key:keyof Faq,value:string|boolean)=>setConfig({...config,faqs:config.faqs.map(f=>f.id===id?{...f,[key]:value}:f)});
  return <Form method="post" style={{maxWidth:780}}>
    <input type="hidden" name="config" value={JSON.stringify(config)}/><input type="hidden" name="revision" value={revision}/>
    <p><label><input type="checkbox" checked={config.enabled} onChange={e=>setConfig({...config,enabled:e.target.checked})}/> Enable the assistant</label></p>
    <p><label><input type="checkbox" checked={config.aiEnabled} onChange={e=>setConfig({...config,aiEnabled:e.target.checked})}/> Use Azure AI to match naturally worded questions to approved answers</label></p>
    <p>The assistant returns your approved wording unchanged. AI can still choose an unsuitable answer. Questions without a match go to your team. It cannot access orders, promise dates, issue quotes, or change bookings.</p>
    <label>Monthly AI request limit <input type="number" min="1" max="10000" required value={config.monthlyRequests} onChange={e=>setConfig({...config,monthlyRequests:Number(e.target.value)})}/></label>{" "}
    <label>Monthly token allowance <input type="number" min="1" max="20000000" required value={config.monthlyTokens} onChange={e=>setConfig({...config,monthlyTokens:Number(e.target.value)})}/></label>
    <p>When either allowance is exhausted, suggested questions still work and visitors can contact your team. These are usage limits, not a dollar spending cap. Provider failures retain their reserved allowance.</p>
    {config.faqs.map((f,index)=><fieldset key={f.id} style={{margin:"20px 0",padding:16}}><legend>Answer {index+1}</legend>
      <label style={{display:"block"}}>Question<input style={{display:"block",width:"100%"}} required maxLength={200} value={f.question} onChange={e=>update(f.id,"question",e.target.value)}/></label>
      <label style={{display:"block"}}>Approved answer<textarea style={{display:"block",width:"100%"}} required rows={4} maxLength={1200} value={f.answer} onChange={e=>update(f.id,"answer",e.target.value)}/></label>
      <label style={{display:"block"}}>Source page (optional)<input style={{display:"block",width:"100%"}} type="url" value={f.url} onChange={e=>update(f.id,"url",e.target.value)}/></label>
      <p><label><input type="checkbox" checked={f.approved} onChange={e=>update(f.id,"approved",e.target.checked)}/> I reviewed this answer and approve it for visitors</label></p>
      <button type="button" onClick={()=>setConfig({...config,faqs:config.faqs.filter(row=>row.id!==f.id)})}>Remove this answer</button>
    </fieldset>)}
    <button type="button" disabled={config.faqs.length>=30} onClick={()=>setConfig({...config,faqs:[...config.faqs,{id:"faq-"+crypto.randomUUID().slice(0,12),question:"",answer:"",url:"",approved:false}]})}>Add answer</button>{" "}
    <button disabled={navigation.state!=="idle"}>{navigation.state!=="idle"?"Saving…":"Save assistant settings"}</button>
  </Form>;
}
export default function Assistant(){
  const data=useLoaderData<typeof loader>(),result=useActionData<typeof action>();
  return <s-page heading="Atelier assistant"><s-section heading="Answers and usage">
    {!data.serviceEnabled&&<p>The assistant is disabled at the Azure service level. You can prepare answers here before launch.</p>}
    <p>This month: {data.usage.requests} AI requests; {String(data.usage.tokens)} tokens used or reserved.</p>
    {result&&<p role={"error"in result?"alert":"status"}>{"error"in result?result.error:result.success}</p>}
    <Editor key={data.revision} initial={data.config} revision={data.revision}/>
  </s-section><s-section heading="Visitor inquiries"><p>Latest 50 inquiries. Check this inbox regularly; submissions do not send email notifications.</p>
    {data.inquiries.length===0&&<p>No inquiries yet.</p>}
    {data.inquiries.map((item:{id:string;details:Record<string,string>;status:string;created_at:string})=><article key={item.id} style={{borderBottom:"1px solid #ccc",padding:"16px 0"}}><h3>{item.details.name} · {item.status}</h3><p>{item.details.email} · {new Date(item.created_at).toLocaleString()}</p><p style={{whiteSpace:"pre-wrap"}}>{item.details.message}</p><p>{item.details.eventDate} {item.details.location} {item.details.guests&&"· "+item.details.guests+" guests"}</p>{item.status==="new"&&<Form method="post"><input type="hidden" name="intent" value="reviewed"/><input type="hidden" name="id" value={item.id}/><button>Mark reviewed</button></Form>}</article>)}
  </s-section></s-page>;
}
