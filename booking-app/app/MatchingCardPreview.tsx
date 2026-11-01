import { createElement } from "react";

export function MatchingCardPreview({wording="",names="",date="",magnetSrc="",color="#4a4b36",view="card"}:{wording?:string;names?:string;date?:string;magnetSrc?:string;color?:string;view?:"card"|"set"}) {
  return createElement("atelier-card-preview", {"card-wording":wording,"couple-names":names,"event-date":date,"magnet-src":magnetSrc,"lettering-color":color,view});
}
