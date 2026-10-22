import { createHash } from "node:crypto";
import db from "./db.server";
import { leadStatuses } from "./leads";
import { leadForToken } from "./lead-access.server";

const digest = (value: string) => createHash("sha256").update(value).digest("hex");
const text = (form: FormData, key: string, max: number) => String(form.get(key) || "").trim().slice(0, max);

export async function saveLead(shop: string, form: FormData) {
  if (form.get("companyWebsite")) throw Error("Could not save inquiry.");
  const token = text(form, "leadToken", 200);
  const browserToken=/^[a-f0-9-]{36}$/.test(token);
  const authorized=await leadForToken(shop,token);
  if (!browserToken && !authorized) throw Error("This inquiry link has expired. Please start again or contact Atelier Elunora.");
  if (form.get("followUpConsent") !== "yes") throw Error("Please allow us to follow up about your inquiry.");
  const customerName = text(form, "name", 200), customerEmail = text(form, "email", 254).toLowerCase();
  if (!customerName || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customerEmail)) throw Error("Enter your name and a valid email.");
  if (customerEmail !== text(form, "confirmEmail", 254).toLowerCase()) throw Error("Your email addresses must match.");
  if(!browserToken && authorized?.customerEmail!==customerEmail) throw Error("Please start a new inquiry to use a different email address. This private link belongs to your saved email.");
  const weddingDate = text(form, "date", 10), rawGuests = text(form, "guests", 10);
  const parsedDate = new Date(weddingDate + "T12:00:00Z");
  if (weddingDate && (!/^\d{4}-\d{2}-\d{2}$/.test(weddingDate) || !Number.isFinite(parsedDate.getTime()) || parsedDate.toISOString().slice(0,10) !== weddingDate)) throw Error("Enter a valid wedding date.");
  const guests = rawGuests ? Number(rawGuests) : null;
  if (guests !== null && (!Number.isInteger(guests) || guests < 1 || guests > 5000)) throw Error("Enter a guest count between 1 and 5,000.");
  const tokenHash = authorized?.tokenHash || digest(token);
  const existing = await db.bookingLead.findUnique({ where: { tokenHash } });
  if (existing && existing.shop !== shop) throw Error("Please refresh and try again.");
  if (existing?.bookingId) return;
  // A browser retry may update event details, but cannot reopen a closed inquiry.
  const data = { customerName, customerEmail, weddingDate, guests, venue: text(form,"venue",500), packageId:text(form,"package",200) };
  await db.bookingLead.upsert({where:{tokenHash}, create:{shop,tokenHash,...data,consentAt:new Date(),followUpAt:new Date(Date.now()+86400000)},update:data});
  // Domain-separated identifier: never expose the inquiry access token or contact fields.
  return { conversionId: digest("elunora:inquiry-conversion:" + shop + ":" + token) };
}

export async function linkLead(shop: string, token: string, booking: { id:string; customerEmail:string }) {
  if (!token) return;
  const lead=await leadForToken(shop,token);
  if(!lead)return;
  await db.bookingLead.updateMany({where:{id:lead.id,shop,customerEmail:booking.customerEmail.toLowerCase().trim(),bookingId:null},data:{bookingId:booking.id}});
}

export async function listLeads(shop: string) {
  const leads = await db.bookingLead.findMany({where:{shop},orderBy:{createdAt:"desc"},take:500});
  const bookings = await db.weddingBooking.findMany({where:{shop,id:{in:leads.flatMap(l=>l.bookingId?[l.bookingId]:[])}},select:{id:true,status:true}});
  const states = new Map(bookings.map(b=>[b.id,b.status]));
  return leads.map(({tokenHash: _private, ...lead})=>{
    const booked = !!lead.bookingId && states.get(lead.bookingId)==="confirmed";
    return {...lead,booked,followUpDue:!booked && lead.status!=="declined" && !!lead.followUpAt && lead.followUpAt <= new Date()};
  });
}

export async function updateLead(shop:string, form:FormData) {
  const id=text(form,"id",100), status=text(form,"status",30);
  if (!(leadStatuses as readonly string[]).includes(status)) throw Error("Choose a valid lead status.");
  const raw=text(form,"followUpAt",10);
  const followUpAt=raw?new Date(raw+"T12:00:00Z"):null;
  if (followUpAt && (!/^\d{4}-\d{2}-\d{2}$/.test(raw) || !Number.isFinite(followUpAt.getTime()) || followUpAt.toISOString().slice(0,10)!==raw)) throw Error("Choose a valid follow-up date.");
  const result=await db.bookingLead.updateMany({where:{id,shop},data:{status,notes:text(form,"notes",4000),followUpAt:status==="declined"?null:followUpAt,...(status==="contacted"?{contactedAt:new Date()}:{})}});
  if (!result.count) throw Error("Inquiry not found.");
}
