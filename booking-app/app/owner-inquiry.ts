import {customerBookingAllowed, developmentBookingShop} from './live-store';
export const OWNER_INQUIRY_KIND='owner_inquiry';
export const OWNER_INQUIRY_RECIPIENT='support@atelierelunora.com';
export const ownerInquiryId=(leadId:string)=>'owner-inquiry:'+leadId;
export function ownerInquiryLink(shop:string,id:string) {
  if(!customerBookingAllowed(shop) || !/^[a-zA-Z0-9_-]{1,100}$/.test(id))throw Error('Invalid inquiry notification link.');
  return `https://admin.shopify.com/store/${shop.replace(/\.myshopify\.com$/, '')}/apps/atelier-elunora-bookings/app/leads?lead=${encodeURIComponent(id)}`;
}
export const isDevelopmentInquiry=(shop:string)=>shop===developmentBookingShop;
export function ownerNoticeLabel(status:string) {
 return ({pending:'Queued',sending:'Sending',accepted:'Accepted by email provider',submitted:'Submitted to Microsoft',sent:'Sent',delivered:'Delivered',failed:'Failed — needs owner attention',review:'Needs owner review — sending was uncertain',suppressed:'Stopped'} as Record<string,string>)[status] || status;
}
