    /** Die Figur eines Codemons: Familie aus der Spezies, Farbe aus dem Farbton. */
    function speciesGlyph(speciesId, lvl, size) {
      const species = SPECIES[speciesId] ?? SPECIES[SPECIES_IDS[0]];
      const key = `${species.family}:${stageIndex(lvl)}:${size}:${species.hue}`;
      const cached = spriteCache.get(key);
      if (cached !== undefined) return cached;
      const svg = spriteSvg(species.family, stageIndex(lvl), size)
        .replace('<svg ', `<svg data-species="${speciesId}" `);
      // Der Farbton ist Teil der Spezies: die Familie liefert die Form, die
      // Spezies die Farbe. Damit teilen sich nicht alle zehn ein Aussehen.
      const tinted = svg.replace(/hsl\((\d+)/g, `hsl(${species.hue}`);
      spriteCache.set(key, tinted);
      return tinted;
    }

    /**
     * Die Kunst einer Art als fertiges Markup (Quelle
     * `assets/art/<art>.svg`, Generator `scripts/assets/build-sprites.mjs`,
     * Drift-Test `sprites.test.mjs`). Groesse wird gesetzt, der Rest steht schon
     * in der Datei.
     *
     * Zwei Entscheidungen, die man dem Markup nicht ansieht:
     *
     *   `aria-hidden` + `focusable="false"` — die Kunst traegt im ArtPack ein
     *   `aria-label` mit dem Artnamen. Im Panel steht dieser Name ohnehin als
     *   Text daneben; ihn zweimal vorzulesen ist Laerm, nicht Zugaenglichkeit.
     *   Das Bild ist hier Schmuck, die Aussage steht im Text.
     *
     *   `back` wird gespiegelt, nicht neu gemalt — das ArtPack hat EINE Ansicht
     *   je Art. Eine erfundene Rueckseite waere eine zweite Zeichnung, die es
     *   nicht gibt; eine Spiegelung ist sichtbar dieselbe Figur.
     */
    function artMarkup(speciesId, side, size) {
      const raw = SPRITE_ART[speciesId];
      if (raw === undefined) return null;
      const key = `art:${speciesId}:${side}:${size}`;
      const cached = spriteCache.get(key);
      if (cached !== undefined) return cached;
      const end = raw.indexOf('>') + 1;
      const head = raw.slice(0, end).replace(' width="512" height="512"', ` width="${size}" height="${size}"`);
      const body = raw.slice(end, raw.lastIndexOf('</svg>'));
      const tag = head.replace('<svg ', `<svg class="__cm_sprite __cm_art" data-species="${speciesId}" data-side="${side}" aria-hidden="true" focusable="false" `);
      const mirrored = side === 'back' ? `<g transform="scale(-1 1) translate(-${ART_VIEW} 0)">${body}</g>` : body;
      const markup = `${tag}${mirrored}</svg>`;
      spriteCache.set(key, markup);
      return markup;
    }

    const GRID_PALETTE = { K: '#0B0F14', V: '#A855F7', P: '#7C3AED', I: '#6366F1', W: '#E0E7FF' };
    /** Die Kantenlaenge, auf die jede Kunstdatei gemalt ist (Generator: `ART_VIEW`). */
    const ART_VIEW = 512;
    /**
     * Welches Gitter eine Art wirklich benutzt — die Aufloesung in einer
     * Stelle, damit sie pruefbar ist.
     *
     * Die Reihenfolge ist eine Zusage: eigenes Sprite, dann das Sprite der
     * FAMILIE, dann der Notfall. Vorher sprang der Notfall direkt auf die
     * ERSTE Art der Liste — jede Art ohne eigenes Sprite sah aus wie
     * NullPointer, gleichgueltig ob sie zu einem anderen Elementkreis
     * gehoert. Die Familie ist die naechstliegende Aussage, die das Bild
     * ueberhaupt noch tragen kann.
     */
    function resolveGridKey(speciesId, side) {
      const familyId = speciesOfFamily((SPECIES[speciesId] ?? {}).family);
      const own = `${speciesId}-${side}`;
      if (SPRITE_GRIDS[own] !== undefined) return own;
      const family = `${familyId}-${side}`;
      if (SPRITE_GRIDS[family] !== undefined) return family;
      const first = `${SPECIES_IDS[0]}-${side}`;
      if (SPRITE_GRIDS[first] !== undefined) return first;
      return `${SPECIES_IDS[0]}-front`;
    }
    /**
     * Das Sprite einer Spezies: die Kunst, wenn es sie gibt, sonst das
     * eingebettete 32x32-Gitter (`SPRITE_GRIDS`, Quelle `assets/sprites/*.grid`).
     * Ein `<rect>` je horizontalem Lauf — dieselbe Verdichtung wie der
     * Generator. Die Palette ist hier als Literal wiederholt (Bundle ohne
     * Import, siehe Abschnitt 1); Quelle: `scripts/assets/build-sprites.mjs`
     * (PALETTE).
     *
     * Der Gitter-Zweig ist kein toter Code: er ist der dokumentierte Rueckfall
     * fuer eine Art ohne Kunstdatei (und fuer die drei Familiengitter, die die
     * 16-px-Marke traegt).
     */
    function speciesSprite(speciesId, side, size) {
      const art = artMarkup(speciesId, side, size);
      if (art !== null) return art;
      const key = `grid:${speciesId}:${side}:${size}`;
      const cached = spriteCache.get(key);
      if (cached !== undefined) return cached;
      const grid = SPRITE_GRIDS[resolveGridKey(speciesId, side)];
      const rows = grid.split('\n');
      let pixels = '';
      for (let y = 0; y < rows.length; y += 1) {
        const row = rows[y];
        let x = 0;
        while (x < row.length) {
          const ch = row[x];
          if (ch === '.' || GRID_PALETTE[ch] === undefined) { x += 1; continue; }
          let end = x + 1;
          while (end < row.length && row[end] === ch) end += 1;
          pixels += `<rect x="${x}" y="${y}" width="${end - x}" height="1" fill="${GRID_PALETTE[ch]}"/>`;
          x = end;
        }
      }
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" width="${size}" height="${size}" `
        + `shape-rendering="crispEdges" class="__cm_sprite" data-species="${speciesId}" data-side="${side}">${pixels}</svg>`;
      spriteCache.set(key, svg);
      return svg;
    }
    /** Das UI-SVG als Bild (`ball`, `spiral`, Schritt-Symbole aus UI_SVG). */
    function uiSvg(name, size) {
      const raw = UI_SVG[name] ?? UI_SVG.ball;
      return raw.replace('<svg ', `<svg width="${size}" height="${size}" `);
    }

    // ── Das Pet als Marke ───────────────────────────────────────────────────
    function PetMark({ size = 24 }) {
      const s = useStore();
      const lvl = levelFor(s.xp);
      return h('span', {
        className: '__cm_mark',
        title: `${s.name} · ${SPECIES[s.species].label} · Level ${lvl} · ${formOf(lvl).label}`,
        dangerouslySetInnerHTML: { __html: speciesGlyph(s.species, lvl, size) },
      });
    }

    function CodingmonIcon() {
      const s = useStore();
      return h('span', {
        className: '__cm_mark',
        dangerouslySetInnerHTML: { __html: speciesGlyph(s.species, levelFor(s.xp), 18) },
      });
    }

    /** Ein Balken. `tone` faerbt ihn (xp | hp | enemy). */
    function Bar({ value, max, tone }) {
      const pct = max <= 0 ? 0 : Math.max(0, Math.min(100, Math.round((value / max) * 100)));
      return h('div', { className: '__cm_bar', 'data-tone': tone ?? 'xp' },
        h('div', { className: '__cm_bar-fill', style: { width: `${pct}%` } }));
    }

    // ── GLOBALE EXP-LEISTE ──────────────────────────────────────────────────
    /**
     * Die EXP-Leiste steht im Composer-Dock und damit in JEDER Sitzung, nicht
     * nur im Panel: Level, Fortschritt zum naechsten Level, HP. Sie liest
     * denselben Store wie das Panel — eine Quelle, zwei Ansichten.
     */
    function ExpBar() {
      const s = useStore();
      const lvl = levelFor(s.xp);
      const next = threshold(lvl + 1);
      const prev = threshold(lvl);
      const pct = Math.max(0, Math.min(100, Math.round(((s.xp - prev) / Math.max(1, next - prev)) * 100)));
      // Idle-Wander: der Sprite laeuft HIN UND HER, wenn kein Kampf laeuft und
      // keine Sperre steht (also wirklich idle). Bei Kampf/Sperre steht er.
      // `data-state` traegt den vollen Praesentationszustand; `data-wander`
      // bleibt die Traegerbit fuer die Wander-Animation (idle an, sonst aus).
      const state = presentationState(s);
      // Das Hoechst-HP kommt aus DERSELBEN Fachfunktion wie im Panel — also mit
      // Zuchtboni. Vorher stand hier die Basisleiter, waehrend der Kampf und
      // das Panel die effektiven Werte rechneten: drei Ansichten, zwei Zahlen.
      const maximum = BigInt(stats().hp);
      return h('div', {
        className: '__cm_expbar',
        title: `${s.name} · ${SPECIES[s.species].label} · Level ${lvl} · ${s.wins} Siege`,
        'data-plugin': PLUGIN,
      },
        h('span', {
          className: '__cm_expbar-wander',
          'data-wander': state === 'idle' ? 'on' : 'off',
          'data-state': state,
          'aria-hidden': 'true',
        }, h('span', { className: '__cm_expbar-pet', dangerouslySetInnerHTML: { __html: speciesGlyph(s.species, lvl, 18) } })),
        h('span', { className: '__cm_expbar-lvl' }, `LV ${lvl}`),
        h('span', { className: '__cm_expbar-track' },
          h('span', { className: '__cm_expbar-fill', style: { width: `${pct}%` } })),
        h('span', { className: '__cm_expbar-meta' },
          // Hoechst-HP aus der effektiven Leiter (mit Zuchtboni): sonst stuende
          // hier ab Stufe ~120 die Exponentialschreibweise einer Zahl, die es so
          // nicht gibt — und der Balken zeigte eine andere Zahl als der Kampf.
          `${formatNumber(s.xp)} XP · HP ${formatNumber(Math.max(0, s.hp))}/${formatNumber(maximum)} · ${s.wins} Siege · Beute ${s.loot.shiny} shiny`),
      );
    }

