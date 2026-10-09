# Online-Recherche: Cordis & DSH — Bug-Klassen und Architektur-Potenzial

Datum: 2026-10-09. Ziel: Quellen sichten, die Shinon Forge beim Entwickeln helfen —
typische Bugs und wie man die Cordis-Architektur ausreizt. Ergebnis sind drei Skills
unter `.agents/skills/` (dort liest DSHs `project-agents`-Skill-Provider und gängige
Agent-Werkzeuge); dieses Dokument hält die Quellen und Belege fest.

## Quellen

| Quelle | URL | Was sie liefert |
|---|---|---|
| DSH-Doku: Cordis Primer | https://deepseek-harness.github.io/deepseek-harness/reference/cordis-primer (Source: `docs/cordis-primer.md`) | Cordis in 5 Ideen, Dispatch-Modi, Wasserfall-Semantik, Loader-`!!js`, Praxisregeln |
| DSH-Doku: Cordis API | `docs/cordis-api/{context,service,events,fiber,registry,inherited}.md` | generierter Katalog: `ctx.effect`, `ctx.inject`, `ctx.isolate`, `ctx.intercept`, Fiber-API |
| DSH-Doku: Cordis-Tutorial | `docs/cordis-tutorial/01…07` (02 Lifecycle/Effects, 03 Services, 06 Composition/HMR) | praktischer Durchgang |
| DSH-Doku: Defensive Patterns | `docs/defensive-patterns.md` | Bug-Klassen-Regeln (Lifecycle, Teardown, Dispatcher, Env, Pfade) |
| DSH-Doku: Post-Mortems | `docs/postmortem/0001–0004` | echte Vorfälle mit Mechanismus + Guardrails |
| DSH-Doku: Testing | `docs/testing.md` | „test the real entry path", Coverage ≠ Verhalten |
| DSH-Doku: Skills-Subsystem | `docs/subsystems/skills.md` | Skill-Format: `<projectRoot>/.agents/skills/<name>/SKILL.md`, kebab-case, Frontmatter |
| Cordis Upstream | https://github.com/cordisjs/cordis (Monorepo, `packages/core`) | README verweist auf das DSH-Primer als offizielle Doku; Paper: arXiv 2608.25512 |
| npm `cordis` | https://registry.npmjs.org/cordis | Stand 2026-10: `4.0.0-rc.10`, „Meta-Framework for Modern Applications" |

Genutzt wurde die englische Doku (die `.zh.md`-Fassungen sind dasselbe); Stand der
Docs ist `master` von `deepseek-ai/deepseek-harness` und kann **neuer** sein als das
hier gepinnte DSH `0.2.1-alpha.1` — im Zweifel zählt der installierte Stand.

## Kernergebnisse

### 1. Cordis in fünf Ideen (Primer)

1. Ein Plugin ist ein Objekt, das `Service` implementiert: Funktion mit optionalen
   Feldern `inject` + `apply(ctx)`, oder `Service`-Subklasse.
2. Ein Context ist ein Service-Repository: stabile `ctx.<key>`-Slots
   (`ctx.tools`, `ctx.llm`, …), Suche über den Key statt über Import.
3. `inject` deklariert Abhängigkeiten; das Plugin wartet, bis die Services da sind —
   Startreihenfolge ist Service-Bedarf, kein manuelles Boot-Sequencing.
4. Typisierte Events für Kommunikation, fünf Dispatch-Modi (unten).
5. Registrierungen sind reversible Effekte: `ctx.effect()` / `ctx.on()` — Reload und
   Teardown wickeln sie vorhersehbar ab.

### 2. Dispatch-Modi (Vertrag je Event!)

| Modus | awaited? | Reihenfolge | Rückgabewert |
|---|---|---|---|
| `emit` | nein | beobachtend, Registrierungsreihenfolge | nein |
| `waterfall` | nein | beobachtend, Registrierungsreihenfolge | ja |
| `parallel` | ja | alle parallel | nein |
| `serial` | ja | Registrierungsreihenfolge | ja |
| `bail` | nein | bis einer „bailt" | ja |

`waterfall` ist Around-Middleware: Listener bekommt `(...args, next)`, `next()` delegiert,
Rückkehr ohne `next()` short-circuited (Policy-Listener darf, beobachtende müssen
delegieren). `prepend: true` nur wenn zwingend vor normalen Registrierungen.

### 3. Lifecycle & Effects (Katalog `cordis-api/fiber`)

- `ctx.effect(execute, label?)`: `execute` läuft sofort; Disposer werden gesammelt und
  (in **umgekehrter** Reihenfolge) beim manuellen Disposen oder beim Fiber-Unload
  ausgeführt. Zweifaches Disposen ist No-op; bei bereits disposed Fiber:
  `CordisError('INACTIVE_EFFECT')`.
- `Effect` darf ein einzelner Disposer, ein Promise davon oder ein (asynchroner)
  Iterable mehrerer Disposer sein (Generator-Effects registrieren laufend).
- `apply`-Rückgabe wird wie ein Effekt behandelt — „jede Registrierung hat einen
  Disposer" ist die Grundregel des Primers.
- Fiber-API: `fiber.dispose`, `fiber.restart()`, `fiber.update(config)`, `fiber.await()`,
  `fiber.getEffects()` (Diagnose liveer Effekte), `fiber.assertActive()`.
  **Ein `Context` hat kein `dispose` — disposen heißt `ctx.fiber.dispose()`** (Repo-Falle).

### 4. Services, Inject, Provide

- `ctx.inject(deps, callback)` ist Kurzform für `ctx.plugin({ inject, apply: callback })` —
  wird neu ausgeführt, wenn sich ein Service ändert.
- Ohne deklariertes `inject` verweigert der Proxy den Zugriff:
  `cannot get property "X" without inject` (in diesem Repo live gemessen,
  `packages/codingmon/index.js`). DSH-Hostplugins deklarieren `inject` als
  Named Export neben `Config`/`apply`.
- Property-Proxy-Walk ist **ancestor-only** (Post-Mortem 0001, Bug 2): ein optionaler
  Service, den man über `ctx.<name>` aus einem fremden Fiber (Shadow) liest, wirft,
  obwohl er irgendwo existiert. **Workaround: `ctx.get(name)`** — topologieunabhängige
  Suche im globalen Isolate-Store, strict (inaktives Backend liest `undefined` statt
  halb geteardown-tes Objekt).
- `ctx.provide` auf einem **Root**-Context feuert `ctx.inject` eines Geschwister-Fibers
  nicht (Repo-Pitfall): provide aus einem Plugin-Fiber heraus.
- `ctx.isolate(name, label?)`: eigener Service-Scope unterhalb eines Child-Contexts —
  gleiche Implementierung unter neuem Label, ohne Parent zu ändern (zwei `isolate`
  mit gleichem `label` joinen ihre Scopes).
- `ctx.intercept(name, config)`: service-spezifische Intercept-Config für Plugins
  unterhalb — in den resolved Config gemergt, Parent unberührt. Patch-Einträge der
  DSH-Loader kennen `intercept`/`isolate`/`inject` als Felder (`scripts/lib/repo.mjs`
  `PATCH_KEYS`).
- `ctx.extend(meta)`: Child mit Metadaten, prototypales Vererben, kein Mutation des
  Parents.

### 5. Loader-Regeln (Falle Nr. 1 und 2 des Post-Mortems 0001)

- **Namespace-Plugin und `export default` schließen sich aus.** `Loader.unwrapExports`
  bevorzugt `exports.default`; ein mitexportiertes `export default apply` wirft die
  Namespace-Exports (`name`, `inject`, `Config`) weg → Fiber ohne Injections → Crash
  beim ersten Service-Zugriff. Fix: kein `export default` neben der Namespace-Form.
- Tests, die ein Plugin **von Hand** montieren (`ctx.plugin({name, inject, apply})`),
  reproduzieren das niemals: `unwrapExports` läuft nur im echten Loader.
  Deshalb: mindestens ein Test über den **realen Lade-/Exportpfad** (keyless e2e).
- `!!js`-Ausdrücke: der Include-Loader parst sie zu Expression-Nodes und interpoliert
  `config` (gegen den Plugin-Context) und `disabled` (bei jeder Mount-Entscheidung
  gegen den Loader-Context). Post-Mortem 0002: ein literales `!!js`-Objekt hat
  Filesystem-Tools **permanent deaktiviert**. Unser Gate behandelt `!!js` als
  bewussten blinden Fleck (`Docs/ARCHITECTURE.md` §8).
- „Trust the trace, not the theory": im PM 0001 war die elegante Shadow-Theorie real,
  aber der *zweite* Bug — der erste war eine Export-Zeile. Fiber-Walk instrumentieren
  statt Theorien zu spinnen.

### 6. Defensive Patterns (Bug-Klassen-Regeln, `defensive-patterns.md`)

- Orthogonale Ergebnisse unabhängig melden (timeout UND exit 0 sind gleichzeitig
  möglich) — nie Flags ineinander verschachteln.
- Öffentliche Verträge **auf beiden Seiten** einhalten: Eingehende Varianten
  normalisieren, bevor man durch die Public API zurückgibt.
- Async-State ist kein Sync-State: `whenIdle()`/Status-Events sind nicht das Ergebnis
  einer konkreten Nachricht; „nichts zu warten"-Fall explizit behandeln (sonst Hang).
- Dispose muss Ruhe erreichen, nicht nur anfordern: Kinder abwarten, Listener-Registries
  **vor** dem Kill schließen.
- Callback-Exceptions im Dispatcher auffangen — ein schlechter Subscriber darf den
  Kern-Lifecycle nicht brechen.
- Untrusted Output nie mit Ambient-Env oder vorhersagbaren Pfaden: Env scrubben
  (`*KEY*`/`*SECRET*`/`*TOKEN*`/`*PASSWORD*`), Temp-Dateien 0700 + Zufallsnamen + `'wx'`.
- Link-förmige Pfade mit `lstat` + `unlink` löschen, `rmSync` rekursiv nur für echte
  Verzeichnisse (Windows-Junction-Falle).
- Testing (`testing.md`): „test the real entry path" — Coverage beweist, dass Zeilen
  liefen, nicht, dass das Feature **so wie ausgeliefert** funktioniert (178 grüne
  Tests, 100 % Coverage, ACP tot).

## Übertrag auf Shinon Forge

| Befund | Spiegel in diesem Repo |
|---|---|
| `inject` ist Pflicht | `packages/codingmon/index.js` (`export const inject = ['storageDomain']`) |
| Namespace-Form ohne `export default` | alle `index.js` (Gate prüft Syntax, nicht die Export-Form — Wachsamkeit bleibt manuell) |
| `ctx.get` statt Property-Proxy für optionale Services | `test/uebergabe.test.mjs` (in-process Carrier), Pitfall-Liste AGENTS.md |
| realer Lade-/Exportpfad | `dsh-profile-test.mjs`, `pack-test.mjs` (isolierter Install + Load) |
| Literale an der Naht | `packages/codingmon/assets/uebergabe.js` + zeichenweiser Drift-Test |
| Realm-Grenze (Typert prüft `Object.getPrototypeOf`) | Carrier serialisiert an der Realm-Kante (AGENTS.md-Pitfall) |
| Skill-Format | `.agents/skills/<name>/SKILL.md` (kebab-case, Frontmatter `name`/`description`) |

## Lücken (ehrlich)

- DSH ist in der Recherche-VM **nicht installiert** (`dsh` nicht auf PATH, kein
  `node_modules`) — gemessen wurde an Repo-Doku, nicht am laufenden Stack.
- `cordis.js.org` liefert nur einen JS.ORG-302; die echte Doku ist das DSH-Primer.
- GitHub-API war unauthentiziert ratenbegrenzt; Dateien kamen über
  `raw.githubusercontent.com`. Die `docs/framework/*`- und `docs/practice/*`-Pfade
  ließen sich nicht auflösen (404) — siehe Website-Katalog unter
  https://deepseek-harness.github.io/deepseek-harness/.
- Docs-Stand `master` ≠ DSH `0.2.1-alpha.1`; API-Details können abweichen.

## Konsequenz

Drei Skills unter `.agents/skills/`: `cordis-architektur` (ausreizen),
`dsh-bug-muster` (Bug-Klassen + Workarounds), `dsh-dev-workflow` (Checks, Verträge,
Commits). Jede Regel dort verweist auf die Quelle hier.
