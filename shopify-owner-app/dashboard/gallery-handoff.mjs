export function galleryLink(eventId, base, origin) {
 const url=new URL(base||'/pages/client-gallery',origin);
 if(url.origin!==origin||url.pathname!=='/pages/client-gallery')throw Error('Gallery link configuration is invalid.');
 url.searchParams.delete('view');url.searchParams.set('event',eventId);url.hash='';
 return url.href;
}
export function galleryMessage(name,email,url,expires) {
 return `Your ${name} photo gallery is ready.\n\nOpen ${url}\n\nSign in with ${email} using your password or an email code. To create a password on your first visit, choose Create or reset password and verify your email. You can view the approved photos from the whole event. Access expires ${new Date(expires).toLocaleString()}.\n\nWith love,\nAtelier Elunora`;
}
