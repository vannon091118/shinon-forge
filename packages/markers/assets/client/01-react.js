    const React = require('react');
    const h = React.createElement;
    const PLUGIN = '@shinon/markers';
    const PANEL_ID = 'shinon-markers';

    // ── Vertragswerte (Spiegel; gleiche Vorlage wie der Host) ────────────────
    const LINE = '- **{id}**  › {label}  ·  {x},{y} {w}×{h}{comment}\n  Selector: {selector}';
    const COMMENT = '  —  {text}';
    const MKEY = '__mk.marks';
    const CKEY = '__mk.comments';
    const INBOX = 'http://127.0.0.1:9333/inbox';
    const TEXT_LIMIT = 200;
    const COMMENT_LIMIT = 500;
    const MARK_LIMIT = 200;
    const SELECTOR_MAX_PARTS = 6;

    // ── Wirksame Grenzen (Vertragsgabe oder Profil) ──────────────────────────
    // Der Host legt seine WIRKSAMEN Grenzen beim Ausliefern in die Seite (Naht
    // `webserver/index-inject`, siehe packages/markers/index.js); hier werden sie
    // gelesen statt geraten. Der Name steht als LITERAL, weil dieses Bundle
    // selbstaendig ist und `index.js` nicht importieren kann — scripts/gate/tests/
    // markers.test.mjs vergleicht beide Seiten Zeichen fuer Zeichen.
    const LIMITS_GLOBAL = '__DSH_MARKERS_CONFIG__';
    /** Der Vertragsname, den ein Datensatz tragen muss (fremde Daten gelten nicht). */
    const MODEL_CONTRACT = 'shinon.marker-mirror/v1';
    const hostLimits = (() => {
      const raw = typeof window === 'object' ? window[LIMITS_GLOBAL] : null;
      const record = raw !== null && typeof raw === 'object' ? raw : null;
      // Ein Datensatz aus einem FREMDEN Vertrag wird ganz verworfen: Zahlen ohne
      // passenden Vertragsnamen sind keine Grenzen dieses Spiegels.
      const named = record !== null && record.contract === MODEL_CONTRACT
        && record.limits !== null && typeof record.limits === 'object';
      const pick = (value, fallback) => (Number.isFinite(value) && value > 0 ? value : fallback);
      const host = named ? record.limits : {};
      const limits = {
        text: pick(host.text, TEXT_LIMIT),
        marks: pick(host.marks, MARK_LIMIT),
        comment: pick(host.comment, COMMENT_LIMIT),
        from: named ? 'host' : 'vertrag',
      };
      console.log(
        `[shinon-markers] Grenzen aus ${limits.from === 'host' ? LIMITS_GLOBAL : 'dem Vertrag (Rueckfall)'}` +
          ` — text=${limits.text}/marks=${limits.marks}/comment=${limits.comment}` +
          (raw === null || raw === undefined ? ' (die Seite traegt keinen Datensatz)' : ''),
      );
      return limits;
    })();

    // ── Spiegel-Bild ────────────────────────────────────────────────────────
    function insertStyles(tag, css) {
      if (document.querySelector(`style[data-plugin-css="${tag}"]`) !== null) return;
      const style = document.createElement('style');
      style.dataset.plugin = PLUGIN;
      style.dataset.pluginCss = tag;
      style.textContent = css;
      document.head.appendChild(style);
    }

    insertStyles(`${PLUGIN}/marker.css`, `
      .__mk_root { position: fixed; inset: 0; pointer-events: none; z-index: 2147483646; }
      .__mk_box { position: fixed; display: none; border: 2px solid #ff3d7f; background: rgba(255,61,127,.14); border-radius: 6px; }
      .__mk_focus { position: fixed; display: none; border: 2px solid #35d0d6; background: rgba(53,208,214,.18); border-radius: 6px; }
      .__mk_tip { position: fixed; display: none; background: #ff3d7f; color: #fff; font: 12px/1.5 ui-monospace, monospace; padding: 2px 6px; border-radius: 4px; max-width: 420px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .__mk_toast { position: fixed; left: 50%; top: 18px; transform: translateX(-50%); display: none; background: #111; border: 1px solid #ff3d7f; color: #ffb3cd; font: 12px/1.6 ui-monospace, monospace; padding: 8px 14px; border-radius: 8px; z-index: 2147483647; }
      .__mk_on { cursor: crosshair; }

      .__mk_panel { display: flex; flex-direction: column; height: 100%; overflow: hidden; background: var(--dsw-alias-bg-base); color: var(--dsw-alias-label-primary); }
      .__mk_head { display: flex; align-items: center; justify-content: space-between; gap: 8px; padding: 12px 14px; border-bottom: 1px solid var(--dsw-alias-border-l1); font-weight: 700; letter-spacing: .06em; font-size: 12px; color: var(--dsw-alias-label-primary); }
      .__mk_hint { padding: 8px 14px; font: 12px/1.6 ui-monospace, monospace; color: var(--dsw-alias-label-secondary); }
      .__mk_list { flex: 1; overflow: auto; padding: 4px 0; }
      .__mk_row { padding: 8px 14px; border-bottom: 1px solid var(--dsw-alias-border-l1); font: 12px/1.5 ui-monospace, monospace; }
      .__mk_row:hover { background: var(--dsw-alias-bg-layer-1); }
      .__mk_row_bad { border-left: 2px solid #ff3d7f; }
      .__mk_row_head { display: flex; justify-content: space-between; gap: 8px; cursor: pointer; }
      .__mk_id { color: #ff3d7f; font-weight: 700; }
      .__mk_sel { color: var(--dsw-alias-label-secondary); word-break: break-all; margin-top: 2px; }
      .__mk_text { color: var(--dsw-alias-label-tertiary, var(--dsw-alias-label-secondary)); margin-top: 2px; }
      .__mk_comment { width: 100%; margin-top: 6px; padding: 4px 6px; border-radius: 6px; border: 1px solid var(--dsw-alias-border-l1); background: var(--dsw-alias-bg-layer-1); color: var(--dsw-alias-label-primary); font: 12px/1.5 ui-monospace, monospace; }
      .__mk_empty { padding: 20px 14px; color: var(--dsw-alias-label-secondary); font-size: 12px; }
      .__mk_foot { display: flex; gap: 6px; flex-wrap: wrap; padding: 10px 14px; border-top: 1px solid var(--dsw-alias-border-l1); }
      .__mk_btn { cursor: pointer; border: 1px solid var(--dsw-alias-border-l1); background: var(--dsw-alias-bg-layer-1); color: var(--dsw-alias-label-primary); border-radius: 6px; padding: 5px 9px; font: 11px/1.4 ui-monospace, monospace; }
      .__mk_btn:hover { border-color: #ff3d7f; color: #ffb3cd; }
    `);

    // ── Speicher (Browserseite; dieselben Schlüssel wie Brutalord) ───────────
    const readJson = (key, fallback) => {
      try {
        const raw = window.localStorage.getItem(key);
        const value = raw === null ? fallback : JSON.parse(raw);
        return value === null ? fallback : value;
      } catch {
        return fallback;
      }
    };
    const writeJson = (key, value) => {
      try {
        window.localStorage.setItem(key, JSON.stringify(value));
      } catch {
        /* Speicher voll oder gesperrt — der Spiegel verliert die Marke, nicht die Sitzung. */
      }
    };
    const readMarks = () => {
      const marks = readJson(MKEY, []);
      return Array.isArray(marks) ? marks : [];
    };
    const readComments = () => {
      const comments = readJson(CKEY, {});
      return comments !== null && typeof comments === 'object' ? comments : {};
    };

    const listeners = new Set();
    const notify = () => {
      for (const listener of listeners) listener();
    };
    const subscribe = (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    };
    const saveMarks = (marks) => {
      writeJson(MKEY, marks);
      notify();
    };
    const saveComments = (comments) => {
      writeJson(CKEY, comments);
      notify();
    };

    // ── Ableitung (identisch zu marker-core.js) ─────────────────────────────
    const esc = (value) => (window.CSS && CSS.escape ? CSS.escape(value) : String(value).replace(/[^a-zA-Z0-9_-]/g, ''));

    const labelOf = (el) => {
      let label = el.tagName.toLowerCase();
      if (el.id) label += '#' + el.id;
      const classes = typeof el.className === 'string' ? el.className.trim().split(/\s+/).slice(0, 2) : [];
      for (const name of classes) if (!name.startsWith('__mk')) label += '.' + name;
      return label;
    };

    const selectorOf = (el) => {
      if (el.id) return '#' + esc(el.id);
      const parts = [];
      let node = el;
      while (node && node.nodeType === 1 && parts.length < SELECTOR_MAX_PARTS) {
        if (node.id) {
          parts.unshift('#' + esc(node.id));
          break;
        }
        let part = node.tagName.toLowerCase();
        const classes = [...node.classList].filter((name) => !name.startsWith('__mk')).slice(0, 2);
        if (classes.length) part += '.' + classes.map(esc).join('.');
        const parent = node.parentElement;
        if (parent) {
          const siblings = [...parent.children].filter((child) => child.tagName === node.tagName);
          if (siblings.length > 1) part += ':nth-of-type(' + (siblings.indexOf(node) + 1) + ')';
        }
        parts.unshift(part);
        node = node.parentElement;
      }
      return parts.join(' > ');
    };

    const rectOf = (el) => {
      const rect = el.getBoundingClientRect();
      return { x: Math.round(rect.x), y: Math.round(rect.y), w: Math.round(rect.width), h: Math.round(rect.height) };
    };

    const textOf = (el) => (el.innerText || el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, hostLimits.text);

    const resolve = (selector) => {
      try {
        return document.querySelector(selector);
      } catch {
        return null;
      }
    };

    const nextId = (marks) => {
      const highest = marks.reduce((max, mark) => {
        const number = Number(String(mark.id ?? '').slice(1));
        return Number.isFinite(number) && number > max ? number : max;
      }, 0);
      return 'm' + (highest + 1);
    };

    // ── Nutzlast (Brutalords Format, aus dem Vertrag) ───────────────────────
    const fill = (template, values) =>
      String(template).replace(/\{(\w+)\}/g, (_match, key) => (values[key] === undefined ? '' : String(values[key])));

