// Client dock: branch, diff, Persona, Prompter und gemeldete Plugins.
window.__ModuleLoader__.load({
  id: '@shinon/widget-dock',
  factory(require) {
    const React = require('react');
    const h = React.createElement;
    const PLUGIN = '@shinon/widget-dock';
    const PANEL_ID = 'shinon-widget-dock';
    const ON_KEY = 'shinon-widget-dock:aktiv';
    const REVIEW_GLOBAL = '__shinonPersonaReview';
    const TRACE_GLOBAL = '__shinonPrompterTrace';
    const REGISTRY_GLOBAL = '__shinonPlugins';

    const SHARED = (window.__shinonWidgetDock ??= { timer: null, drag: null, listening: false });
    const style = document.getElementById('shinon-widget-dock-style') ?? document.createElement('style');
    style.id = 'shinon-widget-dock-style';
    style.dataset.plugin = PLUGIN;
    style.dataset.pluginCss = `${PLUGIN}/widget-dock.css`;
    style.textContent = `
      .shinon-widgets { position: fixed; top: 80px; right: 16px; z-index: 9999; display: grid; gap: 4px; padding: 8px 10px; width: 200px; box-sizing: border-box; background: rgba(20,20,20,.92); color: #eee; border-radius: 8px; font: 11px/1.45 ui-sans-serif, system-ui, sans-serif; }
      .shinon-widgets__head { font-size: 10px; letter-spacing: .08em; text-transform: uppercase; color: var(--dsw-alias-label-secondary, rgba(255,255,255,.55)); white-space: nowrap; overflow: hidden; text-overflow: clip; }
      .shinon-widgets__row { display: flex; align-items: baseline; gap: 8px; justify-content: space-between; min-width: 0; overflow: hidden; }
      .shinon-widgets__k { color: var(--dsw-alias-label-secondary, rgba(255,255,255,.6)); white-space: nowrap; overflow: hidden; min-width: 0; }
      .shinon-widgets__v { font: 11px/1.45 ui-monospace, monospace; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; min-width: 0; }
      .shinon-widgets__v[data-state="leer"] { color: #f59e0b; }
      .shinon-widgets__switch { display: flex; align-items: center; gap: 6px; cursor: pointer; user-select: none; color: #eee; }
      .shinon-widgets__switch input { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); }
      .shinon-widgets__switch:focus-within { outline: 2px solid #60a5fa; outline-offset: 3px; border-radius: 3px; }
      .shinon-widgets__lamp { width: 10px; height: 10px; border-radius: 50%; flex: none; background: #6b7280; }
      .shinon-widgets__switch[data-state="an"] .shinon-widgets__lamp { background: #22c55e; box-shadow: 0 0 6px #22c55e; }
      .shinon-widgets__switch[data-state="aus"] .shinon-widgets__lamp { background: #6b7280; }
      .shinon-widgets__switch[data-state="ohne-quelle"] .shinon-widgets__lamp { background: #f59e0b; }
      @media (max-width: 720px) { .shinon-widgets { top: auto; bottom: 88px; right: 8px; width: min(200px, calc(100vw - 16px)); } }
    `;
    if (!style.isConnected) document.head.appendChild(style);
    function row(key, label, value, title, state = 'ok') {
      const node = document.createElement('div');
      node.className = 'shinon-widgets__row';
      node.dataset.key = key;
      node.title = title;
      const k = document.createElement('span');
      k.className = 'shinon-widgets__k';
      k.textContent = label;
      const v = document.createElement('span');
      v.className = 'shinon-widgets__v';
      v.dataset.state = state;
      v.textContent = value;
      node.append(k, v);
      return node;
    }

    function personaRow() {
      const doc = window[REVIEW_GLOBAL];
      if (doc === undefined || doc === null || doc.contract !== 'shinon.persona-review/v1') {
        return row('persona', 'Auflagen', '—', 'Kein Prüf-Stand gemeldet (Host nicht erreichbar?)', 'leer');
      }
      const proposals = Array.isArray(doc.proposals) ? doc.proposals : [];
      const open = proposals.filter((proposal) => proposal.status === 'proposed').length;
      const decided = proposals.length - open;
      const commitments = Array.isArray(doc.commitments) ? doc.commitments.length : 0;
      return row('persona', 'Auflagen', `${open} offen`, `${commitments} Auflage(n), ${decided} entschieden`);
    }

    function prompterRow() {
      const trace = window[TRACE_GLOBAL];
      if (!Array.isArray(trace) || trace.length === 0) {
        return row('prompter', 'Prompter', '—', 'Noch kein Turn beobachtet', 'leer');
      }
      const last = trace[0]?.outcome ?? 'unbekannt';
      return row('prompter', 'Prompter', `${trace.length} · ${last}`, `${trace.length} beobachtete Läufe, zuletzt ${last}`);
    }

    let diffDoc = null;
    let diffFailure = '';
    async function loadDiff() {
      try {
        const response = await fetch('/shinon/diff', { headers: { accept: 'application/json' } });
        if (response.ok !== true) { diffDoc = null; diffFailure = `Host antwortet ${response.status}`; }
        else {
          const data = await response.json();
          if (data !== null && typeof data === 'object' && data.contract === 'shinon.diff/overview-v1') {
            diffDoc = data;
            diffFailure = '';
          } else { diffDoc = null; diffFailure = 'Antwort ist keine Diff-Übersicht'; }
        }
      } catch (error) {
        diffDoc = null;
        diffFailure = `Diff nicht abrufbar: ${error?.message ?? 'Fehler'}`;
      }
      window.dispatchEvent(new CustomEvent('shinon:widget-dock-update'));
      renderRows();
    }

    function branchRow() {
      if (diffDoc === null) return row('branch', 'Branch', '—', diffFailure || 'Diff noch nicht gemeldet', 'leer');
      const name = diffDoc.branch ?? 'losgelöst';
      return row('branch', 'Branch', name, diffDoc.root ?? '', diffDoc.branch ? 'ok' : 'leer');
    }

    function diffRow() {
      if (diffDoc === null) return row('diff', 'Diff', '—', diffFailure || 'Diff noch nicht gemeldet', 'leer');
      const totals = diffDoc.totals ?? { added: 0, removed: 0, files: 0 };
      const reason = diffDoc.reason ? ` (${diffDoc.reason})` : '';
      return row('diff', 'Diff', `+${totals.added} −${totals.removed} · ${totals.files}${reason}`, `${totals.files} geänderte Dateien gegen HEAD`, diffDoc.reason ? 'leer' : 'ok');
    }

    function pluginsRow() {
      const map = window[REGISTRY_GLOBAL];
      if (!(map instanceof Map) || map.size === 0) {
        return row('plugins', 'Plugins', '—', 'Keine Anmeldung im Plugin-Register', 'leer');
      }
      const names = [...map.keys()].map((id) => id.replace('@shinon/', ''));
      return row('plugins', 'Plugins', String(map.size), names.join(', '));
    }

    function isActive() {
      try { return window.localStorage.getItem(ON_KEY) === '1'; } catch { return false; }
    }

    function setActive(on) {
      try { window.localStorage.setItem(ON_KEY, on ? '1' : '0'); } catch { /* ohne Speicher bleibt es sitzungsweise */ }
      toggleWidget(on);
    }

    function findWidget() {
      return document.getElementById(PANEL_ID);
    }
    const DIFF_REFRESH_MS = 5000;
    function startRefresh() {
      if (SHARED.timer !== null) return;
      SHARED.timer = setInterval(() => { void loadDiff(); }, DIFF_REFRESH_MS);
    }
    function stopRefresh() {
      if (SHARED.timer === null) return;
      clearInterval(SHARED.timer);
      SHARED.timer = null;
    }

    function toggleWidget(on) {
      const widget = findWidget();
      if (!on) {
        stopRefresh();
        if (widget) widget.style.display = 'none';
        return;
      }
      startRefresh();
      if (widget) {
        widget.style.display = 'grid';
        renderRows();
        void loadDiff();
        return;
      }
      const created = document.createElement('div');
      created.id = PANEL_ID;
      created.className = 'shinon-widgets';
      created.setAttribute('role', 'region');
      created.setAttribute('aria-label', 'Shinon Arbeitsstand');
      const grip = document.createElement('span');
      grip.className = 'shinon-widgets__head';
      grip.textContent = 'Shinon (ziehen)';
      grip.style.cursor = 'move';
      created.appendChild(grip);
      grip.addEventListener('pointerdown', (event) => {
        SHARED.drag = { x: event.clientX - created.offsetLeft, y: event.clientY - created.offsetTop };
      });
      if (!SHARED.listening) {
        SHARED.listening = true;
        window.addEventListener('pointermove', (event) => {
          const current = findWidget();
          if (!SHARED.drag || !current) return;
          current.style.left = `${Math.max(0, event.clientX - SHARED.drag.x)}px`;
          current.style.top = `${Math.max(0, event.clientY - SHARED.drag.y)}px`;
          current.style.right = 'auto';
        });
        window.addEventListener('pointerup', () => { SHARED.drag = null; });
      }
      window.addEventListener('shinon:plugin', renderRows);
      document.body.appendChild(created);
      renderRows();
      void loadDiff();
    }

    function renderRows() {
      const widget = findWidget();
      if (!widget) return;
      widget.querySelectorAll('.shinon-widgets__row').forEach((node) => node.remove());
      const rows = [branchRow(), diffRow(), personaRow(), prompterRow(), pluginsRow()];
      for (const node of rows) widget.appendChild(node);
    }

    function hasSource() {
      const review = window[REVIEW_GLOBAL];
      const trace = window[TRACE_GLOBAL];
      const reviewOk = review && review.contract === 'shinon.persona-review/v1';
      const traceOk = Array.isArray(trace) && trace.length > 0;
      return Boolean(diffDoc !== null || reviewOk || traceOk);
    }

    function WidgetIcon() {
      return h('svg', { viewBox: '0 0 16 16', width: 16, height: 16, 'aria-hidden': true },
        h('rect', { x: 1.5, y: 1.5, width: 5, height: 5, rx: 1, fill: 'none', stroke: 'currentColor', strokeWidth: 1.4 }),
        h('rect', { x: 9.5, y: 1.5, width: 5, height: 5, rx: 1, fill: 'none', stroke: 'currentColor', strokeWidth: 1.4 }),
        h('rect', { x: 1.5, y: 9.5, width: 13, height: 5, rx: 1, fill: 'none', stroke: 'currentColor', strokeWidth: 1.4 })
      );
    }

    function WidgetDock() {
      const [on, setOn] = React.useState(isActive());
      const [source, setSource] = React.useState(hasSource());
      React.useEffect(() => { toggleWidget(on); }, [on]);
      React.useEffect(() => {
        const update = () => setSource(hasSource());
        window.addEventListener('shinon:widget-dock-update', update);
        window.addEventListener('shinon:plugin', update);
        return () => {
          window.removeEventListener('shinon:widget-dock-update', update);
          window.removeEventListener('shinon:plugin', update);
        };
      }, []);
      const state = !on ? 'aus' : (source ? 'an' : 'ohne-quelle');
      const text = { aus: 'Widget aus', an: 'Widget an', 'ohne-quelle': 'Widget an · keine Quelle' }[state];
      const title = { aus: 'Widget ist ausgeschaltet', an: 'Widget ist eingeschaltet', 'ohne-quelle': 'Widget ist eingeschaltet, aber noch keine Daten von Persona oder Prompter' }[state];
      return h('label', { className: 'shinon-widgets__switch', 'data-state': state, title },
        h('input', {
          type: 'checkbox',
          checked: on,
          onChange: (event) => { setActive(event.target.checked); setOn(event.target.checked); },
        }),
        h('span', { className: 'shinon-widgets__lamp', 'aria-hidden': 'true' }),
        text);
    }

    return {
      inject: ['slots'],
      apply(ctx) {
        toggleWidget(isActive());
        const registry = (window.__shinonPlugins ??= new Map());
        registry.set(PLUGIN, { label: 'Shinon', kind: 'client', panel: PANEL_ID });
        window.dispatchEvent(new CustomEvent('shinon:plugin', { detail: { id: PLUGIN } }));
        ctx.slots.inject('main', () => ctx.slots.register({ name: 'main', key: PANEL_ID }, WidgetDock));
        ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({
          name: 'sidebar.panellist',
          id: PANEL_ID,
          order: 10,
          label: () => 'Shinon',
        }, WidgetIcon));
      },
    };
  },
});
