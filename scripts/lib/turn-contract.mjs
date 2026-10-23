/**
 * turn-contract.mjs — Eigentümer: die statische Seite des Turn-Vertrags.
 *
 * `packages/seams/assets/turn-order.json` (Vertrag `shinon.turn/v1`) behauptet
 * drei Dinge, und jede Behauptung wird hier gegen den Baum geprüft:
 *
 *   1. REIHENFOLGE — die vier Pflicht-Teilnehmer stehen im Profil in der
 *      Reihenfolge, die der Vertrag nennt. Die Reihenfolge der Registrierung ist
 *      die Reihenfolge des Wasserfalls; sie kommt aus `dsh.profile.bundles`, nicht
 *      aus einer zweiten Liste.
 *   2. EIGENTUM — ein exklusiver Kanal wird von genau EINEM Paket mit
 *      `ctx.on('<kanal>'` registriert; ein geteilter Kanal von jedem genannten
 *      Eigentümer. Die Zählung liest die Registrierung, nicht das Wort: ein
 *      Kommentar, der einen Kanal nennt, ist kein Listener (gemessen: genau
 *      dieser Fall steht in `packages/task-router/index.js`).
 *   3. CONFIG — ein Pflicht-Teilnehmer, dessen Teilnahme an einer Config hängt,
 *      darf durch die WIRKSAME Profil-Config nicht geschlossen sein. Ist die
 *      Config im Profil nicht entschieden, gilt die Vorgabe des Pakets; der
 *      Vertrag behauptet dann nichts und der Befund unterbleibt.
 *
 * Was hier NICHT geprüft wird: ob der Boot wirklich läuft. Das ist der
 * Profiltest (`dsh --profile shinon --dump-config`), nicht dieses Gate.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { participationIssues, contractIssues, readPath } from '../../packages/seams/assets/orchestrator.js';
import { activeProfile, resolveProfile } from './repo-profil.mjs';
import { parsePatchFile } from './repo-pakete.mjs';

export const TURN_CONTRACT_FILE = 'packages/seams/assets/turn-order.json';

/** Liest den Vertrag; ein fehlender oder defekter Vertrag ist ein Befund. */
export function readTurnContract(root) {
  const file = join(root, TURN_CONTRACT_FILE);
  if (!existsSync(file)) return { contract: null, issues: [`${TURN_CONTRACT_FILE} fehlt`] };
  try {
    return { contract: JSON.parse(readFileSync(file, 'utf8')), issues: [] };
  } catch (error) {
    return { contract: null, issues: [`${TURN_CONTRACT_FILE}: ungültiges JSON (${error.message})`] };
  }
}

/** Wer registriert den Kanal wirklich? Ein Kommentar zählt nicht. */
export function channelRegistrars(packages, channel) {
  return packages
    .filter((pkg) => registers(join(pkg.base, 'index.js'), channel))
    .map((pkg) => pkg.dir);
}

/** Die Registrierung eines Kanals, nicht seine Erwähnung. */
function registers(file, channel) {
  if (!existsSync(file)) return false;
  const text = readFileSync(file, 'utf8');
  // Seit Etappe 2 läuft die Registrierung über den Orchestrator; die alte
  // direkte Form bleibt erkennbar, damit eine halb migrierte Datei auffällt.
  const pattern = `(?:ctx\\.on|bus\\.route)\\(\\s*['"]${channel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}['"]`;
  return new RegExp(pattern).test(text);
}

/** Die wirksame Config eines Profil-Eintrags, sofern sie die Gate-Stelle entscheidet. */
function decidedConfig(entry, id, configs) {
  const config = configs.get(id);
  if (config === undefined) return undefined;
  const path = entry?.gate?.kind === 'always' ? null : entry?.gate?.path;
  if (path !== null && readPath(config, path) === undefined) return undefined;
  return config;
}

/** Die Reihenfolge der Pflicht-Teilnehmer gegen die Bundle-Reihenfolge des Profils.
 *
 * Die Bundle-Reihenfolge IST die Apply-Reihenfolge; damit ist sie die
 * Registrierungs-Reihenfolge des Wasserfalls. Getrennt exportiert, damit der
 * Test einen Tausch prüfen kann, ohne `turn-order.json` anzufassen.
 */
export function profileOrderIssues(contract, bundles, profileName) {
  const issues = [];
  const positions = new Map((bundles ?? []).map((name, index) => [name, index]));
  let last = -1;
  // Nach `position`, nicht nach Array-Reihenfolge: sonst wären die Zahlen
  // im Vertrag Dekoration und ein Tausch bliebe unsichtbar.
  for (const entry of [...(contract?.order ?? [])].sort((a, b) => a.position - b.position)) {
    const index = positions.get(entry.package);
    if (index === undefined) {
      if (entry.required === true) issues.push(`turn-order.json: Pflicht-Teilnehmer ${entry.package} fehlt im Profil ${profileName}`);
      continue;
    }
    if (entry.required !== true) continue;
    if (index < last) {
      issues.push(`turn-order.json: ${entry.owner} steht im Profil ${profileName} vor einer früheren Stufe — der Wasserfall liefe in anderer Reihenfolge`);
    }
    last = index;
  }
  return issues;
}

/** Die Eigentumsregel der exklusiven Kanäle, ohne Dateisystem.
 *
 * Getrennt exportiert, damit der Test sie auf einem Miniatur-Baum fahren kann,
 * ohne den echten Baum zu schreiben — die Regel ist dieselbe.
 */
export function exclusiveIssues(contract, packages) {
  const issues = [];
  for (const entry of contract?.exclusive ?? []) {
    const registrars = channelRegistrars(packages, entry.channel);
    if (registrars.length !== 1) {
      issues.push(`turn-order.json: "${entry.channel}" ist exklusiv, wird aber von ${registrars.length} Paketen registriert (${registrars.join(', ') || 'keinem'})`);
    } else if (registrars[0] !== entry.owner) {
      issues.push(`turn-order.json: "${entry.channel}" gehört ${entry.owner}, registriert wird er von ${registrars[0]}`);
    }
  }
  return issues;
}

/** Kein Paket registriert direkt am Bus, seit Etappe 2.
 *
 * Der Orchestrator ist die eine Stelle, an der ein Paket seinen Eigentümer
 * nennt und ein fehlendes Primitiv als Befund sichtbar wird. Ein direkter
 * `ctx.on`/`ctx.provide` in einer Host-Hälfte wäre die zweite, unsichtbare
 * Registrierung daneben. Kommentare und die generierten Idiom-Blöcke zählen
 * nicht: die einen erklären, die anderen gehören dem Generator.
 */
export function directRegistrationIssues(packages) {
  const issues = [];
  for (const pkg of packages ?? []) {
    const file = join(pkg.base, 'index.js');
    if (!existsSync(file)) continue;
    readFileSync(file, 'utf8').split('\n').forEach((line, index) => {
      if (!/ctx\.(on|provide)\(/.test(line)) return;
      if (/^\s*(\/\/|\*|\/\*)/.test(line)) return;
      issues.push(`packages/${pkg.dir}/index.js:${index + 1}: direkte Registrierung — der Bus läuft über den Orchestrator (${line.trim()})`);
    });
  }
  return issues;
}

export function turnContractIssues(ctx) {
  const root = ctx.repo.ROOT;
  const { contract, issues } = readTurnContract(root);
  if (contract === null) return issues;
  issues.push(...contractIssues(contract));

  for (const entry of contract.order ?? []) {
    const base = join(root, 'packages', entry.owner);
    const source = join(root, entry.source ?? '');
    if (!existsSync(base)) {
      issues.push(`turn-order.json: Paket packages/${entry.owner} fehlt`);
      continue;
    }
    if (!existsSync(source)) {
      issues.push(`turn-order.json: Quelle ${entry.source} fehlt`);
      continue;
    }
    const text = readFileSync(source, 'utf8');
    if (!text.includes('bus.route(') && !text.includes('ctx.on(')) {
      issues.push(`turn-order.json: ${entry.source} registriert nichts über den Orchestrator`);
    }
    if (!text.includes(contract.turn) && !readsPackageChannel(base, contract.turn)) {
      issues.push(`turn-order.json: packages/${entry.owner} kennt den Turn-Kanal "${contract.turn}" nicht`);
    }
  }

  const profileName = activeProfile(ctx.root);
  if (!profileName) {
    issues.push('turn-order.json: kein aktives Profil in scripts.dev — die Reihenfolge ist nicht prüfbar');
  } else {
    const profile = resolveProfile(profileName, ctx.packages);
    issues.push(...profile.issues.map((issue) => `turn-order.json: Profil ${profileName}: ${issue}`));
    issues.push(...profileOrderIssues(contract, profile.bundles, profileName));

    const patch = parsePatchFile(join(root, 'profiles', profileName, 'cordis.patch.yml'));
    issues.push(...patch.issues.map((issue) => `turn-order.json: ${issue}`));
    const configs = new Map(patch.patches.filter((row) => typeof row.id === 'string').map((row) => [row.id, row.config ?? {}]));
    const byDir = new Map(ctx.packages.map((pkg) => [pkg.dir, pkg]));
    issues.push(
      ...participationIssues(contract, (owner) => {
        const pkg = byDir.get(owner);
        const entry = (contract.order ?? []).find((row) => row.owner === owner);
        return pkg === undefined ? undefined : decidedConfig(entry, pkg.want.id, configs);
      }),
    );
  }

  issues.push(...exclusiveIssues(contract, ctx.packages));
  for (const entry of contract.exclusive ?? []) {
    if (!existsSync(join(root, entry.source ?? ''))) issues.push(`turn-order.json: Quelle ${entry.source} fehlt (${entry.channel})`);
  }

  issues.push(...directRegistrationIssues(ctx.packages));

  for (const entry of contract.shared ?? []) {
    for (const owner of entry.owners ?? []) {
      const pkg = ctx.packages.find((candidate) => candidate.dir === owner);
      if (pkg === undefined) {
        issues.push(`turn-order.json: geteilter Kanal "${entry.channel}" nennt packages/${owner}, das es nicht gibt`);
        continue;
      }
      // Geteilte Kanäle werden oft über eine benannte Konstante registriert
      // (`ctx.on(INDEX_INJECT, …)`); hier zählt darum, ob der Host-Code des
      // Pakets den Kanal kennt. Die enge Regel (nur wörtliche Registrierung)
      // gilt für die Eigentumsfrage der EXKLUSIVEN Kanäle.
      if (!readsPackageChannel(pkg.base, entry.channel)) {
        issues.push(`turn-order.json: ${owner} ist als Zuhörer von "${entry.channel}" genannt, nennt ihn aber in keinem Host-Code`);
      }
    }
  }

  return issues;
}

/** Kennt irgendeine Host-Datei des Pakets den Kanal (eine benannte Konstante, kein Zufall)? */
function readsPackageChannel(base, channel) {
  const files = [join(base, 'index.js')];
  const assets = join(base, 'assets');
  if (existsSync(assets)) {
    for (const file of readdirSync(assets)) if (file.endsWith('.js')) files.push(join(assets, file));
  }
  return files.some((file) => existsSync(file) && readFileSync(file, 'utf8').includes(channel));
}
