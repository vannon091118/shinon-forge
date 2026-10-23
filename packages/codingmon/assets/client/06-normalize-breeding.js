    function normalizeBreeding(raw, legacyState) {
      if (raw?.schemaVersion !== BREEDING_VERSION || !Array.isArray(raw.creatures) || !Array.isArray(raw.eggs)) {
        return createBreedingState(legacyState.species, legacyState);
      }
      const creatures = [];
      const ids = new Set();
      for (const value of raw.creatures) {
        if (!value || typeof value !== 'object' || !/^c[1-9]\d*$/.test(value.id ?? '')
          || ids.has(value.id) || !SPECIES[value.species]) continue;
        const bonuses = Array.isArray(value.bonuses) ? value.bonuses.filter((bonus) =>
          Number.isSafeInteger(bonus?.slot) && bonus.slot >= 0 && typeof bonus.id === 'string'
          && BREEDING_EFFECTS.has(bonus.effect) && Number.isSafeInteger(bonus.value) && bonus.value >= 0)
          .map((bonus) => ({ slot: bonus.slot, id: bonus.id, effect: bonus.effect, value: bonus.value })) : [];
        const creature = {
          id: value.id, species: value.species,
          xp: Number.isFinite(value.xp) && value.xp >= 0 ? value.xp : 0,
          bxp: Number.isSafeInteger(value.bxp) && value.bxp >= 0 ? value.bxp : BXP_FOUNDER,
          gen: Number.isSafeInteger(value.gen) && value.gen >= 1 ? value.gen : 1,
          bonuses, clutch: Number.isSafeInteger(value.clutch) && value.clutch >= 0 ? value.clutch : 0,
          wins: Number.isSafeInteger(value.wins) && value.wins >= 0 ? value.wins : 0,
          losses: Number.isSafeInteger(value.losses) && value.losses >= 0 ? value.losses : 0,
          round: Number.isSafeInteger(value.round) && value.round >= 0 ? value.round : 0,
          hits: Number.isSafeInteger(value.hits) && value.hits >= 0 ? value.hits : 0,
          damageTotal: /^\d+$/.test(String(value.damageTotal ?? '')) ? String(value.damageTotal) : '0',
          hp: Number.isFinite(value.hp) && value.hp >= 0 ? value.hp : statsAt(value.species, levelFor(value.xp ?? 0)).hp,
        };
        ids.add(creature.id);
        creatures.push(creature);
      }
      if (creatures.length === 0) return createBreedingState(legacyState.species, legacyState);
      const creatureIds = new Set(creatures.map((creature) => creature.id));
      const eggs = [];
      for (const egg of raw.eggs) {
        if (!egg || typeof egg !== 'object' || !/^e[1-9]\d*$/.test(egg.id ?? '') || ids.has(egg.id)
          || !SPECIES[egg.species] || !Array.isArray(egg.parents) || egg.parents.length !== 2
          || egg.parents[0] === egg.parents[1] || egg.parents.some((id) => !creatureIds.has(id))
          || !Number.isSafeInteger(egg.gen) || egg.gen < 2 || !Number.isSafeInteger(egg.bp) || egg.bp < 0) continue;
        const bonuses = Array.isArray(egg.bonuses) ? egg.bonuses.filter((bonus) =>
          Number.isSafeInteger(bonus?.slot) && bonus.slot >= 0 && typeof bonus.id === 'string'
          && BREEDING_EFFECTS.has(bonus.effect) && Number.isSafeInteger(bonus.value) && bonus.value >= 0)
          .map((bonus) => ({ slot: bonus.slot, id: bonus.id, effect: bonus.effect, value: bonus.value })) : [];
        ids.add(egg.id);
        eggs.push({
          id: egg.id, seed: Number.isSafeInteger(egg.seed) && egg.seed >= 0 ? egg.seed : raw.seed >>> 0,
          parents: egg.parents.slice(), species: egg.species, gen: egg.gen, bonuses, bp: egg.bp,
        });
      }
      const maxId = [...ids].reduce((max, id) => Math.max(max, Number(id.slice(1)) || 0), 0);
      const completions = Number.isSafeInteger(raw.completions) && raw.completions >= 0 ? raw.completions : legacyState.completions;
      return {
        schemaVersion: BREEDING_VERSION,
        seed: Number.isSafeInteger(raw.seed) && raw.seed >= 0 && raw.seed <= 0xffffffff ? raw.seed : 0,
        nextId: Math.max(maxId + 1, Number.isSafeInteger(raw.nextId) && raw.nextId >= 1 ? raw.nextId : 1),
        active: creatureIds.has(raw.active) ? raw.active : creatures[0].id,
        creatures, eggs,
        completions: Math.max(completions, legacyState.completions ?? 0),
      };
    }
    let mutationBatchDepth = 0;
    let pendingPersistence = false;
    let pendingHostSnapshot = false;
    let pendingRender = false;
    function withMutationBatch(fn) {
      mutationBatchDepth += 1;
      try { return fn(); }
      finally {
        mutationBatchDepth -= 1;
        if (mutationBatchDepth === 0) {
          const writeLocal = pendingPersistence;
          const sendHost = pendingHostSnapshot;
          const render = pendingRender;
          pendingPersistence = false;
          pendingHostSnapshot = false;
          pendingRender = false;
          if (writeLocal) persistNow();
          if (sendHost) sendSnapshotNow();
          if (render) emit();
        }
      }
    }
    function activeCreature() {
      const breeding = typeof store === 'undefined' ? null : store?.breeding;
      return breeding?.creatures?.find((creature) => creature.id === breeding.active) ?? null;
    }
    function syncActiveCreature() {
      const creature = activeCreature();
      if (!creature) return;
      creature.species = store.species;
      creature.xp = Math.max(0, store.xp);
      creature.wins = store.wins;
      creature.losses = store.losses;
      creature.round = store.round;
      creature.hits = store.hits;
      creature.damageTotal = store.damageTotal.toString();
      creature.hp = store.hp;
    }
    function effectiveStatsFor(speciesId, lvl, creature = null) {
      const raw = statsAt(speciesId, lvl);
      if (!creature || creature.species !== speciesId) return raw;
      const bonuses = breedingMods(creature.bonuses);
      const bxpMod = breedClamp((creature.bxp - BXP_NEUTRAL) * BXP_BPS_PER_POINT, -MOD_CAP_BPS, MOD_CAP_BPS);
      const combined = breedClamp(bxpMod + bonuses.statMod, -MOD_CAP_BPS, MOD_CAP_BPS);
      return Object.fromEntries(Object.entries(raw).map(([key, value]) => [
        key, Math.floor((value * (10000 + combined)) / 10000),
      ]));
    }
    const childChoice = (list) => list.slice().sort((a, b) => (b.bxp - a.bxp) || a.parentId.localeCompare(b.parentId) || a.species.localeCompare(b.species))[0];
    function breedingCandidateDetails(a, b) { if (!a || !b) return [];
      const candidates = [...Object.keys(LINEAGE).filter((id) => LINEAGE[id]?.ancestor === a.species).map((species) => ({ species, bxp: a.bxp, parentId: a.id })), ...Object.keys(LINEAGE).filter((id) => LINEAGE[id]?.ancestor === b.species).map((species) => ({ species, bxp: b.bxp, parentId: b.id }))];
      const source = candidates.length ? candidates : [{ species: a.species, bxp: a.bxp, parentId: a.id }, { species: b.species, bxp: b.bxp, parentId: b.id }], bySpecies = new Map();
      for (const candidate of source) { const previous = bySpecies.get(candidate.species); if (!previous || childChoice([previous, candidate]) === candidate) bySpecies.set(candidate.species, candidate); }
      return [...bySpecies.values()].sort((x, y) => x.species.localeCompare(y.species)); }
    const breedingCandidates = (a, b) => breedingCandidateDetails(a, b).map((candidate) => candidate.species);
    function breedingPairCore(state, idA, idB, selectedSpecies) {
      if (!state || state.schemaVersion !== BREEDING_VERSION || !Array.isArray(state.creatures) || !Array.isArray(state.eggs) || !state.loot) {
        throw new Error('Zucht: Spielstand v3 ist unvollständig');
      }
      if (typeof idA !== 'string' || typeof idB !== 'string' || idA === idB) throw new Error('Zucht benötigt zwei verschiedene Eltern');
      const a = state.creatures.find((creature) => creature.id === idA);
      const b = state.creatures.find((creature) => creature.id === idB);
      if (!a || !b) throw new Error('Zucht: Elternteil nicht gefunden');
      const cost = 1 + Math.max(a.clutch, b.clutch);
      if (!Number.isSafeInteger(state.loot.brauchbar) || state.loot.brauchbar < cost) throw new Error(`Zucht kostet ${cost} brauchbare Teile`);
      const candidates = breedingCandidates(a, b);
      if (candidates.length > 1 && selectedSpecies === undefined) throw new Error('Nachkommenart muss ausdrücklich ausgewählt werden');
      const species = selectedSpecies ?? candidates[0];
      if (!candidates.includes(species)) throw new Error('Die ausgewählte Art ist kein gültiger Nachkomme');
      const used = new Set([...state.creatures.map((creature) => creature.id), ...state.eggs.map((egg) => egg.id)]);
      const maxId = [...used].reduce((max, id) => Math.max(max, Number(id.slice(1)) || 0), 0);
      if (!Number.isSafeInteger(state.nextId) || state.nextId <= maxId || state.nextId >= Number.MAX_SAFE_INTEGER) {
        throw new Error('Zucht: nächster ID-Zähler ist ungültig');
      }
      const eggId = `e${state.nextId}`;
      const gen = Math.max(a.gen, b.gen) + 1;
      const bonuses = rollBreedingBonuses({ seed: state.seed, eggId, gen, bxpA: a.bxp, bxpB: b.bxp });
      const bp = breedingMods(bonuses).hatchPoints;
      state.nextId += 1;
      state.loot.brauchbar -= cost;
      a.bxp += PAIR_GAIN;
      b.bxp += PAIR_GAIN;
      a.clutch += 1;
      b.clutch += 1;
      state.eggs.push({ id: eggId, seed: state.seed, parents: [a.id, b.id], species, gen, bonuses, bp });
      return eggId;
    }
    function hatchReadyEggs() {
      const breeding = store.breeding;
      const ready = breeding.eggs.filter((egg) => egg.bp >= HATCH_BP)
        .sort((a, b) => Number(a.id.slice(1)) - Number(b.id.slice(1)));
      const creatureIds = new Set(breeding.creatures.map((creature) => creature.id));
      if (ready.some((egg) => egg.parents.some((id) => !creatureIds.has(id)))) {
        note('Schlupf angehalten: ein Eltern-Datensatz fehlt');
        return [];
      }
      if (breeding.nextId >= Number.MAX_SAFE_INTEGER - ready.length) {
        note('Schlupf angehalten: Kreatur-ID-Zähler erschöpft');
        return [];
      }
      const hatched = [];
      for (const egg of ready) {
        for (const parentId of egg.parents) {
          const parent = breeding.creatures.find((creature) => creature.id === parentId);
          parent.bxp += HATCH_GAIN;
        }
        const creature = {
          id: `c${breeding.nextId}`, species: egg.species, xp: 0, bxp: BXP_CHILD,
          gen: egg.gen, bonuses: egg.bonuses.map((bonus) => ({ ...bonus })), clutch: 0,
          wins: 0, losses: 0, round: 0, hits: 0, damageTotal: '0', hp: statsAt(egg.species, 1).hp,
        };
        breeding.creatures.push(creature);
        breeding.nextId += 1;
        hatched.push({ eggId: egg.id, creatureId: creature.id, species: creature.species, gen: creature.gen });
      }
      const hatchedIds = new Set(hatched.map((result) => result.eggId));
      breeding.eggs = breeding.eggs.filter((egg) => !hatchedIds.has(egg.id));
      for (const result of hatched) note(`SCHLUPF ${result.eggId} — ${SPECIES[result.species].label} (Gen ${result.gen}) ist jetzt ${result.creatureId}`);
      return hatched;
    }
    function advanceBreedingCompletions(absoluteCount) {
      const breeding = store.breeding;
      if (!Number.isSafeInteger(absoluteCount) || absoluteCount < 0) return 0;
      const previous = Number.isSafeInteger(breeding.completions) && breeding.completions >= 0 ? breeding.completions : 0;
      if (absoluteCount <= previous) return 0;
      const delta = absoluteCount - previous;
      breeding.completions = absoluteCount;
      for (const egg of breeding.eggs) egg.bp += BP_PER_COMPLETION * delta;
      hatchReadyEggs();
      return delta;
    }
