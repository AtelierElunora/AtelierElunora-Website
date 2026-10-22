// Shopify Settings > Customer events > custom pixel, not a theme script.
// Require Marketing + Analytics permissions; honor data-sale opt-outs.
// The native Facebook & Instagram app remains the only owner of PageView/Purchase.
const ELUNORA_PIXEL_ID = '1845623429782635';
let privacy = init.customerPrivacy;
let initialized = false;
const sent = new Set();
let pending = Promise.resolve();
const allowed = () => privacy?.marketingAllowed === true &&
  privacy?.analyticsProcessingAllowed === true && privacy?.saleOfDataAllowed === true;

api.customerPrivacy.subscribe('visitorConsentCollected', event => {
  privacy = event.customerPrivacy;
  if (initialized) window.fbq('consent', allowed() ? 'grant' : 'revoke');
});

function initialize() {
  if (initialized) return;
  // Shopify's documented Meta SDK bootstrap, local to this pixel sandbox.
  !function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?
    n.callMethod.apply(n,arguments):n.queue.push(arguments)};
    if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];
    t=b.createElement(e);t.async=!0;t.src=v;s=b.getElementsByTagName(e)[0];
    s.parentNode.insertBefore(t,s);
  }(window,document,'script','https://connect.facebook.net/en_US/fbevents.js');
  window.fbq('set','autoConfig',false,ELUNORA_PIXEL_ID);
  window.fbq('init',ELUNORA_PIXEL_ID);
  initialized = true;
}

analytics.subscribe('elunora:inquiry_saved', event => {
  // Serialize replays so simultaneous callbacks cannot send the same Lead twice.
  pending = pending.then(async () => {
    const id = event.customData?.conversion_id;
    if (!allowed() || typeof id !== 'string' || !/^[a-f0-9]{64}$/.test(id) || sent.has(id)) return;
    const key = 'elunora:meta-lead:' + id;
    try {if (await browser.sessionStorage.getItem(key)) {sent.add(id);return;}} catch { /* Memory dedup still applies. */ }
    if (!allowed()) return;
    initialize();
    window.fbq('track','Lead',{content_name:'Wedding inquiry'},{eventID:'elunora-lead-' + id});
    sent.add(id);
    try {await browser.sessionStorage.setItem(key,'1');} catch { /* Storage may be blocked. */ }
  }).catch(() => { /* A tracking failure must not affect the booking flow. */ });
  return pending;
});
