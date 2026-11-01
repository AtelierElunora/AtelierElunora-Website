(() => {
  const production = ['https://www.atelierelunora.com', 'https://atelierelunora.com'];
  const bookingOrigin = 'https://app-elunora-bookings-nvo32m3ban2cc.azurewebsites.net';
  try {
    if (!window.Shopify?.customerPrivacy) window.Shopify?.loadFeatures?.([{ name: 'consent-tracking-api', version: '0.2' }], () => {});
  } catch {}
  function boot() {
    document.querySelectorAll('[data-wedding-inquiry]').forEach(section => {
      if (section.dataset.inquiryReady) return;
      const frame = section.querySelector('iframe[data-inquiry-url]');
      if (!frame) return;
      section.dataset.inquiryReady = 'true';
      const seen = new Set();
      function google(name) {
        try {
          if (!production.includes(location.origin)) return;
          const privacy = window.Shopify?.customerPrivacy;
          if (privacy?.analyticsProcessingAllowed?.() !== true || privacy?.marketingAllowed?.() !== true || privacy?.saleOfDataAllowed?.() !== true) return;
          const send = typeof window.gtag === 'function' ? (...args) => window.gtag(...args)
            : Array.isArray(window.dataLayer) ? function () { window.dataLayer.push(arguments); } : null;
          if (!send) return;
          send('event', name, { send_to: 'G-DT8V6JCFSX', form_id: 'wedding_availability', lead_source: 'wedding_page', page_location: location.origin + location.pathname, page_title: 'Wedding availability inquiry' });
        } catch {}
      }
      document.querySelectorAll('a[data-wedding-availability]').forEach(link => {
        link.addEventListener('click', () => {
          google('availability_click');
          section.focus({ preventScroll: true });
        });
      });
      window.addEventListener('message', event => {
        if (event.source !== frame.contentWindow || event.origin !== bookingOrigin || !event.data || typeof event.data !== 'object') return;
        if (event.data.type === 'elunora:ads-attribution-request') {
          let attribution = null;
          try {
            const privacy = window.Shopify?.customerPrivacy, key = 'elunora:google-ads-click';
            const allowed = production.includes(location.origin) && privacy?.analyticsProcessingAllowed?.() === true && privacy?.marketingAllowed?.() === true && privacy?.saleOfDataAllowed?.() === true;
            if (!allowed) { try { sessionStorage.removeItem(key); } catch {} }
            else {
              const gclid = new URL(location.href).searchParams.get('gclid');
              let stored = null; try { stored = JSON.parse(sessionStorage.getItem(key) || 'null'); } catch {}
              if (/^[A-Za-z0-9_-]{10,200}$/.test(gclid || '') && stored?.gclid !== gclid) stored = { gclid, capturedAt: new Date().toISOString() };
              const time = Date.parse(stored?.capturedAt || '');
              if (/^[A-Za-z0-9_-]{10,200}$/.test(stored?.gclid || '') && Number.isFinite(time) && time <= Date.now() && Date.now() - time <= 90 * 86400000) {
                attribution = { gclid: stored.gclid, capturedAt: stored.capturedAt, consentGranted: true };
                try { sessionStorage.setItem(key, JSON.stringify(stored)); } catch {}
              } else if (stored) { try { sessionStorage.setItem(key, JSON.stringify(stored)); } catch {} }
            }
          } catch {}
          frame.contentWindow.postMessage({type: 'elunora:ads-attribution', attribution}, bookingOrigin);
          return;
        }
        if (event.data.type === 'elunora:inquiry-height') {
          if (Number.isFinite(event.data.height)) frame.height = String(Math.max(220, Math.min(1600, event.data.height)));
        } else if (event.data.type === 'elunora:inquiry-started' && !seen.has('start')) {
          seen.add('start'); google('form_start');
        } else if (event.data.type === 'elunora:inquiry-saved' && /^[a-f0-9]{64}$/.test(event.data.conversionId || '')) {
          const id = event.data.conversionId;
          if (seen.has(id)) return;
          seen.add(id);
          const key = 'elunora:google-inquiry:' + id;
          let repeated = false;
          try { repeated = window.sessionStorage.getItem(key) === '1'; } catch {}
          if (!repeated) {
            google('generate_lead');
            try { window.sessionStorage.setItem(key, '1'); } catch {}
            try { window.Shopify?.analytics?.publish('elunora:inquiry_saved', { conversion_id: id }); } catch {}
          }
        }
      });
      const url = new URL(frame.dataset.inquiryUrl);
      if (url.origin !== bookingOrigin) return;
      url.searchParams.set('parentOrigin', location.origin);
      frame.src = url.href;
    });
  }
  boot();
  document.addEventListener('shopify:section:load', boot);
})();
