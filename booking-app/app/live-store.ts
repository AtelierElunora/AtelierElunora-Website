export const liveBookingShop = "v0j63n-ms.myshopify.com";
export const developmentBookingShop = "atelier-elunora-gallery-test.myshopify.com";
export const customerBookingAllowed = (shop: string | undefined) => shop === liveBookingShop || shop === developmentBookingShop;
export const bookingRecipientAllowed = (shop: string, email: string, testRecipients: Set<string>) => shop === liveBookingShop || testRecipients.has(email.toLowerCase());
