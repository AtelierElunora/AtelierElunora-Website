import {SIGNATURE_STYLES,type SignatureStyle} from "./booking-contract";

// Render the saved name in the same local font stack as the on-screen receipt.
// These pixels never leave the browser except as part of the customer's own PDF.
export function signatureImage(person:{name:string;style?:SignatureStyle}|null|undefined):string|undefined{
  if(!person)return undefined;
  const canvas=document.createElement("canvas"),ctx=canvas.getContext("2d");
  if(!ctx)return undefined;
  const font=(SIGNATURE_STYLES.find(s=>s.id===(person.style||"classic"))||SIGNATURE_STYLES[0]).font;
  ctx.font=font;
  const width=Math.max(600,Math.ceil(ctx.measureText(person.name).width)+40);
  canvas.width=width*2;canvas.height=160;
  ctx.scale(2,2);ctx.font=font;ctx.fillStyle="#454734";
  ctx.fillText(person.name,16,52);
  return canvas.toDataURL("image/png");
}
