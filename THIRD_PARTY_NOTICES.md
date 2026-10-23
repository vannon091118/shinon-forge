# Third-Party Notices — Shinon Forge

> **Status:** current — Fremdhinweise, getrennt vom eigenen Copyright. **Stand:** 2026-10-22
> **Einstieg:** `AGENTS.md` · **DSH-Pin:** `scripts/dsh-target-versions.json`

Dieses Repo ist ein Fork und bindet fremde Software ein. Eigener und fremder Text
bleiben getrennt (Entscheidung A12): unser Copyright steht in [`LICENSE`](LICENSE),
hier stehen die Fremdhinweise — unverändert, nicht zusammengefasst und nicht
umformuliert.

## 1. DeepSeek Harness (`@deepseek-ai/dsh`) — Abhängigkeit, nicht redistribuiert

- Fassung: **0.2.1-rc.2** · Lizenz: **MIT** · Herkunft: Registry-Tarball
  (`https://registry.npmjs.org/@deepseek-ai/dsh/-/dsh-0.2.1-rc.2.tgz`,
  `sha512-tvY+yhfKRifthbqPe/OK0AYxM5ZkvqfYq/jMYgJcEUxiRRL1Vwra3Ti5TB6AXgSWQdiPHYh/Vp6SJa9yHwMNuw==`)
- Diese Fassung entspricht dem Root-Pin, dem Lockfile und dem installierten
  CLI-Paket. Der Laufzeitresolver verwendet das Repo-Installat aus
  `node_modules`; eine vendorte Kopie gibt es seit dem 2026-10-23 **nicht**
  (kein Laufzeitcode lud sie). `npm run check:dsh-versions` prüft Pin, Lock,
  Integrität, Installat und `dsh --version` gegen dieselbe Sollquelle.
- Lizenztext: hier **wortgleich** wiedergegeben (MIT verlangt die Beibehaltung
  des Copyright- und Lizenzhinweises):

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

**Befund zum Vendoring (gemessen, nicht vermutet, Beleg: `docs/TAGEBUCH.md`, 2026-10-11):** Der Plan nannte
`LICENSE` **und** `THIRD_PARTY_NOTICES.md` als unverändert zu übernehmen. Das
veröffentlichte Paket liefert **kein** `THIRD_PARTY_NOTICES.md` aus: die damals
untersuchten Alpha-Tarballs `0.2.1-alpha.1` und `0.2.1-alpha.2` hatten je 20 Dateien;
keine trug diesen Namen (`lib/*.js`, `lib/types/*.d.ts`, `LICENSE`,
`package.json`, `README*`). Übernommen wurde deshalb **nur** die `LICENSE`
unverändert; statt einer erfundenen Datei steht hier der Befund. Ein
Copyleft-/Attributionskonflikt, der 3.2 stoppen müsste, ist **nicht** entstanden: MIT
verlangt die Beibehaltung des Copyright- und Lizenzhinweises, und genau der steht
oben.

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
