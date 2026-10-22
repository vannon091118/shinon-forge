/**
 * @shinon/prompter — budget-core.js
 *
 * Die Budget-Wahrheit des MAX-Kontexts: das Token-Budget gilt dem GERENDERTEN
 * Block, nicht dem Datei-Inhalt.
 *
 * DER DEFekt, den diese Datei behebt (gemessen 2026-10-21, echter Index, Root
 * /opt/shinon-forge, Prompt 'Wie kommen Persona und Skills beim main model
 * an?'): `resolveContext` (packages/project-index/assets/index-context.js)
 * fuellt den Datei-INHALT bis zum Zeichen-Budget. Danach kommen die Metadaten
 * unbegrenzt dazu — `symbols` (bis 200, Zeile 2196), `touches` (2199) und
 * `dependencies` (2203) — und der Renderer (render-context.js:75) setzt darueber
 * sein Markup. Der gerenderte Block war damit groesser als das gesetzte
 * Budget:
 *
 *   Budget 6000 -> 33 217 Zeichen = ~8 304 Token (38 % ueber)
 *   Budget 3000 -> 21 285 Zeichen = ~5 321 Token (ueber)
 *   Budget 1500 -> 15 225 Zeichen = ~3 806 Token (77 % ueber)
 *
 * Der Ueberschuss wird RELATIV groesser bei kleinerem Budget, und er waechst
 * nicht proportional: gemessen ist der Overhead bei 6000, 3000 und 1500 Token
 * GLEICH (9 342 Zeichen), weil der Index bei jedem Budget dieselben 46 Dateien
 * und dieselben 200/85/26 Metadaten liefert — nur der Inhalt schrumpft. Eine
 * lineare Korrektur (Overhead abziehen) reicht darum nicht: der Overhead muss
 * VOR der Fuellung beruecksichtigt und NACH dem Rendern noch einmal geprueft
 * werden. Genau das macht diese Datei: sie RESERVIERT und sie PRUEFT.
 *
 * WARUM IM PROMPTER UND NICHT IM INDEX: der Index kennt das Markup des
 * Prompter-Renderers nicht (context_contract-Zeile, project-Zeile, ein
 * file-Element je Datei) und soll die Symbole auch nicht deckeln — sie sind der
 * Grund, warum der Kontext ueberhaupt hilft. Gekuerzt wird dort, wo der Text
 * entsteht: der Prompter ist der, der den GERENDERTEN Block sieht, und nur er
 * kann ihn gegen sein Budget messen. Der Index-Vertrag bleibt unberuehrt: sein
 * `budgetTokens` bleibt, was er ist — ein Zeichen-Budget fuer den Inhalt.
 *
 * KEIN Import (weder Bare noch `node:`) — derselbe Grund wie bei `abort-core.js`:
 * die Rechnung laeuft in CI ohne `node_modules`. Der Renderer wird als
 * ARGUMENT uebergeben (`render`), damit diese Datei die Markup-Form nicht ein
 * zweites Mal kennt: die Form gehoert `render-context.js` und ist von
 * `prompter-contract.test.mjs` gepinnt.
 */

/**
 * Zeichen je Token — der Umrechnungsfaktor, mit dem der Index seine
 * Zeichen-Budgets rechnet (packages/project-index/assets/index-core.js,
 * `CHARS_PER_TOKEN`; dieselbe Zahl in dessen `tokens()`).
 *
 * Die Zahl steht hier ein zweites Mal, weil kein Paket ein anderes importiert:
 * der Faktor ist eine Konvention beider Seiten, kein Geheimnis der einen Seite.
 */
export const CHARS_PER_TOKEN = 4;

/**
 * Der benannte Grund, wenn der gerenderte Block das Budget reisst. Das Muster
 * ist das der Facts-Snapshots (packages/project-index/assets/facts-snapshot.js):
 * ein Grund, der die Zahlen MIT nennt — `BUDGET_UEBERSCHRITTEN:<ist>/<soll>`.
 * Ein stilles Kuerzen waere eine Behauptung ohne Beleg; der Grund ist der Beleg.
 */
export const BUDGET_OVERHEAD_GRUND = 'BUDGET_UEBERSCHRITTEN';

/**
 * Die Tokenzahl eines Textes: Zeichen/4, aufgerundet.
 *
 * GEZAEHLT WIRD IN ZEICHEN, nicht in Bytes: der Index rechnet sein Budget
 * ebenfalls in Zeichen (`charBudget = budget * CHARS_PER_TOKEN`, und dessen
 * `tokens()` teilt die ZEICHENzahl durch denselben Faktor). Ein Byte-Budget
 * waere eine ZWEITE Definition von "Token" im selben Repo — und die
 * Tokenizers der Anbieter sind nicht einmal untereinander gleich, also taegt
 * eine eigene Rechnung hier nur eine Zahl, die niemand nachrechnen kann.
 * Aufgerundet wird: ein Block, der genau auf der Grenze landet, ist noch DRIN.
 */
export function tokensOf(text) {
  const chars = typeof text === 'string' ? text.length : 0;
  return Math.ceil(chars / CHARS_PER_TOKEN);
}

/**
 * Das Modell des Overheads: was der gerenderte Block KOSTET, was nicht
 * Datei-Inhalt ist — als EINE Formel, in Zeichen.
 *
 * EINE Formel, drei Arten von Overhead, jeder Faktor mit seinem Grund. Die
 * VORGABEN sind bewusst KONSERVATIV gewaehlt (gerundet nach oben): die Reserve
 * soll lieber etwas zu viel freihalten als zu wenig — ein zu kleiner Reserve
 * wuerde den Block am Rand auffliegen lassen.
 *
 *   fix             Der Rahmen des Blocks: oeffnende Marke, context_contract-
 *                   und project-Zeile, schliessende Marke. Gemessen: 140
 *                   Zeichen; reserviert: 160.
 *   markupProFile   Das Markup EINES file-Elements ohne seinen Inhalt:
 *                   '\n<file path="…">' + '\n' + '\n</file>' = 24 Zeichen plus
 *                   der Pfad. Gemessen am echten Index: 24 + 30.6 (mittlere
 *                   Pfadlaenge) = 54.6; reserviert: 64.
 *   nameLen         Ein Symbolname plus sein Trennzeichen ', ' (2 Zeichen).
 *                   Gemessen: 12.5 + 2 = 14.5; reserviert: 16. Die Symbole sind
 *                   der Grund, warum der Kontext ueberhaupt hilft — sie werden
 *                   deshalb nicht geschaetzt, sondern in der Reserve
 *                   beruecksichtigt.
 *   refLen          Ein Verweis (Touch) plus sein Trennzeichen — dieselbe
 *                   Regel wie bei den Symbolen. Gemessen: 36.2 + 2 = 38.2;
 *                   reserviert: 40.
 *   depLen          Eine Abhaengigkeit plus Trennzeichen. Gemessen: 16.2 + 2 =
 *                   18.2; reserviert: 24. Abhaengigkeiten sind Paketnamen und
 *                   damit kuerzer als Touch-Pfade; der Default ist `refLen`,
 *                   damit die Formel mit einer Zahl je Art auskommt.
 *
 * Die Reserve ist eine SCHAETZUNG; die Wahrheit ist der gerenderte Block
 * (siehe `checkBudget`). Deshalb wird nach dem Kuerzen noch einmal gerendert
 * und geprueft — und nachgefasst, falls die Reserve zu klein war.
 */
export function overheadOf({
  files = 0,
  symbols = 0,
  touches = 0,
  dependencies = 0,
  fix = 160,
  markupProFile = 64,
  nameLen = 16,
  refLen = 40,
  depLen = refLen,
} = {}) {
  const n = (value) => (Number.isFinite(value) && value > 0 ? Math.ceil(value) : 0);
  return fix
    + n(files) * markupProFile
    + n(symbols) * nameLen
    + n(touches) * refLen
    + n(dependencies) * depLen;
}

/**
 * Das effektive Inhalts-Budget: was vom Token-Budget fuer den Datei-Inhalt
 * uebrig bleibt, wenn der Overhead (Markup + Metadaten) schon bezahlt ist.
 *
 * Nie negativ: ein Block, der allein das Budget sprengt, hat keinen Inhalt.
 * Null ist die ehrliche Antwort, und der Aufrufer meldet das als Grund,
 * statt eine negative Zahl weiterzurechnen.
 */
export function effectiveContentBudget(budgetTokens, overheadChars) {
  const tokens = Number.isFinite(budgetTokens) && budgetTokens > 0 ? budgetTokens : 0;
  const overhead = Number.isFinite(overheadChars) && overheadChars > 0 ? overheadChars : 0;
  return Math.max(0, tokens * CHARS_PER_TOKEN - overhead);
}

/**
 * Nach dem Rendern: haelt der gerenderte Block das Budget?
 *
 * Rueckgabe: `{ ok, tokens, chars, grund }`. `grund` ist null, solange der
 * Block passt, und sonst der BENANNTE Grund mit den Zahlen:
 * `BUDGET_UEBERSCHRITTEN:<ist>/<soll>` — ist in Token, soll in Token. Ein
 * Ueberschreiten ohne Grund waere ein stilles Kuerzen.
 *
 * Ein Budget von 0 ist eine HARTE Grenze, keine fehlende Angabe: 0 Token
 * erlauben keinen Block. (Der Vorgabewert der Konfiguration ist 6000.)
 */
export function checkBudget(gerendert, budgetTokens) {
  const text = typeof gerendert === 'string' ? gerendert : '';
  const tokens = tokensOf(text);
  const soll = Number.isFinite(budgetTokens) && budgetTokens > 0 ? Math.floor(budgetTokens) : 0;
  const ok = tokens <= soll;
  return {
    ok,
    tokens,
    chars: text.length,
    grund: ok ? null : `${BUDGET_OVERHEAD_GRUND}:${tokens}/${soll}`,
  };
}

/**
 * Die Zeichen, die der Datei-Inhalt eines Kontextes belegt.
 *
 * Der Inhalt ist das, was das Budget zuerst auffrisst; je Datei zaehlt ihr
 * Inhalt, nicht ihr Pfad (der Pfad gehoert zum Overhead).
 */
function contentChars(files) {
  let sum = 0;
  for (const file of files) sum += typeof file?.content === 'string' ? file.content.length : 0;
  return sum;
}

/**
 * Den Kontext auf sein Token-Budget kuerzen — oder melden, dass er nicht
 * hineinpasst.
 *
 * DIE EINE REGEL: das Budget gilt dem GERENDERTEN Block. Der Index hat den
 * Inhalt bereits bis zum Zeichen-Budget gefuellt und die Metadaten obendrauf
 * gelegt; der gerenderte Block ist deshalb groesser als das Budget. Der
 * Prompter kuerzt hier, in drei Schritten:
 *
 *   1. RESERVIEREN. Aus den Mengen des gelieferten Kontexts (Dateien, Symbole,
 *      Touches, Abhaengigkeiten) wird der Overhead berechnet (`overheadOf`) und
 *      daraus das effektive Inhalts-Budget (`effectiveContentBudget`).
 *   2. KUERZEN. Der Inhalt wird auf dieses Budget gebracht: die Datei-Eintraege
 *      fallen von HINTEN weg. Das ist die richtige Richtung — der Index liefert
 *      die Dateien nach Relevanz sortiert (das Erste passt am besten zum
 *      Prompt), also fallen die schwächsten zuerst. Der Metadata-Anhang bleibt
 *      unangetastet: er ist die Auswahl des Index, und ein Weglassen waere eine
 *      zweite Auswahl.
 *   3. PRUEFEN. Der gekuerzte Block wird WIEDER gerendert und geprueft
 *      (`checkBudget`). Das ist keine Formsache: die Reserve war eine
 *      Schaetzung, und das Rendern ist die Wahrheit. Passt es trotzdem nicht,
 *      faellt der naechste Datei-Eintrag weg, bis der Block passt oder kein
 *      Eintrag mehr da ist.
 *
 * Passt der Block am Ende immer noch nicht — dann passt er auch ohne Datei-
 * Inhalt nicht, weil die Metadaten allein das Budget sprengen —, ist der
 * Kontext ZU GROSS fuer diesen Schritt: `ok` ist false und `context` ist null.
 * Der Schritt laeuft dann ohne Kontext weiter und der Grund steht im
 * Datensatz. Nie stillschweigend akzeptiert.
 *
 * `render` ist der Renderer des Aufrufers (render-context.js) — diese Datei
 * kennt die Markup-Form nicht ein zweites Mal.
 *
 * @returns {{ok: boolean, context: object|null, gerendert: string, grund: string|null,
 *            entfernt: number, tokens: number, chars: number, overhead: number, reserve: number}}
 */
export function kuerzeAufBudget(context, { budgetTokens, render } = {}) {
  const renderText = typeof render === 'function' ? render : () => '';
  const files = Array.isArray(context?.files) ? context.files : [];
  const symbols = Array.isArray(context?.symbols) ? context.symbols : [];
  const touches = Array.isArray(context?.touches) ? context.touches : [];
  const dependencies = Array.isArray(context?.dependencies) ? context.dependencies : [];

  const gerendert = renderText(context);
  const pruefung = checkBudget(gerendert, budgetTokens);
  if (pruefung.ok) {
    return {
      ok: true,
      context,
      gerendert,
      grund: null,
      entfernt: 0,
      tokens: pruefung.tokens,
      chars: pruefung.chars,
      overhead: 0,
      reserve: 0,
    };
  }

  // Schritt 1: reservieren. Die Reserve ist der Overhead, den die drei Arten
  // von Metadaten und das Datei-Markup kosten.
  const reserve = overheadOf({
    files: files.length,
    symbols: symbols.length,
    touches: touches.length,
    dependencies: dependencies.length,
  });
  const erlaubt = effectiveContentBudget(budgetTokens, reserve);

  // Schritt 2: kuerzen. Die Inhalte, die nicht mehr hineinpassen, fallen weg —
  // von hinten, weil der Index die Dateien nach Relevanz liefert.
  let keep = 0;
  let used = 0;
  for (const file of files) {
    const length = typeof file?.content === 'string' ? file.content.length : 0;
    if (used + length > erlaubt) break;
    used += length;
    keep += 1;
  }
  let cut = { ...context, files: files.slice(0, keep) };
  let text = renderText(cut);
  let ende = checkBudget(text, budgetTokens);

  // Schritt 3: pruefen und nachfassen. War die Reserve zu klein (der
  // gerenderte Block ist laenger als die rohe Zeichenzahl, weil die
  // Neutralisierung der Blockmarken Zeichen hinzufuegen kann), faellt der
  // naechste Datei-Eintrag weg — bis der Block passt oder nichts mehr da ist.
  while (!ende.ok && cut.files.length > 0) {
    cut = { ...cut, files: cut.files.slice(0, -1) };
    text = renderText(cut);
    ende = checkBudget(text, budgetTokens);
  }

  return {
    ok: ende.ok,
    context: ende.ok ? cut : null,
    gerendert: text,
    // Der Grund nennt die ZAHL, die gesprengt hat: die des gelieferten
    // Blocks, nicht die des gekuerzten. Sonst waere die Meldung nach dem
    // Kuerzen still — und genau das Schweigen ist der Defekt.
    grund: pruefung.grund,
    entfernt: files.length - cut.files.length,
    tokens: ende.tokens,
    chars: ende.chars,
    // Der gemessene Overhead des gelieferten Blocks steht neben der Reserve:
    // die Reserve ist die Planung, der gemessene Wert die Tatsache.
    overhead: gerendert.length - contentChars(files),
    reserve,
  };
}
