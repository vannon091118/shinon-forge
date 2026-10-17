# vendor/ — herkunftsbelegter Fremdbaum

> **Status:** current — welche Fassung hier liegt und wer sie liest. **Stand:** 2026-10-17
> **Einstieg:** `docs/INDEX.md` · **Zahlen des Repos:** `docs/ZAHLEN.md`
> **Nachweis mit den wörtlichen Befehlsausgaben:** `docs/audit/A4_DSH_FASSUNG_2026-10-17.md`

## Die eine Fassung (A4 der Release-Abnahme)

Vier Stellen nennen dieselbe Fassung. Gemessen am 2026-10-17, mit `node_modules/.bin`
**vor** dem PATH:

| Quelle | Befehl | Ausgabe |
|---|---|---|
| Root-Pin | `node -p "require('./package.json').dependencies['@deepseek-ai/dsh']"` | `0.2.1-alpha.1` |
| Lock | `grep -A1 '"node_modules/@deepseek-ai/dsh"' package-lock.json` | `0.2.1-alpha.1` |
| vendorte Fassung | `grep -m1 '"version"' vendor/dsh/MANIFEST.json` | `0.2.1-alpha.1` |
| installierte Binary | `node_modules/.bin/dsh --version` | `0.2.1-alpha.1` |

Dazu der Integritätsnachweis des Tarballs: sein `sha512` ist **byte-gleich** mit dem
`integrity`-Feld des Locks (`sha512-DJ8pwG/XqzwDrYQTgJXuIga6ku153Z4vJI/B3MzNtudVCkDaOf4O2pUQh1ToroLHPPe4mxhhFeNJ7ttNculqMw==`),
sein `sha1` gleich dem Registry-`shasum` (`4f0727d2b8b62d798cfbb5d5df0c797671a3a888`),
und jede der 20 vendorten Dateien ist **byte-identisch** mit der installierten Fassung.

## Welcher Code lädt `vendor/`? — **keiner.** (gemessen, nicht vermutet)

Die Frage ist beantwortet, und die Antwort hat drei Teile:

1. **Kein Laufzeitmodul liest den Pfad.** Die Suche über den ganzen Laufzeitcode
   (`grep -rn "vendor/dsh" --include=*.mjs --include=*.js --include=*.json bin scripts packages profiles`)
   findet in `bin/`, `scripts/`, `packages/` und `profiles/` **einen** Treffer — einen
   Kommentar in `bin/shinon.mjs`. Kein Import, kein `require`, kein Pfad-Aufbau.
2. **Der Resolver bietet zwei lokale Kandidaten, den vendorten nicht.**
   `localRootCandidates()` in `scripts/lib/dsh.mjs` kennt genau zwei Pfade:
   `<Root>/node_modules/@deepseek-ai/dsh` (existiert, gewinnt) und
   `<Root>/starter/vendor/@deepseek-ai/dsh` (`starter/` existiert im Baum nicht — dort
   legt erst Stufe 2 des Starter-Plans den Sidecar ab). `vendor/dsh` steht **nicht** auf
   der Liste. Der Startpfad meldet deshalb `Herkunft: Repo-Installat` und
   `dsh: 0.2.1-alpha.1` aus dem Installat, nicht aus `vendor/`.
3. **Die Herkunfts-Klasse `Vendor` ist für `starter/` gebaut.** `dshSource()` stuft
   Wurzeln unter `<Root>/vendor` oder `<Root>/starter` als `Vendor` ein; über die lokalen
   Kandidaten ist `ROOT/vendor` dafür nicht erreichbar (nur über einen PATH-Shim dorthin,
   und der verlangt `SHINON_ALLOW_PATH_DSH=1`).

**Folge, die man kennen muss:** wer `vendor/dsh` ändert, ohne Pin oder Lock zu ändern,
ändert das Verhalten der Laufzeit **nicht** — er ändert diesen Beleg und den Test
`scripts/gate/tests/dsh-pin.test.mjs`, der genau deshalb fail-closed ist. Wer eine
vendorte Fassung zur Laufzeit haben will, trägt sie in `dshRoot()` als Kandidaten ein;
das ist eine Entscheidung mit Laufzeitfolge und passiert nicht als Nebenwirkung.

## Warum die vendorte Fassung die des Pins ist — und nicht `0.2.1-alpha.2`

Der Baum trug bis zum 2026-10-17 die Fassung `0.2.1-alpha.2`: Pin und Lock nannten
`0.2.1-alpha.1`, die Laufzeit lud `0.2.1-alpha.1` — und `vendor/dsh` stand daneben als
zweite Fassung im Weg. Drei gemessene Gründe haben die Richtung entschieden:

- **Es läuft die Pin-Fassung.** `node bin/shinon.mjs --check` meldet Herkunft
  `Repo-Installat` und `dsh: 0.2.1-alpha.1`; `0.2.1-alpha.1` ist damit die Fassung, gegen
  die jede Messung dieses Repos entstanden ist.
- **Eine Zusage hängt hart an der Fassung.** `scripts/gate/tests/message-ingress.test.mjs`
  hält `VERIFIED_DSH_VERSION = '0.2.1-alpha.1'` und **verweigert** die Zusage, wenn der
  geladene Harness eine andere Fassung ist („die Zusagen dieses Tests müssen neu gemessen
  werden, statt still weiterzugelten"). Ein Pin-Wechsel ist deshalb keine Zeile, sondern
  eine Neumessung.
- **Die Fassungen sind nah beieinander, aber nicht austauschbar.** Gemessen
  (Dateiliste und `sha256` je Datei gegen beide Tarballs): identische Dateiliste (20),
  Unterschiede in **genau zwei** Dateien — `lib/bin.js` (eine Zeile: alpha.2 ergänzt
  `helpOption("-h, --help", "show this help").passThroughOptions()` am
  `plugin`-Unterbefehl) und `package.json` (Fassung, 72 geänderte `@deepseek-ai/*`-Pins,
  5 Abhängigkeiten nur in alpha.1, 7 nur in alpha.2, dazu ein anderes
  `devDependencies`-Block). Ein Umzug nach alpha.2 zieht also den ganzen
  Ökosystem-Baum mit.

### Die andere Richtung, mit ihrem Preis (Entscheidung des Eigentümers, nicht gefallen)

Ein Umzug auf `0.2.1-alpha.2` ist möglich und **nicht** widerlegt — er ist nur nicht
klein. Was er verlangt, gemessen: (1) `@deepseek-ai/dsh` **und** die rund 260 Pakete unter
`@deepseek-ai/*` in dieser Fassung installieren (die alpha.2-Abhängigkeiten nennen
durchweg `0.2.1-alpha.2`), (2) `package-lock.json` neu erzeugen und `npm ci` wieder auf
Exit 0 bringen, (3) die an alpha.1 gemessenen Zusagen neu messen — mindestens
`message-ingress`, dazu die Dump-Zahlen (`docs/ZAHLEN.md` §2: andere Fassung, andere
Eintragszahl). Der Hinweis „`0.2.1-alpha.2` als Basis" in `PLAN.md` A2 meint etwas
anderes: dort geht es um den **Upstream-Stand der Oberfläche** (`ui-theme`,
`ui-brand-official`, `locale`, `docs/audit/UPSTREAM_DIFF.md`) — nicht um das CLI, das
dieses Repo zur Laufzeit startet. Die beiden Dinge sind hier getrennt benannt, statt
einander zu widersprechen.

## Was hier liegt (und was nicht)

| Pfad | Inhalt | Herkunft |
|---|---|---|
| `vendor/dsh/` | das **veröffentlichte CLI-Paket** `@deepseek-ai/dsh` in der Fassung `0.2.1-alpha.1`, 20 Dateien (`lib/*.js`, `lib/types/*.d.ts`, `LICENSE`, `package.json`, `README*`) | Registry-Tarball, Integrität siehe `vendor/dsh/MANIFEST.json` |
| `vendor/dsh/MANIFEST.json` | Herkunft, Fassung, Integrität, `sha256` **je Datei** | erzeugt aus dem Tarball (nicht abgetippt) |

**Nicht** vendort ist der Ökosystem-Baum: die 260 Pakete unter `@deepseek-ai/*`
(rund 273 MiB im Arbeitsbaum) bleiben npm-Abhängigkeiten und werden aus dem
Root-Lockfile installiert. Vendort ist genau der **Startpfad** (das CLI-Paket), der
später den Produkt-Einstieg trägt — nicht der Katalog an Bundles, die ein Profil
auswählen kann. Wer den Umfang ändert, ändert zuerst `vendor/dsh/MANIFEST.json` und
dann diesen Absatz.

## Änderungen am vendorten Baum

**Keine.** Jede der 20 Dateien ist **byte-identisch** zum Registry-Tarball. Nachweis
(nachgestellt, nicht behauptet):

```bash
# Tarball laden und Datei für Datei gegen vendor/ vergleichen
npm pack @deepseek-ai/dsh@0.2.1-alpha.1 --pack-destination /tmp/vendor-dsh
tar -xzf /tmp/vendor-dsh/deepseek-ai-dsh-0.2.1-alpha.1.tgz -C /tmp/vendor-dsh
# → Dateiliste 20/20 identisch, sha256 je Datei identisch, 0 Abweichungen
```

Der `sha256` jeder Datei steht in `vendor/dsh/MANIFEST.json` — dieser Vergleich ist
damit jederzeit wiederholbar, ohne die Registry zu befragen, und
`scripts/gate/tests/dsh-pin.test.mjs` führt ihn bei jedem `npm run gate:test` aus.

**Warum kein Commit-Hash im Manifest steht:** die Registry veröffentlicht für
`0.2.1-alpha.1` **kein** `gitHead` (`npm view @deepseek-ai/dsh@0.2.1-alpha.1 gitHead`
→ leer, ebenso wie für alpha.2). Belegbar sind Paketfassung, Tarball-Integrität
(`sha512`), Shasum und der Hash jeder Datei; ein Commit-Hash ist es nicht. Das Manifest
sagt deshalb `null` und nennt den Grund, statt einen Hash zu erfinden.

## Lizenz und Attribution

`vendor/dsh/LICENSE` ist **unverändert** übernommen (MIT, „Copyright (c) 2026
DeepSeek"). Ein `THIRD_PARTY_NOTICES.md` **gibt es im veröffentlichten Paket nicht**
(gemessen: 20 Dateien im Tarball, keine mit diesem Namen) — die Vorgabe, es
unverändert zu übernehmen, ist damit nicht erfüllbar; statt einer Erfindung steht der
Befund samt Lizenztext in [`THIRD_PARTY_NOTICES.md`](../THIRD_PARTY_NOTICES.md) im
Repo-Root. Eigener Code und Fremdtext bleiben getrennt: unser Copyright steht in
[`LICENSE`](../LICENSE), die Fremdhinweise in `THIRD_PARTY_NOTICES.md`.

## Prüfbefehl

```bash
node -p "require('./vendor/dsh/MANIFEST.json').files.length"          # 20
node --test scripts/gate/tests/dsh-pin.test.mjs                       # Fassung + sha256 je Datei
```

Wer den Vendoring-Stand erneuert, lädt den neuen Tarball, vergleicht die Dateiliste,
schreibt `MANIFEST.json` neu und trägt **hier** ein, was sich geändert hat — oder
schreibt ausdrücklich, dass sich an der Aussage „keine Änderungen" nichts ändert.
Und er zieht die vier Quellen oben auf **eine** Fassung: das ist der Punkt A4 der
Release-Abnahme.
