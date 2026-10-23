import z from '@deepseek-ai/schemastery';
import { createOrchestrator } from '@shinon/seams/core';
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { probe } from './assets/version-probe.js';
import { VERSION_CONTRACT, badgeLine, bannerModel } from './assets/version-state.js';

/**
 * @shinon/version — der Versionsspiegel: was laeuft, was neu ist, wie weit
 * auseinander — und ein Klick, der den Stand nachzieht.
 *
 * WARUM ES DIESES PAKET GIBT: ein installiertes Shinon sah nie, auf welchem
 * Stand es steht. Das war kein Schoenheitsfehler, sondern eine Luege im
 * Betrieb: nach einem Update, einem Rollback oder einem Handgriff in den
 * Klon war am Bildschirm nicht ablesbar, welcher Commit lief. Der Spiegel
 * macht genau eine Angabe sichtbar — den neuesten Commit, den installierten
 * Commit und den Abstand — und er steht die ganze Zeit da, ohne Aufruf.
 *
 * DIE DREI WEGE, und warum es genau drei sind:
 *   1. Die MESSUNG (assets/version-probe.js) fragt `git` und liest den Bau-
 *      Schatten eines Pakets. Sie kann nichts: sie meldet, was da ist.
 *   2. die FORMEL (assets/version-state.js) rechnet daraus eine Zeile, einen
 *      Tooltip und einen Updatesatz. Sie kennt keine Uhr und kein Netz.
 *   3. die ANZEIGE (client.js) malt den Spiegel in die Ecke und loest den
 *      Klick aus.
 *
 * DIE NAHT ZUM BROWSER ist dieselbe wie beim Marker-Spiegel: der Host schiebt
 * seinen Zustand ueber `webserver/index-inject` als `window.__DSH_VERSION_INFO__`
 * in die Seite. Der Client muss den Stand nicht raten und kann ihn nicht
 * erfinden — er zeigt, was der Host gemessen hat. Beide Seiten fuehren den
 * Namen als Literal (ein Client-Bundle kann den Host nicht importieren); der
 * Zwillings-Test in scripts/gate/tests vergleicht sie.
 *
 * DER KLICK: der Browser darf keinen Host-Endpunkt registrieren (die
 * Remote-Beitraege kommen aus einer kompilierten Liste). Darum laeuft der
 * Weg ueber eine ROUTE, die der Host selbst registriert: `GET` liefert den
 * Zustand, `POST` startet die Nachfuehrung. Die Route ist durch ein
 * Boot-Token geschuetzt: ohne Token keine Nachfuehrung, und der Origin muss
 * zum Host gehoeren. Ein fremder Tab im Browser darf keinen Update ausloesen.
 *
 * DIE NACHFUEHRUNG selbst macht das Werkzeug `scripts/install-user.mjs auto`:
 * Kandidat bauen, DORT abnehmen, und bei gruem Urteil umschalten. Das ist
 * bewusst nicht `update --force` — ein Update, das dem laufenden Prozess die
 * node_modules unter den Fuessen wegzieht, ist kein Update, sondern ein
 * Ausfall mit Ansage.
 */

/** Die Naht des Webservers, ueber die Globals in die Seite kommen. */
export const INDEX_INJECT = 'webserver/index-inject';

/** Der Name des Globals im Browser. Beide Seiten als Literal. */
export const VERSION_GLOBAL = '__DSH_VERSION_INFO__';

/** Der Vertragsname des Zustands (identisch mit assets/version-state.js). */
export { VERSION_CONTRACT } from './assets/version-state.js';

/** Die Route des Hosts — der Client fuehrt sie als Literal. */
export const VERSION_ENDPOINT = '/shinon/version';

export const Config = z.object({
  enabled: z.boolean().description('Versionsspiegel anzeigen').default(true),
  remote: z.string().description('Gegen-Commit fuer den Vergleich').default('origin'),
  branch: z.string().description('Zweig, gegen den verglichen wird').default('main'),
  endpoint: z.string().description('Route fuer Zustand und Nachfuehrung').default(VERSION_ENDPOINT),
  refreshMs: z.number().description('Abstand zweier Messungen (ms)').default(300000),
});

/**
 * Der Wurzelverzeichnis des laufenden Baums. Fuer das Paket im Repo ist das
 * der Repo-Root, fuer ein gebautes Paket der Installationsroot — beide Male
 * derselbe Ort, an dem `git` und `scripts/install-user.mjs` liegen.
 * @param {string} [from] der Pfad dieser Datei
 * @returns {string}
 */
export function rootOf(from = fileURLToPath(import.meta.url)) {
  return resolve(dirname(from), '..', '..');
}

/**
 * Der Pfad des Nachfuehrungswerkzeugs im laufenden Baum (oder `null`).
 * @param {string} root
 * @returns {string|null}
 */
export function updaterPath(root) {
  const tool = join(root, 'scripts', 'install-user.mjs');
  return existsSync(tool) ? tool : null;
}

/**
 * Die Antwort der Route: Zustand, Formel und der laufende Auftrag.
 * @param {object} state
 * @param {object|null} job
 * @returns {object}
 */
export function versionPayload(state, job = null) {
  return {
    contract: VERSION_CONTRACT,
    state,
    // `badge` ist das Banner-Modell (assets/version-state.js): Zeile, Tooltip,
    // Updatesatz UND die Frage mit ihren zwei Wegen. Der Client formuliert
    // keinen der Texte selbst — sonst stuenden zwei Fassungen derselben Frage
    // in zwei Dateien, die niemand miteinander vergleicht.
    badge: bannerModel(state),
    job,
  };
}

export function apply(ctx, config) {
  const bus = createOrchestrator(ctx, { owner: 'version' });
  const root = rootOf();
  const endpoint = config.endpoint.replace(/\/+$/, '');
  const token = randomUUID();
  const updater = updaterPath(root);

  /** Der gemessene Zustand; null, solange die erste Messung laeuft. */
  let state = null;
  /** Der Auftrag (Update-Lauf) mit seinem Fortschritt. */
  let job = null;

  const measure = (options = {}) => {
    const probed = probe(root, {
      remote: config.remote,
      branch: config.branch,
      network: config.network !== false,
      fetch: options.fetch === true,
    });
    probed.canUpdate = probed.isClone === true && updater !== null;
    probed.updateHint = probed.canUpdate
      ? ''
      : probed.isClone
        ? 'Kein Nachfuehrungswerkzeug in diesem Baum — Update ueber scripts/install-user.mjs.'
        : 'Gebautes Paket ohne Git-Baum — Update ueber ein neues Paket.';
    state = probed;
    return probed;
  };

  // Die erste Messung wartet nicht auf das Netz: sie fragt das Netz, aber sie
  // blockiert den Start nicht. Der Browser bekommt zuerst den lokalen Stand.
  try {
    measure({ fetch: false });
  } catch (error) {
    console.warn(`[shinon-version] erste Messung fehlgeschlagen: ${error?.message ?? error}`);
  }

  // ── Die Route: Zustand lesen, Nachfuehrung ausloesen ────────────────────
  const mountRoute = (webCtx) => {
    const webServer = typeof webCtx?.get === 'function' ? webCtx.get('webServer') : undefined;
    if (typeof webServer?.register !== 'function') {
      console.log('[shinon-version] webServer ohne register — der Spiegel bleibt ohne Live-Abfrage');
      return;
    }
    const origin = (req) => {
      const host = req.headers?.host ?? '';
      const from = req.headers?.origin;
      if (from === undefined) return true; // kein Origin: kein Browser-Kontext
      try {
        return new URL(from).host === host;
      } catch {
        return false;
      }
    };
    const authorized = (req) => {
      const given = req.headers?.['x-shinon-version-token'];
      return typeof given === 'string' && given === token && origin(req);
    };
    const disposeState = webServer.register({
      kind: 'exact',
      path: endpoint,
      handler: (req, res) => {
        if (req.method !== 'GET') { res.writeHead(405); res.end(); return; }
        res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' });
        res.end(JSON.stringify(versionPayload(state, job)));
      },
    });
    const disposeUpdate = webServer.register({
      kind: 'exact',
      path: `${endpoint}/update`,
      handler: async (req, res) => {
        if (req.method !== 'POST') { res.writeHead(405); res.end(); return; }
        if (!authorized(req)) { res.writeHead(403); res.end(); return; }
        const body = await readBody(req);
        const mode = body.mode === 'now' ? 'now' : 'next';
        const started = startUpdate(mode);
        res.writeHead(202, { 'content-type': 'application/json', 'cache-control': 'no-store' });
        res.end(JSON.stringify({ contract: VERSION_CONTRACT, started, mode }));
      },
    });
    webCtx.effect?.(() => () => {
      try { disposeState?.(); } catch { /* schon weg */ }
      try { disposeUpdate?.(); } catch { /* schon weg */ }
    });
  };

  /**
   * Die Nutzerfrage in einen Koerper lesen. Fehlt sie oder ist sie kein JSON,
   * gilt `next`: der vorsichtige Weg, der den laufenden Host in Ruhe laesst.
   * @param {object} req
   * @returns {Promise<object>}
   */
  const readBody = (req) => new Promise((resolve) => {
    if (typeof req?.on !== 'function') { resolve({}); return; }
    let raw = '';
    req.on('data', (chunk) => {
      raw += chunk;
      if (raw.length > 1024) { resolve({}); req.destroy?.(); }
    });
    req.on('end', () => {
      if (raw.trim() === '') { resolve({}); return; }
      try {
        const parsed = JSON.parse(raw);
        resolve(parsed !== null && typeof parsed === 'object' ? parsed : {});
      } catch {
        resolve({});
      }
    });
    req.on('error', () => resolve({}));
  });

  /**
   * Die Nachfuehrung starten. Ein Auftrag laeuft nie zweimal: der zweite
   * Klick bekommt den laufenden Auftrag zurueck, nicht einen zweiten Bau.
   *
   * `mode` ist die Antwort auf die Frage, die das Banner stellt:
   *   - `next` laesst den Host laufen und schaltet beim naechsten Start um;
   *   - `now`  beendet den laufenden Host, schaltet um und startet ihn neu.
   * Der Unterschied ist keine Bequemlichkeit: `now` beendet den Prozess, der
   * diese Route bedient — deshalb steht er im Text VOR dem Klick.
   * @param {'now'|'next'} [mode]
   * @returns {boolean} true, wenn ein Auftrag gestartet wurde
   */
  function startUpdate(mode = 'next') {
    if (job !== null && job.running === true) return false;
    if (state?.canUpdate !== true) {
      job = { running: false, mode, state: 'nicht moeglich', lines: [state?.updateHint ?? 'Kein updatefaehiges Installat.'] };
      return false;
    }
    const lines = [];
    job = { running: true, mode, state: 'laeuft', lines, startedAt: new Date().toISOString() };
    const args = [updater, 'auto', '--prefix', root, '--quiet'];
    if (mode === 'now') args.push('--now');
    const child = spawn(process.execPath, args, {
      cwd: root,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const collect = (chunk) => {
      for (const line of String(chunk).split('\n')) {
        if (line.trim() === '') continue;
        lines.push(line.trim());
        if (lines.length > 40) lines.shift();
      }
    };
    child.stdout.on('data', collect);
    child.stderr.on('data', collect);
    child.on('error', (error) => {
      job = { running: false, mode, startedAt: job?.startedAt ?? null, state: 'Fehler', lines: [...lines, String(error?.message ?? error)] };
    });
    child.on('close', (code) => {
      // `mode` und `startedAt` ueberleben das Ende: sonst kann der Client im
      // Ergebnis nicht mehr sagen, WELCHE der beiden Antworten er gegeben hat
      // (ein „jetzt" sieht in einem nackten Exit-Code wie ein „spaeter" aus).
      job = {
        running: false,
        mode,
        state: code === 0 ? 'bereit' : 'Fehler',
        exitCode: code,
        startedAt: job?.startedAt ?? null,
        lines,
        finishedAt: new Date().toISOString(),
      };
      try { measure({ fetch: false }); } catch { /* der naechste Lauf misst erneut */ }
    });
    return true;
  }

  if (!bus.demand(['webServer'], mountRoute)) mountRoute(ctx);

  // ── Der Zustand in die Seite ─────────────────────────────────────────────
  // Der Global traegt den Zustand UND das Boot-Token: die Route vergleicht
  // das Token, ohne das Token wäre die Nachfuehrung ein offenes Tor.
  //
  // Ohne `ctx.on` (Tests, fremde Hosts) bleibt die Seite ohne Spiegel — das
  // ist fail-open wie im Rest des Hosts: der Client sieht keinen Global und
  // zeichnet nichts, statt eine Zahl zu erfinden. Dieselbe Prüfung wie bei
  // @shinon/markers.
  const canInject = typeof ctx?.on === 'function';
  if (canInject) {
    bus.route(INDEX_INJECT, (table) => {
      if (!Array.isArray(table)) return;
      table.push({
        kind: 'global',
        name: VERSION_GLOBAL,
        value: { ...versionPayload(state), token, endpoint },
      });
    });
  }

  // >>> shinon:dsh-idiom settings-registration — EINE Quelle: scripts/lib/plugin-idioms.mjs (generiert; schreiben: `npm run idioms`, prüfen: Gate + dsh-test)
  // Registriert die Einstellungs-Form dieses Pakets beim Settings-Dienst.
  ctx.inject(['settings'], (child) => {
    child.effect(() => child.settings.configure({ auto: false }, ctx.fiber));
  });
  // <<< shinon:dsh-idiom settings-registration

  // Die Messung wiederholt sich, damit der Stand nicht veraltet: ein Badge,
  // der nach einem Tag eine veraltete Zahl zeigt, ist schlimmer als keiner.
  //
  // Der Cordis-Timer haengt sich an den Kontext und endet mit ihm. Den Dienst
  // `timer` darf man nur lesen, wenn er injiziert ist: ein bloßer Zugriff auf
  // `ctx.interval` wirft ohne `inject` („cannot get property timer without
  // inject“). Darum fragt die Pruefung den Dienst optional per `ctx.get` ab und
  // haengt das Intervall ueber `ctx.inject(['timer'], …)` an. Fehlt der Dienst
  // (Tests, fremde Hosts), nimmt der globale Timer die Aufgabe — mit `unref`,
  // damit er den Prozess nicht am Leben haelt, und mit eigener Aufraeumung,
  // sofern der Kontext sie anbietet.
  const refresh = () => {
    try { measure({ fetch: false }); } catch { /* der naechste Versuch misst erneut */ }
  };
  const delay = Math.max(60000, config.refreshMs);
  const hasTimer = typeof ctx?.get === 'function' && Boolean(ctx.get('timer'));
  if (hasTimer && typeof ctx.inject === 'function') {
    bus.demand(['timer'], (child) => { child.interval(refresh, delay); });
  } else {
    const timer = setInterval(refresh, delay);
    timer.unref?.();
    ctx.effect?.(() => () => clearInterval(timer));
  }

  console.log(
    `[shinon-version] Aktiviert — Wurzel ${root}, installiert ${state?.installed?.slice(0, 12) ?? 'unbekannt'} ` +
    `(${state?.installedSource ?? 'unbekannt'}), neuester ${state?.latest?.slice(0, 12) ?? 'unbekannt'} ` +
    `(${state?.latestSource ?? 'unbekannt'}), Badge "${badgeLine(state ?? {})}"`,
  );

  return () => {
    console.log('[shinon-version] Deaktiviert');
  };
}
