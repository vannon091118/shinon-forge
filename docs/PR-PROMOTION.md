# PR-Promotion — die Entscheidung vor der Schreibaktion

> **Status:** current — reine Entscheidungslogik; der GitHub-Adapter ist bewusst nicht gebaut. **Stand:** 2026-10-17
> **Einstieg:** `docs/INDEX.md` · **Zahlen:** `docs/ZAHLEN.md`

Die Promotion eines Pull Requests ist zwei Dinge, die getrennt bleiben:
eine **Entscheidung** aus Evidenz (`scripts/lib/pr-promotion.mjs`, rein, ohne
Netz und ohne Schreibrecht) und eine **Schreibaktion** (Adapter, nicht Teil
dieses Repos). Diese Datei beschreibt die Entscheidung.

## Zustände und erlaubte Übergänge

| Zustand | Bedeutung | Darf nach |
|---|---|---|
| `DISCOVERED` | PR gesehen, Evidenz fehlt noch | `CHECKING`, `BLOCKED` |
| `CHECKING` | nur offene Stages, nichts Rotes | `READY`, `BLOCKED`, `FAILED` |
| `READY` | alles grün für genau diesen SHA | `PROMOTED`, `BLOCKED`, `FAILED` |
| `BLOCKED` | mindestens ein Blocker | `CHECKING` |
| `PROMOTED` | Schreibaktion bestätigt, SHA stimmt | `ROLLED_BACK`, `FAILED` |
| `FAILED` | Adapterfehler oder fremder SHA | `ROLLED_BACK`, `CHECKING` |
| `ROLLED_BACK` | Rücknahme bestätigt | `CHECKING` |

Jede andere Kante wirft (`PromotionError`) — es gibt keinen stillen Sprung und
kein „fast fertig". Ohne Promotion gibt es keinen Rollback.

## Eingaben

`baseBranch`, `headSha`, `diffScope.files`, `requiredStages`, `gateEvidence`
(`stage`, `sha`, `conclusion`), `reviews` (`sha`, `state`). Es gibt keine
Zeitquelle und keinen Zufall: dieselbe Evidenz ergibt dieselbe Entscheidung.

## Die eine harte Regel

Ein Status zählt nur für den Commit, den er nennt. Fehlt er, nennt er einen
anderen SHA, ist er `pending`, `skipped`, `cancelled` oder `failure` — dann
`BLOCKED`, nie grün. Ein Review zählt nur am aktuellen SHA; ein Freigabe-Review
von gestern ist keine Freigabe von heute. Ein leerer Diff ist nichts zum
Promovieren.

Nur offene Stages (`pending`) ergeben `CHECKING`; jede andere Lücke ist
`BLOCKED`. `requiredStages` darf nicht leer sein — welche Stages Pflicht sind,
ist eine Entscheidung des Vertrags, keine Annahme des Codes.

## Adapter

Der Adapter ist eine Grenze mit **einem** Recht: `pull_requests:write`.
Wildcard, zusätzliche Rechte oder fehlendes Schreibrecht ⇒ `BLOCKED`, ohne
Aufruf. Ein Dry-Run ruft `promote` nie auf; ein echter Lauf nur bei `READY`.
Ein Adapterfehler wird `FAILED`, ein zurückgegebener fremder SHA ebenfalls.

Es ist **keine** GitHub-API-Route erfunden und keine Schreibaktion gebaut: der
Adapter ist eine Schnittstelle, seine Implementierung und echte PR-Änderungen
bleiben außerhalb dieses Repos.

Tests: `scripts/gate/tests/pr-promotion.test.mjs` (Zustandsmatrix, Evidenzregeln,
Adaptergrenze).
