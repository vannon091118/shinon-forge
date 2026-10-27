/**
 * @shinon/diff-overview — Client-Hälfte: die Änderungs-Übersicht im Datei-Browser.
 *
 * Ein Knopf in der Kopfzeile des Datei-Browsers (`sidebar.right.tab.files.actions`)
 * zeigt im Ruhezustand NUR die Zahlen („+128 −43 · 7 Dateien"); ein Klick öffnet
 * eine scrollbare Liste der geänderten Dateien, ein Klick auf eine Datei ihre
 * Hunks im selben Fenster. Übersicht oben, Details auf Klick — die Abnahme aus
 * dem Feedback.
 *
 * DER CLIENT RECHNET NICHTS: keinen Diff, keine Zeilenzahl, keine Wurzel. Was
 * hier steht, hat `git` geliefert und der Host geformt (`/shinon/diff`,
 * `/shinon/diff/file?path=…`); fehlt die Route, sagt das Panel das. Die Marken
 * (`+`, `−`, `·`, `M`, `?`) tragen `data-mark` und `aria-label`, damit die
 * Bedeutung nicht an der Farbe hängt. `window.__shinonDiffOverview` ist die
 * Fläche für den echten Browser und den Gate-Test.
 */
window.__ModuleLoader__.load({
  id: '@shinon/diff-overview',
  factory(require) {
    const React = require('react');
    const h = React.createElement;
    const PLUGIN = '@shinon/diff-overview';
    const SLOT = 'sidebar.right.tab.files.actions';
    const PANEL_ID = 'shinon-diff-overview';
    const ENDPOINT = '/shinon/diff';
    const CONTRACT = 'shinon.diff/overview-v1';
    const FILE_CONTRACT = 'shinon.diff/file-v1';

    const style = document.createElement('style');
    style.dataset.plugin = PLUGIN;
    style.dataset.pluginCss = `${PLUGIN}/diff-overview.css`;
    style.textContent = `
      .shinon-diff__chip { display: inline-flex; align-items: center; gap: 5px; padding: 2px 7px; border-radius: 5px; font: 11px/1.5 ui-monospace, monospace; cursor: pointer; background: transparent; color: inherit; border: 1px solid var(--dsw-alias-border-l1, rgba(255,255,255,.14)); }
      .shinon-diff__chip:hover { border-color: var(--dsw-alias-label-secondary, #aaa); }
      .shinon-diff__add { color: #22c55e; } .shinon-diff__rem { color: #ef4444; }
      .shinon-diff__muted, .shinon-diff__note { color: var(--dsw-alias-label-secondary, rgba(255,255,255,.55)); }
      .shinon-diff__panel { position: fixed; z-index: 60; top: 64px; right: 16px; width: 420px; max-height: 70vh; display: grid; grid-template-rows: auto 1fr; gap: 6px; padding: 10px; border-radius: 8px; border: 1px solid var(--dsw-alias-border-l1, rgba(255,255,255,.14)); background: var(--dsw-alias-bg-layer-2, #1b1b1b); color: var(--dsw-alias-label-primary, #eee); font: 12px/1.45 ui-sans-serif, system-ui, sans-serif; box-shadow: 0 10px 30px rgba(0,0,0,.4); }
      .shinon-diff__panel[hidden] { display: none; }
      .shinon-diff__head { display: flex; align-items: baseline; gap: 8px; flex-wrap: wrap; }
      .shinon-diff__title { font-weight: 700; }
      .shinon-diff__root { font-size: 11px; word-break: break-all; color: var(--dsw-alias-label-secondary, rgba(255,255,255,.55)); }
      .shinon-diff__close, .shinon-diff__back { background: none; border: 0; color: inherit; cursor: pointer; font: inherit; opacity: .75; }
      .shinon-diff__close { margin-left: auto; }
      .shinon-diff__scroll { overflow: auto; max-height: 52vh; border-top: 1px solid rgba(255,255,255,.08); }
      .shinon-diff__row { display: grid; grid-template-columns: 18px 1fr auto; gap: 8px; align-items: baseline; width: 100%; padding: 3px 4px; text-align: left; cursor: pointer; background: none; color: inherit; font: inherit; border: 0; border-bottom: 1px solid rgba(255,255,255,.05); }
      .shinon-diff__row:hover { background: rgba(255,255,255,.05); }
      .shinon-diff__path { word-break: break-all; }
      .shinon-diff__note { grid-column: 2 / -1; font-size: 11px; }
      .shinon-diff__mark { font: 700 11px/1 ui-monospace, monospace; text-align: center; opacity: .9; }
      .shinon-diff__hunkhead { font: 11px/1.4 ui-monospace, monospace; opacity: .6; }
      .shinon-diff__line { display: grid; grid-template-columns: 14px 1fr; gap: 6px; font: 11px/1.45 ui-monospace, monospace; white-space: pre-wrap; word-break: break-all; }
      .shinon-diff__line[data-mark="+"] { color: #86efac; } .shinon-diff__line[data-mark="-"] { color: #fca5a5; }
      .shinon-diff__line[data-mark=" "] { color: var(--dsw-alias-label-secondary, rgba(255,255,255,.6)); }
    `;
    document.head.appendChild(style);

    /** Zuletzt geladene Übersicht, Fehlertext und das offene Panel. */
    let overview = null;
    let failure = '';
    let panel = null;
    let scroll = null;
    /** Ein Element mit Klasse und Text — mehr braucht das Panel nicht. */
    function el(tag, className, text) {
      const node = document.createElement(tag);
      if (className !== '') node.className = className;
      if (text !== undefined) node.textContent = text;
      return node;
    }
    /** Die Marke eines Eintrags: Zeichen, `data-mark`, lesbarer Name. */
    function marked(mark, label, className = 'shinon-diff__mark') {
      const node = el('span', className, mark);
      node.dataset.mark = mark;
      node.setAttribute('aria-label', label);
      return node;
    }
    /** Eine Antwort nur annehmen, wenn sie diesen Vertrag trägt. */
    const isDocument = (data, contract) => data !== null && typeof data === 'object' && data.contract === contract;

    async function fetchJson(url) {
      const response = await fetch(url, { headers: { accept: 'application/json' } });
      if (response.ok !== true) return { failure: `Host antwortet ${response.status}` };
      return { data: await response.json() };
    }

    /** Einen Knoten leeren: Text weg UND Kinder weg (der Test-DOM trennt beides). */
    function empty(node) {
      node.textContent = '';
      if (Array.isArray(node.children)) node.children.length = 0;
    }
    /** Die Übersicht holen und das offene Panel nachziehen. */
    async function load() {
      const result = await fetchJson(ENDPOINT);
      if (result.data !== undefined && isDocument(result.data, CONTRACT)) {
        overview = result.data;
        failure = '';
      } else {
        overview = null;
        failure = result.failure ?? 'Antwort ist keine Diff-Übersicht';
      }
      paint();
      return overview;
    }

    /** Der Kopf: Titel, Summen mit ihren Marken, Wurzel, Schließen. */
    function head() {
      const wrap = el('div', 'shinon-diff__head');
      wrap.appendChild(el('span', 'shinon-diff__title', 'Änderungen'));
      const totals = overview?.totals;
      if (totals !== undefined) {
        wrap.appendChild(marked('+', 'hinzugefügte Zeilen', 'shinon-diff__add'));
        wrap.appendChild(el('span', 'shinon-diff__add', String(totals.added)));
        wrap.appendChild(marked('−', 'entfernte Zeilen', 'shinon-diff__rem'));
        wrap.appendChild(el('span', 'shinon-diff__rem', String(totals.removed)));
        wrap.appendChild(el('span', 'shinon-diff__muted', `${totals.files} Dateien`));
      }
      const close = el('button', 'shinon-diff__close', 'schließen');
      close.type = 'button';
      close.addEventListener('click', hide);
      wrap.appendChild(close);      wrap.appendChild(el('span', 'shinon-diff__root', overview?.root ?? ''));
      return wrap;
    }
    /** Warum es nichts zu zeigen gibt — als Satz, nicht als leere Liste. */
    function reasonText() {
      if (failure !== '') return failure;
      const reason = overview?.reason;
      return { KEIN_GIT: 'Kein Git-Baum an dieser Wurzel — es gibt nichts zu vergleichen.',
        KEIN_HEAD: 'Der Baum hat noch keinen Commit (HEAD fehlt) — unversioniert ist kein Diff.',
        NICHT_LESBAR: `Git antwortet nicht lesbar: ${overview?.detail ?? 'ohne Grund'}` }[reason] ?? '';
    }
    /** Den Scrollbereich füllen; das Panel bleibt stehen. */
    function fill(content) {
      if (scroll === null) return;
      empty(scroll);
      scroll.appendChild(content);
      scroll.scrollTop = 0;
    }
    /** Die Liste der geänderten Dateien (der Zustand nach dem Klick). */
    function paint() {
      if (panel === null) return;
      empty(panel);
      panel.appendChild(head());
      scroll = el('div', 'shinon-diff__scroll');
      panel.appendChild(scroll);
      const reason = reasonText();
      if (reason !== '') { fill(el('div', 'shinon-diff__note', reason)); return; }
      const files = overview?.files ?? [];
      if (files.length === 0) { fill(el('div', 'shinon-diff__note', 'Arbeitsbaum ist sauber — keine Änderung gegen HEAD.')); return; }
      const list = el('div', 'shinon-diff__list');
      for (const file of files) {
        const row = el('button', 'shinon-diff__row');
        row.type = 'button';
        row.dataset.path = file.path;
        row.appendChild(marked(file.status, file.mark));
        row.appendChild(el('span', 'shinon-diff__path', file.path));
        row.appendChild(el('span', file.counted ? 'shinon-diff__muted' : 'shinon-diff__note',
          file.counted ? `+${file.added} −${file.removed}` : (file.status === '?' ? 'neu' : '—')));
        if (file.note !== '') row.appendChild(el('span', 'shinon-diff__note', file.note));
        row.addEventListener('click', () => { void openFile(file.path); });
        list.appendChild(row);
      }
      fill(list);
      const truncated = overview?.truncated;
      if (truncated != null) panel.appendChild(el('div', 'shinon-diff__note', `Grenze ${truncated.reason}: ${truncated.ist} vorhanden, ${truncated.soll} gezeigt.`));
    }

    /** Eine Datei öffnen: Hunks holen und zeigen. */
    async function openFile(path) {
      const result = await fetchJson(`${ENDPOINT}/file?path=${encodeURIComponent(path)}`);
      if (result.data === undefined || !isDocument(result.data, FILE_CONTRACT)) {
        fill(el('div', 'shinon-diff__note', result.failure ?? 'Antwort ist kein Datei-Diff'));
        return;
      }
      const data = result.data;
      const wrap = el('div');
      const back = el('button', 'shinon-diff__back', '← zurück zur Liste');
      back.type = 'button';
      back.addEventListener('click', paint);
      wrap.appendChild(back);
      const why = {
        NEU: 'Unversioniert — Git hat keinen Vergleich gegen HEAD.', BINAER: 'Binärdatei — keine Zeilen zum Lesen.',
        NICHT_IM_BAUM: 'Pfad liegt nicht im Baum.', KEIN_UNTERSCHIED: 'Keine Unterschiedszeilen.',
      }[data.reason];
      if (why !== undefined) wrap.appendChild(el('div', 'shinon-diff__note', why));
      for (const hunk of data.hunks ?? []) {
        const block = el('div', 'shinon-diff__hunk');
        block.appendChild(el('div', 'shinon-diff__hunkhead', hunk.header));
        for (const row of hunk.rows) {
          const line = el('div', 'shinon-diff__line');
          line.dataset.mark = row.mark;
          line.appendChild(marked(row.mark, row.label));
          line.appendChild(el('span', '', row.text));
          block.appendChild(line);
        }
        wrap.appendChild(block);
      }
      const truncated = data.truncated;
      if (truncated != null) wrap.appendChild(el('div', 'shinon-diff__note', `Grenze ${truncated.reason}: ${truncated.ist} vorhanden, ${truncated.soll} gezeigt.`));
      if (data.clipped > 0) wrap.appendChild(el('div', 'shinon-diff__note', `${data.clipped} Zeilen sind sichtbar gekürzt (…).`));
      fill(wrap);
    }
    /** Das Panel schließen. Der Chip bleibt, wo er war. */
    function hide() {
      if (panel !== null) { panel.hidden = true; panel.remove?.(); }
      panel = null;
      scroll = null;
    }
    /** Öffnen — und beim zweiten Klick schließen. */
    async function open() {
      if (panel !== null) { hide(); return; }
      panel = el('div', 'shinon-diff__panel');
      panel.setAttribute('role', 'dialog');
      panel.setAttribute('aria-label', 'Änderungen im Arbeitsbaum');
      document.body.appendChild(panel);
      paint();
      await load();
    }      document.addEventListener('keydown', (event) => { if (event.key === 'Escape') hide(); });
    /** Der Knopf in der Kopfzeile: Zahlen im Ruhezustand, Klick öffnet. */
    function Chip() {
      const [state, setState] = React.useState(overview);
      React.useEffect(() => {
        let alive = true;
        void load().then((data) => { if (alive) setState(data); });
        return () => { alive = false; };
      }, []);
      const totals = state?.totals;
      // Der KNOPF ist React, das PANEL ist DOM: hier müssen React-Elemente stehen.
      // Ein per `createElement` gebauter Span als Kind wirft "Objects are not valid as a React child" (gemessen 2026-10-22).
      const mark = (glyph, label, className) => h('span', { className, 'data-mark': glyph, 'aria-label': label }, glyph);
      const num = (value, className) => h('span', { className }, String(value));
      const props = { type: 'button', className: 'shinon-diff__chip', title: 'Änderungen gegen HEAD', onClick: () => { void open(); } };
      if (totals === undefined) return h('button', props, mark('·', 'noch nicht gemessen', 'shinon-diff__mark'), h('span', { className: 'shinon-diff__muted' }, 'Diff'));
      // Die Punkte trennen die drei Zahlen: ohne sie liest sich `−306` + `42`
      // als `−30642` — und eine falsche Zahl ist schlimmer als keine.
      return h('button', props,
        mark('+', 'hinzugefügte Zeilen', 'shinon-diff__add'), num(totals.added, 'shinon-diff__add'),
        mark('−', 'entfernte Zeilen', 'shinon-diff__rem'), num(totals.removed, 'shinon-diff__rem'),
        h('span', { className: 'shinon-diff__muted' }, `· ${totals.files}`));
    }

    window.__shinonDiffOverview = { open, close: hide, load, state: () => ({ overview, failure }) };

    return {
      inject: ['slots'],
      apply(ctx) {
        const registry = (window.__shinonPlugins ??= new Map());
        registry.set(PLUGIN, { label: 'Änderungen', kind: 'client', panel: PANEL_ID });
        window.dispatchEvent(new CustomEvent('shinon:plugin', { detail: { id: PLUGIN } }));
        ctx.slots.inject(SLOT, () => ctx.slots.register({ name: SLOT, id: PANEL_ID, order: 30 }, Chip));
      },
    };
  },
});
