/**
 * snapshot-schema — der Uebergabe-Vertrag (Client -> Host) als Zod-Schema.
 *
 * WARUM ES DIESE DATEI GIBT: der Stand hat zwei Verbraucher mit zwei
 * verschiedenen Grenzen. Der SPIEGEL (`pet-store.js`) legt ihn dauerhaft ab und
 * ergaenzt dabei den Zeitstempel des Schreibvorgangs; der REMOTE-DIENST
 * (`pet-remote.js`) nimmt ihn ueber die Leitung an und muss ihn pruefen, BEVOR
 * etwas auf ein Medium geht. Beide brauchen dieselben Felder mit denselben
 * Grenzen — zweimal getippt wuerden sie driften, und die Drift waere genau an
 * der Stelle, an der ein fremder Wert in die Ablage gelangt.
 *
 * `damageTotal` ist Dezimaltext (`'454'`): JSON kennt kein BigInt, der Client
 * fuehrt den Lebenslauf als BigInt, und eine Ziffernfolge ist im Speicher exakt
 * statt ab 2^53 gerundet.
 *
 * WAS HIER NICHT STEHT: keine Grenze nach zeitlicher Gueltigkeit, kein BigInt,
 * keine Deutung. Unbekannte Felder fallen weg (Zod-Objekt ohne `.passthrough`)
 * — wer mehr schickt als der Vertrag nennt, schickt es ins Leere.
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
