import { rollBonuses, POOLS } from './zucht-glueck.js';
import { HATCH_GAIN, BXP_CHILD, PAIR_GAIN, genMods } from './zucht-xp.js';

export const BP_PER_COMPLETION = 10;
export const HATCH_BP = 120;
export const brutPerCompletion = (_state) => BP_PER_COMPLETION;
export const clutchCost = (a, b) => 1 + Math.max(a.clutch, b.clutch);

const validId = (id, prefix) => typeof id === 'string' && new RegExp('^' + prefix + '[1-9]\\d*$').test(id);
const childChoice = (list) => list.slice().sort((a, b) =>
  (b.bxp - a.bxp) || a.parentId.localeCompare(b.parentId) || a.species.localeCompare(b.species))[0];

export function successorsOf(speciesId, lineage) {
  return Object.keys(lineage)
    .filter((id) => lineage[id]?.ancestor === speciesId)
    .sort();
}

export function successorOf(speciesId, lineage) {
  return successorsOf(speciesId, lineage)[0] ?? null;
}

export function childSpeciesCandidates(a, b, lineage) {
  const candidates = [];
  for (const species of successorsOf(a.species, lineage)) {
    candidates.push({ species, bxp: a.bxp, parentId: a.id });
  }
  for (const species of successorsOf(b.species, lineage)) {
    candidates.push({ species, bxp: b.bxp, parentId: b.id });
  }
  const source = candidates.length ? candidates : [
    { species: a.species, bxp: a.bxp, parentId: a.id },
    { species: b.species, bxp: b.bxp, parentId: b.id },
  ];
  const bySpecies = new Map();
  for (const candidate of source) {
    const previous = bySpecies.get(candidate.species);
    if (!previous || childChoice([previous, candidate]) === candidate) bySpecies.set(candidate.species, candidate);
  }
  return [...bySpecies.values()].sort((x, y) => x.species.localeCompare(y.species));
}

export function childSpecies(a, b, lineage) {
  return childChoice(childSpeciesCandidates(a, b, lineage)).species;
}

function maxIdNumber(state) {
  return [...state.creatures.map((c) => c.id), ...state.eggs.map((e) => e.id)]
    .reduce((max, id) => Math.max(max, Number(String(id).slice(1)) || 0), 0);
}

function validateState(state, lineage) {
  if (!state || !Array.isArray(state.creatures) || !Array.isArray(state.eggs) || !state.loot) {
    throw new TypeError('Spielstand v3 ist unvollständig');
  }
  if (state.schemaVersion !== 3 || !Number.isSafeInteger(state.seed) || state.seed < 0 || state.seed > 0xffffffff
    || !Number.isSafeInteger(state.nextId) || state.nextId < 1) throw new Error('Spielstand v3: Seed oder ID-Zähler ungültig');
  if (!Number.isSafeInteger(state.loot.brauchbar) || state.loot.brauchbar < 0) throw new Error('Loot: brauchbare Teile ungültig');
  const ids = new Set();
  for (const creature of state.creatures) {
    if (!validId(creature.id, 'c') || ids.has(creature.id) || !lineage[creature.species]
      || !Number.isSafeInteger(creature.bxp) || creature.bxp < 0 || !Number.isSafeInteger(creature.gen) || creature.gen < 1
      || !Number.isSafeInteger(creature.clutch) || creature.clutch < 0 || !Number.isFinite(creature.xp) || creature.xp < 0) {
      throw new Error(`Ungültige Kreatur ${creature?.id ?? '(ohne ID)'}`);
    }
    ids.add(creature.id);
  }
  const creatureIds = new Set(state.creatures.map((c) => c.id));
  for (const egg of state.eggs) {
    if (!validId(egg.id, 'e') || ids.has(egg.id) || !lineage[egg.species]
      || !Array.isArray(egg.parents) || egg.parents.length !== 2 || egg.parents[0] === egg.parents[1]
      || egg.parents.some((parentId) => !creatureIds.has(parentId))
      || !Number.isSafeInteger(egg.gen) || egg.gen < 2 || !Number.isSafeInteger(egg.bp) || egg.bp < 0) {
      throw new Error(`Ungültiges Ei ${egg?.id ?? '(ohne ID)'}`);
    }
    ids.add(egg.id);
  }
  if (state.nextId <= maxIdNumber(state)) throw new Error('nextId muss größer als jede vorhandene ID sein');
  if (state.active != null && !creatureIds.has(state.active)) throw new Error('active verweist auf keine Kreatur');
}

export function pair(state, idA, idB, { lineage, pools = POOLS, selectedSpecies } = {}) {
  validateState(state, lineage ?? {});
  if (typeof idA !== 'string' || typeof idB !== 'string' || idA === idB) {
    throw new Error('pair: zwei verschiedene Kreaturen nötig');
  }
  const a = state.creatures.find((c) => c.id === idA);
  const b = state.creatures.find((c) => c.id === idB);
  if (!a || !b) throw new Error('pair: Elternteil nicht gefunden');
  const cost = clutchCost(a, b);
  if (state.loot.brauchbar < cost) throw new Error('pair: zu wenig Brauchbare Teile');
  const candidates = childSpeciesCandidates(a, b, lineage);
  const validCandidates = candidates.map((candidate) => candidate.species);
  if (selectedSpecies === undefined && candidates.length > 1) throw new Error('pair: Nachkommenart muss ausdrücklich ausgewählt werden');
  const species = selectedSpecies ?? candidates[0]?.species;
  if (!validCandidates.includes(species)) throw new Error('pair: ausgewählte Nachkommenart ist kein gültiger Kandidat');
  if (!Number.isSafeInteger(state.nextId) || state.nextId >= Number.MAX_SAFE_INTEGER) throw new Error('pair: ID-Zähler erschöpft');

  const bxpA = a.bxp;
  const bxpB = b.bxp;
  const eggId = `e${state.nextId}`;
  const gen = Math.max(a.gen, b.gen) + 1;
  const bonuses = rollBonuses({ seed: state.seed, eggId, gen, bxpA, bxpB, pools });
  const bp = genMods(bonuses).hatchPoints;
  state.nextId += 1;
  state.loot.brauchbar -= cost;
  a.bxp += PAIR_GAIN;
  b.bxp += PAIR_GAIN;
  a.clutch += 1;
  b.clutch += 1;
  state.eggs.push({ id: eggId, seed: state.seed, parents: [a.id, b.id], species, gen, bonuses, bp });
  return eggId;
}

export function onCompletions(state, absoluteCount) {
  if (!Number.isSafeInteger(absoluteCount) || absoluteCount < 0) {
    throw new RangeError('Completion-Stand muss eine nichtnegative Ganzzahl sein');
  }
  if (!Array.isArray(state?.eggs)) throw new TypeError('Eierliste fehlt');
  const previous = state.completions ?? 0;
  if (!Number.isSafeInteger(previous) || previous < 0) throw new RangeError('Gespeicherter Completion-Stand ist ungültig');
  if (absoluteCount <= previous) return 0;
  const delta = absoluteCount - previous;
  const gain = brutPerCompletion(state) * delta;
  for (const egg of state.eggs) {
    if (!Number.isSafeInteger(egg.bp) || egg.bp < 0) throw new Error(`Ungültiger Brutstand bei ${egg.id}`);
  }
  state.completions = absoluteCount;
  for (const egg of state.eggs) egg.bp += gain;
  return delta;
}

export function hatchReady(state) {
  const ready = state.eggs.filter((egg) => egg.bp >= HATCH_BP)
    .sort((a, b) => Number(a.id.slice(1)) - Number(b.id.slice(1)));
  if (ready.some((egg) => !state.creatures.some((creature) => egg.parents.includes(creature.id)))) {
    throw new Error('Schlupf abgelehnt: Elterndatensatz fehlt');
  }
  if (state.nextId >= Number.MAX_SAFE_INTEGER - ready.length) throw new Error('Schlupf abgelehnt: ID-Zähler erschöpft');
  const hatched = [];
  for (const egg of ready) {
    const [aId, bId] = egg.parents;
    const a = state.creatures.find((creature) => creature.id === aId);
    const b = state.creatures.find((creature) => creature.id === bId);
    a.bxp += HATCH_GAIN;
    b.bxp += HATCH_GAIN;
    state.creatures.push({
      id: `c${state.nextId}`, species: egg.species, xp: 0, bxp: BXP_CHILD,
      gen: egg.gen, bonuses: egg.bonuses.map((bonus) => ({ ...bonus })), clutch: 0,
      wins: 0, losses: 0, round: 0, hits: 0, damageTotal: '0',
    });
    state.nextId += 1;
    hatched.push(egg.id);
  }
  const ids = new Set(hatched);
  state.eggs = state.eggs.filter((egg) => !ids.has(egg.id));
  return hatched;
}

export function lootWeights(base, creature) {
  if (!Array.isArray(base)) throw new TypeError('Loot-Tabelle muss eine Liste sein');
  const { lootLuck } = genMods(creature.bonuses);
  const factor = 10000 + lootLuck;
  return base.map((entry) => ({
    ...entry,
    weight: entry.id === 'schrott' ? entry.weight : Math.floor((entry.weight * factor) / 10000),
  }));
}
