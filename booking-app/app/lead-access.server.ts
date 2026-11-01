import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import db from "./db.server";

type LeadIdentity = { id:string; shop:string; customerEmail:string; consentAt:Date };
type Purpose = "resume" | "stop";
function signature(lead:LeadIdentity, purpose:Purpose, expires:string) {
  const secret=process.env.SHOPIFY_API_SECRET;
  if(!secret) throw Error("Inquiry link signing is not configured.");
  return createHmac("sha256",secret).update(JSON.stringify(["elunora-inquiry-v1",purpose,lead.shop,lead.id,lead.customerEmail.toLowerCase(),lead.consentAt.toISOString(),expires])).digest("base64url");
}
export function inquiryToken(lead:LeadIdentity,purpose:Purpose,now=Date.now()) {
  const expires=String(Math.floor(now/1000)+14*86400);
  return `${lead.id}.${expires}.${signature(lead,purpose,expires)}`;
}
export function validInquiryToken(lead:LeadIdentity,raw:string,purpose:Purpose,now=Date.now()) {
  const [id,expires,mac,...extra]=raw.split(".");
  if(extra.length || id!==lead.id || !/^\d{10}$/.test(expires||"") || !/^[A-Za-z0-9_-]{43}$/.test(mac||"") || Number(expires)*1000<=now || Number(expires)*1000>now+15*86400000) return false;
  return timingSafeEqual(Buffer.from(mac),Buffer.from(signature(lead,purpose,expires)));
}
export async function leadForToken(shop:string,raw:string) {
  if(/^[a-f0-9-]{36}$/.test(raw)) {
    const lead=await db.bookingLead.findUnique({where:{tokenHash:createHash("sha256").update(raw).digest("hex")}});
    return lead?.shop===shop?lead:null;
  }
  const id=raw.split(".")[0];
  if(!/^[a-zA-Z0-9_-]{1,100}$/.test(id||"")) return null;
  const lead=await db.bookingLead.findFirst({where:{id,shop}});
  return lead && validInquiryToken(lead,raw,"resume")?lead:null;
}
