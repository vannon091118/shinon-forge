import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const bundlePatch = new URL('../../../packages/prompter/cordis.patch.yml', import.meta.url);
const profilePatch = new URL('../../../profiles/shinon/cordis.patch.yml', import.meta.url);

/**
 * Der Block, den das Profil für shinon-prompter setzt — bis zum naechsten
 * Eintrag auf Spalte 0. Der Test prueft damit DIESEN Eintrag, nicht irgendein
 * `mode:` irgendwo in der Datei.
 */
function prompterBlock(text) {
  const start = text.indexOf('- id: shinon-prompter');
  assert.notEqual(start, -1, 'shinon-prompter fehlt im Profil-Patch');
  const rest = text.slice(start + 1);
  const next = rest.search(/\n-\s/);
  return next === -1 ? rest : rest.slice(0, next);
}

/**
 * Die wirksame Config steht im PROFIL, nicht im Paket-Patch.
 *
 * Grund (gemessen 2026-10-13): eine id-gezielte Config im Profil ERSETZT die
 * Config des Bundle-Eintrags. Solange `mode: MAX` samt Route im Paket-Patch
 * stand und das Profil denselben Eintrag nur wegen `skillsPath` anfasste, war
 * beides wirkungslos — der Prompter mountete mit MIN und leerer Route, meldete
 * `NO_ROUTE` und veredelte nichts. Deshalb prueft dieser Test MAX und die
 * → Kanon: docs/COMMENT-KANON.md#k-5feebda6c44e
 */
test('MAX steht im Profil und nutzt den Laufzeit-Index statt des unbrauchbaren Platzhalters', () => {
  const bundle = readFileSync(bundlePatch, 'utf8');
  const profile = readFileSync(profilePatch, 'utf8');
  const block = prompterBlock(profile);

  assert.match(block, /^\s*mode:\s*MAX\s*$/m, 'MAX muss die gewaehlte Stufe sein: nur MAX fragt den Project Index');
  assert.doesNotMatch(
    block,
    /^\s*contextPath:\s*['"]?\.\/assets\/max-context\.json['"]?\s*$/m,
    'der unbrauchbare Schema-Platzhalter darf den Laufzeit-Index nicht verdecken',
  );
  assert.doesNotMatch(profile, /^\s*contextPath:/m, 'die Profil-Ebene darf keine statische Kontextdatei einfuehren');
});

test('der Paket-Patch traegt keine Config, die die Profil-Ebene still ersetzen koennte', () => {
  const bundle = readFileSync(bundlePatch, 'utf8');
  assert.match(bundle, /id:\s*shinon-prompter/, 'der Insert-Eintrag bleibt');
  assert.doesNotMatch(bundle, /^\s+config:\s*$/m, 'eine Config im Paket-Patch waere nach der Profil-Ebene nicht wirksam');
  assert.doesNotMatch(bundle, /^\s*mode:\s*/m, 'mode gehoert ins Profil — im Paket sah er wirksam aus und war es nie');
});
