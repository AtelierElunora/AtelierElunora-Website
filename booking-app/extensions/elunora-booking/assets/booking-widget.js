document.querySelectorAll('.elunora-booking-block').forEach(block=>{
  const trigger=block.querySelector('.elunora-booking-trigger'),dialog=block.querySelector('dialog'),frame=block.querySelector('iframe');
  trigger.addEventListener('click',()=>{
    if(!trigger.dataset.elunoraUrl)return;
    const url=new URL(trigger.dataset.elunoraUrl,location.origin);
    if(url.protocol!=='https:')return;
    const variants=JSON.parse(block.querySelector('.elunora-product-variants').textContent);
    const product=block.closest('product-component') || block.closest('.shopify-section') || block;
    const candidates=[product.querySelector('input[type="radio"][data-variant-id]:checked')?.dataset.variantId,new URL(location.href).searchParams.get('variant'),product.querySelector('input[name="id"]')?.value];
    const variant=candidates.find(id=>variants.some(v=>String(v.id)===String(id)));
    const collection=variants.find(v=>String(v.id)===String(variant))?.title || trigger.dataset.elunoraCollection;
    url.searchParams.set('embed','1');url.searchParams.set('collection',collection);if(variant)url.searchParams.set('variant',variant);
    frame.src=url.href;dialog.showModal();
  });
  window.addEventListener('message',event=>{
    if(!frame.src || event.source!==frame.contentWindow || event.origin!==new URL(frame.src).origin || event.data?.type!=='elunora:booking-close')return;
    dialog.close();
  });
  block.querySelector('.elunora-booking-dismiss').addEventListener('click',()=>dialog.close());
  dialog.addEventListener('close',()=>{frame.removeAttribute('src');trigger.focus()});
});
