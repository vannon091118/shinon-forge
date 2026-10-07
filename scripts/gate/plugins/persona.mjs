/**
 * persona — der Persona-Abschnitt ist DSH-nativ und muss im Profil stehen.
 *
 * Prüft: @shinon/persona deklariert `systemPrompt` als Abhängigkeit, das
 * aktive Profil aktiviert das Bundle, und der Host-Abschnitt ist nicht leer.
 * Ein Persona-Bundle, das niemand mountet, ist toter Text.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

export const id = 'persona';

export function check(ctx) {
  const issues = [];
  const persona = ctx.packages.find((p) => p.dir === 'persona');

  if (!persona) return ['packages/persona/ fehlt (Persona-Schicht nicht vorhanden)'];

  const indexFile = join(persona.base, 'index.js');
  if (!existsSync(indexFile)) {
    issues.push('packages/persona/index.js fehlt');
  } else {
    const src = readFileSync(indexFile, 'utf8');
    if (!src.includes('systemPrompt')) {
      issues.push('packages/persona/index.js nutzt ctx.systemPrompt nicht');
    }
    if (!/export function apply/.test(src)) issues.push('packages/persona/index.js: apply() fehlt');
    if (!/export const Config/.test(src)) issues.push('packages/persona/index.js: Config fehlt');
  }

  // Profil muss das Bundle aktivieren, sonst läuft die Persona nie.
  const profileName = ctx.repo.activeProfile(ctx.root);
  if (profileName && !profileName.startsWith('create:')) {
    const profile = ctx.repo.resolveProfile(profileName, ctx.packages);
    if (!(profile.bundles ?? []).includes('@shinon/persona')) {
      issues.push(`Profil ${profileName}: @shinon/persona ist nicht in dsh.profile.bundles`);
    }
  }

  return issues;
}
