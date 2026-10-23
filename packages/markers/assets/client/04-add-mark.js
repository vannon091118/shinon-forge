    const addMark = (el) => {
      const marks = readMarks();
      // Die Markenmenge kommt aus den WIRKSAMEN Grenzen, nicht aus einer zweiten
      // Konstante; statt still zu verwerfen sagt die Leiste, woran es liegt.
      if (marks.length >= hostLimits.marks) {
        overlay.say(`Marken-Grenze erreicht: ${hostLimits.marks} (${hostLimits.from})`);
        return null;
      }
      const mark = {
        id: nextId(marks),
        label: labelOf(el),
        selector: selectorOf(el),
        text: textOf(el),
        rect: rectOf(el),
        href: typeof el.closest === 'function' ? (el.closest('a')?.href ?? null) : null,
        url: location.href,
        ts: new Date().toISOString()
      };
      saveMarks([...marks, mark]);
      overlay.say('markiert: ' + mark.id + '  ' + mark.label);
      return mark;
    };

    document.addEventListener('mousemove', (event) => {
      if (!mode) return;
      const target = event.target;
      if (!target || typeof target.getBoundingClientRect !== 'function') return;
      if (typeof target.closest === 'function' && target.closest('.__mk_root')) return;
      hoverRect = rectOf(target);
      hoverLabel = labelOf(target);
      overlay.box(hoverRect, hoverLabel);
    }, true);

    document.addEventListener('click', (event) => {
      if (!mode) return;
      const target = event.target;
      if (typeof target.closest === 'function' && target.closest('.__mk_root')) return;
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      addMark(target);
    }, true);

    document.addEventListener('keydown', (event) => {
      const typing = /^(INPUT|TEXTAREA)$/.test(event.target?.tagName ?? '') || event.target?.isContentEditable === true;
      if (typing) {
        // Escape gehört dem Feld, solange getippt wird — sonst springt der Cursor.
        if (event.key === 'Escape') {
          event.target.blur();
          event.stopPropagation();
        }
        return;
      }
      if (event.key === 'Escape') {
        setMode(false);
        return;
      }
      if (event.key === 'm' || event.key === 'M') {
        event.preventDefault();
        setMode(!mode);
        overlay.say(mode ? 'Marker aktiv — Element anklicken' : 'Marker aus');
      }
    }, true);

    // ── Öffentliche Spiegel-API (wie window.__mk im Original) ───────────────
    window.__mk = {
      setMode,
      mode: () => mode,
      marks: () => readMarks(),
      comments: () => readComments(),
      comment: (id, value) => {
        const comments = readComments();
        if (String(value ?? '').trim() === '') delete comments[id];
        else comments[id] = String(value).slice(0, hostLimits.comment);
        saveComments(comments);
        return comments[id] ?? '';
      },
      payload: () => payloadOf(readMarks(), readComments()),
      send: () => payloadOf(readMarks(), readComments()),
      rectOfSelector: (selector) => {
        const el = resolve(selector);
        return el ? rectOf(el) : null;
      },
      hover: () => ({ rect: hoverRect, label: hoverLabel }),
      /** Die wirksamen Grenzen und ihre Herkunft (Vertrag oder Profil). */
      limits: () => ({ ...hostLimits }),
      clear: () => {
        saveMarks([]);
        saveComments({});
      }
    };

    return {
      inject: ['slots'],
      apply(ctx) {
        // Sichtbarkeit: diese Client-Haelfte meldet sich in der gemeinsamen Liste von @shinon/dashboard an (Konvention, kein Import) — kein Hintergrundprozess ohne Zeile in der UI.
        const registry = (window.__shinonPlugins ??= new Map());
        registry.set('@shinon/markers', { label: 'Marker-Spiegel', kind: 'client', panel: PANEL_ID });
        window.dispatchEvent(new CustomEvent('shinon:plugin', { detail: { id: '@shinon/markers' } }));

        // >>> shinon:dsh-idiom locale-fallback/menu — EINE Quelle: scripts/lib/plugin-idioms.mjs (generiert; schreiben: `npm run idioms`, prüfen: Gate + dsh-test) params={"table":"MENU_DE","key":"menu.markers","label":"Shinon Marker"}
        // Menü-Label aus der Registry (Besitzer: @shinon/locale-de); ohne
        // Locale-Dienst gilt die deutsche Tabelle.
        const MENU_DE = { 'menu.markers': 'Shinon Marker' };
        // Gelesen wird `ctx.get?.('locale')`, NICHT `ctx.locale`: ein direkter
        // Dienst-Zugriff ist am Cordis-Proxy durch `inject` gesperrt und wirft
        // ('cannot get property "locale" without inject') — das kostete dieser
        // Hälfte die Aktivierung. `ctx.get` ist die dokumentierte optionale
        // Abfrage (undefined, wenn der Dienst fehlt), und die `?.` tragen einen
        // Context ganz ohne `get` (die Attrappen in durchstich/uebergabe); dann
        // gilt MENU_DE.
        const t = (key) => {
          const locale = ctx.get?.('locale');
          const hit = typeof locale?.bind === 'function' ? locale.bind('shinon')(key) : undefined;
          return hit === undefined || hit === key ? (MENU_DE[key] ?? key) : hit;
        };
        // <<< shinon:dsh-idiom locale-fallback/menu

        ctx.slots.inject('main', () => ctx.slots.register({ name: 'main', key: PANEL_ID }, MarkerPanel));
        // Kein `sidebar.panellist`-Eintrag mehr (2026-10-22): die Leiste war mit
        // acht Panel-Knöpfen überladen, die Workspaces fielen heraus. Die Zahl
        // steht als Widget in `@shinon/widget-dock`.
        console.log('[shinon-markers] Spiegel aktiv (m = markieren, Panel: ' + PANEL_ID + ')');
      }
    };
