/**
 * install-verify.mjs — Eigentümer: die Abnahme und ihr Protokoll.
 *
 * Vier Stufen (check, doctor, boot, http) gegen ein BELIEBIGES Verzeichnis —
 * live oder Staging. Genau diese Verallgemeinerung macht „nur bei grünem
 * Urteil umschalten" möglich; geprüft wird der Kandidat, nicht das, was schon
 * läuft. Hier steht auch die eine Zeile je Lauf im dauerhaften Protokoll.
 */
import { spawn, spawnSync } from 'node:child_process';
import { join, sep } from 'node:path';
import * as paths from './paths.mjs';
import { appendRunLog as appendLogLine } from './verify-log.mjs';

/**
 * Die Abnahme an EINE Config binden. Die Netz- und Fehlerzeilen-Werkzeuge
 * kommen von `install-tools`, der Zustand von `install-state` — dieser Kern
 * startet Prozesse, er besitzt keine Pfade.
 */
export function createVerifier(env, { nodeBinary, freePort, portClosed, errorLines }, { readState }) {
  /** Die vier Stufen der Kette — einzeln als bestanden/gescheitert, nicht nur als Summe. */
  const STAGES = ['check', 'doctor', 'boot', 'http'];

  
  async function verify(prefix = env.prefix) {
    const report = {
      at: new Date().toISOString(),
      installDir: prefix,
      ok: false,
      stages: { check: false, doctor: false, boot: false, http: false },
      dsh: null,
      herkunft: null,
      aktiviert: 0,
      errors: [],
      http: null,
      port: null,
      bootMs: 0,
      ms: 0,
    };
    const started = Date.now();
    const node = nodeBinary();
    const entry = join(prefix, 'bin', 'shinon.mjs');
    // Ein Kandidat ist noch nicht registriert: ohne eigenes Home fiele er in das
    // `dev-dsh-home` des Arbeitsbaums (er hat `.git`) und stritte sich mit dessen
    // Verknüpfungen. Darum bekommt jeder NICHT-live Kandidat ein eigenes Home.
    const runEnv = prefix === env.prefix
      ? process.env
      : { ...process.env, DSH_HOME: join(paths.stateDir(), 'dsh-home-candidate') };
  
    env.say(`\n🔎 Abnahme — ${prefix}`);
    // cwd MUSS das geprüfte Verzeichnis sein: der Selbsttest gegen ein Staging
    // darf nicht im Live-Installat stehen, während er den Kandidaten befragt.
    const check = spawnSync(node, [entry, '--check'], { cwd: prefix, encoding: 'utf8', env: runEnv });
    const checkText = `${check.stdout ?? ''}${check.stderr ?? ''}`;
    if (check.status !== 0) {
      report.errors.push(`shinon --check Exit ${check.status}`);
      return report;
    }
    report.dsh = /dsh:\s+(\S+)/.exec(checkText)?.[1] ?? null;
    report.herkunft = /Herkunft:\s+(.+)/.exec(checkText)?.[1]?.trim() ?? null;
    if (report.herkunft === null || !paths.realPath((report.herkunft.split('—').pop() ?? '').trim()).startsWith(`${paths.realPath(prefix)}${sep}`)) {
      report.errors.push(`Herkunft zeigt nicht auf das Installat (${report.herkunft ?? 'fehlt'})`);
      return report;
    }
    report.stages.check = true;
    env.say(`   ✓ --check: dsh ${report.dsh}, Herkunft ${report.herkunft}`);
  
    const doctor = spawnSync(node, [entry, 'doctor'], { cwd: prefix, encoding: 'utf8', env: runEnv });
    if (doctor.status !== 0) {
      report.errors.push(`shinon doctor Exit ${doctor.status}`);
      return report;
    }
    report.stages.doctor = true;
    env.say('   ✓ doctor: gesund, keine Befunde');
  
    const port = env.port ?? (await freePort());
    report.port = port;
    const url = `http://127.0.0.1:${port}/`;
    const lines = [];
    const bootStarted = Date.now();
    const child = spawn(node, [entry, '--no-open', '--trusted-host', '127.0.0.1', '--port', String(port)], {
      cwd: prefix,
      // NICHT DSH_HOME=prefix: dann wäre die AGENTS.md des Installats die globale
      // Anweisung jeder Sitzung. Der Einstieg leitet sein Home selbst ab und seedet
      // es aus dem Installat; hier wird nur gesagt, WELCHES Installat gemeint ist.
      env: { ...runEnv, SHINON_INSTALL_ROOT: prefix },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let webUrl = null;
    const consume = (chunk) => {
      for (const line of chunk.toString().split('\n')) {
        if (line.trim() === '') continue;
        lines.push(line);
        const match = /dsh web:\s+(http:\/\/127\.0\.0\.1:\d+\/\?token=\S+)/.exec(line);
        if (match !== null && webUrl === null) webUrl = match[1];
      }
    };
    child.stdout.on('data', consume);
    child.stderr.on('data', consume);
  
    const exited = new Promise((done) => child.once('exit', (code, signal) => done({ code, signal })));
    const booted = await new Promise((done) => {
      const deadline = Date.now() + env.timeoutS * 1000;
      const tick = () => {
        if (webUrl !== null) return done(true);
        if (child.exitCode !== null) return done(false);
        if (Date.now() > deadline) return done(false);
        setTimeout(tick, 100);
      };
      tick();
    });
  
    if (!booted) {
      if (child.exitCode === null) child.kill('SIGTERM');
      await exited;
      await portClosed(port, 3000);
      report.errors.push(webUrl === null ? `kein "dsh web:" innerhalb ${env.timeoutS}s` : 'Boot endete vorzeitig');
      report.errors.push(...errorLines(lines).slice(0, 5));
      return report;
    }
    report.stages.boot = true;
    report.bootMs = Date.now() - bootStarted;
    env.say(`   ✓ Boot: dsh web: ${url} (${(report.bootMs / 1000).toFixed(1)}s)`);
  
    report.aktiviert = lines.filter((line) => /Aktiviert/.test(line)).length;
  
    const errorCountBefore = report.errors.length;
    try {
      const tokenUrl = webUrl;
      const tokenResponse = await fetch(tokenUrl, { redirect: 'manual' });
      const cookies = typeof tokenResponse.headers.getSetCookie === 'function' ? tokenResponse.headers.getSetCookie() : [];
      const cookie = cookies.map((value) => value.split(';')[0]).join('; ');
      const pageResponse = await fetch(url, { headers: cookie === '' ? {} : { cookie }, redirect: 'manual' });
      const type = pageResponse.headers.get('content-type') ?? '';
      const body = await pageResponse.text();
      report.http = { token: tokenResponse.status, cookie: pageResponse.status, type, bytes: Buffer.byteLength(body), title: /<title>([^<]*)/.exec(body)?.[1] ?? null };
      if (![302, 303].includes(tokenResponse.status)) report.errors.push(`Token-Einstieg lieferte HTTP ${tokenResponse.status} statt 303`);
      if (pageResponse.status !== 200) report.errors.push(`Seite lieferte HTTP ${pageResponse.status} statt 200`);
      if (!type.includes('text/html')) report.errors.push(`Inhaltstyp ${type || 'leer'} statt text/html`);
      if (report.http.bytes < 1000) report.errors.push(`Seite nur ${report.http.bytes} Bytes`);
      report.stages.http = errorCountBefore === report.errors.length;
      env.say(`   ${report.stages.http ? '✓' : '✗'} HTTP: ${tokenResponse.status} → ${pageResponse.status} · ${report.http.bytes} Bytes · ${report.http.title ?? 'ohne Titel'}`);
    } catch (error) {
      report.errors.push(`HTTP-Prüfung scheiterte: ${error.message}`);
    }
  
    const errors = errorLines(lines);
    if (errors.length > 0) {
      report.errors.push(...errors.slice(0, 10));
    }
    env.say(`   ✓ Log: ${lines.length} Zeilen, ${report.aktiviert} "Aktiviert", ${errors.length} Fehlerzeile(n)`);
  
    if (child.exitCode === null) child.kill('SIGTERM');
    const finish = await Promise.race([exited, new Promise((done) => setTimeout(() => done(null), 10000))]);
    if (finish === null && child.exitCode === null) child.kill('SIGKILL');
    if (!(await portClosed(port, 5000))) report.errors.push(`Port ${port} nach dem Stop noch offen`);
  
    report.ms = Date.now() - started;
    report.ok = report.errors.length === 0;
    return report;
  }
  

  /**
   * Eine Zeile je Abnahme, dauerhaft — ohne Token, ohne Schlüssel, ohne Pfade,
   * die nicht schon im Zustand stehen. Anhängen statt überschreiben: nur so
   * lässt sich ein Stand über die Zeit mit seinen Vorgängern vergleichen.
   */
  function appendRunLog(report, trigger, meta = {}) {
    const state = readState();
    const record = {
      schemaVersion: 1,
      at: report.at,
      installDir: report.installDir ?? env.prefix,
      sha: meta.sha ?? state?.current?.sha ?? null,
      ref: meta.ref ?? state?.current?.ref ?? null,
      trigger,
      ok: report.ok,
      dsh: report.dsh,
      bootMs: report.bootMs,
      totalMs: report.ms,
      plugins: report.aktiviert,
      errors: report.errors,
      http: report.http === null
        ? null
        : { token: report.http.token, cookie: report.http.cookie, type: report.http.type, bytes: report.http.bytes, title: report.http.title },
    };
    return appendLogLine(env.runLog, record);
  }
  
  function printReport(report) {
    if (report.ok) {
      env.say(`\n✅ Abnahme grün in ${(report.ms / 1000).toFixed(1)}s — ${report.http?.bytes ?? 0} Bytes HTML, ${report.aktiviert} Plugins aktiv, 0 Fehlerzeilen`);
    } else {
      console.error(`\n❌ Abnahme rot — ${report.errors.length} Befund(e):`);
      for (const error of report.errors) console.error(`   - ${error}`);
    }
  }
  
  /* ----------------------------------------------------------------- Befehle */
  

  return { STAGES, verify, appendRunLog, printReport };
}
