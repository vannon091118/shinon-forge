/**
 * install-lifecycle.mjs — Eigentümer: abnehmen, umschalten, ablesen.
 *
 * Die Befehle um den Stand herum: `selftest` (read-only Urteil), `auto` (Kandidat
 * bauen, DORT abnehmen, erst bei Grün umschalten), `uninstall`, `status` und
 * `history`. Der Unterschied zwischen `update` und `auto` ist keine Kosmetik:
 * hier sieht das Live-Verzeichnis den Kandidaten erst nach einem grünen Urteil.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, renameSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import * as paths from './paths.mjs';
import { collectSecrets, describeSecrets, readVault, writeVault } from './secrets.mjs';
import { removeUnits } from './systemd-units.mjs';
import { instancesUsing, restartInstances, stopInstances } from './instances.mjs';
import { printHistory, readRunLog as readLog } from './verify-log.mjs';

/** Die Lebenszyklus-Befehle an EINE Config binden. */
export function createLifecycle(env, deps) {
  const {
    git,
    readState,
    writeState,
    emptyState,
    sourceUrl,
    guardInstances,
    headSha,
    ensureCheckout,
    fetchAndResolve,
    checkout,
    installDependencies,
    verify,
    appendRunLog,
    printReport,
    STAGES,
    recordStand,
    verifyStand,
    vaultTarget,
    nodeBinary,
  } = deps;

  /**
   * `uninstall` — der Rückweg. Ohne `--purge` wandern die Zugangsdateien in einen
   * Tresor (Modus 0600); die nächste Installation setzt sie zurück. `--purge`
   * löscht sie mit dem Verzeichnis, `--keep-checkout` lässt den Baum stehen.
   */
  async function cmdUninstall() {
    if (!existsSync(env.prefix)) {
      env.say(`\nℹ️  Nichts zu entfernen: ${env.prefix} existiert nicht`);
      return 0;
    }
    guardInstances();
    const files = collectSecrets(env.prefix);
    const extra = env.flag('secrets-from', null);
    if (extra !== null) {
      for (const [name, text] of Object.entries(collectSecrets(resolve(extra)))) {
        if (!(name in files)) files[name] = text;
      }
    }
    env.say(`\n🧹 Deinstallation: ${env.prefix}`);
    removeUnits(env.units);
    // Die Desktop-Verknüpfung kennt nur das Werkzeug, das sie schreibt.
    const launcher = join(env.prefix, 'scripts', 'desktop-launcher.mjs');
    if (existsSync(launcher)) {
      const undone = spawnSync(nodeBinary(), [launcher, '--uninstall'], { encoding: 'utf8' });
      if (undone.status === 0) env.say('   Desktop-Verknüpfung entfernt');
      else env.warn(`Desktop-Verknüpfung: Exit ${undone.status}`);
    }
    const names = describeSecrets(files);
    let vault = null;
    if (env.has('purge')) {
      env.say(`   🔐 --purge: ${names.length === 0 ? 'keine Zugangsdateien im Installat' : `${names.join(', ')} werden mit dem Verzeichnis gelöscht`}`);
    } else if (names.length === 0) {
      env.say('   🔐 keine Zugangsdateien im Installat — nichts zu sichern');
    } else {
      vault = writeVault(vaultTarget(), { source: env.prefix, files });
      env.say(`   🔐 Tresor: ${vault}`);
      env.say(`      gesichert: ${names.join(', ')} — Werte stehen nie im Protokoll`);
      env.say('      die nächste Installation setzt sie zurück, ohne Vorhandenes zu überschreiben');
    }
    if (env.has('keep-checkout')) {
      env.say(`   Verzeichnis bleibt (--keep-checkout): ${env.prefix}`);
    } else {
      rmSync(env.prefix, { recursive: true, force: true });
      env.say(`   entfernt: ${env.prefix}`);
    }
    const state = readState() ?? emptyState();
    state.uninstalledAt = new Date().toISOString();
    if (vault !== null) state.secretsVault = vault;
    writeState(state);
    env.say(`\n✅ Deinstalliert. Zustand: ${env.stateFile}`);
    return 0;
  }
  
  function cmdStatus() {
    const state = readState();
    const installed = existsSync(join(env.prefix, 'bin', 'shinon.mjs'));
    env.say(`\n📍 Installat: ${env.prefix}`);
    env.say(`   Zustand:   ${env.stateFile}`);
    if (!installed) {
      env.say('   Stand:     nicht installiert');
      if (state !== null) env.say(`   letzter:   ${state.current?.sha?.slice(0, 12) ?? '—'} (Verzeichnis fehlt)`);
      return 0;
    }
    const head = git(['rev-parse', '--short=12', 'HEAD'], env.prefix, { allowFail: true });
    const branch = git(['rev-parse', '--abbrev-ref', 'HEAD'], env.prefix, { allowFail: true });
    const dirty = git(['status', '--porcelain', '--untracked-files=no'], env.prefix, { allowFail: true });
    const origin = git(['remote', 'get-url', 'origin'], env.prefix, { allowFail: true });
    env.say(`   HEAD:      ${head.status === 0 ? head.stdout.trim() : '—'} (${branch.status === 0 ? branch.stdout.trim() : '—'})`);
    env.say(`   Quelle:    ${origin.status === 0 ? origin.stdout.trim() : '—'}`);
    env.say(`   Änderungen:${dirty.status === 0 && dirty.stdout.trim() !== '' ? ` ${dirty.stdout.trim().split('\n').length} Datei(en) — nicht reproduzierbar` : ' keine'}`);
    if (state === null) {
      env.say('   Zustand:   keine Aufzeichnung (Installation von Hand?)');
    } else {
      env.say(`   Stand:     ${state.current?.sha?.slice(0, 12) ?? '—'}${state.current?.verified === true ? ' (abgenommen)' : state.current?.verified === false ? ' (Abnahme rot)' : ' (nicht abgenommen)'}`);
      env.say(`   Vorher:    ${state.previous?.sha?.slice(0, 12) ?? '—'}`);
      const last = state.lastVerify;
      if (last != null) {
        env.say(`   Abnahme:   ${last.ok ? 'grün' : 'rot'} · ${last.at} · ${last.http?.bytes ?? 0} Bytes · ${last.aktiviert} aktiv · ${last.errors?.length ?? 0} Befund(e)`);
      }
      // Der laufende Stand zählt mit, wenn er abgenommen ist — auch bei einem
      // Zustand aus einer älteren Fassung, die noch keine `greens`-Liste kannte.
      const greens = [...(state.greens ?? [])];
      if (state.current?.verified === true && !greens.includes(state.current.sha)) greens.push(state.current.sha);
      env.say(`   Rückweg:   ${greens.length === 0 ? 'kein grüner Stand aufgezeichnet' : `${greens.length} grün (${greens.slice(-3).map((sha) => sha.slice(0, 12)).join(', ')})`}`);
    }
    const running = instancesUsing(env.prefix);
    env.say(`   Läuft:     ${running.length === 0 ? 'nichts' : running.map((hit) => `PID ${hit.pid}`).join(', ')}`);
    const runs = readRunLog();
    env.say(`   Protokoll: ${env.runLog} (${runs.length} Lauf/Läufe${runs.length > 0 ? `, zuletzt ${runs.at(-1).at}` : ''})`);
    return 0;
  }
  
  /** Das dauerhafte Abnahmeprotokoll als Daten — Besitzer ist `scripts/lib/verify-log.mjs`. */
  function readRunLog() {
    return readLog(env.runLog, { warn: env.warn });
  }
  
  /**
   * `selftest` — der Ein-Befehl-Selbsttest: check, doctor, Boot und HTTP-Nachweis
   * in einem Lauf, Exit 0 nur bei vollständiger Kette. Bewusst READ-ONLY: kein
   * Checkout, kein `npm ci`, kein Zustandsschreiben, kein Rückweg. Wer einen
   * laufenden Stand befragt, will ein Urteil — keine Reparatur.
   */
  async function cmdSelftest() {
    if (!existsSync(join(env.prefix, 'bin', 'shinon.mjs'))) {
      env.die(`kein Installat unter ${env.prefix} — nichts zu prüfen (Erstinstallation: node scripts/install-user.mjs install)`);
    }
    const report = await verify(env.prefix);
    const log = appendRunLog(report, 'selftest', { sha: headSha(), ref: 'HEAD' });
    const passed = STAGES.filter((stage) => report.stages[stage]).length;
    if (env.has('json')) {
      console.log(JSON.stringify({
        installDir: report.installDir,
        at: report.at,
        ok: report.ok,
        stages: report.stages,
        passed,
        of: STAGES.length,
        dsh: report.dsh,
        bootMs: report.bootMs,
        plugins: report.aktiviert,
        http: report.http,
        errors: report.errors,
        log,
      }));
      return report.ok ? 0 : 1;
    }
    printSelftest(report);
    env.say(`   Protokoll: ${log}`);
    return report.ok ? 0 : 1;
  }
  
  /** Die vier Stufen untereinander — ein Blick, nicht vier Suchen im Log. */
  function printSelftest(report) {
    const stages = report.stages;
    const mark = (ok) => (ok ? '✓' : '✗');
    const http = report.http;
    env.say(`\n🩺 Selbsttest — ${report.installDir}`);
    env.say(`   ${mark(stages.check)} check   ${stages.check ? `shinon --check Exit 0 · dsh ${report.dsh}` : 'shinon --check gescheitert'}`);
    env.say(`   ${mark(stages.doctor)} doctor  ${stages.doctor ? 'Exit 0, keine Befunde' : 'Befunde oder gescheitert'}`);
    env.say(`   ${mark(stages.boot)} boot    ${stages.boot ? `dsh web: in ${(report.bootMs / 1000).toFixed(1)}s · ${report.aktiviert} Plugins aktiv` : 'kein "dsh web:" erreicht'}`);
    env.say(`   ${mark(stages.http)} http    ${stages.http ? `${http.token} → ${http.cookie} · ${http.bytes} Bytes · ${http.type}` : 'Nachweis fehlt'}`);
    const passed = STAGES.filter((stage) => stages[stage]).length;
    if (report.ok) {
      env.say(`\n✅ Selbsttest grün — ${passed}/${STAGES.length} Stufen, Kette vollständig`);
      return;
    }
    console.error(`\n❌ Selbsttest rot — ${passed}/${STAGES.length} Stufen`);
    for (const error of report.errors) console.error(`   - ${error}`);
  }
  
  /** Das Staging-Verzeichnis: neben dem Installat, damit ein Umzug ein Umbenennen bleibt. */
  function stagingDir() {
    return resolve(env.flag('staging', `${env.prefix}-staging`));
  }
  
  /**
   * `auto` — der Lauf für den Timer: neuen Stand bauen, DORT abnehmen, und erst
   * bei grünem Urteil umschalten. Der Unterschied zu `update` ist nicht Kosmetik:
   * `update` installiert in das laufende Verzeichnis und prüft danach — für die
   * Dauer des `npm ci` steht dort ein ungeprüfter Stand. Hier wird der Kandidat
   * in einem eigenen Verzeichnis geprüft, und das Live-Verzeichnis wird erst
   * angefasst, wenn das Urteil grün ist. Ein rotes Urteil kostet nichts: das
   * Live-Installat hat den Kandidaten nie gesehen.
   */
  async function cmdAuto() {
    const staging = stagingDir();
    if (staging === env.prefix) env.die('--staging darf nicht das Installat selbst sein');
    // Erst prüfen, dann klonen: ein Tippfehler im Pfad soll nicht 600 MB anlegen.
    const state = readState();
    if (state === null || !existsSync(join(env.prefix, 'bin', 'shinon.mjs'))) {
      env.die(`kein Installat unter ${env.prefix} — zuerst: node scripts/install-user.mjs install`);
    }
    ensureCheckout();
    git(['remote', 'set-url', 'origin', sourceUrl()], env.prefix, { allowFail: true });
    const target = fetchAndResolve(env.flag('ref', null), env.prefix);
    if (target.sha === state.current?.sha) {
      console.log(`auto: nichts zu tun — ${target.ref} @ ${target.sha.slice(0, 12)} ist schon der laufende Stand`);
      return 0;
    }
  
    // Der Kandidat entsteht IMMER — auch wenn Instanzen laufen. Das ist der
    // Unterschied zwischen „kein Download" und „Download fertig, Umschaltung
    // spaeter": der Bau und die Abnahme brauchen das Installat nicht, nur die
    // beiden Umbenennungen tun es.
    env.say(`\n🧪 Kandidat bauen: ${target.ref} @ ${target.sha.slice(0, 12)} → ${staging}`);
    ensureCheckout(staging, 'Staging');
    git(['remote', 'set-url', 'origin', sourceUrl()], staging, { allowFail: true });
    fetchAndResolve(env.flag('ref', null), staging);
    checkout(target.sha, staging);
    installDependencies(staging);
  
    const staged = await verify(staging);
    appendRunLog(staged, 'stage', { sha: target.sha, ref: target.ref });
    printReport(staged);
    if (!staged.ok) {
      console.error(`auto: Umschaltung unterlassen — ${env.prefix} hat den Kandidaten nicht gesehen; er liegt zur Untersuchung unter ${staging}`);
      return 1;
    }
  
    const running = instancesUsing(env.prefix);
    if (running.length > 0 && !env.now) {
      console.log(`auto: Kandidat ${target.sha.slice(0, 12)} liegt gebaut und abgenommen unter ${staging} — ${running.length} Instanz(en) laufen aus ${env.prefix} (${running.map((hit) => `PID ${hit.pid}`).join(', ')}); die Umschaltung passiert beim nächsten Lauf oder sofort mit --now`);
      return 0;
    }
  
    // `--now`: den ruhigen Moment herstellen, statt auf ihn zu warten. Beendet
    // werden nur erkannte Instanzen; sie werden nach der Umschaltung mit IHREM
    // Aufruf neu gestartet — auch wenn das Urteil rot war, damit niemand ohne
    // Host dasitzt.
    let stopped = [];
    if (running.length > 0) {
      env.say(`\n⏹  --now: ${running.length} Instanz(en) beenden (` + running.map((hit) => `PID ${hit.pid}`).join(', ') + ')');
      stopped = await stopInstances(running);
      env.say(`   beendet: ${stopped.length} von ${running.length}`);
    }
  
    const code = await promote(staging, target);
    if (stopped.length > 0) {
      const restarted = restartInstances(stopped, { cwd: env.prefix });
      for (const entry of restarted) {
        if (entry.error !== null) console.error(`   Neustart gescheitert (${entry.cmdline.slice(0, 80)}): ${entry.error}`);
        else console.log(`   neu gestartet: PID ${entry.pid} — ${entry.cmdline.slice(0, 80)}`);
      }
    }
    return code;
  }
  
  /**
   * Der Umschaltvorgang: Live wird zum Rückweg-Verzeichnis, der geprüfte Kandidat
   * zieht an seinen Platz — zwei Umbenennungen, kein Kopieren. Danach wird der
   * neue Ort erneut abgenommen; erst dieses Urteil gilt für den laufenden Baum.
   * Geht sie schief, tauschen dieselben zwei Umbenennungen zurück.
   */
  async function promote(staging, target) {
    if (instancesUsing(env.prefix).length > 0) {
      env.say('   übersprungen: zwischen Abnahme und Umschaltung ist eine Instanz gestartet');
      return 0;
    }
    const previous = `${env.prefix}-previous`;
    env.say(`\n🔀 Umschaltung: ${env.prefix} → ${previous}, ${staging} → ${env.prefix}`);
    rmSync(previous, { recursive: true, force: true });
    renameSync(env.prefix, previous);
    renameSync(staging, env.prefix);
    recordStand(target.sha, target.ref, 'auto (Umschaltung)');
  
    const code = await verifyStand({ trigger: 'auto (nach Umschaltung)' });
    if (code === 0) {
      console.log(`auto: umgeschaltet und abgenommen — ${target.sha.slice(0, 12)} läuft, Rückweg liegt unter ${previous}`);
      return 0;
    }
    console.error('   ↩︎ Der umgeschaltete Stand ist rot — Umschaltung wird zurückgenommen');
    renameSync(env.prefix, staging);
    renameSync(previous, env.prefix);
    const back = await verifyStand({ trigger: 'auto (Umschaltung zurückgenommen)', allowAuto: false });
    console.error(back === 0
      ? `auto: Umschaltung zurückgenommen — ${liveHeadShort()} läuft wieder, der Kandidat liegt unter ${staging}`
      : 'auto: ⚠️  auch der Rückweg ist rot — das Installat braucht Handarbeit');
    return 1;
  }
  
  /** Der SHA, der gerade unter dem Live-Pfad liegt (für Meldungen). */
  function liveHeadShort() {
    return headSha()?.slice(0, 12) ?? '—';
  }
  
  /**
   * `history` — der Vergleich über Versionen: Boot-Dauer, Fehlerzeilen und
   * Ergebnis je Lauf, plus Kennzahlen, die man in Zahlen sehen will (Minimum,
   * Median, Maximum, Erfolgsquote). Ohne `--json` als Tabelle.
   */
  function cmdHistory() {
    const limit = Number(env.flag('limit', '20'));
    if (!Number.isInteger(limit) || limit < 1) env.die('--limit muss eine positive Zahl sein');
    const rows = readRunLog();
    env.say(`\n📊 Abnahmeprotokoll: ${env.runLog}`);
    if (rows.length === 0) {
      env.say('   noch keine Läufe aufgezeichnet');
      return 0;
    }
    if (env.has('json')) {
      for (const row of rows.slice(-limit)) env.say(JSON.stringify(row));
      return 0;
    }
    return printHistory({ rows, limit, say: env.say });
  }

  return { cmdUninstall, cmdStatus, cmdSelftest, cmdAuto, cmdHistory };
}
