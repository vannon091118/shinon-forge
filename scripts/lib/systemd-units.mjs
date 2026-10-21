/**
 * `units` — der systemd-User-Timer. Er ruft genau `auto` auf, damit der Timer
 * nicht klüger ist als der Befehl, den ein Mensch von Hand startet. Der Abbau
 * (`removeUnits`) wird von `units --remove` und von `uninstall` geteilt: eine Quelle.
 *
 * Abhängigkeiten kommen als `env` aus dem Aufrufer (Präfix, `--no-systemd`,
 * Argumente, Ausgabe, Node-Laufzeit), damit das Modul ohne Zustand von
 * `install-user.mjs` auskommt.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import * as paths from './paths.mjs';

export function removeUnits(env) {
  const configHome = process.env.XDG_CONFIG_HOME ?? join(homedir(), '.config');
  const dir = join(configHome, 'systemd', 'user');
  if (!env.noSystemd) {
    const stopped = systemctl(['disable', '--now', 'shinon-forge-update.timer']);
    if (stopped.status !== 0) env.warn(`systemctl disable: ${(stopped.stderr ?? '').trim() || `Exit ${stopped.status}`}`);
  } else {
    env.say('   systemd unangetastet (--no-systemd)');
  }
  for (const name of ['shinon-forge-update.service', 'shinon-forge-update.timer']) {
    const file = join(dir, name);
    if (!existsSync(file)) continue;
    rmSync(file, { force: true });
    env.say(`   entfernt: ${file}`);
  }
  if (!env.noSystemd) systemctl(['daemon-reload']);
}

export async function cmdUnits(env) {
  const configHome = process.env.XDG_CONFIG_HOME ?? join(homedir(), '.config');
  const dir = join(configHome, 'systemd', 'user');
  const serviceFile = join(dir, 'shinon-forge-update.service');
  const timerFile = join(dir, 'shinon-forge-update.timer');
  const node = env.node();
  const script = join(paths.workspaceRoot(), 'scripts', 'install-user.mjs');

  if (env.has('remove')) {
    removeUnits(env);
    env.say('✅ Timer entfernt (der Aufräumlauf bleibt: node scripts/install-user.mjs units --remove)');
    return 0;
  }

  const interval = env.flag('interval', '1d');
  const firstDelay = env.flag('first-delay', '10min');
  const spread = env.flag('spread', '1h');
  mkdirSync(dir, { recursive: true });
  writeFileSync(serviceFile, `[Unit]
Description=Shinon Forge: neuen Stand bauen, abnehmen, nur bei grünem Urteil umschalten
Documentation=file:${join(paths.workspaceRoot(), 'scripts', 'install-user.mjs')}
After=network-online.target
Wants=network-online.target

[Service]
Type=oneshot
WorkingDirectory=${paths.workspaceRoot()}
ExecStart=${node} ${script} auto --prefix ${env.prefix} --quiet
Nice=10

# Kein Neustart bei rotem Urteil: der nächste Timer-Lauf ist der Wiederholungsversuch.
TimeoutStartSec=900
`);
  // ZWEI Zeitgeber, und zwar aus einem gemessenen Grund: `OnUnitActiveSec`
  // allein plant nichts ein, wenn der Dienst seit dem Aktivieren des Timers
  // noch nicht gelaufen ist — `NextElapseUSecMonotonic` stand nach dem
  // Neuladen auf `infinity`, der Timer wäre nie wieder gefeuert. `OnActiveSec`
  // gibt jedem Aktivieren (und damit jedem Systemstart) einen ersten Termin,
  // `OnUnitActiveSec` hält danach den Rhythmus.
  writeFileSync(timerFile, `[Unit]
Description=Shinon Forge: regelmäßig auf neue Stände prüfen (Umschaltung nur bei grüner Abnahme)

[Timer]
OnActiveSec=${firstDelay}
OnUnitActiveSec=${interval}
RandomizedDelaySec=${spread}
Persistent=true
Unit=shinon-forge-update.service

[Install]
WantedBy=timers.target
`);
  env.say(`\n✅ Units geschrieben:`);
  env.say(`   ${serviceFile}`);
  env.say(`   ${timerFile}`);
  env.say(`   Rhythmus: erster Lauf ${firstDelay} nach Aktivierung bzw. Systemstart, danach alle ${interval}, Streuung bis ${spread} (Persistent=true holt Verpasstes nach)`);

  if (env.has('no-enable') || env.noSystemd) {
    env.say(env.noSystemd ? '   systemd unangetastet (--no-systemd)' : '   Aktivieren von Hand:');
    env.say(`   systemctl --user daemon-reload && systemctl --user enable --now shinon-forge-update.timer`);
    return 0;
  }
  const reload = systemctl(['daemon-reload']);
  const enabled = systemctl(['enable', 'shinon-forge-update.timer']);
  // `enable --now` lässt einen LAUFENDEN Timer mit alten Werten weiterlaufen —
  // gemessen: nach dem Ändern der Unit stand `NextElapseUSecMonotonic` auf
  // `infinity`, erst `restart` bewaffnet ihn mit den neuen Zeitgebern neu.
  const restarted = systemctl(['restart', 'shinon-forge-update.timer']);
  if (reload.status !== 0 || enabled.status !== 0) {
    env.warn(`systemctl nicht verfügbar oder verweigert (reload ${reload.status}, enable ${enabled.status}) — Units liegen, Aktivierung von Hand:`);
    if (restarted.status !== 0) env.warn(`systemctl restart: ${(restarted.stderr ?? '').trim() || `Exit ${restarted.status}`}`);
    env.say('   systemctl --user daemon-reload && systemctl --user enable --now shinon-forge-update.timer');
    return 0;
  }
  // Der Termin wird von systemd nicht im selben Augenblick gerechnet: nach dem
  // `restart` stand er kurz leer, eine Sekunde später stand er. Deshalb fragen, nicht raten — begrenzt nachfassen statt einmal und dann behaupten. Und Achtung:
  // `OnActiveSec`/`OnUnitActiveSec` sind MONOTONE Zeitgeber — `Next…Realtime`
  // bleibt deshalb leer, der Termin steht in `Next…Monotonic`. Beide fragen,
  // sonst meldet das Werkzeug „kein Termin", obwohl einer läuft.
  let realtime = '';
  let monotonic = '';
  for (let attempt = 0; attempt < 10; attempt += 1) {
    if (attempt > 0) await new Promise((done) => setTimeout(done, 250));
    const show = systemctl(['show', 'shinon-forge-update.timer', '-p', 'NextElapseUSecRealtime', '-p', 'NextElapseUSecMonotonic', '--value']);
    const [first = '', second = ''] = (show.stdout ?? '').split('\n');
    realtime = first.trim();
    monotonic = second.trim();
    const hasNext = (realtime !== '' && realtime !== 'n/a') || (monotonic !== '' && monotonic !== 'infinity' && monotonic !== 'n/a');
    if (hasNext) break;
  }
  const hasNext = (realtime !== '' && realtime !== 'n/a') || (monotonic !== '' && monotonic !== 'infinity' && monotonic !== 'n/a');
  env.say(hasNext
    ? `✅ Timer aktiv. Nächster Lauf: ${realtime !== '' && realtime !== 'n/a' ? realtime : `in ${monotonic}`}`
    : '⚠️  Timer aktiv, aber ohne nächsten Termin — systemctl --user list-timers prüfen');
  return 0;
}

function systemctl(args) {
  return spawnSync('systemctl', ['--user', ...args], { encoding: 'utf8' });
}
