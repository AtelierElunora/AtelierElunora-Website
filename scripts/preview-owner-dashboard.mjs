import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {createSimulation} from '../print-helper/simulation.mjs';
const simulation=await createSimulation();
const port=Number(process.env.ATELIER_PREVIEW_PORT||4174),origin='http://127.0.0.1:'+port;
const assets=['atelier-owner-studio.js','atelier-owner-studio.css','atelier-studio-demo-1.jpg','atelier-studio-demo-2.jpg','atelier-studio-demo-3.jpg','atelier-station.js','atelier-station-core.js','atelier-station.css'];
createServer(async(req,res)=>{
 try{
  const url=new URL(req.url,'http://127.0.0.1:4174');res.setHeader('Cache-Control','no-store');
  if(url.pathname==='/simulation'){
   if(req.method!=='POST'||req.headers.origin!==origin){res.writeHead(403);res.end();return;}
   let body='';for await(const chunk of req){body+=chunk;if(body.length>16000)throw Error('Request too large');}
   try{res.setHeader('Content-Type','application/json');res.end(JSON.stringify(await simulation(JSON.parse(body))));}catch(e){res.writeHead(409,{'Content-Type':'application/json'});res.end(JSON.stringify({error:e.message}));}return;
  }
  if(url.pathname==='/pages/photo-station'){
   if(url.searchParams.get('demo')!=='print'){res.writeHead(403);res.end('Preview supports sample printing only.');return;}
   let html=await readFile(new URL('../theme/templates/page.photo-station.liquid',import.meta.url),'utf8');
   html=html.replace('{% layout none %}','').replace(/<meta http-equiv="Content-Security-Policy"[^>]*>/,'').replace(/{{ '([^']+)' \| asset_url }}/g,'/$1');
   res.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});res.end(html);return;
  }
  if(url.pathname==='/'){
   let html=await readFile(new URL('../theme/templates/page.owner-studio.liquid',import.meta.url),'utf8');
   html=html.replace('{% layout none %}','').replace('{{ request.locale.iso_code }}','en').replace('{{ shop.name | escape }}','Atelier Elunora').replace("{{ 'atelier-owner-studio.css' | asset_url | stylesheet_tag }}",'<link rel="stylesheet" href="/atelier-owner-studio.css">').replace(/{{ '([^']+)' \| asset_url }}/g,'/$1');
   res.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});res.end(html);return;
  }
  const name=url.pathname.slice(1);if(!assets.includes(name)){res.writeHead(404);res.end();return;}
  res.writeHead(200,{'Content-Type':name.endsWith('.css')?'text/css':name.endsWith('.jpg')?'image/jpeg':'text/javascript'});res.end(await readFile(new URL('../theme/assets/'+name,import.meta.url)));
 }catch{res.writeHead(500);res.end('Preview unavailable');}
}).on('error',console.error).listen(port,'127.0.0.1',()=>console.log('Owner dashboard simulation: '+origin+'/?demo=1&simulation=1 (sample data, no backend writes)'));
