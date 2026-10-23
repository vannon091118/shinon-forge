    const lootOdds = (entry, creature = null) => Number(((entry.weight / lootWeightsFor(creature).reduce((sum, item) => sum + item.weight, 0)) * 100).toFixed(2));
    // ── Store ───────────────────────────────────────────────────────────────
    const listeners = new Set();
    /**
     * Jede Aenderung erreicht zwei Empfaenger: die Abonnenten in diesem Bundle
     * (Panel, Marke, EXP-Leiste) und — als DOM-Ereignis — fremde Panels, die
     * den Zustand nur kennen, nicht besitzen (@shinon/dashboard). Die XP-Leiste
     * dort muss nicht pollen, um aktuell zu sein.
     */
    const emit = () => {
      if (mutationBatchDepth > 0) { pendingRender = true; return; }
      for (const fn of listeners) { try { fn(); } catch { /* ein Abnehmer darf den Rest nicht kippen */ } }
      window.dispatchEvent(new CustomEvent('shinon:exp', { detail: { xp: store.xp, level: level() } }));
    };
    const subscribe = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };
    const useStore = () => {
      const [, bump] = React.useState(0);
      React.useEffect(() => subscribe(() => bump((n) => n + 1)), []);
      return store;
    };

    // ── Persisted breeding state v3 (client mirror of assets/zucht*.js) ────
    const BREEDING_VERSION = 3;
    const BXP_FOUNDER = 50;
    const BXP_CHILD = 0;
    const BXP_NEUTRAL = 50;
    const BXP_BPS_PER_POINT = 40;
    const MOD_CAP_BPS = 3000;
    const GEN_STATMOD_CAP_BPS = 1500;
    const LOOTLUCK_CAP_BPS = 5000;
    const PAIR_GAIN = 10;
    const HATCH_GAIN = 20;
    const BP_PER_COMPLETION = 10;
    const HATCH_BP = 120;
    const BREEDING_EFFECTS = new Set(['statMod', 'hatchPoints', 'lootLuck']);
    const BREEDING_POOLS = {
      cycle: [
        { slots: 2, baseChanceBps: 1500, entries: [
          { id: 'tune-a', effect: 'statMod', value: 300, weight: 3 },
          { id: 'warm-a', effect: 'hatchPoints', value: 10, weight: 2 },
          { id: 'nose-a', effect: 'lootLuck', value: 1000, weight: 2 },
        ]},
        { slots: 2, baseChanceBps: 1200, entries: [
          { id: 'tune-b', effect: 'statMod', value: 400, weight: 3 },
          { id: 'warm-b', effect: 'hatchPoints', value: 15, weight: 2 },
          { id: 'nose-b', effect: 'lootLuck', value: 1500, weight: 2 },
        ]},
        { slots: 2, baseChanceBps: 1000, entries: [
          { id: 'tune-c', effect: 'statMod', value: 500, weight: 2 },
          { id: 'warm-c', effect: 'hatchPoints', value: 20, weight: 1 },
          { id: 'nose-c', effect: 'lootLuck', value: 2000, weight: 2 },
        ]},
      ],
      scaleFromGen: 7,
      scaleStepBps: 200,
      scaleCapBps: 20000,
    };
    const fnv1a32 = (text) => {
      let hash = 0x811c9dc5;
      for (let i = 0; i < text.length; i += 1) {
        hash ^= text.charCodeAt(i);
        hash = Math.imul(hash, 0x01000193) >>> 0;
      }
      return hash >>> 0;
    };
    function breedingStream(key) {
      const seed = fnv1a32(key);
      let a = seed, b = seed ^ 0x9e3779b9, c = seed ^ 0x85ebca6b, d = seed ^ 0xc2b2ae35;
      const next = () => {
        a >>>= 0; b >>>= 0; c >>>= 0; d >>>= 0;
        const t = (a + b) | 0;
        a = b ^ (b >>> 9);
        b = (c + (c << 3)) | 0;
        c = (c << 21) | (c >>> 11);
        d = (d + 1) | 0;
        const value = (t + d) | 0;
        c = (c + value) | 0;
        return value >>> 0;
      };
      for (let i = 0; i < 12; i += 1) next();
      return next;
    }
    function breedingRandInt(next, limit) {
      if (!Number.isSafeInteger(limit) || limit < 1 || limit > 0x100000000) throw new RangeError('Zuchtzufall: ungültige Grenze');
      const cutoff = Math.floor(0x100000000 / limit) * limit;
      for (;;) {
        const value = next();
        if (!Number.isInteger(value) || value < 0 || value >= 0x100000000) throw new TypeError('Zuchtzufall: ungültiger uint32-Wert');
        if (value < cutoff) return value % limit;
      }
    }
    function breedingWeightedPick(next, entries) {
      if (!Array.isArray(entries) || entries.length === 0) throw new Error('Zuchtzufall: leerer Pool');
      const total = entries.reduce((sum, entry) => {
        if (!Number.isSafeInteger(entry.weight) || entry.weight <= 0) throw new Error('Zuchtzufall: ungültiges Gewicht');
        return sum + entry.weight;
      }, 0);
      if (!Number.isSafeInteger(total) || total > 0x100000000) throw new RangeError('Zuchtzufall: Gewichtssumme außerhalb uint32');
      let cursor = breedingRandInt(next, total);
      for (const entry of entries) {
        if (cursor < entry.weight) return entry;
        cursor -= entry.weight;
      }
      throw new Error('Zuchtzufall: Auswahl außerhalb des Pools');
    }
    const breedClamp = (value, low, high) => Math.min(high, Math.max(low, value));
    function breedingMods(bonuses = []) {
      if (!Array.isArray(bonuses) || bonuses.some((bonus) => !BREEDING_EFFECTS.has(bonus?.effect)
        || !Number.isSafeInteger(bonus.value) || bonus.value < 0)) throw new Error('Zuchtboni sind ungültig');
      const sum = (effect) => bonuses.filter((bonus) => bonus.effect === effect).reduce((total, bonus) => total + bonus.value, 0);
      return {
        statMod: breedClamp(sum('statMod'), 0, GEN_STATMOD_CAP_BPS),
        lootLuck: breedClamp(sum('lootLuck'), 0, LOOTLUCK_CAP_BPS),
        hatchPoints: sum('hatchPoints'),
      };
    }
    function lootWeightsFor(creature = null) {
      const factor = 10000 + breedingMods(creature?.bonuses ?? []).lootLuck;
      return LOOT_TABLE.map((entry) => ({ ...entry, weight: entry.id === 'schrott' ? entry.weight : Math.floor((entry.weight * factor) / 10000) }));
    }
    function rollBreedingBonuses({ seed, eggId, gen, bxpA, bxpB }) {
      if (!Number.isSafeInteger(seed) || seed < 0 || seed > 0xffffffff) throw new RangeError('Zucht-Seed muss uint32 sein');
      if (!/^e[1-9]\d*$/.test(eggId)) throw new TypeError('Ei-ID ist ungültig');
      for (const value of [bxpA, bxpB]) if (!Number.isSafeInteger(value) || value < 0) throw new RangeError('ZE muss nichtnegativ sein');
      const pool = gen < 2 ? null : {
        ...BREEDING_POOLS.cycle[(gen - 2) % BREEDING_POOLS.cycle.length],
        entries: BREEDING_POOLS.cycle[(gen - 2) % BREEDING_POOLS.cycle.length].entries.map((entry) => ({ ...entry })),
        scale: gen < BREEDING_POOLS.scaleFromGen ? 10000
          : Math.min(BREEDING_POOLS.scaleCapBps, 10000 + (gen - BREEDING_POOLS.scaleFromGen) * BREEDING_POOLS.scaleStepBps),
      };
      if (pool === null) return [];
      const avg = Math.floor((bxpA + bxpB) / 2);
      const luckFactor = Math.min(25000, 10000 + Math.max(0, avg - BXP_NEUTRAL) * 100);
      const chance = Math.min(6000, Math.floor((pool.baseChanceBps * luckFactor) / 10000));
      const next = breedingStream(`zucht.bonus|${seed}|${eggId}`);
      const out = [];
      for (let slot = 0; slot < pool.slots; slot += 1) {
        if (breedingRandInt(next, 10000) >= chance) continue;
        const picked = breedingWeightedPick(next, pool.entries);
        out.push({ slot, id: picked.id, effect: picked.effect, value: Math.floor((picked.value * pool.scale) / 10000) });
      }
      return out;
    }
    function legacyLevelFor(xp) {
      let level = 1;
      while (level < 2000 && Math.round((250 * (Math.pow(1.35, level) - 1)) / 0.35) <= xp) level += 1;
      return level;
    }
    function createBreedingState(speciesId, source = {}) {
      const xp = Number.isFinite(source.xp) && source.xp >= 0 ? source.xp : 0;
      const wins = Number.isSafeInteger(source.wins) && source.wins >= 0 ? source.wins : 0;
      const losses = Number.isSafeInteger(source.losses) && source.losses >= 0 ? source.losses : 0;
      const round = Number.isSafeInteger(source.round) && source.round >= 0 ? source.round : 0;
      const hits = Number.isSafeInteger(source.hits) && source.hits >= 0 ? source.hits : 0;
      const damageTotal = /^\d+$/.test(String(source.damageTotal ?? '0')) ? String(source.damageTotal ?? '0') : '0';
      const level = legacyLevelFor(xp);
      const bxp = BXP_FOUNDER + Math.min(150, 10 * Math.max(0, level - 50));
      return {
        schemaVersion: BREEDING_VERSION,
        seed: fnv1a32(`codingmon-seed|${xp}|${wins}|${losses}|${source.completions ?? 0}`),
        nextId: 2,
        active: 'c1',
        creatures: [{
          id: 'c1', species: SPECIES[speciesId] ? speciesId : SPECIES_IDS[0],
          xp, bxp, gen: 1, bonuses: [], clutch: 0, wins, losses, round, hits, damageTotal,
          hp: Number.isFinite(source.hp) && source.hp > 0 ? source.hp : statsAt(speciesId, levelFor(xp)).hp,
        }],
        eggs: [],
        completions: Number.isSafeInteger(source.completions) && source.completions >= 0 ? source.completions : 0,
      };
    }
