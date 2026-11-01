export type LetteringInk = "white" | "olive" | `#${string}`;
export const LETTERING_COLORS = [
  {name:"Cream",hex:"#fffdf8"}, {name:"Olive",hex:"#4a4b36"},
  {name:"Black",hex:"#20201d"}, {name:"Blush",hex:"#b97878"}, {name:"Navy",hex:"#28394d"},
] as const;
export function customLetteringColor(value:unknown): string {
  if(typeof value!=="string" || !/^#[0-9a-f]{6}$/i.test(value))throw Error("Choose a valid lettering color.");
  return value.toLowerCase();
}
export function letteringHex(ink:unknown):string {
  return ink==="white" ? "#fffdf8" : ink==="olive" ? "#4a4b36" : customLetteringColor(ink);
}
export function letteringLabel(ink:unknown):string {
  const hex=letteringHex(ink);
  return LETTERING_COLORS.find(c=>c.hex===hex)?.name || hex.toUpperCase();
}
export function lightLettering(ink:unknown):boolean {
  const hex=letteringHex(ink);
  const rgb=[1,3,5].map(n=>parseInt(hex.slice(n,n+2),16));
  return rgb[0]*.299+rgb[1]*.587+rgb[2]*.114>=160;
}
