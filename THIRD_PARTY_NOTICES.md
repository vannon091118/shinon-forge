# Third-Party Notices — Shinon Forge

> **Status:** current — Fremdhinweise, getrennt vom eigenen Copyright. **Stand:** 2026-10-11
> **Einstieg:** `docs/INDEX.md` · **Änderungslog des Vendoring-Stands:** `vendor/MODIFICATIONS.md`

Dieses Repo ist ein Fork und bindet fremde Software ein. Eigener und fremder Text
bleiben getrennt (Entscheidung A12): unser Copyright steht in [`LICENSE`](LICENSE),
hier stehen die Fremdhinweise — unverändert, nicht zusammengefasst und nicht
umformuliert.

## 1. DeepSeek Harness (`@deepseek-ai/dsh`) — vendort

- Fassung: **0.2.1-alpha.2** · Lizenz: **MIT** · Herkunft: Registry-Tarball
  (`https://registry.npmjs.org/@deepseek-ai/dsh/-/dsh-0.2.1-alpha.2.tgz`,
  `sha512-CkRE0uAOg2ldL2VpfF4cNRsl178CH5nM+8YklPrlMZl5ln0KhVfd42dJuRlgOXZmkpizCRvrVS8LAL+GKfgk0w==`)
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

**Befund zum Plan (gemessen, nicht vermutet):** `PLAN.md` Schritt 3.2 nennt
`LICENSE` **und** `THIRD_PARTY_NOTICES.md` als unverändert zu übernehmen. Das
veröffentlichte Paket liefert **kein** `THIRD_PARTY_NOTICES.md` aus: der Tarball hat
20 Dateien, keine trägt diesen Namen (`lib/*.js`, `lib/types/*.d.ts`, `LICENSE`,
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
