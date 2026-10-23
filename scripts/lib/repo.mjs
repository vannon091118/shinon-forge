/**
 * repo.mjs — Fassade: eine Quelle für Discovery und Validierung des Repositories.
 *
 * Der CODE steht in den Eigentümer-Modulen (kein Zyklus, jede Datei unter
 * ihrer Klassengrenze); hier stehen nur die Namen, Name für Name:
 *
 *   repo-basis.mjs     Wurzel, Konstanten, Lesen
 *   repo-pakete.mjs    Paket-Entdeckung und Paket-Prüfung
 *   repo-legacy.mjs    Altlast- und pnpm-Invariante
 *   repo-zwillinge.mjs Quell-Zwillinge
 *   repo-seam.mjs      Naht-Spiegel-Riegel
 *   repo-profil.mjs    Profil- und Bundle-Auflösung
 *
 * Genutzt von scripts/dsh-test.mjs (Gate), scripts/build.mjs (Pipeline) und
 * scripts/validate-test.mjs (Regel-Fixtures), damit alle dieselben Verträge
 * prüfen und nicht auseinanderdriften.
 *
 * Namensvertrag - alle Quellen müssen denselben Namen führen:
 *
 *   Quelle                                  Feld    erwarteter Wert
 *   packages/<dir>/package.json             name    @shinon/<dir>
 *   packages/<dir>/cordis.patch.yml         id      shinon-<dir>
 *   packages/<dir>/cordis.patch.yml         name    @shinon/<dir>
 *   packages/<dir>/client.js                id      @shinon/<dir>   (ModuleLoader)
 *   profiles/<profil>/package.json          bundles @shinon/<dir> je aktiviertem Paket
 *
 * Geprüfte Regeln:
 *   Manifest    Exports-Ziele, dsh.bundle.patch, dsh.client.platform, peer+dev,
 *               unbekannte dsh-Felder
 *   Patch       YAML-Schema der DSH-Loader-Patches: Struktur, Typen, required
 *               keys, unbekannte Keys (näher an DSH als die frühere Regex-Prüfung)
 *   Ressourcen  jede Referenz aus Manifest und Patch-Config existiert, ist eine
 *               Datei, liegt im Paket und parst in ihrem Format
 *   Komposition Profil-Manifest, doppelte insert-ids über alle Layer, azyklischer
 *               Paketgraph
 *   Idiome      generierte Plugin-Bausteine deckungsgleich mit ihrer einen Quelle
 *               (scripts/lib/plugin-idioms.mjs) — und keine Kopie daneben
 */
import { idiomIssues } from './plugin-idioms.mjs';

// Generierte Plugin-Bausteine (settings-Registrierung, Locale-Fallback): sie stehen
// EINMAL in scripts/lib/plugin-idioms.mjs und liegen als markierte Ableitung in den
// Paketen. Wer die Quelle ändert, schreibt mit `npm run idioms` nach; geprüft wird hier.
export { idiomIssues };

export {
  PACKAGES_DIR,
  PROFILES_DIR,
  ROOT,
  RUNTIME_FILES,
  SHARED_DEPS,
  read,
  readJSON,
  readRoot,
  readYaml,
} from './repo-basis.mjs';
export {
  ARTIFACT_SKIP,
  artifactFiles,
  clientIssues,
  copyArtifacts,
  composeIssues,
  contractIssues,
  dependencyIssues,
  discover,
  expected,
  indexIssues,
  manifestIssues,
  parsePatchFile,
  patchIssues,
  resourceIssues,
  resourceRefs,
  syntaxIssues,
} from './repo-pakete.mjs';
export {
  LEGACY_SCAN_EXTENSIONS,
  PNPM_ARTIFACTS,
  legacyHits,
  pnpmIssues,
  walkFiles,
} from './repo-legacy.mjs';
export { SOURCE_TWINS, twinIssues } from './repo-zwillinge.mjs';
export { SEAM_CORE, SEAM_INVENTORY, hostMirrorIssues } from './repo-seam.mjs';
export {
  activeProfile,
  bundleResolutionIssues,
  configShapeIssues,
  dshInstanceIssues,
  foreignBundleTarget,
  profileInstallIssues,
  repoIssues,
  resolveProfile,
} from './repo-profil.mjs';
