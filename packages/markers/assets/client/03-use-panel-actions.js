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

