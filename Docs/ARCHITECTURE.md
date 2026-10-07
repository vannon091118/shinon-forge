# Architektur — Shinon Forge

Verbindliche Konventionen für `packages/`, `profiles/` und `scripts/`.
Durchgesetzt von `scripts/lib/repo.mjs`, geprüft von `scripts/dsh-test.mjs` (Gate),
`scripts/build.mjs` (Pipeline) und `scripts/validate-test.mjs` (Regel-Fixtures) —
alle vier nutzen dieselbe Validierungsquelle.

## 1. Namespace-Regel

Ein Paket wird **durch seinen Ordnernamen** identifiziert: `packages/<dir>/`.
Alle führenden Namen werden daraus abgeleitet (Scope aus dem Root-Paket, heute `@shinon`):

| Quelle                                | Feld            | Wert             |
|---------------------------------------|-----------------|------------------|
| `packages/<dir>/package.json`         | `name`          | `@shinon/<dir>`  |
| `packages/<dir>/cordis.patch.yml`     | `id`            | `shinon-<dir>`   |
| `packages/<dir>/cordis.patch.yml`     | `name`          | `@shinon/<dir>`  |
| `packages/<dir>/client.js`            | ModuleLoader-id | `@shinon/<dir>`  |
| `profiles/<profil>/package.json`      | `dsh.profile.bundles` | `@shinon/<dir>` je aktiviertem Paket |

- Kein Name wird hart kodiert; die Erwartung berechnet `expected(dir)`.
- Der Legacy-String `dsh-mod` darf in Runtime-Artefakten nicht vorkommen (Gate-Guard).
- Namen ändern heißt: Ordner umbenennen und die vier Spiegel nachziehen; Gate und
  Build prüfen danach automatisch.

## 2. Paketgrenzen

Jedes Paket ist ein Cordis-Bundle aus vier Dateien mit klarer Rolle:

| Datei                | Rolle            | Gehört hierher                                                    | Gehört nicht hierher              |
|----------------------|------------------|-------------------------------------------------------------------|-----------------------------------|
| `index.js`           | Host-/Engine-Hälfte | Config-Schema (Schemastery), `apply(ctx, config)`, Host-Effekte | UI, Renderlogik, Styles           |
| `client.js`          | Render-/UI-Hälfte | `__ModuleLoader__.load({ id, factory })`, Slots, Styles, Locale | Config-Schema, Host-Services      |
| `cordis.patch.yml`   | Aktivierung      | genau **ein** `insert`-Eintrag mit `id`, `name`, Config           | mehrere Einträge, Fremdpakete     |
| `package.json`       | Manifest         | `name`, `exports` (`.`, `./client`, `./cordis.patch.yml`), `dsh.bundle.patch`, `dsh.client.platform`, optional `icon` (Datei muss existieren); host-shared Deps als `peerDependencies` **und** `devDependencies` | Laufzeitlogik |

- Pakete kennen sich nicht gegenseitig; gemeinsame Logik lebt ausschließlich im
  Tooling (`scripts/lib/`), nicht in Paketen.
- Client-interne IDs folgen `<name>-<zweck>` (z. B. `shinon-core-brand`, `shinon-info-banner`).
- Host-shared Abhängigkeiten stehen in `SHARED_DEPS` (`scripts/lib/repo.mjs`) und werden als peer+dev erzwungen. Immer die API der deklarierten Version nutzen: Schemastery 3.18.4 kennt kein `z.enum` — Enums sind `z.union([z.const('a'), z.const('b')])`.
- Weitere Dateien liefert ein Paket nur, wenn Manifest oder Patch sie **referenzieren**
  (heute: `packages/openapi/openapi.yaml`) — siehe § 4.

## 3. DSH-Profil

`profiles/<profil>/` ist ein **echtes DSH-Profil**, keine Cordis-Konfiguration.
Das Format stammt nicht aus diesem Repo, sondern aus `@deepseek-ai/dsh-app-boot`
(`loadProfile` / `loadProfileDirectory`); nachzulesen am installierten DSH.

| Datei                                  | Rolle                                                          |
|----------------------------------------|----------------------------------------------------------------|
| `package.json`                          | `dsh.profile.bundles` — die Patch-Layer in Anwendungsreihenfolge |
| `cordis.patch.yml`                      | User-Ebene: top-level YAML-Array von Patch-Einträgen (Patches des Includes, `insert`-Listen, `!!js`) |
| `pnpm-workspace.yaml`                   | pnpm-Einstellungen (`packages: [.]`, `nodeLinker: hoisted`) für out-of-tree Bundles |
| `node_modules/` (gitignored)            | die per `link:` verknüpften `@shinon/*`-Pakete                  |

- Ein Profil liegt unter `<DSH_HOME>/profiles/<name>`. **Das Repo-Root ist das
  `DSH_HOME`**, weil es `profiles/` enthält — damit ist der Lauf reproduzierbar,
  ohne etwas nach `~/.dsh` zu installieren.
- `dsh.profile.bundles` nennt Repo-Bundles mit `@shinon/<dir>` und fremde Bundles
  mit ihrem Paketnamen (`@deepseek-ai/dsh-base`, `@deepseek-ai/dsh-web-app` liefern
  die Harness). `@shinon/openapi` ist bewusst **nicht** dabei.
- Ein Bundle ist ein Paket mit `dsh.bundle.patch`; DSH löst es zuerst aus der
  Installation, dann aus dem Profil auf.
- Die User-Ebene dupliziert keine Bundle-Werte: jeder Paket-Patch bringt seine
  Config mit, das Profil überschreibt nur, was abweichen soll.

## 4. Validierungsregeln

Alle Regeln stehen in `scripts/lib/repo.mjs` und laufen in Gate **und** Build; jede
Regel hat ein Fixture in `scripts/validate-test.mjs`, das beweist, dass beide
Einstiege rot werden.

**YAML.** Geparst wird mit dem Parser des DSH-Stacks (`js-yaml`, eine Dependency von
`@deepseek-ai/dsh`), aufgelöst aus der installierten dsh-App (`scripts/lib/yaml.mjs`,
`dsh` wird im PATH gesucht). Keine neue Dependency, kein `node_modules` im Repo.

**Patch-Dateien** (`cordis.patch.yml` je Paket und User-Ebene des Profils) werden
gegen ein Teilschema der DSH-Loader-Patches geprüft (`PatchOptions`):

| Regel              | Verhalten                                                                 |
|--------------------|---------------------------------------------------------------------------|
| Struktur           | top-level YAML-Array, jedes Element ein Mapping                            |
| Typen              | `id`/`name` Strings, `disabled` Boolean, `insert` eine Liste               |
| required keys      | ohne `insert` braucht ein Eintrag `id`; jedes Insert braucht `id` und `name` |
| unbekannte Keys    | abgelehnt (DSH ignoriert sie — ein Tippfehler bliebe sonst still)          |

**Ressourcen.** Jede Referenz aus Manifest (`exports`-Ziele, `dsh.bundle.patch`,
`icon`) und aus Patch-Config-Werten, die als relativer Pfad geschrieben sind
(`./…`, `../…`), muss existieren, eine Datei sein, innerhalb des Pakets liegen und in
ihrem Format parsen (`.yaml/.yml/.json`). Das Build kopiert diese Ressourcen
(`artifactFiles`) und prüft danach, dass jede Referenz in `dist/` liegt.
`scripts/pack-test.mjs` prüft dasselbe für das Tarball.

**Komposition.** Das Profil-Manifest (`dsh.profile.bundles`: nicht-leere Liste,
unbekannte Felder und Duplikate abgelehnt) sowie die zusammengelegten Layer: keine
doppelte `insert`-id über Bundles und User-Ebene; der Paketgraph aus
`dependencies`/`peerDependencies` von `@shinon/*`-Paketen muss azyklisch sein und darf
nur existierende Pakete nennen.

**OpenAPI-Entscheidung.** `packages/openapi/cordis.patch.yml` referenziert
`specPath: './openapi.yaml'`; der Vertrag existiert bereits als JSDoc in
`packages/openapi/index.js`. Deshalb wurde die Datei **angelegt** (minimales, gültiges
OpenAPI-3.0-Dokument mit `/api/v1/status`) statt die Referenz zu entfernen: die
Ressourcen-Regel wird so an einer echten Referenz geprüft, und der spätere Server hat
seinen Vertrag schon. Das Profil bleibt unverändert inaktiv — `@shinon/openapi` ist
weder Bundle noch Dependency.

## 5. State und Datenfluss

| State             | Eigentümer                        | Ort                                |
|-------------------|-----------------------------------|------------------------------------|
| Schema-Defaults   | Paket selbst                      | `index.js`                         |
| Patch-Werte       | Paket (ausgeliefert) bzw. Profil (überschrieben) | `packages/<dir>/cordis.patch.yml`, `profiles/shinon/cordis.patch.yml` |
| UI-Zustand        | DSH-Services (`slots`, `styles`, `locale`) | Client-Hälfte              |

Fluss:

```
profiles/shinon/package.json         (Aktivierung: dsh.profile.bundles)
        → Bundle-Patch des Pakets     (packages/<dir>/cordis.patch.yml, insert + Config)
        → Profil-User-Ebene          (profiles/shinon/cordis.patch.yml, nur Overrides)
        → ctx-Konfiguration          → apply() im Host
        → Client: inject(slots/styles/locale) → register(...)
```

- Ein Config-Wert steht im Paket: als Schema-Default (`index.js`) und als
  Patch-Wert (`cordis.patch.yml`).
- Pakete halten keinen globalen Zustand; sie registrieren sich bei den DSH-Services.
- Das aktive Profil wird aus `scripts.dev` gelesen (`--profile <name>`), nicht dupliziert.

## 6. Werkzeuge

| Einstieg                               | Aufgabe                                                                                        |
|----------------------------------------|------------------------------------------------------------------------------------------------|
| `npm test`                             | Gate → Regel-Fixtures → Distributionstest → Profiltest; Exit 1 bei jeder Abweichung            |
| `node scripts/dsh-test.mjs`            | Gate: Manifest, Ressourcen, Patch-Schema, Namensvertrag, Syntax, Legacy-Guard, Komposition      |
| `node scripts/validate-test.mjs`       | Regel-Fixtures: je Regel muss Gate **und** Build rot werden (Kontrolle bleibt grün)             |
| `node scripts/pack-test.mjs`           | Distributionstest je Paket: `pnpm pack` → entpacken → isoliert installieren → laden             |
| `node scripts/dsh-profile-test.mjs`    | Profiltest: `DSH_HOME=<Repo>` `dsh --profile shinon --dump-config` → Exit 0, alle Bundle-Layer   |
| `npm run build` (`scripts/build.mjs`)  | dieselben Regeln + Artefakte nach `dist/` (`manifest.json`, `profile.json`, Paketkopien)        |

Wer Verträge ändert, ändert sie in `scripts/lib/repo.mjs` — nie in den Aufrufern.

## 7. Statusklassen

`Verified` / `Experimental` / `Planned` werden in der README geführt. Neue Features
starten als *Planned* und werden erst mit ausführbarem Nachweis *Verified*.

## 8. Bewusste Grenzen

- Kein Voll-Boot (`dsh --profile shinon` startet die Web-UI) — verifiziert ist nur
  die Config-Auflösung (`scripts/dsh-profile-test.mjs`); README: *Planned*.
- Patch-Configs werden **strukturell** validiert, nicht gegen das Schemastery-Schema
  des Pakets (`index.js`) — dafür müssten die Pakete samt `schemastery` geladen werden.
- `!!js`-Ausdrücke (DSH-YAML-Dialekt) kennt der Validator nicht und die Dateien
  dieses Repos nutzen sie nicht; sie sind ein bewusster blinder Fleck.
- Das Root-`package.json` hat weiterhin kein Lockfile / keine `pnpm-workspace.yaml`
  → das Root-Install ist nicht reproduzierbar. Das Profil bringt sein eigenes
  `pnpm-workspace.yaml` und `pnpm-lock.yaml` mit (nur `link:`-Deps, offline installierbar).
- Reload-Helfer existieren dreifach (`scripts/dsh_reload.js`, `dsh_reload.mjs`, `reload.mjs`).
- Dashboard, Token Usage und Better Errors sind Platzhalter; OpenAPI hat einen
  Vertrag, aber keinen Server.
