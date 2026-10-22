import express from 'express';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {readFileSync} from 'node:fs';
import {fallback,contactUrl,sign,sessionToken,validSession,validQuestion,validInquiry,messagesFor,selectedAnswer} from './core.mjs';
import {chatStore} from './store.mjs';
import {modelClient} from './azure-model.mjs';

const directory=path.dirname(fileURLToPath(import.meta.url));
const shell=readFileSync(path.join(directory,'public/index.html'),'utf8');
export function createChatRouter({env=process.env,storeFactory=()=>chatStore(env),modelFactory=()=>modelClient(env)}={}) {
  const router=express.Router();
  const shops=new Set((env.ELUNORA_CHAT_SHOPS || 'v0j63n-ms.myshopify.com').split(',').map(s=>s.trim()).filter(s=>/^[a-z0-9][a-z0-9-]*\.myshopify\.com$/.test(s)));
  let origin, model;
  try { const url=new URL(env.SHOPIFY_APP_URL); if(url.protocol==='https:' || (env.NODE_ENV!=='production' && ['localhost','127.0.0.1'].includes(url.hostname))) origin=url.origin; } catch {}
  const secret=env.ELUNORA_CHAT_SESSION_SECRET;
  router.use((req,res,next)=>{
    res.set({'Cache-Control':'no-store','Referrer-Policy':'no-referrer','X-Content-Type-Options':'nosniff',
      'Content-Security-Policy':`default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors https://atelierelunora.com https://www.atelierelunora.com ${[...shops].map(s=>'https://'+s).join(' ')} ${origin || ''}`});
    next();
  });
  router.use('/assets',express.static(path.join(directory,'public'),{index:false,dotfiles:'deny'}));
  router.use('/:shop',(req,res,next)=>{
    if (!shops.has(req.params.shop)) return res.status(404).json({error:'Chat unavailable',contactUrl});
    if (!origin || !secret || secret.length<32 || env.ELUNORA_CHAT_ENABLED!=='true') return res.status(503).json({...fallback,error:'Chat is not enabled.'});
    next();
  });
  router.get('/:shop',(req,res)=>res.type('html').send(shell));
  router.get('/:shop/config',async(req,res)=>{
    try {
      const store=storeFactory(), {config}=await store.settings(req.params.shop);
      const ip=sign(req.ip || 'unknown',secret);
      res.json({enabled:config.enabled,aiEnabled:config.aiEnabled,contactUrl,
        questions:config.enabled ? config.faqs.filter(f=>f.approved).slice(0,5).map(f=>f.question) : [],
        token:sessionToken(req.params.shop,ip,secret)});
    } catch { res.status(503).json({...fallback,error:'Chat temporarily unavailable.'}); }
  });
  router.use('/:shop', (req,res,next)=>{
    if (req.method!=='POST') return next();
    if (req.get('Origin')!==origin || !req.is('application/json')) return res.status(403).json({error:'Refresh the chat and try again.',contactUrl});
    const ip=sign(req.ip || 'unknown',secret);
    if(!validSession(req.get('X-Chat-Token'),req.params.shop,ip,secret)) return res.status(403).json({error:'Your chat session expired. Close and reopen chat.',contactUrl});
    res.locals.chatIp=ip;
    next();
  });
  router.use(express.json({limit:'6kb',strict:true}));
  router.post('/:shop/messages',async(req,res)=>{
    let question;
    try { question=validQuestion(req.body?.question); } catch(e) { return res.status(400).json({error:e.message}); }
    try {
      const shop=req.params.shop, store=storeFactory(), {config}=await store.settings(shop);
      if(!config.enabled) return res.json({...fallback});
      if(!await store.rate(`${shop}:message:${res.locals.chatIp}`,15,60)) return res.status(429).json({...fallback,error:'Please wait a minute before asking another question.'});
      const faqs=config.faqs.filter(f=>f.approved);
      const exact=faqs.find(f=>f.question.toLowerCase()===question.toLowerCase());
      if(exact) return res.json(selectedAnswer(faqs,exact.id));
      if(!config.aiEnabled || !faqs.length) return res.json({...fallback});
      const messages=messagesFor(question,faqs);
      // UTF-8 byte count deliberately over-reserves input tokens plus schema and output overhead.
      const tokens=Buffer.byteLength(JSON.stringify(messages),'utf8')+2048;
      const reservation=await store.reserve(shop,config,tokens);
      if(!reservation) return res.json({...fallback,limited:true});
      try {
        model ||= modelFactory();
        const result=await model(messages);
        await store.settle(shop,reservation,result.tokens);
        return res.json(selectedAnswer(faqs,result.id));
      } catch { return res.json({...fallback}); }
    } catch { return res.status(503).json({...fallback,error:'Chat temporarily unavailable. You can still contact us.'}); }
  });
  router.post('/:shop/inquiries',async(req,res)=>{
    let details;
    try { details=validInquiry(req.body); } catch(e) { return res.status(400).json({error:e.message}); }
    try {
      const shop=req.params.shop, store=storeFactory(), {config}=await store.settings(shop);
      if(!config.enabled) return res.status(503).json({error:'Please use our contact page.',contactUrl});
      if(!await store.rate(`${shop}:inquiry:${res.locals.chatIp}`,3,3600) || !await store.rate(`${shop}:inquiry:all`,100,86400)) return res.status(429).json({error:'Please use our contact page for further inquiries.',contactUrl});
      const id=await store.inquiry(shop,details);
      res.status(201).json({id,message:'Your inquiry was saved for Atelier Elunora to review. This does not confirm a booking or delivery date.'});
    } catch { res.status(503).json({error:'We could not save your inquiry. Please use our contact page.',contactUrl}); }
  });
  router.use((err,req,res,next)=>{if(res.headersSent)return next(err);res.status(err.type==='entity.too.large'?413:400).json({error:'Unable to read the request. Please shorten it and try again.',contactUrl});});
  return router;
}
