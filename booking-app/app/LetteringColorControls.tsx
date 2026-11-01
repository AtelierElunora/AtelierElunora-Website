import {useId} from "react";
import {LETTERING_COLORS,letteringHex} from "./lettering-color";
export function LetteringColorControls({label,value,onChange}:{label:string;value:string;onChange:(value:`#${string}`)=>void}) {
 const id=useId(),hex=letteringHex(value);
 return <fieldset className="lettering-color"><legend>{label}</legend><div className="lettering-color-swatches">{LETTERING_COLORS.map(c=><button key={c.hex} type="button" aria-pressed={hex===c.hex} onClick={()=>onChange(c.hex)}><span className="lettering-color-swatch" style={{backgroundColor:c.hex}} aria-hidden="true"/>{c.name}</button>)}</div><label className="lettering-color-custom" htmlFor={id}><span>Choose any color</span><input id={id} type="color" value={hex} onChange={e=>onChange(e.target.value as `#${string}`)}/><output htmlFor={id}>{hex.toUpperCase()}</output></label><p className="save-date-help">Choose a color that stands out against your photo or card. Your digital proof confirms the printed color.</p></fieldset>;
}
