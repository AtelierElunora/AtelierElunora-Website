import express from 'express';
import compression from 'compression';
import {createChatRouter} from '../chat/http.mjs';
import {createRequestHandler} from '@react-router/express';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import * as build from '../build/server/index.js';
const root=fileURLToPath(new URL('../',import.meta.url));
const buildHash=createHash('sha256').update(readFileSync(path.join(root,'build/server/index.js'))).digest('hex');
const app=express();
app.use('/health',(req,res,next)=>{res.set('X-Booking-Build',buildHash);next();});
app.disable('x-powered-by');
// Portal tokens and Shopify session tokens must never appear in request logs.
app.use(compression());
// Chat routes are isolated from booking sessions, payments, and customer APIs.
app.use('/assistant',createChatRouter());
app.use('/assets',express.static(path.join(root,'build/client/assets'),{immutable:true,maxAge:'1y'}));
app.use(express.static(path.join(root,'build/client')));
app.use(express.static(path.join(root,'public'),{maxAge:'1h'}));
app.use((req,res,next)=>{res.set('Cache-Control','no-store');res.set('Referrer-Policy','no-referrer');const size=Number(req.headers['content-length']||0);if(size>2*1024*1024)return res.status(413).send('Request is too large');next();});
app.all('*',createRequestHandler({build,mode:process.env.NODE_ENV}));
const server=app.listen(Number(process.env.PORT||3000),process.env.HOST||'0.0.0.0',()=>console.info('Booking server ready'));
for(const signal of ['SIGTERM','SIGINT'])process.once(signal,()=>server.close());
