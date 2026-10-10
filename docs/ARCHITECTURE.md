# Architektur — Shinon Forge

> **Status:** current — verbindliche Konventionen für `packages/`, `profiles/`, `scripts/`. **Stand:** 2026-10-09
> **Einstieg:** `docs/INDEX.md` · **Zahlen:** `docs/ZAHLEN.md` (einziger Eigentümer harter Zahlen)

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

## 2. Paketgrenzen — **die eine** Aussage

Ein Paket ist ein Cordis-Bundle. **Pflicht sind vier Rollendateien:**

| Datei                | Rolle            | Gehört hierher                                                    | Gehört nicht hierher              |
|----------------------|------------------|-------------------------------------------------------------------|-----------------------------------|
| `index.js`           | Host-/Engine-Hälfte | Config-Schema (Schemastery), `apply(ctx, config)`, Host-Effekte | UI, Renderlogik, Styles           |
| `client.js`          | Render-/UI-Hälfte | `__ModuleLoader__.load({ id, factory })`, Slots, Styles, Locale | Config-Schema, Host-Services      |
| `cordis.patch.yml`   | Aktivierung      | genau **ein** `insert`-Eintrag mit `id`, `name`, Config           | mehrere Einträge, Fremdpakete     |
| `package.json`       | Manifest         | `name`, `exports` (`.`, `./client`, `./cordis.patch.yml`), `dsh.bundle.patch`, `dsh.client.platform`, optional `icon` (Datei muss existieren); host-shared Deps als `peerDependencies` **und** `devDependencies` | Laufzeitlogik |

**Darüber hinaus erlaubt — und nur das (heute gemessener Bestand):**

| Zusatz | Regel | heute |
|---|---|---|
| `assets/` | Laufzeit-Hilfsdateien, werden nach `dist/` mitkopiert | in den meisten Paketen |
| `test/` | paketlokale Tests, **nicht** ausgeliefert | `codingmon`, `hook` |
| `fixtures/` | eingefrorene Eingaben für Tests, nur wenn der Test sie liest | `hook/fixtures/` |
| `README.md` | Paket-Doku (Statusblock wie jedes Dokument, s. `docs/INDEX.md`) | `narrative`, `shinon-forge` |
| eine von Manifest oder Patch **referenzierte** Ressource | muss existieren, eine Datei sein, innerhalb des Pakets liegen und in ihrem Format parsen | `openapi/openapi.yaml` |

Alles andere ist ein Fehler: das Gate lehnt Ressourcen ab, die nicht existieren oder
das Paket verlassen, und das Build kopiert nur `assets/` plus `artifactFiles`
(Pfade, die Manifest oder Patch wirklich nennen).

Für Enums gilt die deklarierte Schemastery-Fassung (`docs/ZAHLEN.md` §1): sie kennt
**kein** `z.enum` — Enums werden als `z.union([z.const('a'), z.const('b')])` modelliert.

- Pakete kennen sich nicht gegenseitig; gemeinsame Tooling-Logik lebt in
  `scripts/lib/`, **niemals** in Paketen.
- Client-interne Slot-IDs folgen `<name>-<zweck>` (z. B. `shinon-core-brand`,
  `shinon-info-banner`).
- Host-shared Abhängigkeiten stehen in `SHARED_DEPS` (`scripts/lib/repo.mjs`) und
  werden als peer **und** dev erzwungen.

## 3. DSH-Profil

`profiles/<profil>/` ist ein **echtes DSH-Profil**, keine Cordis-Konfiguration.
Das Format stammt aus `@deepseek-ai/dsh-app-boot` (`loadProfile` /
`loadProfileDirectory`); nachzulesen am installierten DSH.

| Datei                                  | Rolle                                                          |
|----------------------------------------|----------------------------------------------------------------|
| `package.json`                          | `dsh.profile.bundles` — die Patch-Layer in Anwendungsreihenfolge |
| `cordis.patch.yml`                      | User-Ebene: top-level YAML-Array von Patch-Einträgen (Patches des Includes, `insert`-Listen) |
| `pnpm-workspace.yaml`                   | pnpm-Einstellungen (`packages: [.]`, `nodeLinker: hoisted`) für out-of-tree Bundles |
| `node_modules/` (gitignored)            | die per `link:` verknüpften `@shinon/*`-Pakete                  |

- Ein Profil liegt unter `<DSH_HOME>/profiles/<name>`. **Das Repo-Root ist das
  `DSH_HOME`**, weil es `profiles/` enthält — der Lauf ist damit reproduzierbar,
  ohne etwas nach `~/.dsh` zu installieren.
- Kanonisch ist **`profiles/shinon`**; die aktive Profilwahl steht einmal in
  `scripts.dev` (`--profile shinon`) und wird nirgends dupliziert.
- `profiles/headless` ist das One-shot-Profil (Modell-Route, ein Bundle aus diesem Repo).
- `docs/archive/legacy-profiles/web/` ist der **archivierte Altbestand** (bis 2026-10-11
  `profiles/web`): er nannte nur fremde Bundles und **kein** `@shinon/*`-Paket und war kein
  zweites kanonisches Profil. Er wird nicht geladen; sein einziger wirksamer Wert
  (`welcomeNoticeVersion`) steht seit 2026-10-11 in `profiles/shinon/cordis.patch.yml`.
- `dsh.profile.bundles` nennt eigene Bundles als `@shinon/<dir>` und fremde mit ihrem
  Paketnamen. **Welche** eigenen Pakete aktiv sind und **wie viele** Layer das Profil
  hat, steht gemessen in `docs/ZAHLEN.md` §1; Quelle ist allein
  `profiles/shinon/package.json`.
- Ein Bundle ist ein Paket mit `dsh.bundle.patch`; DSH löst es zuerst aus der
  Installation, dann aus dem Profil auf. Ein Paket ohne Profil-Eintrag ist gebaut,
  aber nicht aktiv — heute sind das fünf, namentlich und gezählt in
  `docs/ZAHLEN.md` §1 (`Pakete **nicht** im Profil`).

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

**Beispiel „referenzierte Ressource“.** `packages/openapi/cordis.patch.yml`
referenziert `specPath: './openapi.yaml'`; die Datei existiert als minimales,
gültiges OpenAPI-3.0-Dokument. Sie ist damit der eine Fall, in dem ein Paket eine
Datei außerhalb von `assets/`/`test/` trägt (siehe § 2). Das Profil ist davon
unberührt: `@shinon/openapi` bleibt inaktiv.

## 5. State und Datenfluss

| State             | Eigentümer                        | Ort                                |
|-------------------|-----------------------------------|------------------------------------|
| Schema-Defaults   | Paket selbst                      | `index.js`                         |
| Patch-Werte       | Paket (ausgeliefert) bzw. Profil (überschrieben) | `packages/<dir>/cordis.patch.yml`, `profiles/shinon/cordis.patch.yml` |
| UI-Zustand        | DSH-Services (`slots`, `styles`, `locale`) | Client-Hälfte              |
| Zahlen (Bestand, Prüfläufe) | `docs/ZAHLEN.md` | sonst nirgends |

Fluss:

```
profiles/shinon/package.json         (Aktivierung: dsh.profile.bundles)
        → Bundle-Patch des Pakets     (packages/<dir>/cordis.patch.yml, insert + Config)
        → Profil-User-Ebene          (profiles/shinon/cordis.patch.yml, nur Overrides)
        → ctx-Konfiguration          → apply() im Host
        → Client: inject(slots/styles/locale) → register(...)
```

- Ein Config-Wert steht im Paket: als Schema-Default (`index.js`) und als
  Patch-Wert (`cordis.patch.yml`). Wirksame Werte stehen im Profil, nicht im Paket.
- Pakete halten keinen globalen Zustand; sie registrieren sich bei den DSH-Services.

## 6. Werkzeuge

| Einstieg                               | Aufgabe                                                                                        |
|----------------------------------------|------------------------------------------------------------------------------------------------|
| `npm test`                             | Gate → Regel-Fixtures → Distributionstest → Profiltest; stoppt beim ersten Fehler                |
| `node scripts/dsh-test.mjs`            | Gate: Manifest, Ressourcen, Patch-Schema, Namensvertrag, Syntax, Legacy-Guard, Komposition      |
| `node scripts/validate-test.mjs`       | Regel-Fixtures: je Regel muss Gate **und** Build rot werden (Kontrolle bleibt grün)             |
| `node scripts/pack-test.mjs`           | Distributionstest je Paket: `pnpm pack` → entpacken → isoliert installieren → laden             |
| `node scripts/dsh-profile-test.mjs`    | Profiltest: `DSH_HOME=<Repo>` `dsh --profile shinon --dump-config` → alle Bundle-Layer          |
| `npm run gate` / `gate:local` / `gate:full` | modulare Gate-Engine (`scripts/gate/engine.mjs`), Slice-fähig                              |
| `npm run build` (`scripts/build.mjs`)  | dieselben Regeln + Artefakte nach `dist/` (`manifest.json`, `profile.json`, Paketkopien)        |
| `npm run stages` (`scripts/stages.mjs`)| Startstufen und READY-Zeile des Starters nachvollziehen                                         |
| `npm run verify:panel` (`scripts/panel-check.mjs`) | Panel-Beleg über das gebaute Client-Bundle (braucht jsdom)                          |

**Ist-Zustand:** Welche dieser Läufe heute Exit 0 liefern und welche rot sind, steht
in `docs/ZAHLEN.md` §2/§3. Diese Datei behauptet keine Testergebnisse.

Wer Verträge ändert, ändert sie in `scripts/lib/repo.mjs` — nie in den Aufrufern.

## 7. Statusklassen

`Verified` / `Rot` / `Nicht geprüft` werden in der README geführt (Beleg = ein in
**diesem** Durchlauf gesehener Exit-Code). Für Dokumente gilt die Statusregel in
`docs/INDEX.md` §2 (`current`, `historical`, `plan`, `evidence`, `imported`).
Neue Features starten als *plan* und werden erst mit ausführbarem Nachweis *current*.

## 8. Bewusste Grenzen

- Kein Voll-Boot in der Doku belegt: verifiziert ist die Config-Auflösung
  (`scripts/dsh-profile-test.mjs`); Web-UI und Modellaufruf brauchen Browser bzw.
  Schlüssel und sind in `docs/ZAHLEN.md` §4 als „nicht geprüft“ geführt.
- Patch-Configs werden **strukturell** validiert, nicht gegen das Schemastery-Schema
  des Pakets (`index.js`) — dafür müssten die Pakete samt `schemastery` geladen werden.
- `@deepseek-ai/schemastery` ist im Repo-Root **nicht installiert**; Tests, die es
  brauchen, überspringen sichtbar (Grund im Testnamen) — einer davon wird heute rot
  statt zu überspringen (`docs/ZAHLEN.md` §3.3).
- Das installierte DSH (`dsh --version`) weicht vom Pin im Root-Manifest ab; genau
  deshalb verweigert ein Gate-Test seine Zusage gegen die ungeprüfte Fassung.
- `!!js`-Ausdrücke (DSH-YAML-Dialekt) kennt der Validator nicht; die Dateien dieses
  Repos nutzen sie nicht — bewusster blinder Fleck.
- Das Root-`package.json` hat kein Lockfile und keine `pnpm-workspace.yaml`
  (das Feld `workspaces` unterstützt pnpm nicht) → das Root-Install ist nicht
  reproduzierbar. Das Profil bringt sein eigenes `pnpm-workspace.yaml` mit.
- Fünf Pakete (`key-router`, `narrative`, `openapi`, `popup`, `shinon-forge`) stehen
  **nicht** im Profil und sind damit inaktiv; für `openapi` ist das eine dokumentierte
  Entscheidung, für die übrigen ist kein Grund verzeichnet (`docs/ZAHLEN.md` §1/§3).
  `docs/archive/legacy-profiles/web/` ist der archivierte Altbestand ohne eigene Bundles.
- Reload-Helfer sind entfallen (bis 2026-10-10 dreifach vorhanden, ohne Aufrufer und mit veraltetem `web`-Profil als Ziel): HMR läuft über den DSH-Prozess selbst, Locale steht in `packages/locale-de/`.
- `better-errors` und `token-usage` sind Config-Ebenen ohne Logik (ihr `apply()`
  loggt nur); `openapi` hat einen Vertrag, aber keinen Server und ist nicht aktiviert.
