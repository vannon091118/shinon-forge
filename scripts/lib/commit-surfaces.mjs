/**
 * scripts/lib/commit-surfaces.mjs — die zwei Oberflächen der Commit-Regel.
 *
 * Der Wächter (`scripts/lib/commit-text.mjs`) prüft eine NACHRICHT. Diese
 * Datei prüft die beiden Orte, an denen die Regel AUSGEFÜHRT wird: den
 * CI-Workflow und die Git-Hooks. Beide sind Text, beide sind fail-closed, und
 * beide waren bis 2026-10-22 im Gate-Plugin `commit-trailer.mjs` beheimatet —
 * also in einer Datei mit der Grenze 100, obwohl sie mit der Nachrichtenregel
 * nur den Gegenstand teilen, nicht die Rechnung.
 *
 * Kein Import aus dem Repo: die Funktionen bekommen den Text und geben Befunde
 * zurück. Damit laufen sie im Gate, im Test und in einer Probe gleich.
 *
 * `workflowIssues` prüft, dass der Lauf IMMER stattfindet (Trigger, keine
 * Pfad-/Branch-Filter, kein `continue-on-error`, keine Bereichsableitung im
 * YAML) und dass die teuren Prüfungen wirklich aufgerufen werden. Für die
 * Gate-Tests ist der Aufruf seit 2026-10-23 `npm run gate:test:all`: der Glob
 * verlor die langsamen Dateien an den 20-s-Deckel und `node --test` meldete
 * einen abgebrochenen Test trotzdem mit Exit 0 — ein Deckel, der nicht rot
 * wird, ist kein Deckel.
 *
 * `hookIssues` prüft die Hook-Dateien: `commit-msg` prüft ohne `--fix`,
 * `prepare-commit-msg` tauscht, `pre-commit` fährt die schnelle Linie und
 * NIEMALS einen der langsamen Pole. Die Trennung schnell/lokal gegen voll/CI
 * ist nur dann eine Trennung, wenn der lokale Hook sie nicht selbst aufhebt.
 */

/** CI-Workflow: „immer" ist prüfbar, nicht behauptet. */
export function workflowIssues(text, file = '.github/workflows/commit-guard.yml') {
  const issues = [];
  if (!/^on:\s*$/m.test(text) && !/^on:\s*\n/m.test(text)) issues.push(`${file}: on:-Block fehlt`);
  for (const trigger of ['push:', 'pull_request:']) {
    if (!text.includes(trigger)) issues.push(`${file}: Trigger ${trigger} fehlt (der Wächter muss immer laufen)`);
  }
  for (const filter of ['paths:', 'paths-ignore:', 'branches-ignore:']) {
    if (text.includes(filter)) issues.push(`${file}: ${filter} filtert den Lauf — der Wächter darf nicht bedingt sein`);
  }
  // continue-on-error macht einen fehlgeschlagenen Wächter unsichtbar: fail-open.
  if (/continue-on-error:\s*true/.test(text)) {
    issues.push(`${file}: continue-on-error: true entschärft den Wächter (fail-open)`);
  }
  // Die Bereichslogik gehört in den Wächter, wo sie getestet wird.
  if (/(^|\s)range=|git log|rev-parse/.test(text)) {
    issues.push(`${file}: leitet den Prüfbereich im YAML ab — das muss der Wächter (--ci) tun`);
  }
  if (!text.includes('scripts/commit-guard.mjs --ci')) issues.push(`${file}: ruft den Commit-Wächter nicht auf`);
  // Beide Bahnen über den Runner, nicht über einen Glob — siehe Dateikopf.
  if (!text.includes('npm run gate:test:all')) issues.push(`${file}: fährt die Gate-Tests nicht (npm run gate:test:all)`);
  return issues;
}

/** Hook-Dateien: fail-closed prüfen, reparieren erlauben — in dieser Richtung. */
export function hookIssues(hooks, dir = '.githooks') {
  const issues = [];
  const commitMsg = hooks['commit-msg'] ?? '';
  const prepare = hooks['prepare-commit-msg'] ?? '';
  if (!commitMsg.includes('--file')) issues.push(`${dir}/commit-msg: prüft keine Nachricht`);
  if (commitMsg.includes('--fix')) issues.push(`${dir}/commit-msg: enthält --fix — der Prüf-Hook darf nicht reparieren`);
  if (!prepare.includes('--fix')) issues.push(`${dir}/prepare-commit-msg: tauscht die Signatur nicht (--fix fehlt)`);
  const preCommit = hooks['pre-commit'] ?? '';
  // Nur Befehlszeilen zählen: ein Kommentar darf den vollen Lauf beim Namen
  // nennen (Erklärung), ausführen darf ihn nur CI.
  const preCommitCommands = preCommit
    .split('\n')
    .filter((line) => !line.trim().startsWith('#'))
    .join('\n');
  if (!preCommitCommands.includes('npm test')) issues.push(`${dir}/pre-commit: fährt nicht die schnelle Linie (npm test fehlt)`);
  // Die langsamen Pole dürfen nie still in den lokalen Hook wandern — sonst ist
  // die Trennung schnell/lokal vs. voll/CI nur ein Name und die Hardware zahlt
  // bei jedem Commit den vollen Lauf.
  for (const slow of ['test:full', 'pack-test', 'gate:full', 'gate:test', 'scale:check', 'branding']) {
    if (preCommitCommands.includes(slow)) issues.push(`${dir}/pre-commit: enthält ${slow} — der volle Lauf gehört in CI, nicht in den Commit`);
  }
  if (!commitMsg.includes('commit-guard.mjs') || !prepare.includes('commit-guard.mjs')) {
    issues.push(`${dir}: Hook ruft den Wächter nicht auf`);
  }
  return issues;
}
