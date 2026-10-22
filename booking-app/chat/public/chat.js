(() => {
  const el=id=>document.getElementById(id), base=location.pathname.replace(/\/$/,''), ask=el('ask'), inquiry=el('inquiry');
  let config, loadedAt=0, started=false, busy=false, turns=0;
  const status=text=>{el('status').textContent=text;};
  function close(){try{if(window.parent!==window)window.parent.postMessage({type:'elunora:chat-close'},new URL(document.referrer).origin);}catch{}}
  el('close').addEventListener('click',close);
  document.addEventListener('keydown',e=>{if(e.key==='Escape')close();});
  function message(text,visitor=false,source){
    const box=document.createElement('div');box.className='message'+(visitor?' visitor':'');
    const name=document.createElement('strong');name.textContent=visitor?'You':'Atelier assistant';
    const paragraph=document.createElement('p');paragraph.textContent=text;box.append(name,paragraph);
    if(source){const a=document.createElement('a');a.className='source';a.textContent=source.title;const url=new URL(source.url);if(url.protocol==='https:'&&['www.atelierelunora.com','atelierelunora.com'].includes(url.hostname)){a.href=url.href;a.target='_blank';a.rel='noopener noreferrer';box.append(a);}}
    el('conversation').append(box);box.scrollIntoView({block:'nearest'});
  }
  async function post(route,body){
    if(Date.now()-loadedAt>3000000){
      const refreshed=await fetch(base+'/config',{signal:AbortSignal.timeout(10000)});
      if(!refreshed.ok)throw Error('Chat is unavailable. Please use our contact page.');
      config=await refreshed.json();loadedAt=Date.now();
      if(!config.enabled)throw Error('Chat is unavailable. Please use our contact page.');
    }
    const response=await fetch(base+route,{method:'POST',headers:{'Content-Type':'application/json','X-Chat-Token':config.token},body:JSON.stringify(body),signal:AbortSignal.timeout(20000)});
    const data=await response.json();if(!response.ok)throw Error(data.error||'Please contact our team.');return data;
  }
  async function send(question){
    if(!started||busy||turns>=20)return;
    busy=true;ask.querySelector('button').disabled=true;
    el('questions').querySelectorAll('button').forEach(b=>b.disabled=true);
    message(question,true);el('question').value='';status('Finding an approved answer…');
    try{const data=await post('/messages',{question});message(data.answer,false,data.source);if(data.handoff){el('handoff').open=true;inquiry.elements.message.value=question;}turns++;status(turns>=20?'Please use Ask our team to continue.':'');}
    catch{status('We couldn’t answer that just now. Please use Ask our team or our contact page.');}
    finally{busy=false;ask.querySelector('button').disabled=turns>=20;el('questions').querySelectorAll('button').forEach(b=>b.disabled=turns>=20);el('question').focus();}
  }
  el('start').addEventListener('click',()=>{if(!config?.enabled)return;started=true;el('consent').hidden=true;ask.hidden=false;el('question').focus();});
  ask.addEventListener('submit',e=>{e.preventDefault();const q=el('question').value.trim();if(q)send(q);});
  inquiry.addEventListener('submit',async e=>{
    e.preventDefault();if(!config?.enabled)return;
    const button=inquiry.querySelector('button');button.disabled=true;el('receipt').textContent='Saving your inquiry…';
    try{const data=await post('/inquiries',{...Object.fromEntries(new FormData(inquiry)),consent:inquiry.elements.consent.checked});inquiry.reset();inquiry.hidden=true;el('receipt').textContent=data.message+' Reference: '+data.id;}
    catch(error){el('receipt').textContent=error.message;button.disabled=false;}
  });
  fetch(base+'/config',{signal:AbortSignal.timeout(10000)}).then(async response=>{
    if(!response.ok)throw Error();config=await response.json();loadedAt=Date.now();
    if(!config.enabled)throw Error();status('');
    config.questions.forEach(q=>{const b=document.createElement('button');b.type='button';b.textContent=q;b.addEventListener('click',()=>{if(!started){el('consent').scrollIntoView({block:'nearest'});el('start').focus();return;}send(q);});el('questions').append(b);});
  }).catch(()=>{status('Chat is currently unavailable. Please use our contact page.');el('consent').hidden=true;el('handoff').hidden=true;});
})();
