import z from '@deepseek-ai/schemastery';
import {
  ABILITIES, ELEMENTS, ESCALATION, LEVEL_CAP, LOOT_TABLE, MILESTONES, PACING, SPECIES, SPECIES_IDS,
  XP_BASE, formatNumber, levelFor, lootOdds,
} from './assets/mechanik.js';
import { SNAPSHOT_FIELDS, UEBERGABE_ENDPOINT } from './assets/uebergabe.js';

/**
 * @shinon/codingmon — die Host-Haelfte: Plugin-Form, Vertrag, dauerhafter
 * Spiegel.
 *
 * WAS HIER STEHT: `Config` (Schemastery), `apply` (Mount) und der Spiegel. Das
 * Regelwerk, die Leiter, das Pacing und der Loot stehen in
 * `./assets/mechanik.js` und werden hier nur WEITERGEGEBEN — die Named Exports
 * dieses Moduls bleiben dieselben, wer also die Leiter braucht, importiert
 * weiterhin `@shinon/codingmon`.
 */
export * from './assets/mechanik.js';
// Die NAMEN der Naht Client -> Host (Paket, Namespace, Methode, Endpunkt,
// Feldliste) stehen in `assets/uebergabe.js` — eine Quelle fuer beide Haelften.
export * from './assets/uebergabe.js';

export const Config = z.object({
  /** XP pro Token. Der Auftrag sagt 1. */
  xpPerToken: z.number().description('XP pro Token').min(0).default(1),
  /** XP-Basis der ersten Stufe (kumulativ und multiplikativ). */
  xpPerLevel: z.number().description('XP-Basis der ersten Stufe').min(1).default(XP_BASE),
  /**
   * Kuenstliche Rundendauer in Millisekunden. Kein Zeitdruck, nur Verzoegerung.
   * ACHTUNG (ehrliche Grenze): die Sperre haelt der CLIENT, und der Browser
   * kann diese Host-Konfiguration nicht lesen — er spiegelt PACING.delayMs
   * (siehe client.js, `roundDelayMs`). Ein anderer Wert hier wirkt deshalb nur
   * auf die Host-Seite und nicht auf die Wartezeit im Browser. Wer die Dauer
   * wirklich umstellen will, braucht einen client-sichtbaren Kanal; bis dahin
   * ist der Vertragswert die eine Quelle.
   */
  roundDelayMs: z.number().description('Künstliche Rundendauer in Millisekunden').min(0).default(PACING.delayMs),
  /** Start-Spezies (Schluessel aus SPECIES). Schemastery 3.18.4 kennt kein z.enum. */
  species: z.union(SPECIES_IDS.map((id) => z.const(id))).description('Start-Spezies').default(SPECIES_IDS[0]),
  /** Name des Pets; leer = der Client waehlt einen. */
  petName: z.string().description('Name des Pets (leer = der Client wählt)').default(''),
  /** Kanaele, auf denen der Spine Ereignisse liefert (nur Beobachtung). */
  eventsChannel: z.string().description('Kanal für Spine-Ereignisse (nur Beobachtung)').default('shinon/event'),
});

/**
 * Dienstname des dauerhaften Spiegels (Host-Seite des Spielstands). Schmal wie
 * bei @shinon/project-index: ein Vertragsname und ZWEI Operationen (`read`,
 * `write`) — kein Dateihandle, kein Schema, kein Speicher.
 */
/**
 * Die Dienste, die dieser Host braucht. Ohne deklarierte Injektion verweigert
 * Cordis den Zugriff auf `ctx.storageDomain` (live gemessen im echten Boot:
 * „cannot get property \"storageDomain\" without inject"). Genau so deklarieren
 * es die mitgelieferten Hostplugins (dsh-agent-instructions exportiert `inject`
 * neben `Config` und `apply`).
 */
export const inject = ['storageDomain'];

export const STORE_SERVICE = 'shinon_codingmon_store';

/** Vertragsname des Spiegels — was der Dienst zusichert, nicht wie er es tut. */
export const STORE_CONTRACT = 'shinon.codingmon/store-v1';

export function apply(ctx, config) {
  // Der Vertrag ist reine Datenweitergabe: keine Zeit, kein Zufall, kein Modell.
  const contract = {
    version: 'shinon.codingmon/v2',
    xpPerToken: config.xpPerToken,
    xpPerLevel: config.xpPerLevel,
    roundDelayMs: config.roundDelayMs,
    escalation: { factor: ESCALATION.factor, xpBase: XP_BASE, levelCap: LEVEL_CAP, milestones: MILESTONES.slice() },
    species: config.species,
    speciesCount: SPECIES_IDS.length,
    abilities: ABILITIES.map((ability) => ({ ...ability })),
    elements: Object.keys(ELEMENTS),
    loot: LOOT_TABLE.map((entry) => ({ ...entry, odds: lootOdds(entry) })),
    pacing: { ...PACING },
  };

  console.log(
    `[shinon-codingmon] Aktiviert — ${ABILITIES.length} Faehigkeiten, ${SPECIES_IDS.length} Spezies, `
    + `${contract.elements.length} Elemente, ${contract.loot.length} Loot-Stufen `
    + `(${contract.version}, Faktor ${ESCALATION.factor}, Runde ${config.roundDelayMs} ms, authority NONE)`,
  );

  // Fuer die Leiter und das Regelwerk gilt weiter: wer sie braucht, importiert
  // die Named Exports dieses Moduls — dieselbe Quelle, kein Nachbau. Einen
  // SERVICE gibt es nur fuer den Spiegel, und zwar weil er Zustand ist statt
  // Tabelle: der Stand liegt im Browser, der Spiegel liegt hier, und die
  // Uebergabe (Client -> Host) braucht eine Naht, die einen Stand annimmt.
  //
  // `apply` bleibt SYNCHRON, obwohl das Oeffnen des Spiegels es nicht ist:
  // Cordis faesst den Rueckgabewert als Disposer, und der Vertrag des Gates
  // (`export function apply`) ist eine Zusage. Der Zustand des Spiegels steht
  // deshalb in einer EIGENEN Zeile — er kann erst nach dem ersten `await`
  // bekannt sein, und eine Aktivierungszeile, die ihn vorher behauptet, waere
  // geraten.
  let mirror = null;
  const mirrorReady = (async () => {
    if (typeof ctx?.storageDomain?.open !== 'function') {
      console.error('[shinon-codingmon] Kein dauerhafter Spiegel (BLOCKED) — ctx.storageDomain fehlt; der Stand bleibt allein im Browser');
      return;
    }
    try {
      const { openPetStore, PET_DOMAIN } = await import('./assets/pet-store.js');
      mirror = await openPetStore(ctx);
      if (typeof ctx?.provide === 'function') {
        ctx.provide(STORE_SERVICE, {
          contract: STORE_CONTRACT,
          fields: SNAPSHOT_FIELDS.slice(),
          read: () => mirror.read(),
          write: (state) => mirror.write(state),
        });
      }
      // Der Empfaenger der Uebergabe. Erst JETZT: der Dienst haelt das offene
      // Handle, und ein Dienst ohne Ablage waere ein Endpunkt, der annimmt und
      // nichts aufbewahrt — der schlimmere Fehler als ein fehlender Endpunkt.
      const { mountPetRemote } = await import('./assets/pet-remote.js');
      mountPetRemote(ctx, mirror);
      const stored = mirror.read();
      console.log(`[shinon-codingmon] Spiegel aktiv — Domain ${PET_DOMAIN.name} v${PET_DOMAIN.version}, `
        + `Empfaenger ${UEBERGABE_ENDPOINT}, `
        + `${stored === null ? 'noch kein Stand' : `Stand: Level ${levelFor(stored.xp)}, ${formatNumber(stored.damageTotal)} Schaden`}`);
    } catch (error) {
      // Fail-closed fuer den Spielbetrieb, laut fuer den Betreiber: ohne Spiegel
      // laeuft das Pet weiter (der Browser haelt den Stand), aber niemand darf
      // glauben, es gaebe eine zweite Kopie.
      mirror = null;
      console.error(`[shinon-codingmon] Spiegel NICHT geoeffnet (BLOCKED) — ${error?.message ?? error}`);
    }
  })();

  return async () => {
    // Der Abbau wartet das Oeffnen ab: sonst bliebe ein Handle offen, wenn der
    // Loader genau waehrend des Mounts entlaedt.
    await mirrorReady;
    try {
      await mirror?.close();
    } catch (error) {
      console.error(`[shinon-codingmon] Spiegel nicht sauber geschlossen — ${error?.message ?? error}`);
    }
    console.log('[shinon-codingmon] Deaktiviert');
  };
}
