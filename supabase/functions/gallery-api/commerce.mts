// Only dedicated gallery variants may enter this checkout. No photos or storage URLs leave the gallery.
export const SHOP='v0j63n-ms.myshopify.com';
export const PACKS=[
 {count:6,cents:2500,variant:'gid://shopify/ProductVariant/52368201875744'},
 {count:12,cents:4500,variant:'gid://shopify/ProductVariant/52368201908512'},
 {count:24,cents:8000,variant:'gid://shopify/ProductVariant/52368201941280'},
 {count:48,cents:12500,variant:'gid://shopify/ProductVariant/52368201974048'}
];
export const quoteQuery='query GalleryPack($id:ID!){node(id:$id){... on ProductVariant{id availableForSale price{amount currencyCode}}}}';
export const cartQuery='mutation GalleryCart($input:CartInput!){cartCreate(input:$input){cart{checkoutUrl lines(first:2){nodes{quantity merchandise{... on ProductVariant{id}}}}} userErrors{field message}}}';
export function packFor(items:{quantity:number}[],count:number){
 const pack=PACKS.find(p=>p.count===count);
 if(!pack||!items.length||items.some(i=>!Number.isSafeInteger(i.quantity)||i.quantity<1||i.quantity>12)||items.reduce((n,i)=>n+i.quantity,0)!==count)throw Error('Choose exactly the number of magnets in your pack.');
 return pack;
}
async function storefront(query:string,variables:unknown,fetcher=fetch){
 const response=await fetcher('https://'+SHOP+'/api/2026-07/graphql.json',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({query,variables}),signal:AbortSignal.timeout(12000)});
 if(!response.ok)throw Error('Shopify checkout is temporarily unavailable. Your selection is saved.');
 const result=await response.json();if(result.errors?.length)throw Error('Shopify checkout is temporarily unavailable. Your selection is saved.');return result.data;
}
export async function checkPrice(pack:typeof PACKS[number],expectedCents:number,fetcher=fetch){
 const data=await storefront(quoteQuery,{id:pack.variant},fetcher),variant=data?.node;
 if(!variant?.availableForSale||variant.id!==pack.variant)throw Error('This magnet pack is not available for checkout yet.');
 const cents=Math.round(Number(variant.price.amount)*100);
 if(variant.price.currencyCode!=='USD'||!Number.isSafeInteger(cents)||cents!==expectedCents||cents!==pack.cents)throw Error('The pack price has changed. Please contact Atelier Elunora before ordering.');
}
export function safeCheckoutUrl(value:string){
 const u=new URL(value);
 if(u.protocol!=='https:'||u.username||u.password||![SHOP,'atelierelunora.com','www.atelierelunora.com'].includes(u.hostname))throw Error('Shopify returned an unexpected checkout address.');
 return u.href;
}
export async function createCheckout(pack:typeof PACKS[number],reference:string,fetcher=fetch){
 const data=await storefront(cartQuery,{input:{lines:[{merchandiseId:pack.variant,quantity:1,attributes:[{key:'Gallery selection',value:reference},{key:'Magnet count',value:String(pack.count)}]}]}},fetcher);
 const result=data?.cartCreate,lines=result?.cart?.lines?.nodes;
 if(result?.userErrors?.length||!result?.cart?.checkoutUrl||lines?.length!==1||lines[0].quantity!==1||lines[0].merchandise.id!==pack.variant)throw Error('Could not prepare checkout. Your selection is saved; please retry.');
 return safeCheckoutUrl(result.cart.checkoutUrl);
}
