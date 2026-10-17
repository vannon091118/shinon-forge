# S3 Frischklon-Repro — Protokoll 2026-10-17

> **Status:** current — Release-Beleg S3 (PLAN.md §9.1), eingefroren am Messzeitpunkt
> **Stand:** 2026-10-17, 09:38–09:55 UTC

Der vorgeschriebene Ablauf aus einem frischen Klon ohne globales DSH, gemessen
an genau dem gepushten S4-Stand. Jeder Schritt nennt Befehl, Exit-Code und das
beobachtete Ergebnis — wie ein Messgerät zwischen gebautem Code und belegter
Zusage, statt eine Absicht grün zu färben.

## Umgebung

| Größe | Wert |
|---|---|
| Datum (UTC) | 2026-10-17T09:38:34Z (Start) |
| Quelle | `https://github.com/vannon091118/shinon-forge.git`, Branch `freebuff/f12cb7d008d4b72f5ee5f65c` |
| Commit-SHA | `dd18824` (`dd188248a2845fe59587cde0e58d34e6e3b45161`) |
| Klonverzeichnis | `/tmp/shinon-s3-repro-20261017T093839Z` (außerhalb des Arbeitsbaums, nach dem Lauf nicht committet) |
| Node | `v24.21.0` (Range aus `engines`: `^22.19.0 || >=24.0.0`) |
| npm | `11.19.0` |
| Globales DSH | keines verwendet — Auflösung ausschließlich Repo-Installat (`node_modules/@deepseek-ai/dsh`, Fassung `0.2.1-alpha.1`) |
| Lockfile | `package-lock.json` mit 728 Paketeinträgen |

## Ablauf

| # | Befehl (im Klon) | Exit | Ergebnis |
|---|---|---|---|
| 1 | `git clone --branch freebuff/f12cb7d008d4b72f5ee5f65c https://github.com/vannon091118/shinon-forge.git /tmp/shinon-s3-repro-20261017T093839Z` | 0 | HEAD = `dd18824`, Branch sauber, kein `profiles/shinon/node_modules` vorhanden (Normalzustand vor der Installation) |
| 2 | `npm ci --no-audit --no-fund` | 0 | Installation vollständig, nur Warnungen über `install-scripts` (node-pty, protobufjs — keine Fehler) |
| 3 | `npm run profile:links` | 0 | 3 Profile, 29 Links gesetzt; davon Profil `shinon`: 19 Bündel; `node scripts/profile-links.mjs --check` danach Exit 0 („kein Link zeigt woandershin, 0 noch zu setzen") |
| 4 | `DSH_HOME=$PWD ./node_modules/.bin/dsh --profile shinon --dump-config` | 0 | 60 Layer-Köpfe, 210 Einträge, 33 `shinon-`-Treffer — deckungsgleich mit `docs/ZAHLEN.md` §2 |
| 5 | `DSH_HOME=$PWD timeout 40 ./node_modules/.bin/dsh --profile shinon --no-open --trusted-host 127.0.0.1 --port 3099` | 124 | Erwartet: `timeout` beendet den weiterlaufenden Server nach 40 s. Boot belegt: 15 `Aktiviert`-Zeilen aller Shinon-Bündel, letzte Zeile `dsh web: http://127.0.0.1:3099/?token=<redigiert>`; keine Fehlerzeile im 45-zeiligen Log (außer dem Paketnamen `shinon-better-errors`) |
| 6 | `node bin/shinon.mjs doctor` | 0 | Status `ok`, Befunde keine: node ok, dsh ok (Repo-Installat), Profil `shinon`, beide Schlüssel fehlen (presence-only, keine Werte) |
| 7 | `npm run gate:test` | 0 | 544 Tests, 544 grün, 0 rot |
| 8 | `node scripts/shinon-test.mjs` | 0 | 117 bestanden, 0 fehlgeschlagen |

## Gegenprobe im Arbeitsbaum (gleicher Stand `dd18824`)

| Befehl | Exit | Ergebnis |
|---|---|---|
| `node bin/shinon.mjs doctor --json` | 0 | Status `ok`, exitCode 0 |

## Einordnung

S3 ist damit belegt: Klon, Installation, Link-Setzung, Profil-Dump, UI-Start bis
zur Web-Adresse, Doctor und beide Gates laufen auf fremdem Boden mit Exit 0. Der
Klon lag in `/tmp` und ist kein Commit-Bestandteil; dieser Beleg ist das
Protokoll. Offen bleiben S5 (Release-Workflow/Tag/Archiv) und S6
(Live-Modellturn + Audit) — ein v0.4.0-Release wird nicht behauptet.
