import type {PhotoBorder} from "./magnet-borders.mjs";
export function borderImage(border:PhotoBorder|null):Promise<ImageBitmap|null>;
export function createBorderEditor(options?:{value?:PhotoBorder|null;onChange?:(value:PhotoBorder|null)=>void;optIn?:boolean;optInLabel?:string}):{element:HTMLFieldSetElement;set:(value:PhotoBorder|null)=>void;disable:(value:boolean)=>void;value:PhotoBorder|null};
