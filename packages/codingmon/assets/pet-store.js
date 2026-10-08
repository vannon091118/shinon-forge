/**
 * pet-store — der DAUERHAFTE Spiegel des Codemon-Stands (Host-Hälfte).
 *
 * WARUM ES DIESE DATEI GIBT: der Spielstand liegt im Browser (`localStorage`,
 * geschrieben bei jeder Mutation in client.js). Er überlebt damit einen Absturz
 * des Node-Prozesses — aber er hängt am BROWSER-Profil. Ist das weg, ist der
 * Grind weg, und der Host hat nie etwas davon gesehen. Diese Datei ist die
 * Host-Seite dieses Spiegels: ein validierter Datensatz auf einem Medium, das
 * der Host selbst besitzt.
 *
 * WARUM `ctx.storageDomain` UND NICHT EINE EIGENE DATEI: das Profil mountet die
 * Storage-Familie bereits (`storage` + `storage-json` mit Wurzel
 * `dshHomePath('storages')` + `storage-domain`). Der Vertrag dieser Familie ist
 * genau der gesuchte: schema-validierte Datensätze, synchrone Reads, ein
 * dauerhafter Write, der erste nach der Medium-Bestaetigung aufloest, ein
 * lesbares JSON je Einheit. Eine zweite Ablage daneben waere ein zweiter
 * Wahrheitsbegriff — und `node:sqlite` waere fuer einen Datensatz dieser Groesse
 * ohnehin das falsche Medium (das JSON-Backend schreibt EINE Datei
 * `codingmon_pet.json` unter `$DSH_HOME/storages`).
 *
 * ABHAENGIGKEITEN (bewusste Entscheidung, nicht Nebenwirkung): `zod` fuer die
 * Datensatz-Schemas (die Domain ruft `parse`/`safeParse` duck-typed, ohne
 * `instanceof`), `@deepseek-ai/dsh-storage-domain` fuer `defineDomain`/
 * `domainTable`. Beide werden NICHT importiert, bevor `apply` sie braucht:
 * dieses Modul wird dynamisch geladen, damit ein reiner Ladetest des Pakets
 * (pack-test) nicht an der Modulaufloesung eines fremden Baums haengt. Zur
 * Laufzeit loest der Host sie ueber seine eigene, gepatchte Aufloesung auf —
 * dieselbe Mechanik, mit der `index.js` Schemastery zieht. `defineDomain`
 * validiert den Namen (`/^[a-z][a-z0-9_]*$/`) beim Laden dieses Moduls, also
 * bevor irgendein Medium angefasst wird.
 *
 * WAS HIER NICHT STEHT: kein Timer, kein Netz, kein Modell, kein Schreibvorgang
 * ausser dem einen Datensatz. Der Store entscheidet nichts und rechnet nichts
 * nach — er nimmt einen Stand an und gibt ihn zurueck.
 */
import { defineDomain, domainTable } from '@deepseek-ai/dsh-storage-domain';
import { StoredSnapshotSchema } from './snapshot-schema.js';

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
  return {
    /** Der gespeicherte Stand oder `null` — synchron aus dem Speicher der Domain. */
    read: () => table.get(PET_KEY) ?? null,
    /**
     * Einen Stand ablegen. Validiert BEVOR geschrieben wird: ein Stand, der den
     * Vertrag verletzt, wirft und beruehrt das Medium nicht.
     */
    write: async (state) => {
      const record = PetStateSchema.parse({ ...state, storedAt: now().toISOString() });
      await table.put(PET_KEY, record);
      return record;
    },
    close: () => domain.close(),
    domain,
  };
}
