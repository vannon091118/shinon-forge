    /** Jeden laufenden Timer des Uebungszugs abraeumen (Abbruch, Neustart, Abbau). */
    function encounterStop() {
      for (const id of encounterTimers) window.clearTimeout(id);
      encounterTimers.clear();
      encounterHolding = false;
      encounterHoldTimer = null;
      encounterTurn = null;
    }

    /** Eine Ereignisfolge mit festem Takt einplanen. */
    function encounterSchedule(steps, turnId, offsetMs) {
      steps.forEach(([type, payload], index) => {
        const id = window.setTimeout(() => {
          encounterTimers.delete(id);
          if (type === 'encounter.preflight.ready') encounterOpenHold(turnId);
          encounterFeed(encounterNext(type, turnId, payload));
        }, offsetMs + index * ENCOUNTER_TICK_MS + 1);
        encounterTimers.add(id);
      });
    }

    /** Das Eingriffsfenster oeffnen: sichtbar ab dem Ready-Ereignis. */
    function encounterOpenHold(turnId) {
      encounterHolding = true;
      encounterTurn = turnId;
      encounterHoldTimer = window.setTimeout(() => {
        encounterTimers.delete(encounterHoldTimer);
        encounterHoldTimer = null;
        encounterContinue();
      }, ENCOUNTER_HOLD_MS);
      encounterTimers.add(encounterHoldTimer);
    }

    /**
     * «Anfrage starten» / Ablauf des Fensters: der Lauf beginnt mit der
     * Auswahl, die der Zustand traegt. Nur aus dem offenen Vorflug — ein
     * zweiter Aufruf ist keine zweite Anfrage.
     */
    function encounterContinue() {
      if (!encounterHolding || encounter.status !== 'preflight' || encounter.preflight.ready !== true) return null;
      encounterHolding = false;
      if (encounterHoldTimer !== null) {
        window.clearTimeout(encounterHoldTimer);
        encounterTimers.delete(encounterHoldTimer);
        encounterHoldTimer = null;
      }
      encounterSchedule(ENCOUNTER_POST, encounterTurn ?? encounter.turnId, 0);
      emit();
      return { continued: true };
    }

    /**
     * Einen Wissensblock an- oder abwaehlen. Der Weg ist der Vertrag: ein
     * `encounter.block.selected` mit der NEUEN Liste, gefaltet vom Reducer.
     * Nur im offenen Fenster; vor `preflight.ready` ist die Auswahl noch nicht
     * fest, nach `run.started` ist sie eingefroren — der Versuch wird sichtbar
     * (nicht still) abgewiesen.
     */
    function encounterToggleBlock(id) {
      if (encounter.status !== 'preflight' || encounter.preflight.ready !== true) return null;
      if (typeof id !== 'string' || id === '') return null;
      const blocks = encounter.preflight.blocks.includes(id)
        ? encounter.preflight.blocks.filter((block) => block !== id)
        : [...encounter.preflight.blocks, id];
      return encounterFeed(encounterNext('encounter.block.selected', encounter.turnId ?? 'turn-bloecke', { blocks }));
    }

    /** Den Uebungszug starten. Nur aus `closed` — sonst gibt es nichts zu starten. */
    function encounterStart() {
      // `encounterTimers.size` ist die Wache gegen den Doppelklick: der Status
      // steht in den ersten Millisekunden noch auf `closed`, waehrend der
      // Uebungszug schon laeuft. Ein zweiter Klick wuerde einen zweiten Zug mit
      // fremder turnId starten — der Reducer wiese jedes zweite Ereignis als
      // FOREIGN_TURN ab, und der Nutzer saehe eine Absage fuer seinen eigenen
      // Klick. Also: solange etwas laeuft, gibt es nichts zu starten.
      if (encounter.status !== 'closed' || encounterTimers.size > 0) return null;
      encounterStop();
      encounterTurn = `turn-${Date.now()}`;
      encounterSchedule(ENCOUNTER_PRE, encounterTurn, 0);
      return {
        turnId: encounterTurn,
        steps: ENCOUNTER_DRILL.length,
        tickMs: ENCOUNTER_TICK_MS,
        holdMs: ENCOUNTER_HOLD_MS,
      };
    }

    /** Abbrechen: der Reducer entscheidet `aborted`, die Buehne raeumt nur die Timer. */
    function encounterAbort() {
      if (encounter.status === 'closed' || ENCOUNTER_TERMINAL_STATES.includes(encounter.status)) return null;
      encounterStop();
      return encounterFeed(encounterNext('encounter.abort', encounter.turnId ?? 'turn-abort', { reason: 'Nutzer' }));
    }

    /** Zurueck auf Anfang. `silent` fuer den Start, der ohnehin gleich rendert. */
    function encounterReset(silent = false) {
      encounterStop();
      encounter = createEncounterState();
      encounterLog = [];
      if (!silent) emit();
    }

    /** Die Kurzzeile unter dem Titel — was der Zustand hergibt, nichts daneben. */
    function encounterSummary(s) {
      const count = (n, one, many) => `${n} ${n === 1 ? one : many}`;
      if (s.status === 'closed') return `Übungszug · ${ENCOUNTER_DRILL.length} Schritte · wartet auf Start`;
      if (s.status === 'compact') {
        return `Bilanz: ${ENCOUNTER_OUTCOMES[s.outcome?.kind] ?? 'ohne Ergebnis'} · ${count(s.applied, 'Ereignis', 'Ereignisse')}`;
      }
      const parts = [count(s.applied, 'Ereignis', 'Ereignisse')];
      if (s.preflight.route !== null) parts.push(`${s.preflight.route.provider}/${s.preflight.route.model}`);
      if (s.preflight.blocks.length > 0) parts.push(count(s.preflight.blocks.length, 'Block', 'Blöcke'));
      if (s.tools.calls > 0) parts.push(`${count(s.tools.calls, 'Werkzeug', 'Werkzeuge')}${s.tools.open > 0 ? ` (${s.tools.open} offen)` : ''}`);
      if (s.facts.valid > 0) parts.push(count(s.facts.valid, 'Fakt', 'Fakten'));
      return parts.join(' · ');
    }

    /** Eine Zeile des Pre-Flight-Decks: Bezeichnung links, Wert rechts. */
    function deckRow(label, value) {
      return h('div', { className: '__cm_deck-row', key: label },
        h('dt', null, label),
        h('dd', null, value));
    }

