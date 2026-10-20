import {createCipheriv,createDecipheriv,createHash,randomBytes} from 'node:crypto';
export const CALENDAR_SCOPE='https://www.googleapis.com/auth/calendar.app.created';
export function encryptSecret(value:string,key:string){
  if(!/^[a-f0-9]{64}$/.test(key))throw Error('Calendar encryption is not configured.');
  const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',Buffer.from(key,'hex'),iv);
  return [iv.toString('base64url'),Buffer.concat([cipher.update(value,'utf8'),cipher.final()]).toString('base64url'),cipher.getAuthTag().toString('base64url')].join('.');
}
export function decryptSecret(value:string,key:string){
  if(!/^[a-f0-9]{64}$/.test(key))throw Error('Calendar encryption is not configured.');
  const [iv,data,tag]=value.split('.'),cipher=createDecipheriv('aes-256-gcm',Buffer.from(key,'hex'),Buffer.from(iv,'base64url'));
  cipher.setAuthTag(Buffer.from(tag,'base64url'));
  return Buffer.concat([cipher.update(Buffer.from(data,'base64url')),cipher.final()]).toString('utf8');
}
export type CalendarBooking={id:string;shop:string;weddingDate:string;customerName:string;venue:string;status:string};
export function calendarEvent(b:CalendarBooking){
  const end=new Date(b.weddingDate+'T00:00:00Z');end.setUTCDate(end.getUTCDate()+1);
  return {id:'elunora'+createHash('sha256').update(b.shop+':'+b.id).digest('hex'),summary:'Atelier Elunora · '+b.customerName,location:b.venue,description:'Confirmed Atelier Elunora booking. Manage changes in the booking app.',start:{date:b.weddingDate},end:{date:end.toISOString().slice(0,10)},transparency:'opaque',extendedProperties:{private:{elunoraBooking:b.id}}};
}
export function calendarFingerprint(b:CalendarBooking){return createHash('sha256').update(JSON.stringify([b.status,calendarEvent(b)])).digest('hex');}
export function retryDelay(attempt:number){return Math.min(3600000,30000*2**Math.min(attempt,7));}
