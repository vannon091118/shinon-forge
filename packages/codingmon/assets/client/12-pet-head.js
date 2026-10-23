    // ── Panel-Bausteine (Kopf / Werte / Arena / Liste / Bilanz) ─────────────
    /** Kopf: Figur, Kreatur-Wahl (alle erreichbar), Level und Fortschritt. */
    function PetHead({ s, lvl, onPick }) {
      const cur = Object.fromEntries(Object.entries(stats()).map(([key, value]) => [key, BigInt(value)]));
      const next = threshold(lvl + 1);
      const prev = threshold(lvl);
      const lineage = LINEAGE[s.species] ?? {};
      return h('header', { className: '__cm_panel-head' },
        h('span', { className: '__cm_panel-stage' },
          h('span', { dangerouslySetInnerHTML: { __html: speciesGlyph(s.species, lvl, 72) } }),
          h('span', { className: '__cm_sub' }, formOf(lvl).label)),
        h('div', { className: '__cm_panel-id' },
          h('h2', null, `${s.name} — ${SPECIES[s.species].label}`),
          h('p', { className: '__cm_sub' },
            `Level ${lvl} · ${s.wins} Siege / ${s.losses} K.o. · Runde ${s.round} · ${ELEMENTS[SPECIES[s.species].family].label} · Abstammungstiefe ${lineage.depth ?? 1}`),
          h('p', { className: '__cm_xp' },
            `${formatNumber(s.xp)} XP (${digitsOf(s.xp)} Stellen) · ${lvl >= LEVEL_CAP ? 'Level-Cap erreicht' : `${formatNumber(Math.max(0, next - s.xp))} XP bis Level ${lvl + 1}`}`),
          h(Bar, { value: s.xp - prev, max: Math.max(1, next - prev), tone: 'xp' }),
          h('label', { className: '__cm_pick' },
            h('span', null, 'Codemon'),
            h('select', {
              value: s.breeding?.active ?? 'c1',
              onChange: (event) => onPick(event.target.value),
            }, (s.breeding?.creatures ?? []).map((creature) => h('option', { key: creature.id, value: creature.id }, `${SPECIES[creature.species].label} · Gen ${creature.gen} · L${levelFor(creature.xp)}`)))),
          // Ist-HP steht im Zustand (Number), Soll-HP in der exakten Leiter.
          // Oberhalb von 2^53 koennen sich die letzten Stellen unterscheiden —
          // die Leiter ist die Wahrheit, der Zustand ist der Spielstand.
          h('p', { className: '__cm_sub' }, `HP ${formatNumber(Math.max(0, s.hp))}/${formatNumber(cur.hp)}`),
        ),
      );
    }

    /**
     * Werte in einer Zeile — dieselben fuenf Zahlen wie im Vertrag, aber aus
     * der EXAKTEN Leiter (BigInt) und durch `formatNumber`: in Millionenhöhe mit
     * Trennzeichen, in Billionenhöhe immer noch als Ziffern und nicht als
     * „4.7e+298". Der Spieler soll die Nullen zaehlen koennen, nicht raten.
     */
    function StatsGrid({ stats }) {
      return h('div', { className: '__cm_stats' },
        [['HP', stats.hp], ['ATK', stats.atk], ['DEF', stats.def], ['AGI', stats.agi], ['INT', stats.int]]
          .map(([label, value]) => h('div', { className: '__cm_stat', key: label },
            h('span', { className: '__cm_stat-k' }, label),
            h('span', { className: '__cm_stat-v' }, formatNumber(value)))));
    }

    // ENTFERNT (WEG b): `Arena` + `ArenaSide` (`__cm_arena` im Panel `main`)
    // sind ins Dock gezogen (`WildDock`/`DockBattle`) — der Kampf laeuft im
    // Chat-Bereich. `startBattle`, `rest` und `useAbility` bleiben: als
    // Fenster-API und fuer den Dock-Kampf.
    // ENTFERNT (WEG b): `Arena` + `ArenaSide` (`__cm_arena` im Panel `main`)
    // sind ins Dock gezogen (`WildDock`/`DockBattle`) — der Kampf laeuft im
    // Chat-Bereich. `startBattle`, `rest` und `useAbility` bleiben: als
    // Fenster-API und fuer den Dock-Kampf.
    /**
     * ESKALATION: was eine Stufe ausmacht. Die Zahlen stehen formatiert da,
     * weil die Aussage die Zahl ist: Schwelle, Werte und Lohn wachsen
     * multiplikativ (x1,35 je Stufe), und der Lebenslauf steht daneben als
     * BigInt — in Millionenhöhe exakt und nicht gerundet. Der Stellensprung
     * (zwei- auf fuenfstellig) ist damit der Beweis der investierten Zeit und
     * keine Behauptung: er steht als Meilenstein mit Wert und Datum im Log.
     */
    function EscalationBlock({ s, lvl }) {
      const next = threshold(lvl + 1);
      const base = statsAtExact(s.species, 1);
      const ladder = statsAtExact(s.species, lvl);
      const peak = Math.max(0, Math.round(s.peakHit));
      const upcoming = MILESTONES.find((mark) => BigInt(mark) > s.damageTotal) ?? null;
      return h('div', { className: '__cm_block' },
        h('h3', null, `Eskalation — ${ESCALATION.perLevel} je Stufe`),
        h('ul', { className: '__cm_facts' },
          h('li', { key: 'threshold' },
            `Schwelle L${lvl + 1}: ${formatNumber(next)} XP (L1 ${formatNumber(threshold(1))}, L20 ${formatNumber(threshold(20))}, L50 ${formatNumber(threshold(50))})`),
          h('li', { key: 'stats' },
            `Werte L${lvl}: HP ${formatNumber(ladder.hp)} · ATK ${formatNumber(ladder.atk)} — auf L1: HP ${formatNumber(base.hp)} · ATK ${formatNumber(base.atk)} (Basislleiter, exakt)`),
          h('li', { key: 'cap' },
            `Decke: Level ${formatNumber(LEVEL_CAP)} — die Werte skalieren linear; darüber bleibt das Level auf der Decke`),
          h('li', { key: 'hit' }, `Groesster Treffer: ${formatNumber(peak)} (${digitsOf(peak)} Stellen)`),
          h('li', { key: 'total' }, `Lebenslauf: ${formatNumber(s.damageTotal)} Schaden in ${formatNumber(s.hits)} Treffern (BigInt, exakt)`),
          h('li', { key: 'digits' }, `Stellen: ${digitsOf(s.damageTotal)}`
            + (upcoming === null ? ' — alle Meilensteine erreicht' : ` — naechster Meilenstein ${formatNumber(upcoming)}`))),
        s.milestones.length === 0 ? null : h('ol', { className: '__cm_milestones' },
          s.milestones.slice(0, 5).map((entry, index) => h('li', { key: `${index}-${entry.at}` },
            `MEILENSTEIN ${formatNumber(entry.mark)}+ · ${entry.kind} · ${entry.label} → ${formatNumber(entry.value)} (${entry.digits} Stellen)`))));
    }

    /**
     * DAS REGELWERK, offen lesbar: Elementkreis, Synergie, Durchgriff, Buffs und
     * der Vererbungsbaum. Das System rechnet nicht klug, es schlaegt nach — wer
     * gewinnen will, muss die Tabelle lesen. Deshalb steht sie im Panel und
     * nicht in einer Hilfe.
     */
    function Rulebook({ s }) {
      const element = SPECIES[s.species].family;
      const lineage = LINEAGE[s.species] ?? {};
      const chain = [];
      let cursor = s.species;
      while (cursor !== undefined && cursor !== null && LINEAGE[cursor] !== undefined) {
        chain.push(cursor);
        cursor = LINEAGE[cursor].ancestor;
      }
      const abilityLabel = (id) => (ABILITIES.find((ability) => ability.id === id) ?? { label: id }).label;
      // Keine Matrix: die eigene Zeile als Zeichen (`×1,5 ▲` statt Tabelle).
      const row = Object.keys(ELEMENTS).map((defender) => {
        const hit = effectiveness(element, defender);
        return `${ELEMENTS[defender].label} ×${String(hit.factor).replace('.', ',')} ${hit.symbol}`;
      }).join(' · ');
      return h('div', { className: '__cm_block' },
        h('h3', null, 'Regelwerk (statisch)'),
        h('ul', { className: '__cm_facts' },
          h('li', { key: 'wirkung' }, `Wirkung (${ELEMENTS[element].label}): ${row}`),
          h('li', { key: 'own' },
            `Eigenes Element: ${ELEMENTS[element].label} — schlaegt ${ELEMENTS[ELEMENTS[element].beats].label}, verliert gegen ${ELEMENTS[ELEMENTS[element].losesTo].label}`),
          h('li', { key: 'synergy' },
            `Synergie: speziell ${SYNERGY[`${element}:speziell`]}x · physisch ${SYNERGY[`${element}:physisch`]}x`),
          h('li', { key: 'category' },
            `Durchgriff: physisch ${CATEGORY.physisch.defFactor} · speziell ${CATEGORY.speziell.defFactor}`),
          h('li', { key: 'buff' }, `Buffs: ${BUFFS.map((buff) => `${buff.label} ${buff.factor}x`).join(' · ')}`),
          h('li', { key: 'line' },
            `Linie: ${chain.map((id) => SPECIES[id].label).join(' → ')} (Abstammungstiefe ${lineage.depth ?? 1})`),
          h('li', { key: 'inherits' },
            `Erbfaehigkeiten: ${(lineage.inherits ?? []).map(abilityLabel).join(', ') || 'keine'}`)),
        h('p', { className: '__cm_sub' },
          'Der Schaden ist BaseDamage x Element x Synergie x Buff - DEF x Durchgriff — fuenf Nachschlagevorgaenge, kein Zweig.'));
    }

    /**
     * DIE SKINNER-BOX, offen: Quoten und Zaehler stehen da. Es gibt keine Gnade
     * und keinen Pity-Timer — nur die Zahl der Siege seit dem letzten Shiny,
     * damit die irrationale Erwartung eine Anzeige hat.
     */
    function DropLedger({ s }) {
      return h('div', { className: '__cm_block' },
        h('h3', null, `Beute — ${formatNumber(s.loot.shiny)} shiny`),
        h('ul', { className: '__cm_facts' },
          lootWeightsFor(activeCreature()).map((entry) => h('li', { key: entry.id },
            `${entry.label}: ${lootOdds(entry, activeCreature())} % — ${formatNumber(s.loot[entry.id] ?? 0)} gefunden`)),
          h('li', { key: 'streak' }, `${formatNumber(s.sinceShiny)} Siege seit dem letzten Shiny`)),
        s.drops.length === 0 ? null : h('ul', { className: '__cm_log' },
          s.drops.slice(0, 5).map((drop, index) => h('li', { key: `${index}-${drop.at}` }, `${drop.label} (Gegner L${drop.level})`))));
    }

    /** Bilanz und Log. Die Zahlen kommen aus dem Store, nicht aus der Darstellung. */
    function Ledger({ s }) {
      return h('div', { className: '__cm_block' },
        h('h3', null, `Bilanz — ${s.wins} Siege / ${s.losses} K.o.`),
        h('p', { className: '__cm_sub' },
          '1 XP pro Token · Sieg XP nach Gegner-Level (multiplikativ) · jede Runde verzoegert, kein Input waehrend eines Zuges'),
        h('ul', { className: '__cm_log' },
          s.log.slice(0, 12).map((line, index) => h('li', { key: `${index}-${line}` }, line))));
    }

    /**
     * Die Kampf-Textbox: tippt die letzte Log-Zeile Zeichen fuer Zeichen
     * (Gen-1), mit blinkendem Cursor. Reine Darstellung — der Text steht,
     * bevor das erste Zeichen faellt. Mit `prefers-reduced-motion` oder ohne
     * Timer-Umgebung steht die Zeile sofort da.
     */
    function TypeLine({ text }) {
      const [shown, setShown] = React.useState(text);
      React.useEffect(() => {
        if (shown !== text) return undefined;
        if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return undefined;
        if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return undefined;
        setShown('');
        let i = 0;
        const timer = window.setInterval(() => {
          i += 1;
          setShown(text.slice(0, i));
          if (i >= text.length) window.clearInterval(timer);
        }, 24);
        return () => window.clearInterval(timer);
      }, [text]);
      return h('p', { className: '__cm_type' }, shown, h('span', { className: '__cm_cursor' }, '▌'));
    }

    /**
     * Die Sperre als eigene Zeile: Balken ueber die Vertragsdauer, Absagesatz
     * aus dem Vertrag, Zaehler der kalten Abweisungen. Auch ohne Kampf — ein
     * beginnender Zug (`start`, `challenge`) hat noch kein `battle`.
     */
    function LockNotice({ s }) {
      if (s.lock === null) return null;
      return h('div', { className: '__cm_lock' },
        h('span', { className: '__cm_lock-text' }, PACING.lockedText),
        h('span', { className: '__cm_lock-track' },
          h('span', { className: '__cm_lock-fill', style: { animationDuration: `${roundDelayMs}ms` } })),
        h('span', { className: '__cm_sub' },
          `Zug ${s.lock.action} — ${s.rejections} abgewiesene Eingabe${s.rejections === 1 ? '' : 'n'}`));
    }

