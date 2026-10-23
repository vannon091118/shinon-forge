    /** Den eingefrorenen Gegner aufstellen; schlaegt er zuerst, tut er es sofort. */
    function openBattle(frozen, payload) {
      const arena = payload.arena;
      store.battle = {
        speciesId: arena.speciesId,
        element: arena.element,
        level: arena.level,
        hp: arena.stats.hp,
        maxHp: arena.stats.hp,
        stats: arena.stats,
        reward: arena.reward,
        turn: firstStrike(frozen.stats, arena.stats),
        source: arena.source ?? 'arena',
        over: null,
      };
      note(`Runde ${store.round}: ${SPECIES[arena.speciesId].label} L${arena.level} erscheint (${formatNumber(arena.reward)} XP)`);
      if (store.battle.turn === 'enemy') enemyAnswer();
      return { locked: false, battle: { ...store.battle } };
    }

    /**
     * Die gewaehlte Faehigkeit aus dem EINGEFRORENEN Stand ausfuehren. Der
     * Gegner antwortet im selben Block: ein Klick ergibt genau eine Runde, nie
     * zwei halbe.
     */
    function strike(frozen, payload) {
      const battle = store.battle;
      if (battle === null || battle.over !== null) return null;
      const known = abilitiesFor(frozen.level, frozen.species);
      const move = known.find((ability) => ability.id === payload.abilityId) ?? known[0];
      const attacker = {
        element: SPECIES[frozen.species].family,
        stats: frozen.stats,
        hp: frozen.hp,
        maxHp: frozen.stats.hp,
        inherited: frozen.inherited,
      };
      const result = resolveAttack(move, attacker, battle);
      battle.hp = Math.max(0, battle.hp - result.dealt);
      bookHit(result.dealt, `${move.label} gegen ${SPECIES[battle.speciesId].label}`);
      note(`${move.label} —${formatNumber(result.dealt)} (Element ${result.element}x${result.category === 'speziell' ? `, Durchgriff ${result.defFactor}` : ''}`
        + `${result.buff.id === 'neutral' ? '' : `, ${result.buff.label} ${result.buff.factor}x`}) — Gegner ${formatNumber(battle.hp)}/${formatNumber(battle.maxHp)} HP`);
      let outcome = null;
      if (battle.hp <= 0) outcome = finish('win', battle);
      else {
        battle.turn = 'enemy';
        outcome = enemyAnswer();
      }
      return { move: move.id, dealt: result.dealt, factors: result, battle: { ...battle }, outcome };
    }

    /** Der Gegner schlaegt zurueck — dieselbe reine Kette, sein Stand. */
    function enemyAnswer() {
      const battle = store.battle;
      if (battle === null || battle.over !== null) return null;
      const move = bestMove(battle.level, battle.speciesId);
      const attacker = {
        element: battle.element ?? SPECIES[battle.speciesId].family,
        stats: battle.stats,
        hp: battle.hp,
        maxHp: battle.maxHp,
        inherited: [],
      };
      const result = resolveAttack(move, attacker, { element: SPECIES[store.species].family, stats: stats() });
      store.hp = Math.max(0, store.hp - result.dealt);
      note(`${SPECIES[battle.speciesId].label} nutzt ${move.label} —${formatNumber(result.dealt)} (Element ${result.element}x) — eigenes HP ${formatNumber(store.hp)}/${formatNumber(maxHp())}`);
      if (store.hp <= 0) return finish('loss', battle);
      battle.turn = 'challenger';
      return null;
    }

    /**
     * Eine Faehigkeit waehlen: sie wird nicht gerechnet, sie wird als Zug
     * begonnen. Die Sperre wird ZUERST geprueft — auch ein Klick auf einen
     * ausgegrauten Knopf ist ein Klick und bekommt die Absage, nicht ein
     * stilles Nichts.
     */
    function useAbility(abilityId) {
      if (!guard('use')) return null;
      const battle = store.battle;
      if (battle === null || battle.over !== null || battle.turn !== 'challenger') return null;
      const lock = beginTurn('use', { abilityId });
      return lock === null ? null : { locked: true, until: lock.until, abilityId };
    }

    /**
     * Kampfende. Der Sieg zahlt XP (die einzige XP-Quelle neben den Token) UND
     * rollt die Beute: ein Wurf, ein Ergebnis. Der Zaehler `sinceShiny` macht
     * die Quote sichtbar, ohne sie zu verbessern — es gibt keine Gnade, nur
     * eine Zahl, die zeigt, wie lange man schon leer ausgeht.
     */
    function finish(outcome, battle) {
      battle.over = outcome;
      // Das Ergebnis endet im Chat (`conversation.chat.turnTail` liest es).
      store.lastResult = {
        outcome,
        speciesId: battle.speciesId,
        level: battle.level,
        reward: outcome === 'win' ? battle.reward : 0,
        at: Date.now(),
      };
      if (outcome === 'win') {
        store.wins += 1;
        const reward = battle.reward;
        const shinyBefore = store.loot.shiny;
        store.battle = null;
        const luckSource = activeCreature();
        const drop = rollLoot(Math.random(), luckSource);
        store.loot[drop.id] += 1;
        store.sinceShiny = drop.id === 'shiny' ? 0 : store.sinceShiny + 1;
        store.drops = [{ at: Date.now(), id: drop.id, label: drop.label, level: battle.level }, ...store.drops].slice(0, 20);
        note(`Sieg gegen ${SPECIES[battle.speciesId].label} L${battle.level} — +${formatNumber(reward)} XP · Beute: ${drop.label} (${lootOdds(drop, luckSource)} %)`
          + `${drop.id === 'shiny' ? ' — SHINY!' : ` · ${store.sinceShiny} Siege seit dem letzten Shiny`}`);
        if (drop.id === 'shiny') celebrate('beute', shinyBefore, store.loot.shiny, drop.label);
        if (battle.source === 'wild') addCapturedCreature(battle.speciesId, battle.level);
        award(reward + drop.xp, null);
      } else {
        store.losses += 1;
        store.battle = null;
        store.hp = maxHp();
        note(`K.o. gegen ${SPECIES[battle.speciesId].label} L${battle.level} — das Codemon rappelt sich wieder auf`);
      }
      return outcome;
    }

    /** Rast: HP auffuellen. Kein Sieg, kein XP — und waehrend eines Zuges nichts. */
    function rest() {
      if (!guard('rest')) return null;
      if (store.battle !== null) return null;
      store.hp = maxHp();
      note('Rast — HP aufgefrischt');
      persist();
      emit();
      return { hp: store.hp };
    }

    /** Spezies wechseln. Der Fortschritt (XP, Siege, Beute) bleibt, der Kampf endet. */
    function pickSpecies(speciesId) {
      if (!SPECIES[speciesId]) return null;
      if (!guard('pick')) return null;
      store.species = speciesId;
      store.battle = null;
      store.hp = statsAt(speciesId, level()).hp;
      note(`Gewechselt zu ${SPECIES[speciesId].label} (Abstammungstiefe ${(LINEAGE[speciesId] ?? {}).depth ?? 1})`);
      persist();
      emit();
      return { species: speciesId };
    }

    function selectCreature(creatureId) {
      if (!guard('pick')) return null;
      const target = store.breeding.creatures.find((creature) => creature.id === creatureId);
      if (!target) return null;
      syncActiveCreature();
      store.breeding.active = target.id;
      store.species = target.species;
      store.xp = target.xp;
      store.wins = target.wins;
      store.losses = target.losses;
      store.round = target.round;
      store.hits = target.hits;
      try { store.damageTotal = BigInt(target.damageTotal ?? '0'); } catch { store.damageTotal = 0n; }
      const maximum = effectiveStatsFor(target.species, levelFor(target.xp), target).hp;
      store.hp = Number.isFinite(target.hp) ? Math.max(0, Math.min(maximum, target.hp)) : maximum;
      if (store.hp <= 0) store.hp = maximum;
      store.battle = null;
      note(`Aktiv: ${SPECIES[target.species].label} · Gen ${target.gen} · ZE ${target.bxp}`);
      persist();
      toHost();
      emit();
      return { active: target.id, species: target.species };
    }
    function pairCreatures(idA, idB, selectedSpecies) {
      if (!guard('breed')) return null;
      const breeding = {
        ...store.breeding,
        creatures: store.breeding.creatures.map((creature) => ({ ...creature, bonuses: creature.bonuses.map((bonus) => ({ ...bonus })) })),
        eggs: store.breeding.eggs.map((egg) => ({ ...egg, parents: egg.parents.slice(), bonuses: egg.bonuses.map((bonus) => ({ ...bonus })) })),
        loot: { ...store.loot },
      };
      const eggId = breedingPairCore(breeding, idA, idB, selectedSpecies);
      const { loot, ...breedingState } = breeding;
      store.breeding = breedingState;
      store.loot = loot;
      const egg = store.breeding.eggs.find((entry) => entry.id === eggId);
      note(`PAARUNG — Ei ${eggId} · ${SPECIES[egg.species].label} · Gen ${egg.gen} · Brut ${egg.bp}/${HATCH_BP}`);
      persist();
      toHost();
      emit();
      return { eggId, species: egg.species, gen: egg.gen, bp: egg.bp };
    }

