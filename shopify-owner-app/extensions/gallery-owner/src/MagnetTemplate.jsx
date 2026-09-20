/** @jsxRuntime classic */
/** @jsx h */
import {h} from 'preact';
import {useState} from 'preact/hooks';
import {normalizeTemplate,templateSides} from '../../../../supabase/functions/gallery-api/magnet-template.mjs';
export function MagnetTemplate({initial,call,route,run,busy}){
 const [draft,setDraft]=useState(()=>normalizeTemplate(initial)),[message,setMessage]=useState('');
 const change=(key,value)=>{setDraft(t=>({...t,[key]:value}));setMessage('Unsaved changes');};
 const sideChange=(side,key,value)=>{setDraft(t=>({...t,sides:{...t.sides,[side]:{...t.sides[side],[key]:value}}}));setMessage('Unsaved changes');};
 return <s-section heading="Magnet wrap template">
  <s-paragraph>Keep the photo on the 2.5-inch front. These four text lines fold onto the back edges. Start with your approximate 3.25-inch cut size, then calibrate with a printed and pressed sample.</s-paragraph>
  <s-select label="Template printing" value={String(draft.enabled)} onChange={e=>change('enabled',e.currentTarget.value==='true')}><s-option value="false">Off — photo only</s-option><s-option value="true">On — photo with customized wrap</s-option></s-select>
  {[['company','Company name'],['couple','Couple names'],['date','Event date text'],['background','Wrap color (hex)'],['color','Text color (hex)']].map(([key,label])=><s-text-field key={key} label={label} value={draft[key]} onChange={e=>change(key,e.currentTarget.value)} />)}
  {[['cutInches','Cut size in inches (3–3.75)'],['fontSize','Text size in points (5–12)'],['edgeInset','Text distance from cut edge in inches (0.06–0.25)']].map(([key,label])=><s-text-field key={key} label={label} value={String(draft[key])} onChange={e=>change(key,Number(e.currentTarget.value))} />)}
  {templateSides.map(side=><s-box key={side} padding="base" border="base">
   <s-select label={side[0].toUpperCase()+side.slice(1)+' text'} value={draft.sides[side].source} onChange={e=>sideChange(side,'source',e.currentTarget.value)}>
    {[['blank','Blank'],['company','Company name'],['couple','Couple names'],['date','Event date text'],['event','Gallery event name'],['photo','Photo reference'],['custom','Custom text']].map(([value,label])=><s-option key={value} value={value}>{label}</s-option>)}
   </s-select>
   {draft.sides[side].source==='custom'&&<s-text-field label="Custom text" value={draft.sides[side].text} onChange={e=>sideChange(side,'text',e.currentTarget.value)} />}
   <s-text-field label="Position adjustment in inches (−0.04 to 0.04)" value={String(draft.sides[side].offset)} onChange={e=>sideChange(side,'offset',Number(e.currentTarget.value))} />
   <s-select label="Text orientation" value={String(draft.sides[side].rotate)} onChange={e=>sideChange(side,'rotate',Number(e.currentTarget.value))}><s-option value="0">Standard</s-option><s-option value="180">Rotate 180°</s-option></s-select>
  </s-box>)}
  <s-paragraph>A 3.25-inch design prints one magnet per 4 × 6 sheet. Preview and override individual lines in the print desk. Fold guides appear in the preview only.</s-paragraph>
  <s-button disabled={busy} onClick={()=>run(async()=>{const template=normalizeTemplate(draft);await call(route,{action:'template',template});setDraft(template);setMessage('Template saved for this event. Reopen a pending photo in the print desk to load it.');})}>Save event template</s-button>
  {message&&<s-paragraph>{message}</s-paragraph>}
 </s-section>;
}
