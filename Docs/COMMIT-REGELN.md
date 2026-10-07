# Commit-Regeln — Shinon Forge

Zwei Regeln. Beide fail-closed. Keine Ausnahmen, kein Schalter.

## 1. Kein KI-Footer. Nie.

Verboten sind unter anderem:

- `Generated with Codebuff 🤖`
- `Co-Authored-By: Codebuff <noreply@codebuff.com>`
- `Generated with …` für Codebuff, Claude, ChatGPT, Copilot, Gemini, Cursor, Aider, OpenAI, Anthropic, Devin, Codex, Qwen
- `Co-Authored-By:` mit einem dieser Namen
- `powered by chatgpt|claude|gemini|openai|anthropic`
- `co-authored-by:` überhaupt (auch für Menschen — eine Signatur, nicht zwei)

Die Muster stehen in `scripts/lib/commit-text.mjs` (`FORBIDDEN_LINES`). Es gibt
genau eine Quelle; Hook, Gate und CI lesen dieselbe.

## 2. Der Vannon-Trailer ist Pflicht

Der letzte inhaltliche Block jeder Commit-Nachricht ist:

```text
created by VANNON — Volatile Agent Needing No Other Nonsense, Never Overly Nice, Never Average Vibe
```

Whitespace und Gedankenstriche werden gefaltet (`–`/`-` sind gleichwertig),
der Trailer zählt in den letzten drei inhaltlichen Zeilen.

## Durchsetzung

| Ort | Datei | Verhalten |
|---|---|---|
| Lokal, vor der Prüfung | `.githooks/prepare-commit-msg` | **Tauscht** verbotene Footer gegen den Vannon-Trailer (`--fix`). |
| Lokal, verbindlich | `.githooks/commit-msg` | **Fail-closed**: ohne Trailer, mit Footer kein Commit. |
| CI, immer | `.github/workflows/commit-guard.yml` | Läuft bei jedem `push`, `pull_request` und auf Zuruf (`workflow_dispatch`), ohne `paths`-Filter, ohne `continue-on-error`; ruft `commit-guard.mjs --ci` auf. |
| Bereich | `scripts/lib/ci-range.mjs` | Leitet ab, **welche** Commits geprüft werden — und wird im Zweifel **nie enger**: unbestimmter Bereich ⇒ volle Historie. |
| Gate | `scripts/gate/plugins/commit-trailer.mjs` | Prüft, dass Regeln, Hooks und CI-Job existieren **und wirken** (eingefrorene Signatur muss abgelehnt werden). |
| Tests | `scripts/gate/tests/commit-trailer.test.mjs` | Regel-Verhalten, Tausch, Hook-Kette, Bereichs-Scan in einem echten temporären Repo. |

Aktivieren (einmal pro Klon):

```bash
npm run hooks:install     # setzt core.hooksPath=.githooks und legt die Hooks an
```

Prüfen:

```bash
npm run commit:guard -- --last 5          # die letzten 5 Commits
npm run commit:guard -- --range <a>..<b>  # ein Bereich
npm run commit:guard -- --ci              # genau das, was CI prüft
npm run commit:guard -- --all             # Audit der ganzen Historie
```

## Im Zweifel mehr prüfen, nie weniger

Der Wächter darf nicht enger werden. Kann er den Bereich nicht bestimmen —
erster Push eines Branches (`before` ist der Null-SHA), Force-Push auf einen
verschwundenen Stand, flacher Klon, unbekanntes Event, kaputte Event-Datei —
dann prüft er die **volle Historie** der Spitze, nicht bloß den Kopf-Commit.
Die Bereichslogik liegt deshalb in `scripts/lib/ci-range.mjs` (reine Funktion,
getestet) und nicht als Shell-`if` im Workflow.

Ein Wächter, der im Zweifel weniger prüft, ist kein Wächter.

## Warum Tausch UND Fail-Closed

Lokal ist Reparatur erlaubt: Agenten produzieren Signatur-Footer aus Gewohnheit,
und ein Blockieren ohne Ausweg erzeugt Handarbeit oder `--no-verify`. Der
prepare-Hook tauscht sie mechanisch aus — der Commit enthält danach genau einen
Trailer.

In CI gibt es keinen Tausch. Dort gilt: liegt eine Signatur im geprüften
Bereich, ist der Job rot. Ein bereits gepushter Verstoß wird nicht repariert,
sondern gemeldet — sonst wäre die Prüfung verhandelbar.

Fail-closed heißt auch: der Job lässt sich nicht entschärfen. Das Gate
(`scripts/gate/plugins/commit-trailer.mjs`) prüft am Dateiinhalt, dass der
Workflow keine Pfad-/Branch-Filter hat, kein `continue-on-error: true` trägt und
den Prüfbereich nicht selbst im YAML ableitet.
