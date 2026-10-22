/**
 * Auf ein Ereignis warten — EINE Fassung.
 *
 * Vier Gate-Tests hatten ihre eigene `until`-Schleife, in drei Bedeutungen:
 * „gib den Wert zurueck, sonst null" (Zaehlversuche), „gib true/false" mit
 * Frist, und eine Variante, die am Ende noch einmal prueft. Die gemeinsame
 * Fassung nimmt die Frist in Millisekunden (das ist die Groesse, die ein Test
 * wirklich meint, nicht die Zahl der Versuche) und gibt den ERSTEN wahren Wert
 * zurueck; der letzte Blick nach Ablauf der Frist faengt den Fall, in dem das
 * Ereignis genau zwischen letztem Schlaf und Rueckkehr eintrifft. Aufrufer, die
 * nur ja/nein brauchen, schreiben `Boolean(await waitFor(...))`.
 *
 * Warum das ein Helfer und keine Kopie ist: die Frist steht in der Testzeit-
 * Regel (5 s fuer ein Ereignis). Vier Kopien heisst vier Stellen, an denen
 * diese Zahl gedriftet ist.
 */
export async function waitFor(check, { timeoutMs = 4000, stepMs = 25 } = {}) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const value = await check();
    if (value) return value;
    await new Promise((resolve) => setTimeout(resolve, stepMs));
  }
  return (await check()) || null;
}
