import {PRODUCT_PACKS} from '../supabase/functions/gallery-api/product-packs.mjs';
const counts=new Map([...PRODUCT_PACKS.map(p=>[p.variant.split('/').at(-1),p.count]),...['52368201875744','52368201908512','52368201941280','52368201974048'].map((id,i)=>[id,[6,12,24,48][i]])]);
export function productUploadUrl(variant,origin,search=''){
 if(!counts.has(String(variant)))throw Error('This product is not connected to the photo uploader yet.');
 const url=new URL('/pages/client-gallery',origin);url.searchParams.set('view','photo-magnets');url.searchParams.set('upload_variant',String(variant));
 const preview=new URLSearchParams(search).get('preview_theme_id');if(/^\d+$/.test(preview||''))url.searchParams.set('preview_theme_id',preview);
 return url.href;
}
export async function addPhotoSelectionToCart(manifest,fetcher=fetch,root='/'){
 if(!/^\d+$/.test(String(manifest.variant))||!counts.has(String(manifest.variant))||manifest.count!==counts.get(String(manifest.variant))||!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(manifest.reference))throw Error('Could not verify your photo selection. Please reload and retry.');
 if(!/^\/(?:[a-z]{2}(?:-[A-Za-z]{2})?\/)?$/.test(root))root='/';
 const cart=root+'cart';
 const read=async()=>{const r=await fetcher(cart+'.js',{credentials:'same-origin',cache:'no-store'});if(!r.ok)throw Error('Could not check your cart. Please retry.');return r.json();};
 const present=data=>{const matches=data.items.filter(i=>i.properties?.['Gallery selection']===manifest.reference);if(!matches.length)return false;if(matches.length!==1||String(matches[0].variant_id)!==String(manifest.variant)||matches[0].quantity!==1||String(matches[0].properties?.['Magnet count'])!==String(manifest.count))throw Error('This photo selection is already in your cart with different options. Remove it from the cart before trying again.');return true;};
 if(present(await read()))return cart;
 const body=JSON.stringify({items:[{id:manifest.variant,quantity:1,properties:{'Gallery selection':manifest.reference,'Magnet count':String(manifest.count)}}]});
 // Never blindly retry an add after an ambiguous response. Read the cart first.
 try{const r=await fetcher(cart+'/add.js',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body});if(!r.ok)throw Error('Cart update failed.');}catch{if(present(await read()))return cart;throw Error('Could not add your selection. Your photos are saved; please retry.');}
 if(!present(await read()))throw Error('Could not confirm your selection in the cart. Please retry.');
 return cart;
}
if(typeof window!=='undefined'){
 window.atelierAddPhotoSelectionToCart=addPhotoSelectionToCart;
 if(!customElements.get('atelier-product-upload'))customElements.define('atelier-product-upload',class extends HTMLElement{
  connectedCallback(){
   this.controller?.abort();this.controller=new AbortController();const signal=this.controller.signal;
   this.link=this.querySelector('a');this.message=this.querySelector('[data-upload-status]');if(!this.link)return;
   this.variant=this.dataset.variant;this.available=this.dataset.available==='true';this.generation=0;this.update();
   document.addEventListener('shopify:product:select',async e=>{
    const container=this.closest('.shopify-section');if(container&&!container.contains(e.target))return;
    const generation=++this.generation;this.pending=true;this.update();
    try{const result=await e.promise;if(generation!==this.generation||!this.isConnected)return;const resource=result?.detail?.resource;this.variant=resource?.id?String(resource.id).split('/').at(-1):'';this.available=resource?.available===true;}catch{this.variant='';}finally{if(generation===this.generation){this.pending=false;this.update();}}
   },{signal});
   this.link.addEventListener('click',e=>{this.update();if(this.link.getAttribute('aria-disabled')==='true')e.preventDefault();},{signal});
  }
  disconnectedCallback(){this.controller?.abort();}
  update(){
   const connected=counts.has(this.variant),ready=connected&&this.available&&!this.pending;
   this.link.setAttribute('aria-disabled',String(!ready));if(ready)this.link.href=productUploadUrl(this.variant,location.origin,location.search);else this.link.removeAttribute('href');
   this.message.textContent=this.pending?'Updating your pack…':!connected?'This product needs an upload configuration before it can be ordered.':!this.available?'This pack is currently unavailable.':`${counts.get(this.variant)} magnets · Upload, crop and review your photos.`;
  }
 });
}
