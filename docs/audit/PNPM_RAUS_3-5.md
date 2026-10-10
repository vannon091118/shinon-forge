# pnpm-Reste entfernt — Schritt 3.5 (protokollfreier Teil) und der messbar gewordene Teil von 3.7

> **Status:** current — Nachweis für die gelöschten pnpm-Dateien, das entfernte
> `packageManager`-Feld und die zwei auf npm umgestellten Aufrufe (Schritt 3.5 / A1)
> sowie für den Teil von 3.7, der **ohne** die Bindungsentscheidung prüfbar wird.
> **Stand:** 2026-10-11
> **Einstieg:** `docs/INDEX.md` · **Zahlen:** `docs/ZAHLEN.md`
> **Nicht committet** (A6 offen), `main` unangetastet.

## 1. Zuschnitt: was dieser Schritt ist und was er nicht ist

Der Plan verlangt in 3.5 fünf Dinge auf einmal: sechs pnpm-Dateien löschen,
`packageManager` **und** `workspaces` aus dem Root-Manifest, die zwei echten pnpm-Aufrufe
auf npm umstellen, den npm-Lockfile als Quelle, und `workspace:*` → semver-Range
(19 Stellen). Gemessen ist der letzte Punkt **nicht** ausführbar (PLAN-Block „3.5–3.7
angehalten": ohne `workspaces` gibt es für `workspace:*` keinen Workspace-Bezug, und
`@shinon/*` ist nicht veröffentlicht — `npm view @shinon/core` → E404). Die
Bindungsfrage (`workspace:*` behalten oder auf `*`/`file:` weichen) gehört dem
Auftraggeber und ist hier **weiter offen**.

Dieser Durchgang macht genau den Teil, der von jeder Antwort auf diese Frage
unabhängig ist: **die sechs Dateien, das `packageManager`-Feld, die zwei Aufrufe, der
Lockfile.** `workspaces: ["packages/*"]` und die 19 `workspace:*`-Stellen bleiben
angetastet-unangetastet — sie zu ändern wäre erst nach der Entscheidung sinnvoll.

## 2. Vorprüfung: wer zeigt auf diese Dateien?

Vor den Löschungen geprüft — es sollte nichts Laufendes und nichts Getestetes daran
hängen:

| Prüfung | Ergebnis |
|---|---|
| Tests/Regeln, die eine der sechs Dateien lesen | **keine** — `git grep -n -i pnpm -- .` findet außerhalb von Kommentaren und Doku nichts; die Prüfungen von `scripts/lib/repo.mjs` nennen die Profil-Dateien `package.json` + `cordis.patch.yml`, keine pnpm-Datei |
| CI und Hooks | **keine Nennung** — `.github/workflows/commit-guard.yml` und `.githooks/{commit-msg,prepare-commit-msg}` enthalten kein `pnpm` (`grep -rn -i pnpm .github .githooks` → 0 Treffer) |
| **Upstream schreibt selbst eine** | `initProfile()` in `@deepseek-ai/dsh-app-boot/lib/index.js` legt bei Bedarf `<profil>/pnpm-workspace.yaml` an (Zeile 595; aufgerufen aus `dsh/lib/plugin-BGnVfe_D.js:41` und `dsh/lib/profile-boot-BZ2ZjNWi.js:157`). Der Upstream-Plugin-Manager spricht also weiter pnpm und adressiert den Nutzer sogar mit einer `pnpm-workspace.yaml` unter dem Profil (`…/plugin-BGnVfe_D.js:97`, `allowBuilds`) |
| Laufzeit-Reste im Arbeitsbaum | **5**, alle untracked und alle von `.gitignore` gedeckt (`node_modules/`, `**/.plugin-manager/logs/` — geprüft mit `git check-ignore -v`): `profiles/shinon/node_modules/.pnpm`, `…/node_modules/.pnpm-workspace-state-v1.json`, zwei `…/.plugin-manager/logs/operation-*/pnpm.log` und `profiles/web/.plugin-manager/logs/operation-p5wi73/pnpm.log` |
| Getrackte pnpm-Dateien vor der Änderung | **6** (`git ls-tree -r --name-only HEAD \| grep -i pnpm`), nämlich das Root-`pnpm-workspace.yaml`, `profiles/shinon/{pnpm-workspace,pnpm-lock}.yaml`, `profiles/headless/{pnpm-workspace,pnpm-lock}.yaml` und das `pnpm-workspace.yaml` des archivierten `web`-Profils |
| Echte pnpm-**Aufrufe** vorher | **2** — `run('pnpm', ['pack', …])` in [scripts/pack-test.mjs](../scripts/pack-test.mjs) und `execFileSync('pnpm', ['install'], …)` in [scripts/dsh-profile-test.mjs](../scripts/dsh-profile-test.mjs) |

**Warum die Vorprüfung wichtig ist:** die Upstream-Seite legt zur Laufzeit wieder eine
`pnpm-workspace.yaml` an. Dagegen hilft kein Löschen, sondern nur, dass sie **nie
getrackt** wird — deshalb zwei `.gitignore`-Zeilen (`pnpm-workspace.yaml`,
`pnpm-lock.yaml`), ergänzt in diesem Durchgang.

## 3. Was entfernt wurde und was bleibt

| Weg | Vorher (HEAD) | Nachher |
|---|---|---|
| Sechs getrackte pnpm-Dateien | 6 (`git ls-tree -r HEAD \| grep -ci pnpm`) | **0** (`git ls-files \| grep -ci pnpm`) |
| `packageManager` im Root-Manifest | `"packageManager": "pnpm@11.7.0"` (HEAD:package.json Zeile 7) | Feld **entfernt** |
| Distributionstest | `pnpm pack` + `pnpm install` je Paket | `npm pack` + `npm install` je Paket ([scripts/pack-test.mjs](../scripts/pack-test.mjs) Zeilen 86/105) |
| Profiltest | Auto-Install per `pnpm install`, wenn `profiles/<name>/node_modules` fehlte | **kein Auto-Install**; der Test lädt nur und sagt es, wenn die Auflösung fehlt ([scripts/dsh-profile-test.mjs](../scripts/dsh-profile-test.mjs)) |
| `workspaces: ["packages/*"]`, 19× `workspace:*` | vorhanden | vorhanden — **Bindungsfrage offen** (§1) |
| `profiles/` | unberührt | unberührt (dort läuft fremder Boot; 3.6 bleibt angehalten) |

**Warum ein npm-Install im Profil auch nicht möglich ist (gemessen, nicht vermutet):**
die Profil-Abhängigkeiten sind `link:`-Ziele — `profiles/shinon/package.json` führt seine
14 Bundles als `@shinon/<dir>: link:../../packages/<dir>`. Nachgemessen an einer
Minimal-Reproduktion außerhalb des Repos: `npm install --dry-run` mit einem einzelnen
`link:`-Eintrag → **Exit 1**, `EUNSUPPORTEDPROTOCOL — Unsupported URL Type "link:"`. Das
ist kein npm-Protokoll; ein Auto-Install dort wäre ein Fehler, kein Fortschritt — der
Test sagt es jetzt sichtbar (⚠️-Ausgabe) statt es still zu versuchen. Der
Distributionstest deckt die Auslieferbarkeit der Pakete ab, der Profiltest die Auflösung
(und der Auto-Install, den er früher selbst per `pnpm install` versucht hat, ist weg).

## 4. Der npm-Lockfile als Quelle

| Messung | Ergebnis |
|---|---|
| Drift vor dem Nachziehen | ein echter `npm install` schreibt 58 Zeilen um; die Ursache war der Anspruch des Root-Manifests (devDeps 16 → 19), nicht eine Registry-Bewegung |
| Nachziehen | `npm install --package-lock-only` — Lockfile jetzt lockfileVersion 3, Root-devDeps **19**, **815** Einträge (796 unter `node_modules/`, **19** `@shinon/*`-Workspace-Links) |
| Ist der Lockfile wirklich die Quelle? | **ja**: ein frischer Klon (§5) mit diesem Lockfile, `npm install` lässt ihn **byteidentisch** (`diff` → 0 Zeilen) |
| Pin unangetastet | `@deepseek-ai/dsh` bleibt `0.2.1-alpha.1` im Root-Manifest **und** im Lockfile |

## 5. Abnahme (frischer Klon außerhalb des Repos)

Arbeitsbaum-Kopie **ohne** `node_modules`, `dist`, `logs`, `sessions`, `storages` und
**ohne** `profiles/` (dessen `link:`-Einträge kein npm-Installat sind, §3):
`/tmp/fresh-clone2`. Kommandos unter `env -i`, PATH ohne `dsh` und ohne `pnpm`:

| Schritt | Ergebnis | Exit |
|---|---|---|
| `npm install` | „added **731** packages in **19s**" (npm 10.9.9, Node v22.23.3) | **0** |
| `npm start -- --check` | „✅ startfähig", node 22.23.3, dsh `0.2.1-alpha.1`, Herkunft **`Repo-Installat — /tmp/fresh-clone2/node_modules/@deepseek-ai/dsh`**, Profil `shinon`, `DSH_HOME` = Klon | **0** |
| PATH-Kontrolle im selben Lauf | `command -v dsh` → **NEIN**, `command -v pnpm` → **NEIN** | — |
| pnpm-Dateien im Klon | `find . -name '*pnpm*'` (ohne `node_modules`) → **0** | — |
| `packageManager` im Klon-Manifest | Feld fehlt (wie beabsichtigt) | — |
| Lockfile nach dem Install | byteidentisch zum getrackten (`diff` → 0 Zeilen) | — |

Damit ist die Abnahme des Schritts für den protokollfreien Teil erfüllt: **kein
pnpm-Aufruf** (`git grep -n -I -E "…('pnpm'…)" -- scripts` → 0 Treffer) und **keine
pnpm-Datei in Root oder Profil** (`git ls-files | grep -ci pnpm` → 0).

## 6. Der Teil von 3.7, der jetzt messbar ist

3.7 verlangt „genau **ein** Testeinstieg, der ohne pnpm läuft — Nachweis: Befehl plus
Exit-Code". Der Befehl existiert und ist gemessen; die **Bewertung** der übrigen
Werkzeuge (A5) bleibt offen und gehört dem Auftraggeber:

| Lauf | Kommando | Ergebnis | Exit |
|---|---|---|---|
| Volle Kette | `npm test` unter `env -i`, PATH **ohne `pnpm`** und **ohne globales `dsh`** (Node v22.23.3, npm 10.9.9) | Gate **99/0** → Fixtures **9/0** → Distribution **76/0** → Profiltest **3/0** | **0** |
| dasselbe unter Node v18 | derselbe Befehl, PATH ohne Node 22 | rot an der Codingmon-Naht (`getRandomValues` fehlt unter Node 18) — **Umgebungs-Rot, kein Code-Rot**; dieselbe Aussage steht in `docs/ZAHLEN.md` §2 | 1 |

**Warum die Kette ohne globales `dsh` läuft:** `npm run` legt `node_modules/.bin` vorne
in den PATH; dort löst die Profilprüfung das **Repo**-`dsh` auf (`0.2.1-alpha.1`) — die
Repo-Fassung zuerst zu messen ist genau die Bedingung aus `docs/ZAHLEN.md` §2.

Für die A5-Entscheidung mitgemessen (nur Bestandsaufnahme, keine Bewertung): die Kette
besteht aus **fünf** Läufen — Codingmon-Einzeltests, statisches Gate (99),
Regel-Fixtures (9), Distributionstest (76), Profiltest (3); eigenständig aufrufbar
bleiben daneben `npm run gate`/`gate:full` (modulare Engine, 18 Gates), `npm run gate:test`
(327 Tests), `npm run build`, `npm run branding`, `npm run commit:guard`.

## 7. Grenzen und offene Punkte

- **`workspace:*`/`workspaces` sind unangetastet** — der Plan verlangt ihre Entfernung,
  die Messung verlangt sie nicht, und die Bindungsfrage ist nicht beantwortet. Der
  protokollfreie Teil ist davon abgeschlossen; der Rest bleibt Teil von 3.5.
- **Der Upstream-Plugin-Manager spricht weiter pnpm** (`dsh plugin add`, Neuanlage einer
  `pnpm-workspace.yaml` im Profil über `initProfile`). Das ist fremder Code; hier
  gemessen, nicht geändert. Die zwei `.gitignore`-Zeilen sorgen dafür, dass so eine
  Laufzeitdatei nicht getrackt werden kann.
- **3.6 bleibt angehalten**: `profiles/` umzubauen, während dort ein fremder Boot liest
  und schreibt, ist weiterhin der falsche Zeitpunkt.
- **Nicht gefahren**: `dsh plugin add` (würde das Profil verändern — hier bewusst nicht),
  Modellaufruf, lebender Browser-Lauf.
