# K5-Web-Recherche — implizite Feedback-Signale in Agent-UIs

> **Status:** Recherche · **Stand:** 2026-10-11
> **Methode:** `web_search` ist blockiert (ungültiger API-Key für den Such-Endpoint —
> dokumentiert als Blocker). Alle Quellen per `web_fetch` direkt abgerufen. Jede Zeile
> trägt eine URL. Was nicht nachgewiesen ist, steht so — nicht erfunden.

---

## 1. Referenz-Tabelle

| # | Signal / Konzept | Wer misst es | Wie | Quelle (URL) | Übertragbar auf Shinon? |
|---|---|---|---|---|---|
| 1 | **Umformulierung / „weitermachen" = implizites Negativ-/Positiv-Signal** | Cursor (Router) | **Deterministisch**: „Moving on to the next task is a strong positive signal, while correcting the agent is a strong negative one." — direkt aus dem Verhalten, kein Button | [cursor.com/blog/how-cursor-router-works](https://cursor.com/blog/how-cursor-router-works) | **JA — Kernbeleg.** Dein Signal #4 (Umformulierung) + #5 (Akzeptanz) ist exakt das, was Cursor als Performance-Signal nutzt. Bestätigt den diff-/verhaltensbasierten Ansatz ohne 👍/👎. |
| 2 | **Korrektur als Lernsignal (correction-as-signal)** | Cursor (Compass-Komplexitäts-Prädiktor) | LLM-gestützt: „users rarely ask for corrections after simple tasks… more likely to make follow-up requests when the work is more complex" | [cursor.com/blog/how-cursor-router-works](https://cursor.com/blog/how-cursor-router-works) | **TEILWEISE.** Cursor nutzt Korrekturen für Komplexitäts-Routing, nicht für eine Scorecard. Dein Ansatz (Korrektur → `trust`/`correctness`-Delta) ist eine **Generalisierung** davon — tragfähig, aber Shinon-spezifisch. |
| 3 | **Diff-basierte Edit-Erkennung (beforeReadFile/afterFileEdit)** | Cursor (Hooks) | **Deterministisch**: Hooks feuern vor/nach Datei-Änderungen (`beforeReadFile`, `afterFileEdit`, `preToolUse`, `postToolUse`) über `hooks.json` + stdio-JSON | [cursor.com/docs/hooks](https://cursor.com/docs/hooks) | **JA — das ist die fehlende Erkennungsquelle.** Dein K5-Bericht markierte „Selbstkorrektur/Übernahme nicht log-gültig". Cursor zeigt den Weg: **Hooks als deterministische Edit-Erkennung**, keine LLM-Interpretation. |
| 4 | **Checkpoint-Rollback als Verwerfungs-Signal** | Cursor (Agent) | **Deterministisch**: „If Agent takes a wrong turn, click any checkpoint… then restore to revert all files" — Restore = implizites Verwerfen | [cursor.com/docs/agent](https://cursor.com/docs/agent/overview) | **JA — füllt deine Lücke #6 (Verwerfung).** Dein DSH-Log hat kein `turn/end rejected`. Checkpoint-Restore wäre das deterministische Äquivalent (Datei-Rollback statt Reason-Code). |
| 5 | **Skill-System (geladene Prozeduren, „Lessons not logs")** | Cursor (Skills) | Geladene Prozeduren, thematisch, vor Task relevant geladen | [cursor.com/docs/skills](https://cursor.com/docs/skills) | **JA — bestätigt deine K7-Ebene 3.** Dein „taktische Skills, vor dem Task geladen, Lesson-not-Log" ist das selbe Muster. Cursor hat es produktisiert. |
| 6 | **Feedback-Trust-Gaming (Reward-Hacking)** | dokumentiert in RLHF-Literatur (allgemein) | **Nicht direkt nachgewiesen** in den obigen Quellen — generisches Problem: ein System, das implizite Signale zu Belohnung macht, wird manipuliert (gezielt Kopieren/Korrigieren, um einen Schwellwert zu überschreiten) | — (kein URL-Beleg, generalisiert) | **JA — dein §2 Gamed-Trust-Befund.** Dein korrektur-überwogener, konservativer Ansatz (decay + cooling + asymmetrische Deltas, Korrektur wiegt schwerer) ist die Standard-Antwort. Siehe §2. |

> **Hinweis zu Zeile 6:** Eine spezifische, zitierte Quelle für „LLM-Agent-Trust-Gaming
> über implizites Feedback" habe ich per `web_fetch` **nicht** gefunden (Suche blockiert,
> arXiv-Fetch lieferte irrelevante Papiere). Es ist ein **generisches, in der RLHF-
> Literatur bekanntes Problem** (reward hacking), nicht ein Shinon-spezifischer Beleg.
> Das ist die ehrliche Einschränkung — ich habe es nicht mit einer URL belegt.

---

## 2. Gamed-Maschinen-Sicherheit — Vorschlag für Shinon

**Das Risiko (aus deinem K5-Bericht §Gefunden + korrektur-überwogen):** `88b60337` zieht
`trust` auf 0.6914 (korrekt, nur rephrase+acc). Mit den (ungültig gezählten) Übernahme-
Signalen wären es 0.93 gewesen — **über der `autonomy`-Schwelle (trust > 0.7)**. Das ist
der Gamed-Fall: ein User, der systematisch „Übernahmen" erzeugt (oder das System sie
falsch zählt), schiebt Trust über die Autonomie-Schwelle, ohne inhaltlich besser zu
werden.

**Gegenmaßnahmen, die deine eigene Architektur schon enthält (bestätigt durch Zeile 1–2):**
1. **Asymmetrie (Korrektur wiegt schwerer):** `correctness`-Delta `−0.18` (high) vs.
   `+0.12` (approval high). Ein Gamed-Approval-Stream verblasst, eine echte Korrektur
   bleibt. ✅ in `scoring-state.json`.
2. **decay + cooling:** Veröffentlicht wird nur alle 3 Signale; altes Evidence verblasst
   (decay 0.02). Ein massiver Approval-Stream am Anfang einer Session wird nicht
   sofort zum published Wert. ✅ in `scoring-core.js`.
3. **Deterministische, vordefinierte Signale (keine LLM-Erkennung):** Genau weil die 7
   Signale **vordefiniert und diff-basiert** sind, kann der User sie nicht „überzeugen"
   — er kann nur sein Verhalten ändern. Das ist der Unterschied zu einem LLM, der
   „fühlt", ob etwas gut war. ✅ Konzept-Regel §2.1.

**Was FEHLT (konkreter Vorschlag für deinen nächsten Schritt):**
- **Trust-Ceiling:** Deine `autonomy`-Schwelle (0.7) ist die einzige, die ein Gamed-
  Trust auslöst. Ein hartes Ceiling (z.B. `published.trust` max 0.8) verhindert, dass
  Repeated-Approvals unbegrenzt Autonomie erkaufen. **Empfehlung: Ceiling 0.8,
  dokumentiert in `technical-profile.json` `limits`.**
- **Rate-Limit pro Session:** Max. N `approval`-Signale pro Session, die `published`
  drücken dürfen (z.B. 10). Mehr = Rauschen, nicht Evidenz. **Empfehlung: in
  `scoring-state.json` `cooling` ergänzen um `maxPublishedSignalsPerSession`.**

---

## 3. Blocker: web_search

`web_search` (DeepSeek-Such-Endpoint) liefert **HTTP 401 ungültiger API-Key**
(`DEEPSEEK_SEARCH_BASE_URL`/`web-search-deepseek.baseURL` nicht auf diesen Key
konfiguriert). Das ist ein **echter Blocker, kein Rate-Limit** — der Endpunkt ist für
diesen Key gesperrt. **Zweiter Weg (genommen):** `web_fetch` direkt auf die
bekannten Quellen (Cursor-Blog/Doku). Das reichte für 5 von 6 Tabellenzeilen.
Zeile 6 (Gaming-Beleg) bleibt generalisiert, weil keine spezifische Quelle per
`web_fetch` erreichbar war.

---

## Am Ende — was nicht geklärt wurde

- **Keine zitierte Quelle für LLM-Agent-Trust-Gaming** (generisches RLHF-Problem,
  nicht Shinon-belegt).
- **Anthropic/Claude-Code, Replit, Aider, Devin** wurden **nicht** einzeln abgefragt
  (Suche blockiert, nur Cursor direkt erreichbar). Wenn du diese brauchst:
  `web_search`-Key reparieren (Settings → Plugins → Web search) oder
  `DEEPSEEK_SEARCH_BASE_URL` auf einen gültigen Endpoint zeigen — dann liefere ich
  die verbleibenden 4 Quellen nach.
