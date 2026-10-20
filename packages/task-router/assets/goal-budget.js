// Die Runden-Policy des Task-Routers — als eigener Kern, weil `index.js` eine
// eingefrorene Grenze hat und der Autonomie-Schritt sie sonst überschritten
// hätte. Der Kern ist importfrei: er kennt keine Config, keinen Dienst, kein
// Cordis — nur Zahlen und eine Prüfung. Deshalb ist er allein testbar.
//
// Warum die Grenze überhaupt geprüft wird: `maxGoalRounds` ging bis zum
// Autonomie-Schritt ungeprüft an DSH. Ein Profilwert von 0 oder 1 000 000 wäre
// still durchgereicht worden, und niemand hätte am Datensatz gesehen, dass die
// Fortsetzung nicht das tut, was dasteht.

/**
 * Die Runden-Obergrenze eines automatisch aktivierten Goals — SHINONS
 * Stop-Policy.
 *
 * DSH selbst erlaubt 256 Runden (`defaultMaxGoalRounds: 256` in der
 * installierten Fassung). Das ist eine Obergrenze gegen Endlosigkeit, keine
 * Kostenbremse: eine Runde ist ein vollstaendiger Agentenschritt mit
 * Modellaufrufen. Der Wert hier ist deshalb klein und bewusst eine Entscheidung
 * im Profil — und die Blockade am Limit macht DSH selbst (`round-limit`).
 */
export const DEFAULT_MAX_GOAL_ROUNDS = 6;

/**
 * Die Obergrenze von Shinons Stop-Policy (Autonomie-Schritt).
 *
 * Eine Runde ist ein vollständiger Agentenschritt mit Modellaufrufen — hier
 * endet die Fortsetzung, statt unbegrenzt zu laufen. Wer mehr braucht, ändert
 * diese Zahl bewusst, nicht per Tippfehler im Profil. Geprüft wird laut
 * (`ROUNDS_UNGUELTIG`, `ROUNDS_ZU_HOCH`), nie still gekürzt.
 */
export const MAX_GOAL_ROUNDS_CEILING = 12;

/**
 * Prüft die Rundengrenze aus der Config. Gibt { ok, rounds, reason } zurück:
 * keine Zahl oder kleiner als 1 ⇒ ROUNDS_UNGUELTIG, über der Obergrenze ⇒
 * ROUNDS_ZU_HOCH. Gekürzt wird nichts — ein gekappter Wert behauptete später
 * eine andere Zahl als die, mit der DSH läuft.
 */
export function goalRoundsVerdict(value) {
  if (!Number.isInteger(value) || value < 1) return { ok: false, rounds: 0, reason: 'ROUNDS_UNGUELTIG' };
  if (value > MAX_GOAL_ROUNDS_CEILING) return { ok: false, rounds: value, reason: 'ROUNDS_ZU_HOCH' };
  return { ok: true, rounds: value, reason: '' };
}
