import db from './db.server';
import {getAzureBookingPool} from './azure-booking.server';
import {details,locked} from './booking.server';
import {randomUUID} from 'node:crypto';
import {liveBookingShop} from './live-store';
let running=false;
export async function syncBookingGalleries(){
 if(running || process.env.BOOKING_GALLERY_ENABLED!=='true' || process.env.ELUNORA_DATABASE_BACKEND!=='azure-postgres')return;
 running=true;
 try {
  const bookings=await db.weddingBooking.findMany({where:{shop:liveBookingShop,status:'confirmed',paidCents:{gt:0}}});
  for(const booking of bookings){
   if(details(booking).source==='csv_import')continue;
   try {
    const result=await getAzureBookingPool().query<{event_id:string|null}>('SELECT booking_gallery.sync_booking($1) AS event_id',[booking.id]);
    const eventId=result.rows[0]?.event_id;if(!eventId)continue;
    await locked(booking.shop,async tx=>{
     const b=await tx.weddingBooking.findFirstOrThrow({where:{id:booking.id,shop:booking.shop}});if(b.status!=='confirmed')return;
     const d=details(b),url='https://api-elunora-production-nvo32m3ban2cc.azurewebsites.net/api/gallery-preview/?event='+eventId;
     if(d.gallery?.eventId!==eventId){d.gallery={eventId,url};await tx.weddingBooking.update({where:{id:b.id},data:{detailsJson:JSON.stringify(d)}});}
     await tx.bookingMail.upsert({where:{id:b.id+':gallery'},create:{id:b.id+':gallery',shop:b.shop,bookingId:b.id,kind:'gallery',sendAt:new Date(),operationId:randomUUID()},update:{}});
    });
   } catch {console.error('Booking gallery synchronization needs review');}
  }
 } finally{running=false;}
}
