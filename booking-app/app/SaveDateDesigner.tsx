import {createBorderEditor,borderImage} from "./border-editor.mjs";
import {drawBorder,type PhotoBorder} from "./magnet-borders.mjs";
import {LetteringColorControls} from "./LetteringColorControls";
import {letteringHex,lightLettering,type LetteringInk} from "./lettering-color";
import { useEffect, useId, useRef, useState } from "react";
import { DESIGN_SIZE, PHOTO_LIMIT, suggestedDate, validateSaveDateDesign, type SaveDateDesign, type SaveDateTypography } from "./save-date-design";
import {SAVE_DATE_FONTS,fontFor,fontSupports,pointUnits,LETTERING_WIDTH,LETTERING_HEIGHT,type SaveDateFont} from "./save-date-fonts";

export type SaveDatePreview = {src:string;date:string};
export type PreparedSaveDate = { design: SaveDateDesign; original: File; print: Blob };
const blobFor = (canvas: HTMLCanvasElement) => new Promise<Blob>((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(Error("Could not prepare your design.")), "image/png"));
function drawLettering(ctx:CanvasRenderingContext2D,text:string,font:SaveDateFont,points:number,centerY:number){
  const family=fontFor(font).family,requested=pointUnits(points);
  ctx.textAlign="left";ctx.textBaseline="alphabetic";ctx.fontKerning="normal";ctx.font=`${requested}px "${family}"`;
  let m=ctx.measureText(text);
  const fit=Math.min(1,LETTERING_WIDTH/Math.max(1,m.actualBoundingBoxLeft+m.actualBoundingBoxRight),LETTERING_HEIGHT/Math.max(1,m.actualBoundingBoxAscent+m.actualBoundingBoxDescent));
  ctx.font=`${requested*fit}px "${family}"`;m=ctx.measureText(text);
  ctx.fillText(text,500+(m.actualBoundingBoxLeft-m.actualBoundingBoxRight)/2,centerY+(m.actualBoundingBoxAscent-m.actualBoundingBoxDescent)/2);
}
function LetteringControls({name,font,size,onFont,onSize}:{name:string;font:SaveDateFont;size:number;onFont:(v:SaveDateFont)=>void;onSize:(v:number)=>void}){
 const id=useId();
 return <fieldset className="save-date-lettering"><legend>{name} style</legend><div className="save-date-font-options">{SAVE_DATE_FONTS.map(f=><label key={f.id}><input type="radio" aria-label={f.label} name={id+"-font"} checked={font===f.id} onChange={()=>onFont(f.id)}/><span><span className="save-date-font-sample" aria-hidden="true" style={{fontFamily:`"${f.family}"`}}>Our day</span><small>{f.label}</small></span></label>)}</div><label className="save-date-size" htmlFor={id+"-size"}><span>{name} size</span><output htmlFor={id+"-size"}>{size} pt</output></label><input id={id+"-size"} aria-label={name+" size"} type="range" min="8" max="24" step="0.5" value={size} onChange={e=>onSize(Number(e.target.value))}/></fieldset>;
}

export function SaveDateDesigner({ initialDate = "", initialDesign, onChange, onPrepared, onPreview, customColors = true }: { customColors?:boolean; initialDate?: string; initialDesign?: SaveDateDesign | null; onChange: (design: SaveDateDesign | null) => void; onPrepared?: (value: PreparedSaveDate | null) => void; onPreview?: (value: SaveDatePreview | null) => void }) {
  const id = useId(), canvas = useRef<HTMLCanvasElement>(null), image = useRef<HTMLImageElement | null>(null), file = useRef<File | null>(null), generation = useRef(0);
  const callback = useRef(onChange), prepared = useRef(onPrepared), preview = useRef(onPreview);
  const normalizedPhoto = useRef<string | undefined>(undefined);
  callback.current = onChange; prepared.current = onPrepared; preview.current = onPreview;
  const restored = useRef(initialDesign);
  const [photo, setPhoto] = useState(0), [topEnabled, setTopEnabled] = useState(initialDesign?.topEnabled ?? true), [topText, setTopText] = useState(initialDesign?.topText ?? "Save the date"), [bottomText, setBottomText] = useState(initialDesign?.bottomText ?? suggestedDate(initialDate));
  const [ink, setInk] = useState<LetteringInk>(initialDesign?.ink ?? "white"), [zoom, setZoom] = useState(1), [x, setX] = useState(50), [y, setY] = useState(50), [error, setError] = useState(""), [busy, setBusy] = useState(false);
  const [typography,setTypography]=useState<SaveDateTypography>(initialDesign?.typography??{topFont:"script",bottomFont:"modern",topSize:20,bottomSize:12});
  const [border,setBorder]=useState<PhotoBorder|null>(initialDesign?.border??null);
  const borderHost=useRef<HTMLDivElement>(null);
  useEffect(()=>{if(!borderHost.current)return;const editor=createBorderEditor({value:initialDesign?.border??null,onChange:setBorder,optIn:true});borderHost.current.replaceChildren(editor.element);return()=>borderHost.current?.replaceChildren();},[]);
  const touchedDate = useRef(!!initialDesign);
  useEffect(() => { if (!touchedDate.current) setBottomText(suggestedDate(initialDate)); }, [initialDate]);
  useEffect(() => () => { generation.current++; }, []);

  async function choose(next?: File, normalized?: string) {
    const current = ++generation.current;
    image.current = null; file.current = null; normalizedPhoto.current = normalized; setPhoto(n => n + 1); setError(""); setBusy(false); callback.current(null); prepared.current?.(null);
    if (!next) return;
    if (!["image/jpeg", "image/png", "image/webp"].includes(next.type) || next.size > 10 * 1024 * 1024 || next.size < 1) { setError("Choose a JPG, PNG or WebP photograph up to 10 MB."); return; }
    setBusy(true);
    const url = URL.createObjectURL(next);
    try {
      const img = new Image();
      await new Promise<void>((resolve, reject) => { img.onload = () => resolve(); img.onerror = () => reject(Error("This photograph could not be opened. Try a JPG or PNG.")); img.src = url; });
      if (current !== generation.current) return;
      if (img.naturalWidth * img.naturalHeight > 60_000_000 || Math.min(img.naturalWidth, img.naturalHeight) < 300) throw Error("Choose a clear photograph at least 300 pixels on each side (750 or more recommended).");
      image.current = img; file.current = next; setZoom(1); setX(50); setY(50); setPhoto(n => n + 1);
    } catch (e) { if (current === generation.current) setError(e instanceof Error ? e.message : "Choose another photograph."); }
    finally { URL.revokeObjectURL(url); if (current === generation.current) setBusy(false); }
  }

  // Returning from the booking review restores the already cropped photograph
  // and wording instead of asking the customer to upload it again.
  useEffect(() => {
    if (!restored.current) return;
    const bytes = Uint8Array.from(atob(restored.current.photoDataUrl.slice(23)), c => c.charCodeAt(0));
    void choose(new File([bytes], "save-the-date-photograph.jpg", { type: "image/jpeg" }), restored.current.photoDataUrl);
  }, []);

  useEffect(() => {
    const target = canvas.current, img = image.current;
    callback.current(null); prepared.current?.(null);
    if (!target) return;
    const ctx = target.getContext("2d"); if (!ctx) return;
    ctx.clearRect(0, 0, DESIGN_SIZE, DESIGN_SIZE);
    if (!img) { preview.current?.(null); return; }
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      try {
        setBusy(true); setError("");
        const square = document.createElement("canvas"); square.width = square.height = DESIGN_SIZE;
        const c = square.getContext("2d")!;
        const scale = Math.max(DESIGN_SIZE / img.naturalWidth, DESIGN_SIZE / img.naturalHeight) * zoom;
        const width = img.naturalWidth * scale, height = img.naturalHeight * scale;
        c.fillStyle = "#fff"; c.fillRect(0, 0, DESIGN_SIZE, DESIGN_SIZE); c.drawImage(img, (DESIGN_SIZE - width) * x / 100, (DESIGN_SIZE - height) * y / 100, width, height);
        let photoDataUrl = zoom === 1 && x === 50 && y === 50 ? normalizedPhoto.current || "" : "";
        if (!photoDataUrl) for (const quality of [.9, .82, .72, .6]) { photoDataUrl = square.toDataURL("image/jpeg", quality); if ((photoDataUrl.length - 23) * .75 <= PHOTO_LIMIT) break; }
        if ((photoDataUrl.length - 23) * .75 > PHOTO_LIMIT) throw Error("This image is too detailed to prepare. Please try a smaller photograph.");
        // Render from the exact compressed photo saved with the booking.
        const saved = new Image(); await new Promise<void>((resolve, reject) => { saved.onload = () => resolve(); saved.onerror = () => reject(Error("Could not prepare your photograph.")); saved.src = photoDataUrl; });
        if (cancelled) return;
        ctx.drawImage(saved, 0, 0, DESIGN_SIZE, DESIGN_SIZE);
        const art=await borderImage(border);if(cancelled){art?.close();return;}try{drawBorder(ctx,border,DESIGN_SIZE,art);}finally{art?.close();}
        // Preview each available line while the customer is still completing
        // the other one. A finished design is required only for checkout.
        const top = topText.normalize("NFC").trim(), bottom = bottomText.normalize("NFC").trim();
        const lines: {text:string;font:SaveDateFont;size:number;y:number}[] = [];
        if (topEnabled && top) lines.push({text:top,font:typography.topFont,size:typography.topSize,y:110});
        if (bottom) lines.push({text:bottom,font:typography.bottomFont,size:typography.bottomSize,y:890});
        await Promise.all(lines.map(async line=>{
          if (!fontSupports(line.text,line.font)) throw Error("Your chosen font does not support some characters. Try the other font or use standard letters, numbers and punctuation.");
          const faces=await document.fonts.load(`100px "${fontFor(line.font).family}"`,line.text);
          if(!faces.length)throw Error("Your lettering font could not load. Please refresh and try again.");
        }));
        if(cancelled)return;
        ctx.fillStyle = letteringHex(ink);
        ctx.shadowColor = lightLettering(ink) ? "rgba(0,0,0,.8)" : "rgba(255,255,255,.8)"; ctx.shadowBlur = 8; ctx.shadowOffsetY = 2;
        for (const line of lines) drawLettering(ctx,line.text,line.font,line.size,line.y);
        const sample=document.createElement("canvas");sample.width=sample.height=440;sample.getContext("2d")!.drawImage(target,0,0,440,440);
        preview.current?.({src:sample.toDataURL("image/jpeg",.85),date:bottom});
        if (!bottom || (topEnabled && !top)) return;
        const design = validateSaveDateDesign({ version: 1, topEnabled, topText: top, bottomText: bottom, ink, photoDataUrl, typography,...(border?{border}:{}) });
        const print = await blobFor(target);
        if (cancelled) return;
        setError(""); callback.current(design); prepared.current?.({ design, original: file.current!, print });
      } catch (e) { if (!cancelled) {preview.current?.(null);setError(e instanceof Error ? e.message : "Please try another photograph.");} }
      finally { if (!cancelled) setBusy(false); }
    }, 180);
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [photo, topEnabled, topText, bottomText, ink, zoom, x, y, typography,border]);

  return <section className="save-date-designer" aria-label="Personalize your save-the-date magnets">
    <div className="save-date-preview"><canvas ref={canvas} width={DESIGN_SIZE} height={DESIGN_SIZE} aria-label={image.current ? "Your save-the-date design preview" : "Empty preview. Upload your photograph to begin."} role="img"/></div>
    <div className="save-date-controls">
      <label htmlFor={id + "-photo"}>Your photograph</label><input id={id + "-photo"} type="file" accept="image/jpeg,image/png,image/webp" onChange={e => void choose(e.target.files?.[0])}/>
      <p className="save-date-help">One photo, repeated across your set. JPG, PNG or WebP · up to 10 MB.</p>
      <label className="save-date-switch"><input type="checkbox" checked={topEnabled} onChange={e => setTopEnabled(e.target.checked)}/><span>Show “Save the date” at the top</span></label>
      {topEnabled && <><label htmlFor={id + "-top"}>Top wording</label><input id={id + "-top"} type="text" value={topText} maxLength={60} onChange={e => setTopText(e.target.value)}/><LetteringControls name="Top wording" font={typography.topFont} size={typography.topSize} onFont={topFont=>setTypography({...typography,topFont})} onSize={topSize=>setTypography({...typography,topSize})}/></>}
      <label htmlFor={id + "-date"}>Date at the bottom</label><input id={id + "-date"} type="text" value={bottomText} maxLength={60} placeholder="For example, July 24, 2027" onChange={e => { touchedDate.current = true; setBottomText(e.target.value); }}/>
      <LetteringControls name="Date" font={typography.bottomFont} size={typography.bottomSize} onFont={bottomFont=>setTypography({...typography,bottomFont})} onSize={bottomSize=>setTypography({...typography,bottomSize})}/>
      <p className="save-date-help">Choose an Atelier font for each line. Longer wording automatically fits inside the magnet.</p>
      {customColors ? <LetteringColorControls label="Magnet lettering color" value={ink} onChange={setInk}/> : <fieldset className="save-date-ink"><legend>Lettering</legend><label><input type="radio" name={id+"-ink"} checked={ink==="white"} onChange={()=>setInk("white")}/>Cream</label><label><input type="radio" name={id+"-ink"} checked={ink==="olive"} onChange={()=>setInk("olive")}/>Olive</label></fieldset>}
      <div ref={borderHost}/>
      {image.current && <details className="save-date-crop"><summary>Adjust photo crop</summary><label>Zoom<input type="range" min="1" max="3" step="0.01" value={zoom} onChange={e => setZoom(Number(e.target.value))}/></label><label>Move photo left or right<input type="range" min="0" max="100" value={x} onChange={e => setX(Number(e.target.value))}/></label><label>Move photo up or down<input type="range" min="0" max="100" value={y} onChange={e => setY(Number(e.target.value))}/></label></details>}
      <p className="save-date-help">Your date stays visible when the top line is switched off. We’ll send a digital proof for approval before printing.</p>
      <p className="save-date-status" role={error ? "alert" : "status"}>{error || (busy ? "Preparing your preview…" : image.current ? !bottomText.trim() ? "Add your date to finish your design." : topEnabled && !topText.trim() ? "Add top wording or switch off the top line." : "Preview ready. Check the wording, date and crop." : "Choose a photo to see your design.")}</p>
    </div>
  </section>;
}
