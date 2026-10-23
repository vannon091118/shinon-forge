    /**
     * @shinon/prompter — 03-enhance-control.js (Client-Teil)
     *
     * DER KNOPF NEBEN SENDEN (2026-10-23, Nutzerentscheidung): die Veredelung
     * soll auch SICHTBAR arbeiten können. Slot `conversation.input.right` ist
     * der gemessene Platz „direkt vor der Senden-Aktion" (Slots-Vertrag von
     * `dsh-client-ui-conversation`); es gibt keinen Slot IM Eingabefeld-Zeile
     * selbst, und das Lesen fremder DOM ist durch die UI-Regeln verboten.
     *
     * DER WEG ZUM HOST: zwei Kommandos, die der Prompter-Host registriert
     * (`ctx.commands.register`) — der Client ruft sie ueber die kompilierte
     * Remote-Liste, exakt wie die DSH-eigene Plan-Chip-Oberflaeche:
     *
     *   /veredeln <text>        veredelt und gibt den Text zurueck
     *   /veredeln-modus <wert>  schaltet diese Sitzung auto|manuell
     *
     * In `manuell` laeuft der Pre-Step NICHT mehr automatisch (Grund
     * `ENHANCE_MANUAL`) — der Knopf ist dann der einzige Veredler, und der
     * Mensch sieht jede Aenderung im Eingabefeld, bevor das Hauptmodell sie
     * bekommt. `Zurücksetzen` stellt den vorherigen Text wieder her.
     *
     * DER DRAFT-ZUGRIFF ist die eine Stelle, an der die DSH-Schicht Grenzen
     * setzt: der Input liegt im Conversation-Dienst (`ctx.get('conversation')`,
     * Gesicht `SessionInputResolver.for(actx)` + `SessionInput.state/setDraft`).
     * Die Kette unten probiert die gemessenen Wege der Reihe nach und rendert
     * den Knopf DEAKTIVIERT mit Grund, wenn keiner greift — ein stiller
     * No-Op-Knopf waere schlimmer als keiner.
     */
    const ENHANCE_COMMAND = 'veredeln';
    const MODE_COMMAND = 'veredeln-modus';
    const MODE_AUTO = 'auto';
    const MODE_MANUAL = 'manuell';
    /** Der Ablage-Schluessel des Modus ist BROWSER-LOKAL: die Sitzungs-Entscheidung lebt beim Menschen, nicht im Host. */
    const MODE_STORE_KEY = 'shinon-prompter-enhance-mode';

    const readMode = () => {
      try { return window.localStorage.getItem(MODE_STORE_KEY) === MODE_MANUAL ? MODE_MANUAL : MODE_AUTO; }
      catch { return MODE_AUTO; }
    };
    const storeMode = (mode) => {
      try { window.localStorage.setItem(MODE_STORE_KEY, mode); } catch { /* privater Modus: egal */ }
    };

    /**
     * Das Draft-Gesicht: { draft(), setDraft(text) } oder null.
     *
     * Weg 1: die Slot-Schicht mischt die Standard-Props der Sitzung
     * (`useInput` + `inputActions`, Vertrag `SessionStandardProps`) — dann hat
     * die Komponente alles sofort.
     * Weg 2: der Conversation-Dienst mit einem Sitzungs-Scope (`props.actx`,
     * falls die Slot-Schicht ihn liefert) — `input.for(actx)` traegt
     * `state` (SnapshotStore<InputState>) und `setDraft`.
     * Ohbeide Wege: null — der Knopf wird deaktiviert mit Begründung.
     */
    function draftFace(props) {
      const useInput = props?.useInput;
      const actions = props?.inputActions;
      if (typeof useInput === 'function' && typeof actions?.setDraft === 'function') {
        return { draft: () => useInput()?.draft ?? '', setDraft: (text) => actions.setDraft(text) };
      }
      const conversation = props?.conversation;
      const actx = props?.actx;
      const input = conversation?.input?.for?.(actx);
      const store = input?.state;
      if (store !== undefined && typeof input?.setDraft === 'function') {
        return {
          draft: () => (typeof store.getSnapshot === 'function' ? store.getSnapshot()?.draft ?? '' : ''),
          setDraft: (text) => input.setDraft(text),
        };
      }
      return null;
    }

    /** Ein Knopf im DSW-Look — klein, wie die Nachbarn in der Composer-Zeile. */
    function controlButton(label, onClick, { disabled = false, title = '', primary = false } = {}) {
      return h('button', {
        type: 'button',
        onClick,
        disabled,
        title,
        style: {
          border: '1px solid var(--dsw-outline-color, rgba(128,128,128,.35))',
          borderRadius: '6px',
          background: primary ? 'var(--dsw-alias-brand-primary, #247bbf)' : 'transparent',
          color: primary ? 'var(--dsw-alias-brand-on-primary, #fff)' : 'inherit',
          fontSize: '12px',
          lineHeight: '18px',
          padding: '1px 8px',
          cursor: disabled ? 'not-allowed' : 'pointer',
          opacity: disabled ? 0.55 : 1,
          whiteSpace: 'nowrap',
        },
      }, label);
    }

    /**
     * Die Steuerung: Modus-Klein-Umschalter, `Veredeln`, und solange ein
     * Vorschlag im Feld steht, `Zurücksetzen`. Die Komponente rendert null,
     * wenn kein Sitzungs-Id da ist (Slot scope=session sollte das nie sein).
     */
    function EnhanceControl(props) {
      const sessionId = typeof props?.sessionId === 'string' ? props.sessionId : null;
      const face = draftFace(props);
      const remote = props?.remote;
      const [mode, setMode] = React.useState(readMode);
      const [busy, setBusy] = React.useState(false);
      const [error, setError] = React.useState(null);
      const [original, setOriginal] = React.useState(null);

      if (sessionId === null) return null;
      const disabledReason = face === null
        ? 'Kein Eingabefeld-Zugriff: die Slot-Schicht liefert weder useInput/inputActions noch einen Sitzungs-Scope.'
        : remote === undefined
          ? 'Kein Remote-Dienst: die Kommandos sind nicht erreichbar.'
          : null;

      const runCommand = async (line) => {
        const result = await remote.commands.execute(sessionId, line, []);
        if (!result?.ok) throw new Error(`${result?.error?.code ?? 'unbekannt'}: ${result?.error?.message ?? 'keine Antwort'}`);
        if (result.value === undefined) throw new Error(`unbekanntes Kommando: ${line.split(' ')[0]}`);
        return result.value.result;
      };

      const onMode = async (next) => {
        setMode(next);
        storeMode(next);
        if (remote === undefined) return;
        try { await runCommand(`/${MODE_COMMAND} ${next}`); }
        catch (caught) { setError(`${MODE_COMMAND}: ${caught.message}`); }
      };

      const onEnhance = async () => {
        if (disabledReason !== null || busy) return;
        const text = face.draft();
        if (text.trim() === '') {
          setError('Kein Text im Eingabefeld.');
          return;
        }
        setBusy(true);
        setError(null);
        try {
          const result = await runCommand(`/${ENHANCE_COMMAND} ${text}`);
          if (result?.kind === 'success' && typeof result.text === 'string') {
            setOriginal(text);
            face.setDraft(result.text);
          } else {
            setError(result?.text ?? 'Veredelung ohne Ergebnis.');
          }
        } catch (caught) {
          setError(`${ENHANCE_COMMAND}: ${caught.message}`);
        } finally {
          setBusy(false);
        }
      };

      const onReset = () => {
        if (original === null || face === null) return;
        face.setDraft(original);
        setOriginal(null);
        setError(null);
      };

      const modeButton = (value, label) => h('button', {
        key: value,
        type: 'button',
        onClick: () => onMode(value),
        title: value === MODE_MANUAL
          ? 'Manuell: der Enhancer veredelt nur noch auf Klick — jede Änderung ist sichtbar.'
          : 'Auto: der Enhancer veredelt weiterhin still im Pre-Step.',
        style: {
          border: '1px solid var(--dsw-outline-color, rgba(128,128,128,.35))',
          borderRadius: value === MODE_AUTO ? '6px 0 0 6px' : '0 6px 6px 0',
          borderRight: value === MODE_AUTO ? 'none' : undefined,
          background: mode === value ? 'var(--dsw-alias-brand-primary, #247bbf)' : 'transparent',
          color: mode === value ? 'var(--dsw-alias-brand-on-primary, #fff)' : 'inherit',
          fontSize: '11px',
          lineHeight: '18px',
          padding: '1px 6px',
          cursor: 'pointer',
        },
      }, label);

      return h('div', {
        'data-plugin': PLUGIN,
        title: disabledReason ?? 'Veredelung sichtbar machen: der Text wird im Eingabefeld ersetzt, nicht in der Sitzung.',
        style: { display: 'flex', alignItems: 'center', gap: '4px' },
      },
        h('span', { style: { fontSize: '11px', opacity: 0.75 } }, 'Enhancer'),
        modeButton(MODE_AUTO, 'Auto'),
        modeButton(MODE_MANUAL, 'Manuell'),
        controlButton(busy ? 'Veredle…' : 'Veredeln', onEnhance, { disabled: disabledReason !== null || busy, title: disabledReason ?? 'Den Text im Eingabefeld veredeln', primary: true }),
        original !== null ? controlButton('Zurücksetzen', onReset, { title: 'Den vorherigen Text wiederherstellen' }) : null,
        error !== null ? h('span', { style: { fontSize: '11px', color: 'var(--dsw-error-color, #c0392b)', maxWidth: '260px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }, title: error }, error) : null);
    }
