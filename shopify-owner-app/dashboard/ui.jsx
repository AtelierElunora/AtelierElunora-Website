import {h,options} from 'preact';
import {forwardRef} from 'preact/compat';
const native=(tag,props={},children)=>h(tag,props,children);
function Field({label,children,type='text',...props}){return <label class="field"><span>{label}</span>{children||<input type={type} {...props}/>}</label>;}
function Check({label,...props}){return <label class="check"><input type="checkbox" {...props}/><span>{label}</span></label>;}
const map={
 's-section':({heading,children})=><section class={'panel '+(heading==='Guest photo sharing'?'guest-sharing-panel':heading==='Magnet wrap template'?'template-panel':'')}>{heading&&<h2>{heading}</h2>}{children}</section>,
 's-stack':({direction,children})=><div class={direction==='inline'?'row':'stack'}>{children}</div>,
 's-box':({children,maxInlineSize})=><div class="inset" style={maxInlineSize?{maxWidth:maxInlineSize}:undefined}>{children}</div>,
 's-button':({variant,tone,children,...p})=><button type="button" class={(variant==='primary'?'primary ':'')+(tone==='critical'?'danger':'')} {...p}>{children}</button>,
 's-paragraph':({children})=><p>{children}</p>, 's-text':({children})=><span>{children}</span>, 's-heading':({children})=><h3>{children}</h3>,
 's-banner':({children})=><div class="notice" role="status">{children}</div>,
 's-text-field':p=><Field {...p}/>, 's-email-field':p=><Field type="email" {...p}/>, 's-date-field':p=><Field type="date" {...p}/>, 's-number-field':p=><Field type="number" {...p}/>, 's-search-field':p=><Field type="search" {...p}/>,
 's-select':({label,children,...props})=><Field label={label}><select {...props}>{children}</select></Field>,
 's-option':p=>native('option',p,p.children),
 's-text-area':({label,...p})=><Field label={label}><textarea {...p}/></Field>,
 's-checkbox':Check,'s-switch':Check,
 's-image':({aspectRatio,objectFit,...props})=><img class="owner-image" style={{aspectRatio:aspectRatio||'auto',objectFit:objectFit||'contain'}} {...props}/>,
 's-link':({children,...p})=><a {...p} download={p.href?.startsWith('data:image/svg+xml')?'Atelier-event-QR.svg':undefined} rel="noopener noreferrer">{children}</a>,
 's-drop-zone':forwardRef(({label,onDropRejected,...p},ref)=><Field label={label}><input ref={ref} type="file" {...p}/></Field>),
 's-table':({children})=><div class="table-scroll"><table>{children}</table></div>,
 's-table-header-row':({children})=><thead><tr>{children}</tr></thead>,
 's-table-header':({children})=><th scope="col">{children}</th>,
 's-table-body':({children})=><tbody>{children}</tbody>, 's-table-row':({children})=><tr>{children}</tr>, 's-table-cell':({children})=><td>{children}</td>
};
// Reuse the tested workflow components while rendering native, accessible web controls.
export function installNativeControls(){const prior=options.vnode;options.vnode=vnode=>{if(typeof vnode.type==='string'&&map[vnode.type])vnode.type=map[vnode.type];prior?.(vnode);};}
export function Icon({name}){const paths={overview:'M3 3h7v7H3z M14 3h7v7h-7z M3 14h7v7H3z M14 14h7v7h-7z',events:'M4 5h16v16H4z M8 2v6 M16 2v6 M4 11h16',orders:'M5 6h14v15H5z M9 6V3h6v3 M8 11h8 M8 15h5',printing:'M6 8V3h12v5 M6 17H3V9h18v8h-3 M6 14h12v7H6z',activity:'M3 12h4l3-8 4 16 3-8h4',storage:'M4 5h16v5H4z M4 14h16v5H4z M7 7h1 M7 16h1',settings:'M12 8a4 4 0 1 0 0 8a4 4 0 0 0 0-8 M12 2v3 M12 19v3 M2 12h3 M19 12h3 M5 5l2 2 M17 17l2 2 M5 19l2-2 M17 7l2-2',trash:'M3 6h18 M5 6l1 15h12l1-15 M9 6V3h6v3 M10 10v7 M14 10v7'};return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d={paths[name]||paths.events}/></svg>;}
export const Empty=({title,children})=><div class="empty"><Icon name="events"/><h3>{title}</h3><p>{children}</p></div>;
