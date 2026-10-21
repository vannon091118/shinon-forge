import z from '@deepseek-ai/schemastery';

import { resolveWorkspaceRoot } from '@shinon/seams/core';

import {
  DIFF_CONTRACT,
  DIFF_ENDPOINT,
  DIFF_FILE_CONTRACT,
  FILE_MARKS,
  LINE_MARKS,
  buildOverview,
  clipLine,
  parseNumstat,
  parseStatus,
  parseUnified,
  statusOf,
} from './assets/diff-core.js';
import { gitScope, hasGit, readFileDiff, readOverview, runGit, safeInside } from './assets/git-diff.js';

/**
 * @shinon/diff-overview — die Übersicht der Arbeitsbaum-Änderungen im
 * WorkspaceBrowser: erst nur +/−-Zahlen, auf Klick die Zeilen.
 *
 * WARUM ES DIESES PAKET GIBT: der Datei-Browser im rechten Sidebar zeigt, WAS
 * im Baum liegt, aber nicht, WAS SICH GEÄNDERT HAT. Wer eine Sitzung beendet,
 * musste bisher den Browser verlassen und `git status`/`git diff` im Terminal
 * tippen, um zu sehen, was der Agent angefasst hat — und dabei raten, welche der
 * Dateien zum Lauf gehören. Das Panel macht genau eine Angabe sichtbar: welche
 * Dateien gegen HEAD geändert sind, mit wie vielen Zeilen, und auf Klick welche.
 *
 * DIE EHRLICHE GRENZE: dieses Paket baut KEINEN Diff. Es fragt `git` und zeigt,
 * was Git geantwortet hat. `node_modules/diff` liegt nur transitiv im Baum (kein
 * Workspace-Paket deklariert es), einen Diff-Dienst gibt es nicht — gemessen in
 * `docs/probes/diff-overview.json`. Ein zweiter Diff-Algorithmus wäre eine zweite
 * Wahrheit über dieselbe Sache. Was Git nicht vergleicht — unversionierte
 * Dateien, Binärdateien — zählt nicht mit und steht mit Grund da, statt als 0.
 *
 * DIE NAHT ZUM BROWSER ist eine ROUTE, die der Host selbst registriert (der
 * Browser darf keine Host-Endpunkte registrieren, die Remote-Beiträge kommen aus
 * einer kompilierten Liste): `GET <endpoint>` liefert die Übersicht,
 * `GET <endpoint>/file?path=…` die Hunks einer Datei. Beides ist LESEND; es gibt
 * nichts zu bestätigen und nichts zu schreiben.
 *
 * DIE WURZEL ist die des Hosts, nicht die des Tabs: `resolveWorkspaceRoot`
 * (`@shinon/seams/core`) entscheidet ausdrücklich > Umgebung > cwd. Ein Pfad aus
 * dem Browser wird nie geglaubt — `safeInside` weist Ausbrüche ab, und die Route
 * antwortet mit `NICHT_IM_BAUM` statt mit einer Datei von außerhalb.
 */

export {
  DIFF_CONTRACT,
  DIFF_ENDPOINT,
  DIFF_FILE_CONTRACT,
  FILE_MARKS,
  LINE_MARKS,
  buildOverview,
  clipLine,
  parseNumstat,
  parseStatus,
  parseUnified,
  statusOf,
};
export { gitScope, hasGit, readFileDiff, readOverview, runGit, safeInside };

export const Config = z.object({
  enabled: z.boolean().description('Diff-Übersicht im Datei-Browser anzeigen').default(true),
  endpoint: z.string().description('Route für Übersicht und Datei-Diff').default(DIFF_ENDPOINT),
  workspaceRoot: z.string().description('Wurzel ausdrücklich setzen (leer = Umgebung, dann cwd)').default(''),
  maxFiles: z.number().description('Höchstzahl gelisteter Dateien; darüber wird die Grenze gemeldet').default(200),
  maxLines: z.number().description('Höchstzahl Diff-Zeilen je Datei; darüber wird die Grenze gemeldet').default(400),
  maxLineChars: z.number().description('Höchstlänge einer Diff-Zeile in Zeichen (sichtbar gekürzt)').default(400),
});

/**
 * Eine JSON-Antwort schreiben. `no-store`, weil ein gecachter Diff der
 * gefährlichste ist: er sieht aus wie der aktuelle Stand.
 * @param {object} res
 * @param {number} code
 * @param {object} payload
 */
function send(res, code, payload) {
  if (res.headersSent === true) return;
  res.writeHead(code, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  res.end(JSON.stringify(payload));
}

/**
 * Die Route an den Webserver hängen. Fehlt `webServer.register`, bleibt das
 * Panel ohne Daten und sagt das — es erfindet keinen Zustand.
 * @param {object} ctx
 * @param {{ endpoint: string, root: string, maxFiles: number, maxLines: number, maxLineChars: number }} options
 */
function mountRoute(ctx, options) {
  const mount = (webCtx) => {
    const webServer = typeof webCtx?.get === 'function' ? webCtx.get('webServer') : undefined;
    if (typeof webServer?.register !== 'function') {
      console.log('[shinon-diff-overview] webServer ohne register — das Panel bleibt ohne Daten');
      return;
    }
    const overview = webServer.register({
      kind: 'exact',
      path: options.endpoint,
      handler: (req, res) => {
        if (req.method !== 'GET') { res.writeHead(405); res.end(); return; }
        const payload = readOverview(options.root, { maxFiles: options.maxFiles });
        // Ob Git überhaupt existiert, ist eine andere Aussage als „kein
        // Git-Baum": beides steht im Payload, weil das Panel beides benennt.
        send(res, 200, { ...payload, git: hasGit() });
      },
    });
    const file = webServer.register({
      kind: 'exact',
      path: `${options.endpoint}/file`,
      handler: (req, res) => {
        if (req.method !== 'GET') { res.writeHead(405); res.end(); return; }
        const url = new URL(req.url ?? '/', 'http://localhost');
        const path = url.searchParams.get('path') ?? '';
        const payload = readFileDiff(options.root, path, {
          maxLines: options.maxLines,
          maxLineChars: options.maxLineChars,
        });
        send(res, 200, payload);
      },
    });
    webCtx.effect?.(() => () => {
      try { overview?.(); } catch { /* schon weg */ }
      try { file?.(); } catch { /* schon weg */ }
    });
  };
  if (typeof ctx.inject === 'function') ctx.inject(['webServer'], mount);
  else mount(ctx);
}

export function apply(ctx, config) {
  const resolved = resolveWorkspaceRoot({ configRoot: config.workspaceRoot });
  const endpoint = String(config.endpoint ?? DIFF_ENDPOINT).replace(/\/+$/, '');
  const options = {
    endpoint,
    root: resolved.root,
    maxFiles: config.maxFiles,
    maxLines: config.maxLines,
    maxLineChars: config.maxLineChars,
  };

  if (config.enabled === false) {
    console.log('[shinon-diff-overview] Deaktiviert — keine Route, kein Panel');
    return () => {};
  }

  mountRoute(ctx, options);

  const probe = readOverview(resolved.root, { maxFiles: config.maxFiles });
  console.log(
    `[shinon-diff-overview] Aktiviert — Wurzel ${resolved.root} (${resolved.source}), Route ${endpoint}, ` +
    (probe.reason === null
      ? `${probe.totals.files} geänderte Dateien, +${probe.totals.added} −${probe.totals.removed}`
      : `keine Übersicht: ${probe.reason}`),
  );

  return () => {
    console.log('[shinon-diff-overview] Deaktiviert');
  };
}
