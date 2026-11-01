export function previewText(wording, names, date) {
  const clean = (value, max) => typeof value === 'string' ? value.normalize('NFC').replace(/\r\n?/g, '\n').trim().slice(0, max) : '';
  return clean(wording, 1000) || [clean(names, 200), clean(date, 60)].filter(Boolean).join('\n');
}

export function safeMagnetPreview(value) {
  return typeof value === 'string' && value.length <= 800000 && /^data:image\/(?:jpeg|png);base64,[A-Za-z0-9+/]+={0,2}$/.test(value) ? value : '';
}

if (typeof HTMLElement !== 'undefined' && !customElements.get('atelier-card-preview')) {
  customElements.define('atelier-card-preview', class extends HTMLElement {
    static observedAttributes = ['card-wording', 'couple-names', 'event-date', 'magnet-src', 'lettering-color', 'view', 'data-title', 'data-caption', 'data-heading', 'data-placeholder', 'data-empty', 'data-overflow', 'data-magnet-alt'];
    constructor() {
      super();
      const root = this.attachShadow({ mode: 'open' });
      root.innerHTML = `<style>
        :host{display:block;min-width:0;color:var(--ae-olive,#4a4b36);font:14px/1.5 Arial,sans-serif;contain:layout style}
        *{box-sizing:border-box}figure{margin:0}figcaption{font-size:13px;font-weight:600;letter-spacing:.025em;margin-bottom:12px}
        .stage{padding:28px 24px;background:var(--ae-ivory,#e7e5d9);border:1px solid var(--ae-sand,#d6d2bc);border-radius:8px;overflow:hidden}
        .paper{container-type:inline-size;position:relative;aspect-ratio:5/7;max-width:340px;width:100%;margin:auto;background:#fffdf8;border:1px solid #d6d2bc;box-shadow:0 10px 25px #4547341c;padding:9% 8%;display:flex;flex-direction:column;align-items:stretch;text-align:center;color:#4a4b36}
        .rule{height:1px;width:24%;background:#b19a73;flex-shrink:0;margin:0 auto 7%}.heading{font-family:var(--ae-script,"Elunora Edwardian","Snell Roundhand",cursive);font-size:clamp(26px,14cqi,48px);font-weight:400;line-height:1.05;margin:0 0 8%;flex-shrink:0}
        .wording{font-family:var(--ae-serif,Georgia,serif);white-space:pre-wrap;overflow-wrap:anywhere;line-height:1.4;min-height:0;overflow:hidden;flex:1;display:flex;align-items:center;justify-content:center}.wording span{display:block;width:100%}.footer{font-size:clamp(6px,2.5cqi,9px);letter-spacing:.2em;text-transform:uppercase;margin-top:8%;flex-shrink:0;color:#77745d}
        .magnet{display:none;position:absolute;bottom:9%;left:23%;width:54%;aspect-ratio:1;transform:rotate(-4deg);box-shadow:3px 8px 13px #292b2436;background:#eeece3;border:1px solid #d6d2bc;place-items:center;overflow:hidden}
        .magnet img{display:block;width:100%;height:100%;object-fit:contain}.empty{padding:12%;font-size:clamp(9px,4cqi,14px);line-height:1.5;color:#696950}.caption,.overflow{font-size:12px;line-height:1.5;margin:12px 0 0;color:inherit}.overflow{font-weight:600}.paper.set .magnet{display:grid}.paper.set .wording{flex:none;height:32%;align-items:flex-start}.paper.set .footer{position:absolute;bottom:3%;left:0;width:100%;margin:0}.paper.set .heading{margin-bottom:6%}[hidden]{display:none!important}
        @media(prefers-reduced-motion:reduce){*{scroll-behavior:auto}}
      </style><figure><figcaption></figcaption><div class="stage"><div class="paper"><div class="rule" aria-hidden="true"></div><p class="heading"></p><div class="wording"><span></span></div><div class="magnet"><img hidden><span class="empty"></span></div><div class="footer" aria-hidden="true">Atelier Elunora</div></div></div><p class="overflow" hidden></p><p class="caption"></p></figure>`;
    }
    connectedCallback() {
      this.render();
      this.observer?.disconnect();
      this.observer = new ResizeObserver(() => this.scheduleFit());
      this.observer.observe(this.shadowRoot.querySelector('.paper'));
      document.fonts?.ready.then(() => { if (this.isConnected) this.scheduleFit(); });
    }
    disconnectedCallback() { this.observer?.disconnect(); cancelAnimationFrame(this.frame); }
    attributeChangedCallback() { if (this.isConnected) this.render(); }
    label(name, fallback) { return this.getAttribute('data-' + name) || fallback; }
    render() {
      const r = this.shadowRoot, set = this.getAttribute('view') === 'set';
      const wording = previewText(this.getAttribute('card-wording'), this.getAttribute('couple-names'), this.getAttribute('event-date'));
      r.querySelector('figcaption').textContent = this.label('title', set ? 'Your magnet + matching card' : 'Your matching card');
      r.querySelector('.heading').textContent = this.label('heading', 'Save the date');
      r.querySelector('.wording span').textContent = wording || this.label('placeholder', 'Your names\nYour wedding date');
      r.querySelector('.paper').classList.toggle('set', set);
      const ink=this.getAttribute('lettering-color');
      r.querySelector('.paper').style.color=/^#[0-9a-f]{6}$/i.test(ink || '') ? ink : '#4a4b36';
      r.querySelector('.caption').textContent = this.label('caption', 'Layout preview · your digital proof confirms the final design.');
      r.querySelector('.overflow').textContent = this.label('overflow', 'Long wording needs a custom layout. We’ll confirm it in your digital proof.');
      const src = safeMagnetPreview(this.getAttribute('magnet-src')), img = r.querySelector('img'), empty = r.querySelector('.empty');
      img.hidden = !src; empty.hidden = !!src;
      if (src) { if (img.getAttribute('src') !== src) img.src = src; } else img.removeAttribute('src');
      img.alt = this.label('magnet-alt', 'Your personalized photo magnet on its matching save-the-date card');
      empty.textContent = this.label('empty', 'Your photo magnet will appear here');
      this.scheduleFit();
    }
    scheduleFit() { cancelAnimationFrame(this.frame); this.frame = requestAnimationFrame(() => this.fit()); }
    fit() {
      const r=this.shadowRoot, paper=r.querySelector('.paper'), box=r.querySelector('.wording'), text=r.querySelector('.wording span');
      if (!paper.clientWidth || !box.clientHeight) return;
      let size=Math.min(23, Math.max(14,paper.clientWidth*.068)), minimum=Math.max(7,paper.clientWidth*.024);
      text.style.fontSize=size+'px';
      while(text.scrollHeight>box.clientHeight+1 && size>minimum) { size=Math.max(minimum,size-.5);text.style.fontSize=size+'px'; }
      r.querySelector('.overflow').hidden=text.scrollHeight<=box.clientHeight+1;
    }
  });
}
