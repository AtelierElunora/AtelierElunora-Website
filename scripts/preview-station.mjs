import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
const assets=['atelier-station.js','atelier-station-core.js','atelier-station.css'];
createServer(async(req,res)=>{
 try{
  const url=new URL(req.url,'http://localhost:4173');
  if(url.pathname==='/'){
   let html=await readFile(new URL('../theme/templates/page.photo-station.liquid',import.meta.url),'utf8');
   html=html.replace('{% layout none %}','').replace(/{{ '([^']+)' \| asset_url }}/g,'/$1');
   res.writeHead(200,{'Content-Type':'text/html','Cache-Control':'no-store'});res.end(html);return;
  }
  const name=url.pathname.slice(1);if(!assets.includes(name)){res.writeHead(404);res.end();return;}
  res.writeHead(200,{'Content-Type':name.endsWith('.css')?'text/css':'text/javascript','Cache-Control':'no-store'});res.end(await readFile(new URL('../theme/assets/'+name,import.meta.url)));
 }catch{res.writeHead(500);res.end('Preview unavailable');}
}).listen(4173,'127.0.0.1',()=>console.log('Local demo (nothing uploaded): http://localhost:4173/?demo=capture or http://localhost:4173/?demo=print'));
