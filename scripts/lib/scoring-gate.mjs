/**
 * scoring-gate.mjs — Eigentuemer: der Ablauf der Scoring-Prüfungen.
 *
 * Das Plugin `scripts/gate/plugins/scoring.mjs` ist die Fassade (id, check,
 * Fläche); dieser Ablauf lädt die Verträge des Pakets, sammelt die Befunde der
 * beiden Eigentümer (`scoring-contracts.mjs`, `scoring-rules.mjs`) und prüft die
 * Aktivierung im Profil. Die Richtung ist Fassade → Teil; diese Datei importiert
 * das Plugin nie.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  contractIssues,
  signalRuleIssues,
  tendencyRuleIssues,
} from './scoring-contracts.mjs';
import {
  outcomeIssues,
  readSources,
  scopeIssues,
  staticIssues,
} from './scoring-rules.mjs';

export function scoringCheck(ctx) {
  const pkg = ctx.packages.find((candidate) => candidate.dir === 'scoring');
  if (!pkg) return ['packages/scoring/ fehlt (Scoring-Schicht nicht vorhanden)'];

  const issues = [];
  const load = (full, display, label) => {
    if (!existsSync(full)) {
      issues.push(`${display} fehlt (${label})`);
      return null;
    }
    try {
      return JSON.parse(readFileSync(full, 'utf8'));
    } catch (error) {
      issues.push(`${display} ist kein gültiges JSON: ${error.message}`);
      return null;
    }
  };
  const own = (rel, label) => load(join(pkg.base, rel), `packages/scoring/${rel}`, label);

  const scoring = own('assets/scoring-state.json', 'Scorecard-Vertrag');
  const profile = own('assets/technical-profile.json', 'Technik-Profil');
  const triggerDoc = own('assets/skill-triggers.json', 'Skill-Trigger');
  const rules = own('assets/signal-rules.json', 'Signaltabelle (K5)');
  const tendencyRules = own('assets/tendency-rules.json', 'Tendenz-Regeln (Zug 3)');
  const eventsPkg = ctx.packages.find((candidate) => candidate.dir === 'events');
  let spine = null;
  if (!eventsPkg) {
    issues.push('packages/events/ fehlt (Spine als Referenz fehlt)');
  } else {
    spine = load(join(eventsPkg.base, 'assets/event-spine.json'), 'packages/events/assets/event-spine.json', 'Spine-Vertrag');
  }

  const sources = readSources(pkg.base);
  if (!sources.some((entry) => entry.file.endsWith('index.js'))) {
    issues.push('packages/scoring/index.js fehlt');
  } else {
    issues.push(...staticIssues(sources));
    issues.push(...scopeIssues(sources));
  }

  if (scoring && profile && triggerDoc && spine) {
    issues.push(...contractIssues(scoring, profile, triggerDoc, spine, 'assets/scoring-state.json'));
  }

  if (spine && rules && scoring) {
    issues.push(...signalRuleIssues(rules, scoring, spine, 'assets/signal-rules.json'));
  }

  if (tendencyRules && rules && scoring) {
    issues.push(...tendencyRuleIssues(tendencyRules, rules, scoring, 'assets/tendency-rules.json'));
  }

  issues.push(...outcomeIssues(sources));

  // Profil muss das Bundle aktivieren, sonst läuft das Scoring nie.
  const profileName = ctx.repo.activeProfile(ctx.root);
  if (profileName && !profileName.startsWith('create:')) {
    const resolved = ctx.repo.resolveProfile(profileName, ctx.packages);
    if (!(resolved.bundles ?? []).includes('@shinon/scoring')) {
      issues.push(`Profil ${profileName}: @shinon/scoring ist nicht in dsh.profile.bundles`);
    }
  }

  return issues;
}
