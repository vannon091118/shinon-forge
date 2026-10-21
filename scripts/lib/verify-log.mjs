/**
 * verify-log.mjs — das Abnahmeprotokoll als DATEN.
 *
 * WARUM EIGENE DATEI: das Protokoll ist kein Nebenprodukt des Befehls, sondern
 * die Vergleichsgrundlage ueber Versionen (Boot-Dauer, Fehlerzeilen, Ergebnis
 * je Lauf). Lesen, Anhaengen und Darstellen gehoerten deshalb in einen
 * Besitzer statt in den Befehl, der sie zufaellig braucht — `install-user.mjs`
 * ruft hier an, es fuehrt keine zweite Formatierung.
 *
 * DIE REGEL BEIM LESEN: eine unlesbare Zeile wird GEMELDET und uebersprungen,
 * nie verschluckt und nie als neuer Lauf erfunden. Ein Protokoll, das still
 * Zeilen verliert, ist schlimmer als eines, das sichtbar kaputt ist.
 */
import { appendFileSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname } from 'node:path';

/**
 * Das Protokoll lesen.
 * @param {string} file
 * @param {{warn?: (line: string) => void}} [options]
 * @returns {object[]} die Rohzeilen, in Schreibreihenfolge
 */
export function readRunLog(file, options = {}) {
  let raw = '';
  try {
    raw = readFileSync(file, 'utf8');
  } catch {
    return [];
  }
  const rows = [];
  for (const line of raw.split('\n')) {
    if (line.trim() === '') continue;
    try {
      rows.push(JSON.parse(line));
    } catch {
      options.warn?.(`unlesbare Zeile im Protokoll übersprungen (${file})`);
    }
  }
  return rows;
}

/**
 * Eine Zeile anhängen — dauerhaft, ohne Token, ohne Schluessel.
 * @param {string} file
 * @param {object} record
 * @returns {string} der Pfad, den der Aufrufer melden kann
 */
export function appendRunLog(file, record) {
  mkdirSync(dirname(file), { recursive: true });
  appendFileSync(file, `${JSON.stringify(record)}\n`);
  return file;
}

/** Sekunden als feste Breite — die Tabelle soll ohne Nachjustieren lesbar sein. */
const seconds = (ms) => (ms == null ? '  —  ' : `${(ms / 1000).toFixed(1)}s`.padStart(6));

/**
 * `history` — der Vergleich ueber Versionen, ohne `--json` als Tabelle.
 *
 * Erwartet die bereits GELESENEN Zeilen: wer sie schon hat (der Befehl druckt
 * die Quelle), liest sie nicht zweimal.
 * @param {{rows: object[], limit: number, say: (line?: string) => void}} input
 * @returns {0}
 */
export function printHistory({ rows, limit, say }) {
  const shown = rows.slice(-limit);
  say('');
  say('  Datum (UTC)       Stand         Trigger                      Boot    Gesamt  Plugins  Fehler  Bytes   Ergebnis');
  for (const row of shown) {
    const when = String(row.at ?? '').slice(0, 16).replace('T', ' ');
    say(
      `  ${when.padEnd(17)} ${String(row.sha ?? '—').slice(0, 12).padEnd(13)} ${String(row.trigger ?? '—').slice(0, 28).padEnd(28)} ` +
        `${seconds(row.bootMs)} ${seconds(row.totalMs)} ${String(row.plugins ?? 0).padStart(7)} ${String(row.errors?.length ?? 0).padStart(7)} ${String(row.http?.bytes ?? 0).padStart(7)}   ${row.ok ? 'grün' : 'rot'}`,
    );
  }
  const boots = rows.map((row) => row.bootMs).filter((value) => Number.isFinite(value) && value > 0).sort((a, b) => a - b);
  const green = rows.filter((row) => row.ok).length;
  const median = boots.length === 0 ? null : boots[Math.floor(boots.length / 2)];
  say('');
  say(`  ${rows.length} Läufe · ${green} grün · ${rows.length - green} rot`);
  if (boots.length > 0) say(`  Boot: min ${(boots[0] / 1000).toFixed(1)}s · median ${(median / 1000).toFixed(1)}s · max ${(boots.at(-1) / 1000).toFixed(1)}s (${boots.length} Messungen)`);
  const byVersion = new Map();
  for (const row of rows) {
    const key = row.dsh ?? 'ohne dsh-Angabe';
    const entry = byVersion.get(key) ?? { runs: 0, green: 0, boots: [] };
    entry.runs += 1;
    if (row.ok) entry.green += 1;
    if (Number.isFinite(row.bootMs) && row.bootMs > 0) entry.boots.push(row.bootMs);
    byVersion.set(key, entry);
  }
  for (const [version, entry] of byVersion) {
    const best = entry.boots.length === 0 ? '—' : `${(entry.boots.reduce((sum, value) => sum + value, 0) / entry.boots.length / 1000).toFixed(1)}s`;
    say(`  dsh ${version}: ${entry.runs} Lauf/Läufe, ${entry.green} grün, Ø Boot ${best}`);
  }
  return 0;
}
