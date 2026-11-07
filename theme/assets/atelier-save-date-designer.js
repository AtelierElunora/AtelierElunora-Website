if (!customElements.get('atelier-save-date')) {
    customElements.define('atelier-save-date', class extends HTMLElement {
      connectedCallback() {
        if (this.controller) return;
        this.controller = new AbortController();
        const frame = this.querySelector('[data-designer]'), form = this.querySelector('form');
        if (!(frame instanceof HTMLIFrameElement) || !(form instanceof HTMLFormElement)) return;
        this.ready = false;
        this.previewVersion = 0;
        this.previewURLs = new Set();
        this.channel = crypto.randomUUID();
        const origin = this.dataset.designerOrigin, url = new URL('/save-date-designer', origin);
        url.searchParams.set('previewVersion', '20261027-lettering-colors');
        url.searchParams.set('parentOrigin', location.origin); url.searchParams.set('channel', this.channel);
        window.addEventListener('message', event => {
          if (event.source !== frame.contentWindow || event.origin !== origin || event.data?.channel !== this.channel) return;
          const data = event.data;
          if (data.type === 'elunora:save-date-height') {
            if (Number.isFinite(data.height)) frame.style.height = `${Math.max(450, Math.min(2400, data.height + 6))}px`;
            return;
          }
          if (data.type === 'elunora:save-date-preview') {
            const sample=data.preview;
            if (sample === null) { this.magnetPreview=''; this.previewDate=''; }
            else if (typeof sample?.src === 'string' && sample.src.length <= 800000 && /^data:image\/jpeg;base64,[A-Za-z0-9+/]+={0,2}$/.test(sample.src) && typeof sample.date === 'string' && sample.date.length <= 60) { this.magnetPreview=sample.src;this.previewDate=sample.date; }
            else return;
            this.updateCardPreview();return;
          }
          if (data.type !== 'elunora:save-date-ready') return;
          const version = ++this.previewVersion;
          this.releasePreviewURLs();
          this.ready = false;
          if (!data.ready) { this.magnetPreview = ''; this.updateCardPreview(); }
          this.querySelector('[data-original]').value = ''; this.querySelector('[data-print]').value = '';
          this.querySelector('[data-top]').value = ''; this.querySelector('[data-bottom]').value = ''; this.querySelector('[data-ink]').value = '';
          this.querySelector('[data-top-style]').value = ''; this.querySelector('[data-date-style]').value = '';
          if (data.ready) {
            try {
              const d = data.design;
              if (!d || d.version !== 1 || typeof d.topEnabled !== 'boolean' || typeof d.topText !== 'string' || d.topText.length > 60 || (d.topEnabled && !d.topText.trim()) || typeof d.bottomText !== 'string' || !d.bottomText.trim() || d.bottomText.length > 60 || !(d.ink === 'white' || d.ink === 'olive' || (typeof d.ink === 'string' && /^#[0-9a-f]{6}$/i.test(d.ink)))) throw Error('Invalid design');
              const t = d.typography;
              if (t && (!['script', 'modern'].includes(t.topFont) || !['script', 'modern'].includes(t.bottomFont) || ![t.topSize, t.bottomSize].every(n => typeof n === 'number' && Number.isFinite(n) && n >= 8 && n <= 24 && Number.isInteger(n * 2)))) throw Error('Invalid lettering');
              if (!(data.original?.bytes instanceof ArrayBuffer) || !(data.print?.bytes instanceof ArrayBuffer) || !['image/jpeg', 'image/png', 'image/webp'].includes(data.original.type) || data.original.bytes.byteLength < 1 || data.original.bytes.byteLength > 10 * 1024 * 1024 || data.print.bytes.byteLength < 1 || data.print.bytes.byteLength > 6 * 1024 * 1024) throw Error('Invalid image');
              const attach = (selector, file) => { const transfer = new DataTransfer(); transfer.items.add(file); this.querySelector(selector).files = transfer.files; };
              attach('[data-original]', new File([data.original.bytes], String(data.original.name || 'save-date-photo.jpg'), { type: data.original.type }));
              const preparedPrint = new File([data.print.bytes], 'atelier-elunora-save-the-date.png', { type: 'image/png' });
              attach('[data-print]', preparedPrint);
              this.renderPreparedPreview(preparedPrint, d.bottomText, version);
              this.querySelector('[data-top]').value = d.topEnabled ? d.topText : 'Off — date only'; this.querySelector('[data-bottom]').value = d.bottomText; this.querySelector('[data-ink]').value = d.ink === 'white' ? 'Cream' : d.ink === 'olive' ? 'Olive' : d.ink.toUpperCase();
              if (t) { const fontName = id => id === 'script' ? 'Atelier Script' : 'Atelier Modern'; this.querySelector('[data-top-style]').value = d.topEnabled ? `${fontName(t.topFont)}, ${t.topSize} pt` : 'Off'; this.querySelector('[data-date-style]').value = `${fontName(t.bottomFont)}, ${t.bottomSize} pt`; }
              this.ready = true;
            } catch { this.querySelector('[data-status]').textContent = this.dataset.error; this.updateButton(); return; }
          }
          this.querySelector('[data-status]').textContent = this.ready ? this.dataset.ready : this.dataset.waiting;
          this.updateButton();
        }, { signal: this.controller.signal });
        for (const button of this.querySelectorAll('[data-card-color]')) {
          button.addEventListener('click', () => {
            const input=this.querySelector('[data-card-color-input]');
            if (input && /^#[0-9a-f]{6}$/i.test(button.dataset.cardColor || '')) {
              input.value=button.dataset.cardColor;
              this.updateCardPreview();
            }
          }, {signal:this.controller.signal});
        }
        form.addEventListener('input', () => this.updateCardPreview(), { signal: this.controller.signal });
        this.querySelector('[data-card-upload]')?.addEventListener('change', () => this.syncCardUpload(), { signal: this.controller.signal });
        this.syncCardUpload();
        this.buildStd();
        this.syncStd();
        this.occasionObserver = new MutationObserver(() => { this.syncStd(); this.updateCardPreview(); });
        this.occasionObserver.observe(this, { attributes: true, attributeFilter: ['data-occasion'] });
        this.updateCardPreview();
        form.addEventListener('change', () => this.updateButton(), { signal: this.controller.signal });
        form.addEventListener('submit', event => { if (this.dataset.customCard === 'true' || !this.cardUploadValid() || !this.ready || (this.querySelector('[data-unit-variant]') || this.querySelector('input[name="id"]:checked'))?.dataset.available !== 'true') event.preventDefault(); }, { signal: this.controller.signal });
        frame.src = url.toString();
      }
      cardUploadValid() {
        if (this.dataset.cardUpload !== 'true') return true;
        const input = this.querySelector('[data-card-upload]');
        return !!input?.files?.length && input.validity.valid;
      }
      syncCardUpload() {
        const input = this.querySelector('[data-card-upload]');
        if (!input) return;
        const active = this.dataset.cardUpload === 'true';
        input.required = active;
        if (!active) input.value = '';
        const file = input.files?.[0];
        const valid = file && file.size > 0 && file.size <= 10 * 1024 * 1024 && /\.(pdf|png|jpe?g)$/i.test(file.name) && ['application/pdf', 'image/png', 'image/jpeg', ''].includes(file.type);
        const error = active ? file ? valid ? '' : input.dataset.invalid : input.dataset.required : '';
        input.setCustomValidity(error);
        input.setAttribute('aria-invalid', String(!!error && !!file));
        this.querySelector('[data-card-upload-status]').textContent = error || file?.name || '';
        const preview = this.querySelector('[data-card-upload-preview]');
        if (this.cardUploadURL) URL.revokeObjectURL(this.cardUploadURL);
        this.cardUploadURL = null;
        preview.hidden = true;
        preview.removeAttribute('src');
        if (active && valid && /\.(png|jpe?g)$/i.test(file.name)) {
          this.cardUploadURL = URL.createObjectURL(file);
          preview.src = this.cardUploadURL;
          preview.hidden = false;
        }
        const wording = this.querySelector('[data-card-wording]');
        if (wording) wording.disabled = active;
        this.updateButton();
      }
      buildStd() {
        const names = this.querySelector('[data-couple-names]'), heading = this.querySelector('[data-card-heading]');
        if (!names || this.querySelector('[data-std-fields]')) return;
        const id = this.channel.slice(0, 8);
        const box = document.createElement('fieldset');
        box.className = 'ae-std-fields';
        box.dataset.stdFields = '';
        box.style.cssText = 'display:none;gap:10px;margin:0;padding:0;border:0;min-width:0';
        box.innerHTML = `<label for='SaveDateLocation-${id}'>City and state</label>
          <input id='SaveDateLocation-${id}' name='properties[Wedding location]' type='text' maxlength='80' autocomplete='off' placeholder='Cleveland, Ohio' data-std-location>
          <label for='SaveDateWebsite-${id}'>Wedding website <span style='font-weight:400;color:#77745d'>(optional)</span></label>
          <input id='SaveDateWebsite-${id}' name='properties[Wedding website]' type='text' maxlength='100' autocomplete='off' autocapitalize='off' spellcheck='false' inputmode='url' placeholder='www.emmaandjake.com' data-std-website>
          <label for='SaveDateInvite-${id}'>Invitation line</label>
          <div class='ae-select'><select id='SaveDateInvite-${id}' name='properties[Invitation line]' data-std-invite><option value='Invitation to follow' selected>Invitation to follow</option><option value='Formal invitation to follow'>Formal invitation to follow</option><option value='None'>Don't include</option></select></div>`;
        names.after(box);
        if (heading) {
          const list = document.createElement('datalist');
          list.id = `SaveDateHeadings-${id}`;
          list.dataset.stdHeadings = '';
          for (const value of ['Save the Date', 'Save Our Date', `We're Getting Married`]) { const option = document.createElement('option'); option.value = value; list.append(option); }
          heading.after(list);
        }
      }
      syncStd() {
        const box = this.querySelector('[data-std-fields]');
        if (!box) return;
        const on = this.dataset.occasion === 'save-the-date';
        box.disabled = !on;
        box.style.display = on ? 'grid' : 'none';
        const heading = this.querySelector('[data-card-heading]'), list = this.querySelector('[data-std-headings]');
        if (heading && list) { if (on) heading.setAttribute('list', list.id); else heading.removeAttribute('list'); }
      }
      releasePreviewURLs() {
        for (const url of this.previewURLs || []) URL.revokeObjectURL(url);
        this.previewURLs?.clear();
      }
      renderPreparedPreview(file, date, version) {
        const url = URL.createObjectURL(file), image = new Image();
        this.previewURLs.add(url);
        const release = () => { URL.revokeObjectURL(url); this.previewURLs.delete(url); };
        const current = () => version === this.previewVersion && !this.controller?.signal.aborted;
        const failed = () => {
          if (current()) this.querySelector('[data-status]').textContent = this.dataset.previewError || this.dataset.error;
          release();
        };
        image.onload = () => {
          try {
            if (!current()) return;
            const canvas = document.createElement('canvas');
            canvas.width = canvas.height = 440;
            canvas.getContext('2d').drawImage(image, 0, 0, 440, 440);
            this.magnetPreview = canvas.toDataURL('image/jpeg', .85);
            this.previewDate = date;
            this.updateCardPreview();
          } catch { failed(); }
          finally { release(); }
        };
        image.onerror = failed;
        image.src = url;
      }
      updateCardPreview() {
        const color=this.querySelector('[data-card-color-input]')?.value || '#4a4b36';
        const safeColor=/^#[0-9a-f]{6}$/i.test(color) ? color.toLowerCase() : '#4a4b36';
        const output=this.querySelector('[data-card-color-value]');
        if (output) output.textContent=safeColor.toUpperCase();
        for (const button of this.querySelectorAll('[data-card-color]')) button.setAttribute('aria-pressed', String(button.dataset.cardColor===safeColor));
        const stdBox = this.querySelector('[data-std-fields]'), std = !!stdBox && !stdBox.disabled;
        const place = std ? this.querySelector('[data-std-location]')?.value || '' : '';
        const website = std ? this.querySelector('[data-std-website]')?.value || '' : '';
        const inviteValue = std ? this.querySelector('[data-std-invite]')?.value || '' : '';
        const invite = inviteValue === 'None' ? '' : inviteValue;
        for (const preview of this.querySelectorAll('[data-card-preview]')) {
          preview.setAttribute('lettering-color', safeColor);
          const names = this.querySelector('[name="properties[Your names]"]')?.value || '';
          const message = this.querySelector('[name="properties[Matching card wording]"]')?.value || '';
          const wording = this.querySelector('[data-couple-names]') ? [names, this.previewDate, place, message, website, invite].filter(value => value?.trim()).join('\n') : message;
          preview.setAttribute('card-wording', wording);
          preview.setAttribute('couple-names', names);
          preview.setAttribute('event-date', this.previewDate || '');
          preview.setAttribute('magnet-src', this.magnetPreview || '');
        }
      }
      updateButton() { const choice = (this.querySelector('[data-unit-variant]') || this.querySelector('input[name="id"]:checked')); this.querySelector('[data-add]').disabled = this.dataset.customCard === 'true' || !this.cardUploadValid() || !this.ready || choice?.dataset.available !== 'true' || this.querySelector('[data-magnet-quantity]')?.validity.valid === false; }
      disconnectedCallback() { if (this.cardUploadURL) URL.revokeObjectURL(this.cardUploadURL); this.cardUploadURL = null; this.occasionObserver?.disconnect(); this.occasionObserver = null; this.previewVersion++; this.releasePreviewURLs(); this.controller?.abort(); this.controller = null; this.ready = false; }
    });
  }
