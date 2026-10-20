import type {LoaderFunctionArgs} from "react-router";
import {timingSafeEqual} from "node:crypto";
import db from "../db.server";
import {hash} from "../booking.server";
import {calendar} from "../booking-rules";
export async function loader({request,params}:LoaderFunctionArgs){
  const raw=new URL(request.url).searchParams.get("token") || "";
  if(!/^[a-f0-9]{64}$/.test(raw))throw new Response("Calendar unavailable",{status:404});
  const settings=await db.bookingSettings.findUnique({where:{shop:params.shop || ""}});
  const feed=settings && JSON.parse(settings.configJson).calendarFeed;
  if(!feed || !/^[a-f0-9]{64}$/.test(feed.hash) || !Number.isFinite(Date.parse(feed.expiresAt)) || Date.parse(feed.expiresAt)<Date.now() || !timingSafeEqual(Buffer.from(feed.hash,"hex"),Buffer.from(hash(raw),"hex")))throw new Response("Calendar unavailable",{status:404});
  const from=new Date(Date.now()-90*86400000).toISOString().slice(0,10),to=new Date(Date.now()+730*86400000).toISOString().slice(0,10);
  const bookings=await db.weddingBooking.findMany({where:{shop:settings!.shop,status:{in:["confirmed","cancelled"]},weddingDate:{gte:from,lte:to}},orderBy:{weddingDate:"asc"}});
  const events=bookings.map(b=>"BEGIN:VEVENT\r\n"+calendar(b,b.updatedAt).split("BEGIN:VEVENT\r\n")[1].split("END:VCALENDAR")[0]).join("");
  return new Response("BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//Atelier Elunora//Bookings//EN\r\nX-WR-CALNAME:Atelier Elunora Weddings\r\n"+events+"END:VCALENDAR\r\n",{headers:{"Content-Type":"text/calendar; charset=utf-8","Cache-Control":"no-store","Referrer-Policy":"no-referrer","X-Robots-Tag":"noindex"}});
}
