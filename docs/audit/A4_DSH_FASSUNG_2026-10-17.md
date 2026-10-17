# A4_DSH_FASSUNG_2026-10-17 — vier Quellen, eine Fassung

> **Status:** current — Nachweis zu Punkt A4 der Release-Abnahme (DSH-Fassung). **Stand:** 2026-10-17
> **Einstieg:** `docs/INDEX.md` · **Zahlen:** `docs/ZAHLEN.md` · **Festlegung:** `vendor/MODIFICATIONS.md`

**Ausgangsbefund (gemessen am 2026-10-17, vor dieser Änderung):** vier Stellen nannten
die DSH-Fassung, eine davon eine andere.

| Quelle | Wert vorher |
|---|---|
| Root-Pin (`package.json`) | `0.2.1-alpha.1` |
| Lockfile (`package-lock.json`) | `0.2.1-alpha.1` |
| vendorte Kopie (`vendor/dsh/MANIFEST.json`) | `0.2.1-alpha.2` |
| installierte Binary (`node_modules/.bin/dsh --version`) | `0.2.1-alpha.1` |
| eine **globale** Installation daneben (`dsh` ohne `node_modules/.bin`) | `0.2.0-rc.2` — nicht der Pin, und das bleibt so |

Dazu: **keine** Stelle im Laufzeitcode las `vendor/dsh` (Belege unten). Der Baum trug
also eine zweite Fassung, die niemand benutzte und die trotzdem wie ein Beleg aussah.

## Wie gemessen wurde

In einer **sauberen Kopie des Baums** (ohne `.git`, `node_modules`, `dist`, `logs`,
`sessions`, `storages`, `.env`), nicht im Arbeitsbaum:

```bash
npm ci                      # Exit 0, 736 Pakete in 19 s (npm 10.9.9)
export PATH="$PWD/node_modules/.bin:$PATH"
```

Laufzeit: Node **v22.23.3**. Das Repo-`dsh` steht damit **vor** jeder globalen
Installation im PATH. Die Ausgaben unten sind wörtlich; nur Pfade unter dem
Heimatverzeichnis sind als `$HOME/...` abgekürzt (die Doku führt keine lokalen Pfade).

## Die vier Befehle der Abnahme (wörtlich)

```text
$ node -p "require('./package.json').dependencies['@deepseek-ai/dsh']"
0.2.1-alpha.1

$ grep -m1 '"version"' vendor/dsh/MANIFEST.json
  "version": "0.2.1-alpha.1",

$ grep -A1 '"node_modules/@deepseek-ai/dsh"' package-lock.json
    "node_modules/@deepseek-ai/dsh": {
      "version": "0.2.1-alpha.1",

$ node_modules/.bin/dsh --version
0.2.1-alpha.1
```

Und die Herkunft der Laufzeit, aus dem Startpfad selbst:

```text
$ command -v dsh
/tmp/a4-clone/node_modules/.bin/dsh

$ node bin/shinon.mjs --check
✅ startfähig
   Einstieg:  /tmp/a4-clone/bin/shinon.mjs
   node:      v22.23.3 — $HOME/.local/share/mise/installs/node/22.23.3/bin/node
   sqlite:    3.51.3 (node:sqlite-Rauchtest bestanden)
   Range:     ^22.19.0 || >=24.0.0
   dsh:       0.2.1-alpha.1
   Herkunft:  Repo-Installat — /tmp/a4-clone/node_modules/@deepseek-ai/dsh
   Profil:    shinon
   DSH_HOME:  /tmp/a4-clone
   Index:     $HOME/.cache/shinon/indexes   (Cache — wiederherstellbar)
   Ledger:    $HOME/.local/share/shinon/ledger.sqlite   (Daten — nicht wegwerfbar)
   Installat: /tmp/a4-clone (= Arbeitsbaum)
```

## Die Prüfsummenkette

Der Tarball wurde nicht geglaubt, sondern nachgerechnet:

```bash
npm pack @deepseek-ai/dsh@0.2.1-alpha.1 --pack-destination /tmp/a4-pack
tar -xzf /tmp/a4-pack/deepseek-ai-dsh-0.2.1-alpha.1.tgz -C /tmp/a4-x
```

| Größe | Wert |
|---|---|
| `sha512` (base64) des Tarballs | `DJ8pwG/XqzwDrYQTgJXuIga6ku153Z4vJI/B3MzNtudVCkDaOf4O2pUQh1ToroLHPPe4mxhhFeNJ7ttNculqMw==` |
| `integrity` im Lockfile | **derselbe Wert** |
| `integrity` im Manifest | **derselbe Wert** |
| `sha1` des Tarballs | `4f0727d2b8b62d798cfbb5d5df0c797671a3a888` = Registry-`dist.shasum` |
| `sha256` des Tarballs | `857f93aa6c85cbd92be3422380e5516f236dc5c49cda0405a958cbdf1865e8db` |
| entpackte Größe | `73774` Bytes, **20** Dateien |
| Datei-Vergleich | 20/20 `sha256`-gleich mit `node_modules/@deepseek-ai/dsh` |
| `gitHead` | `null` — die Registry veröffentlicht für `0.2.1-alpha.1` keinen (`npm view` → leer) |

Die Kette ist damit geschlossen: das Manifest beschreibt **denselben** Tarball, den das
Lockfile installiert, und jede vendorte Datei ist die des Tarballs. `sha256` je Datei
steht in `vendor/dsh/MANIFEST.json`.

## Der Unterschied `0.2.1-alpha.1` → `0.2.1-alpha.2` (gemessen, nicht geschätzt)

Dateiliste identisch (20 Dateien), `sha256`-Vergleich je Datei: Unterschiede in **genau
zwei** Dateien.

| Datei | Unterschied |
|---|---|
| `lib/bin.js` | **eine Zeile**: alpha.2 ergänzt am `plugin`-Unterbefehl `helpOption("-h, --help", "show this help").passThroughOptions()` |
| `package.json` | Fassung; 72 geänderte `@deepseek-ai/*`-Pins; **5** Abhängigkeiten nur in alpha.1 (`dsh-hooks-claude-code`, `dsh-hooks-codex`, `dsh-tool-ralph`, `dsh-webhook`, `dsh-webhook-github`), **7** nur in alpha.2 (u. a. `dsh-experimental-cot-translation-bundle`, `dsh-experimental-session-titles-bundle`, `dsh-experimental-tool-worktree`); dazu ein anderes `devDependencies`-Block |

Der CLI-Unterschied ist also eine Hilfeflagge; der Preis liegt im Ökosystem-Baum.

## Welcher Code `vendor/` lädt: **keiner**

1. **Suche im Laufzeitcode.** `grep -rn "vendor/dsh" --include=*.mjs --include=*.js --include=*.json bin scripts packages profiles`
   → **ein** Treffer, und das ist ein Kommentar in `bin/shinon.mjs`. Kein Import, kein
   `require`, kein Pfad-Aufbau.
2. **Der Resolver.** `localRootCandidates()` in `scripts/lib/dsh.mjs` kennt zwei lokale
   Pfade: `<Root>/node_modules/@deepseek-ai/dsh` (existiert, gewinnt) und
   `<Root>/starter/vendor/@deepseek-ai/dsh` (`starter/` existiert nicht — dort legt erst
   Stufe 2 des Starter-Plans den Sidecar ab). `vendor/dsh` steht nicht auf der Liste.
3. **Die Herkunft.** `dshSource()` stuft Wurzeln unter `<Root>/vendor` oder
   `<Root>/starter` als `Vendor` ein; über die lokalen Kandidaten ist `ROOT/vendor` dafür
   nicht erreichbar (nur über einen PATH-Shim dorthin, und der verlangt
   `SHINON_ALLOW_PATH_DSH=1`). Der Startpfad meldet deshalb `Repo-Installat`.

Die vollständige Festlegung, samt der Folge für jeden, der `vendor/dsh` ändert, steht in
[`vendor/MODIFICATIONS.md`](../../vendor/MODIFICATIONS.md).

## Warum die Richtung `0.2.1-alpha.1` ist

- **Es läuft die Pin-Fassung.** Der Startpfad meldet Herkunft `Repo-Installat` und
  `dsh: 0.2.1-alpha.1`; gegen diese Fassung sind alle Messungen dieses Repos entstanden.
- **Eine Zusage hängt hart an der Fassung.** `scripts/gate/tests/message-ingress.test.mjs`
  hält `VERIFIED_DSH_VERSION = '0.2.1-alpha.1'` und verweigert die Zusage, sobald der
  geladene Harness eine andere Fassung ist („die Zusagen dieses Tests müssen neu gemessen
  werden, statt still weiterzugelten“). Ein Pin-Wechsel ist keine Zeile, sondern eine
  Neumessung.
- **Ein Umzug zieht den ganzen Baum mit.** Die alpha.2-Abhängigkeiten nennen durchweg
  `0.2.1-alpha.2`; Pin, Lock und die rund 260 `@deepseek-ai/*`-Pakete müssten zusammen
  wandern, und `npm ci` (Punkt A6) wäre bis zur neuen Lock-Datei nicht mehr grün.

## Die andere Richtung — offen, und zwar beim Eigentümer

Ein Umzug auf `0.2.1-alpha.2` ist **nicht** widerlegt, nur nicht klein. Gemessener Preis:
(1) `@deepseek-ai/dsh` **und** den Ökosystem-Baum in dieser Fassung installieren,
(2) `package-lock.json` neu erzeugen und `npm ci` wieder auf Exit 0 bringen,
(3) die an alpha.1 gemessenen Zusagen neu messen (mindestens `message-ingress`) und die
Dump-Zahlen in `docs/ZAHLEN.md` §2 nachziehen.

Der Satz „`0.2.1-alpha.2` als Basis“ in `PLAN.md` A2 meint den **Upstream-Stand der
Oberfläche** (`ui-theme`, `ui-brand-official`, `locale`, `docs/audit/UPSTREAM_DIFF.md`) —
nicht das CLI, das dieses Repo zur Laufzeit startet. Beide Rollen sind jetzt getrennt
benannt; die Entscheidung über die Produktbasis bleibt die des Eigentümers.

Zur Rekonstruktion der verworfenen Kopie: `@deepseek-ai/dsh@0.2.1-alpha.2` hatte
`integrity sha512-CkRE0uAOg2ldL2VpfF4cNRsl178CH5nM+8YklPrlMZl5ln0KhVfd42dJuRlgOXZmkpizCRvrVS8LAL+GKfgk0w==`,
`shasum 7acc898e09c4cd0678ab8bf5ee1029ee9c25a026`, Tarball-`sha256`
`e4cad394413d6af93cc1fab8d198ef995e1ba7cbd7bc43386df5ed7ef4b692d0` — sie steht in der
Git-Historie in `vendor/dsh/MANIFEST.json` bis Commit `130bf3f`.

## Was jetzt fail-closed ist

`scripts/gate/tests/dsh-pin.test.mjs` (4 Tests, **kein** Skip, kein Netz) pinnt:

1. Root-Pin und Lock nennen dieselbe Fassung, und das Lock zeigt auf deren Tarball,
2. Manifest und `vendor/dsh/package.json` nennen sie ebenfalls,
3. die `integrity` im Manifest ist die des Locks — derselbe Tarball, nicht ein zweiter,
4. jede vendorte Datei trägt `sha256` und Größe aus dem Manifest; keine fehlt, keine ist übrig.

Mutationsproben (jeweils in `scripts/gate/tests/dsh-pin.test.mjs`, danach zurückgesetzt):

| Mutation | Ergebnis |
|---|---|
| ein Byte an `vendor/dsh/LICENSE` angehängt | Test 4 rot, **Exit 1** |
| `vendor/dsh/package.json` auf `0.2.1-alpha.2` gebumpt | Tests 2 und 4 rot, **Exit 1** |
| Root-Pin auf `0.2.1-alpha.2` gebumpt | Tests 1 und 2 rot, **Exit 1** |
| zurückgesetzt | 4/4 grün, **Exit 0** |

Bewusst **nicht** im Test: die installierte Binary. Sie ist nicht Teil des Baums (CI hat
kein `node_modules`); ein Test, der dort sichtbar überspringt, verletzt die Zusage „kein
Skip“ aus B2. Die Gleichheit von Pin und Installation prüft `message-ingress`, wo der
Harness wirklich da ist.

## Grenzen dieses Nachweises

- **Kein Browser, kein Modell.** Gemessen ist die Auflösung und der Startpfad (`--check`),
  kein vollständiger Boot mit UI.
- **Die globale Installation daneben bleibt `0.2.0-rc.2`** und ist Absicht: sie ist nicht
  der Pin, und die Prüfläufe setzen `node_modules/.bin` davor (`docs/ZAHLEN.md` §1).
- **`starter/vendor/@deepseek-ai/dsh` existiert weiterhin nicht.** Der Kandidat im
  Resolver ist für Stufe 2 des Starter-Plans vorgesehen; bis dahin ist er ein
  Vorgriff, kein Zustand.
