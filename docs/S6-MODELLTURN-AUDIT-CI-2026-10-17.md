# S6 Modellturn + Audit + CI — Protokoll 2026-10-17

> **Status:** teils belegt, mit zwei benannten Blockern — kein Go (PLAN.md §9.1)
> **Stand:** 2026-10-17, ~10:30 UTC, Commit `4db4006`, Node `v24.21.0`

S6 verlangt drei Belege: echten Modellturn, Security-/Dependency-Audit und
CI-Run. Gemessen wurde, was ohne fremde Entscheidung messbar ist; was eine
Nutzerentscheidung braucht, steht als Blocker — wie ein Messgerät, das eine
fehlende Probe meldet, statt sie zu erfinden.

## 1. Modellturn — BLOCKIERT (Nutzerentscheidung nötig)

Anwesenheitsprüfung (nur Namen, nie Werte): Dateien `.env`, `.env.local`,
`~/.cache/freebuff-project/secrets.env`, `~/.config/shinon/env` — alle
**fehlend**; Variablen `AGNES_API_KEY`, `PROMPTER_API_KEY`, `DSH_API_KEY`,
`DEEPSEEK_API_KEY` — alle **fehlend**. Der letzte belegte Turn steht in
`docs/probes/store-cost.json` (2026-10-11). Ohne Schlüssel gibt es in diesem
Turn keinen echten Modellturn — ein Mock wäre ein erfundener Beleg und ist
keiner. **Benötigt:** Nutzer legt `AGNES_API_KEY` vor (Repo-Regel: `.env` im
Root, `chmod 600`, nie committen).

## 2. Audit — belegt, Exit 0

| Befehl | Exit | Ergebnis |
|---|---|---|
| `npm audit --omit=dev` (+ `--json`) | 0 | **0 vulnerabilities** (`info/low/moderate/high/critical` je 0) |
| `npm audit` (voll, inkl. dev) | 0 | **0 vulnerabilities** |

## 3. CI-Run — verlinkt, mit rotem Befund

Run [`39024154850`](https://github.com/vannon091118/shinon-forge/actions/runs/39024154850)
(`Shinon Forge Gate`, Push auf `main@4db4006`, `commit-guard.yml`):
**`failure`** — Zweig `Gate-Tests (Regeln, Verträge, Nähte)` rot (Schritt
`Gate-Tests fahren`, Exit 1), Zweig `Verdikt (fail-closed)` folgerichtig rot;
alle 12 übrigen Zweige grün. Die 11 vorigen Runs (bis `1fb6358`) sind grün.

Der fehlschlagende Einzeltest ist von hier nicht bestimmbar: der Job-Log
braucht Admin-Rechte (API: 403 anonym), aus den Check-Annotationen steht nur
Exit 1. Lokal ist derselbe Baum wiederholt grün (`npm run gate:test` 546/546,
`project-index.test.mjs` 3× 46/46) — auch der dokumentierte ctime-Flake
(`docs/ZAHLEN.md` §3) zeigt sich hier nicht. **Benötigt:** Nutzer startet im
Actions-Tab „Re-run failed jobs" oder teilt den Job-Log; erst danach lässt
sich sagen, ob Flake oder echter Befund.

## Einordnung

S6 ist **nicht erfüllt**: Modellturn fehlt (Schlüssel-Blocker), CI ist rot
(Ursache offen). Audit ist grün. Kein Go, kein Tag, kein Release.
