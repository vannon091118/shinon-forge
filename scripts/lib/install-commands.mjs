/**
 * install-commands.mjs — Eigentümer: installieren, updaten, zurückrollen.
 *
 * Die drei Befehle, die einen Stand ins Installat bringen — und die eine
 * Entscheidung, die sie teilen: erst prüfen, bei Rot zurück auf den letzten
 * grünen Stand. `restoreGreen` ist derselbe Weg wie `rollback`, nur ohne
 * Rekursion: ein Rückweg, der bei Rot wieder einen Rückweg startet, dreht sich
 * im Kreis.
 */
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { writeInstallDesktopIcon } from './desktop-entry.mjs';

/**
 * Die Befehle an EINE Config binden. Zustand, Umgebung und Abnahme kommen als
 * fertige Funktionen von außen — dieser Kern entscheidet, WANN sie laufen.
 */
export function createCommands(env, deps) {
  const {
    git,
    readState,
    writeState,
    emptyState,
    noteGreen,
    lastGreen,
    sourceUrl,
    guardInstances,
    dshInstalled,
    headSha,
    ensureCheckout,
    fetchAndResolve,
    checkout,
    installDependencies,
    linkProfiles,
    verify,
    appendRunLog,
    printReport,
    restoreSecretsIfAvailable,
    nodeBinary,
  } = deps;

  /**
   * Den Stand SOFORT festhalten — vor npm ci. Bricht die Installation danach ab,
   * zeigt `status` wenigstens den HEAD, der wirklich im Verzeichnis liegt, statt
   * eine Aufzeichnung, die hinter dem Baum herläuft.
   */
  function recordStand(sha, ref, action) {
    const state = readState() ?? emptyState();
    state.installDir = env.prefix;
    state.source = sourceUrl();
    const before = state.current;
    // Derselbe Stand erneut: der Rückweg bleibt der, der er vorher war.
    if (before !== null && before.sha !== sha) state.previous = { ...before };
    if (before === null) state.previous = null;
    state.history = [...(state.history ?? []), { sha, ref, at: new Date().toISOString(), action }];
    state.current = { sha, ref, at: new Date().toISOString(), verified: null };
    writeState(state);
    return state;
  }
  
  async function verifyStand({ allowAuto = true, trigger = 'verify', prefix = env.prefix, record = true, sha = null, ref = null } = {}) {
    if (env.noVerify) {
      env.warn('Abnahme übersprungen (--no-verify) — dieser Stand ist NICHT als startfähig belegt');
      return 0;
    }
    let state = null;
    const report = await verify(prefix);
    if (record) {
      state = readState() ?? emptyState();
      state.lastVerify = report;
      if (state.current !== null) state.current.verified = report.ok;
      if (report.ok) noteGreen(state, state.current?.sha ?? null);
      writeState(state);
    }
    const log = appendRunLog(report, trigger, { sha, ref });
    printReport(report);
    env.say(`   Protokoll: ${log}`);
    // Staging: geprüft wird ein Kandidat, kein Zustand wird verändert — das
    // Urteil kehrt als Exit-Code zurück, mehr braucht der Aufrufer nicht.
    if (!record) return report.ok ? 0 : 1;
    if (report.ok) return 0;
  
    const failedSha = state.current?.sha ?? null;
    if (allowAuto && !env.noRollback) {
      const target = lastGreen(state, failedSha);
      if (target === null) {
        console.error(`   Kein grüner Stand aufgezeichnet — bitte von Hand entscheiden: node scripts/install-user.mjs rollback --prefix ${env.prefix}`);
        return 1;
      }
      const restored = await restoreGreen(target);
      if (restored === 0) {
        console.error(`   ↩︎ Automatisch zurück auf ${target.slice(0, 12)} — der rote Stand ${failedSha?.slice(0, 12) ?? '?'} ist verworfen.`);
      } else {
        console.error(`   ⚠️  Auch der Rückweg auf ${target.slice(0, 12)} ist rot — das Installat braucht Handarbeit.`);
      }
      return 1;
    }
    const hint = state.previous === null
      ? 'kein vorheriger Stand aufgezeichnet'
      : `node scripts/install-user.mjs rollback --prefix ${env.prefix}`;
    console.error(`   Rollback: ${hint}`);
    return 1;
  }
  
  /**
   * Der Rückweg: den grünen Stand neu installieren und erneut prüfen. Kein
   * zweiter Ablauf-Typ — dieselben Schritte wie ein Rollback, nur ohne Rekursion
   * (dieser Lauf darf bei Rot NICHT wieder einen Rückweg starten).
   */
  async function restoreGreen(sha) {
    env.say(`\n↩︎  Rückkehr auf den letzten grünen Stand ${sha.slice(0, 12)}`);
    guardInstances();
    checkout(sha);
    recordStand(sha, 'green', 'auto-rollback');
    installDependencies();
    const code = await verifyStand({ allowAuto: false, trigger: 'auto-rollback' });
    if (code === 0) env.say(`   ✓ Rückweg abgenommen: ${sha.slice(0, 12)} steht wieder`);
    return code;
  }
  
  async function cmdInstall() {
    ensureCheckout();
    restoreSecretsIfAvailable();
    git(['remote', 'set-url', 'origin', sourceUrl()], env.prefix, { allowFail: true });
    const target = fetchAndResolve(env.flag('ref', null));
    env.say(`\n🎯 Ziel: ${target.ref} @ ${target.sha.slice(0, 12)}`);
    // Wiederholbar heißt idempotent: derselbe Stand mit gepinntem dsh wird nicht
    // neu installiert, sondern nur geprüft. Das ist der billige Weg für Reruns.
    if (headSha() === target.sha && dshInstalled()) {
      env.say('   ↺ Stand und Abhängigkeiten liegen schon — nur Links prüfen und Abnahme');
      recordStand(target.sha, target.ref, 'install (bereits vorhanden)');
      linkProfiles(env.prefix, { write: false });
      return verifyStand({ trigger: 'install (bereits vorhanden)' });
    }
    guardInstances();
    checkout(target.sha);
    recordStand(target.sha, target.ref, 'install');
    installDependencies();
    const code = await verifyStand({ trigger: 'install' });
    if (code === 0) writeInstallDesktopIcon({ prefix: env.prefix, node: nodeBinary() });
    return code;
  }
  
  async function cmdUpdate() {
    const state = readState();
    if (state === null || !existsSync(join(env.prefix, 'bin', 'shinon.mjs'))) {
      env.die(`kein Installat unter ${env.prefix} — zuerst: node scripts/install-user.mjs install`);
    }
    git(['remote', 'set-url', 'origin', sourceUrl()], env.prefix, { allowFail: true });
    const target = fetchAndResolve(env.flag('ref', null));
    const currentSha = state.current?.sha ?? null;
    if (target.sha === currentSha) {
      env.say(`\n✅ Bereits aktuell: ${target.ref} @ ${target.sha.slice(0, 12)} — keine Neuinstallation`);
      return verifyStand({ trigger: 'update (bereits aktuell)' });
    }
    env.say(`\n⬆️  Update ${currentSha?.slice(0, 12) ?? '—'} → ${target.sha.slice(0, 12)}`);
    guardInstances();
    checkout(target.sha);
    recordStand(target.sha, target.ref, 'update');
    installDependencies();
    return verifyStand({ trigger: 'update' });
  }
  
  async function cmdRollback() {
    const state = readState();
    if (state === null) env.die(`kein Installationszustand (${env.stateFile}) — Rollback braucht einen vorherigen Stand`);
    const explicit = env.flag('to', null);
    const requested = explicit ?? state.previous?.sha ?? null;
    if (requested === null) env.die('kein vorheriger Stand bekannt — mit --to <sha> einen Stand benennen');
    // Kurz-SHA und Ref-Namen sind erlaubt; verglichen wird immer die volle Object-ID.
    const resolved = git(['rev-parse', '--verify', '--quiet', `${requested}^{commit}`], env.prefix, { allowFail: true });
    if (resolved.status !== 0) env.die(`Stand ${requested} liegt nicht im Klon — bitte erst fetch`);
    const targetSha = resolved.stdout.trim();
    const ref = explicit === null ? state.previous?.ref ?? 'previous' : requested;
    guardInstances();
    env.say(`\n⏪ Rollback ${state.current?.sha.slice(0, 12) ?? '—'} → ${targetSha.slice(0, 12)}`);
    checkout(targetSha);
    recordStand(targetSha, ref, explicit === null ? 'rollback' : `rollback --to ${targetSha.slice(0, 12)}`);
    installDependencies();
    return verifyStand({ trigger: explicit === null ? 'rollback' : `rollback --to ${targetSha.slice(0, 12)}` });
  }
  

  return { recordStand, verifyStand, restoreGreen, cmdInstall, cmdUpdate, cmdRollback };
}
