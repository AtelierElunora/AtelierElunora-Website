import {normalizeTemplate,templateSides,resolveTemplateText} from '../../../../supabase/functions/gallery-api/magnet-template.mjs';
import {fontData,glyphWidths,pairWidths} from './preview-font.mjs';
const esc=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));
export function templatePreview(input,context={}){
 const t=normalizeTemplate(input),size=975,cut=t.enabled?t.cutInches:t.photoCutInches,scale=size/cut,face=t.enabled?2.5*scale:size,margin=(size-face)/2;
 const text=templateSides.map((side,i)=>{
  const row=t.sides[side],label=resolveTemplateText(t,side,context);if(!t.enabled||!label)return '';
  const font=t.fontSize*scale/72,chars=Array.from(label),width=chars.reduce((sum,c,j)=>sum+(glyphWidths[c]??0.6)+(j?pairWidths[chars[j-1]+c]??0:0),0)*font,maxWidth=face-0.3*scale;
  const squeeze=width>maxWidth?` textLength="${maxWidth}" lengthAdjust="spacingAndGlyphs"`:'';
  return `<g transform="translate(${size/2} ${size/2}) rotate(${i*90}) translate(${row.shift*scale*(i<2?1:-1)} ${-size/2+(t.edgeInset+row.offset)*scale}) rotate(${row.rotate})"><text x="0" y="0" text-anchor="middle" dominant-baseline="central" fill="${t.color}" font-family="Brown Carolina, Arial, sans-serif" font-size="${font}"${squeeze}>${esc(label)}</text></g>`;
 }).join('');
 const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="975" height="975" viewBox="0 0 975 975"><style>@font-face{font-family:'Brown Carolina';src:url(data:font/woff2;base64,${fontData}) format('woff2');font-weight:400;font-style:normal}</style><defs><clipPath id="photo"><rect x="${margin}" y="${margin}" width="${face}" height="${face}"/></clipPath></defs><rect width="975" height="975" fill="${t.enabled?t.background:'#FFFFFF'}"/><g clip-path="url(#photo)"><g transform="translate(${margin} ${margin})"><svg width="${face}" height="${face}" viewBox="0 0 750 750"><rect width="750" height="750" fill="#DDE5DE"/><circle cx="550" cy="165" r="65" fill="#F3EAD4"/><path d="M0 530 225 220 500 570 640 420 750 550V750H0Z" fill="#788E78"/><path d="M0 690 360 390 750 750H0Z" fill="#465944"/><rect x="145" y="580" width="460" height="95" rx="12" fill="#FFFFFF" fill-opacity=".9"/><text x="375" y="640" text-anchor="middle" font-family="Arial,sans-serif" font-size="32" fill="#252B1D">Sample photo area</text></svg></g></g>${text}${t.enabled?`<rect x="${margin}" y="${margin}" width="${face}" height="${face}" fill="none" stroke="#B34C26" stroke-width="2" stroke-dasharray="9 7"/>`:''}</svg>`;
 return {svg,url:'data:image/svg+xml;charset=utf-8,'+encodeURIComponent(svg),cut,enabled:t.enabled};
}
