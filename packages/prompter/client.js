/**
 * @shinon/prompter — Client-Hälfte: Trace-Panel.
 * GENERIERT aus assets/client/*.js — nicht von Hand ändern; Schreiben: node scripts/build-client.mjs prompter.
 *
 * Zeigt die letzten Prompter-Entscheidungen (Outcome, Modus, Gründe, Kontextquelle).
 * Host→Client läuft über den Kanal, nicht über das Fenster: der Host emittiert
 * jeden Datensatz auf `DECISION_CHANNEL`, und diese Hälfte spiegelt ihn nach
 * `window.__shinonPrompterTrace` (Fenster-Konvention, wie `window.__codingmon`
 * bei @shinon/codingmon). Der Host schreibt NUR im In-Prozess-Fall selbst ins
 * Fenster — in Produktion (Host in Node, Panel im Browser) käme sein `window`
 * nie auf der Seite an, und das Panel bliebe ewig leer (gemessen 2026-10-17:
 * `verworfen (NO_JSON)` im Terminal, „Keine Entscheidungen" im Panel).
 */
window.__ModuleLoader__.load({
  id: '@shinon/prompter',
  factory(require) {
// >>> @part assets/client/01-react.js
    const React = require('react');
    const h = React.createElement;
    const PLUGIN = '@shinon/prompter';
    /**
     * Der Kanal, auf dem der Host seine Entscheidungen meldet. Als Literal
     * dupliziert wie im Host (`packages/prompter/assets/mode-core.js`) —
     * bewusst: der Client lädt das Host-Modul nicht, und ein gemeinsamer
     * Import wäre eine Kopplung, die es sonst nirgends gibt (dieselbe Regel
     * wie bei @shinon/task-router). Gepinnt vom Gate gegen den Host-Export.
     */
    const DECISION_CHANNEL = 'shinon/prompter/decision';
    /** Die Live-Route des Hosts — gleiche Herkunft, also mit Cookie/Session. */
    const TRACE_ENDPOINT = '/shinon/prompter/trace';
    /** Das Fenster-Ereignis, auf das das Panel hört (Host-Global oder SSE). */
    const TRACE_EVENT = 'shinon:prompter-trace';

    /** Ein Datensatz in der Form, die `TracePanel` liest — ein Schreiber mehr, keine zweite Form. */
    const traceEntry = (record) => ({
      outcome: record?.outcome ?? 'unbekannt',
      mode: record?.mode ?? null,
      intent: record?.intent ?? 'UNDEFINED',
      reasons: Array.isArray(record?.reasons) ? record.reasons.slice(0, 5) : [],
      context_source: record?.context_source ?? null,
      // Die Provenienz-Leiter als Zensus: wie viele Belege welcher Klasse und
      // wie viele Luecken. Der VOLLE Datensatz reist auf dem Entscheidungs-Kanal;
      // hier steht nur, was das Panel in einer Zeile zeigen kann. Der Zensus
      // akzeptiert beide Formen (Array aus dem Kanal, Zahl aus dem Fenster).
      provenance: record?.provenance && typeof record.provenance === 'object'
        ? {
            contract: typeof record.provenance.contract === 'string' ? record.provenance.contract : '',
            entries: Array.isArray(record.provenance.entries)
              ? record.provenance.entries.length
              : Number.isInteger(record.provenance.entries) ? record.provenance.entries : 0,
            violations: Array.isArray(record.provenance.violations)
              ? record.provenance.violations.length
              : Number.isInteger(record.provenance.violations) ? record.provenance.violations : 0,
            complete: record.provenance.complete === true,
          }
        : null,
      // Der Aufgabenbrief als Adresse: welches Paket die Frage besitzt und wie
      // lang der Block war. Der Text selbst reist nicht ins Fenster — er steht
      // im Prompt, und ein Blocktext im Panel waere eine zweite Kopie.
      brief: record?.brief && typeof record.brief === 'object'
        ? {
            id: typeof record.brief.id === 'string' ? record.brief.id : '',
            owner: typeof record.brief.owner === 'string' ? record.brief.owner : '',
            chars: Number.isInteger(record.brief.chars) ? record.brief.chars : 0,
          }
        : null,
      brief_reason: typeof record?.brief_reason === 'string' ? record.brief_reason : null,
      // Die Abbruchquote: der Host rechnet sie `abort-core.js`, der Client zeigt
      // nur die vier Zahlen und das Label. Kein Grund wird hier genannt — ein
      // neuer Grund ist ein Dateneintrag im Prompter, keine Client-Änderung.
      abort_quote: record?.abort_quote && typeof record.abort_quote === 'object'
        ? {
            turns: Number.isInteger(record.abort_quote.turns) ? record.abort_quote.turns : 0,
            aborts: Number.isInteger(record.abort_quote.aborts) ? record.abort_quote.aborts : 0,
            quote: Number.isFinite(record.abort_quote.quote) ? record.abort_quote.quote : 0,
            top: typeof record.abort_quote.top === 'string' ? record.abort_quote.top : null,
            topLabel: typeof record.abort_quote.topLabel === 'string' ? record.abort_quote.topLabel : null,
          }
        : null,
      // Prosa-Rettung sichtbar machen: Grund, Zeichenzahl und der wievielte
      // Fall dieser Sitzung — sonst sieht ein geretteter Prosafall wie eine
      // normale Veredelung aus, und „zu oft" bleibt eine Vermutung.
      salvage: record?.salvage && typeof record.salvage === 'object'
        ? {
            reason: typeof record.salvage.reason === 'string' ? record.salvage.reason : '?',
            chars: Number.isInteger(record.salvage.chars) ? record.salvage.chars : 0,
            count: Number.isInteger(record.salvage.count) ? record.salvage.count : 0,
          }
        : null,
      raw_prompt: typeof record?.raw_prompt === 'string' ? record.raw_prompt : null,
      at: typeof record?.at === 'number' ? record.at : null,
    });

    /** Puffer schreiben und die Anzeige wecken; ohne Fenster ist das ein No-op. */
    const publish = (list) => {
      try {
        window.__shinonPrompterTrace = list.slice(0, 20);
        window.dispatchEvent(new CustomEvent(TRACE_EVENT));
      } catch { /* die Anzeige ist Nebensache; sie darf das Panel nicht brechen */ }
    };

    const mirrorRecord = (record) => {
      const list = Array.isArray(window.__shinonPrompterTrace) ? window.__shinonPrompterTrace : [];
      publish([traceEntry(record), ...list]);
    };

    function insertStyles(tag, css) {
      if (document.querySelector(`style[data-plugin-css="${tag}"]`) !== null) return;
      const style = document.createElement('style');
      style.dataset.plugin = PLUGIN;
      style.dataset.pluginCss = tag;
      style.textContent = css;
      document.head.appendChild(style);
    }

    insertStyles(`${PLUGIN}/trace.css`, `
      .__pt_panel {
        font-family: var(--dsw-alias-font-mono, monospace);
        font-size: 12px;
        padding: 8px;
        color: var(--dsw-alias-label-secondary);
      }
      .__pt_title {
        font-weight: 600;
        margin-bottom: 8px;
        color: var(--dsw-alias-label-primary);
      }
      .__pt_empty {
        opacity: 0.5;
        padding: 8px 0;
      }
      .__pt_entry {
        margin-bottom: 8px;
        padding: 6px;
        border-left: 2px solid var(--dsw-alias-brand-primary);
      }
      .__pt_entry.rejected { border-left-color: var(--dsw-alias-label-danger, #ef4444); }
      .__pt_entry.unavailable { border-left-color: var(--dsw-alias-label-warning, #f59e0b); }
      .__pt_row { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; }
      .__pt_badge {
        display: inline-block;
        padding: 1px 6px;
        border-radius: 3px;
        font-size: 10px;
        font-weight: 600;
        background: transparent;
        border: 1px solid currentColor;
        color: var(--dsw-alias-brand-primary, currentColor);
      }
      .__pt_badge.rejected {
        background: var(--dsw-alias-label-danger, #ef4444);
        border-color: transparent;
        color: var(--dsw-alias-label-inverse, #fff);
      }
      .__pt_badge.unavailable {
        background: var(--dsw-alias-label-warning, #f59e0b);
        border-color: transparent;
        color: #1a1a1a;
      }
      .__pt_badge.intent { background: transparent; border: 1px solid currentColor; color: inherit; }
      .__pt_list { max-height: 300px; overflow-y: auto; display: grid; gap: 4px; margin-top: 6px; padding-right: 2px; }
      .__pt_entry { border: 1px solid var(--dsw-alias-border-l1, rgba(255,255,255,.12)); border-radius: 6px; padding: 4px 6px; }
      .__pt_entry > summary { cursor: pointer; list-style: none; display: flex; flex-wrap: wrap; gap: 4px; align-items: center; }
      .__pt_entry > summary::-webkit-details-marker { display: none; }
      .__pt_body { margin-top: 5px; display: grid; gap: 3px; font-size: 11px; }
      .__pt_facts { display: inline-flex; flex-wrap: wrap; gap: 6px; opacity: .75; font-size: 11px; }
      .__pt_more { font-size: 11px; opacity: .6; margin-top: 4px; }
      .__pt_reason { opacity: 0.7; font-size: 11px; }
      .__pt_raw {
        margin-top: 4px;
        padding-left: 6px;
        border-left: 1px dashed currentColor;
        opacity: 0.8;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
    `);

    function traceBadge(outcome) {
      const cls = outcome === 'accepted' ? '' : outcome;
      return h('span', { className: `__pt_badge ${cls}`.trim() }, String(outcome).toUpperCase());
    }
// <<< @part assets/client/01-react.js

// >>> @part assets/client/02-enhance-control.js
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
// <<< @part assets/client/02-enhance-control.js

// >>> @part assets/client/03-trace-panel.js
    /**
     * Das Trace-Panel: die letzten Entscheidungen als aufklappbare Zeilen — die
     * Zusammenfassung nennt Ergebnis, Intent und Belege, alles Weitere steht im
     * aufgeklappten Teil. Die Liste scrollt, statt das Panel zu fuellen.
     */
    function TracePanel() {
      // Der Puffer ist die Quelle; `useState` macht aus dem Schreiben ein Rendern.
      const [trace, setTrace] = React.useState(() => (Array.isArray(window.__shinonPrompterTrace) ? window.__shinonPrompterTrace : []));
      React.useEffect(() => {
        const refresh = () => setTrace(Array.isArray(window.__shinonPrompterTrace) ? [...window.__shinonPrompterTrace] : []);
        // Das Abo traegt den Live-Fall; das Intervall ist der Fallback, falls die
        // Seite den Puffer auf einem anderen Weg bekommt (Host-Global ohne SSE).
        const timer = setInterval(refresh, 2000);
        window.addEventListener(TRACE_EVENT, refresh);
        refresh();
        return () => { clearInterval(timer); window.removeEventListener(TRACE_EVENT, refresh); };
      }, []);
      if (trace.length === 0) {
        return h('div', { className: `__pt_panel`, 'data-plugin': PLUGIN },
          h('div', { className: '__pt_title' }, 'Prompter-Trace'),
          h('div', { className: '__pt_empty' }, 'Noch kein Turn beobachtet.'));
      }
      const shown = trace.slice(0, 10);
      const facts = (entry) => [
        h('span', { key: 'mode' }, `Modus ${entry.mode ?? '—'}`),
        h('span', { key: 'ctx' }, `Kontext: ${entry.context_source ?? 'keiner'}`),
        entry.provenance ? h('span', { key: 'prov', title: `${entry.provenance.contract ? `${entry.provenance.contract} · ` : ''}${entry.provenance.violations} Verletzung(en)${entry.provenance.complete ? '' : ' · unvollständig'}` }, `${entry.provenance.entries} Belege`) : null,
      ].filter((part) => part !== null);
      return h('div', { className: `__pt_panel`, 'data-plugin': PLUGIN },
        h('div', { className: '__pt_title' }, `Prompter-Trace · ${trace.length}`),
        trace.length > shown.length ? h('div', { className: '__pt_more' }, `letzte ${shown.length} Entscheidungen — ältere bleiben im Puffer`) : null,
        h('div', { className: '__pt_list' }, shown.map((entry, i) => h('details', {
          key: i,
          className: `__pt_entry ${entry.outcome === 'accepted' ? '' : entry.outcome}`.trim(),
        },
          h('summary', { className: '__pt_row' },
            traceBadge(entry.outcome),
            h('span', { className: '__pt_badge intent' }, entry.intent ?? 'UNDEFINED'),
            h('span', { className: '__pt_facts' }, facts(entry))),
          h('div', { className: '__pt_body' },
            entry.reasons?.length > 0 ? h('div', { className: '__pt_reason' }, `Begründung: ${entry.reasons.join(', ')}`) : null,
            i === 0 && entry.abort_quote && entry.abort_quote.turns > 0 ? h('div', { className: '__pt_reason' }, `Abbrüche: ${entry.abort_quote.aborts} von ${entry.abort_quote.turns} · häufigster Grund: ${entry.abort_quote.topLabel ?? '—'}`) : null,
            entry.brief
              ? h('div', { className: '__pt_reason' }, `Brief: @shinon/${entry.brief.owner} · ${entry.brief.chars} Zeichen`)
              : null,
            entry.salvage
              ? h('div', { className: '__pt_reason' }, `Prosa: ${entry.salvage.reason} · ${entry.salvage.chars} Zeichen · ${entry.salvage.count}. Fall dieser Sitzung`)
              : null,
            entry.raw_prompt
              ? h('div', { className: '__pt_raw', title: entry.raw_prompt }, entry.raw_prompt)
              : null)))));
    }

    return {
      // DREI Einträge, wörtlich das gemessene Muster der DSH-eigenen
      // Plan-Chip-Oberflaeche (`dsh-client-ui-plan`, `const inject = ["slots",
      // "remote", "remote.commands"]`): `remote` trägt den Zugriff auf das
      // Namespace-Objekt, `remote.commands` ist der getracete Kind-Dienst, den
      // Cordis beim `.commands.execute` prüft. Einer ohne den anderen wirft
      // `cannot get property "remote.commands" without inject` — genau der
      // Fehler im Lauf 2026-10-23.
      inject: ['slots', 'remote', 'remote.commands'],
      apply(ctx) {
        // Sichtbarkeit: in die gemeinsame Liste von @shinon/dashboard melden (Konvention, kein Import).
        const registry = (window.__shinonPlugins ??= new Map());
        registry.set('@shinon/prompter', { label: 'Prompter', kind: 'client', panel: 'shinon-prompter' });
        window.dispatchEvent(new CustomEvent('shinon:plugin', { detail: { id: '@shinon/prompter' } }));

        // Der Live-Kanal: der Host hält die Verbindung offen und schickt bei jeder
        // Entscheidung den ganzen Puffer. Ein Fehler ist kein Ausfall — das Global
        // aus `index-inject` trägt den Stand beim Laden der Seite.
        let source = null;
        try {
          if (typeof EventSource === 'function') {
            source = new EventSource(TRACE_ENDPOINT);
            source.onmessage = (event) => {
              try {
                const list = JSON.parse(event.data);
                if (Array.isArray(list)) publish(list.map(traceEntry));
              } catch { /* eine kaputte Zeile überspringt das Panel, nicht der Kanal */ }
            };
          }
        } catch { /* ohne EventSource bleibt der geladene Stand */ }

        // In-Prozess-Fall: der Host emittiert auf dem Entscheidungs-Kanal.
        if (typeof ctx?.on === 'function') {
          ctx.on(DECISION_CHANNEL, (record) => {
            mirrorRecord(record);
          });
        }

        ctx.slots.inject('main', () => ctx.slots.register({
          name: 'main', key: 'shinon-prompter',
          id: 'shinon-prompter',
        }, TracePanel));

        // DER VEREDLEN-KNOPF (2026-10-23): direkt vor der Senden-Aktion. Der
        // Slot `conversation.input.right` ist der gemessene Platz dafuer
        // (Slots-Vertrag von dsh-client-ui-conversation, „compact controls
        // before the composer submit action"). Die Komponente bekommt ihre
        // Sitzung ueber die registrant-eigene `inject(sessionId)`-Form —
        // dasselbe Muster wie die DSH-eigene Plan-Chip-Oberflaeche —, und die
        // Dienste laezt sie zum Aufrufzeitpunkt los (`ctx.get`), damit keine
        // Verbindung beim Mounten entsteht.
        ctx.slots.inject('conversation.input.right', () => ctx.slots.register({
          name: 'conversation.input.right',
          key: 'shinon-prompter-enhance',
          id: 'shinon-prompter-enhance',
          inject: (sessionId) => ({
            sessionId,
            remote: ctx.remote ?? (typeof ctx.get === 'function' ? ctx.get('remote') : undefined),
            conversation: typeof ctx.get === 'function' ? ctx.get('conversation') : undefined,
          }),
        }, EnhanceControl));

        // Kein `sidebar.panellist`-Eintrag mehr (2026-10-22): die Leiste war mit
        // acht Panel-Knöpfen überladen, die Workspaces fielen heraus. Die Zahl
        // steht als Widget in `@shinon/widget-dock`.

        ctx.effect?.(() => () => {
          try { source?.close(); } catch { /* schon zu */ }
        });
      },
    };
// <<< @part assets/client/03-trace-panel.js

  },
});
