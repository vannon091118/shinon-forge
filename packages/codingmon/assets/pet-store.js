/**
 * pet-store — der DAUERHAFTE Spiegel des Codemon-Stands (Host-Hälfte).
 *
 * WARUM ES DIESE DATEI GIBT: der Spielstand liegt im Browser (`localStorage`,
 * geschrieben bei jeder Mutation in client.js). Er überlebt damit einen Absturz
 * des Node-Prozesses — aber er hängt am BROWSER-Profil. Ist das weg, ist der
 * Grind weg, und der Host hat nie etwas davon gesehen. Diese Datei ist die
 * Host-Seite dieses Spiegels: ein validierter Datensatz auf einem Medium, das
 * → Kanon: docs/COMMENT-KANON.md#k-39478e8b79a2
 */
import { defineDomain, domainTable } from '@deepseek-ai/dsh-storage-domain';
import { SnapshotSchema, StoredSnapshotSchema } from './snapshot-schema.js';
import { migrateToV3 } from './migration.js';
import { SPECIES } from './katalog.js';

/** Der eine Datensatz-Schluessel dieser Einheit. */
export const PET_KEY = 'state';

/**
 * Der Stand, den das Medium annimmt: der Uebergabe-Vertrag plus `storedAt`.
 * Definiert wird er in `./snapshot-schema.js` — dieselbe Quelle, die der
 * Remote-Dienst beim ANNEHMEN prueft. Zwei Schemas (eines fuer die Leitung,
 * eines fuer die Ablage) waeren zwei Wahrheiten an genau der Grenze, an der ein
 * fremder Wert ins Medium gelangt. Der Name bleibt hier stehen, weil er hier
 * schon stand.
 */
export const PetStateSchema = StoredSnapshotSchema;

/**
 * Die Domain-Deklaration. `name` muss `UNIT_NAME_RE` (`/^[a-z][a-z0-9_]*$/`)
 * treffen — daher Unterstrich, kein Bindestrich; die Datei heisst dann
 * `codingmon_pet.json`. Ein Datensatz (der Stand), nicht viele: der Spielstand
 * ist genau einer, und `version: 1` schreibt die Fassung der Deklaration fest.
 */
export const PET_DOMAIN = defineDomain({
  name: 'codingmon_pet',
  version: 1,
  tables: { snapshots: domainTable(PetStateSchema) },
});

/**
 * Den Store oeffnen. Der Aufrufer besitzt das Handle und schliesst es beim
 * Abbau; `ctx.storageDomain` muss gemountet sein.
 * @param {object} ctx - Cordis-Context mit `storageDomain`.
 * @param {() => Date} [now] - Zeitquelle (Tests setzen sie, sonst `Date`).
 * @returns {Promise<{read: () => object|null, write: (state: object) => Promise<object>, close: () => Promise<void>, domain: object}>}
 */
export async function openPetStore(ctx, now = () => new Date()) {
  const domain = await ctx.storageDomain.open(PET_DOMAIN);
  const table = domain.table('snapshots');
  const upgradeSnapshot = (raw) => {
    const validated = SnapshotSchema.parse(raw);
    if (validated.schemaVersion >= 3 && validated.breeding !== undefined) return validated;
    if (validated.schemaVersion !== 2) throw new Error('Nur Snapshot v2 kann automatisch auf v3 migriert werden');
    // Host v2 never persisted a roster. Build exactly one deterministic founder
    // from counters that really exist; do not invent historical pets or eggs.
    const migrated = migrateToV3(validated, { speciesCatalog: SPECIES });
    const founder = migrated.creatures[0];
    return SnapshotSchema.parse({
      ...validated,
      schemaVersion: 3,
      species: founder.species,
      xp: founder.xp,
      wins: founder.wins,
      losses: founder.losses,
      round: founder.round,
      damageTotal: founder.damageTotal,
      hits: founder.hits,
      completions: migrated.completions,
      loot: migrated.loot,
      wild: migrated.wild === null ? null : {
        speciesId: migrated.wild.speciesId, level: migrated.wild.level,
        hp: migrated.wild.hp, maxHp: migrated.wild.maxHp,
      },
      breeding: {
        schemaVersion: 3,
        seed: migrated.seed,
        nextId: migrated.nextId,
        active: migrated.active,
        creatures: migrated.creatures,
        eggs: migrated.eggs,
        completions: migrated.completions,
      },
    });
  };
  return {
    /** Reads v2 in memory; only a successful write turns the stored record into v3. */
    read: () => {
      const stored = table.get(PET_KEY) ?? null;
      if (stored === null) return null;
      const upgraded = upgradeSnapshot(PetStateSchema.parse(stored));
      return PetStateSchema.parse({ ...upgraded, storedAt: stored.storedAt });
    },
    /**
     * Einen Stand ablegen. Validiert BEVOR geschrieben wird: ein Stand, der den
     * Vertrag verletzt, wirft und beruehrt das Medium nicht.
     */
    write: async (state) => {
      // Validate the caller's complete wire shape before migration or I/O.
      const canonical = upgradeSnapshot(SnapshotSchema.parse(state));
      const record = PetStateSchema.parse({ ...canonical, storedAt: now().toISOString() });
      await table.put(PET_KEY, record);
      return record;
    },
    close: () => domain.close(),
    domain,
  };
}
