#!/usr/bin/env node
/**
 * learn.mjs — die Freigabe-, Undo- und Curator-Flaeche der Lernpruefung
 * (SH-LEARN-04/06).
 *
 * WARUM EIN BEFEHL UND KEIN LISTENER: die Pruefung selbst laeuft im Host
 * (`packages/prompter/assets/learning-review.js`) und legt Vorschlaege in
 * `.shinon/learning-proposals.json`. Was ein MENSCH entscheidet, ist ein
 * ausdruecklicher Akt — und ein Befehl mit Exit-Code ist nachpruefbar, ein
 * Hintergrundlauf nicht. Dieselbe Begruendung wie bei `notes-check.mjs`.
 *
 * Die Trennung bleibt auch hier: Skills schreibt der Skill-Writer
 * (`skill-lifecycle.js`), Memory schreibt die Persona. Der Befehl kann deshalb
 * NUR Skills anwenden und zuruecknehmen; ein Memory-Vorschlag wird mit dem
 * Namen der zustaendigen Route abgewiesen statt an ihr vorbei geschrieben.
 *
 * Benutzung (Exit 0 = getan, 1 = Befund/verweigert, 2 = Bedienfehler):
 *   node scripts/learn.mjs status
 *   node scripts/learn.mjs list [--all] [--json]
 *   node scripts/learn.mjs show <id>
 *   node scripts/learn.mjs approve <id>
 *   node scripts/learn.mjs reject <id>
 *   node scripts/learn.mjs undo <id>
 *   node scripts/learn.mjs usage [--json]
 *   node scripts/learn.mjs curate [--apply|--dry-run] [--force] [--json]
 *   node scripts/learn.mjs restore <name>
 *   node scripts/learn.mjs pin <name> | unpin <name> | adopt <name>
 * Gemeinsam: `--root <dir>` (Vorgabe: Arbeitsverzeichnis).
 */
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { createSkillWriter, loadLifecycleRules } from '../packages/prompter/assets/skill-lifecycle.js';
import { loadLearningRules } from '../packages/prompter/assets/learning-review.js';
import { pendingProposals, setProposal } from '../packages/prompter/assets/learning-proposal.js';
import { markSkill, readRegistry, readUsage, withLock, writeRegistry, writeUsage } from '../packages/prompter/assets/learning-store.js';
import { archiveSkills, curateSkills, readJournals, readSkills, restoreArchive, stampCuration } from '../packages/prompter/assets/learning-curator.js';

const QUIET = { log: () => {}, warn: (message) => console.error(message) };
const MEMORY_HINT = 'Memory schreibt nur die Persona: POST /shinon/persona/review {id, decision} (oder "revoked" zum Zuruecknehmen).';

/** Die Argumente: Positionen und Schalter, keine zweite Grammatik. */
function parseArgs(argv) {
  const positionals = [];
  const flags = { json: false, all: false, apply: false, dryRun: false, force: false, root: process.cwd() };
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === '--json') flags.json = true;
    else if (value === '--all') flags.all = true;
    else if (value === '--apply') flags.apply = true;
    else if (value === '--force') flags.force = true;
    // `--dry-run` ist die ausdrueckliche Form der Vorgabe: `curate` archiviert
    // nur mit `--apply`. Der Schalter wird angenommen und schaltet nichts ein —
    // ein Bedienfehler waere hier eine Ueberraschung, keine Sicherheit.
    else if (value === '--dry-run') flags.dryRun = true;
    else if (value === '--root') {
      const next = argv[index + 1];
      if (next === undefined) throw new Error('--root braucht ein Verzeichnis');
      flags.root = resolve(next);
      index += 1;
    } else if (value.startsWith('--')) throw new Error(`unbekannter Schalter: ${value}`);
    else positionals.push(value);
  }
  return { positionals, flags };
}

function main() {
  let parsed;
  try {
    parsed = parseArgs(process.argv.slice(2));
  } catch (error) {
    console.error(`learn: ${error.message}`);
    return 2;
  }
  const { positionals, flags } = parsed;
  const [command = 'status', ...rest] = positionals;
  const root = flags.root;

  const lifecycleRules = loadLifecycleRules();
  const learningRules = loadLearningRules();
  const writer = createSkillWriter({ rules: lifecycleRules, noteRules: {}, root, log: QUIET });
  const registryPath = resolve(root, learningRules.registry.path);
  const usagePath = resolve(root, learningRules.usage.path);
  const skillsRoot = resolve(root, lifecycleRules.root.dir);
  const archiveRoot = resolve(root, '.shinon', 'learning-archive');

  /** Lesen, anfassen, schreiben — mit Lock, damit Host und Befehl sich nicht ueberschreiben. */
  const update = (id, patch) => withLock(`${registryPath}.lock`, () => {
    const { registry, reason } = readRegistry(registryPath, { log: QUIET });
    if (reason !== null) return { ok: false, reason };
    const next = setProposal(registry, id, patch);
    if (!next.ok) return next;
    writeRegistry(registryPath, next.registry);
    return { ok: true, entry: next.registry.entries[id] };
  });

  const entries = () => Object.values(readRegistry(registryPath, { log: QUIET }).registry.entries ?? {})
    .sort((left, right) => String(left.createdAt ?? '').localeCompare(String(right.createdAt ?? '')) || String(left.id).localeCompare(String(right.id)));

  const find = (id) => entries().find((entry) => entry.id === id) ?? null;

  switch (command) {
    case 'status': {
      const all = entries();
      const counts = { pending: 0, applied: 0, 'auto-applied': 0, blocked: 0, rejected: 0, undone: 0 };
      for (const entry of all) counts[entry.status] = (counts[entry.status] ?? 0) + 1;
      const usage = readUsage(usagePath, { log: QUIET }).usage;
      const report = {
        root,
        registry: registryPath,
        entries: all.length,
        ...counts,
        skills: Object.keys(usage.skills ?? {}).length,
      };
      if (flags.json) console.log(JSON.stringify(report, null, 2));
      else {
        console.log(`Register: ${registryPath}`);
        console.log(`${report.entries} Eintraege — ${counts.pending} offen, ${counts.applied} angewendet, ${counts['auto-applied']} automatisch, ${counts.blocked} blockiert, ${counts.undone} zurueckgenommen`);
        console.log(`Nutzung: ${report.skills} Skills in ${usagePath}`);
      }
      return 0;
    }
    case 'list': {
      const all = entries();
      const shown = flags.all ? all : pendingProposals(readRegistry(registryPath, { log: QUIET }).registry);
      if (flags.json) {
        console.log(JSON.stringify(shown, null, 2));
        return 0;
      }
      if (shown.length === 0) {
        console.log(flags.all ? 'Kein Eintrag.' : 'Kein offener Vorschlag.');
        return 0;
      }
      for (const entry of shown) {
        console.log(`${entry.id}  ${entry.target.padEnd(6)} ${entry.status.padEnd(12)} ${entry.owner ?? entry.payload?.name ?? entry.payload?.subject ?? ''}`);
        console.log(`  ${entry.reason ?? '(ohne Begruendung)'}`);
        const sources = Array.isArray(entry.sources) ? entry.sources.map((source) => source?.ref ?? source).join(', ') : '';
        if (sources !== '') console.log(`  Quellen: ${sources}`);
      }
      return 0;
    }
    case 'show': {
      const id = rest[0];
      if (id === undefined) { console.error('learn: show braucht eine Id'); return 2; }
      const entry = find(id);
      if (entry === null) { console.error(`learn: ${id} unbekannt`); return 1; }
      console.log(JSON.stringify(entry, null, 2));
      return 0;
    }
    case 'approve': {
      const id = rest[0];
      if (id === undefined) { console.error('learn: approve braucht eine Id'); return 2; }
      const entry = find(id);
      if (entry === null) { console.error(`learn: ${id} unbekannt`); return 1; }
      if (entry.status !== 'pending' && entry.status !== 'blocked') {
        console.error(`learn: ${id} ist ${entry.status} — nur offene oder blockierte Vorschlaege lassen sich freigeben`);
        return 1;
      }
      if (entry.target === 'memory') {
        console.error(`learn: ${id} ist ein Memory-Vorschlag. ${MEMORY_HINT}`);
        return 1;
      }
      // Die Freigabe ersetzt die Belegschwelle, nicht die Pruefung: `apply`
      // prueft Form, Zustand und Basis-Hash erneut (Version conflict = KONFLIKT).
      const applied = writer.apply(entry, { evidence: entry.evidence ?? { kind: 'correction', session: null, ref: 'cli' } });
      if (applied.ok !== true) {
        update(id, { status: 'blocked', decision: { by: 'human', at: new Date().toISOString(), via: 'cli' } });
        console.error(`learn: ${id} nicht angewendet (${applied.reason ?? applied.verdict})`);
        return 1;
      }
      const written = update(id, {
        status: 'applied',
        decision: { by: 'human', at: new Date().toISOString(), via: 'cli' },
        undo: { kind: 'skill', ...applied, owner: applied.owner ?? entry.owner ?? null },
      });
      if (!written.ok) { console.error(`learn: Register nicht geschrieben (${written.reason})`); return 1; }
      console.log(`${applied.verdict} -> ${applied.path} (Sicherung ${applied.backup})`);
      return 0;
    }
    case 'reject': {
      const id = rest[0];
      if (id === undefined) { console.error('learn: reject braucht eine Id'); return 2; }
      const entry = find(id);
      if (entry === null) { console.error(`learn: ${id} unbekannt`); return 1; }
      if (entry.status !== 'pending' && entry.status !== 'blocked') {
        console.error(`learn: ${id} ist ${entry.status}`);
        return 1;
      }
      const written = update(id, { status: 'rejected', decision: { by: 'human', at: new Date().toISOString(), via: 'cli' } });
      if (!written.ok) { console.error(`learn: Register nicht geschrieben (${written.reason})`); return 1; }
      console.log(`${id} abgelehnt.`);
      return 0;
    }
    case 'undo': {
      const id = rest[0];
      if (id === undefined) { console.error('learn: undo braucht eine Id'); return 2; }
      const entry = find(id);
      if (entry === null) { console.error(`learn: ${id} unbekannt`); return 1; }
      if (entry.undo?.kind === 'memory' || entry.target === 'memory') {
        console.error(`learn: ${id} ist eine Memory-Auflage. ${MEMORY_HINT}`);
        return 1;
      }
      if (entry.status !== 'applied' && entry.status !== 'auto-applied') {
        console.error(`learn: ${id} ist ${entry.status} — nur eine angewendete Aenderung laesst sich zuruecknehmen`);
        return 1;
      }
      const undone = writer.undo(entry.undo);
      if (undone.ok !== true) {
        console.error(`learn: ${id} nicht zurueckgenommen (${undone.reason})`);
        return 1;
      }
      const written = update(id, { status: 'undone', decision: { ...(entry.decision ?? {}), undoneAt: new Date().toISOString(), via: 'cli' } });
      if (!written.ok) { console.error(`learn: Register nicht geschrieben (${written.reason})`); return 1; }
      console.log(`${undone.mode}: ${undone.path}`);
      return 0;
    }
    case 'usage': {
      const usage = readUsage(usagePath, { log: QUIET }).usage;
      const rows = Object.entries(usage.skills ?? {})
        .map(([name, record]) => ({ name, loads: record?.loads ?? 0, lastLoad: record?.lastLoad ?? null, pinned: record?.pinned === true }))
        .sort((left, right) => right.loads - left.loads || left.name.localeCompare(right.name));
      if (flags.json) { console.log(JSON.stringify({ contract: usage.contract, skills: rows }, null, 2)); return 0; }
      if (rows.length === 0) { console.log(`Keine Zaehlung (${usagePath}).`); return 0; }
      for (const row of rows) console.log(`${String(row.loads).padStart(4)}  ${row.pinned ? '*' : ' '} ${row.name.padEnd(40)} ${row.lastLoad ?? '(nie)'}`);
      return 0;
    }
    case 'curate': {
      const curator = learningRules.curator ?? {};
      const usage = readUsage(usagePath, { log: QUIET });
      const skills = readSkills(skillsRoot, lifecycleRules.root.file);
      // AUTONOM: `autoApply` in den Regeln heisst, der faellige Lauf verschiebt
      // ohne `--apply`. `--dry-run` ist der ausdrueckliche Blick ohne Folge.
      const apply = flags.dryRun !== true && (flags.apply || curator.autoApply !== false);
      const stamp = new Date().toISOString();
      const plan = curateSkills({ skills, usage: usage.usage, rules: curator, force: flags.force, now: stamp });
      const report = { ...plan, root: skillsRoot, archiveRoot, applied: null };
      if (apply && plan.archive.length > 0) {
        report.applied = archiveSkills({ names: plan.archive, skillsRoot, archiveRoot, now: stamp, log: QUIET });
      }
      if (apply) writeUsage(usagePath, stampCuration(usage.usage, stamp));
      if (flags.json) { console.log(JSON.stringify(report, null, 2)); return plan.archive.length === 0 || apply ? 0 : 1; }
      console.log(`${skills.length} gelernte Skills in ${skillsRoot}`);
      if (plan.findings.length === 0) console.log('Kein Befund.');
      for (const finding of plan.findings) console.log(`  ${finding.kind.padEnd(13)} ${finding.name.padEnd(32)} ${finding.action.padEnd(11)} ${finding.detail}`);
      for (const skip of plan.skipped) console.log(`  (uebersprungen) ${skip.name}: ${skip.reason}`);
      if (plan.archive.length > 0 && !apply) console.log(`\n${plan.archive.length} zur Archivierung: node scripts/learn.mjs curate`);
      if (report.applied !== null && report.applied !== undefined) {
        console.log(report.applied.ok
          ? `Archiviert: ${report.applied.moved.map((entry) => entry.name).join(', ')} -> ${report.applied.journal}`
          : `Archiv unvollstaendig (${report.applied.reason ?? report.applied.refused?.map((item) => `${item.name}:${item.reason}`).join(',')})`);
      }
      return plan.archive.length === 0 || apply ? 0 : 1;
    }
    case 'pin':
    case 'unpin':
    case 'adopt': {
      // Herkunft und Schutz sind ZUSTAND, kein Kommentar: was ein Mensch einmal
      // gepinnt oder uebernommen hat, steht in der Nutzungsdatei und ueberlebt
      // den naechsten Lauf. Ein Name, ein Befehl, ein Exit-Code.
      const name = rest[0];
      if (name === undefined) { console.error(`learn: ${command} braucht einen Namen`); return 2; }
      if (!existsSync(join(skillsRoot, name))) { console.error(`learn: ${name} liegt nicht in ${skillsRoot}`); return 1; }
      const patch = command === 'pin' ? { pinned: true, origin: 'manual' }
        : command === 'adopt' ? { pinned: false, adopted: true }
          : { pinned: false };
      const current = readUsage(usagePath, { log: QUIET });
      writeUsage(usagePath, markSkill(current.usage, name, patch, { maxEntries: learningRules.usage.maxEntries }));
      console.log(`${name}: ${command === 'pin' ? 'gepinnt' : command === 'adopt' ? 'uebernommen (der Curator darf ihn verwalten)' : 'nicht mehr gepinnt'}`);
      return 0;
    }
    case 'restore': {
      const name = rest[0];
      if (name === undefined) { console.error('learn: restore braucht einen Namen'); return 2; }
      const restored = restoreArchive({ name, archiveRoot, skillsRoot, log: QUIET });
      if (restored.ok !== true) { console.error(`learn: ${name} nicht zurueckgeholt (${restored.reason})`); return 1; }
      console.log(`wiederhergestellt: ${restored.path}`);
      return 0;
    }
    case 'archive': {
      const journals = readJournals(archiveRoot, { log: QUIET });
      if (journals.length === 0) { console.log('Kein Archiv.'); return 0; }
      for (const { dir, journal } of journals) {
        console.log(`${dir} (${journal.moved.length})`);
        for (const entry of journal.moved) console.log(`  ${entry.name}`);
      }
      return 0;
    }
    default:
      console.error(`learn: unbekannter Befehl "${command}"`);
      return 2;
  }
}

// Ein Befehl, ein Exit-Code: das Skript ist die Flaeche, kein Modul mit Nebenweg.
process.exit(main());
