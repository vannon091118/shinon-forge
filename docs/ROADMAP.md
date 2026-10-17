# Roadmap — Versionen und Release-Ziele

> **Status:** plan — wohin das Repo geht, was ein Release kostet, was 1.0 bedeutet. **Stand:** 2026-10-17
> **Einstieg:** `docs/INDEX.md` · **Zahlen:** `docs/ZAHLEN.md`

Eine Roadmap, die Bestands- und Testergebnisse wiederholt, veraltet bei der nächsten Messung.
Harte Zahlen und Messungen stehen ausschließlich in `docs/ZAHLEN.md`; konkrete Abnahmen
stehen in `PLAN.md` §9. Diese Datei benennt nur Release-Ziele und Versionsbedeutungen.

## 1. Versionsordnung (eine Regel, zwei Zeilen)

- **Root** (`package.json`, Lock-Kopf in `package-lock.json` trägt denselben Wert):
  Semver auf der `0.x`-Linie. **Minor** = ein Feature-Batch mit neuen Zusagen und
  neuen Tests (Beispiel: `0.3.0`, Commit `3add487`). **Patch** = Korrekturen und
  Doku ohne neue Zusagen. Ein Bump ist ein Commit wie jeder andere: mit
  Trailer, Wächter und grünem CI-Lauf — kein Nebenkanal.
- **Pakete** (`packages/*/package.json`): genau zwei Zeilen, und sie werden
  **nicht** einzeln gebumpt. `1.0.0` für ausgelieferte Pakete, `0.1.0` für
  Vorbereitung (`dsh.inactive` im eigenen Manifest) — entschieden vom Paket
  selbst, geprüft vom `doctor` (`scripts/gate/plugins/doctor.mjs`).

## 1.5 Release-Freeze v0.4.0 (kanonische Entscheidung, 2026-10-17)

**Eingefroren:** `v0.4.0` unterstützt genau einen Installationsweg — den
**Quellklon** (`git clone`, `npm ci`, `npm run profile:links`, Profil-Dump,
UI-Start, `shinon doctor` read-only). Der Freeze ist eine Entscheidung, kein
Messwert: **kein Feature-Wunsch wird nachträglich in v0.4.0 gezogen.**

**Außerhalb des Freeze (Ziel v0.5.0 oder später, nur als Folgearbeit
dokumentiert):** `shinon update` (Forge-Selbstupdate), persistentes
`shinon autoupdate`, `.deb`-Bau/Installation (`npm run deb` existiert nicht als
Script-Eintrag), Live-429-Rotation mit zwei echten Schlüsseln,
Mobile/Android, Desktop-Shell, Rust-/Single-Binary-Port, Vollbenchmark und
QoL-Top-10. Die Liste steht hier, damit ein Implementierungsauftrag sie nicht
versehentlich vorzieht.

**Release-Checkliste (Abnahme je Pflicht):** Freeze-Dokumentation hier +
`PLAN.md` §9.1, Workspace-Isolation (S1, rot-bei-Mutation), Quellklon-Repro
(S3), read-only Doctor (S4), Gates + Version/Tag/Lock + Quellarchiv + SHA-256
(S5), echter Modellturn + Audit + CI-Run-ID (S6). `UNGEPRÜFT` ist kein Pass.

Die Abnahme je Pflicht steht als Tabelle in `PLAN.md` §9.1 (Punkt, Befehl,
Exit, Ergebnis); die gemessenen Zahlen dazu stehen ausschließlich in
`docs/ZAHLEN.md` §2. Ein Punkt ohne dort belegten Lauf ist offen — auch dann,
wenn der Code dafür schon existiert.

## 2. Historie (gemessen, nicht erzählt)

| Fassung | Commit | Inhalt |
|---|---|---|
| `0.2.0` | `ffbf721` | bootfähig, Brand-Overlay live, Gate-Engine, Verträge |
| `0.3.0` | `3add487` | Skill-Selektion + Persona Du-Form + Profil-Update |
| `0.4.0` | dieser Durchgang | Draht-E2E (`scripts/gate/tests/key-router-wire.test.mjs`), Audit Phase B (`docs/archive/AUDIT_2026-10-13.md`), Pfad-Heilung 33→24, CI-Verdict-Kette mit Run-IDs |

Abnahme von `0.4.0`: grüner CI-Lauf des Bump-Commits (inkl. `Verdikt (fail-closed)`)
plus `gate:full` PASS lokal — die Run-ID meldet der Durchgang, nicht dieses
Dokument (eine vorab eingetragene Nummer wäre eine Behauptung).

## 3. Release-Ziele `0.5.0` (Kandidaten, keine Versprechen)

Jeder Punkt hat seine Abnahme bereits — in `PLAN.md` §9 oder im
Sieben-Lücken-Handshake (`docs/archive/2026-10-13-ci-lauf-gruen-verdict-schranke-und-sieben-luecken.md`
§3). Hier steht nur die Liste, damit ein Blick genügt:

- Live-429-Rotation mit zwei echten Schlüsseln (ZAHLEN §4: weiter offen)
- ~~Echter Modell-Turn 3.9~~ — **kein 0.5.0-Kandidat:** der Turn ist v0.4.0-Pflicht
  (§1.5, PLAN §9.1); ein Release ohne ihn bleibt `UNGEPRÜFT` und damit kein Go.
- Mobile-first-Prototyp: eigenes schlankes Profil, responsive Client-Schicht, profil-/UI-/Security-CI-Gates und validierte Android-Runtime-Strategie ([docs/MOBILE-PLAN.md](MOBILE-PLAN.md)); kein globaler Paket-Cut vor Messung.
- §19 `LAST_VERIFIED_FACT`: Produzent und Gate-Abnahme stehen in `PLAN.md` §6.5; Implementierung bleibt v0.5.0-Ziel
- `shinon-forge`-Aktivierungsschritt mit Sicherheitsvertrag (siehe §4)
- Shinon-Selbstupdate (`shinon update`, Release-Abfrage, Prüfsumme), persistentes Autoupdate, transaktionales Update/Rollback — v0.5.0-Arbeit, kein v0.4.0-Punkt
- `.deb`-Distribution (`npm run deb`, Paket-Metadaten, Installations-/Upgrade-/Entfernungsproben) — v0.5.0-Arbeit, kein v0.4.0-Artefakt

Was aus der Liste in `0.5.0` landet, entscheidet der Betreiber — die Liste
selbst ist vollständig, wenn jeder offene Punkt aus PLAN §9 hier oder in §4
steht.

## 4. `1.0.0`-Kriterien und der `0.1.0`-Pfad

`1.0.0` heißt: jedes Profil-Paket ist ausgeliefert (kein `dsh.inactive` ohne
begründetes Verdikt wie `PLAN.md` §3.12.1), der Task-Router ist per H5
entschieden, die Live-Verifikation 3.9 ist grün belegt, und die Branch-Regel
(`docs/CI.md` §2) ist scharf — nicht nur gebaut.

Der einzige `0.1.0`-Träger (`packages/shinon-forge`, neun fremde CLIs, fünf
Werkzeuge, Intervall-Daemon) wird `1.0.0` genau dann, wenn sein
Sicherheitsvertrag steht (welche Kommandos, welches `cwd`, welche `env`, wer
sieht die Ausgabe, was bei Abbruch), ein Gate ihn pinnt und `dsh.inactive` aus
`packages/shinon-forge/package.json` fällt. Bis dahin ist `0.1.0` die ehrliche
Aussage, kein Rückstand.

## 5. Was kein Release ist

Kein einzelner Commit, keine grüne Momentaufnahme ohne Run-ID, keine Doku ohne
Messbefehl. Wer eine Fassung behauptet, nennt Commit-SHA, CI-Run-ID und den
lokalen Gate-Exit — alles andere ist ein Wunsch mit Versionsnummer.
