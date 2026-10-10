# PLUGIN_IDIOME_2-1 — zwei Kopien-Familien auf eine Quelle

> **Status:** current — Nachweis zum Plan-Schritt 2.1 (C2), alles hier in diesem Durchlauf gemessen. **Stand:** 2026-10-10
> **Einstieg:** `docs/INDEX.md` · **Zahlen:** `docs/ZAHLEN.md` (einziger Eigentümer harter Zahlen)

**Auftrag (PLAN.md 2.1):** die sechs `settings.configure`-Kopien auf eine Quelle
bringen — kein neues Feature, keine Verhaltensänderung, keine Test-Anpassung, keine
Commits. Die Inventur aus Schritt 1.5 hatte dazu zwei Dinge geliefert, die hier
behandelt werden müssen: eine **zweite** Kopien-Familie (fünf Locale-Helfer, erst im
Commit `487c559` entstanden) und die Messung, dass die **Client-Hälften**
eigenständige Bundles sind.

**Abgrenzung, offen gesagt:** die verlangte Ursache ist „ein Verhalten, sechs
Kopien, keine gemeinsame Quelle" (der TODO stand bis eben in
[packages/dashboard/index.js](../packages/dashboard/index.js)). Dort, wo Teilen in
der Laufzeit möglich ist, ist jetzt eine Quelle — auf der Werkzeugseite. Wo es
technisch nicht geht (unten §2 belegt), tragen die Pakete **generierte** Blöcke mit
Drift-Prüfung: keine handgepflegte Kopie mehr.

---

## 1. Ergebnis in Zahlen

| Familie | vorher | nachher |
|---|---|---|
| `settings.configure`-Registrierung (Host) | 6 handgepflegte Kopien in 6 `index.js` | **1 Quelle**, 6 generierte Blöcke |
| Locale-Fallback (Client) | 5 handgepflegte Kopien in 5 `client.js` (4× `MENU_DE`, 1× `TOKEN_DE`) | **1 Quelle**, 6 generierte Blöcke |
| zusammen | 11 handgepflegte Kopien | **12 Blöcke in 11 Dateien, 0 handgepflegte Kopien** |
| Zeilen im Baum, die den Block ausmachen | von Hand gepflegt | markiert (`// >>> shinon:dsh-idiom <id> …`), `npm run idioms` schreibt, Gate + `dsh-test` + `build` prüfen |

Die eine Zahl (12/11/0) steht mit Befehl in `docs/ZAHLEN.md` §1; dieser Text zitiert sie nur.

## 2. Warum generiert und nicht importiert — belegt, nicht behauptet

Teilen wäre der schönere Weg; er ist hier **nicht möglich**, und zwar messbar:

**(a) Jedes Paket wird einzeln verpackt.** Gemessen am echten Paketbaum:

```bash
mkdir -p /tmp/pack-evidence/out && cp -r packages/core /tmp/pack-evidence/core
(cd /tmp/pack-evidence/core && pnpm pack --pack-destination /tmp/pack-evidence/out)
tar -tzf /tmp/pack-evidence/out/*.tgz
```

Ergebnis (Exit 0): `package/package.json`, `package/index.js`, `package/client.js`,
`package/cordis.patch.yml`, `package/assets/*` — **0 Treffer für `scripts/`**.
[scripts/pack-test.mjs](../scripts/pack-test.mjs) prüft genau diese Dateien im Tarball
und lädt es danach im Isolat: eine `import`-Zeile auf `scripts/lib/…` läge außerhalb
des Tarballs und würde den Distributionstest brechen.

**(b) Eine Client-Hälfte ist ein self-contained Bundle.** Sie meldet sich über
`window.__ModuleLoader__.load({ id })` an und zieht React per `require`, nicht per
`import` — sie erreicht kein Repo-Modul. Deshalb ist auch die naheliegende Form
„Client-Hälften importieren `scripts/lib/`" keine Option.

Daraus folgt die Form, die der Auftrag für diesen Fall vorgibt: **eine Quelle +
maschinelle Ableitung statt Handpflege**. Was dabei *geteilt* wird, ist die Lehre
und die Prüfung; die Laufzeit trägt weiter je Paket ihren Block — nur eben
generiert.

## 3. Die eine Quelle: `scripts/lib/plugin-idioms.mjs`

Aufbau der Datei:

- **`TEMPLATES`** — je Baustein die Zeilen, einmal: `settings-registration`
  (Host-Hälfte; Marke + Zweckkommentar + `ctx.inject(['settings'], …)`),
  `locale-fallback/menu` (Tabellenzeile, Begründung des `ctx.get?.('locale')`-Blicks,
  Helfer), `locale-fallback/static` und `locale-fallback/bind` (die Token-Hälfte,
  deren Komponente auf Modulebene eine Variable liest — deshalb dort zwei Regionen).
- **`REGIONS`** — Datei → Idiom → Einrückung → **Parameter**. Die Parameter sind die
  vollständige Eingabe des Bausteins: Tabellenname, Schlüssel, Fallback-Label (und
  für `popup` die dateispezifische Ergänzung „LABEL bleibt die interne Kennung für
  `announce()`"). Damit liegen auch die Werte, die vorher als zweite Wahrheit neben
  der Registry standen, an einer Stelle.
- **`SIGNATURES`** — je Hälfte die Zeichenfolge, die den Baustein ausmacht
  (`settings.configure(`, `locale.bind('shinon')`, `ctx.get?.('locale')`).
- **`render(region)`** erzeugt den Block zeichengenau, **`parseRegions`** liest die
  Marken, **`idiomIssues(rootPath, half)`** prüft, **`applyIdioms(rootPath)`** schreibt.
- Fehlt eine Marke, wird **nichts geraten**: `applyIdioms` lässt die Datei stehen und
  meldet die Region (fail-closed).

Die Marke nennt die Quelle, damit ein Leser im Paket nicht raten muss:

```
// >>> shinon:dsh-idiom settings-registration — EINE Quelle: scripts/lib/plugin-idioms.mjs (generiert; schreiben: `npm run idioms`, prüfen: Gate + dsh-test)
```

## 4. Was geprüft wird — und dass es greift

Drei Prüfungen laufen gegen dieselbe Funktion aus der einen Quelle:

| Prüfer | Weg | Wann |
|---|---|---|
| `host-half` (Gate-Plugin) | `idiomIssues(repo.ROOT, 'index.js')` | `always` + `local` → jeder Gate-Lauf, jeder Hook |
| `client-half` (Gate-Plugin) | `idiomIssues(repo.ROOT, 'client.js')` | dito |
| `node scripts/dsh-test.mjs` | ein Schritt „🧩 Generierte Idiome" (beide Hälften) | `npm test`, CI |
| `npm run build` | beide Hälften vor Stufe 7 | Validierung vor `dist/` |
| `npm run idioms:check` | beide Hälften, nur prüfend | von Hand, jederzeit |

Geprüft wird vierfach: **Inhalt** des Blocks zeichengenau gegen die Quelle, **Marken**
(vorhanden, paarig, in deklarierter Reihenfolge, keine überzähligen), **Vollständigkeit**
(jede deklarierte Datei existiert) und **Signatur außerhalb eines Blocks** — also eine
neue Kopie ohne Quelle, auch wenn kein bestehender Block abweicht. Ein Vorkommen der
Signatur in einer Kommentarzeile zählt nicht (die Blöcke erklären den Aufruf selbst;
Prosa ist kein Aufruf).

**Mutationsprobe** (eine Zeile im echten Baum verfälscht, `{ auto: false }` →
`{ auto: true }` in [packages/core/index.js](../packages/core/index.js), danach
zurückgespielt):

| Lauf | mit Mutation | nach dem Zurückspielen |
|---|---|---|
| `npm run idioms:check` | Exit **1**, Befund nennt Datei, Block und die abweichende Zeile | Exit 0, „12 Blöcke in 11 Dateien deckungsgleich" |
| `node scripts/dsh-test.mjs` | **98 bestanden, 1 fehlgeschlagen**, Exit 1 | **99 bestanden, 0 fehlgeschlagen**, Exit 0 |
| `npm run gate:full` | `host-half — 1 Problem(e)`, Verdict **FAIL**, Exit 1 | PASS, Exit 0 |

## 5. Verhaltensgleichheit — gemessen

Die Änderung darf nichts am Verhalten der elf Hälften ändern. Zwei unabhängige
Messungen, beide in diesem Durchlauf:

**(a) Der Code ist zeichengenau derselbe.** Von den elf Dateien wurde vor der
Änderung eine Kopie nach `/tmp` gelegt; danach wurden aus beiden Fassungen alle
Kommentar- und Leerzeilen entfernt (`line.trim() !== '' && !startsWith('//')`) und die
Restzeilen verglichen:

```
Ergebnis: 11/11 Dateien unverändert; 2626 Codezeilen zeichengenau gleich.
```

Es ist also **keine** Codezeile hinzugekommen, verschwunden oder verschoben worden —
geändert wurden ausschließlich Kommentarzeilen (die Marken, der Zweckkommentar im Host,
und der jetzt falsche TODO in `dashboard/index.js`, der die Kopien benannte).

**(b) Die Registrierung wirkt unverändert.** Ein Harness rief die sechs echten
Host-Hälften (`packages/<dir>/index.js`) gegen einen Context, der jedes `inject` und
jedes `settings.configure` mitschreibt — vor und nach der Änderung:

```
packages/<dir>/index.js   inject(["settings"], fn)
                          settings.configure({"auto":false}, fiber=CTX_FIBER)
                          effect:ausgefuehrt        × 6 Dateien
```

Die beiden Protokolle sind byte-identisch (6 von 6). Diese Messung ist als Test
festgeschrieben (`scripts/gate/tests/plugin-idioms.test.mjs`, Zusage 8: „die sechs
Host-Hälften registrieren weiterhin genau einmal …"), der im CI ohne `node_modules`
**sichtbar** überspringt statt still grün zu werden.

Für die fünf Client-Hälften ist die dynamische Messung der bestehende
Client-Aktivierungstest: `node --test scripts/gate/tests/client-activation.test.mjs`
→ **6 bestanden, 0 rot** (unverändert). Er fährt das echte Bundle im `vm` und prüft
das Locale-Verhalten; ergänzend pinnt der neue Test, dass die Signatur nirgends
außerhalb eines generierten Blocks steht.

## 6. Bedienung (ab jetzt)

```bash
npm run idioms:check        # prüft: Deckungsgleichheit aller 12 Blöcke
npm run idioms              # schreibt die Blöcke aus der einen Quelle neu
```

Wer den Baustein ändern will, ändert **die Quelle** und lässt `npm run idioms` laufen;
zwischen den Marken von Hand zu editieren ist ein Befund, kein Weg. Der einmalige
Umzug war skriptgestützt (Marker setzen, Inhalt vom Generator schreiben) — danach ist
der Generator die einzige schreibende Instanz.

## 7. Was in diesem Durchlauf lief

| Lauf | Ergebnis | Exit |
|---|---|---|
| `npm run idioms:check` | 12 Blöcke in 11 Dateien deckungsgleich | 0 |
| `node scripts/dsh-test.mjs` | **99 bestanden, 0 fehlgeschlagen** (vorher 98/0) | 0 |
| `npm run gate:full` | **18 gelaufen, 0 geskippt, 0 fehlgeschlagen** (Zahl unverändert: die Prüfung sitzt in `host-half`/`client-half`) | 0 |
| `node --test scripts/gate/tests/plugin-idioms.test.mjs` | **9 bestanden, 0 rot** | 0 |
| `node --test scripts/gate/tests/client-activation.test.mjs` | 6 bestanden, 0 rot | 0 |
| `node --test scripts/gate/tests/*.test.mjs` (mit Repo-`dsh` zuerst im PATH) | **315 bestanden, 0 rot, 0 übersprungen** (vorher 306; ohne Repo-`dsh` zuerst im PATH rot in `message-ingress` — Umgebungs-Rot, siehe `docs/ZAHLEN.md` §2) | 0 |
| `node scripts/validate-test.mjs` | 9 bestanden, 0 fehlgeschlagen | 0 |
| `npm run test:codingmon` (liest das echte `packages/codingmon/client.js`) | **32 bestanden, 0 rot, 0 übersprungen** | 0 |
| `npm run build` | `dist/` mit 19 Paketen, 96 Dateien, 909635 Bytes (zweimal gemessen, identisch) | 0 |

## 8. Grenzen (nicht gelaufen, nicht behauptet)

- **`node scripts/pack-test.mjs` nicht gefahren:** je Paket ein `pnpm pack` plus ein
  isoliertes `npm install` — netzgebunden. Der Lauf war schon vor dieser Änderung rot
  (`project-index`) und bricht `npm test` ab (`docs/ZAHLEN.md` §2). Die Paketgrenze
  selbst ist oben in §2 stattdessen **direkt** gemessen (Tarball-Inhalt).
- **Kein Browser-Nachlauf.** Für die Client-Hälften gilt die Messung über den
  `vm`-Aktivierungstest; ein Lauf gegen `dsh --profile shinon` im Chromium war nicht
  Teil dieses Schritts.
- **`shinon-forge`-Reihenfolge der Regionen:** die Prüfung vergleicht die
  Marker-Reihenfolge mit der Deklaration; für `token-usage/client.js` liegen die zwei
  Regionen bewusst getrennt (Modulebene und `apply()`), dazwischen Prosa.
- **Drei `current`-Auditdokumente nennen weiterhin „98".** Sie beschreiben ihren
  Messzeitpunkt (Phase A, 2026-10-10, read-only) und werden hier nicht umgeschrieben:
  [docs/audit/VERIFICATION_MATRIX.md](VERIFICATION_MATRIX.md),
  [docs/audit/ARCHITECTURE_MAP.md](ARCHITECTURE_MAP.md). Die eine Zahl führt
  `docs/ZAHLEN.md`.
- **Nicht committet** (A6 offen), `main` unangetastet, `dist/` regeneriert (ignoriert).
- **`docs/INDEX.md` §3 listet dieses Dokument nicht.** Das ist keine Auslassung dieses
  Schritts: §3 führt die `docs/audit/`-Dokumente insgesamt nicht (zehn tun es heute
  nicht), die Statusregel aus §2 ist mit dem Kopfblock erfüllt. Erreichbar ist der
  Nachweis über `PLAN.md` 2.1, `docs/audit/CHANGELOG.md` und `WORKTREE_REVIEW.md` §6.
- **Fünf `docs/ZAHLEN.md`-Zeilen sind in diesem Schritt nachgezogen worden**, weil der
  Schritt sie bewegt: „Gate (statisch)" 98→99, „Gate-Tests" 306→315 (neun statt acht
  Tests in der neuen Datei), „Build (`dist/`)" 905294→909635 Bytes, „Markdown-Dokumente"
  32→44 und „Verweise in Markdown" 388→498 (beide mit dem jeweils angegebenen Befehl
  gemessen). Die beiden letzten waren **schon vor** diesem Schritt veraltet (die zehn
  übrigen `docs/audit/`-Dokumente kamen nach ihrer Messung dazu); sie stehen jetzt auf
  dem gemessenen Stand, weil dieses Dokument die Zahl sonst weiter verschiebt. Die
  dahinterliegende Frage aus `WORKTREE_REVIEW` §6 (**E7**, Umgang mit der
  Verweiszählung) ist damit faktisch geschlossen, als Entscheidung aber weiterhin die
  des Nutzers.
- **Eine weitere Zeile wurde nachgezogen, ohne dass dieser Schritt sie verursacht hat:**
  „Codingmon-Tests" stand auf „29 bestanden, 0 rot, 3 übersprungen" und steht jetzt auf
  dem in diesem Durchlauf gemessenen **32 bestanden, 0 rot, 0 übersprungen**. Die drei
  damaligen Sprünge waren Umgebungs-Sprünge (fehlendes `node_modules`), kein
  Testunterschied — die Zeile beschreibt jetzt den Lauf mit aufgelöstem Baum.

## 9. Angefasste Dateien

Neu: `scripts/lib/plugin-idioms.mjs`, `scripts/sync-idioms.mjs`,
`scripts/gate/tests/plugin-idioms.test.mjs`, dieses Dokument.
Generiert/geändert: die elf Paketdateien (§1), `scripts/dsh-test.mjs`,
`scripts/build.mjs`, `scripts/gate/plugins/host-half.mjs`,
`scripts/gate/plugins/client-half.mjs`, `scripts/lib/repo.mjs`, `package.json`
(zwei Skripte), `AGENTS.md`, `PLAN.md`, `docs/INDEX.md`, `docs/ZAHLEN.md`,
`docs/audit/CHANGELOG.md`, `docs/audit/WORKTREE_REVIEW.md` (§6 E4).
