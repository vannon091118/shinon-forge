# Third-Party Notices — Shinon Forge

> **Status:** current — Fremdhinweise, getrennt vom eigenen Copyright. **Stand:** 2026-10-17
> **Einstieg:** `docs/INDEX.md` · **Änderungslog des Vendoring-Stands:** `vendor/MODIFICATIONS.md`

Dieses Repo ist ein Fork und bindet fremde Software ein. Eigener und fremder Text
bleiben getrennt (Entscheidung A12): unser Copyright steht in [`LICENSE`](LICENSE),
hier stehen die Fremdhinweise — unverändert, nicht zusammengefasst und nicht
umformuliert.

## 1. DeepSeek Harness (`@deepseek-ai/dsh`) — vendort

- Fassung: **0.2.1-alpha.1** · Lizenz: **MIT** · Herkunft: Registry-Tarball
  (`https://registry.npmjs.org/@deepseek-ai/dsh/-/dsh-0.2.1-alpha.1.tgz`,
  `sha512-DJ8pwG/XqzwDrYQTgJXuIga6ku153Z4vJI/B3MzNtudVCkDaOf4O2pUQh1ToroLHPPe4mxhhFeNJ7ttNculqMw==`)
- Diese Fassung ist **dieselbe wie der Root-Pin, das Lockfile und die installierte
  Binary** (A4 der Release-Abnahme; welcher Code `vendor/` lädt und warum die frühere
  `0.2.1-alpha.2` hier nicht mehr liegt: [`vendor/MODIFICATIONS.md`](vendor/MODIFICATIONS.md))
- Ort der Kopie: [`vendor/dsh/`](vendor/dsh/) — 20 Dateien, byte-identisch zum Tarball
  (`sha256` je Datei in [`vendor/dsh/MANIFEST.json`](vendor/dsh/MANIFEST.json))
- Lizenztext: übernommen als [`vendor/dsh/LICENSE`](vendor/dsh/LICENSE) und hier
  **wortgleich** wiedergegeben:

```
MIT License

Copyright (c) 2026 DeepSeek

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

**Befund zum Vendoring (gemessen, nicht vermutet, Beleg: `docs/CHANGELOG.md`):** Der Plan nannte
`LICENSE` **und** `THIRD_PARTY_NOTICES.md` als unverändert zu übernehmen. Das
veröffentlichte Paket liefert **kein** `THIRD_PARTY_NOTICES.md` aus: der Tarball hat
20 Dateien — bei `0.2.1-alpha.1` wie bei `0.2.1-alpha.2`, keine trägt diesen Namen (`lib/*.js`, `lib/types/*.d.ts`, `LICENSE`,
`package.json`, `README*`). Übernommen wurde deshalb **nur** die `LICENSE`
unverändert; statt einer erfundenen Datei steht hier der Befund. Ein
Copyleft-/Attributionskonflikt, der 3.2 stoppen müsste, ist **nicht** entstanden: MIT
verlangt die Beibehaltung des Copyright- und Lizenzhinweises, und genau der steht
oben und in `vendor/dsh/LICENSE`.

## 2. Der Ökosystem-Baum (`@deepseek-ai/*`) — npm-Abhängigkeit, nicht redistribuiert

Die Bundles (`dsh-base`, `dsh-web-app`, `dsh-llm-pi-ai`, die `dsh-tool-*`-Familie …)
werden **nicht** mitgeliefert, sondern aus der Registry installiert; jedes Paket bringt
seine eigene `LICENSE` mit, die beim Install im Arbeitsbaum liegt. Wir geben sie
hier nicht wieder, weil wir sie nicht weitergeben — wer den Baum installiert, erhält
die Hinweise des Pakets selbst. Einzige Ausnahme in dieser Umgebung (kein DSH-Paket):
`@deepseek-ai/libreoffice-kit` liefert eine Datei `NOTICE` mit; auch sie bleibt beim
Install an ihrem Ort.

## 3. Was dieses Repo dazugibt

Eigener Code: MIT, `Copyright (c) 2026 Vannon` — siehe [`LICENSE`](LICENSE). Die
Produktnamen-Fläche („Shinon Forge") ist davon nicht berührt; der fremde
Produktname steht nur dort, wo Herkunft und Lizenz es verlangen (Fork-Aussage in
[`README.md`](README.md) / [`AGENTS.md`](AGENTS.md), Upstream-Doku-Links,
Audit-Dokumente).
