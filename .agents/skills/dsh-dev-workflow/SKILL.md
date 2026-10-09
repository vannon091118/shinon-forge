---
name: dsh-dev-workflow
description: Arbeitsablauf fuer Shinon Forge - welcher Check wann, wo Vertraege geaendert werden, Reihenfolge bei neuen Paketen/Regeln, Commit-Regeln (Vannon-Trailer). Nutzen vor jeder Feature- oder Bugfix-Arbeit im Repo.
---

# Dev-Workflow Shinon Forge

Repo-Root ist das `DSH_HOME`. Alles läuft von hier; die Verträge leben an einer
Stelle. Reihenfolge spart Zeit: schnelle Checks zuerst, teure zuletzt.

## Befehlskarte (von schnell nach teuer)

| Befehl | prüft | braucht |
|---|---|---|
| `node --test packages/codingmon/test/*.test.mjs` | Kern-Mathematik, Kompositor, E2E (vm, Fake-Clock) | nichts (nach `index.js`-Reexport) |
| `node scripts/dsh-test.mjs` | Gate: Manifest, Ressourcen, Patch-Schema, Namensvertrag, Syntax, Legacy-Guard, Komposition | `dsh` im PATH (YAML-Parser) |
| `node --test scripts/gate/tests/*.test.mjs` | Gate-Logik selbst | wenig |
| `node scripts/validate-test.mjs` | je Regel: Gate **und** Build werden rot (Fixtures) | `dsh` |
| `node --test scripts/gate/tests/codingmon-store.test.mjs` | Pet-Store gegen echte DSH-Storage-Familie | `dsh`, `node_modules` |
| `node --test packages/codingmon/test/uebergabe.test.mjs` | Naht Client->Host, Literal-Drift, beide Cordis-Roots | `node_modules` |
| `node scripts/pack-test.mjs` | Distribution je Paket: `pnpm pack` → isoliert installieren → laden | pnpm + npm |
| `node scripts/dsh-profile-test.mjs` | `dsh --profile shinon --dump-config`, alle 8 Bundle-Layer | installiertes DSH |
| `npm test` | alles oben in der Reihenfolge schnell → teuer | Gesamtstack |
| `npm run gate` / `gate:local` / `gate:full` | modularer Gate-Engine, slice-selektiv | siehe `scripts/gate/engine.mjs` |
| `npm run build` | validiert + generiert `dist/` komplett neu | Gesamtstack |

Ohne `node_modules`/`dsh` laufen diejenigen Tests **sichtbar** aus (Skip mit Grund im
Testnamen) — das ist kein Grün. Ein Skip-Grund ist im Bericht zu nennen.

## Womit man arbeitet

- **Verträge ändern** → ausschließlich `scripts/lib/repo.mjs` (eine Quelle für Gate,
  Build, validate-test). Nie `dsh-test.mjs` oder `build.mjs` direkt patchen.
- **Regel geändert?** → braucht ein neues Fixture in `scripts/validate-test.mjs`, das
  beweist: Gate **und** Build werden rot. Sonst ist die Regel wirkungslos.
- **Gate-Plugin geändert?** → `scripts/gate/policy.json` synchron halten
  (`policy.mjs` exit 1 bei Plugin ohne Trigger und Trigger ohne Plugin).
- **Neues Paket** → Ordner `packages/<dir>/` mit genau den vier Dateien
  (`index.js`, `client.js`, `cordis.patch.yml`, `package.json`) plus optional
  `assets/` (Kernlogik OHNE bare Imports, damit CI ohne `node_modules` testen kann)
  und `test/`. Namensvertrag an vier Stellen ableiten (siehe `dsh-bug-muster` B5),
  `SHARED_DEPS` als peer+dev in beiden Profilen, Paket ins Profil
  (`profiles/shinon/package.json` → `dsh.profile.bundles`) — der `dead-package`-
  Gate flaggt alles, was fehlt.
- **Client-interne Slot-Ids** → `<name>-<purpose>` (z. B. `shinon-core-brand`).
  Pakete referenzieren sich nicht; gemeinsame Logik lebt in `scripts/lib/`.
- **Platzhalter** (Dashboard, token-usage, better-errors, openapi): UI/Config only —
  openapi bewusst nicht im Profil. Nicht für „fehlende Logik" halten.

## Änderungs-Reihenfolge (bewährt)

1. Vertrag/Kern ändern (`scripts/lib/repo.mjs`, `assets/`), Tests mitziehen.
2. Schnell laufen lassen: `node --test packages/codingmon/test/*.test.mjs`.
3. `node scripts/dsh-test.mjs` — Namens-/Strukturfehler sofort.
4. Naht/Integration: uebergabe-Test, store-Test (falls relevant).
5. Teure Runde: `npm test` (pack-test + Profiltest inklusive).
6. `npm run build` nur wenn `dist/` gewünscht — es ist generiert, nie handeditiert.

## Commits (fail-closed)

- Jede Commit-Message endet mit dem Vannon-Trailer:
  `created by VANNON — Volatile Agent Needing No Other Nonsense, Never Overly Nice, Never Average Vibe`
- Verboten: AI-Footers (`Generated with Codebuff 🤖`, `Co-Authored-By: …` inkl.
  Claude/ChatGPT/Copilot/Gemini), `powered by …`, Emoji-Signaturen, `co-authored-by:`
  überhaupt.
- Einmal pro Klon: `npm run hooks:install` (prepare-commit-msg swap, commit-msg block);
  prüfen mit `npm run commit:guard -- --ci | --last n | --range a..b | --all`.
- CI (`.github/workflows/commit-guard.yml`) läuft auf jedem Push/PR ohne Filter;
  unauflösbare Ranges fallen auf die **volle** Historie zurück.
- Regeln/Quelle der Trailer-Texte: `Docs/COMMIT-REGELN.md`,
  `scripts/lib/commit-text.mjs`.

## Status & Ehrlichkeit

- Statusklassen in der README: *Planned* → *Experimental* → *Verified*. Neues Feature
  startet *Planned*; *Verified* erst mit ausweisbarem Nachweis (welcher Test/Probe).
- Grenzen kennen und nennen: kein Voll-Boot verifiziert (nur Config-Auflösung),
  Patch-Configs nur strukturell geprüft, `!!js` blinder Fleck des Gates.
- Nicht doppelt bauen, was DSH schon hat: Subagent/Skills, Session-Log (Audit),
  Reload-Mechaniken. `dsh --version` und der installierte Stand sind Ground Truth —
  Doku (auch `Docs/research/`) kann neuer sein.

## Wo was steht

| Frage | Ort |
|---|---|
| Architektur-Regeln, Validierung | `Docs/ARCHITECTURE.md`, `scripts/lib/repo.mjs` |
| Commit-Regeln | `Docs/COMMIT-REGELN.md`, `scripts/lib/commit-text.mjs` |
| Pitfalls (Stack-Fallen) | `AGENTS.md` „Pitfalls" + `dsh-bug-muster` |
| Cordis-Mechaniken | `cordis-architektur` + `Docs/research/2026-10-09-cordis-dsh-recherche.md` |
| Verträge/Probes | `Docs/contracts/`, `Docs/probes/` |
| Prompt/Persona-Flächen | `prompts/README.md` (System-Prompt-Registry, keine Datei-Templates) |
