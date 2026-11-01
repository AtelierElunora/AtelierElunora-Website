export type PhotoBorder={theme:"none"|"fineLine"|"christmas"|"winter"|"celebration"|"botanical"|"custom";color:string;width:number;artwork?:string};
export function normalizeBorder(value:unknown):PhotoBorder|null;
export function drawBorder(ctx:CanvasRenderingContext2D,value:PhotoBorder|null,side:number,artwork?:CanvasImageSource|null):void;
export function borderSvg(value:PhotoBorder|null,side?:number):string;
