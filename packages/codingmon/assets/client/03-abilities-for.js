    const abilitiesFor = (level, speciesId) => {
      const inherited = inheritedAbilities(speciesId);
      return ABILITIES.filter((ability) => ability.minLevel <= level
        && (ability.species === null || ability.species === speciesId || inherited.includes(ability.id)));
    };
    const formOf = (level) => STAGES[stageIndex(level)];

    /**
     * Der Schaden: BaseDamage * Element * Synergie * Buff - DEF * Durchgriff.
     * Fuenf Nachschlagevorgaenge, ein Minimum von 1, keine Zufallszahl.
     */
    const resolveAttack = (ability, attacker, defender) => {
      const category = CATEGORY[ability.kind] ?? CATEGORY.physisch;
      const element = (ELEMENT_CHART[attacker.element] ?? ELEMENT_CHART.spark)[defender.element] ?? 1;
      const synergy = SYNERGY[`${attacker.element}:${ability.kind}`] ?? 1;
      const buff = buffFor(ability, attacker);
      const base = (ability.power * (attacker.stats[ability.stat] ?? 0)) / POWER_UNIT;
      const dealt = Math.max(1, Math.round(base * element * synergy * buff.factor - defender.stats.def * category.defFactor));
      return { base, element, synergy, category: ability.kind, defFactor: category.defFactor, buff, dealt };
    };
    /** Kurzform: nur der Betrag. */
    const damageOf = (ability, attacker, defender) => resolveAttack(ability, attacker, defender).dealt;
    /** XP fuer einen Sieg. Waechst mit dem Level des Gegners — multiplikativ. */
    const rewardFor = (level) => powerAt(20, Math.min(LEVEL_CAP, Math.max(1, Math.floor(level) + 1)));
    const firstStrike = (challengerStats, enemyStats) => (challengerStats.agi >= enemyStats.agi ? 'challenger' : 'enemy');
    const arenaFor = (level, round) => {
      const lvl = Math.max(1, Math.floor(level));
      const rnd = Math.max(0, Math.floor(round));
      const speciesId = SPECIES_IDS[(lvl * 3 + rnd * 7) % SPECIES_IDS.length];
      const enemyLevel = Math.min(LEVEL_CAP, Math.max(1, lvl + ((rnd % 3) - 1)));
      return { speciesId, element: SPECIES[speciesId].family, level: enemyLevel, stats: statsAt(speciesId, enemyLevel), reward: rewardFor(enemyLevel) };
    };
    /** Die staerkste Faehigkeit eines Gegners. Determinismus statt Wuerfel. */
    const bestMove = (level, speciesId) =>
      abilitiesFor(level, speciesId).slice().sort((a, b) => b.power - a.power)[0] ?? ABILITIES[0];

    // ── SPAWN (Spiegel von assets/mechanik.js: SPAWN_EVERY/spawnFor/effectiveness)
    // Bewusst dupliziert wie der Rest dieses Vertrags (siehe Abschnitt 1): das
    // Bundle teilt keinen Code mit `assets/`. `durchstich.test.mjs` vergleicht
    // beide Seiten Zahl fuer Zahl, damit die Dopplung nicht auseinanderlaeuft.
    // Der Host meldet erfolgreiche Completions ueber readActivity; der Client
    // faltet den absoluten Zaehler rein. `localSteps` ist die zuletzt
    // konsumierte Completion-Zahl und macht den Spawn idempotent.
    const SPAWN_EVERY = 3;
    const spawnFor = (completions, level) => {
      const done = Math.max(0, Math.floor(completions ?? 0));
      if (done <= 0 || done % SPAWN_EVERY !== 0) return null;
      const lvl = Math.max(1, Math.floor(level ?? 1));
      const speciesId = SPECIES_IDS[(done * 7 + 3) % SPECIES_IDS.length];
      return { speciesId, element: SPECIES[speciesId].family, level: Math.min(LEVEL_CAP, Math.max(1, lvl + ((done % 3) - 1))) };
    };
    /**
     * Die Typwirkung als Zeichen statt Tabelle: dieselbe Zahl wie
     * `resolveAttack` nachschlaegt, mit Symbol (`x1,5` + Pfeil). Die
     * Kampfansicht zeigt das, keine Matrix.
     */
    const effectiveness = (attackerElement, defenderElement) => {
      const factor = (ELEMENT_CHART[attackerElement] ?? ELEMENT_CHART.spark)[defenderElement] ?? 1;
      return { factor, symbol: factor > 1 ? '▲' : factor < 1 ? '▼' : '●' };
    };

    // ── 3. PACING (kuenstliche Rundendauer) ─────────────────────────────────
    const PACING = { delayMs: 3000, lockedText: 'Codermon ist im Kampf, warte auf das Ergebnis' };
