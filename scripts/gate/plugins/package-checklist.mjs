/**
 * package-checklist — die vier Pflichten eines Pakets, an einer Stelle geprüft.
 *
 * T5-9: Die Liste stand bisher NIRGENDS. Wer ein Paket baut, fand sie erst, als
 * ein anderer Riegel rot wurde — `manifest` für die Datei, `patch` für den
 * Patch, `structure` für die Klasse, `dead-package` für das Profil, und die
 * Fähigkeitskarte kannte gar keinen Riegel. Dieses Plugin nennt alle vier
 * zusammen und beim Namen:
 *
 *   P1  `package.json` mit `name` + `cordis.patch.yml` — ohne sie lädt nichts.
 *   P2  eine Klasse in `docs/contracts/structure.json` — ohne sie wächst die
 *       Datei ohne Grenze.
 *   P3  Profil-Eintrag ODER `dsh.inactive: true` — sonst ist das Paket gebaut
 *       und unsichtbar.
 *   P4  mindestens eine Fähigkeit in `packages/prompter/assets/capabilities.json`
 *       mit `owner: <dir>` — sonst weiß niemand, welche Frage es beantwortet.
 *
 * P5/P6 (Kanon-Eintrag, nur bei eigenem Browser-Global) prüft `canon` bereits:
 * ein unregistriertes `__shinon…` ist dort rot. Deshalb steht es hier nicht
 * noch einmal — zwei Riegel für dieselbe Zusage wären zwei Wahrheiten.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

export const id = 'package-checklist';

const readJSON = (file) => JSON.parse(readFileSync(file, 'utf8'));

export function check(ctx) {
  const issues = [];
  const root = ctx.repo.ROOT;
  const profileName = ctx.repo.activeProfile(ctx.root);
  const profileFile = join(root, 'profiles', profileName, 'package.json');
  const profile = existsSync(profileFile) ? readJSON(profileFile) : null;
  const bundles = profile?.dsh?.profile?.bundles ?? [];
  if (profile === null) issues.push(`Profiles/${profileName}/package.json fehlt — P3 ist nicht prüfbar`);

  const structureFile = join(root, 'docs', 'contracts', 'structure.json');
  const structure = existsSync(structureFile) ? readJSON(structureFile) : { klassen: [] };
  const capabilityFile = join(root, 'packages', 'prompter', 'assets', 'capabilities.json');
  const capabilities = existsSync(capabilityFile) ? readJSON(capabilityFile).capabilities ?? [] : [];
  const owners = new Set(capabilities.map((entry) => entry.owner));

  for (const pkg of ctx.packages) {
    const dir = join(root, 'packages', pkg.dir);
    const manifest = pkg.manifest ?? {};
    if (typeof manifest.name !== 'string' || manifest.name === '') {
      issues.push(`packages/${pkg.dir}: P1 package.json ohne name`);
    }
    if (!existsSync(join(dir, 'cordis.patch.yml'))) {
      issues.push(`packages/${pkg.dir}: P1 cordis.patch.yml fehlt`);
    }
    const hostEntry = `packages/${pkg.dir}/index.js`;
    if (!structure.klassen?.some((klasse) => new RegExp(klasse.muster).test(hostEntry))) {
      issues.push(`packages/${pkg.dir}: P2 keine Klasse in docs/contracts/structure.json für ${hostEntry}`);
    }
    const inactive = manifest.dsh?.inactive === true;
    if (!inactive && !bundles.includes(manifest.name)) {
      issues.push(`packages/${pkg.dir}: P3 weder im Profil ${profileName} noch \`dsh.inactive: true\``);
    }
    if (!owners.has(pkg.dir)) {
      issues.push(`packages/${pkg.dir}: P4 keine Fähigkeit mit owner "${pkg.dir}" in packages/prompter/assets/capabilities.json`);
    }
  }
  return issues;
}
