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

