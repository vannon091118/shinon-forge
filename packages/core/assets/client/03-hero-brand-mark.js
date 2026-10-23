    /** Hero-Marke vor der Headline der leeren Session. */
    function HeroBrandMark({ size, className }) {
      // KEIN Background hier: ui-conversation rendert diesen Slot INNEN in die
      // 34px-Hitbox der Hero-Zeile (HeroShell, `fishHitbox`). Ein absolut
      // positioniertes Bild deckte darin nur die Hitbox und nicht das Fenster —
      // das war der Grund, warum der Hintergrund unsichtbar war. Er liegt
      // jetzt in `shell.overlay` (siehe apply()).
      return h(ForgeSigil, { size: size ?? 48, className });
    }

    /**
     * Die Statuszeile aus dem ECHTEN Zustand des Hosts.
     *
     * Kein erfundener Satz und kein Platzhalter: was hier steht, steht auch im
     * Zustand. Fehlt er, sagt die Zeile genau das — statt eine Stimmung zu
     * behaupten, die niemand gemeldet hat.
     */
    /** Der erste Satz eines Klang-Textes — die Leiste ist eine Zeile, kein Absatz. */
    function voiceLabel(value) {
      if (typeof value !== 'string') return '';
      const first = value.split(/[.\u2014\n]/)[0].trim();
      return first.length > 42 ? `${first.slice(0, 41)}\u2026` : first;
    }

    function bannerStatus(state) {
      if (state === null || typeof state !== 'object') return 'Noch kein Zustand gemeldet'; if (state.contract !== 'shinon.persona-ui/v1') return 'Unbekanntes Persona-Format';
      const parts = [];
      const tone = state.tone;
      if (tone !== null && tone !== undefined && typeof tone.stance === 'string') parts.push(`Haltung: ${tone.stance}`);
      // Der Klang des Zustands, nicht sein Enum: der Host schickt den Vertragstext.
      const mood = state.state?.mood;
      const voice = voiceLabel(state.voice);
      if (voice !== '') parts.push(`Stimme: ${voice}`);
      else if (typeof mood === 'string' && mood !== '') parts.push(`Stimmung: ${mood}`);
      const intent = state.intent;
      if (intent !== null && intent !== undefined && typeof intent.classification === 'string') {
        const pattern = typeof intent.pattern === 'string' && intent.pattern !== '' ? `/${intent.pattern}` : '';
        parts.push(`Auftrag: ${intent.classification}${pattern}`);
        // Das Intent-Gedächtnis: wie oft welche Klasse schon da war — gezählt,
        // nicht geschätzt. Ohne einen Lauf im Gedächtnis fällt der Teil weg.
        const memory = intent.memory;
        if (memory !== null && typeof memory === 'object' && typeof memory.runs === 'number' && memory.runs > 0) {
          parts.push(`Gelernt: ${memory.runs} Läufe, ${memory.patterns ?? 0} Patterns`);
        }
      }
      if (typeof state.userMood === 'string' && state.userMood !== '') parts.push(`Du: ${state.userMood}`);
      const self = state.self;
      if (self !== null && self !== undefined && typeof self.runs === 'number' && self.runs > 0) {
        parts.push(`${self.accepted}/${self.runs} angenommen`);
        if (Array.isArray(self.limits) && self.limits.length > 0) parts.push(`Grenze: ${self.limits[0].reason} ${self.limits[0].count}×`);
        if (Array.isArray(self.questions) && self.questions.length > 0) parts.push(`offen: ${self.questions[0].question}`);
      }
      return parts.length === 0 ? 'Zustand ohne Belege' : parts.slice(0, 5).join(' · ');
    }

    /**
     * Hinweisbanner über dem Composer — Zustand statt Platzhalter.
     *
     * Die Naht ist ein LITERAL auf beiden Seiten (ein Client-Bundle kann kein
     * Host-File importieren): `__shinonPersonaState` steht beim Laden der Seite
     * im Fenster (webserver/index-inject) und wird danach live über
     * `/shinon/persona/state` nachgeschoben. Geprueft als Zwilling in
     * `scripts/lib/repo.mjs`.
     */
    function InfoBanner() {
      // Der Name steht als LITERAL da (Zwilling zum Host) — Klammerzugriff, damit
      // genau das Literal im Bundle steht und nicht nur ein Eigenschaftspfad.
      const globalName = '__shinonPersonaState';
      const [state, setState] = React.useState(() => window[globalName] ?? null);
      React.useEffect(() => {
        // Ab dem Laden schiebt die Host-Route jede Aenderung nach; ein leerer
        // Stand bleibt leer, statt eine Stimmung zu erfinden.
        setState(window[globalName] ?? null);
        if (typeof window.EventSource !== 'function') return undefined;
        const source = new window.EventSource('/shinon/persona/state');
        const onSnapshot = (event) => {
          try {
            setState(JSON.parse(event.data));
          } catch {
            /* unlesbar: der letzte belegte Stand bleibt stehen */
          }
        };
        source.addEventListener('message', onSnapshot);
        return () => source.close();
      }, []);
      return h('div', { className: 'shinon-banner' },
        h('span', { className: 'shinon-banner__name' }, 'SHINON'),
        h('span', { className: 'shinon-banner__status' }, bannerStatus(state))
      );
    }

    /** Animiertes Background-Branding: Persona + Schleier + Scanlines. */
    function BackgroundBranding() {
      return h('div', { className: 'shinon-bg', 'aria-hidden': 'true' },
        h('img', {
          className: 'shinon-bg__persona',
          src: PERSONA_SRC,
          alt: '',
          draggable: 'false',
          decoding: 'async'
        }),
        h('div', { className: 'shinon-bg__veil' }),
        h('div', { className: 'shinon-bg__scan' })
      );
    }

    return {
      inject: ['slots'],
      apply(ctx) {
        // Sichtbarkeit: diese Client-Haelfte meldet sich in der gemeinsamen Liste von @shinon/dashboard an (Konvention, kein Import) — kein Hintergrundprozess ohne Zeile in der UI.
        const registry = (window.__shinonPlugins ??= new Map());
        registry.set('@shinon/core', { label: 'Core (Marke)', kind: 'client', panel: null });
        window.dispatchEvent(new CustomEvent('shinon:plugin', { detail: { id: '@shinon/core' } }));

        // Single-Slots: je genau ein Besetzer. Sidebar-Marke und -Name hängen
        // zusammen (verschwinden gemeinsam, wenn die Sidebar-Deklaration fällt).
        ctx.slots.inject('sidebar.brand.mark', () => ctx.slots.inject('sidebar.brand.name', function* () {
          yield ctx.slots.register({ name: 'sidebar.brand.mark' }, SidebarBrandMark);
          yield ctx.slots.register({ name: 'sidebar.brand.name' }, SidebarBrandName);
        }));
        ctx.slots.inject('conversation.hero.brand.mark', () =>
          ctx.slots.register({ name: 'conversation.hero.brand.mark' }, HeroBrandMark));
        ctx.slots.inject('conversation.composer.dock', () => ctx.slots.register({
          name: 'conversation.composer.dock',
          id: 'shinon-info-banner',
          order: 10
        }, InfoBanner));
        // ── Background-Branding: eigener Eintrag im frame-weiten Overlay ──
        // `shell.overlay` ist der dokumentierte Platz dafuer (client-ui-layout:
        // "Frame-wide floating layer, above every column and outside their
        // scroll containers ... The layer itself is click-through"); er wird
        // als `.overlayLayer` mit `position:absolute; inset:0; z-index:20;
        // pointer-events:none` gerendert. Frueher hing das Bild am Hero-Slot —
        // dort deckte es nur die 34px-Hitbox und verschwand ausserhalb der
        // leeren Session (Beleg in docs/ZAHLEN.md §2.1).
        // `conversation.hero.workspace` bleibt tabu: single-occupant und im
        // Besitz des WorkspacePickers.
        ctx.slots.inject('shell.overlay', () => ctx.slots.register({
          name: 'shell.overlay',
          id: 'shinon-background',
          order: 0
        }, BackgroundBranding));
      }
    };
