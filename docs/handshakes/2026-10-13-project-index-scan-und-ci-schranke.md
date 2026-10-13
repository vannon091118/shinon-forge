# Handshake — Projektindex-Scan, Aktivierungsnachweis und CI-Schranke

> **Status:** current — Übergabe dieses Durchgangs: was gebaut, was gemessen, was grün und was rot ist. **Stand:** 2026-10-13
> **Einstieg:** `docs/INDEX.md` · **Zahlen:** `docs/ZAHLEN.md`

Ein Handshake ist die Antwort auf eine Frage, die man nach vier Wochen stellt:
**„Was ist jetzt wahr, und woran sehe ich das?"** Er ersetzt keinen Nachweis, er
zeigt auf ihn.

## 1. Was in diesem Durchgang gebaut wurde

| Datei | Änderung |
|---|---|
| `packages/project-index/assets/index-core.js` | `listFiles(root, extensions, onError)` meldet unlesbare **Ordner** statt wortlos umzukehren und sortiert das Ergebnis global nach Pfad (Reihenfolge = Funktion der Dateimenge, nicht des Durchlaufs); `readTextWithReason` trennt `VERSCHWUNDEN`, `KEINE_DATEI`, `ZU_GROSS`, `NICHT_LESBAR`; `updateIndex` trägt `report.scanErrors = [{ path, reason, detail }]`; `openIndex` setzt `pragma synchronous = full` **selbst** statt es von der Laufzeit zu erben |
| `packages/project-index/index.js` | die Berichtszeile nennt jeden Ausschluss mit Grund **und Pfad** (`scanErrorSummary`, höchstens fünf namentlich, der Rest gezählt) |
| `scripts/gate/tests/project-index.test.mjs` | fünf neue Zusagen: Reihenfolge, unlesbarer Ordner, unlesbare Datei, Berichtszeile, Persistenz-Politiken (43 Tests in der Datei, davon 1 Umgebungs-rot) |
| `scripts/index-scan-cost.mjs` | **neu**: die Messung des Startscans als Befehl (drei getrennte Kosten + Timer-Ticks) — die Zahl stand vorher nur als Kommentar im Code |
| `docs/probes/project-index-startscan.json` | **neu**: die Probe mit Rohwerten, Methode und Grenzen |
| `PLAN.md` §9 | **neu**: Abnahme je offener Funktion, vorab festgehalten |
| `docs/CI.md` | **neu**: der Verdict-Job und der Name, den eine Branch-Regel verlangen muss |

## 2. Was gemessen ist (mit Befehl)

| Aussage | Befehl | Ergebnis |
|---|---|---|
| Startscan dieses Repos (353 Dateien) | `node scripts/index-scan-cost.mjs` | kalt **2627 ms** (349 geschrieben, 3 283 899 Bytes, 40 653 Referenzen), unverändert **21 ms** (0 Bytes), Mount **1 ms**, Bericht nach 2856 ms |
| Blockiert der Lauf die Agent-Schleife? | derselbe Lauf, `setInterval(…, 1)` als Zähler | Worker **2381** Ticks, Host **0** — im Host steht die Schleife still |
| Gate-Tests gesamt | `npm run gate:test` | **464** Tests, **457** grün, **7** rot, 0 übersprungen |
| Dieselben 7 Roten wie HEAD? | `git worktree`/`git stash` auf den Stand ohne diese Änderung | **ja** — 6× `prompter-contract.test.mjs`, 1× `project-index.test.mjs` (Extraktion an echten Dateien); Ursache Node v24 statt v22, kein Code-Rot |
| Statisches Gate + alle 21 Gates | `npm run gate:full` | **Exit 0**, 21 gelaufen, 0 geskippt, 1 `NOT_APPLICABLE` (`typescript`), 0 fehlgeschlagen |
| Key-Router und Popup vollständig? | `node --test packages/key-router/test/*.test.mjs packages/popup/test/*.test.mjs` und die drei Gate-Testdateien | **29/29** Paket-Tests, **15/15** Gate-Tests (Sicherheitsvertrag 6, Provider-Override 3, Overlay 6) |
| Proben strukturell gültig? | `probe-twin` in `gate:full` | 0 Befunde bei **29** Proben |

## 3. Was rot oder ungeprüft bleibt (ehrlich, in dieser Reihenfolge)

1. **7 Gate-Tests rot** — Umgebungs-Rot (Node v24.21.0 statt v22.23.3), identische
   Namen ohne diese Änderung. Kein neues Rot.
2. **`gate:full --branding` nicht gelaufen** — braucht `npm run build` und Chromium.
   Das Popup-Overlay ist im Cordis-Baum und im Wirtsgraphen geprüft, **nicht** im
   Browser gemalt.
3. **Echte 429-Rotation des Key-Routers nicht gemessen** — dafür bräuchte es zwei
   echte Schlüssel und einen erzwungenen 429. Der Override selbst ist gepinnt.
4. **Branch-Regel nicht gesetzt** — `docs/CI.md` §2 nennt den Namen
   (`Verdikt (fail-closed)`) und den Nachkontroll-Befehl; ob sie in GitHub steht,
   ist von hier aus nicht lesbar. Die Schranke ist gebaut, nicht scharf.
5. **Die drei zurückgestellten Phasen** (5.1–5.3, 8.1–8.4) bleiben gegated; ihre
   Abnahme steht ab jetzt in `PLAN.md` §9, nicht in diesem Dokument.

## 4. Der eine Satz für die Übergabe

Der Projektindex benennt seine Ausschlüsse und ordnet seine Dateien deterministisch,
seine Startkosten sind als drei getrennte Zahlen gemessen statt behauptet, die
Gate-Suite hat **keinen neuen roten Namen** gegenüber dem Stand davor, und die CI
hat einen einzigen Namen, den `main` verlangen kann — gesetzt ist er noch nicht.
