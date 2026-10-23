    /**
     * Das Pre-Flight-Deck (B04) — eine Ansicht des Encounter-Zustands, keine
     * eigene Wahrheit.
     *
     * Es zeigt die sieben Angaben, die B04 vor dem Token-Burn verlangt:
     * Aufgabe, Tendenz, Konflikte, Fakten (plus Quellen), Route, Budget und die
     * endgueltig gezogenen Wissensbloecke. Wo der Vertrag heute KEINE Quelle
     * hat (Tendenz, Konflikte, Faktenquellen, Budget), steht «nicht gemeldet»
     * — sichtbar, statt eine Zahl zu erfinden. Die Bloecke sind im Vorflug
     * schaltbar; der Schalter ist ein `encounter.block.selected` durch den
     * Reducer. Nach `run.started` ist die Auswahl eingefroren und das Deck sagt
     * das, statt einen wirkungslosen Klick anzunehmen.
     */
    function PreflightDeck({ s }) {
      // Schaltbar ist das Deck nur im offenen Fenster: `preflight.ready` liegt
      // vor der Auswahl, `run.started` friert sie ein. Vor dem Ready waere ein
      // Klick eine Aenderung, die das naechste Ereignis ueberschreibt — lieber
      // sichtbar gesperrt als scheinbar wirksam.
      const editable = s.status === 'preflight' && s.preflight.ready === true;
      const blockIds = [...new Set([...ENCOUNTER_BLOCKS, ...s.preflight.blocks])];
      const route = s.preflight.route;
      const facts = s.facts;
      const missing = (text) => h('span', { className: '__cm_deck-missing' }, text);
      const value = (text) => h('span', { className: '__cm_deck-value' }, text);
      return h('section', {
        className: '__cm_deck',
        'data-editable': editable ? 'on' : 'off',
        'aria-label': 'Pre-Flight-Deck',
      },
        h('div', { className: '__cm_deck-head' },
          h('span', { className: '__cm_deck-title' }, 'Pre-Flight-Deck'),
          h('span', { className: '__cm_deck-note', role: 'status' }, s.status === 'preflight'
            ? 'Vorschau (lokal) — kein Modellaufruf'
            : 'Anfrage läuft — Änderungen zu spät'),
          encounterHolding ? h('span', { className: '__cm_deck-window' },
            h('span', { className: '__cm_deck-windowbar', style: { animationDuration: `${ENCOUNTER_HOLD_MS}ms` } }),
            h('span', null, 'Weiter ohne Eingriff')) : null),
        h('dl', { className: '__cm_deck-grid' },
          deckRow('Aufgabe', s.task === null
            ? missing('nicht klassifiziert')
            : value(`${s.task.taskLabel ?? '—'} · ${s.task.taskClass ?? '—'}`)),
          deckRow('Tendenz', missing('nicht gemeldet')),
          deckRow('Konflikte', missing('nicht gemeldet')),
          deckRow('Fakten', facts.snapshotId === null ? missing('kein Snapshot')
            : value(`${facts.valid} VALID · ${facts.untrusted} UNTRUSTED · ${facts.unknown} UNKNOWN · ${facts.snapshotId}`)),
          deckRow('Faktenquellen', missing('nicht gemeldet')),
          deckRow('Route', route === null ? missing('nicht gewählt')
            : value(`${route.provider} / ${route.model}`)),
          deckRow('Budget', missing('nicht gemessen')),
        ),
        h('div', { className: '__cm_deck-blocks' },
          h('span', { className: '__cm_deck-label' }, 'Wissensblöcke'),
          blockIds.map((id) => h('label', {
            key: id,
            className: '__cm_deck-block',
            'data-block': id,
            'data-on': s.preflight.blocks.includes(id) ? 'on' : 'off',
            'data-locked': editable ? 'off' : 'on',
            title: editable
              ? `${id} ${s.preflight.blocks.includes(id) ? 'abwählen' : 'wieder aufnehmen'}`
              : `${id} — eingefroren, die Anfrage ist gestartet`,
          },
            h('input', {
              type: 'checkbox',
              'data-block': id,
              checked: s.preflight.blocks.includes(id),
              disabled: !editable,
              onChange: () => encounterToggleBlock(id),
            }),
            h('span', null, id))),
          s.preflight.ready ? null : h('span', { className: '__cm_deck-missing' }, 'Auswahl noch nicht fest')),
        editable && encounterHolding ? h('div', { className: '__cm_deck-actions' },
          // «Lauf starten» statt «Anfrage starten»: dieser Zug ist ein
          // Uebungszug, und das Deck sagt im selben Atemzug «kein Modellaufruf».
          // Ein Knopf, der eine Anfrage behauptet, waehrend keine rausgeht,
          // waere genau die Sorte stiller Luege, die B04 verhindern soll.
          h('button', { type: 'button', className: '__cm_enc-btn', onClick: () => encounterContinue() }, 'Lauf starten'),
          h('span', { className: '__cm_deck-missing' }, 'startet mit genau dieser Auswahl')) : null,
      );
    }

    /**
     * Die Buehne: eine Kopfzeile mit Status und Bedienung, eine Vier-Stufen-
     * Schiene, das Pre-Flight-Deck und das letzte Ereignis mit seinem Ausgang.
     * Sie steht im Composer-Dock, also in jeder Sitzung; sie ist trotzdem
     * still, solange niemand einen Zug startet.
     */
    function EncounterStage() {
      useStore();
      const s = encounter;
      // Leerzustand: keine Schiene — die vier Stufen sind eine Aussage über einen Lauf, keine Dekoration.
      const idle = s.status === 'closed';
      const finished = s.status === 'completed' || s.status === 'compact';
      const terminal = s.status === 'compact' || ENCOUNTER_TERMINAL_STATES.includes(s.status);
      const phase = finished ? 3 : (ENCOUNTER_PHASE[s.status] ?? -1) >= 0
        ? ENCOUNTER_PHASE[s.status]
        : (ENCOUNTER_PHASE[s.lastPhase] ?? -1);
      const last = encounterLog[0] ?? null;
      const buttons = [];
      if (s.status === 'closed') {
        buttons.push(h('button', {
          key: 'start', type: 'button', className: '__cm_enc-btn',
          title: 'Übungszug starten: 14 Vertragsereignisse durch den Reducer',
          onClick: () => encounterStart(),
        }, 'Zug starten'));
      } else if (!terminal) {
        buttons.push(h('button', {
          key: 'abort', type: 'button', className: '__cm_enc-btn',
          title: 'Zug abbrechen (encounter.abort)',
          onClick: () => encounterAbort(),
        }, 'Abbrechen'));
      } else {
        buttons.push(h('button', {
          key: 'reset', type: 'button', className: '__cm_enc-btn',
          title: 'Bühne zurücksetzen (neuer Zustand, keine Altlast)',
          onClick: () => encounterReset(),
        }, 'Neu'));
      }
      return h('div', {
        className: '__cm_enc',
        'data-plugin': PLUGIN,
        'data-status': s.status,
        title: 'Encounter: der Lauf eines Auftrags in vier Stufen (Vorflug, Lauf, Prüfung, Abschluss). Der Übungszug zeigt die Bühne ohne Modell-Turn.',
      },
        h('div', { className: '__cm_enc-head' },
          h('span', { className: '__cm_enc-title' }, 'Encounter'),
          ...(idle ? [] : [h('span', { key: 'chip', className: '__cm_enc-chip', 'data-status': s.status }, ENCOUNTER_TITLES[s.status] ?? s.status), h('span', { key: 'meta', className: '__cm_enc-meta', role: 'status', 'aria-live': 'polite' }, encounterSummary(s))]),
          h('span', { className: '__cm_enc-actions' }, buttons)),
        idle
          ? h('p', { className: '__cm_enc-hint', style: { margin: 0, fontSize: 12, opacity: 0.7 } }, 'Noch kein Zug — der Beispielzug zeigt den Ablauf ohne Modellaufruf.')
          : h('ol', { className: '__cm_enc-rail' }, ENCOUNTER_RAIL.map((step, index) => h('li', {
              key: step.status, className: '__cm_enc-step',
              'data-state': finished ? 'done' : index < phase ? 'done' : index === phase ? 'active' : 'open',
            }, h('span', { className: '__cm_enc-dot', 'aria-hidden': 'true' }), h('span', null, step.label)))),
        s.status === 'preflight' || s.status === 'running' || s.status === 'validating'
          ? h(PreflightDeck, { s })
          : null,
        last === null ? null : h('p', {
          className: '__cm_enc-log',
          title: `${last.type} · ${last.outcome}${last.reason === null ? '' : ` (${last.reason})`}`,
        }, `${last.type.replace('encounter.', '')} · ${ENCOUNTER_VERDICTS[last.outcome] ?? last.outcome}${last.reason === null ? '' : ` · ${last.reason}`}`),
      );
    }

    function CodingmonPanel() {
      const s = useStore();
      const lvl = levelFor(s.xp);
      // Angezeigt wird die EXAKTE Leiter, gerechnet die schnelle Number-Fassung.
      const exact = Object.fromEntries(Object.entries(stats()).map(([key, value]) => [key, BigInt(value)]));

      // Der Kampf wohnt im Dock (WildDock), nicht hier: `main` zeigt Stand,
      // Regelwerk ohne Tabelle, Beute und Bilanz.
      return h('div', { className: '__cm_panel' },
        h(PetHead, { s, lvl, onPick: selectCreature }),
        h(StatsGrid, { stats: exact }),
        h(BreedingPanel, { s }),
        h(EscalationBlock, { s, lvl }),
        h(Rulebook, { s }),
        h(DropLedger, { s }),
        h(Ledger, { s }),
      );
    }

