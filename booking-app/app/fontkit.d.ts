declare module "fontkit" {
  type Box={minX:number;maxX:number;minY:number;maxY:number};
  type Glyph={path:{toSVG():string}};
  type Position={xAdvance:number;yAdvance:number;xOffset:number;yOffset:number};
  type Font={unitsPerEm:number;layout(text:string):{glyphs:Glyph[];positions:Position[];bbox:Box}};
  export function openSync(filename:string):Font;
}
