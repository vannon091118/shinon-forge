/**
 * snapshot-schema — der Uebergabe-Vertrag (Client -> Host) als Zod-Schema.
 *
 * WARUM ES DIESE DATEI GIBT: der Stand hat zwei Verbraucher mit zwei
 * verschiedenen Grenzen. Der SPIEGEL (`pet-store.js`) legt ihn dauerhaft ab und
 * ergaenzt dabei den Zeitstempel des Schreibvorgangs; der REMOTE-DIENST
 * (`pet-remote.js`) nimmt ihn ueber die Leitung an und muss ihn pruefen, BEVOR
 * etwas auf ein Medium geht. Beide brauchen dieselben Felder mit denselben
 * → Kanon: docs/COMMENT-KANON.md#k-7489450126b0
 */
import { z } from 'zod';

/**
 * Der Stand, wie ihn der CLIENT schickt. Der Host ergaenzt beim Ablegen
 * `storedAt` — dieser Zeitstempel ist nicht Teil des Spielstands, sondern der
 * Nachweis des Schreibvorgangs, und er gehoert deshalb nicht in die Eingabe.
 */
export const SnapshotSchema = z.object({
  /** Fassung des Client-Speicherformats, z. B. 2. Der Host deutet sie nicht, er merkt sie. */
  schemaVersion: z.number().int().nonnegative(),
  /** Spezies-Schluessel der Linie (Client-Vokabular, hier nur Text). */
  species: z.string().min(1),
  /** Kumulierte XP. */
  xp: z.number().nonnegative(),
  /** Siege, Niederlagen und die Rundennummer des Clients. */
  wins: z.number().int().nonnegative(),
  losses: z.number().int().nonnegative(),
  round: z.number().int().nonnegative(),
  /** Der Lebenslauf als Dezimaltext (BigInt laesst sich nicht JSON-serialisieren). */
  damageTotal: z.string().regex(/^\d+$/, 'der Lebenslauf ist eine Ziffernfolge, kein gerundeter Bruch'),
  /** Gezaehlte Treffer. */
  hits: z.number().int().nonnegative(),
  /** Beutezaehler, genau die drei Stufen des Vertrags. */
  loot: z.object({
    schrott: z.number().int().nonnegative(),
    brauchbar: z.number().int().nonnegative(),
    shiny: z.number().int().nonnegative(),
  }),
  /** Zeitstempel des Clients (ISO-8601), falls er einen mitschickt. */
  savedAt: z.string().optional(),
  /**
   * Abgeschlossene Agent-Schritte, wie der Client sie zuletzt vom Host gelesen
   * hat (`readActivity`). Der Client besitzt die Zahl persistent (localStorage
   * plus dieser Spiegel); der Host zaehlt fluichtig und fuellt beim Mergen auf.
   * Default 0: ein Stand der Fassung 2 ohne dieses Feld bleibt lesbar.
   */
  completions: z.number().int().nonnegative().default(0),
  /**
   * Das wilde Codemon, wie der Client es sieht — oder `null`. Der Kampf selbst
   * (`battle`) bleibt reine Browsersache und geht nicht auf die Platte des
   * Hosts; das Wild schon, damit ein Neustart es nicht verdampfen laesst (J2).
   */
  wild: z.object({
    /** Spezies-Schluessel (Client-Vokabular, hier nur Text). */
    speciesId: z.string().min(1),
    /** Stufe des Wilden (ganzzahlig, mindestens 1). */
    level: z.number().int().min(1),
    /** Verbleibende und maximale HP (Zahlen, keine BigInt). */
    hp: z.number().nonnegative(),
    maxHp: z.number().positive(),
  }).nullable().default(null),
});

/**
 * Der Stand, wie er AUF DER PLATTE liegt: der Vertrag plus der Zeitstempel des
 * Hosts. Genau diese Form akzeptiert das Medium, und keine andere.
 */
export const StoredSnapshotSchema = SnapshotSchema.extend({
  /** Zeitstempel des HOSTS: nicht Teil des Spielstands, nur Nachweis des Schreibvorgangs. */
  storedAt: z.string(),
});

/**
 * Der Aktivitaetsstand des Hosts (die Antwort auf `readActivity`). Reine
 * Primitiven aus der Host-Realm: Typert lehnt Realm-fremde Prototypen ab, und
 * auf der Leitung gibt es ohnehin keine. Der Client entscheidet daraus rein
 * (`spawnFor`), ob ein Ball faellt.
 */
export const ActivitySchema = z.object({
  /** Abgeschlossene Agent-Schritte seit dem Start des Hosts (plus Spiegel-Startwert). */
  completions: z.number().int().nonnegative(),
  /** Laeuft gerade ein Agent (`running`-Status gesehen, `idle` noch nicht). */
  running: z.boolean(),
  /** Zeitstempel der Antwort (ISO-8601, Host-Uhr). */
  at: z.string(),
});

/**
 * Die Quittung des Hosts (die Antwort auf einen angenommenen Stand). Sie ist
 * absichtlich schmal: sie nennt, WAS angekommen ist, nicht was daraus folgt —
 * die Leiter zu rechnen ist Sache des Clients, der Host deutet den Stand nicht.
 */
export const SnapshotAckSchema = z.object({
  /** Zeitstempel des Schreibvorgangs, wie er im Datensatz steht. */
  storedAt: z.string(),
  /** Die Stufe, die der Host aus den angenommenen XP liest (nur zum Nachsehen). */
  level: z.number().int().nonnegative(),
  /** Die angenommenen XP — die Quittung wiederholt, was sie quittiert. */
  xp: z.number().nonnegative(),
});
