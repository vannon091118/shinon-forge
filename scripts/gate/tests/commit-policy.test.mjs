#!/usr/bin/env node
/**
 * Tests der Committext-Policy (Presets als Daten, ein Urteil in drei Pfaden).
 *
 * Ebenen:
 *   1. Vertrag: Validierung fail-closed — unbekannte Version, Schlüssel, Presets,
 *      abgeschwächter Fußboden.
 *   2. Preset-Matrix: je Preset positive und negative Nachrichten.
 *   3. Auswahl und Parität: Projektdatei/Env/Flag, und dass Hook (--file),
 *      CLI (--stdin) und CI (--ci) für dieselbe Nachricht dasselbe Urteil und
 *      denselben Exitcode liefern.
 *   4. Reparatur-Grenze: --fix entfernt nur Footer-Zeilen; ein Preset ohne
 *      Reparatur schreibt nichts.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { VANNON_TRAILER, WORD_MIN, checkMessage, swapTrailer } from '../../lib/commit-text.mjs';
import { PolicyError, policyIssues, resolvePreset } from '../../lib/commit-policy.mjs';
import { ENGINE_ROOT, PROJECT_PROFILE, selectPolicy } from '../../lib/commit-policy-file.mjs';
import { LONG_BODY, VALID_SAMPLE, policyRuleIssues } from '../plugins/commit-trailer.mjs';

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const GUARD = join(ROOT, 'scripts/commit-guard.mjs');
const CONTRACT_FILE = join(ENGINE_ROOT, 'docs/contracts/commit-policy.json');
const CONTRACT = JSON.parse(readFileSync(CONTRACT_FILE, 'utf8'));

/** Eine Kopie des Vertrags, die ein Test verändern darf. */
const contractCopy = () => JSON.parse(JSON.stringify(CONTRACT));
const withTrailer = (body) => `${body}\n\n${VANNON_TRAILER}\n`;

/** CLI ausführen und den Exit-Code zurückgeben (nie werfen). */
function run(args, cwd = ROOT, env = {}, input) {
  const merged = { ...process.env };
  for (const key of Object.keys(merged)) if (key.startsWith('GITHUB_') || key === 'SHINON_COMMIT_POLICY') delete merged[key];
  Object.assign(merged, env);
  try {
    const stdout = execFileSync(process.execPath, args, {
      cwd,
      env: merged,
      encoding: 'utf8',
      input: input ?? '',
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    return { status: 0, stdout, stderr: '' };
  } catch (error) {
    return { status: error.status ?? -1, stdout: String(error.stdout ?? ''), stderr: String(error.stderr ?? '') };
  }
}

/** Ein temporäres Projekt mit Auswahl und (optional) Commits. */
function tempProject(preset) {
  const dir = mkdtempSync(join(tmpdir(), 'shinon-policy-'));
  const git = (args) => execFileSync('git', args, { cwd: dir, encoding: 'utf8' });
  git(['init', '-q']);
  git(['config', 'user.email', 'test@example.com']);
  git(['config', 'user.name', 'Test']);
  if (preset !== undefined) {
    mkdirSync(join(dir, '.shinon'), { recursive: true });
    writeFileSync(join(dir, PROJECT_PROFILE), JSON.stringify({ commitPolicy: { preset } }), 'utf8');
  }
  return {
    dir,
    git,
    commit(message, file = 'a.txt') {
      const msgFile = join(dir, 'MSG');
      writeFileSync(msgFile, message, 'utf8');
      writeFileSync(join(dir, file), `${message}\n`, 'utf8');
      git(['add', file]);
      git(['commit', '-q', '-F', msgFile]);
    },
  };
}

// ── 1. Vertrag ───────────────────────────────────────────────────────────────

test('policy: der ausgelieferte Vertrag ist gültig und nennt ein auflösbares Default-Preset', () => {
  assert.deepEqual(policyIssues(CONTRACT), []);
  const rules = resolvePreset(CONTRACT);
  assert.equal(rules.name, 'shinon-maintainer');
  assert.equal(rules.minWords, 150);
  assert.equal(rules.repairSwapTrailer, true);
});

test('policy: unbekannte Version, unbekannter Contract-String und fehlendes Preset werden abgelehnt', () => {
  const version = contractCopy();
  version.version = 2;
  assert.ok(policyIssues(version).some((issue) => issue.includes('Policy.version')));

  const contract = contractCopy();
  contract.contract = 'shinon.commit-policy/v0';
  assert.ok(policyIssues(contract).some((issue) => issue.includes('Policy.contract')));

  const empty = contractCopy();
  empty.presets = {};
  assert.ok(policyIssues(empty).some((issue) => issue.includes('mindestens ein Preset')));

  const missing = contractCopy();
  missing.default = 'gibt-es-nicht';
  assert.ok(policyIssues(missing).some((issue) => issue.includes('Policy.default')));
});

test('policy: unbekannte Schlüssel auf jeder Ebene sind Befunde, keine stillen Extras', () => {
  const top = contractCopy();
  top.extra = {};
  assert.ok(policyIssues(top).some((issue) => issue.includes('unbekannter Schlüssel „extra"')));

  const preset = contractCopy();
  preset.presets.minimal.footer = { forbidden: false };
  assert.ok(policyIssues(preset).some((issue) => issue.includes('unbekannter Schlüssel „footer"')));

  const words = contractCopy();
  words.presets.minimal.words.min = '0';
  assert.ok(policyIssues(words).some((issue) => issue.includes('words.min')));

  const repair = contractCopy();
  repair.presets.minimal.repair = { swapTrailer: 'ja' };
  assert.ok(policyIssues(repair).some((issue) => issue.includes('repair.swapTrailer')));
});

test('policy: die Propsa-Form steht ganz oder gar nicht — Form hier, Werte im contracts-Gate', () => {
  assert.deepEqual(policyIssues(contractCopy()), [], 'der echte Vertrag mit Propsa-Form ist gueltig');
  const none = contractCopy();
  delete none.name;
  delete none.status;
  delete none.rules;
  assert.deepEqual(policyIssues(none), [], 'ohne Propsa-Form bleibt eine fremde Policy lesbar');
  for (const key of ['name', 'status', 'rules']) {
    const partial = contractCopy();
    delete partial[key];
    assert.ok(policyIssues(partial).some((issue) => issue.includes(`Policy.${key}`)), `${key} fehlt bei sonst vollständiger Form`);
  }
  const badName = contractCopy();
  badName.name = '  ';
  assert.ok(policyIssues(badName).some((issue) => issue.includes('Policy.name')));
  const badRules = contractCopy();
  badRules.rules = [];
  assert.ok(policyIssues(badRules).some((issue) => issue.includes('Policy.rules')));
});

test('policy: die Untergrenze ist nicht abschwächbar', () => {
  for (const key of ['forbiddenFooters', 'coAuthorBan']) {
    const policy = contractCopy();
    policy.floor[key] = false;
    const issues = policyIssues(policy);
    assert.ok(issues.some((issue) => issue.includes(`Policy.floor.${key}`)), `${key} wurde akzeptiert`);
  }
  const floorless = contractCopy();
  delete floorless.floor;
  assert.ok(policyIssues(floorless).some((issue) => issue.includes('Policy.floor')));
});

test('policy: unbekannter Trailer und unbrauchbares Betreff-Muster werden abgelehnt', () => {
  const trailer = contractCopy();
  trailer.presets.minimal.trailer.id = 'irgendwer';
  assert.ok(policyIssues(trailer).some((issue) => issue.includes('unbekannter Trailer')));

  const unanchored = contractCopy();
  unanchored.presets.conventional.subject.pattern = 'feat: .*';
  assert.ok(policyIssues(unanchored).some((issue) => issue.includes('muss mit ^ beginnen')));

  const broken = contractCopy();
  broken.presets.conventional.subject.pattern = '^(feat$';
  assert.ok(policyIssues(broken).some((issue) => issue.includes('kein gültiger regulärer Ausdruck')));
});

test('policy: ein ungültiger Vertrag liefert nie Regeln, sondern wirft', () => {
  const policy = contractCopy();
  policy.version = 99;
  assert.throws(() => resolvePreset(policy), (error) => error instanceof PolicyError && error.issues.length > 0);
  assert.throws(() => resolvePreset(CONTRACT, 'unbekannt'), (error) => error instanceof PolicyError);
});

test('policy: das Gate-Plugin akzeptiert den Vertrag und fängt ein abgeschwächtes Preset', () => {
  assert.deepEqual(policyRuleIssues(CONTRACT), []);
  const weakened = contractCopy();
  weakened.presets['strict-evidence'].repair.swapTrailer = true;
  assert.ok(policyRuleIssues(weakened).some((issue) => issue.includes('strict-evidence')));
  const forced = contractCopy();
  forced.presets.conventional.trailer.required = true;
  assert.ok(policyRuleIssues(forced).some((issue) => issue.includes('ohne Auswahl')));
  const thinned = contractCopy();
  thinned.presets['shinon-maintainer'].words.min = 0;
  assert.ok(policyRuleIssues(thinned).some((issue) => issue.includes('shinon-maintainer')));
});

// ── 2. Preset-Matrix ────────────────────────────────────────────────────────

test('policy/minimal: ohne Trailer und ohne Wortzwang, aber Fußboden hält', () => {
  const rules = resolvePreset(CONTRACT, 'minimal');
  assert.equal(checkMessage('x', rules).ok, true, 'minimal verlangt keine Prosa');
  assert.equal(checkMessage('Generated with Codebuff', rules).ok, false, 'Signatur bleibt verboten');
  assert.equal(checkMessage('Co-Authored-By: Erika <erika@example.com>', rules).ok, false, 'co-authored-by bleibt verboten');
  assert.equal(checkMessage(VALID_SAMPLE, rules).ok, true);
});

test('policy/conventional: Betreff-Format entscheidet, Footer bleiben verboten', () => {
  const rules = resolvePreset(CONTRACT, 'conventional');
  assert.equal(checkMessage('feat(policy): add presets', rules).ok, true);
  assert.equal(checkMessage('fix!: remove trailer requirement', rules).ok, true);
  const wrong = checkMessage('Add presets', rules);
  assert.equal(wrong.ok, false);
  assert.ok(wrong.violations.some((violation) => violation.includes('Format: Betreff')), 'der Betreff wird benannt');
  assert.equal(checkMessage(`${LONG_BODY}\n\nGenerated with Codebuff 🤖`, rules).ok, false);
});

test('policy/shinon-maintainer: unverändertes Repo-Verhalten', () => {
  const rules = resolvePreset(CONTRACT, 'shinon-maintainer');
  assert.deepEqual(checkMessage(VALID_SAMPLE, rules), checkMessage(VALID_SAMPLE));
  const short = checkMessage(withTrailer('Kurz.'), rules);
  assert.ok(short.violations.some((violation) => violation.includes('zu kurz')));
  assert.equal(checkMessage(`${LONG_BODY}`, rules).ok, false, 'Trailer bleibt Pflicht');
});

test('policy/strict-evidence: gleiche Regeln wie maintainer, aber kein Tausch', () => {
  const rules = resolvePreset(CONTRACT, 'strict-evidence');
  assert.equal(checkMessage(VALID_SAMPLE, rules).ok, true);
  const raw = 'Titel\n\nEin kurzer Body.\n\nGenerated with Codebuff 🤖\n';
  assert.equal(swapTrailer(raw, rules), raw, 'ohne Reparatur bleibt die Datei unangetastet');
  assert.equal(swapTrailer(raw, resolvePreset(CONTRACT, 'shinon-maintainer')).includes('Codebuff'), false);
});

// ── 3. Auswahl ──────────────────────────────────────────────────────────────

test('policy: Voreinstellung ist shinon-maintainer, die Projektdatei wählt ein anderes Preset', () => {
  const bare = tempProject();
  assert.equal(selectPolicy({ root: bare.dir, env: {} }).name, 'shinon-maintainer');

  const picked = tempProject('conventional');
  const selection = selectPolicy({ root: picked.dir, env: {} });
  assert.equal(selection.name, 'conventional');
  assert.equal(selection.source, PROJECT_PROFILE);
  assert.ok(selection.rules.subjectPattern);
});

test('policy: Flag und Env schlagen die Projektdatei, alles wird gegen denselben Vertrag validiert', () => {
  const project = tempProject('minimal');
  assert.equal(selectPolicy({ root: project.dir, env: {}, preset: 'conventional' }).name, 'conventional');
  assert.equal(selectPolicy({ root: project.dir, env: { SHINON_COMMIT_POLICY: 'strict-evidence' } }).name, 'strict-evidence');
});

test('policy: eine defekte Projektdatei ist ein Fehler, kein Rückfall auf die Voreinstellung', () => {
  for (const content of [
    '{ kaputt',
    JSON.stringify({ commitPolicy: { preset: 'gibt-es-nicht' } }),
    JSON.stringify({ commitPolicy: { preset: 'minimal', words: { min: 0 } } }),
    JSON.stringify({ commitPolicy: 'minimal' }),
    JSON.stringify({ etwasAnderes: true }),
    JSON.stringify({ commitPolicy: { preset: '' } }),
  ]) {
    const project = tempProject();
    mkdirSync(join(project.dir, '.shinon'), { recursive: true });
    writeFileSync(join(project.dir, PROJECT_PROFILE), content, 'utf8');
    assert.throws(
      () => selectPolicy({ root: project.dir, env: {} }),
      (error) => error instanceof PolicyError,
      `akzeptiert: ${content}`,
    );
  }
});

test('policy: eine defekte Vertragsdatei ist ein Fehler, auch über --policy-file', () => {
  const dir = mkdtempSync(join(tmpdir(), 'shinon-policy-file-'));
  const broken = join(dir, 'broken.json');
  writeFileSync(broken, JSON.stringify({ contract: 'shinon.commit-policy/v1', version: 1 }), 'utf8');
  assert.throws(() => selectPolicy({ root: dir, env: {}, file: broken }), (error) => error instanceof PolicyError);
});

// ── 4. Parität: Hook, CLI, CI ───────────────────────────────────────────────

test('policy: Hook (--file), CLI (--stdin) und CI (--ci) urteilen gleich und exit-coden gleich', () => {
  const good = 'feat(policy): add presets\n';
  const bad = 'Add presets\n';
  for (const [message, expected] of [[good, 0], [bad, 1]]) {
    const project = tempProject('conventional');
    const messageFile = join(project.dir, 'MSG');
    writeFileSync(messageFile, message, 'utf8');

    const hook = run([GUARD, '--file', messageFile], project.dir);
    const stdin = run([GUARD, '--stdin'], project.dir, {}, message);

    const ciRepo = tempProject('conventional');
    ciRepo.commit('chore: base\n', 'base.txt');
    const before = ciRepo.git(['rev-parse', 'HEAD']).trim();
    ciRepo.commit(message, 'b.txt');
    // Ohne Event-Datei und ohne origin/main prüft --ci die volle Historie —
    // Baseline und Nachricht liegen beide darin, das Urteil bleibt dasselbe.
    const ci = run([GUARD, '--ci'], ciRepo.dir, {
      GITHUB_EVENT_NAME: 'push',
      GITHUB_SHA: ciRepo.git(['rev-parse', 'HEAD']).trim(),
      GITHUB_EVENT_PATH: '',
    });
    assert.ok(before.length >= 7);

    assert.equal(hook.status, expected, `Hook: ${message.trim()}`);
    assert.equal(ci.status, expected, `CI: ${message.trim()}`);
    assert.equal(stdin.status, hook.status, `CLI-Pfad weicht ab: ${message.trim()}`);
  }
});

test('policy: dieselbe Nachricht über --file und --range ergibt denselben Exitcode', () => {
  for (const [message, expected] of [['Add presets\n', 1], ['feat(policy): add presets\n', 0]]) {
    const project = tempProject('conventional');
    const messageFile = join(project.dir, 'MSG');
    writeFileSync(messageFile, message, 'utf8');
    const hook = run([GUARD, '--file', messageFile], project.dir);
    project.commit(message, 'c.txt');
    const range = run([GUARD, '--range', 'HEAD'], project.dir);
    assert.equal(hook.status, expected);
    assert.equal(range.status, expected, `Bereichslauf weicht ab: ${message.trim()}`);
  }
});

test('policy: ein defekter Input endet in jedem Pfad mit Exit 2, nie mit einem Urteil', () => {
  const project = tempProject();
  mkdirSync(join(project.dir, '.shinon'), { recursive: true });
  writeFileSync(join(project.dir, PROJECT_PROFILE), '{ kaputt', 'utf8');
  const messageFile = join(project.dir, 'MSG');
  writeFileSync(messageFile, VALID_SAMPLE, 'utf8');

  assert.equal(run([GUARD, '--file', messageFile], project.dir).status, 2);
  assert.equal(run([GUARD, '--range', 'HEAD'], project.dir).status, 2);
  const ci = run([GUARD, '--ci'], project.dir, { GITHUB_EVENT_NAME: 'push', GITHUB_EVENT_PATH: '' });
  assert.equal(ci.status, 2);
  assert.match(ci.stderr, /Ersatzregeln/);
});

// ── 5. Reparatur-Grenze ─────────────────────────────────────────────────────

test('policy: --fix entfernt nur Footer-Zeilen und lässt den Body unangetastet', () => {
  const project = tempProject();
  const messageFile = join(project.dir, 'MSG');
  const body = `Titel\n\n${LONG_BODY}\n\nZweite Zeile bleibt.`;
  writeFileSync(messageFile, `${body}\n\nGenerated with Codebuff 🤖\nCo-Authored-By: Codebuff <noreply@codebuff.com>\n`, 'utf8');

  const fixed = run([GUARD, '--file', messageFile, '--fix'], project.dir);
  assert.equal(fixed.status, 0, 'nach dem begrenzten Tausch muss die Nachricht bestehen');
  const after = readFileSync(messageFile, 'utf8');
  assert.ok(after.startsWith(body), 'der Body wird nicht umgeschrieben');
  assert.equal(after.includes('Codebuff'), false);
  assert.ok(after.trimEnd().endsWith(VANNON_TRAILER));
});

test('die Policy-Datei dokumentiert WORD_MIN, statt es zu setzen', () => {
  // Der Code ist die Quelle; die Datei ist Doku. Ohne diesen Vergleich wäre sie
  // Dekoration, und eine Zahl an zwei Orten, von denen nur einer wirkt, ist ein
  // Fallstrick für den nächsten Agenten.
  assert.equal(CONTRACT.presets[CONTRACT.default].words.min, WORD_MIN, 'Default-Preset weicht von WORD_MIN ab');
  for (const [name, preset] of Object.entries(CONTRACT.presets)) {
    const min = preset.words?.min;
    if (!Number.isInteger(min) || min === 0) continue;
    assert.equal(min, WORD_MIN, `Preset ${name}: words.min ${min} weicht von WORD_MIN ${WORD_MIN} ab`);
  }
});

test('policy: strict-evidence repariert nichts — Datei bleibt bytegleich, Exit 1', () => {
  const project = tempProject('strict-evidence');
  const messageFile = join(project.dir, 'MSG');
  const original = `${LONG_BODY}\n\nGenerated with Codebuff 🤖\n`;
  writeFileSync(messageFile, original, 'utf8');

  const result = run([GUARD, '--file', messageFile, '--fix'], project.dir);
  assert.equal(result.status, 1);
  assert.equal(readFileSync(messageFile, 'utf8'), original);
  assert.match(result.stderr, /erlaubt keine Reparatur|keine Reparatur/);
});
