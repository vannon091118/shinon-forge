/**
 * Gate: das Dev-Tagebuch ist verankert, nicht behauptet.
 *
 * Was hier geprüft wird, und warum es ohne echte Kapitel rot wäre:
 *
 *   1. Der echte Repository-Baum wird EINMAL von `scripts/shinon-test.mjs`
 *      mit voller Historie geprüft; der CI-Schnellpfad erzwingt diesen Klon.
 *   2. Diese Datei prüft die Regeln mit Miniatur-Bäumen und mutiert jede wichtige
 *      Invariante: erfundener SHA, falsches Datum, toter Pfad, fehlender Anker,
 *      zu kurze Kapitel und fehlende Akten-Zeilen.
 *   3. Die teure Realbaum-Prüfung und die Mutationstests bleiben getrennte Belege,
 *      statt denselben Live-Zustand zweimal zu prüfen.
 *
 * Der Schritt liest git nur, um zu prüfen — er committet nichts und schreibt nichts.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import * as diary from '../../lib/diary.mjs';

const ROOT = fileURLToPath(new URL('../../..', import.meta.url));
const read = (file) => readFileSync(file, 'utf8');

/** Ein Miniatur-Baum mit genau den Dateien, die das Tagebuch als Beleg nennt. */
function miniTree(text) {
  const root = mkdtempSync(join(tmpdir(), 'shinon-diary-'));
  mkdirSync(join(root, 'docs'), { recursive: true });
  mkdirSync(join(root, 'packages', 'hook'), { recursive: true });
  mkdirSync(join(root, 'scripts'), { recursive: true });
  writeFileSync(join(root, 'packages', 'hook', 'index.js'), '// fixture\n');
  writeFileSync(join(root, 'scripts', 'example.mjs'), '// fixture\n');
  writeFileSync(join(root, diary.DIARY_FILE), text);
  return root;
}

const PROSE = (extra = '') =>
  'Ein Tag, an dem etwas gebaut wurde, das heute noch steht. Der Absatz erzählt, was ' +
  'zuerst schiefging und welcher Pfad den Fehler heute verhindert. ' +
  extra;

const HEAD = '# Dev-Tagebuch\n\n> **Status:** current — Fixture. **Stand:** 2026-01-03\n\n';

/** Je Fixture-Tag genau ein Commit — der Anker muss dessen Datum tragen. */
const SHA_OF = { '2026-01-02': 'aaaaaaa', '2026-01-03': 'bbbbbbb' };

function chapter(date, { anker = `**Anker:** \`${SHA_OF[date]}\` · Belege: \`packages/hook/index.js\``, prose = PROSE() } = {}) {
  return `## ${date} — Fixture-Kapitel\n\n${prose}\n\n${anker}\n\n`;
}

function claims(rows = 6) {
  const lines = ['## Was die Akten falsch behaupten', '', '| Behauptung (Quelle) | Baum heute | SHA |', '|---|---|---|'];
  for (let i = 0; i < rows; i += 1) {
    lines.push(`| eine alte Behauptung ${i} | \`packages/hook/index.js\` | \`aaaaaaa\` |`);
  }
  return `${lines.join('\n')}\n`;
}

function withTemp(diary, fn) {
  const root = miniTree(diary);
  try {
    return fn(root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

test('ein vollständiges Miniatur-Tagebuch ist grün', () => {
  withTemp(HEAD + chapter('2026-01-02') + chapter('2026-01-03') + claims(), (root) => {
    assert.deepEqual(diary.diaryIssues(root, { log: 'aaaaaaa 2026-01-02\nbbbbbbb 2026-01-03\n' }), []);
  });
});

test('ein Tag ohne Kapitel ist rot', () => {
  withTemp(HEAD + chapter('2026-01-02') + claims(), (root) => {
    const issues = diary.diaryIssues(root, { log: 'aaaaaaa 2026-01-02\nbbbbbbb 2026-01-03\n' });
    assert.ok(issues.some((issue) => issue.includes('2026-01-03') && issue.includes('kein Tageskapitel')), issues.join('\n'));
  });
});

test('ein erfundener SHA ist rot', () => {
  withTemp(HEAD + chapter('2026-01-02') + chapter('2026-01-03', { anker: '**Anker:** `deadbee` · Belege: `packages/hook/index.js`' }) + claims(), (root) => {
    const issues = diary.diaryIssues(root, { log: 'aaaaaaa 2026-01-02\nbbbbbbb 2026-01-03\n' });
    assert.ok(issues.some((issue) => issue.includes('deadbee') && issue.includes('keinem Commit')), issues.join('\n'));
  });
});

test('ein SHA am falschen Tag ist rot', () => {
  withTemp(HEAD + chapter('2026-01-02') + chapter('2026-01-03', { anker: '**Anker:** `aaaaaaa` · Belege: `packages/hook/index.js`' }) + claims(), (root) => {
    const issues = diary.diaryIssues(root, { log: 'aaaaaaa 2026-01-02\nbbbbbbb 2026-01-03\n' });
    assert.ok(issues.some((issue) => issue.includes('ist vom 2026-01-02')), issues.join('\n'));
  });
});

test('ein toter Belegpfad ist rot', () => {
  withTemp(HEAD + chapter('2026-01-02') + chapter('2026-01-03', { anker: '**Anker:** `bbbbbbb` · Belege: `packages/gibt-es-nicht/index.js`' }) + claims(), (root) => {
    const issues = diary.diaryIssues(root, { log: 'aaaaaaa 2026-01-02\nbbbbbbb 2026-01-03\n' });
    assert.ok(issues.some((issue) => issue.includes('packages/gibt-es-nicht/index.js') && issue.includes('existiert nicht')), issues.join('\n'));
  });
});

test('ein Kapitel ohne Anker oder ohne Pfad ist rot', () => {
  withTemp(HEAD + chapter('2026-01-02') + chapter('2026-01-03', { anker: '**Anker:** ohne Beleg' }) + claims(), (root) => {
    const issues = diary.diaryIssues(root, { log: 'aaaaaaa 2026-01-02\nbbbbbbb 2026-01-03\n' });
    assert.ok(issues.some((issue) => issue.includes('Anker nennt keinen SHA')), issues.join('\n'));
    assert.ok(issues.some((issue) => issue.includes('Anker nennt keinen Pfad')), issues.join('\n'));
  });
});

test('ein leeres Kapitel ist rot', () => {
  withTemp(HEAD + chapter('2026-01-02', { prose: 'zu kurz' }) + chapter('2026-01-03') + claims(), (root) => {
    const issues = diary.diaryIssues(root, { log: 'aaaaaaa 2026-01-02\nbbbbbbb 2026-01-03\n' });
    assert.ok(issues.some((issue) => issue.includes('Kapitel ist leer')), issues.join('\n'));
  });
});

test('fehlende oder zu dünne Akten-Zeilen sind rot', () => {
  withTemp(HEAD + chapter('2026-01-02') + chapter('2026-01-03'), (root) => {
    const missing = diary.diaryIssues(root, { log: 'aaaaaaa 2026-01-02\nbbbbbbb 2026-01-03\n' });
    assert.ok(missing.some((issue) => issue.includes('Was die Akten falsch behaupten')), missing.join('\n'));
  });
  withTemp(HEAD + chapter('2026-01-02') + chapter('2026-01-03') + claims(2), (root) => {
    const thin = diary.diaryIssues(root, { log: 'aaaaaaa 2026-01-02\nbbbbbbb 2026-01-03\n' });
    assert.ok(thin.some((issue) => issue.includes('nur 2 Zeilen')), thin.join('\n'));
  });
});

test('eine Akten-Zeile ohne SHA ist rot', () => {
  const broken = claims().replace('| `aaaaaaa` |', '| alt |');
  withTemp(HEAD + chapter('2026-01-02') + chapter('2026-01-03') + broken, (root) => {
    const issues = diary.diaryIssues(root, { log: 'aaaaaaa 2026-01-02\nbbbbbbb 2026-01-03\n' });
    assert.ok(issues.some((issue) => issue.includes('Akten-Zeile ohne SHA')), issues.join('\n'));
  });
});

test('ohne git-Log meldet der Schritt nichts (sichtbarer Skip statt falschem Rot)', () => {
  const root = mkdtempSync(join(tmpdir(), 'shinon-diary-'));
  try {
    mkdirSync(join(root, 'docs'), { recursive: true });
    writeFileSync(join(root, diary.DIARY_FILE), HEAD);
    // `diaryHistory` findet hier kein .git — und liefert deshalb einen Skip.
    assert.ok(diary.diaryHistory(root).skip);
    assert.deepEqual(diary.diaryIssues(root), []);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
