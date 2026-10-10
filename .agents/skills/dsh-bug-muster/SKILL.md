---
name: dsh-bug-muster
description: Haeufige Bug-Klassen im Shinon-Forge/DSH/Cordis-Stack mit Symptom, Mechanismus und Workaround - Namensvertrags-Drift, Loader-Fallen, Fiber-Walk, Realm-Grenzen, Test-Masken, Teardown. Nutzen beim Debugging oder wenn Tests gruen sind, aber die Laufzeit nicht. Quellen: docs/research/2026-10-09-cordis-dsh-recherche.md (dieses Ziel gibt es in diesem Baum nicht - offener Posten, STAND §6.4).
---

# Bug-Katalog DSH/Cordis — Symptom → Mechanismus → Workaround

Jede Klasse ist real aufgetreten (Repo-Pitfalls, DSH-Post-Mortems 0001–0004,
`defensive-patterns.md`). Erst hier gegenhalten, dann neu forschen.

## B1. `export default` verschluckt `inject`
**Symptom:** Crash beim Laden/erstem Call: `cannot get property "X" without inject`,
obwohl `inject` im Code steht. **Mechanismus:** `Loader.unwrapExports` bevorzugt
`exports.default`; ein mitexportiertes `export default apply` wirft die
Namespace-Exports (`name`, `inject`, `Config`) weg (Post-Mortem 0001).
**Workaround:** genau eine Export-Form — Namespace (`export const inject`, `export
function apply`) OHNE `export default`. **Guard:** Test über den realen
Loader-/Exportpfad; handgemontierte `ctx.plugin({…})`-Tests sehen das nie.

## B2. Optionaler Service wirft durch Shadow-Walk
**Symptom:** `cannot get property "Y" without inject` für einen Service, der existiert
und bewusst NICHT in `inject` steht. **Mechanismus:** der Property-Proxy macht einen
**ancestor-only** Fiber-Walk; aus einem fremden Fiber (Shadow) findet er
Geschwister-Services nicht (Post-Mortem 0001, Bug 2). **Workaround:**
`ctx.get('y')` statt `ctx.y` — topologieunabhängig, strict.
**Falle im Test:** Top-Level-Aufrufe umgehen den Walk (`fiber.runtime === null`) —
der Test lügt grün.

## B3. `provide` auf Root feuert kein `inject`
**Symptom:** Service ist provide-d, ein Plugin mit `inject` darauf startet nie / sieht
ihn nicht. **Mechanismus:** `ctx.provide` auf einem Root-Context feuert das
`ctx.inject` eines Geschwister-Fibers nicht (gemessene Repo-Falle).
**Workaround:** provide aus einem Plugin-Fiber heraus.

## B4. `ctx.dispose` existiert nicht
**Symptom:** `ctx.dispose is not a function` beim Aufräumen.
**Mechanismus:** Cordis-Context hat kein `dispose`; die Einheit ist der Fiber.
**Workaround:** `ctx.fiber.dispose()`; eigene Registrierungen über `ctx.effect`/
Rückgabe von `apply` — dann ist automatisches Teardown gratis.

## B5. Namensvertrags-Drift
**Symptom:** Gate rot (`name contract`) oder Bundle lädt nicht.
**Mechanismus:** ein Paket heißt an vier Stellen dasselbe — `package.json` `name`,
`cordis.patch.yml` `id`/`name`, `client.js` ModuleLoader-id, Profil-Bundles; plus
`profiles/<p>/cordis.patch.yml` `id`/`name`. **Workaround:** Ordner `packages/<dir>/`
ist die Wahrheit, alles ableiten (`expected(dir)` in `scripts/lib/repo.mjs`); Rename =
Ordner + Spiegel. Verträge nur in `scripts/lib/repo.mjs` ändern, nie in
`dsh-test.mjs`/`build.mjs`.

## B6. Literal-Drift an der Client->Host-Naht
**Symptom:** RPC-Richtung „schlägt fehl" ohne Log-Fehler / Drift-Test rot.
**Mechanismus:** das Client-Bundle kann `assets/uebergabe.js` nicht importieren und
trägt die Namen als Literale — zwei Wahrheiten driften.
**Workaround:** Namen nur in `uebergabe.js` ändern, Literale in `client.js` und die
zeichenweise Assertion in `test/uebergabe.test.mjs` nachziehen; Naht wächst →
Assertion erweitern, nie still ändern.

## B7. Realm/Prototype-Grenze (Typert)
**Symptom:** gültiges JSON wird abgelehnt („not a plain object"), obwohl es eines ist.
**Mechanismus:** Typert validiert mit `Object.getPrototypeOf(value)` gegen SEIN
`Object.prototype` — Werte aus einem anderen Realm (z. B. `vm`) fallen durch.
**Workaround:** Carrier an der Realm-Kante serialisieren (wie ein echter Transport);
`vm`-gebaute Werte nie direkt durchreichen.

## B8. Schemastery-Fallen
**Symptom:** Config-Schema crasht beim Boot / Enum-Wert nicht akzeptiert.
**Mechanismus:** Schemastery 3.18.4 hat kein `z.enum`. **Workaround:**
`z.union([z.const('a'), z.const('b')])`; API der deklarierten Version nutzen.
**Drift-Risiko:** Patch-Werte werden nur strukturell geprüft, nicht gegen das
Paket-Schema — Schema-Änderungen manuell gegen die Patch-Werte halten.

## B9. `!!js`-Literals mit Seiteneffekt
**Symptom:** Feature ist dauerhaft tot/aus, ohne dass Code es sagt.
**Mechanismus:** der Include-Loader interpoliert `config`/`disabled` aus `!!js`-
Ausdrücken; ein literales Objekt wurde als Ausdruck gelesen und deaktivierte
Filesystem-Tools permanent (Post-Mortem 0002); das Gate prüft `!!js` nicht.
**Workaround:** `!!js` nur für Umgebungs-Overlays; nach Patch-Änderungen
`dsh --profile shinon --dump-config` und die Werte lesen.

## B10. Test-Masken: grün, aber nicht wie ausgeliefert
**Symptom:** Suite grün, Feature im echten Boot tot (178 grüne Tests, 100 % Coverage,
tot — Post-Mortem 0001). **Mechanismus:** Tests montierten das Plugin von Hand
(`ctx.plugin({name, inject, apply})`) und umgingen Loader, Export-Form und
Fiber-Topologie; key-gated Tests wurden in CI übersprungen; ein stale `lib/`
befriedigte die Modul-Auflösung. **Workarounds:**
- mindestens ein Test über den **realen Einstiegspfad** (Loader/Profil/Install);
- Headline-Operation ohne Modell-Key testen, damit sie in CI läuft;
- isoliert installieren (`pack-test.mjs`), stale Builds ausschließen;
- Coverage beweist nur, dass Zeilen liefen.

## B11. Dispose erreicht keine Ruhe
**Symptom:** Zombie-Prozesse, späte Kompletionen schreiben in toten State,
Doppel-Errors beim Reload. **Mechanismus:** Teardown schickt Kills, returniert aber
vor dem Stop; Listener feuern nach dem Kill. **Workaround (defensive-patterns.md):**
Cleanup async, Kinder abwarten (kill → await `done`), Listener/Registries **vor**
dem Kill schließen. Callback-Exceptions im Dispatcher auffangen — ein schlechter
Subscriber darf den Kern-Lifecycle nicht brechen.

## B12. Orthogonale Outcomes verschachtelt
**Symptom:** abgebrochener Lauf sieht wie Erfolg aus (oder umgekehrt).
**Mechanismus:** timeout, signal, exitCode sind gleichzeitig möglich; ein Flag wurde
im Branch des anderen gemeldet. **Workaround:** jede unabhängige Tatsache eigenständig
melden (`timedOut`, `signal`, `exitCode`). Dazu: Async-State nie als Ergebnis einer
konkreten Nachricht lesen (`whenIdle()` ≠ „Nachricht X fertig"); „nichts zu warten"
explizit behandeln, sonst Hang.

## B13. Untrusted Output & Pfade
**Symptom:** Secrets in Logs/Spill-Dateien; Symlink-Race; `ERR_FS_EISDIR` auf
Windows-Junction. **Workaround:** gescrubbte Env für Subprozesse
(`*KEY*`/`*SECRET*`/`*TOKEN*`/`*PASSWORD*`); Temp/Spill in privatem 0700-Dir mit
Zufallsnamen und `'wx'`; link-förmige Pfade mit `lstat`+`unlink`, `rmSync` rekursiv
nur für echte Verzeichnisse.

## B14. Build-/Tooling-Fallen (dieses Repo)
- **`dsh-mod` in Runtime-Artefakten** → Legacy-Guard rot; String kommt nirgends vor.
- **Root-Install nicht reproduzierbar** (npm-Lockfile, aber pnpm-Install, kein
  `pnpm-workspace.yaml`) — Ergebnisse von `pack-test`/`npm test` im Zweifel zweimal
  laufen lassen; Lockfile nicht „nebenbei" upgraden.
- **`dist/` ist generiert** — nie handeditieren, `npm run build` regeneriert alles.
- **Reload-Helfer sind entfallen** (2026-10-10 gelöscht: drei Dateien, null Aufrufer, veraltetes `web`-Ziel) — HMR läuft über den DSH-Prozess selbst.
- **`scripts/dsh-update.mjs`** prüft die Registry echt (Maximum nach Semver) und installiert
  ins kanonische Profil — offline meldet er UNGEPRÜFT statt „keine Updates“; der
  Install-Pfad selbst lief live noch nie (ausdrücklich als ungeprüft markiert).
- **`git status` ist seit 2026-10-10 sauber vercommittet** — davor galt: die Arbeitsdateien sind wahr.

## Erste Diagnoseschritte bei unklarem Fehler
1. Fehlermeldung gegen B1–B4 (Cordis-Inject/Fiber) prüfen — das sind die häufigsten.
2. `node scripts/dsh-test.mjs` — Vertrag/Struktur (B5, B14).
3. `node --test packages/codingmon/test/uebergabe.test.mjs` — Naht (B6, B7).
4. Verdacht auf Loader/Boot → realer Pfad: `node scripts/dsh-profile-test.mjs`,
   `node scripts/pack-test.mjs` (B1, B9, B10).
5. Trace statt Theorie (Post-Mortem 0001): Fiber-Walk instrumentieren, echten
   Subprozess laufen lassen.
