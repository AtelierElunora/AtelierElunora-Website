import type {LoaderFunctionArgs} from "react-router";
import {authenticate} from "../shopify.server";
import {portalBooking} from "../booking.server";
import {calendar} from "../booking-rules";
import db from "../db.server";
export async function loader({request,params}:LoaderFunctionArgs){
  const token=new URL(request.url).searchParams.get("token");
  let booking;
  if(token) booking=await portalBooking(params.id!,token);
  else {
    const {session}=await authenticate.admin(request);
    booking=await db.weddingBooking.findFirst({where:{id:params.id,shop:session.shop}});
    if(!booking)throw new Response("Booking not found",{status:404});
  }
  return new Response(calendar(booking),{headers:{"Content-Type":"text/calendar; charset=utf-8","Content-Disposition":'attachment; filename="elunora-wedding.ics"',"Cache-Control":"no-store","Referrer-Policy":"no-referrer"}});
}
