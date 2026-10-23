# INDEX — die Dokumentationskarte

> **Status:** current · **Stand:** 2026-10-22
>
> Diese Datei ist die Karte, nicht die Wahrheit. Sie sagt, welches Dokument
> wofür zuständig ist — und stillschweigend, wo eine Information **nicht** steht.
> Harte Zahlen haben genau einen Eigentümer ([`ZAHLEN.md`](ZAHLEN.md)),
> offene Arbeit genau eine Liste ([`ROADMAP.md`](ROADMAP.md)).

## Wer ist wofür zuständig

| Dokument | Zuständigkeit | Sprache |
|---|---|---|
| [`../README.md`](../README.md) | Shinons Vorstellung, Quickstart, FAQ und Wegweiser zu den technischen Docs | deutsch |
| [`../AGENTS.md`](../AGENTS.md) | Verbindliche Regeln für Arbeit am Code: Konventionen, Pitfalls, Commit-Pflichten | deutsch |
| [`../SHINON.md`](../SHINON.md) | Einzige Anweisungsdatei, die der DSH aus dem Projekt lädt (`SHINON.md` statt `AGENTS.md`); wird zusätzlich als geprüfter Pflichtblock in den Runtime-Context injiziert | deutsch |
| [`ZAHLEN.md`](ZAHLEN.md) | **Einziger** Eigentümer aller harten Zahlen (Bestand §1, Prüfläufe §2, rote Befunde §3) | deutsch |
| [`TAGEBUCH.md`](TAGEBUCH.md) | Erzählte Timeline; jedes Kapitel an Commit-SHA-Bereiche und Pfade gebunden | deutsch |
| [`CHANGELOG.md`](CHANGELOG.md) | Kompakte, übertragbare Änderungs- und Agenten-Übergabe mit PR-/CI-Belegen | deutsch |
| [`AGENT-HANDOFF.md`](AGENT-HANDOFF.md) | Start-/Abschlussprotokoll für Folge-Agenten; Statusregeln und Übergabecheckliste | deutsch |
| [`ROADMAP.md`](ROADMAP.md) | **Einzige** Liste offener Arbeit (Release-Freeze v0.4.0, Kandidaten, 1.0.0-Kriterien) | deutsch |
| [`WISSENS-RUNTIME-PLAN.md`](WISSENS-RUNTIME-PLAN.md) | Implementierungsplan zur persistenten Wissens-Runtime (Weg zu K8; Verifikationsregister, vier Züge, Messprogramm) | deutsch |
| [`COMMIT-REGELN.md`](COMMIT-REGELN.md) | Commit-Regeln und ihre Durchsetzung (Hooks, CI, Gate) | deutsch |
| [`../IDEA.md`](../IDEA.md) | Kurzidee und die drei Prinzipien (Beleg vor Behauptung, Grenzen vor Aktion, eine Quelle) | deutsch |
| [`../shinon-forge-implementierungsplan.md`](../shinon-forge-implementierungsplan.md) | Historischer Arbeitsplan (Status: **historical**, Stand 2026-10-07) — keine Zahlenquelle mehr | deutsch |

## Nachrichtliche Dokumente (diese Serie)

Diese Dateien beschreiben den **aktuellen Stand des Baums**. Sie nennen keine
harten Bestandszahlen selbst — sie verweisen auf `ZAHLEN.md` — und sie
wiederholen keine offenen Punkte — die stehen in `ROADMAP.md`.

| Dokument | Zuständigkeit |
|---|---|
| [`ARCHITEKTUR.md`](ARCHITEKTUR.md) | Schichtmodell, Paket-Anatomie, Boot-Kette, Ereignis-Spine, typische Datenflüsse |
| [`SETUP.md`](SETUP.md) | Installation, Profile, `DSH_HOME`, Schlüssel und Routen, Diagnose, Werkzeuge für Betreiber |
| [`REMOTE-ARBEIT.md`](REMOTE-ARBEIT.md) | frischer Remote-Klon, lokale Freebuff-Metadaten, Task-Worktrees und Rechnerübergabe |
| [`CI-UND-GATES.md`](CI-UND-GATES.md) | Gate-Engine und ihre Plugins, policy.json, Git-Hooks, Preflight-Abnahme, Security- und Release-Workflows |
| [`PAKETE.md`](PAKETE.md) | Nachschlagewerk zu allen Paketen unter `packages/`: Zweck, Eintritt, Tests, Naht |
| [`SCRIPTS.md`](SCRIPTS.md) | Nachschlagewerk zu `scripts/` und `bin/`: Zweck jedes Skripts und ob ein npm-Script darauf zeigt |
| [`VISION-ABGLEICH.md`](VISION-ABGLEICH.md) | Befund: die Vision (fünf Organe, ein Kreislauf) gegen den Code-Kern — wo er abweicht, wie tief, und welche Probe fehlt |
| [`CLEANREPO-AUDIT.md`](CLEANREPO-AUDIT.md) | Großer Audit: Bestand, Hotspots, Extraktionen je Gruppe, Konflikt-Register, Namens- und Sichtbarkeitsregeln, atomare Task-Checkliste, Reihenfolge |

## Verträge und Proben

| Ort | Inhalt | Regeln |
|---|---|---|
| [`contracts/`](contracts/) | JSON-Verträge mit `status`-Feld: Ereignistypen, Namens-Registry, Modellrouten, Commit-Trailer, Struktur u. a. | nur **additiv** ändern (`AGENTS.md`) |
| [`probes/`](probes/) | Falsifikations-Proben: `id/claim/targets/expect/result/verdict/evidence`, vom Gate `probe-twin` auf Form und Zieldateien geprüft | Proben erzeugen Skripte (`perf-baseline`, `index-cold-cost`, `s6-turn`) oder dokumentierte Live-Läufe |

## Lesereihenfolge für Neue

1. [`IDEA.md`](../IDEA.md) — drei Prinzipien (22 Zeilen).
2. [`../README.md`](../README.md) — Quickstart und Überblick.
3. [`ARCHITEKTUR.md`](ARCHITEKTUR.md) — wie der Baum hängt.
4. [`VISION-ABGLEICH.md`](VISION-ABGLEICH.md) — was der Code-Kern heute ist und wo er von der Vision abweicht.
5. [`../AGENTS.md`](../AGENTS.md) — verbindliche Regeln, bevor die erste Änderung entsteht.
6. [`TAGEBUCH.md`](TAGEBUCH.md) — was wann warum geschah.
