// Die §16-Policy als DATEN — eigener Kern, weil `index.js` eine eingefrorene
// Zeilengrenze hat und weil diese Tabelle nichts über Cordis, Config oder den
// Goal-Dienst weiß. Importfrei, also allein testbar.
//
// Der Satz, der hier in Zahlen steht: das Modell liefert ein ETIKETT, die Runtime
// entscheidet. Diese Datei enthält nur das Etikett-Vokabular und die Gewichte,
// keine Entscheidung — die trifft `decide()` in `index.js`.

// Kein Paket importiert das andere; ein Abnahmetest pinnt die Gleichheit.
/**
 * Das geschlossene Vokabular aus §16, wortgleich mit dem Enhancer. Eine Klasse
 * ausserhalb dieser Liste ist keine Klassifikation, sondern Text. UNDEFINED ist
 * ausdruecklich KEIN Mitglied: der Resolver sagt damit „ich entscheide das
 * nicht" — wer sie als Klasse fuehrt, hat geraten.
 */
export const INTENT_CLASSES = ['CHAT', 'LOOKUP', 'TRANSFORM', 'MULTI_STEP_TASK', 'LONG_RUNNING_GOAL'];
export const INTENT_UNDEFINED = 'UNDEFINED';

/**
 * Gewicht je Klasse — DATEN. §16 nennt fuer CHAT, LOOKUP und TRANSFORM einen
 * linearen Turn und fuer MULTI_STEP_TASK und LONG_RUNNING_GOAL einen
 * Goal-Kandidaten; diese Tabelle IST diese Aussage, in Zahlen.
 *
 * LONG_RUNNING_GOAL wiegt hoeher als MULTI_STEP_TASK, damit eine Schwelle
 * oberhalb von 2 den Mehrschritt-Auftrag zurueckstufen kann, ohne auch die
 * langfristige Absicht zu verlieren — sonst gaebe es nur "alles oder nichts".
 */
export const INTENT_WEIGHTS = {
  CHAT: 0,
  LOOKUP: 0,
  TRANSFORM: 0,
  MULTI_STEP_TASK: 2,
  LONG_RUNNING_GOAL: 3,
};

/** Die Schwelle aus §16 („der konkrete Schwellenwert ... als Runtime-Policy"). */
export const DEFAULT_THRESHOLD = 2;

/**
 * Die Substanzgrenze in ZEICHEN des rohen Prompts.
 *
 * Bewusst eine Zeichenzahl und keine Sprachanalyse: ein Detektor, der Auftraege
 * "versteht", waere eine zweite Klassifikation neben der ersten. Eine Grenze auf
 * die LANGE ist grob, deterministisch und nachpruefbar — und sie kann nur
 * zurueckstufen. Der konkrete Wert ist eine Entscheidung (im Profil sichtbar),
 * keine Wahrheit.
 */
export const DEFAULT_MIN_RAW_LENGTH = 24;
