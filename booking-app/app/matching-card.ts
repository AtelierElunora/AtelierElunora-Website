import {customLetteringColor} from "./lettering-color";

export function matchingCardColor(value:unknown):string|undefined {
  return value===undefined ? undefined : customLetteringColor(value);
}

export const MATCHING_CARD_WORDING_LIMIT = 1000;

export function matchingCardWording(value: unknown): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "string" || value.length > MATCHING_CARD_WORDING_LIMIT || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value)) {
    throw Error("Enter your matching card wording using up to 1,000 characters.");
  }
  const wording = value.normalize("NFC").replace(/\r\n?/g, "\n").trim();
  if (wording.length > MATCHING_CARD_WORDING_LIMIT) throw Error("Enter your matching card wording using up to 1,000 characters.");
  return wording || undefined;
}

export function matchingCardAttributes(value: unknown, color?:unknown): {key:string;value:string}[] {
  const wording = matchingCardWording(value);
  const ink=matchingCardColor(color);
  return [...(wording ? [{key:"Matching card wording",value:wording}] : []),...(ink ? [{key:"Matching card lettering color",value:ink.toUpperCase()}] : [])];
}
