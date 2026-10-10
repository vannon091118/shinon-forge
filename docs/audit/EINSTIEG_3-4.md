# EINSTIEG_3-4 — `bin/shinon.mjs` als echter Einstieg

> **Status:** current — Nachweis zu `PLAN.md` Schritt 3.4 (D4). **Stand:** 2026-10-11
> **Einstieg:** `docs/INDEX.md` · **Zahlen des Repos:** `docs/ZAHLEN.md`

## 1. Was gebaut wurde

| Datei | Rolle |
|---|---|
| [`bin/shinon.mjs`](../../bin/shinon.mjs) | **der Einstieg.** Node-Heilung auf ≥ 22, EINE dsh-Auflösung über `dshBinary()`, `--check` samt Herkunftsangabe (`dshSource()`), Start mit `--profile <aktiv>` und `DSH_HOME=<Repo-Root>` |
| [`scripts/start.mjs`](../../scripts/start.mjs) | Kompatibilitäts-Einstieg: importiert **dieselbe** Umsetzung (keine zweite Startlogik, keine zweite Wahrheit) |
| `package.json` | `"bin": { "shinon": "bin/shinon.mjs" }` und `"start": "node bin/shinon.mjs"` |
| [`scripts/lib/dsh.mjs`](../../scripts/lib/dsh.mjs) | neu: `dshSource()` — wertet das Ergebnis von `dshRoot()` am Pfad aus und nennt die **Herkunft** (`Repo-Installat` / `Vendor` / `PATH oder Installations-Prefix`). Die **Reihenfolge** bleibt ausschließlich in `dshRoot()`, sie wird nicht zweitbeschrieben |

**Der Befund, den dieser Schritt schließt:** [`docs/audit/DEPENDENCY_FINDINGS.md`](DEPENDENCY_FINDINGS.md)
führt unter **A-INV-03**: „`bin/shinon.mjs` ist ein `console.log`-Stub ohne `bin`-Feld in
`package.json` und ohne Script-Verweis: der Name `shinon` als CLI ist vorgetäuscht.“ Der
Stub wurde am 2026-10-10 gelöscht; diese Fassung ist keine Nachahmung davon — sie löst auf,
prüft und startet.

## 2. Abnahme: „auf frischem Klon `npm install && npm start`, ohne globales `dsh`“

Gemessen **außerhalb** des Repos, an einer Arbeitsbaum-Kopie **ohne** `node_modules`,
`dist/`, `logs/`, `sessions/`, `storages/` und ohne Profil-`node_modules` (`/tmp/fresh-clone`),
mit Node **v22.23.3** und npm **10.9.9**:

| # | Lauf | Ergebnis | Exit |
|---|---|---|---|
| 1 | `npm install --no-audit --no-fund` | „added **731** packages in 24s“ | **0** |
| 2 | `npm start -- --check` | `✅ startfähig`, `dsh 0.2.1-alpha.1`, Herkunft `Repo-Installat — /tmp/fresh-clone/node_modules/@deepseek-ai/dsh` | **0** |
| 3 | `npm start -- --version` (echter Startpfad, endet sofort) | `0.2.1-alpha.1` | **0** |
| 4 | `node bin/shinon.mjs --check` | wie 2 | **0** |

Lauf 2–4 liefen unter `env -i` mit einem PATH aus **nur** `node`, `npm`, `npx` und
`/usr/bin:/bin`; vorher geprüft: `command -v dsh` → **NEIN**. Das gestartete dsh ist das
**Repo-Installat** (0.2.1-alpha.1), nicht das globale `0.2.0-rc.2` — genau die Aussage
„keine Voraussetzung im PATH“.

Wörtliche Ausgabe (Lauf 2 und 4):

```text
✅ startfähig
   Einstieg:  /tmp/fresh-clone/bin/shinon.mjs
   node:      22.23.3 (ausgeführt mit …/node-v22.23.3-linux-x64/bin/node)
   dsh:       0.2.1-alpha.1
   Herkunft:  Repo-Installat — /tmp/fresh-clone/node_modules/@deepseek-ai/dsh
   Profil:    shinon
   DSH_HOME:  /tmp/fresh-clone
```

## 3. Zweiter Beweis: die Node-Heilung

Im Repo, mit dem **System-Node v18.19.1** (das der Repo-Vorgabe `engines: ^22.19.0` nicht
genügt):

| Lauf | Ergebnis | Exit |
|---|---|---|
| `/usr/bin/node bin/shinon.mjs --check` | `✅ startfähig`, `node: 22.23.3` — der Einstieg hat sich **selbst** unter v22.23.3 neu gestartet | **0** |
| `node scripts/start.mjs --check` (Kompatibilitätspfad) | wie oben, Herkunft `Repo-Installat` | **0** |

## 4. Was dieser Nachweis **nicht** sagt

- **Kein Vollboot.** `npm start -- --version` belegt den Startpfad, nicht eine laufende
  Sitzung: kein Webserver, kein Browser, kein Modellaufruf. Ein zweiter voller Boot hätte
  auf demselben Rechner mit dem laufenden `dsh --profile shinon` (PID 126619) um Port und
  Sitzungsverzeichnis konkurriert.
- **Der Einstieg startet weiter mit `--profile <name>`.** Der belegte Weg ohne
  `$DSH_HOME/profiles/<name>` ([docs/audit/SPIKE_3-3.md](SPIKE_3-3.md)) wird hier erst
  eingehängt, wenn die Profilwerte aus Code kommen (Schritt 3.6) — sonst gäbe es zwei Orte,
  an denen dasselbe Profil definiert ist.
- **`vendor/dsh` (alpha.2) bleibt unverdrahtet.** Es läuft das Repo-Installat (alpha.1, der
  Pin). Zwei Fassungen gleichzeitig im Startpfad wären genau die Mischung, die `PLAN.md`
  Schritt 1.2 verbietet.
- **Kein `npm ci`-Nachweis.** Der Lauf prüfte `npm install` auf leerem Baum. Dass
  `package-lock.json` danach unverändert ist, ist nicht Teil dieses Schritts (und wird von
  3.5 berührt).

## 5. Offen, aber jetzt ohne Rätselraten

`npm install` im **unveränderten** Manifest dieses Repos läuft (Exit 0, 731 Pakete) — die
verbleibende Arbeit von Schritt 3.5 ist damit kleiner als der Plan annimmt: sechs
pnpm-Dateien, das `packageManager`-Feld und **zwei** echte pnpm-Aufrufe
([`scripts/dsh-profile-test.mjs`](../../scripts/dsh-profile-test.mjs),
[`scripts/pack-test.mjs`](../../scripts/pack-test.mjs)). Ob das `workspace:*`-Protokoll
bleiben darf (gemessen: npm 10 akzeptiert es **mit** dem `workspaces`-Feld) oder auf
`*`/`file:` weichen soll, ist eine Entscheidung des Auftraggebers — die Messung verlangt sie
nicht, der Plan schon.

## 6. Prüfbefehle

```bash
node -p "JSON.stringify(require('./package.json').bin)"     # {"shinon":"bin/shinon.mjs"}
env -i HOME="$HOME" PATH="/usr/bin:/bin" \
  "$HOME/.local/opt/node-v22.23.3-linux-x64/bin/node" bin/shinon.mjs --check   # Exit 0
npm start -- --check                                        # Exit 0
/usr/bin/node bin/shinon.mjs --check                        # Node-Heilung, Exit 0
```
