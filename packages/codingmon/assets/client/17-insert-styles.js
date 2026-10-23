    // ── Styles ──────────────────────────────────────────────────────────────
    function insertStyles(tag, css) {
      if (document.querySelector(`style[data-plugin-css="${tag}"]`) !== null) return;
      const style = document.createElement('style');
      style.dataset.plugin = PLUGIN;
      style.dataset.pluginCss = tag;
      style.textContent = css;
      document.head.appendChild(style);
    }

    insertStyles(`${PLUGIN}/codingmon.css`, `
      .__cm_mark { display: inline-flex; align-items: center; }
      .__cm_panel { padding: 14px; height: 100%; overflow: auto; color: var(--dsw-alias-label-primary, #E0E7FF);
        font-family: var(--shinon-font-body, ui-sans-serif, system-ui, sans-serif); }
      .__cm_panel-head { display: flex; gap: 14px; align-items: center; margin-bottom: 14px; }
      .__cm_panel-stage { display: flex; flex-direction: column; align-items: center; gap: 6px; }
      .__cm_panel-id { flex: 1; }
      .__cm_panel-id h2 { margin: 0; font-family: var(--shinon-font-head, ui-sans-serif); letter-spacing: .06em; }
      .__cm_sub { margin: 2px 0; font-size: 12px; color: var(--dsw-alias-label-secondary, #9aa); }
      .__cm_xp { margin: 6px 0 4px; font-size: 12px; }
      .__cm_pick { display: flex; align-items: center; gap: 6px; margin: 6px 0; font-size: 12px; }
      .__cm_pick select { flex: 1; background: rgba(255,255,255,.05); color: inherit; border-radius: 5px;
        border: 1px solid rgba(124,58,237,.45); padding: 3px 6px; font: inherit; }
      .__cm_bar { height: 6px; border-radius: 3px; background: rgba(255,255,255,.12); overflow: hidden; min-width: 120px; margin: 2px 0; }
      .__cm_bar-fill { height: 100%; background: var(--shinon-gradient, linear-gradient(115deg,#7C3AED,#6366F1)); transition: width .25s ease; }
      .__cm_bar[data-tone="hp"] .__cm_bar-fill { background: linear-gradient(90deg,#22c55e,#84cc16); }
      .__cm_bar[data-tone="enemy"] .__cm_bar-fill { background: linear-gradient(90deg,#ef4444,#f59e0b); }
      .__cm_btn, .__cm_move { font-size: 11px; padding: 4px 9px; border-radius: 5px; cursor: pointer;
        background: rgba(124,58,237,.18); color: inherit; border: 1px solid rgba(124,58,237,.45); }
      .__cm_btn:disabled, .__cm_move:disabled { opacity: .45; cursor: not-allowed; }
      .__cm_move { display: flex; flex-direction: column; align-items: flex-start; gap: 2px; min-width: 132px; }
      .__cm_stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(64px,1fr)); gap: 8px; margin-bottom: 14px; }
      .__cm_stat { display: flex; flex-direction: column; gap: 2px; padding: 6px 8px; border-radius: 6px;
        background: var(--dsw-alias-bg-layer-1, rgba(255,255,255,.04)); }
      .__cm_stat-k { font-size: 10px; letter-spacing: .1em; color: var(--dsw-alias-label-secondary, #9aa); }
      .__cm_stat-v { font-size: 15px; font-weight: 700; }
      .__cm_block { margin-bottom: 14px; }
      .__cm_block h3 { margin: 0 0 6px; font-size: 12px; letter-spacing: .08em; text-transform: uppercase;
        color: var(--dsw-alias-label-secondary, #9aa); }
      .__cm_breeding { border-top: 1px solid rgba(124,58,237,.25); padding-top: 12px; }
      .__cm_roster { display: grid; grid-template-columns: repeat(auto-fit,minmax(135px,1fr)); gap: 8px; margin: 8px 0 12px; }
      .__cm_roster-card { display: grid; grid-template-columns: 42px 1fr; grid-template-rows: auto auto auto; gap: 2px 7px; align-items: center; text-align: left; padding: 7px; color: inherit; background: rgba(255,255,255,.035); border: 1px solid rgba(124,58,237,.23); border-radius: 8px; cursor: pointer; min-width: 0; }
      .__cm_roster-card.is-active { border-color: var(--cm-spark, #57e8ff); box-shadow: inset 0 0 0 1px rgba(87,232,255,.25); }
      .__cm_roster-art { grid-row: 1 / span 3; display: block; width: 42px; height: 42px; }
      .__cm_roster-art svg { width: 42px !important; height: 42px !important; }
      .__cm_roster-label { font-size: 11px; font-weight: 700; overflow-wrap: anywhere; }
      .__cm_roster-meta, .__cm_roster-active { font-size: 10px; color: var(--dsw-alias-label-secondary, #9aa); }
      .__cm_roster-active { color: #57e8ff; letter-spacing: .08em; }
      .__cm_breed-form { display: grid; gap: 4px; padding: 8px; border: 1px solid rgba(124,58,237,.22); border-radius: 8px; }
      .__cm_breed-notice { margin: 4px 0 0; font-size: 12px; }
      .__cm_eggs { display: grid; gap: 8px; margin-top: 8px; }
      .__cm_egg { padding: 8px; border: 1px solid rgba(87,232,255,.25); border-radius: 8px; }
      .__cm_egg-heading { display: flex; flex-wrap: wrap; justify-content: space-between; gap: 6px; font-size: 12px; }
      @media (max-width: 420px) { .__cm_board { grid-template-columns: 1fr; } .__cm_vs { text-align: center; } }
      .__cm_board { display: grid; grid-template-columns: 1fr auto 1fr; gap: 10px; align-items: center;
        padding: 10px; border-radius: 8px; background: var(--dsw-alias-bg-layer-1, rgba(255,255,255,.04));
        border: 1px solid rgba(124,58,237,.25); }
      .__cm_side { display: flex; gap: 10px; align-items: center; }
      .__cm_side--enemy { flex-direction: row-reverse; text-align: right; }
      .__cm_side-id { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
      .__cm_side-id strong { font-size: 13px; }
      .__cm_vs { font-size: 11px; letter-spacing: .2em; color: var(--dsw-alias-label-secondary, #9aa); }
      .__cm_actions { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; margin-top: 10px; }
      .__cm_move-name { font-weight: 600; }
      .__cm_move-meta { font-size: 10px; color: var(--dsw-alias-label-secondary, #9aa); }
      .__cm_log { list-style: none; margin: 0; padding: 0; font-size: 12px; }
      .__cm_log li { padding: 2px 0; color: var(--dsw-alias-label-secondary, #9aa); }

      /* Encounter-Buehne (S5): eine Zeile Kopf, eine Schiene, ein Log. */
      .__cm_enc { display: flex; flex-direction: column; gap: 5px; width: 100%;
        padding: 6px 8px; margin-bottom: 6px; border-radius: 6px;
        background: color-mix(in srgb, var(--shinon-void, #0B0F14) 45%, transparent);
        border: 1px solid color-mix(in srgb, var(--shinon-violet, #7C3AED) 35%, transparent);
        font-family: var(--shinon-font-body, ui-sans-serif, system-ui, sans-serif); font-size: 11px; }
      .__cm_enc-head { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
      .__cm_enc-title { font-weight: 700; letter-spacing: .08em; text-transform: uppercase; font-size: 10px; }
      .__cm_enc-chip { padding: 1px 7px; border-radius: 999px; font-size: 10px; letter-spacing: .06em;
        text-transform: uppercase; border: 1px solid rgba(255,255,255,.18); color: var(--dsw-alias-label-secondary, #9aa); }
      .__cm_enc-chip[data-status="running"], .__cm_enc-chip[data-status="validating"] {
        color: #A855F7; border-color: rgba(168,85,247,.55); }
      .__cm_enc-chip[data-status="completed"], .__cm_enc-chip[data-status="compact"] {
        color: #22c55e; border-color: rgba(34,197,94,.55); }
      .__cm_enc-chip[data-status="aborted"], .__cm_enc-chip[data-status="rejected"],
      .__cm_enc-chip[data-status="recoverable-error"] { color: #f59e0b; border-color: rgba(245,158,11,.55); }
      .__cm_enc-meta { flex: 1; min-width: 120px; color: var(--dsw-alias-label-secondary, #9aa); }
      .__cm_enc-actions { display: flex; gap: 6px; }
      .__cm_enc-btn { font-size: 11px; padding: 3px 9px; border-radius: 5px; cursor: pointer;
        background: rgba(124,58,237,.18); color: inherit; border: 1px solid rgba(124,58,237,.45); }
      .__cm_enc-rail { display: flex; gap: 6px; list-style: none; margin: 0; padding: 0; }
      .__cm_enc-step { display: flex; align-items: center; gap: 4px; font-size: 10px;
        color: var(--dsw-alias-label-secondary, #9aa); }
      .__cm_enc-dot { width: 6px; height: 6px; border-radius: 50%; background: rgba(255,255,255,.2); }
      .__cm_enc-step[data-state="done"] { color: var(--dsw-alias-label-primary, #E0E7FF); }
      .__cm_enc-step[data-state="done"] .__cm_enc-dot { background: #7C3AED; }
      .__cm_enc-step[data-state="active"] { color: #A855F7; }
      .__cm_enc-step[data-state="active"] .__cm_enc-dot { background: #A855F7; box-shadow: 0 0 6px #A855F7; }
      .__cm_enc-log { margin: 0; font-size: 10px; color: var(--dsw-alias-label-secondary, #9aa);
        white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

      /* Pre-Flight-Deck (B04): sieben Angaben, schaltbare Bloecke, ein Fenster.
         Die Fensterleiste animiert NUR transform (Compositor-Regel). */
      .__cm_deck { display: flex; flex-direction: column; gap: 6px; padding: 7px 8px; border-radius: 6px;
        background: rgba(255,255,255,.03); border: 1px solid rgba(87,232,255,.28); }
      .__cm_deck[data-editable="off"] { border-color: rgba(255,255,255,.14); }
      .__cm_deck-head { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
      .__cm_deck-title { font-size: 10px; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; }
      .__cm_deck-note { flex: 1; min-width: 140px; font-size: 10px; color: var(--dsw-alias-label-secondary, #9aa); }
      .__cm_deck-window { display: inline-flex; align-items: center; gap: 6px; font-size: 10px; color: #57E8FF; }
      .__cm_deck-windowbar { display: block; width: 60px; height: 4px; border-radius: 2px; background: #57E8FF;
        transform-origin: left center; animation-name: __cm_enc_window; animation-timing-function: linear;
        animation-fill-mode: forwards; }
      @keyframes __cm_enc_window { from { transform: scaleX(1); } to { transform: scaleX(0); } }
      .__cm_deck-grid { display: grid; grid-template-columns: minmax(96px, auto) 1fr; gap: 3px 10px; margin: 0; font-size: 11px; }
      .__cm_deck-row { display: contents; }
      .__cm_deck-grid dt { color: var(--dsw-alias-label-secondary, #9aa); font-size: 10px; letter-spacing: .04em; }
      .__cm_deck-grid dd { margin: 0; overflow-wrap: anywhere; }
      .__cm_deck-missing { color: var(--dsw-alias-label-secondary, #9aa); font-style: italic; }
      .__cm_deck-blocks { display: flex; flex-wrap: wrap; gap: 6px 10px; align-items: center; font-size: 11px; }
      .__cm_deck-label { font-size: 10px; letter-spacing: .04em; color: var(--dsw-alias-label-secondary, #9aa); }
      .__cm_deck-block { display: inline-flex; align-items: center; gap: 4px; padding: 1px 6px; border-radius: 4px;
        border: 1px solid rgba(124,58,237,.35); font-size: 10px; }
      .__cm_deck-block[data-on="off"] { opacity: .55; text-decoration: line-through; }
      .__cm_deck-block[data-locked="on"] { cursor: not-allowed; }
      .__cm_deck-actions { display: flex; gap: 8px; align-items: center; }

      /* Globale EXP-Leiste im Composer-Dock: sichtbar in jeder Sitzung. */
      .__cm_expbar { display: flex; align-items: center; gap: 8px; width: 100%;
        padding: 4px 8px; margin-bottom: 6px; border-radius: 6px;
        background: color-mix(in srgb, var(--shinon-void, #0B0F14) 45%, transparent);
        border: 1px solid color-mix(in srgb, var(--shinon-violet, #7C3AED) 35%, transparent);
        font-family: var(--shinon-font-body, ui-sans-serif, system-ui, sans-serif); font-size: 11px; }
      .__cm_expbar-pet { display: inline-flex; }
      .__cm_expbar-lvl { font-weight: 700; letter-spacing: .08em; color: var(--shinon-violet-light, #A855F7); }
      .__cm_expbar-track { flex: 1; height: 7px; border-radius: 4px; overflow: hidden; background: rgba(255,255,255,.12); }
      .__cm_expbar-fill { display: block; height: 100%; background: var(--shinon-gradient, linear-gradient(115deg,#7C3AED,#6366F1)); transition: width .3s ease; }
      .__cm_expbar-meta { color: var(--dsw-alias-label-secondary, #9aa); white-space: nowrap; }
      /* Idle-Wander: das Pet laeuft im XP-Leisten-Block hin und her.
         NUR transform (Compositor-Regel, siehe animation.test.mjs) —
         kein left/top/margin im Keyframe. prefers-reduced-motion schaltet
         es ab. */
      .__cm_expbar-wander { position: relative; width: 72px; height: 28px; flex: none; overflow: hidden; }
      .__cm_expbar-wander svg { position: absolute; left: 4px; top: 4px; }
      .__cm_expbar-wander[data-wander="on"] svg {
        animation-name: __cm_wander; animation-duration: 7s;
        animation-timing-function: ease-in-out; animation-iteration-count: infinite;
        transform: translateX(0); }
      @keyframes __cm_wander {
        0%   { transform: translateX(0) scaleX(1); }
        42%  { transform: translateX(34px) scaleX(1); }
        50%  { transform: translateX(34px) scaleX(-1); }
        92%  { transform: translateX(0) scaleX(-1); }
        100% { transform: translateX(0) scaleX(1); } }
      /* Praesentationszustand: combat, action, victory, defeat und flee sind
         ABGELEITET (siehe presentationState) und aendern nichts an der
         Mechanik — die steht in finish(), nicht in einer Animation. Die
         Endzustaende sind ein Fenster von 1,6 Sekunden, kein Zustand.
         Nur transform und opacity (Compositor-Regel, siehe animation.test.mjs).
         Jede Regel traegt [data-state], damit der Schalter
         prefers-reduced-motion (siehe unten) mit GLEICHER Spezifitaet
         gewinnen kann — siehe animation.test.mjs. */
      .__cm_expbar-wander[data-state="combat"] svg {
        animation-name: __cm_ready; animation-duration: 1.6s;
        animation-timing-function: ease-in-out; animation-iteration-count: infinite; }
      @keyframes __cm_ready {
        0%, 100% { transform: scale(1); }
        50% { transform: scale(1.05); } }
      .__cm_expbar-wander[data-state="action"] svg {
        animation-name: __cm_lean; animation-duration: .5s; animation-timing-function: ease-in-out;
        animation-iteration-count: infinite; }
      @keyframes __cm_lean {
        0%, 100% { transform: translateX(0) scaleX(1); }
        50% { transform: translateX(3px) scaleX(1.04); } }
      .__cm_expbar-wander[data-state="victory"] svg {
        animation-name: __cm_victory; animation-duration: .6s; animation-timing-function: ease-out; }
      @keyframes __cm_victory {
        0% { transform: translateY(0) scale(1); }
        40% { transform: translateY(-5px) scale(1.12); }
        100% { transform: translateY(0) scale(1); } }
      .__cm_expbar-wander[data-state="defeat"] svg {
        animation-name: __cm_defeat; animation-duration: .6s; animation-timing-function: ease-in; }
      @keyframes __cm_defeat {
        0% { transform: translateY(0) scale(1); opacity: 1; }
        40% { transform: translateY(4px) scale(.94); opacity: .55; }
        100% { transform: translateY(0) scale(1); opacity: 1; } }
      .__cm_expbar-wander[data-state="flee"] svg {
        animation-name: __cm_flee; animation-duration: .5s; animation-timing-function: ease-in; }
      @keyframes __cm_flee {
        0% { transform: translateX(0); opacity: 1; }
        100% { transform: translateX(26px); opacity: 0; } }
      /* Die Sperre: Balken, Absagesatz, Zaehler der kalten Abweisungen. */
      .__cm_lock { display: flex; flex-direction: column; gap: 4px; padding: 8px 10px; margin-bottom: 10px;
        border-radius: 6px; background: rgba(239,68,68,.12); border: 1px solid rgba(239,68,68,.35); }
      .__cm_lock-text { font-size: 12px; font-weight: 600; color: #fca5a5; }
      .__cm_lock-track { height: 6px; border-radius: 3px; overflow: hidden; background: rgba(255,255,255,.14); }
      .__cm_lock-fill { display: block; height: 100%; width: 100%; transform: scaleX(0); transform-origin: left center;
        background: linear-gradient(90deg,#ef4444,#f59e0b); animation-name: __cm_lock-grow;
        animation-timing-function: linear; animation-fill-mode: forwards; }
      @keyframes __cm_lock-grow { from { transform: scaleX(0); } to { transform: scaleX(1); } }
      .__cm_facts { list-style: none; margin: 0 0 8px; padding: 0; font-size: 12px; }
      .__cm_facts li { padding: 2px 0; color: var(--dsw-alias-label-secondary, #9aa); }
      /* Dock: Ball, Wild und Kampf im Chat-Bereich (Gen-1). Alle Keyframes
         bewegen nur transform und opacity (Compositor-Regel, siehe
         animation.test.mjs) — kein margin/top/left im Keyframe. */
      .__cm_dock { display: flex; align-items: center; gap: 10px; width: 100%;
        padding: 6px 8px; margin-bottom: 6px; border-radius: 8px;
        background: #0B0F14; border: 1px solid rgba(168,85,247,.45);
        color: #E0E7FF;
        font-family: var(--shinon-font-body, ui-sans-serif, system-ui, sans-serif); font-size: 12px; }
      .__cm_fight { flex-direction: column; align-items: stretch; }
      .__cm_wild { display: flex; align-items: center; gap: 10px; background: none; border: none;
        color: inherit; font: inherit; cursor: pointer; padding: 0; text-align: left; }
      .__cm_ball { display: inline-flex; transform-origin: center;
        animation-name: __cm_throw; animation-duration: 1.1s; animation-timing-function: ease-in;
        animation-fill-mode: forwards; }
      @keyframes __cm_throw {
        0% { transform: translate(26px, -10px) rotate(-40deg); opacity: 0; }
        30% { transform: translate(12px, -4px) rotate(-12deg); opacity: 1; }
        70% { transform: translate(0, 2px) rotate(8deg); opacity: 1; }
        100% { transform: translate(0, 0) rotate(0); opacity: 0; } }
      .__cm_wild-sprite { display: inline-flex; opacity: 0;
        animation-name: __cm_wild-in; animation-duration: .4s; animation-timing-function: ease-out;
        animation-delay: 1s; animation-fill-mode: forwards; }
      @keyframes __cm_wild-in {
        from { opacity: 0; transform: scale(.6); }
        to { opacity: 1; transform: scale(1); } }
      .__cm_sprite { image-rendering: pixelated; }
      .__cm_art { image-rendering: auto; max-width: 100%; height: auto; }
      .__cm_hit { display: inline-flex; animation-name: __cm_hit; animation-duration: .45s; }
      @keyframes __cm_hit {
        0% { transform: translateX(0); opacity: 1; }
        25% { transform: translateX(-6px); opacity: .2; }
        50% { transform: translateX(5px); opacity: 1; }
        75% { transform: translateX(-3px); opacity: .4; }
        100% { transform: translateX(0); opacity: 1; } }
      .__cm_type { margin: 6px 0 0; padding: 6px 8px; border-radius: 6px; min-height: 2.2em;
        background: rgba(255,255,255,.05); border: 1px solid rgba(168,85,247,.35);
        font-size: 12px; color: #E0E7FF; }
      .__cm_cursor { color: #A855F7; animation-name: __cm_blink; animation-duration: 1s;
        animation-iteration-count: infinite; }
      @keyframes __cm_blink { 50% { opacity: 0; } }
      .__cm_result { display: flex; align-items: center; gap: 8px; padding: 4px 8px;
        font-size: 12px; color: #E0E7FF; }
      .__cm_milestones { margin: 6px 0 0; padding-left: 18px; font-size: 12px;
        color: var(--shinon-violet-light, #A855F7); }
      @media (prefers-reduced-motion: reduce) {
        .__cm_bar-fill, .__cm_expbar-fill { transition: none; }
        .__cm_lock-fill { animation: none; transform: scaleX(1); }
        .__cm_ball, .__cm_wild-sprite, .__cm_hit, .__cm_cursor,
        .__cm_expbar-wander svg { animation: none; }
        /* Gleiche Spezifitaet wie die Zustandsregeln oben — sonst gewinnt
           [data-state] (0,2,1) gegen diesen Schalter (0,1,1) und die
           reduzierte Bewegung laeuft trotzdem. */
        .__cm_expbar-wander[data-wander="on"] svg,
        .__cm_expbar-wander[data-state] svg { animation: none; }
        /* Das Eingriffsfenster verliert nur seine Bewegung, nicht seine Aussage:
           der Balken steht voll, der Text nennt weiter den Default. */
        .__cm_deck-windowbar { animation: none; transform: scaleX(1); }
        .__cm_ball { opacity: 0; }
        .__cm_wild-sprite { opacity: 1; }
      }
    `);

    // ── Seams ────────────────────────────────────────────────────────────────
    return {
      inject: ['slots'],
      /**
       * Fenster-API — die Stelle, an der eine andere Client-Haelfte oder eine
       * Probe den Zustand liest (dasselbe Muster wie window.__mk bei
       * @shinon/markers): der Client gibt unter `window.__codingmon` seinen
       * Zustand heraus, keine Marke.
       */
      apply(ctx) {
        // Sichtbarkeit: jede Client-Haelfte meldet sich in der gemeinsamen Liste
        // an, damit @shinon/dashboard sie zeigen kann. Kein Hintergrundprozess
        // ohne Zeile in der UI.
        const registry = (window.__shinonPlugins ??= new Map());
        registry.set(PLUGIN, { label: 'Codingmon', kind: 'client', panel: PANEL_ID });
        window.dispatchEvent(new CustomEvent('shinon:plugin', { detail: { id: PLUGIN } }));
        // Der Context des Client-Bundles: an ihm haengt (oder haengt nicht) der
        // Remote-Beitrag. Er wird nicht kopiert und nicht gehalten ueber den
        // Abbau hinaus — der Zustand des Spiegels ist der Zustand, nicht der Context.
        clientCtx = ctx;
        let remoteMount = 'offen'; // offen | laeuft | bereit
        const mountRemote = (holder) => { // holder traegt `remote`, der Wurzel-Context nicht
          const remote = holder?.get?.('remote');
          if (remoteMount !== 'offen' || typeof remote?.$mount !== 'function') return; // Dienstwechsel feuert erneut
          if (holder.get(`remote.${HOST_NAMESPACE}`) !== undefined) return void (remoteMount = 'bereit');
          remoteMount = 'laeuft';
          clientCtx = holder;
          const fail = (e) => { remoteMount = 'offen'; hostMirror = { ...hostMirror, reason: 'abgelehnt', error: e?.message ?? String(e) }; };
          try { Promise.resolve(remote.$mount(CONTRIBUTION)).then(() => { remoteMount = 'bereit'; }, fail); } catch (error) { fail(error); }
        };
        if (typeof ctx.inject === 'function') ctx.inject(['remote'], mountRemote);
        else mountRemote(ctx);

        window.__codingmon = {
          plugin: PLUGIN,
          state: () => ({ ...store, level: level(), stats: stats(), form: formOf(level()).label }),
          species: () => SPECIES_IDS.slice(),
          abilities: () => abilitiesFor(level(), store.species),
          arena: (round) => arenaFor(level(), round ?? store.round),
          start: () => startBattle(),
          use: (id) => useAbility(id),
          /** WEG b: lokale Trigger-Funktion — dieselbe Pruefung wie der Takt. */
          trigger: () => checkSpawn(),
          /** Ein Klick auf das Wilde: der Kampf oeffnet sich im Dock. */
          challenge: () => challengeWild(),
          /** Flucht vor dem Wilden / Rueckzug aus dem Kampf (J4). */
          flee: () => fleeWild(),
          fleeBattle: () => fleeBattle(),
          rest,
          pick: (id) => pickSpecies(id),
          selectCreature: (id) => selectCreature(id),
          /**
           * Welche Bildquelle eine Art benutzt: `art:<art>` wenn es eine eigene
           * Kunstdatei gibt, sonst der Schluessel des Gitters. Seit dem 2026-10-21
           * haben alle 50 Arten eine eigene Datei — der Rueckfall bleibt trotzdem
           * im Code, weil eine 51. Art ohne Bild sonst wieder auf einer fremden
           * Figur landen wuerde.
           */
          spriteFor: (id, side = 'front') => (SPRITE_ART[id] !== undefined ? `art:${id}` : resolveGridKey(id, side)),
          /** Die Gitter-Aufloesung allein (eigenes Gitter, sonst Familie, sonst Notfall). */
          spriteKey: (id, side = 'front') => resolveGridKey(id, side),
          /** Das fertige Markup — genau das, was die Arena einsetzt. */
          spriteMarkup: (id, side = 'front', size = 64) => speciesSprite(id, side, size),
          pair: (idA, idB, species) => pairCreatures(idA, idB, species),
          breeding: () => ({ ...store.breeding, creatures: store.breeding.creatures.map((creature) => ({ ...creature, bonuses: creature.bonuses.map((bonus) => ({ ...bonus })) })), eggs: store.breeding.eggs.map((egg) => ({ ...egg, parents: egg.parents.slice(), bonuses: egg.bonuses.map((bonus) => ({ ...bonus })) })) }),
          breedCandidates: (idA, idB) => breedingCandidates(store.breeding.creatures.find((creature) => creature.id === idA), store.breeding.creatures.find((creature) => creature.id === idB)),
          breedCandidateDetails: (a, b) => breedingCandidateDetails(a, b),
          addXp: (xp) => award(xp, `+${xp} XP (manuell)`),
          /** Die laufende Sperre (null = kein Zug). */
          lock: () => lockStatus(),
          /** Wie viele Eingaben die Sperre kalt abgewiesen hat. */
          rejections: () => store.rejections,
          /** Der Lebenslauf als Dezimaltext (BigInt ueberlebt JSON nicht). */
          damageTotal: () => store.damageTotal.toString(),
          milestones: () => store.milestones.slice(),
          /** Der Zustand der Uebergabe (Client -> Host): gespiegelt, abgelehnt, kein Kanal. */
          host: () => ({ ...hostMirror }),
          /** Die Uebergabe von Hand ausloesen — dieselbe Naht, die jeder Zug nimmt. */
          mirror: () => toHost(),
          /**
           * Die Encounter-Buehne, wie eine Probe sie faehrt: Zustand lesen,
           * Ereignisse schicken, den Uebungszug starten. `state()` gibt eine
           * KOPIE (JSON-Form), damit kein Aufrufer den Reducer-Zustand von
           * aussen veraendert — der einzige Weg hinein ist `feed`.
           */
          encounter: {
            contract: ENCOUNTER_CONTRACT,
            state: () => JSON.parse(JSON.stringify(encounter)),
            log: () => encounterLog.map((entry) => ({ ...entry })),
            events: () => ENCOUNTER_EVENT_TYPES.slice(),
            sourceMap: () => JSON.parse(JSON.stringify(ENCOUNTER_SOURCE_MAP)),
            feed: (event) => encounterFeed(event),
            start: () => encounterStart(),
            continue: () => encounterContinue(),
            toggleBlock: (id) => encounterToggleBlock(id),
            holding: () => encounterHolding,
            abort: () => encounterAbort(),
            reset: () => encounterReset(),
          },
          /** Das Regelwerk, wie das Panel es liest. */
          rulebook: () => ({
            elements: Object.keys(ELEMENTS),
            chart: ELEMENT_CHART,
            category: CATEGORY,
            synergy: SYNERGY,
            buffs: BUFFS,
            lineage: LINEAGE,
            pacing: { ...PACING, delayMs: roundDelayMs },
          }),
          /** Die Loot-Tabelle samt Quote und der reine Wurf. */
          loot: (creature = null) => ({ table: lootWeightsFor(creature).map((entry) => ({ ...entry, odds: lootOdds(entry, creature) })), total: lootWeightsFor(creature).reduce((sum, entry) => sum + entry.weight, 0), roll: (uniform) => rollLoot(uniform, creature) }),
          /**
           * Der Vertrag, wie ihn nur der Client nachrechnen kann — dieselben
           * Funktionen, die der Host exportiert. Eine Probe vergleicht beide
           * Seiten Zahl fuer Zahl, damit die Dopplung nicht auseinanderlaeuft.
           */
          contract: () => ({
            threshold: (level) => threshold(level),
            levelFor: (xp) => levelFor(xp),
            statsAt: (speciesId, level) => statsAt(speciesId, level),
            /** Dieselben Werte EXAKT, als Dezimaltext (JSON kennt kein BigInt). */
            statsAtExact: (speciesId, level) => Object.fromEntries(
              Object.entries(statsAtExact(speciesId, level)).map(([key, value]) => [key, value.toString()]),
            ),
            /** Die Decke der Leiter. */
            levelCap: () => LEVEL_CAP,
            rewardFor: (level) => rewardFor(level),
            arenaFor: (level, round) => arenaFor(level, round),
            abilitiesFor: (level, speciesId) => abilitiesFor(level, speciesId).map((ability) => ability.id),
            inherited: (speciesId) => inheritedAbilities(speciesId).slice(),
            chart: () => ELEMENT_CHART,
            ladder: (base, level) => powerAtExact(base, level).toString(),
            describeValue: (base, level) => {
              const value = describeValue(base, level);
              return { text: value.text, digits: value.digits, safe: value.safe };
            },
            rollLoot: (uniform, creature = null) => rollLoot(uniform, creature).id,
            breedCandidateDetails: (a, b) => breedingCandidateDetails(a, b),
            /** Der Wild-Spawn als reine Funktion (Spiegel von mechanik.js). */
            spawnFor: (done, level) => spawnFor(done, level),
            /** Die Typwirkung als Zeichen (Spiegel von mechanik.js). */
            effectiveness: (attacker, defender) => effectiveness(attacker, defender),
            resolveAttack: (abilityId, speciesId, defenderSpeciesId, level) => {
              const ability = ABILITIES.find((entry) => entry.id === abilityId) ?? ABILITIES[0];
              const own = statsAt(speciesId, level);
              const attacker = {
                element: SPECIES[speciesId].family,
                stats: own,
                hp: own.hp,
                maxHp: own.hp,
                inherited: inheritedAbilities(speciesId),
              };
              const defender = { element: SPECIES[defenderSpeciesId].family, stats: statsAt(defenderSpeciesId, level) };
              const result = resolveAttack(ability, attacker, defender);
              return { ...result, buff: result.buff.id };
            },
          }),
          reset: () => {
            for (const timer of timers.values()) window.clearTimeout(timer);
            timers.clear();
            store = freshState(store.species);
            persist();
            emit();
          },
        };

        // KEINE Marken-Slots mehr: `sidebar.brand.mark` und
        // `conversation.hero.brand.mark` sind Single-Slots und gehoeren @shinon/core,
        // das dort Shinons gezeichnetes Zeichen haelt. Zwei Besetzer auf einem
        // Single-Slot entscheidet die Ladeordnung — also besetzt hier genau einer.
        // Das Pet bleibt in seinen eigenen Flaechen (Panel, XP-Leiste, Arena);
        // eine Marke gibt dieser Client nach aussen nicht heraus.
        ctx.slots.inject('main', () => ctx.slots.register({ name: 'main', key: PANEL_ID }, CodingmonPanel));
        // >>> shinon:dsh-idiom locale-fallback/menu — EINE Quelle: scripts/lib/plugin-idioms.mjs (generiert; schreiben: `npm run idioms`, prüfen: Gate + dsh-test) params={"table":"MENU_DE","key":"menu.codingmon","label":"Codingmon"}
        // Menü-Label aus der Registry (Besitzer: @shinon/locale-de); ohne
        // Locale-Dienst gilt die deutsche Tabelle.
        const MENU_DE = { 'menu.codingmon': 'Codingmon' };
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
        ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({
          name: 'sidebar.panellist',
          id: PANEL_ID,
          order: 25,
          label: () => t('menu.codingmon'),
        }, CodingmonIcon));
        // Die globale EXP-Leiste: derselbe Store, andere Ansicht.
        ctx.slots.inject('conversation.composer.dock', () => ctx.slots.register({
          name: 'conversation.composer.dock',
          id: 'shinon-exp-bar',
          order: 20,
        }, ExpBar));
        // SLOT-ENTSCHEIDUNG (belegt vor Code): Ball, Wild und Kampf wohnen in
        // `conversation.composer.dock` (live sichtbar, geteilt mit der EXP-Leiste);
        // `conversation.chat.node` bleibt aus (shadows-shipped-ui).
        ctx.slots.inject('conversation.composer.dock', () => ctx.slots.register({
          name: 'conversation.composer.dock',
          id: 'shinon-wild-dock',
          order: 21,
        }, WildDock));
        // Die Encounter-Buehne (S5): Ereignisse rein, Zustand raus. Sie steht
        // im selben Dock wie Ball und EXP-Leiste, weil der Zustand dorthin
        // gehoert, wo gearbeitet wird — und nicht in ein eigenes Panel.
        ctx.slots.inject('conversation.composer.dock', () => ctx.slots.register({
          name: 'conversation.composer.dock',
          id: 'shinon-encounter-stage',
          order: 22,
        }, EncounterStage));
        ctx.slots.inject('conversation.chat.turnTail', () => ctx.slots.register({
          name: 'conversation.chat.turnTail',
          id: 'shinon-battle-result',
          order: 5,
        }, BattleResult));

        // Nur der Host kann erfolgreiche Completions bestaetigen; fehlende
        // Remote-Kopplung vergibt folgerichtig keine XP.
        const activityTimer = window.setInterval(readActivity, 2000);

        ctx.effect?.(() => () => {
          window.clearInterval(activityTimer);
          // Die Buehne raeumt ihre Timer mit: ein abgebautes Bundle darf keinen
          // Uebungszug weiterlaufen lassen, der in ein fremdes Panel malt.
          encounterStop();
          // Ein laufender Zug haengt an einem Timer, und der Abbau nimmt ihn mit.
          // Sonst feuerte `settle` in ein Bundle, das es nicht mehr gibt, und der
          // Zustand behauptete eine Sperre ohne Uhr — eine Wartezeit ohne Ende.
          for (const timer of timers.values()) window.clearTimeout(timer);
          timers.clear();
          if (store.lock !== null) {
            store.lock = null;
            persist();
          }
          // Der Context des Client-Bundles, an dem der Beitrag haengt, wird NICHT
          // abgeraeumt (er gehoert der Composition, nicht diesem Bundle) — aber
          // die Referenz darauf: ein abgebautes Bundle darf keinen Context halten.
          clientCtx = null;
          delete window.__codingmon;
        });

        console.log(`[shinon-codingmon] Arena aktiv — ${SPECIES_IDS.length} Codemons, Level ${level()}, ${abilitiesFor(level(), store.species).length} Faehigkeiten`);
      },
    };
