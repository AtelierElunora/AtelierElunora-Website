document.querySelectorAll('.elunora-booking-block').forEach(block=>{
  const trigger=block.querySelector('.elunora-booking-trigger'),dialog=block.querySelector('dialog'),frame=block.querySelector('iframe');
  const reportedInquiries=new Set();
  const googleInquiries=new Set();
  function reportGoogleInquiry(id){
    // Reuse the Google & YouTube app's existing tag. Never install a second SDK.
    if(!['https://www.atelierelunora.com','https://atelierelunora.com'].includes(location.origin))return;
    try {
      const privacy=window.Shopify?.customerPrivacy;
      if(privacy?.analyticsProcessingAllowed?.()!==true || privacy?.marketingAllowed?.()!==true || privacy?.saleOfDataAllowed?.()!==true)return;
      // Some integrations expose only the existing default dataLayer, not a gtag wrapper.
      const send=typeof window.gtag==='function' ? (...args)=>window.gtag(...args) : Array.isArray(window.dataLayer) ? function(){window.dataLayer.push(arguments);} : null;
      if(!send)return;
      const key='elunora:google-inquiry:'+id;
      if(googleInquiries.has(id))return;
      try {if(window.sessionStorage.getItem(key)){googleInquiries.add(id);return;}} catch { /* Memory deduplication still applies. */ }
      // The lead event carries no names, email addresses, message contents or access tokens.
      send('event','generate_lead',{send_to:'G-DT8V6JCFSX',lead_source:'booking_form',page_location:location.origin+location.pathname,page_title:'Wedding inquiry'});
      googleInquiries.add(id);
      try {window.sessionStorage.setItem(key,'1');} catch { /* Storage can be blocked. */ }
    } catch { /* Measurement must never interrupt an inquiry or Meta reporting. */ }
  }
  trigger.addEventListener('click',()=>{
    if(!trigger.dataset.elunoraUrl)return;
    const url=new URL(trigger.dataset.elunoraUrl,location.origin);
    if(url.protocol!=='https:')return;
    const variants=JSON.parse(block.querySelector('.elunora-product-variants').textContent);
    const product=block.closest('product-component') || block.closest('.shopify-section') || block;
    const candidates=[product.querySelector('input[type="radio"][data-variant-id]:checked')?.dataset.variantId,new URL(location.href).searchParams.get('variant'),product.querySelector('input[name="id"]')?.value];
    const variant=candidates.find(id=>variants.some(v=>String(v.id)===String(id)));
    const collection=variants.find(v=>String(v.id)===String(variant))?.title || trigger.dataset.elunoraCollection;
    url.searchParams.set('embed','1');url.searchParams.set('collection',collection);url.searchParams.set('parentOrigin',location.origin);if(variant)url.searchParams.set('variant',variant);
    frame.src=url.href;dialog.showModal();
  });
  window.addEventListener('message',event=>{
    if(!frame.getAttribute('src') || event.source!==frame.contentWindow || event.origin!==new URL(frame.src).origin)return;
    if(event.data?.type==='elunora:booking-close'){dialog.close();return;}
    const id=event.data?.conversionId;
    if(event.data?.type!=='elunora:inquiry-saved' || typeof id!=='string' || !/^[a-f0-9]{64}$/.test(id) || reportedInquiries.has(id))return;
    reportGoogleInquiry(id);
    const analytics=window.Shopify?.analytics;
    if(typeof analytics?.publish!=='function')return;
    reportedInquiries.add(id);
    try {
      // Publish only the opaque identifier, never the iframe message wholesale.
      Promise.resolve(analytics.publish('elunora:inquiry_saved',{conversion_id:id})).catch(()=>reportedInquiries.delete(id));
    } catch {reportedInquiries.delete(id);}
  });
  block.querySelector('.elunora-booking-dismiss').addEventListener('click',()=>dialog.close());
  dialog.addEventListener('close',()=>{frame.removeAttribute('src');trigger.focus()});
});
