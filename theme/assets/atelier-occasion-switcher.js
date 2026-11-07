(() => {
  const TEXT_KEYS = [
      "title",
      "intro",
      "tip",
      "card_title",
      "names_label",
      "button",
    ],
    HEX = /^#[0-9a-f]{6}$/i,
    CLASSIC = { id: "classic", label: "Classic", bg: "#fffdf8", ac: "#b19a73" },
    STYLES = {
      "save-the-date": [
        {
          id: "std-botanical",
          label: "Botanical",
          bg: "#f5f6f0",
          ac: "#8da48a",
        },
        {
          id: "std-black-gold",
          label: "Black & Gold",
          bg: "#171717",
          ac: "#c9a45c",
          dark: !0,
          ink: "#a8873f",
        },
        {
          id: "std-blush-arch",
          label: "Blush Arch",
          bg: "#f6ede8",
          ac: "#eac9b8",
        },
      ],
      christmas: [
        {
          id: "xmas-plaid",
          label: "Buffalo Plaid",
          bg: "#fbf7f0",
          ac: "#a3202f",
        },
        {
          id: "xmas-evergreen",
          label: "Evergreen Snow",
          bg: "#233a2c",
          ac: "#fffdf8",
          dark: !0,
          ink: "#fffdf8",
        },
        {
          id: "xmas-holly",
          label: "Holly & Pine",
          bg: "#fbf8f2",
          ac: "#2f4a35",
        },
      ],
      birthday: [
        {
          id: "bday-confetti",
          label: "Confetti",
          bg: "#fff8ec",
          ac: "#f0715a",
        },
        {
          id: "bday-balloons",
          label: "Balloons",
          bg: "#fdf1ec",
          ac: "#9cc5c9",
        },
        {
          id: "bday-stripes",
          label: "Candy Stripe",
          bg: "#fff8ec",
          ac: "#f2b33d",
        },
      ],
      graduation: [
        {
          id: "grad-navy-gold",
          label: "Navy & Gold",
          bg: "#1f2d40",
          ac: "#c9a45c",
          dark: !0,
          ink: "#fffdf8",
        },
        {
          id: "grad-pennant",
          label: "Pennant Stripe",
          bg: "#faf8f3",
          ac: "#28394d",
        },
        { id: "grad-laurel", label: "Laurel", bg: "#f7f5ee", ac: "#b9a46a" },
      ],
      baby: [
        { id: "baby-clouds", label: "Clouds", bg: "#eaf1f5", ac: "#9bb3c4" },
        {
          id: "baby-watercolor",
          label: "Watercolor",
          bg: "#fffbf8",
          ac: "#e9b7b7",
        },
        { id: "baby-gingham", label: "Gingham", bg: "#fffdf8", ac: "#b97878" },
      ],
      "thank-you": [
        { id: "ty-kraft", label: "Kraft", bg: "#d9c29e", ac: "#fffdf8" },
        {
          id: "ty-wildflowers",
          label: "Wildflowers",
          bg: "#fbf8f1",
          ac: "#e2a27f",
        },
        {
          id: "ty-color-block",
          label: "Color Block",
          bg: "#fffdf8",
          ac: "#e3d7c3",
        },
      ],
    },
    ELUNORA_OVERLAY_STYLES = [
      {
        id: "ae-olive-botanical",
        key: "olive-botanical",
        label: "Olive Botanical",
        occasion: "save-the-date",
        bg: "#fffdf8",
        ac: "#576248",
        ink: "#4a4b36",
        headingTop: 17,
        file: "atelier-card-olive-botanical.png",
      },
      {
        id: "ae-romantic-ribbon",
        key: "romantic-ribbon",
        label: "Romantic Ribbon",
        occasion: "save-the-date",
        bg: "#fffdf8",
        ac: "#8b2536",
        ink: "#8b2536",
        headingTop: 21,
        file: "atelier-card-romantic-ribbon.png",
      },
      {
        id: "ae-modern-arch",
        key: "modern-arch",
        label: "Modern Arch",
        occasion: "save-the-date",
        bg: "#fffdf8",
        ac: "#787b60",
        ink: "#4a4b36",
        headingTop: 17,
        file: "atelier-card-modern-arch.png",
      },
      {
        id: "ae-evergreen-classic",
        key: "evergreen-classic",
        label: "Evergreen Classic",
        occasion: "christmas",
        bg: "#fffdf8",
        ac: "#2f4a35",
        ink: "#2f4a35",
        headingTop: 23,
        file: "atelier-card-evergreen-classic.png",
      },
      {
        id: "ae-cranberry-gingham",
        key: "cranberry-gingham",
        label: "Cranberry Gingham",
        occasion: "christmas",
        bg: "#fffdf8",
        ac: "#9d2835",
        ink: "#2f4a35",
        headingTop: 17,
        file: "atelier-card-cranberry-gingham.png",
      },
      {
        id: "ae-midnight-winter",
        key: "midnight-winter",
        label: "Midnight Winter",
        occasion: "christmas",
        bg: "#172638",
        ac: "#d7bf8e",
        ink: "#fffdf8",
        dark: true,
        headingTop: 17,
        file: "atelier-card-midnight-winter.png",
      },
      {
        id: "ae-holiday-valentine",
        key: "valentine",
        label: "Valentine Rose",
        heading: "Happy Valentine’s Day",
        bg: "#fffdf8",
        ac: "#a33b50",
        ink: "#8b2536",
        headingTop: 17,
        file: "atelier-card-holiday-valentine.png",
        occasion: "holiday",
      },
      {
        id: "ae-holiday-halloween",
        key: "halloween",
        label: "Halloween Moon",
        heading: "Happy Halloween",
        bg: "#fdf7ed",
        ac: "#9d5d37",
        ink: "#4a3a3f",
        headingTop: 17,
        file: "atelier-card-holiday-halloween.png",
        occasion: "holiday",
      },
      {
        id: "ae-holiday-thanksgiving",
        key: "thanksgiving",
        label: "Harvest Gratitude",
        heading: "Happy Thanksgiving",
        bg: "#fff8ed",
        ac: "#a5683e",
        ink: "#685036",
        headingTop: 17,
        file: "atelier-card-holiday-thanksgiving.png",
        occasion: "holiday",
      },
      {
        id: "ae-holiday-new-year",
        key: "new-year",
        label: "New Year Starlight",
        heading: "Happy New Year",
        bg: "#182639",
        ac: "#c8ad73",
        ink: "#fffdf8",
        dark: true,
        headingTop: 17,
        file: "atelier-card-holiday-new-year.png",
        occasion: "holiday",
      },
      {
        id: "ae-holiday-easter",
        key: "easter",
        label: "Easter Garden",
        heading: "Happy Easter",
        bg: "#fffdf8",
        ac: "#9ca98c",
        ink: "#58624a",
        headingTop: 17,
        file: "atelier-card-holiday-easter.png",
        occasion: "holiday",
      },
      {
        id: "ae-holiday-hanukkah",
        key: "hanukkah",
        label: "Hanukkah Light",
        heading: "Happy Hanukkah",
        bg: "#fffdf8",
        ac: "#56749b",
        ink: "#2b4775",
        headingTop: 17,
        file: "atelier-card-holiday-hanukkah.png",
        occasion: "holiday",
      },
      {
        id: "ae-holiday-eid",
        key: "eid",
        label: "Eid Moon & Lanterns",
        heading: "Eid Mubarak",
        bg: "#fffdf8",
        ac: "#b89a5d",
        ink: "#3f655f",
        headingTop: 17,
        file: "atelier-card-holiday-eid.png",
        occasion: "holiday",
      },
      {
        id: "ae-holiday-diwali",
        key: "diwali",
        label: "Diwali Marigold",
        heading: "Happy Diwali",
        bg: "#fff9ed",
        ac: "#c2843a",
        ink: "#8a4c3c",
        headingTop: 17,
        file: "atelier-card-holiday-diwali.png",
        occasion: "holiday",
      },
      {
        id: "ae-holiday-kwanzaa",
        key: "kwanzaa",
        label: "Kwanzaa Heritage",
        heading: "Joyous Kwanzaa",
        bg: "#fff9ee",
        ac: "#3c6c48",
        ink: "#303d31",
        headingTop: 17,
        file: "atelier-card-holiday-kwanzaa.png",
        occasion: "holiday",
      },
      {
        id: "ae-holiday-lunar-new-year",
        key: "lunar-new-year",
        label: "Lunar New Year Peony",
        heading: "Happy Lunar New Year",
        bg: "#fff8ee",
        ac: "#a83239",
        ink: "#8d2e37",
        headingTop: 17,
        file: "atelier-card-holiday-lunar-new-year.png",
        occasion: "holiday",
      },
    ],
    ELUNORA_OVERLAY_INSTALLED = (() => {
      for (const style of ELUNORA_OVERLAY_STYLES) {
        STYLES[style.occasion] ??= [];
        STYLES[style.occasion].push(style);
      }
      return true;
    })(),
    normalizeHex = (value) => {
      let v = String(value || "")
        .trim()
        .replace(/^#*/, "");
      return (
        /^[0-9a-f]{3}$/i.test(v) &&
          (v = v
            .split("")
            .map((c) => c + c)
            .join("")),
        /^[0-9a-f]{6}$/i.test(v) ? "#" + v.toLowerCase() : ""
      );
    },
    luminance = (hex) => {
      const n = normalizeHex(hex);
      return n
        ? [1, 3, 5]
            .map((i) => parseInt(n.slice(i, i + 2), 16) / 255)
            .map((c) =>
              c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4,
            )
            .reduce((sum, c, i) => sum + c * [0.2126, 0.7152, 0.0722][i], 0)
        : 0;
    },
    initPacks = (root) => {
      const select = root.querySelector("[data-pack-select]");
      if (!select) return;
      const sync = () => {
        select.dataset.available =
          select.selectedOptions[0]?.dataset.available === "true"
            ? "true"
            : "false";
      };
      (select.addEventListener("change", sync), sync());
    },
    initColor = (root, onUserChange) => {
      const hidden = root.querySelector("[data-card-color-input]"),
        select = root.querySelector("[data-color-select]"),
        custom = root.querySelector("[data-color-custom]"),
        hexBox = root.querySelector("[data-color-hex]"),
        picker = root.querySelector("[data-color-picker]"),
        dot = root.querySelector("[data-color-dot]");
      if (!hidden || !select) return null;
      const named = [...select.options]
          .map((o) => o.value)
          .filter((v) => v !== "custom"),
        commit = (hex) => {
          ((hidden.value = hex),
            dot && dot.style.setProperty("--ae-ink", hex),
            picker && (picker.value = hex),
            hidden.dispatchEvent(new Event("input", { bubbles: !0 })));
        },
        showCustom = (open) => {
          custom && (custom.hidden = !open);
        },
        set = (hex) => {
          ((hex = normalizeHex(hex)),
            hex &&
              (named.includes(hex)
                ? ((select.value = hex), showCustom(!1))
                : ((select.value = "custom"),
                  showCustom(!0),
                  hexBox && (hexBox.value = hex.toUpperCase())),
              commit(hex)));
        };
      return (
        select.addEventListener("change", () => {
          (onUserChange(),
            select.value === "custom"
              ? (showCustom(!0),
                hexBox &&
                  ((hexBox.value = hidden.value.toUpperCase()),
                  hexBox.removeAttribute("aria-invalid"),
                  hexBox.focus()))
              : (showCustom(!1), commit(select.value)));
        }),
        hexBox?.addEventListener("input", () => {
          onUserChange();
          const hex = normalizeHex(hexBox.value);
          (hexBox.toggleAttribute(
            "aria-invalid",
            !hex && hexBox.value.trim().length >= 4,
          ),
            hex && commit(hex));
        }),
        hexBox?.addEventListener("blur", () => {
          const hex = normalizeHex(hexBox.value);
          hex && (hexBox.value = hex.toUpperCase());
        }),
        picker?.addEventListener("input", () => {
          onUserChange();
          const hex = normalizeHex(picker.value);
          hex &&
            (hexBox &&
              ((hexBox.value = hex.toUpperCase()),
              hexBox.removeAttribute("aria-invalid")),
            commit(hex));
        }),
        set(hidden.value),
        { set, value: () => hidden.value }
      );
    },
    init = (root) => {
      if (root.dataset.occasionReady) return;
      ((root.dataset.occasionReady = "true"), initPacks(root));
      let colorEdited = !1;
      const colorControl = initColor(root, () => {
        colorEdited = !0;
      });
      let items = [];
      try {
        items =
          JSON.parse(
            root.querySelector("[data-occasions]")?.textContent || "{}",
          ).items || [];
      } catch {
        return;
      }
      if (((items = items.filter((item) => item && item.key)), !items.length))
        return;
      const radios = [...root.querySelectorAll("[data-occasion-input]")],
        heading = root.querySelector("[data-card-heading]"),
        wording = root.querySelector("[data-card-wording]"),
        bookingNote = root.querySelector("[data-occ-booking-note]"),
        styleBox = root.querySelector("[data-style-options]"),
        styleName = root.querySelector("[data-style-name]"),
        productTitle = root.dataset.productTitle || "";
      const customStyle = {
        id: "custom",
        label: styleBox?.dataset.customLabel || "Customize my card",
        bg: "#fffdf8",
        ac: "#4a4b36",
      };
      const uploadStyle = { id: "upload", label: styleBox?.dataset.uploadLabel, bg: "#fffdf8", ac: "#b19a73" };
      let current = null,
        headingEdited = !1,
        currentStyle = CLASSIC;
      const syncCustomCard = () => {
        const custom = currentStyle.id === customStyle.id;
        root.dataset.customCard = String(custom);
        const upload = currentStyle.id === uploadStyle.id;
        root.dataset.cardUpload = String(upload);
        const fields = root.querySelector("[data-card-standard-fields]");
        if (fields) {
          fields.hidden = custom || upload;
          fields.disabled = custom || upload;
        }
        const uploadPanel = root.querySelector("[data-card-upload-panel]");
        if (uploadPanel) { uploadPanel.hidden = !upload; uploadPanel.disabled = !upload; }
        root.syncCardUpload?.();
        const panel = root.querySelector("[data-custom-card-panel]");
        if (panel) panel.hidden = !custom;
        const email = root.querySelector("[data-custom-card-email]");
        if (email) {
          const pack = root.querySelector("[data-pack-select]");
          const productURL = new URL(location.pathname, location.origin);
          if (current?.key) productURL.searchParams.set("occasion", current.key);
          const details = [
            productTitle,
            current?.label,
            pack?.selectedOptions[0]?.textContent.trim(),
            productURL.href,
          ].filter(Boolean).join("\n");
          email.href = "mailto:support@atelierelunora.com?subject=" +
            encodeURIComponent(email.dataset.subject + " — " + productTitle) +
            "&body=" + encodeURIComponent(details + "\n\n");
        }
        root.updateButton?.();
      };
      const setText = (key, value) => {
          for (const el of root.querySelectorAll(`[data-occ-text="${key}"]`))
            (key === "tip" && (el.hidden = !value),
              value && (el.textContent = value));
        },
        syncPreviews = () => {
          if (currentStyle.id === customStyle.id || currentStyle.id === uploadStyle.id) return;
          const text = heading?.value.trim() || current?.heading || "",
            placeholder = (current?.placeholder || "")
              .split("|")
              .map((part) => part.trim())
              .filter(Boolean).join(`
`);
          for (const preview of root.querySelectorAll("[data-card-preview]"))
            (text && preview.setAttribute("data-heading", text),
              placeholder &&
                preview.setAttribute("data-placeholder", placeholder),
              preview.setAttribute("card-style", currentStyle.id),
              preview.setAttribute(
                "data-magnet-alt",
                "Your personalized photo magnet on its matching card",
              ));
        },
        fitInk = (style, previous) => {
          if (!colorControl) return;
          const ink = colorControl.value();
          if (style.dark) {
            if (!colorEdited || luminance(ink) < 0.3)
              colorControl.set(style.ink);
          } else if (!colorEdited || (previous?.dark && luminance(ink) > 0.6)) {
            const suggested = style.ink || current?.color;
            if (HEX.test(suggested || "")) colorControl.set(suggested);
          }
        },
        chooseStyle = (style, fromUser) => {
          const previous = currentStyle;
          const previousHeading = previous.heading || current?.heading || "";
          if (
            heading &&
            (!headingEdited || heading.value.trim() === previousHeading)
          ) {
            heading.value = style.heading || current?.heading || "";
            headingEdited = false;
          }
          currentStyle = style;
          if (styleName) styleName.textContent = style.label;
          syncCustomCard();
          if (fromUser && style.id !== customStyle.id && style.id !== uploadStyle.id) fitInk(style, previous);
          syncPreviews();
        },
        renderStyles = (key) => {
          if (!styleBox) return;
          const selected = currentStyle.id === customStyle.id ? customStyle : currentStyle.id === uploadStyle.id ? uploadStyle : CLASSIC;
          const list = [CLASSIC, ...(STYLES[key] || []), uploadStyle, customStyle];
          (styleBox.replaceChildren(
            ...list.map((style, i) => {
              const label = document.createElement("label");
              label.className = "ae-style";
              const input = document.createElement("input");
              ((input.type = "radio"),
                (input.name = "properties[Card style]"),
                (input.value = style.label),
                (input.checked = style.id === selected.id),
                input.addEventListener("change", () => {
                  input.checked && chooseStyle(style, !0);
                }));
              const swatch = document.createElement("span");
              ((swatch.className = "ae-style__swatch"),
                swatch.setAttribute("aria-hidden", "true"),
                swatch.style.setProperty("--sw-bg", style.bg),
                swatch.style.setProperty("--sw-ac", style.ac));
              const text = document.createElement("span");
              return (
                (text.textContent = style.label),
                label.append(input, swatch, text),
                label
              );
            }),
          ),
            (currentStyle = selected),
            styleName && (styleName.textContent = selected.label));
          syncCustomCard();
        },
        apply = (item, updateURL) => {
          if (!item) return;
          ((current = item),
            (root.dataset.occasion = item.key),
            HEX.test(item.tint || "") &&
              root.style.setProperty("--occ-tint", item.tint));
          for (const key of TEXT_KEYS)
            setText(
              key,
              key === "title" ? item.title || productTitle : item[key],
            );
          (wording &&
            item.card_placeholder &&
            (wording.placeholder = item.card_placeholder),
            bookingNote && (bookingNote.hidden = item.show_booking_note !== !0),
            heading && !headingEdited && (heading.value = item.heading || ""));
          const wasDark = currentStyle.dark;
          if (
            (renderStyles(item.key),
            colorControl &&
              HEX.test(item.color || "") &&
              (!colorEdited ||
                (wasDark && luminance(colorControl.value()) > 0.6)) &&
              colorControl.set(item.color),
            syncPreviews(),
            updateURL)
          )
            try {
              const url = new URL(location.href);
              (url.searchParams.set("occasion", item.key),
                history.replaceState(history.state, "", url));
            } catch {}
        };
      heading?.addEventListener("input", () => {
        ((headingEdited =
          heading.value.trim() !== "" &&
          heading.value.trim() !== (current?.heading || "")),
          syncPreviews());
      });
      root.querySelector("[data-pack-select]")?.addEventListener("change", syncCustomCard);
      for (const radio of radios)
        radio.addEventListener("change", () => {
          radio.checked &&
            apply(
              items.find((item) => item.key === radio.dataset.key),
              !0,
            );
        });
      let wanted = "";
      try {
        wanted = (
          new URL(location.href).searchParams.get("occasion") || ""
        ).toLowerCase();
      } catch {}
      const start =
        items.find((item) => item.key === wanted) ||
        items.find(
          (item) => item.key === radios.find((r) => r.checked)?.dataset.key,
        ) ||
        items[0];
      for (const radio of radios)
        radio.checked = radio.dataset.key === start.key;
      apply(start, !1);
    },
    run = () => document.querySelectorAll("atelier-save-date").forEach(init);
  (document.readyState === "loading"
    ? document.addEventListener("DOMContentLoaded", run)
    : run(),
    document.addEventListener("shopify:section:load", run));
})();


