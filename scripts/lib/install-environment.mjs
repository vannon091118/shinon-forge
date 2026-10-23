/**
 * install-environment.mjs — Eigentümer: Klon, Checkout, Abhängigkeiten.
 *
 * Alles, was das Installationsverzeichnis selbst betrifft: Quelle, Klon,
 * Checkout, `npm ci`, Profil-Links — und die eine Frage davor, ob dort noch
 * eine Instanz läuft. Diese Schritte ersetzen Dateien; darum prüfen sie die
 * Ruhe, die reine Abnahme (install-verify) braucht sie nicht.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import * as paths from './paths.mjs';
import { instancesUsing } from './instances.mjs';

/** Die Umgebung an EINE Config binden; Werkzeuge kommen von außen. */
export function createEnvironment(env, { tool, git, npmCommand, nodeBinary }) {
  function sourceUrl() {
    const explicit = env.flag('source', null);
    if (explicit !== null) return explicit;
    const own = spawnSync('git', ['-C', paths.workspaceRoot(), 'remote', 'get-url', 'origin'], { encoding: 'utf8' });
    if (own.status === 0 && own.stdout.trim() !== '') return own.stdout.trim();
    return paths.workspaceRoot();
  }
  
  /**
   * Nur nötig, wenn Dateien im Installat ersetzt werden (checkout, npm ci): eine
   * laufende Instanz verliert dabei ihr node_modules unter den Füßen. Die reine
   * Abnahme startet ihren eigenen Prozess auf freiem Port und braucht keine Ruhe.
   */
  function guardInstances(target = env.prefix) {
    const running = instancesUsing(target);
    if (running.length === 0) return;
    if (env.force) {
      env.warn(`${running.length} Instanz(en) laufen aus ${target} — --force gesetzt, sie können brechen`);
      return;
    }
    const list = running.map((hit) => `PID ${hit.pid}: ${hit.cmdline.slice(0, 120)}`).join('\n   ');
    env.die(`aus ${target} laufen noch Instanzen — bitte beenden oder --force:\n   ${list}`);
  }
  
  /** Steht der gepinnte dsh schon im Ziel? (Spart ein sinnloses npm ci.) */
  function dshInstalled(dir = env.prefix) {
    return existsSync(join(dir, 'node_modules', '@deepseek-ai', 'dsh', 'lib', 'bin.js'));
  }
  
  function headSha(dir = env.prefix) {
    const head = git(['rev-parse', 'HEAD'], dir, { allowFail: true });
    return head.status === 0 ? head.stdout.trim() : null;
  }
  
  /** Ein Git-Klon im Ziel, oder ein klarer Fehler. */
  function ensureCheckout(dir = env.prefix, label = 'Installat') {
    if (!existsSync(join(dir, 'package.json'))) {
      env.say(`\n📦 ${label}: Klon nach ${dir}`);
      mkdirSync(dirname(dir), { recursive: true });
      tool('git', ['clone', '--quiet', sourceUrl(), dir], dirname(dir), `git clone ${sourceUrl()}`);
      return;
    }
    const probe = git(['rev-parse', '--git-dir'], dir, { allowFail: true });
    if (probe.status !== 0) {
      env.die(`${dir} existiert, ist aber kein Git-Klon — bitte von Hand prüfen, dieses Werkzeug löscht nichts`);
    }
  }
  
  function fetchAndResolve(ref, dir = env.prefix) {
    env.say(`   → git fetch origin (${dir})`);
    const fetched = spawnSync('git', ['-C', dir, 'fetch', '--prune', '--quiet', 'origin'], { encoding: 'utf8' });
    if (fetched.status !== 0) {
      env.die(`git fetch scheiterte (Exit ${fetched.status}): ${(fetched.stderr ?? '').trim()} — offline?`);
    }
    const candidates = ref === null ? ['origin/main'] : [ref, `origin/${ref}`];
    for (const candidate of candidates) {
      const resolved = git(['rev-parse', '--verify', '--quiet', `${candidate}^{commit}`], dir, { allowFail: true });
      if (resolved.status === 0) return { sha: resolved.stdout.trim(), ref: candidate };
    }
    env.die(`Ref "${ref ?? 'origin/main'}" ist im Klon nicht auflösbar`);
  }
  
  function checkout(sha, dir = env.prefix) {
    env.say(`   → git checkout ${sha.slice(0, 12)} (${dir})`);
    git(['checkout', '--force', '--quiet', sha], dir);
    const head = git(['rev-parse', 'HEAD'], dir).stdout.trim();
    if (head !== sha) env.die(`Checkout landete auf ${head}, erwartet war ${sha}`);
    const dirty = git(['status', '--porcelain', '--untracked-files=no'], dir).stdout.trim();
    if (dirty !== '') env.die(`Arbeitsbaum nach dem Checkout nicht sauber:\n${dirty}`);
  }
  
  function installDependencies(dir = env.prefix) {
    const [cmd, prefixArgs] = npmCommand();
    tool(cmd, [...prefixArgs, 'ci', '--no-audit', '--no-fund'], dir, 'npm ci (Lockfile)');
    linkProfiles(dir);
  }
  
  function linkProfiles(dir = env.prefix, { write = true } = {}) {
    const node = nodeBinary();
    if (write) tool(node, [join(dir, 'scripts', 'profile-links.mjs')], dir, 'Profil-Links setzen');
    tool(node, [join(dir, 'scripts', 'profile-links.mjs'), '--check'], dir, 'Profil-Links prüfen');
  }
  
  /* ------------------------------------------------------------------- Abnahme */
  

  return {
    sourceUrl,
    guardInstances,
    dshInstalled,
    headSha,
    ensureCheckout,
    fetchAndResolve,
    checkout,
    installDependencies,
    linkProfiles,
  };
}
