/** Teil 1/2 von commit-trailer.test.mjs — Fixtures stehen in `commit-trailer-fixtures.mjs`. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  FORBIDDEN_LINES,
  VANNON_TRAILER,
  checkMessage,
  countWords,
  hasVannonTrailer,
  isForbiddenFooterLine,
  swapTrailer,
} from '../../lib/commit-text.mjs';
import {
  FORBIDDEN_SAMPLE,
  LONG_BODY,
  VALID_SAMPLE,
  hookIssues,
  ruleIssues,
  workflowIssues,
} from '../plugins/commit-trailer.mjs';
import { resolveCiRange } from '../../lib/ci-range.mjs';
import { ROOT, GUARD, CODEFUFF_BLOCK, run, withTrailer, SIGNATURE_VARIANTS, INLINE_VARIANTS, contentLines, withBody, neverResolvable, alwaysResolvable, eventFile, tempRepo, pushEnv } from './commit-trailer-fixtures.mjs';

test('commit: die eingefrorene Codebuff-Signatur wird abgelehnt', () => {
  const result = checkMessage(FORBIDDEN_SAMPLE);
  assert.equal(result.ok, false);
  assert.ok(result.violations.some((violation) => violation.includes('Footer')));
  assert.ok(result.violations.some((violation) => violation.includes('co-authored-by')));
});
test('commit: jede verbotene Familie wird erkannt', () => {
  const samples = [
    'Generated with Codebuff 🤖',
    'Co-Authored-By: Codebuff <noreply@codebuff.com>',
    'Generated with Claude Code',
    'Co-Authored-By: Claude <noreply@anthropic.com>',
    'Powered by ChatGPT',
    '🤖 Generated with Copilot',
    'generated with cursor',
  ];
  for (const line of samples) {
    assert.equal(isForbiddenFooterLine(line), true, `nicht erkannt: ${line}`);
    assert.equal(checkMessage(withTrailer(line)).ok, false, `akzeptiert: ${line}`);
  }
  assert.ok(FORBIDDEN_LINES.length >= 5);
  assert.ok(FORBIDDEN_LINES.some(({ label }) => label.includes('with/by')), 'die with/by-Familie fehlt');
});
test('commit: co-authored-by ist auch für Menschen verboten', () => {
  const result = checkMessage(withTrailer('Co-Authored-By: Erika <erika@example.com>'));
  assert.equal(result.ok, false);
  assert.ok(result.violations.some((violation) => violation.includes('co-authored-by')));
});
test('commit: der Vannon-Trailer ist Pflicht', () => {
  const result = checkMessage('Etwas ändern\n\nEin Body ohne Trailer.');
  assert.equal(result.ok, false);
  assert.ok(result.violations.some((violation) => violation.includes('Vannon-Trailer fehlt')));
  assert.equal(result.hasTrailer, false);
});
test('commit: gültige Nachricht mit Trailer geht durch', () => {
  const result = checkMessage(VALID_SAMPLE);
  assert.deepEqual(result.violations, []);
  assert.equal(result.ok, true);
  assert.equal(result.hasTrailer, true);
});
test('commit: Trailer wird mit Bindestrich und anderem Whitespace erkannt', () => {
  const folded = VANNON_TRAILER.replace('—', '-').replace(/\s+/g, '  ');
  assert.equal(hasVannonTrailer(withTrailer(folded)), true);
  assert.equal(checkMessage(`${LONG_BODY}\n\n${folded}\n`).ok, true);
});
test('commit: Kommentarzeilen zählen nicht als Footer', () => {
  assert.equal(isForbiddenFooterLine('# Generated with Codebuff 🤖'), false);
  const message = `Titel\n\n${LONG_BODY}\n\n# Bitte beachten\n\n${VANNON_TRAILER}\n`;
  assert.equal(checkMessage(message).ok, true);
});
test('commit: Wort-Regel — kurze Nachricht wird abgelehnt, lange geht durch', () => {
  const short = withTrailer('Titel\n\nEin kurzer Body ohne Umfang.');
  const result = checkMessage(short);
  assert.equal(result.ok, false);
  assert.ok(result.violations.some((violation) => violation.includes('Wort-Regel: Nachricht zu kurz')));
  assert.equal(checkMessage(VALID_SAMPLE).ok, true);
});
test('commit: Wort-Regel — 150 Wörter stehen, 149 fallen', () => {
  const words150 = ['Start scripts/lib/commit-text.mjs 32/0 wie ein Wächter', ...Array(144).fill('Wort')].join(' ');
  assert.equal(countWords(words150), 150);
  assert.equal(checkMessage(withTrailer(words150)).ok, true);
  const words149 = ['Start scripts/lib/commit-text.mjs 32/0 wie ein Wächter', ...Array(143).fill('Wort')].join(' ');
  assert.equal(countWords(words149), 149);
  const result = checkMessage(withTrailer(words149));
  assert.equal(result.ok, false);
  assert.ok(result.violations.some((violation) => violation.includes('zu kurz')));
});
test('commit: Wort-Regel — anonyme Zahlen ohne Herkunft zählen nicht als Daten', () => {
  const filler = Array(160).fill('Wort').join(' ');
  const anonymous = withTrailer(`Titel\n\n${filler} wie ein Wächter, alles besser, 401 Dinge.`);
  const result = checkMessage(anonymous);
  assert.equal(result.ok, false);
  assert.ok(result.violations.some((violation) => violation.includes('namentlich')));
  assert.ok(!result.violations.some((violation) => violation.includes('zu kurz')));
  assert.ok(!result.violations.some((violation) => violation.includes('Bildsprache')));
});
test('commit: Wort-Regel — trockener Bericht ohne Bild fällt, jede Datenform steht', () => {
  const filler = Array(160).fill('Wort').join(' ');
  const dry = withTrailer(`Titel\n\n${filler} scripts/lib/commit-text.mjs 32/0.`);
  const dryResult = checkMessage(dry);
  assert.equal(dryResult.ok, false);
  assert.ok(dryResult.violations.some((violation) => violation.includes('Bildsprache')));
  for (const proof of ['scripts/lib/commit-text.mjs', '3add4879a8b6fc28', '401/401', 'Exit 0', 'Run 37571432238', '#127']) {
    const message = withTrailer(`Titel\n\n${filler} wie ein Wächter mit ${proof}.`);
    assert.equal(checkMessage(message).ok, true, `abgelehnt trotz Beleg: ${proof}`);
  }
});
test('commit: Wort-Regel — Trailer und #-Zeilen füttern den Zähler nicht', () => {
  const words = ['Start scripts/lib/commit-text.mjs 32/0 wie ein Wächter', ...Array(144).fill('Wort')].join(' ');
  const padded = `${words}\n\n# ${Array(60).fill('Kommentar').join(' ')}\n\n${VANNON_TRAILER}\n`;
  assert.equal(countWords(padded), 150);
  assert.equal(checkMessage(padded).ok, true);
});
test('commit: Wort-Regel — Footer- und Wort-Verstöße werden getrennt gemeldet', () => {
  const result = checkMessage(FORBIDDEN_SAMPLE);
  assert.equal(result.ok, false);
  assert.ok(result.violations.some((violation) => violation.includes('Footer') || violation.includes('co-authored-by')));
  assert.ok(!result.violations.some((violation) => violation.includes('Wort-Regel')), 'der lange Body darf keinen Wort-Verstoß tragen');
});
test('commit: Tausch entfernt die Signatur und ist idempotent', () => {
  const swapped = swapTrailer(FORBIDDEN_SAMPLE);
  assert.ok(!/codebuff/i.test(swapped), 'Signatur steht noch im Text');
  assert.ok(swapped.includes(VANNON_TRAILER));
  assert.equal(checkMessage(swapped).ok, true);
  assert.equal(swapTrailer(swapped), swapped, 'nicht idempotent');
});
test('commit: Tausch lässt den Body unangetastet und verträgt CRLF', () => {
  const swapped = swapTrailer(CODEFUFF_BLOCK.replace(/\n/g, '\r\n'));
  assert.match(swapped, /Ein Body mit Inhalt\./);
  assert.ok(!swapped.includes('\r'));
  assert.ok(swapped.endsWith(`${VANNON_TRAILER}\n`));
});
test('commit: jede Schreibweise wird abgelehnt — with/by, Tabs, Doppel-Leerzeichen', () => {
  // Stichprobe gegen die Menge: die Prüfung darf nicht raten, sie muss kennen.
  for (const line of [...SIGNATURE_VARIANTS.slice(0, 3), ...INLINE_VARIANTS]) {
    assert.equal(isForbiddenFooterLine(line), true, `nicht erkannt: ${JSON.stringify(line)}`);
    assert.equal(checkMessage(withBody(line)).ok, false, `akzeptiert: ${JSON.stringify(line)}`);
  }
  // Die Zahl ist gemessen (5 Verben × 2 Präpositionen × 3 Abstände × 11 Namen)
  // und wird hier gepinnt, weil die Doku sie nennt: 330, nicht „mindestens 300".
  assert.equal(SIGNATURE_VARIANTS.length, 330, 'die Variantenmenge ist geschrumpft oder gewachsen');
});
test('commit: Signaturen zählen auch mitten im Body (P3)', () => {
  const midBody = `Titel\n\nEin Body.\n\ngenerated with some tool${withTrailer('')}`;
  const result = checkMessage(midBody);
  assert.equal(result.ok, false, 'eine Signaturzeile ist eine Signaturzeile — egal an welcher Stelle');
  assert.ok(result.violations.some((violation) => violation.includes('Footer')));
});
test('commit: Invariante — der Tausch entfernt nur, was die Prüfung ablehnt', () => {
  const corpus = [
    ...SIGNATURE_VARIANTS,
    ...INLINE_VARIANTS,
    FORBIDDEN_SAMPLE,
    VALID_SAMPLE,
    'Titel\n\nBody ohne Trailer.',
    `Titel\n\nEin sauberer Body mit  doppelten  Leerzeichen.${withTrailer('')}`,
    `Titel\n\nVerifiziert mit Protokoll, geschrieben von Hand.${withTrailer('')}`,
    `Titel\n\n# Generated with Codebuff\n\nEin Kommentar bleibt ein Kommentar.${withTrailer('')}`,
  ];

  for (const message of corpus) {
    const checked = checkMessage(message);
    const swapped = swapTrailer(message);
    const removed = contentLines(message).filter((line) => !contentLines(swapped).includes(line));

    if (removed.length > 0) {
      assert.equal(
        checked.ok,
        false,
        `Tausch entfernt ${JSON.stringify(removed)}, die Prüfung sagt aber ok — CI würde es durchwinken`,
      );
    }
    if (checked.ok) {
      assert.deepEqual(removed, [], 'grün geprüft, aber der Tausch würde Inhaltszeilen entfernen');
    }
  }
});
test('commit: das Gate wird nicht durch die eigenen Regeln rot', () => {
  assert.deepEqual(ruleIssues(), []);
});
test('commit: eine wirkungslose Regel wird erkannt', () => {
  const issues = ruleIssues({ forbiddenSample: VALID_SAMPLE, validSample: VALID_SAMPLE });
  assert.ok(issues.some((issue) => issue.includes('Codebuff-Signatur wurde akzeptiert')));
});
test('commit: CI-Workflow läuft immer und filtert nicht', () => {
  const text = readFileSync(join(ROOT, '.github/workflows/commit-guard.yml'), 'utf8');
  assert.deepEqual(workflowIssues(text), []);
  assert.ok(workflowIssues(`${text}\non:\n  push:\n    paths:\n      - 'scripts/**'\n`).some((issue) => issue.includes('paths')));
  assert.ok(workflowIssues('on:\n  push:\n').some((issue) => issue.includes('pull_request')));
});
test('commit: der CI-Job darf nicht entschärft oder bedingt sein', () => {
  const text = readFileSync(join(ROOT, '.github/workflows/commit-guard.yml'), 'utf8');
  assert.ok(
    workflowIssues(text.replace('runs-on: ubuntu-latest', 'runs-on: ubuntu-latest\n    continue-on-error: true')).some(
      (issue) => issue.includes('continue-on-error'),
    ),
  );
  assert.ok(
    workflowIssues(`${text}\n        run: |\n          range="HEAD"\n`).some((issue) => issue.includes('Bereichslogik') || issue.includes('Prüfbereich')),
  );
});
test('ci-range: auflösbare Basis ergibt eine Spanne', () => {
  const push = resolveCiRange(
    { GITHUB_EVENT_NAME: 'push', GITHUB_EVENT_PATH: eventFile({ before: 'aaa111' }), GITHUB_SHA: 'bbb222' },
    alwaysResolvable,
  );
  assert.equal(push.range, 'aaa111..bbb222');
  assert.match(push.why, /before/);

  const pr = resolveCiRange(
    {
      GITHUB_EVENT_NAME: 'pull_request',
      GITHUB_EVENT_PATH: eventFile({ pull_request: { base: { sha: 'base1' }, head: { sha: 'head1' } } }),
      GITHUB_SHA: 'head1',
    },
    alwaysResolvable,
  );
  assert.equal(pr.range, 'base1..head1');
});
test('ci-range: ein neuer Branch prüft die Spitze minus Hauptlinie, nie weniger', () => {
  // Neuer Branch: GitHub schickt den Null-SHA als `before`. Was der Push
  // hinzufügt, ist die Spitze nach der Merge-Basis mit origin/main — liegt sie
  // vor (hier: der Stub löst alles auf), wird genau das geprüft, nicht die
  // volle Historie. Die Hauptlinie wurde bei ihrem eigenen Push schon gerichtet.
  const added = resolveCiRange(
    { GITHUB_EVENT_NAME: 'push', GITHUB_EVENT_PATH: eventFile({ before: '0'.repeat(40) }), GITHUB_SHA: 'bbb222' },
    alwaysResolvable,
  );
  assert.equal(added.range, 'sha..bbb222');
  assert.match(added.why, /Merge-Basis/);

  // Ohne Hauptlinie im Klon bleibt es bei der vollen Historie (fail-closed).
  assert.equal(
    resolveCiRange(
      { GITHUB_EVENT_NAME: 'push', GITHUB_EVENT_PATH: eventFile({ before: '0'.repeat(40) }) },
      neverResolvable,
    ).range,
    'HEAD',
  );
});
