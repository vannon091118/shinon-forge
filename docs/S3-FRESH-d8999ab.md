# S3 Frischklon @ d8999ab — Protokoll 2026-10-17

> **Status:** Beleg — Release-Slice S3 (PLAN.md §9.1)
> **Stand:** 2026-10-17, 10:05–10:15 UTC, Commit `d8999ab`
> Dritter Durchgang nach `docs/S3-FRESHCLONE-2026-10-17.md` (Boot-Beleg) und
> `docs/S3-FRESH-2026-10-17.md` (HTTP-200-Beleg): fällig, weil `main` seither
> den S4-Doctor-Umbau trägt und ein Beleg am alten Stand keine Aussage über den
> neuen Baum trifft.

Frischer Klon von `main`, jeder Schritt mit Befehl und Exit-Code — wie ein
Messgerät zwischen gebautem Code und belegter Zusage. Token redigiert.

## Umgebung

| Größe | Wert |
|---|---|
| Quelle | `https://github.com/vannon091118/shinon-forge.git`, Branch `main` |
| Commit-SHA | `d8999ab` |
| Klonverzeichnis | `/tmp/shinon-s3-20261017T100507Z` (kein Commit-Bestandteil) |
| Node / npm | `v24.21.0` / `11.19.0` |
| Globales DSH | keines — nur Repo-Installat (`0.2.1-alpha.1`) |
| UI-Port | `3102` (Loopback) |

## Ablauf

| # | Befehl (im Klon) | Exit | Ergebnis |
|---|---|---|---|---|
| 1 | `git clone --branch main …` | 0 | HEAD = `d8999ab`, kein Profil-`node_modules` |
| 2 | `npm ci --no-audit --no-fund` | 0 | vollständig, nur `install-scripts`-Warnungen |
| 3 | `npm run profile:links` | 0 | 3 Profile, 29 Links |
| 4 | `dsh --profile shinon --dump-config` (`DSH_HOME=$PWD`) | 0 | 60 Layer-Köpfe, 210 Einträge |
| 5 | `npm run build` | 0 | 22 Pakete, Profil mit 19 Einträgen, dist 185 Dateien / 1 528 266 Bytes |
| 6 | UI-Start (`--no-open --trusted-host 127.0.0.1 --port 3102`), Warten auf `dsh web:` | 0 | 15 `Aktiviert`-Zeilen, 0 Fehlerzeilen, Adresse mit redigiertem Token |
| 7 | `curl http://127.0.0.1:3102/` ohne Token | 0 (Befehl), **HTTP 401** | Auth-Schranke belegt |
| 8 | Token-Einstieg (Cookie) + `curl http://127.0.0.1:3102/` | 0 (Befehl), **HTTP 200** | `text/html; charset=utf-8`, 41 314 Bytes ab `<!doctype html>` |
| 9 | Server per exakter PID beendet | 0 | Port 3102 frei, kein Restprozess |
| 10 | `npm run gate:test` | 0 | 546/546 grün im Frischklon |

## Read-only-Regel (Haupt-Worktree)

Vor und nach dem Durchgang: `git status --porcelain` leer — der Klon lag in
`/tmp`, am Arbeitsbaum wurde nichts verändert.

## Einordnung

S3 bleibt belegt, nun am aktuellen Stand: Klon, Installation, Links, Dump,
Build, gestartetes UI mit HTTP-200-Nachweis, grüne Gates.
