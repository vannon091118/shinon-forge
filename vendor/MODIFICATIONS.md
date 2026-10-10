# vendor/ — herkunftsbelegter Fremdbaum

> **Status:** current — Änderungslog des vendorten DSH-Anteils. **Stand:** 2026-10-11
> **Einstieg:** `docs/INDEX.md` · **Zahlen des Repos:** `docs/ZAHLEN.md`

## Was hier liegt (und was nicht)

| Pfad | Inhalt | Herkunft |
|---|---|---|
| `vendor/dsh/` | das **veröffentlichte CLI-Paket** `@deepseek-ai/dsh` in der Fassung `0.2.1-alpha.2`, 20 Dateien (`lib/*.js`, `lib/types/*.d.ts`, `LICENSE`, `package.json`, `README*`) | Registry-Tarball, Integrität siehe `vendor/dsh/MANIFEST.json` |
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
npm pack @deepseek-ai/dsh@0.2.1-alpha.2 --pack-destination /tmp/vendor-dsh
tar -xzf /tmp/vendor-dsh/deepseek-ai-dsh-0.2.1-alpha.2.tgz -C /tmp/vendor-dsh
# → Dateiliste 20/20 identisch, sha256 je Datei identisch, 0 Abweichungen
```

Der `sha256` jeder Datei steht in `vendor/dsh/MANIFEST.json` — dieser Vergleich ist
damit jederzeit wiederholbar, ohne die Registry zu befragen.

**Warum kein Commit-Hash im Manifest steht:** die Registry veröffentlicht für
`0.2.1-alpha.2` **kein** `gitHead` (`npm view @deepseek-ai/dsh@0.2.1-alpha.2 gitHead`
→ leer). Belegbar sind Paketfassung, Tarball-Integrität (`sha512`), Shasum und der
Hash jeder Datei; ein Commit-Hash ist es nicht. Das Manifest sagt deshalb `null` und
nennt den Grund, statt einen Hash zu erfinden.

**Warum die Fassung eine andere ist als die installierte:** `node_modules/` trägt
weiterhin `0.2.1-alpha.1` (der Pin im Root-Manifest, `docs/ZAHLEN.md` §1). Vendort ist
die nächste Fassung `0.2.1-alpha.2`, aus der der Produkt-Startpfad entsteht. Beide
zugleich im Weg zu haben ist Absicht — die installierte Fassung bedient die
Prüfläufe, die vendorte ist die Vorlage für den Umbau. Wer den Startpfad auf
`vendor/dsh` umstellt, ohne den Ökosystem-Baum mitzuziehen, mischt zwei Fassungen:
`lib/bin.js` und `package.json` unterscheiden sich zwischen alpha.1 und alpha.2
(gemessen: genau diese zwei Dateien), und alle übrigen Dateien sind identisch.

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
node -p "require('./vendor/dsh/MANIFEST.json').files.length"   # 20
```

Wer den Vendoring-Stand erneuert, lädt den neuen Tarball, vergleicht die Dateiliste,
schreibt `MANIFEST.json` neu und trägt **hier** ein, was sich geändert hat — oder
schreibt ausdrücklich, dass sich an der Aussage „keine Änderungen" nichts ändert.
