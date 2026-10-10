/**
 * shinon-markers — der Marker-Spiegel (Client-Hälfte).
 *
 * Spiegel des Element-Marker-Systems aus brutalord-the-feral-cycle
 * (tools/preview/marker-core.js + marker.js). Dort hängt ein CDP-Daemon den
 * Marker in ein fremdes Chrome-Fenster; hier ist der Marker ein DSH-Client-
 * Plugin und das Panel ist KEIN schwebendes div, sondern der native Side Panel:
 *
 *   ctx.slots.register({ name: 'main', key: 'shinon-markers' }, MarkerPanel)
 *   ctx.slots.register({ name: 'sidebar.panellist', id: 'shinon-markers', … }, MarkerIcon)
 *
 * Gespiegelte Regeln (identisch zum Vertrag in assets/marker-model.json):
 *   - Marke: id, label, selector, text, rect, href, url, ts
 *   - Ausschnitt-Label: tag#id.class (höchstens zwei Klassen)
 *   - Selektor: stabiler Pfad, höchstens 6 Stufen, :nth-of-type bei Geschwistern
 *   - Nutzlast: Brutalords Zeilenformat (`payload.line`)
 *   - Speicher: localStorage __mk.marks / __mk.comments (Browserseite)
 *   - Taste `m` schaltet den Modus, Escape verlässt ihn
 *
 * Nicht gespiegelt: CDP-Verbindung, Chrome-Daemon, Injektion in fremde Seiten.
 * Self-contained: kein top-level `import`, React kommt aus `require`.
 */
window.__ModuleLoader__.load({
  id: '@shinon/markers',
  factory(require) {
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

    const payloadOf = (marks, comments) =>
      marks
        .map((mark) => {
          const comment = String(comments[mark.id] ?? '').trim();
          const rect = mark.rect ?? {};
          return fill(LINE, {
            id: mark.id,
            label: mark.label,
            x: rect.x,
            y: rect.y,
            w: rect.w,
            h: rect.h,
            comment: comment === '' ? '' : fill(COMMENT, { text: comment }),
            selector: mark.selector,
          });
        })
        .join('\n');

    // ── Overlay (schwebend, wie im Original) ────────────────────────────────

    /** Ein leeres div mit einer Klasse — der eine Baustein des Overlays. */
    const nodeWith = (className) => {
      const node = document.createElement('div');
      node.className = className;
      return node;
    };

    /**
     * Die Overlay-Knoten AUFBAUEN: ein Wurzelknoten mit vier Kindern, am Körper
     * des Dokuments. Hier wird nur erzeugt — verdrahtet wird daraus in
     * createOverlay(). Ein Zustandswechsel muss deshalb nicht durch den Aufbau.
     */
    function mountOverlayNodes() {
      const root = nodeWith('__mk_root');
      const nodes = {
        box: nodeWith('__mk_box'),
        focus: nodeWith('__mk_focus'),
        tip: nodeWith('__mk_tip'),
        toast: nodeWith('__mk_toast'),
      };
      root.append(nodes.box, nodes.focus, nodes.tip, nodes.toast);
      (document.body ?? document.documentElement).appendChild(root);
      return nodes;
    }

    /** Einen Knoten auf ein Rect legen; `null` heißt verbergen (dieselbe Regel für alle vier). */
    function place(node, rect) {
      if (rect === null) {
        node.style.display = 'none';
        return;
      }
      node.style.display = 'block';
      node.style.left = rect.x + 'px';
      node.style.top = rect.y + 'px';
      node.style.width = rect.w + 'px';
      node.style.height = rect.h + 'px';
    }

    /** Den Hinweis ueber dem Rahmen setzen — eigener Platz, eigene Hoehe (22 px darueber). */
    function placeTip(tip, rect, label) {
      if (rect === null) {
        tip.style.display = 'none';
        return;
      }
      tip.textContent = label;
      tip.style.display = 'block';
      tip.style.left = rect.x + 'px';
      tip.style.top = Math.max(0, rect.y - 22) + 'px';
    }

    /**
     * Das Overlay verdrahten: Aufbau plus die drei Aktionen (Rahmen, Fokus,
     * Meldung). Die Meldung haengt an einem Timer und ist die einzige Stelle mit
     * Zustand — der Rest ist zustandsloses Platzieren.
     */
    function createOverlay() {
      const { box, focus, tip, toast } = mountOverlayNodes();
      let toastTimer = 0;

      const say = (text) => {
        toast.textContent = text;
        toast.style.display = 'block';
        clearTimeout(toastTimer);
        toastTimer = setTimeout(() => {
          toast.style.display = 'none';
        }, 3200);
      };

      return {
        box: (rect, label) => {
          place(box, rect);
          placeTip(tip, rect, label);
        },
        focus: (rect) => place(focus, rect),
        say,
      };
    }

    // ── Panel (React, im nativen Side Panel) ────────────────────────────────
    const useMirror = () => {
      const [, tick] = React.useState(0);
      React.useEffect(() => subscribe(() => tick((value) => value + 1)), []);
      return { marks: readMarks(), comments: readComments() };
    };

    function MarkerIcon() {
      return h('svg', { viewBox: '0 0 16 16', width: 16, height: 16, 'aria-hidden': true },
        h('rect', { x: 1.5, y: 2.5, width: 13, height: 11, rx: 2, fill: 'none', stroke: 'currentColor', strokeWidth: 1.4 }),
        h('circle', { cx: 5.5, cy: 6.5, r: 1.2, fill: 'currentColor' }),
        h('path', { d: 'M4 11.5h8', stroke: 'currentColor', strokeWidth: 1.4, strokeLinecap: 'round' })
      );
    }

    function MarkerButton({ text, onClick }) {
      return h('button', { type: 'button', className: '__mk_btn', onClick }, text);
    }

    /** Kopfzeile: wie viele Marken, und wer das Panel stellt. */
    function MarkerHead({ count }) {
      return h('div', { className: '__mk_head' },
        null,
        h('span', null, 'MARKS ' + count),
        h('span', { style: { color: 'var(--dsw-alias-label-secondary)', fontWeight: 400 } }, PLUGIN)
      );
    }

    /** Bedienhinweis: Taste, Ende und Kommentarzahl (Ein- und Mehrzahl). */
    function MarkerHint({ commented }) {
      return h('div', { className: '__mk_hint' },
        'm drücken, Element klicken · Escape beendet · ' + commented + ' Kommentar' + (commented === 1 ? '' : 'e'));
    }

    /**
     * EINE Zeile: Kennung und Ort in der Kopfzeile, darunter Selektor, Text und
     * Kommentarfeld. Hover und Klick zeigen dasselbe Element — die Zeile kennt
     * nur ihre drei Rueckrufe, nicht das Panel.
     */
    function MarkerRow({ mark, comment, onShow, onHide, onNote }) {
      return h('div', { className: '__mk_row' },
        h('div', {
          className: '__mk_row_head',
          onMouseEnter: onShow,
          onMouseLeave: onHide,
          onClick: onShow
        },
          h('span', null, h('span', { className: '__mk_id' }, mark.id), '  › ' + mark.label),
          h('span', { style: { color: 'var(--dsw-alias-label-secondary)' } },
            mark.rect.x + ',' + mark.rect.y + ' ' + mark.rect.w + '×' + mark.rect.h)
        ),
        h('div', { className: '__mk_sel' }, mark.selector),
        mark.text ? h('div', { className: '__mk_text' }, mark.text) : null,
        h('input', {
          className: '__mk_comment',
          placeholder: 'Kommentar zu ' + mark.id,
          value: comment ?? '',
          onChange: (event) => onNote(mark.id, event.target.value)
        })
      );
    }

    /** Die Liste. „keine Marke" ist ein eigener Zustand, kein Sonderfall in der Zeile. */
    function MarkerList({ marks, comments, onShow, onHide, onNote }) {
      if (marks.length === 0) {
        return h('div', { className: '__mk_empty' }, 'Noch keine Marke. Taste m im Fenster, dann ein Element anklicken.');
      }
      return h('div', { className: '__mk_list' }, marks.map((mark) =>
        h(MarkerRow, {
          key: mark.id,
          mark,
          comment: comments[mark.id] ?? '',
          onShow: () => onShow(mark.selector),
          onHide,
          onNote
        })
      ));
    }

    /** Die drei Aktionen des Panels. */
    function MarkerFoot({ busy, onSend, onCopy, onClear }) {
      return h('div', { className: '__mk_foot' },
        h(MarkerButton, { text: busy ? 'Sende …' : 'Senden → Chat', onClick: onSend }),
        h(MarkerButton, { text: 'Kopieren', onClick: onCopy }),
        h(MarkerButton, { text: 'Leeren', onClick: onClear })
      );
    }

    /**
     * Die WIRKUNGEN des Panels, getrennt vom Aufbau: kopieren, senden, leeren,
     * ein Element zeigen, einen Kommentar setzen. Sie sind Kinder desselben
     * Rumpfes und teilen `overlay` — nur das Markup liegt woanders.
     */
    function usePanelActions({ marks, payload, setBusy }) {
      const copy = () => {
        copyText(payload).then((copied) => overlay.say(copied ? 'Nutzlast kopiert — Strg+V im Chat' : 'Kopieren blockiert'));
      };

      const send = () => {
        if (marks.length === 0) {
          overlay.say('Nichts markiert — erst "m" drücken, dann klicken');
          return;
        }
        setBusy(true);
        copyText(payload).then((copied) =>
          fetch(INBOX, { method: 'POST', body: JSON.stringify({ text: payload, marks }) })
            .then((response) => overlay.say((copied ? 'Zwischenablage + Inbox' : 'Inbox') + (response.ok ? '' : ' (Inbox abgelehnt)')))
            .catch(() => overlay.say(copied ? 'Zwischenablage — Inbox nicht erreichbar' : 'Kopieren blockiert, Inbox nicht erreichbar'))
            .finally(() => setBusy(false)),
        );
      };

      const clear = () => {
        saveMarks([]);
        saveComments({});
        overlay.say('alle Marks entfernt');
      };

      const show = (selector) => {
        const el = resolve(selector);
        overlay.focus(el ? rectOf(el) : null);
      };

      const note = (id, value) => {
        const comments = readComments();
        if (value.trim() === '') delete comments[id];
        else comments[id] = value.slice(0, hostLimits.comment);
        saveComments(comments);
      };

      return { copy, send, clear, show, note };
    }

    /**
     * Das Panel selbst: Zustand und Aufbau, keine Wirkungen. Den Aufbau tragen
     * Kopf, Hinweis, Liste und Fuss, die Wirkungen usePanelActions — die
     * Aenderung einer Zeile muss nicht mehr durch den Rumpf des Panels.
     */
    function MarkerPanel() {
      const { marks, comments } = useMirror();
      const [busy, setBusy] = React.useState(false);

      const payload = payloadOf(marks, comments);
      const commented = Object.values(comments).filter((value) => String(value).trim() !== '').length;
      const { copy, send, clear, show, note } = usePanelActions({ marks, payload, setBusy });

      return h('div', { className: '__mk_panel' },
        h(MarkerHead, { count: marks.length }),
        h(MarkerHint, { commented }),
        h(MarkerList, { marks, comments, onShow: show, onHide: () => overlay.focus(null), onNote: note }),
        h(MarkerFoot, { busy, onSend: send, onCopy: copy, onClear: clear })
      );
    }

    // ── Zwischenablage ──────────────────────────────────────────────────────
    async function copyText(text) {
      try {
        await navigator.clipboard.writeText(text);
        return true;
      } catch {
        try {
          const area = document.createElement('textarea');
          area.value = text;
          area.style.cssText = 'position:fixed;left:-9999px';
          (document.body ?? document.documentElement).appendChild(area);
          area.select();
          const ok = document.execCommand('copy');
          area.remove();
          return ok;
        } catch {
          return false;
        }
      }
    }

    // ── Markier-Modus ───────────────────────────────────────────────────────
    const overlay = createOverlay();
    let mode = false;
    let hoverRect = null;
    let hoverLabel = '';

    const setMode = (on) => {
      mode = !!on;
      document.documentElement.classList.toggle('__mk_on', mode);
      if (!mode) overlay.box(null, '');
      notify();
      return mode;
    };

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

        // >>> shinon:dsh-idiom locale-fallback/menu — EINE Quelle: scripts/lib/plugin-idioms.mjs (generiert; schreiben: `npm run idioms`, prüfen: Gate + dsh-test)
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
        ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({
          name: 'sidebar.panellist',
          id: PANEL_ID,
          order: 30,
          label: () => t('menu.markers')
        }, MarkerIcon));
        console.log('[shinon-markers] Spiegel aktiv (m = markieren, Panel: ' + PANEL_ID + ')');
      }
    };
  }
});
