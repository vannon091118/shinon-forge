    function addCapturedCreature(speciesId, lvl) {
      if (!SPECIES[speciesId]) return null;
      const breeding = store.breeding;
      const nextId = Number.isSafeInteger(breeding.nextId) && breeding.nextId > 0 ? breeding.nextId : 1;
      if (nextId >= Number.MAX_SAFE_INTEGER) return null;
      const xp = threshold(Math.min(LEVEL_CAP, Math.max(1, Math.floor(lvl))));
      const creature = {
        id: `c${nextId}`, species: speciesId, xp, bxp: BXP_FOUNDER, gen: 1,
        bonuses: [], clutch: 0, wins: 0, losses: 0, round: 0, hits: 0,
        damageTotal: '0', hp: statsAt(speciesId, levelFor(xp)).hp,
      };
      breeding.creatures.push(creature);
      breeding.nextId = nextId + 1;
      note(`FANG — ${SPECIES[speciesId].label} ist der Sammlung beigetreten (${creature.id})`);
      return creature.id;
    }

    const freshState = (speciesId = SPECIES_IDS[0]) => ({
      version: STORE_VERSION,
      name: 'Codingmon',
      species: speciesId,
      xp: 0,
      hp: statsAt(speciesId, 1).hp,
      wins: 0,
      losses: 0,
      round: 0,
      battle: null,
      breeding: createBreedingState(speciesId),
      /**
       * Erfolgreiche Agent-Completions (J3) und das wilde Codemon (J2): Der Host
       * zaehlt bestaetigte `turn/end`-Ereignisse, der Client waendet die Differenz
       * aus `readActivity` an und spiegelt den Stand zurueck. `wild`
       * ist `null` oder `{ speciesId, level, hp, maxHp }`; der KAMPF (`battle`)
       * bleibt Browsersache und geht nie auf die Platte des Hosts.
       */
      completions: 0,
      wild: null,
      /**
       * Letzter Host-Completion-Zaehler und Verbrauchsstand des Spawns.
       * `spawnedAt` verhindert die Dauerschleife: Nach Kampf oder Flucht steht
       * der Zaehler noch auf dem Vielfachen — ohne Marke kaeme der Ball sofort wieder.
       */
      localSteps: 0,
      spawnedAt: 0,
      /** Das letzte Kampfergebnis fuer `conversation.chat.turnTail` (oder null). */
      lastResult: null,
      log: [],
      /**
       * Der Lebenslauf. `damageTotal` ist die Summe allen Schadens und wird als
       * BigInt gefuehrt: bei Level 50 stehen hier Betraege in Millionenhöhe, und
       * eine Zahl, die man nachrechnen will, darf nicht ab 2^53 runden. JSON
       * kennt kein BigInt — persist() schreibt den Dezimaltext, revive() liest
       * ihn zurueck.
       */
      damageTotal: 0n,
      hits: 0,
      peakHit: 0,
      digits: 1,
      milestones: [],
      /** Beutezaehler und die letzten Funde. Reine Zahlen, keine Deutung. */
      loot: { schrott: 0, brauchbar: 0, shiny: 0 },
      drops: [],
      sinceShiny: 0,
      /** Die Sperre. Nicht null = ein Zug laeuft und nimmt keinen Input an. */
      lock: null,
      rejections: 0,
    });

    /**
     * Einen gelesenen Stand BRAUCHBAR machen: ein Pet aus einer aelteren Fassung
     * (die drei Spezies spark/byte/feral, kein Regelwerk, kein BigInt) darf den
     * Client nicht mit `undefined`-Werten in die Arena schicken. Unbekannte
     * Spezies fallen auf die erste zurueck, ein Kampf mit unbekanntem Gegner
     * wird verworfen — XP, Siege, Beute und Log bleiben.
     */
    function revive(raw) {
      const state = { ...freshState(), ...(raw ?? {}) };
      if (!SPECIES[state.species]) state.species = SPECIES_IDS[0];
      if (!Number.isFinite(state.xp) || state.xp < 0) state.xp = 0;
      if (!Number.isFinite(state.round) || state.round < 0) state.round = 0;
      if (!Number.isInteger(state.completions) || state.completions < 0) state.completions = 0;
      if (!Number.isInteger(state.localSteps) || state.localSteps < 0) state.localSteps = 0;
      if (!Number.isInteger(state.spawnedAt) || state.spawnedAt < 0) state.spawnedAt = 0;
      // Ein Ergebnis aus einer fremden Fassung ist kein Ergebnis: Ausgang,
      // Art und Stufe muessen stimmen, sonst steht im Chat ein Sieg ueber nichts.
      const result = state.lastResult;
      const resultOk = result !== null && typeof result === 'object'
        && (result.outcome === 'win' || result.outcome === 'loss' || result.outcome === 'flee')
        && SPECIES[result.speciesId] !== undefined
        && Number.isInteger(result.level) && result.level >= 1;
      state.lastResult = resultOk
        ? { outcome: result.outcome, speciesId: result.speciesId, level: result.level, reward: Math.max(0, Math.floor(result.reward ?? 0)), at: result.at ?? null }
        : null;
      // Ein Wild aus einer fremden Fassung ist kein Wild: Art, Stufe und HP
      // muessen stimmen, sonst steht hier ein Kampf gegen nichts (J2 ohne Luege).
      const wild = state.wild;
      const wildOk = wild !== null && typeof wild === 'object'
        && SPECIES[wild.speciesId] !== undefined
        && Number.isInteger(wild.level) && wild.level >= 1
        && Number.isFinite(wild.hp) && wild.hp >= 0
        && Number.isFinite(wild.maxHp) && wild.maxHp >= 1;
      state.wild = wildOk
        ? { speciesId: wild.speciesId, level: wild.level, hp: Math.min(wild.hp, wild.maxHp), maxHp: wild.maxHp }
        : null;
      try {
        state.damageTotal = BigInt(raw?.damageTotal ?? 0);
      } catch {
        state.damageTotal = 0n;
      }
      if (state.damageTotal < 0n) state.damageTotal = 0n;
      // Siege/Niederlagen stroemen in Anzeige UND Host-Spiegel: ein Stand mit
      // `{wins:'viele'}` ergab sonst den Zaehler „viele1" (String-Concat statt
      // Sieg) und fiel beim Host durch die Ganzzahl-Pruefung. Wie die Beute
      // wird auch hier WERT geprueft, nicht nur Existenz.
      for (const key of ['wins', 'losses', 'hits', 'peakHit', 'digits', 'sinceShiny', 'rejections']) {
        if (!Number.isFinite(state[key]) || state[key] < 0) state[key] = 0;
      }
      if (state.digits < 1) state.digits = 1;
      // Die Beute wird WERT FUER WERT geprueft, nicht nur auf Existenz: ein
      // Stand mit `{schrott:'viele'}` ergab sonst den Zaehler „viele1" und die
      // Panel-Zeile „Schrott: 85 % — viele1 gefunden". Nur die Schluessel des
      // Vertrags zaehlen, alles andere faellt auf 0 zurueck.
      const rawLoot = (state.loot !== null && typeof state.loot === 'object') ? state.loot : {};
      state.loot = Object.fromEntries(Object.entries(freshState().loot).map(([id, fallback]) => {
        const value = rawLoot[id];
        return [id, Number.isFinite(value) && value >= 0 ? Math.floor(value) : fallback];
      }));
      state.milestones = Array.isArray(state.milestones) ? state.milestones : [];
      state.drops = Array.isArray(state.drops) ? state.drops : [];
      const battle = state.battle;
      const usable = battle !== null && typeof battle === 'object' && SPECIES[battle.speciesId]
        && Number.isFinite(battle.hp) && Number.isFinite(battle.maxHp);
      state.battle = usable ? battle : null;
      // Das Log ist Anzeige, kein Vertrag: ein korrupter Eintrag (keine
      // Zeichenkette, kein Array) wuerde die naechste Mutation (`note` streut
      // das Log) oder die Kampf-Textbox (`TypeLine` schneidet zu) werfen
      // lassen. Fremde Zeilen fallen weg, echte bleiben — vor dem Sperr-Zweig,
      // der das Log ebenfalls streut.
      state.log = Array.isArray(state.log)
        ? state.log.filter((line) => typeof line === 'string').slice(0, 40)
        : [];
      // Eine Sperre haengt an einem Timer, und der ueberlebt das Neuladen nicht.
      // Ein Stand mit gesetzter Sperre waere eine Wartezeit ohne Uhr: der Spieler
      // wartete fuer immer. Also faellt der Zug, und das Log sagt es.
      if (state.lock !== null && state.lock !== undefined) {
        const pending = state.lock.action;
        state.lock = null;
        state.log = [`${new Date().toLocaleTimeString('de-DE')}  Neuladen mitten im Zug (${pending}) — der Zug ist verfallen`, ...(state.log ?? [])].slice(0, 40);
      }
      if (!Number.isFinite(state.hp) || state.hp <= 0) state.hp = statsAt(state.species, levelFor(state.xp)).hp;
      state.breeding = normalizeBreeding(raw?.breeding, state);
      state.version = STORE_VERSION;
      if (!state.breeding.creatures.some((creature) => creature.id === state.breeding.active)) {
        state.breeding.active = state.breeding.creatures[0]?.id ?? 'c1';
      }
      const active = state.breeding.creatures.find((creature) => creature.id === state.breeding.active);
      if (active) {
        state.species = active.species;
        state.xp = active.xp;
        state.wins = active.wins;
        state.losses = active.losses;
        state.round = active.round;
        state.hits = active.hits;
        try { state.damageTotal = BigInt(active.damageTotal); } catch { state.damageTotal = 0n; }
        const activeMaxHp = effectiveStatsFor(active.species, levelFor(active.xp), active).hp;
        state.hp = Number.isFinite(active.hp) ? Math.max(0, Math.min(activeMaxHp, active.hp)) : activeMaxHp;
        if (state.hp <= 0) state.hp = activeMaxHp;
      }
      state.completions = Math.max(state.completions, state.breeding.completions);
      return state;
    }

    /** Der Stand, wie er auf die Platte geht: BigInt als Dezimaltext. */
    const portable = () => ({ ...store, damageTotal: store.damageTotal.toString() });

    let store = freshState();
    try {
      const raw = window.localStorage?.getItem(STORAGE_KEY);
      if (raw) store = revive(JSON.parse(raw));
    } catch { /* kein Storage: das Pet lebt dann nur in dieser Sitzung */ }

    function persistNow() {
      try { window.localStorage?.setItem(STORAGE_KEY, JSON.stringify(portable())); } catch { /* siehe oben */ }
    }
    const persist = () => {
      syncActiveCreature();
      if (mutationBatchDepth > 0) { pendingPersistence = true; return; }
      persistNow();
    };

