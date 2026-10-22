(() => {
  document.querySelectorAll('.elunora-chat').forEach(root=>{
    const button=root.querySelector('.elunora-chat-launch'),dialog=root.querySelector('dialog'),frame=root.querySelector('iframe');
    let endpoint;
    try{
      const url=new URL(root.dataset.chatUrl);
      if(url.protocol!=='https:'||!url.hostname.endsWith('.azurewebsites.net')||url.username||url.password)throw Error();
      if(!/^[a-z0-9][a-z0-9-]*\.myshopify\.com$/.test(root.dataset.chatShop))throw Error();
      endpoint=new URL('/assistant/'+root.dataset.chatShop,url.origin);
    }catch{root.remove();return;}
    function close(){dialog.close();button.focus();}
    button.addEventListener('click',()=>{if(!frame.src)frame.src=endpoint.href;dialog.showModal();root.querySelector('.elunora-chat-close').focus();});
    root.querySelector('.elunora-chat-close').addEventListener('click',close);
    dialog.addEventListener('cancel',e=>{e.preventDefault();close();});
    dialog.addEventListener('click',e=>{if(e.target===dialog){const r=dialog.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)close();}});
    window.addEventListener('message',e=>{if(e.source===frame.contentWindow&&e.origin===endpoint.origin&&e.data?.type==='elunora:chat-close')close();});
  });
})();
