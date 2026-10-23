    function BreedingPanel({ s }) {
      const breeding = s.breeding ?? { creatures: [], eggs: [] };
      const creatures = breeding.creatures ?? [];
      const [parentA, setParentA] = React.useState(creatures[0]?.id ?? '');
      const [parentB, setParentB] = React.useState(creatures[1]?.id ?? '');
      const [selectedSpecies, setSelectedSpecies] = React.useState('');
      const [notice, setNotice] = React.useState('');
      const a = creatures.find((creature) => creature.id === parentA);
      const b = creatures.find((creature) => creature.id === parentB);
      const candidates = breedingCandidates(a, b);
      const effectiveChoice = candidates.includes(selectedSpecies) ? selectedSpecies : (candidates[0] ?? '');
      const clutch = a && b ? 1 + Math.max(a.clutch, b.clutch) : 0;
      const canPair = Boolean(a && b && a.id !== b.id && candidates.length > 0
        && s.loot.brauchbar >= clutch && (candidates.length === 1 || candidates.includes(effectiveChoice))
        && s.lock === null && s.battle === null);
      return h('section', { className: '__cm_block __cm_breeding', 'aria-label': 'Sammlung und Zucht' },
        h('h3', null, `Sammlung & Zucht · ${creatures.length}/50 · ${breeding.eggs?.length ?? 0} Eier`),
        h('div', { className: '__cm_roster' }, creatures.map((creature) => h('button', {
          key: creature.id, type: 'button',
          className: `__cm_roster-card${creature.id === breeding.active ? ' is-active' : ''}`,
          onClick: () => selectCreature(creature.id),
          'aria-pressed': creature.id === breeding.active,
        },
          h('span', { className: '__cm_roster-art', dangerouslySetInnerHTML: { __html: speciesGlyph(creature.species, levelFor(creature.xp), 42) } }),
          h('span', { className: '__cm_roster-label' }, SPECIES[creature.species].label),
          h('span', { className: '__cm_roster-meta' }, `Gen ${creature.gen} · L${levelFor(creature.xp)} · ZE ${creature.bxp}`),
          creature.id === breeding.active ? h('span', { className: '__cm_roster-active' }, 'AKTIV') : null))),
        h('div', { className: '__cm_breed-form' },
          h('label', { className: '__cm_pick' }, h('span', null, 'Elternteil A'),
            h('select', { value: a?.id ?? '', onChange: (event) => { setParentA(event.target.value); setSelectedSpecies(''); } },
              creatures.map((creature) => h('option', { key: creature.id, value: creature.id }, `${SPECIES[creature.species].label} · ${creature.id}`)))),
          h('label', { className: '__cm_pick' }, h('span', null, 'Elternteil B'),
            h('select', { value: b?.id ?? '', onChange: (event) => { setParentB(event.target.value); setSelectedSpecies(''); } },
              creatures.map((creature) => h('option', { key: creature.id, value: creature.id }, `${SPECIES[creature.species].label} · ${creature.id}`)))),
          candidates.length > 1 ? h('label', { className: '__cm_pick' },
            h('span', null, 'Nachkomme'),
            h('select', { value: effectiveChoice, onChange: (event) => setSelectedSpecies(event.target.value) },
              candidates.map((id) => h('option', { key: id, value: id }, SPECIES[id].label)))) : null,
          h('p', { className: '__cm_sub' },
            a && b ? `Kosten: ${clutch} brauchbare Teile · ${candidates.length} gültige Art(en) · Brut je Completion +${BP_PER_COMPLETION} BP`
              : 'Zwei verschiedene Kreaturen auswählen, um die gültigen Nachkommen zu sehen.'),
          h('button', { type: 'button', className: '__cm_btn', disabled: !canPair,
            onClick: () => {
              try {
                const result = pairCreatures(parentA, parentB, candidates.length > 1 ? effectiveChoice : undefined);
                setNotice(result ? `Ei ${result.eggId} angelegt: ${SPECIES[result.species].label}` : 'Zucht wartet, bis kein Zug läuft.');
                setSelectedSpecies('');
              } catch (error) { setNotice(error?.message ?? 'Paarung abgelehnt'); }
            } }, 'Paarung starten'),
          h('span', { className: '__cm_sub' }, `${s.loot.brauchbar} brauchbare Teile verfügbar`),
          notice ? h('p', { className: '__cm_breed-notice', role: 'status' }, notice) : null),
        (breeding.eggs ?? []).length === 0 ? h('p', { className: '__cm_sub' }, 'Keine Eier in Brut. Ein Ei erhält pro bestätigter Completion genau +10 BP und schlüpft ab 120 BP.')
          : h('div', { className: '__cm_eggs' }, breeding.eggs.map((egg) => h('div', { className: '__cm_egg', key: egg.id },
            h('div', { className: '__cm_egg-heading' },
              h('strong', null, `${egg.id} · ${SPECIES[egg.species].label}`),
              h('span', { className: '__cm_sub' }, `Gen ${egg.gen} · ${egg.bonuses.length} Bonus${egg.bonuses.length === 1 ? '' : 'e'}`)),
            h(Bar, { value: Math.min(HATCH_BP, egg.bp), max: HATCH_BP, tone: 'xp' }),
            h('p', { className: '__cm_sub' }, `${egg.bp}/${HATCH_BP} Brutpunkte · ${Math.max(0, Math.ceil((HATCH_BP - egg.bp) / BP_PER_COMPLETION))} bestätigte Completions bis Schlupf`),
            egg.bonuses.length ? h('p', { className: '__cm_sub' }, egg.bonuses.map((bonus) => `${bonus.id} +${bonus.value}`).join(' · ')) : null))));
    }

    // ── Encounter-Buehne (S5) ────────────────────────────────────────────────
    /**
     * Die Buehne haelt KEINEN zweiten Zustand. `encounter` ist genau das, was
     * `reduceEncounter` zurueckgibt — jede Aenderung geht durch den Reducer,
     * und gerendert wird, was er liefert. `encounterLog` ist das Protokoll der
     * EINGABEN (Typ, Ergebnis, Grund), keine Zustandsquelle: wer den Zustand
     * sucht, liest ihn aus `encounter`, nicht aus der Liste.
     *
     * Der Uebungszug ist ein LOKALER Erzeuger von Vertragsereignissen, kein
     * Modell-Turn: der Host meldet echte Signale erst in einem spaeteren
     * Schnitt. Deshalb steht "Uebungszug" an der Buehne, und deshalb kann die
     * Buehne auch still bleiben, wenn niemand sie startet.
     */
    let encounter = createEncounterState();
    let encounterLog = [];
    let encounterSeq = 0;
    /** Timer des Uebungszugs. Ausserhalb des Zustands, wie jeder Handle. */
    const encounterTimers = new Set();

    const ENCOUNTER_TITLES = {
      closed: 'bereit',
      preflight: 'Vorflug',
      running: 'läuft',
      validating: 'Prüfung',
      completed: 'abgeschlossen',
      rejected: 'abgewiesen',
      aborted: 'abgebrochen',
      'recoverable-error': 'Fehler',
      compact: 'verdichtet',
    };
    const ENCOUNTER_RAIL = [
      { status: 'preflight', label: 'Vorflug' },
      { status: 'running', label: 'Lauf' },
      { status: 'validating', label: 'Prüfung' },
      { status: 'completed', label: 'Abschluss' },
    ];
    /** Die Bilanz in Worten — der Vertragsname bleibt im `title`, nicht im Satz. */
    const ENCOUNTER_OUTCOMES = {
      'contract-passed': 'Vertrag bestanden',
      'contract-failed': 'Vertrag verfehlt',
      neutral: 'neutral abgeschlossen',
      aborted: 'abgebrochen',
      error: 'Fehler',
    };
    const ENCOUNTER_VERDICTS = { APPLIED: 'angewandt', IGNORED: 'ignoriert', REJECTED: 'abgewiesen' };
    // Die Schiene liest den Zustand, nicht die Terminal-Farbe: `aborted` und
    // `rejected` tragen ihre Herkunft in `lastPhase` (Vertrag, nicht Buehnen-
    // Wissen). Vorher stand hier fuer jedes Terminal pauschal "Pruefung" — eine
    // Anzeige, die einen Abbruch im Vorflug als Pruefungsabbruch verkaufte.
    const ENCOUNTER_PHASE = {
      closed: -1, preflight: 0, running: 1, validating: 2, completed: 3, compact: 3,
      rejected: -1, aborted: -1, 'recoverable-error': -1,
    };

    /**
     * Der Uebungszug als DATEN. Jede Zeile ist ein Vertragsereignis aus der
     * Tabelle; die Buehne erfindet keines und schreibt keine zweite Liste —
     * `ENCOUNTER_EVENTS` bleibt die Quelle, hier steht nur die Reihenfolge.
     * Die Nutzlast haelt sich an die Allowlist des jeweiligen Ereignisses.
     */
    const ENCOUNTER_BLOCKS = ['persona-identity-core', 'enhancer-system-policy'];

    /**
     * Der Vorflug endet mit `preflight.ready` — an dieser Stelle oeffnet das
     * Pre-Flight-Deck (B04) sein Eingriffsfenster. Die Route steht VOR dem
     * Ready: sie ist die Route, die der Anfrage mitgegeben wird, und das Deck
     * zeigt sie, bevor der Lauf beginnt (nicht danach).
     */
    const ENCOUNTER_PRE = [
      ['encounter.turn.started', {}],
      ['encounter.task.classified', { taskClass: 'fix', taskLabel: 'Reparatur' }],
      ['encounter.index.progress', { phase: 'scan', count: 12 }],
      ['encounter.fact.validated', { snapshotId: 'snap-uebung', valid: 3, untrusted: 1, unknown: 0 }],
      ['encounter.block.selected', { blocks: ENCOUNTER_BLOCKS.slice() }],
      ['encounter.route.selected', { provider: 'lokal', model: 'uebungszug' }],
      ['encounter.preflight.ready', {}],
    ];
    /** Was nach der Freigabe (oder nach Ablauf des Fensters) laeuft. */
    const ENCOUNTER_POST = [
      ['encounter.run.started', { step: 1 }],
      ['encounter.tool.started', { callId: 'call-1', name: 'read_file' }],
      ['encounter.tool.completed', { callId: 'call-1', ok: true }],
      ['encounter.answer.received', {}],
      ['encounter.result-contract.passed', { contract: 'shinon.result/v1' }],
      ['encounter.turn.completed', { reason: 'completed' }],
      ['encounter.receipt.compacted', {}],
    ];
    const ENCOUNTER_DRILL = [...ENCOUNTER_PRE, ...ENCOUNTER_POST];
    const ENCOUNTER_TICK_MS = 650;
    /** Das Eingriffsfenster des Decks. Nur ein UX-Fenster, keine Modellzeit. */
    const ENCOUNTER_HOLD_MS = 2000;

    /**
     * Ein Ereignis durch den Reducer schicken. Das Ergebnis (outcome, reason)
     * ist die Antwort an den Aufrufer; der Zustand selbst ist danach der neue
     * `encounter`. Kein Wurf, kein stiller Fall: ein abgewiesenes Ereignis
     * nennt seinen Grund.
     */
    function encounterFeed(event) {
      const step = reduceEncounter(encounter, event);
      encounter = step.state;
      encounterLog = [{
        id: typeof event?.eventId === 'string' ? event.eventId : null,
        type: typeof event?.type === 'string' ? event.type : '?',
        outcome: step.outcome,
        reason: step.reason,
        at: Date.now(),
      }, ...encounterLog].slice(0, 8);
      emit();
      return { outcome: step.outcome, reason: step.reason, status: encounter.status };
    }

    /** Die naechste Huelle — gebaut vom Kern, damit Form und ID-Regel eine Quelle haben. */
    const encounterNext = (type, turnId, payload) => encounterEvent(type, {
      eventId: `enc-${(encounterSeq += 1)}`,
      turnId,
      sessionId: typeof store.sessionId === 'string' ? store.sessionId : 'lokal',
      payload,
    });

    /**
     * Der Treiber des Uebungszugs — bewusst hier und nicht im Reducer: Zeit
     * und Timer gehoeren zur Buehne, der Zustand nicht.
     *
     * `encounterHolding` ist das offene Eingriffsfenster: es beginnt mit
     * `preflight.ready` und endet mit dem Klick auf «Lauf starten» oder
     * nach `ENCOUNTER_HOLD_MS`. Der Timeout-Pfad ist der DEFAULT-Pfad: es geht
     * mit genau der Auswahl weiter, die der Zustand schon traegt — kein
     * Sonderfall, keine stille Aenderung.
     */
    let encounterHolding = false;
    let encounterHoldTimer = null;
    let encounterTurn = null;

