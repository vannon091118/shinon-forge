# Scoring — Konzept

> **Status:** plan — Vannons Idee als Kanon; K1–K4 im Code sind die **erste Umsetzung** (lesend, statisch) und damit Teil des Ist-Zustands, nicht der Zieldefinition. · **Stand:** 2026-10-11
> **Einstieg:** `docs/INDEX.md` · **Zahlen:** `docs/ZAHLEN.md`

> **Quelle:** Vannons Konzeptnotiz (2026-10-11). Dieses Dokument **beseitigt die
> Widersprüche** zwischen der Notiz und der gebauten Schicht. Es beschreibt, was
> **gebaut werden soll** — nicht, was K1–K4 heute sind. K1–K4 sind der Ausgangspunkt,
> der hier weitergebaut wird.

> **Korrektur (2026-10-11, dritte Fassung):** Skill-Erzeugung ist **kein**
> Trigger-Nebenprodukt der Scorecard, sondern **Agent-Reflexion** nach dem Task
> („Lessons, not logs"). Die drei Ebenen (Skills / Memory / Augenhöhe) sind
> getrennt: prozedurales Wissen → Skills, dauerhafte Fakten → Memory, laufende
> Anpassung → Persona (B3). Trigger **injizieren Verhalten**, sie **erzeugen keine
> Skills**. Skill-Improvement ist die Arbeit des **arbeitenden Modells** (Shinon) —
> der Prompter sieht Pitfalls nicht, und es gibt keinen Handshake zwischen den beiden
> (bewusste Trennung). Der **Prompter** (Context-Index, keine persistierte Fakten)
> übernimmt die **End-Session-Prüfung** generierter Skills: zu spezifisch? zu breit?
> Konsolidierbar? Skills sind zweigeteilt: **Taktische Skills** (Agent erzeugt im
> laufenden Task) und **Master Skills** (stabil, thematisch geprüfter Kern).

## 0. Status-Abgleich (K1–K4 sind gebaut, hier wird ergänzt)

| Baustein | Ist (K1–K4) | Soll (dieses Dokument) |
|---|---|---|
| `@shinon/scoring`-Paket | lesend, statisch, deterministisch | bleibt lesend; K5–K8 bauen darauf |
| Eventtypen (K1) | `feedback.approval`/`correction`, `relation.updated` | bleiben; K5 definiert, **wer** sie emittiert |
| Kern (K3) | `scoring-core.js`: replay, applyEvent, evaluateTriggers, deterministisch | bleibt die **einzige** Rechenschicht; K5 speist sie mit Signalen |
| Gate (K4) | Schreib-Scope, Trigger-Vertrag, konservativ | bleibt die Schranke für die **Scorecard-Schicht** (lesend) |
| Skills | statisch (`technical-profile.json`: caution/autonomy/briefing) | **werdend durch Agent-Reflexion** (K7), nicht durch Trigger |
| Emittierung | fehlt (Scorecard steht bei `initial`) | **K5** schließt diese Lücke (Zug 1: gebaut) |
| Dauerhaftigkeit | fehlt — der Stand lebte im Arbeitsspeicher des Hosts und war nach jedem Neustart weg | **Zug 2: gebaut** — Protokoll, Zuordnung und Tafel liegen in der SQLite des Projekt-Index (§2.5) |
| Vorlieben | getrennt (K8, Memory-Store) | bleibt getrennt, nie in der Scorecard |

### Die drei Ebenen (Trennungsregel)

| Ebene | Was | Persistenz | Wer liest sie |
|---|---|---|---|
| **1 — Arbeitsweise / Scorecard** (K5, B3) | Implizite Signale aus dem Lauf (Kopieren, Selbstkorrektur, Umformulierung, Akzeptanz) → `correctness`, `trust` | persistent (decay + cooling) | Scoring-Trigger → Prompter |
| **2 — Vorlieben / Memory** (K8) | Deklative Fakten über User und Umgebung („User prefers concise", „Gates: npm run check"). Nie imperativ. | hartes Char-Limit, Konsolidierung statt Anhängen; `ttl` je Store | Persona (B3) → Prompter-Stil |
| **3 — Prozedurales Wissen / Skills** (K7) | „Bei X immer Y tun, weil Z" — nicht offensichtlich, gelernt aus dem Task | thematisch gegliedert, patchbar, erweiterbar | Agent lädt sie **vor** dem nächsten relevanten Task |

**Eine Regel hält die Trennung:** *Was pro Task typisch ist → Skill (Ebene 3). Was in
jeder Session gilt, egal welches Thema → Memory (Ebene 2). Wie der Lauf gerade verläuft
→ Scorecard (Ebene 1).* Ein User, der locker redet (Ebene 2), wird nie in `correctness`/
`trust` (Ebene 1) eingestuft. Ein Pitfall, das einmal aufgetaucht ist (Ebene 3), wird
nie in Memory (Ebene 2) abgelegt.

---

## 1. Prozedurales Wissen: Skills (K7)

**Was ein Skill ist:** Nicht-Offensichtliches, das aus einer gelösten Aufgabe resultiert —
ein Pitfall, ein Workflow, eine Konvention. Regel: **„Lessons, not logs."**
„Bei X immer Y tun, weil Z" ist ein Skill. „Am 12.03. ist Folgendes passiert" ist
kein Skill, das ist ein Log-Eintrag.

**Wer erzeugt Skills: das arbeitende Modell (Shinon), nicht der Prompter.**
Das ist die zentrale Korrektur der zweiten Fassung. Skill-Improvement ist die Arbeit
dessen, der die Aufgabe löst — wer das Pitfall findet und löst, weiß auch, was nicht
offensichtlich war. Der Prompter sieht davon nichts (bewusste Trennung, kein
Handshake zwischen Prompter und Agent — der Prompter darf den Kontext nicht
persistieren, sonst bricht die Trennung).

**Zwei Sorten Skills:**

| Sorte | Wer erzeugt | Wann | Leben |
|---|---|---|---|
| **Taktische Skills** | Das arbeitende Modell (Shinon) | Im laufenden Task, nach dem Task (Reflexion) | kurzlebig, Projekt-spezifisch, werdet |
| **Master Skills** | Bestehen aus gefestigten taktischen Skills | Am Ende einer Session, geprüft vom Prompter | stabil, thematisch geprüft, persistiert |

**Taktisch → Master:** Ein taktischer Skill, der sich über mehrere Tasks wiederholt
und sich als stabil erweist, wird am **Ende der Session** vom Prompter geprüft:
*Ist er zu spezifisch? Zu breit? Konsolidierbar mit einem bestehenden Master
Skill? Sollte er Master werden?* Der Prompter **prüft und konsolidiert** — er
erzeugt taktische Skills nicht, aber er entscheidet, was aus taktischen wird.

**Thematische Gliederung:** Skills sind nach Thema gegliedert (z.B. `github`,
`systematic-debugging`, `hermes-agent`), nicht nach Zeit. Beim nächsten relevanten
Task werden die passenden Skills **vor der Antwort** geladen — nicht danach.

**Zwei Wege, ein Skill zu ändern:**
- **Patching (gezielt):** Ein bestehender Skill ist unvollständig oder falsch → der
  Agent korrigiert die konkrete Zeile. Lesend im K4-Sinne (keine neue Datei, kein
  fremdes Schreiben).
- **Neuer taktischer Skill:** Passender Skill existiert nicht → das arbeitende
  Modell erzeugt einen, mit der Regel „Lessons, not logs" und einer klaren
  thematischen Einordnung.

### 1.1 Skill-Laden: die offene Frage (K7a)

„Beim nächsten relevanten Task werden sie vorher geladen" — **wer erkennt den
nächsten relevanten Task?** Das ist die Lade-Logik:

- **Lese-Trigger pro Task:** Vor der Antwort lädt das arbeitende Modell die Skills,
  deren thematischer Tag zum aktuellen Task passt. Das ist eine **Relevanz-Prüfung**
  (Thema-Tag des Tasks vs. Thema-Tag des Skills), nicht ein Scorecard-Trigger.
- **Korrektur als Skill-Patch:** Sagt der User „kürzer antworten" oder „das hast
   du falsch gemacht, rutsch runter", wird das als **Korrektur** in den relevanten
   taktischen Skill gespeichert (nicht in Memory, weil es pro Task typisch ist).
   Nächstes Mal lädt das Modell den gepatchten Skill und ist „schon drin".

**Entschieden (Zug 4, 2026-10-12):**

- **Ablage-Ort: `generated-skills/`** — ein eigenes, versioniertes Verzeichnis,
  getrennt von `technical-profile.json`. **Eine Datei je Zettel** (`.json`), kein
  Unterordner. Schreiben und Lesen sind getrennt: die Zettel schreibt das
  **arbeitende Modell** mit seinen eigenen Werkzeugen (es sieht die Pitfalls),
  der **Veredler** liest und prüft sie (er sieht die Muster) — und er erzeugt
  keinen einzigen. Format, Grenzen und Prüfregeln stehen als **Daten** in
  `packages/prompter/assets/note-rules.json` (`shinon.note-rules/v1`); die
  Beschreibung des Verzeichnisses ist `generated-skills/README.md` und
  wiederholt keine Zahl aus den Regeln. Der Kern
  (`packages/prompter/assets/note-core.js`) ist importfrei und ohne Uhr:
  dieselben Zettel, dieselbe Auswahl, dieselben Befunde.
- **Lade-Regel: die Thema-Marke aus dem aufgelösten Kontext** — nicht der
  Scoring-Trigger, nicht die Zeit. Ein Zettel lädt, wenn seine `thema`-Marke im
  Kontext dieses Schritts vorkommt (Projekt, Pfade, Symbole, Randbedingungen,
  Touches, Abhängigkeiten) oder im Prompt. Ohne Kontext lädt **kein** Zettel: ein
  Zettel, dessen Thema niemand aufgelöst hat, ist ein Zettel ohne Anlass. Geladen
  wird höchstens `reading.maxNotes`, die meisten Treffer zuerst, bei Gleichstand
  alphabetisch — die Auswahl ist bei gleichem Kontext dieselbe.
- **Der Weg in den Prompt:** die passenden Zettel reisen als eigener Block
  (`<shinon_stand>`) neben dem Kontextblock, aus **derselben Naht**
  (`resolveContext` des Projekt-Index). Der Entscheidungsdatensatz des Schritts
  nennt, was geladen wurde (`notes.loaded`) und warum nicht (`notes.reasons`) —
  eine stille Lücke gibt es nicht.

### 1.4 K5-Signal-Quellen: intern und nativ — kein Browser (Ist-Stand Zug 1, 2026-10-11)

**Korrektur der Vorfassung.** Diese Sektion hat vier Signale als „braucht eine
UI-Registry" geführt und den Browser-Beobachter als Weg beschrieben. Beides ist
verworfen: der Agent soll nicht von einer Plattform abhängen, und **DSH schreibt
die Urteile des Menschen selbst** — sie lagen nur in `carrier.ignoredTypes`.
Zug 1 bildet sie im Spine ab (`feedback/record`, `feedback/message-put`,
`feedback/message-delete` → `feedback.noted`, `feedback.rated`,
`feedback.retracted`) und liest sie host-seitig. Kein Browser, kein DOM, keine
30 Plattformen.

Die Tabelle liegt jetzt als **Daten** in `packages/scoring/assets/signal-rules.json`;
was dort keinen Zulieferer hat, steht ausdrücklich als nicht beobachtbar:

| Signal | Interne Quelle (gemessen) | Emittiert? |
|---|---|---|
| 1. Kopieren | es gibt kein internes Kopier-Ereignis. Stattdessen das **ausdrückliche Urteil** des Menschen zu EINER Antwort (`feedback/message-put`, `rating: positive`) | **Ja** (Zustimmung, mittel) |
| 2. Übernahme | braucht den Turn-Diff (`workspace/changes` + `ctx.workspaceChanges`): welche Dateien hat ein Turn geändert, ohne dass ein Werkzeug sie schrieb? | **Nein** (fail-closed, eigener Zug) |
| 3. Selbstkorrektur | negatives Urteil (`rating: negative`) | **Ja** (Korrektur, hoch); die zweite Hälfte (Änderung am gelieferten Pfad) braucht wie #2 den Turn-Diff |
| 4. Umformulierung | `user/message` mit `data.source.kind === 'user'` und inhaltlicher Überlappung mit der letzten Frage derselben Sitzung | **Ja** (Korrektur, mittel) |
| 5. Akzeptanz | `turn/end` mit `reason.kind === 'completed'` | **Ja** (Zustimmung, niedrig) |
| 6. Verwerfung | Abbruch durch den Menschen (`reason.kind === 'aborted'`) und der **Widerruf** eines Urteils (`feedback/message-delete`) | **Ja** (Korrektur mittel / Widerruf rechnet exakt zurück) |
| 7. Nächste Frage | braucht die Thema-Regel über den Projekt-Index (gemeinsame Dateien und Begriffe) | **Nein** (eigener Zug) |

Dazu eine Quelle ohne Pol: die Sitzungsbemerkung (`feedback/record`) wird
**beobachtet und gezählt, aber nie gewertet** — sie trägt keine Richtung, und was
nicht erkennbar ist, wird nicht geraten (fail-closed).

**Keine Sekundenregel.** Die 90-s-Regel der Vorfassung ist gestrichen: ob eine
Frage wiederkommt, entscheidet der INHALT (gemeinsame und überlappende Wörter,
Schwellen als Daten). Gemessen an den echten Ereignissen trägt Harness-Text
(`system-reminder`, Runtime-Kontext) denselben Typ `user/message` wie ein Mensch —
nur `data.source.kind === 'user'` unterscheidet sie, und genau das prüft der
Übersetzer.

**Kein Deckel** (gesetzt am 2026-10-11): Trust-Ceiling und Zähler-Limit aus §4
kommen nicht in die Daten; das Gate lehnt solche Schlüssel in der Signaltabelle ab.

**Korrekt-Simulation (nur #4 + #5, exakte `scoring-core.js`-Regeln, 17 Sessions):**
`88b60337` trust = 0.6914, correctness = 1.0000 — **knapp unter der `autonomy`-
Schwelle (trust > 0.7)**. Die ursprünglich falsche Übernahme-Zählung (79 Fälle aus
Agenten-eigenen `tool/call`-Events) hatte trust auf 0.93 gezogen; die Korrektur
zeigt: die log-gültige Teilmenge gamet die Autonomie nicht.

**Web-Beleg (`k5-web-research.md`):** Cursor Router nutzt dasselbe Prinzip —
*„Moving on to the next task is a strong positive signal, while correcting the
agent is a strong negative one."* (cursor.com/blog/how-cursor-router-works).
Der dortige Weg (Hooks, Checkpoint-Rollback) bleibt als Beleg dafür stehen, wie
andere die fehlenden Quellen lösen — er ist **nicht** der Plan dieses Repos.

### 1.2 Skill-Prüfung (K7c) — was wirklich geprüft wird (Ist-Stand Zug 4, 2026-10-12)

Der Veredler (Context-Index, keine persistierten Fakten) prüft die Sammlung der
Zettel. Drei Befunde, jeder als **Daten** in `note-rules.json#review` — die
Etiketten sind die Worte des Befunds:

- **zu spitz** (`review.tooNarrow`): der Zettel gilt für EINEN Fall — er nennt ein
  Datum, eine Sitzungs-Kennung, einen absoluten Pfad oder mehr als `maxPaths`
  konkrete Dateien. Eine Regel für einen Tag ist ein Log, keine Lesson.
- **zu breit** (`review.tooBroad`): die Anweisung trägt zu wenige eigene Begriffe
  (nach Abzug der benannten Füllwörter) und gilt damit für alles.
- **doppelt** (`review.duplicate`): zwei Zettel desselben Themas sagen dasselbe —
  gemessen am INHALT (gemeinsame Begriffe und Anteil, wie bei der
  Wiederholungserkennung), nicht am Dateinamen.

**Nicht geprüft, und das steht so da:** ob zwei Zettel sich WIDERSPRECHEN. Ein
Widerspruch braucht ein Verständnis der Aussage, und das hat hier kein Modell.
Ein Befund behauptet nur, was er messen kann.

**Der Auslöser ist ehrlich benannt:** DSH kennt im Spine **kein**
Sitzungsende-Ereignis (dieselbe Lücke, an der sich das Scoring orientiert). Eine
Prüfung an einem erfundenen Ereignis wäre eine Behauptung, deshalb ist sie ein
**Befehl**: `npm run notes:check` ist Exit 0 bei „kein Befund" und Exit 1 mit
jedem Befund (Datei, Art, Grund) — auch für eine Datei, die gar kein Zettel IST
(sie würde sonst stillschweigend nie laden). Geprüft wird mit DENSELBEN reinen
Funktionen, die der Veredler beim Laden benutzt: ein zweiter Prüfer wäre ein
zweiter Maßstab.

Der Veredler **erzeugt keine** Zettel und ändert keinen — er lädt und prüft das,
was das arbeitende Modell erzeugt hat. Das hält die Trennung: das arbeitende
Modell sieht die Pitfalls, der Veredler sieht die Muster.

### 1.3 Trigger-Korrektur (K6)
Erkennt der Lauf, dass ein Skill am falschen Ort geladen wurde (Kontext verschwendet),
wird der **Lade-Trigger** korrigiert — dokumentiert mit einer Notiz. Das ist die
Triangulierung: ein falscher Lade-Moment ist ein gemessener Fehler, kein stilles
Überspringen. K6 ist **lesend** (patcht die Lade-Regel), kein Erzeuger.

---

## 2. Narrative Q-Learning-Ebenen: Scorecard (K5) + Memory (K8)

**Idee:** Implizite User-Reaktionen werden gesammelt und **anfangs neutral** gewichtet.
Je öfter ein Signal wiederkehrt, desto höher wird seine Gewichtung. Deklative Fakten
über den User (Vorlieben, Umgebungsbezüge) fließen in ein getrenntes Memory — nie in
die Scorecard.

### 2.1 Ebene 1: Implizite Signale → Scorecard (K5) — kein Button, kein Popup

**Vollständig vordefiniert — kein Scaffolding während des Task-Laufs.**
Alle Signale, ihre Erkennung, ihr Delta und ihre Stärke stehen **vor** der ersten
Implementierung fest. Während der Task-Ausführung trifft das System **keine**
zusätzliche Entscheidungen: es erkennt, was vordefiniert ist, und wendet es an.
Was nicht in der Tabelle steht, wird **nicht** erkannt (fail-closed, kein Raten).

| # | Verhalten | Erkennung (deterministisch) | Emittiert | Stärke | Delta (correctness / trust) |
|---|---|---|---|---|---|
| 1 | **Kopieren** der Antwort/Code-Blöckes | Copy-Event auf ein ausgegebenes Element | `feedback.approval` | high | +0.12 / +0.06 |
| 2 | **Übernahme**: User baut auf dem ausgegebenen Code weiter, ändert nichts | Diff: ausgegeben → übernächster Commit/Änderung, nur Hinzufügen | `feedback.approval` | low | +0.03 / +0.02 |
| 3 | **Selbstkorrektur**: User ändert den ausgegebenen Text/Code selbst | Diff: ausgegeben → editiert vom User, Änderung im selben Bereich | `feedback.correction` | high | −0.18 / −0.10 |
| 4 | **Umformulierung**: User stellt die Frage neu (zweite Folgefrage, selben Task) | Neue User-Nachricht, äquivalenter Scope, < 60 s Abstand | `feedback.correction` | medium | −0.09 / −0.05 |
| 5 | **Akzeptanz**: User schließt den Task ohne Änderung | Task-Ende + kein editiertes ausgegebenes Element | `feedback.approval` | medium | +0.06 / +0.03 |
| 6 | **Verwerfung**: User verwirft/tilgt die Antwort | Element entfernt, Task nicht fortgeführt | `feedback.correction` | high | −0.18 / −0.10 |
| 7 | **Nächste Frage ohne Änderung** | Neue User-Nachricht, anderer Scope | `feedback.approval` | low | +0.02 / +0.02 |

**Regeln, die die Tabelle halten (alle vordefiniert, keine Laufzeit-Entscheidung):**
- **Stärke → Delta-Faktor:** `high` = doppeltes Basis-Delta, `medium` = einfaches,
  `low` = halbes. Das Basis-Delta steht in `scoring-state.json` (aktuell:
  approval +0.06/+0.03, correction −0.09/−0.05). Die Faktoren (2×, 1×, 0.5×) sind
  **feste Konstanten**, keine Laufzeit-Parameter.
- **Korrekturen wiegen stärker als Zustimmungen** (−0.18 vs. +0.12 bei high):
  konservativ gegen Reward-Sparsität — ein Missclick-Approval wiegt weniger als
  eine echte Selbstkorrektur. Das ist die Asymmetrie, die Rauschen strukturell
  schwächer macht als Evidenz.
- **Neutral anfangs:** Die Tabelle definiert, *was* ein Signal ist. Die *Gewichtung*
  (Wiederholung wiegt höher) kommt aus `decay` + `cooling` in `scoring-core.js`
  (K3) — sie ist deterministisch und braucht keine Laufzeit-Entscheidung.
- **Nicht in der Tabelle = nicht erkannt.** Keine heuristische „vielleicht ist das
  auch ein Signal"-Erkennung. Was nicht vordefiniert ist, wird nicht emittiert.
  Fail-closed: ein unbekanntes Verhalten ändert nichts, es wird gezählt
  (`ignored`), aber nichts verschiebt.
- **Erkennung ist diff-basiert, nicht LLM-basiert.** Kopieren/Selbstkorrektur/
  Umformulierung werden über **Text-Diffs** zwischen ausgegebenem Element und
  folgendem Zustand erkannt — kein Modellaufruf, keine LLM-Interpretation. Das
  hält es deterministisch (K3-Regel: kein `Math.random`, kein Modell in der
  Signalerkennung).

**Was „kein Scaffolding" konkret bedeutet:**
Die Tabelle ist **geschlossen**. Bei der K5-Implementierung werden genau diese
7 Signale mit genau diesen Erkennungsregeln gebaut. Es gibt keinen Platzhalter
„weitere Signale später". Wenn ein neues Signal gewünscht ist, wird die Tabelle
**erweitert** (neue Zeile, neu vordefiniert, mit Delta + Stärke + Erkennungsregel)
— nicht zur Laufzeit erdacht. Das ist die Anti-Scaffolding-Regel: die Signale
sind ein **Vertrag**, nicht ein Feature.

**Augenhöhe-Adaption (diese Ebene trägt B3):** Shinon beobachtet Korrekturen,
Rückfragen und Reaktionen und passt technisches Niveau, Tempo, Humor-Dosis und
Härtegrad an. Die Annahme ist eine **Hypothese, keine Wahrheit** — widerspricht der
User, hat sich Shinon geirrt und passt nach. Das ist die `stance`/`mood`/
`limitations`-Logik aus `persona-state.json` (B3), nicht die Scorecard-Mathematik.

### 2.2 Ebene 2: Memory (K8) — deklare Fakten, getrennt von der Scorecard

**Zwei getrennte Stores:**

| Store | Zweck | Beispiel |
|---|---|---|
| `user` | Wer der User ist, seine Präferenzen | „User hat keine Zahlungsdaten, averse zu VPN-Latenz" |
| `memory` | Shinnons Notizen über die Umgebung | „Brutalord-Projekt in /home/vannon/…, Gates: npm run check" |

**Regeln:**
- **Declarative Fakt, keine imperativ:** „User prefers concise" ✓ — „Always be
  concise" ✗. Memory beschreibt, es gibt keine Anweisungen an Shinon.
- **Hartes Char-Limit** (aktuell ~24–25 % gefüllt). Wenn voll: **konsolidieren oder
  entfernen**, nicht einfach anhängen. Konsolidierung = ähnliche Fakten zusammenfassen,
  veraltete entfernen.
- **Trennung von K5:** Memory (Ebene 2) ist **persistent über Sessions**, aber
  *themenunabhängig*. Was pro Task typisch ist, gehört in **Skills** (Ebene 3), nicht
  in Memory. Was in jeder Session gilt, egal welches Thema, gehört in Memory.
- **Wird von der Persona (B3) gelesen**, nicht von den Scoring-Trigger. Memory
  verändert den **Stil** (Sprache, Tempo, Detailtiefe), nicht die **Korrekt-
  werte** (`correctness`/`trust`).
- **Korrektur-Signale des Users („kürzer antworten", „das hast du falsch
  gemacht") sind pro Task typisch → taktischer Skill (Ebene 3)**, nicht Memory.
  Memory nimmt nur auf, was in jeder Session gilt, egal welches Thema.

### 2.3 Paradigmenwechsel
Weg vom Template *„Wie soll dein Agent sein?"* hin zu: *„Dein Agent lernt, wer du
bist, und simuliert eine autonome Meinung."* Shinon ist ein Partner auf Augenhöhe —
frech, witzig, hilfreich, manchmal skurril. Kein Ja-Sager. Ablehnung eigener
Entscheidungen muss möglich sein (dafür die `stance: critical` in B3).

### 2.4 Persistiertes Wissen
Das bestehende **Indexierungs-Feature für Prompter-Max** sammelt schon Daten —
die Grundlage, auf der K5 (Signale → Scorecard) und K8 (Fakten → Memory) aufbauen.
Es vereinfacht das Nutzererlebnis, auch wenn nicht immer klar ist, welche Daten
erfasst werden. Für **K5 ist diese Grundlage seit Zug 2 gebaut** (§2.5): der Stand
liegt in derselben SQLite, die der Index für das Projekt führt. Für **K8** steht
die Ablage damit bereit — der Fakten-Store selbst (Konsolidierung, hartes Limit)
ist noch nicht gebaut.

### 2.5 Dauerhaftigkeit: der Index als Ablage (Ist-Stand Zug 2, 2026-10-11)

**Korrektur der Vorfassung.** §1.4 hat die Ohren gebaut — der Stand lebte danach
im Arbeitsspeicher des Hosts und war nach jedem Neustart weg. Das widersprach der
Absicht, die dieses Dokument in §2.3 selbst formuliert: „Dein Agent lernt, wer du
bist." Ein Agent, der jede Sitzung bei `initial` beginnt, lernt nichts. Zug 2 legt
den Stand deshalb dorthin, wo das Projekt ohnehin eine Datenbank hat.

**Wo.** `~/.shinon/indexes/<projekt-hash>/index.sqlite`, Tabelle `memory`. Ein
Namensraum (`shinon.scoring/ledger-v1`) und drei Zeilenarten: `record` (eine
Protokollzeile **mit Betreff**), `memo` (Zustand je Sitzung), `summary` (die
gerechnete Tafel und die Zahl der Bemerkungen). Das Scoring schreibt **selbst
nichts** — kein Pfad, kein Dateisystem, keine Datenbank in diesem Paket (das Gate
prüft es). Es liest den zweiten, schmalen Dienst des Index: `shinon_index_store`
(`shinon.project-index/store-v1`) mit genau zwei Operationen, `load` und `save`.

**Warum ein zweiter Dienst.** Die Abfrage (`shinon_index_query`,
`resolveContext`) ist per Test auf genau ihre zwei Schlüssel festgenagelt. Sie zu
erweitern hieße, jedem Leser des Kontexts ein Schreib-Modul in die Hand zu geben.
Zwei Namen, zwei Verträge, zwei Berechtigungen.

**Warum die Ablage einen Index-Neuaufbau überlebt.** Alles andere im Index ist
**Ableitung** — Dateien, Symbole, Kanten, Chunks entstehen aus dem Projekt, und
ein `SCHEMA_VERSION`-Sprung verwirft sie bewusst (`1 → 2` in Zug 2, weil die
Tabelle dazukam). Die Ablage ist das Gegenteil: ein Urteil lässt sich nirgends
nachlesen. Sie trägt ihre eigene Fassung (`MEMORY_VERSION`) und wird nur von
dieser verworfen — nicht vom Index.

**Was der Stand trägt.** Das Protokoll ist die **Wahrheit**, die Tafel ist daraus
**gerechnet** (`replay`). Deshalb wirkt der Widerruf auch nach dem Neustart exakt,
und deshalb trifft späte Kritik die richtige frühere Aufgabe: die Zuordnung
(`session_id` + Betreff) reist mit, und ein zweites Urteil zu **derselben** Antwort
**ersetzt** die erste Zeile, statt eine zweite daneben zu legen.

**Sitzungen enden mit dem Prozess.** DSH kennt im Spine kein Sitzungsende-Ereignis.
Statt eines zu erfinden, schließt der Host beim Beenden alle offenen Sitzungen
(`closeAllSessions`), und ein neues `session.created` schließt genau eine. Der
Merkzettel geht dabei, das Protokoll bleibt — Evidenz ist keine Sitzung. Eine
Hülle ohne Frage wird gar nicht erst geschrieben: sie wäre Ballast, der sich über
die Laufzeit zu einer Zeile je Sitzung summierte.

**Fail-closed, drei benannte Richtungen:** kein Dienst → im Speicher weiterrechnen
(kein Fehler); fremder Dienst (falscher Vertrag oder fehlende Operationen) → nicht
benutzen; nicht lesbarer Index → **leer starten, aber laufen**, mit dem Grund im
Protokoll. Ein kaputter Index hält den Host nicht an und darf auch nicht so tun,
als sei er heil.

**Grenzen, benannt, mit Messung (2026-10-11).** (1) Je Signal wird der ganze
Namensraum neu geschrieben. GEMESSEN (`node scripts/store-cost.mjs`, Belege in
[docs/probes/store-cost.json](probes/store-cost.json)): der Aufwand wächst **nicht**
nennenswert mit der Zahl der Signale — über 1 000 Zeilen kostet eine Zeile 0,03 ms
(`writeMemory` 58,6 ms bei 10 Zeilen, 100,0 ms bei 1 000, 516,8 ms bei 20 000),
während JEDER Aufruf ~291 ms Öffnen trägt (davon **306 ms in vier
Metatransaktionen**, gemessen an einer nachgebauten, gegen den echten Aufruf
kreuzgeprüften Zerlegung) plus 34–126 ms WAL-Checkpoint. **Entscheidung: das
Neuschreiben ist nicht der Fehler, und inkrementelles Anhängen ist als Antwort auf
die Zeilenzahl nicht nötig.** Es wäre zwar 12- bis 15-mal billiger je Signal
(46,8/36,6 ms gegen 571,3/793,8 ms bei n=10/100), aber dieser Gewinn kommt aus dem
EINEN gehaltenen Index und der EINEN Transaktion, nicht aus den gesparten Zeilen —
er zahlt weiter ein fsync je Signal (~33 ms). Wenn die ~0,6–0,8 s je Signal fallen
sollen (so viel kostet ein `save` auf einer Kopie der laufenden 12,96-MB-Datei),
ist der billigere Hebel: den Index über die Laufzeit halten und die vier
Metaschreibungen nur bei echter Änderung fahren. Ein Anhängen bliebe der zweite
Weg, verlangt aber gezieltes Löschen beim Widerruf, einen Zähler statt eines
Array-Index für `ordinal` und eine neue Leserordnung — Semantikwechsel für einen
Gewinn, den der gehaltene Index ohne sie hat. Nicht gebaut, weil nicht nötig.
(2) `stats` (beobachtet, Gründe, Zähler) bleibt Sache des Prozesses, nicht der
Ablage: dauerhaft sind Protokoll, Merkzettel, Tafel und Bemerkungen. (3) Der LIVE
gemessene Neustart im gebooteten Host ist nachgeholt (2026-10-11, §2 der Zahlen):
`dsh --profile shinon` aus der CLI, ein echtes Urteil über die echte UI, ein
Widerruf, SIGTERM — und der nächste Host meldet `Stand geladen: 1 Signale, 1 offene
Sitzungen, 0 Bemerkungen` und schreibt auf dem geladenen Stand weiter (`turn:1` aus
dem ERSTEN Host stand danach neben zwei neuen Zeilen). Die Kette bleibt zusätzlich
über die echten `apply()`-Schnittstellen beider Pakete an einem Host mit echtem
`provide`/`get` belegt (`scripts/gate/tests/scoring-memory.test.mjs`).

---

## 3. Umsetzungsplan (Reihenfolge, Abhängigkeiten)

| Phase | Inhalt | Art | Abhängig von |
|---|---|---|---|
| **K5** | Ebene 1: 7 vordefinierte implizite Signale (Kopieren, Übernahme, Selbstkorrektur, Umformulierung, Akzeptanz, Verwerfung, nächste Frage) — diff-basiert, deterministisch, kein LLM → Scorecard | lesend, **geschlossen** (keine Laufzeit-Entscheidung) | K1 (Eventtypen) |
| **K5.0** | Log-gültige Teilmenge: nur Umformulierung (#4) + Akzeptanz (#5) emittieren. `signal-rules.json` + `translateSignal` in `scoring-core.js` + Host-Listener in `index.js`. Die übrigen 5 Signale: `fail-closed` (nicht erkannt, nicht gerochen). | lesend | K5 (Vertrag), K1 (Kanal) |
| **K5.1** | UI-Registry-Quellen für die 4 fehlenden Signale (Kopieren, Übernahme, Selbstkorrektur, Verwerfung) + Scope-Regel für nächste Frage. Cursor-Hooks-Muster (`beforeReadFile`/`afterFileEdit`, Checkpoint-Rollback) als Referenz. | schreibend (Client-Registry) | K5.0 (Signal-Vertrag steht) |
| **K8** | Ebene 2: Memory-Store (user + environment), deklare Fakten, hartes Limit, Konsolidierung | lesend | K5 (Signale vorhanden, um Konsolidierung zu triggern) |
| **K6** | Trigger/Lade-Korrektur: falscher Lade-Moment → Notiz, Triangulierung der Lade-Regel | lesend | K5 + K8 (Relevanz gemessen) |
| **K7a** | **Skill-Laden:** Wer lädt welchen Skill vor dem nächsten Task (Lade-Regel, Thema-Tag vs. K6-Trigger) | lesend | K6 (man weiß, *wann* ein Skill passt) |
| **K7b** | **Skill-Erzeugung (taktisch):** Das arbeitende Modell (Shinon) erzeugt taktische Skills nach Task-Reflexion (Lesson, not Log) | **schreibend** (bricht K4, nur mit `generated-skills/` oder Bestätigung) | K7a (man weiß, *dass* ein Skill fehlt) |
| **K7c** | **Skill-Prüfung (Master):** Am Ende der Session prüft der Prompter die taktischen Skills: Konsolidieren, zu spezifisch, Duplikat | lesend | K7b (taktische Skills vorhanden) |

**Argument für die Reihenfolge:**
K5 zuerst — ohne Signale keine Daten. K8 danach — Memory füllt sich aus denselben
Signalen, aber getrennt. K6 dann — Lade-Regel korrigieren, jetzt wo gemessen wurde,
wann ein Skill falsch lädt. **K7a vor K7b** — ohne Lade-Regel erzeugt K7b Skills,
die niemand lädt. **K7b vor K7c** — ohne taktische Skills hat K7c nichts zu prüfen.
K7c (Prompter) am Ende — er prüft und konsolidiert das, was K7b (das arbeitende
Modell) erzeugt hat, aber er erzeugt selbst keine taktischen Skills.

**K5, K8, K6, K7a, K7c sind lesend — sie brechen keinen K4-Vertrag und sind
sofort umsetzbar.**
**K7b (Skill-Erzeugung, taktisch) ist der einzige schreibende Schritt** und braucht
Vannons Entscheidung: `generated-skills/` (systematisch) oder Vorschlag-bestätigen
(fail-open), plus die Lade-Regel aus K7a. K7c (Prompter) prüft K7b-Ergebnisse am
Session-Ende — er ist der Konsolidierer, nicht der Erzeuger.

**K5.0 zuerst (log-gültig, 2 Signale), dann K5.1 (UI-Registry, 5 Signale).**
K5.0 ist lesend und sofort umsetzbar (Umformulierung + Akzeptanz reichen für die
erste Scorecard). K5.1 ist der Schritt, der die Gamed-Maschinen-Relevanz erst
produziert (Copy/Adoption-Rauschen) — was es auffängt, sind nicht erfundene
Schranken, sondern die drei Mechanismen aus §4: Faktor, Widerruf, Vergessen.

---

## 4. Die drei echten Mechanismen (ersetzt Trust-Ceiling und Rate-Limit, Zug 3, 2026-10-12)

**Die Gefahr bleibt dieselbe (aus K5-Log-Simulation + Web-Recherche):** Wenn K5.1
die UI-Registry liefert, kann ein User durch systematisches Kopieren/Adoptieren die
`trust`-Scorecard über die `autonomy`-Schwelle (0.7) schieben — ohne inhaltlich
besser zu werden. Das ist der **Reward-Hacking-Fall** (generisches RLHF-Problem,
`k5-web-research.md` §2: keine Shinon-spezifische zitierte Quelle, aber industry-
bekannt).

**Die frühere Antwort darauf ist gestrichen.** Ein Trust-Ceiling (0.8) und ein
Rate-Limit (10 Approvals/Session) waren zwei erfundene Zahlen. Keine Messung trug
sie; sie standen in derselben Runde im Vertrag, in der die Schicht als „liest,
rechnet nach, erfindet nichts" beschrieben wurde. Und sie treffen den Falschen:
ein Deckel bei 0.8 fällt erst auf, wenn jemand lange und ehrlich arbeitet, während
ein stiller Rauschen-Strom unter jedem Limit bleibt; ein Limit auf die ANZAHL der
Signale zählt Menge, wo der Vertrag Qualität messen will (und macht die zehnte
ehrliche Zustimmung wertlos). Beide sind raus — aus `scoring-state.json` und aus
`technical-profile.json`. Was bleibt, sind drei Mechanismen, die es im Code
wirklich gibt; ihre Zahl lebt nicht in dieser Konzeptdatei, sondern im jeweiligen
Vertrag, und das Gate löst jeden in `tendency-rules.json#mechanisms` benannten Ort
auf (`scripts/gate/plugins/scoring.mjs`), damit kein Papier-Mechanismus stehen
bleibt.

| Mechanismus | Wo die Zahl lebt | Was er wirklich tut |
|---|---|---|
| **Faktor** (Gewichtung) | `signal-rules.json#limits.strengths` | Die Stärke eines Signals (schwach/mittel/stark) wird zum **Multiplikator auf das Vertragsdelta**, nicht zu einer zweiten Delta-Tabelle. Das Urteil eines Menschen setzt die Klasse (`feedback.rated`, `feedback.retracted`); ein Signal ohne benannte Stärke bekommt **keinen** Faktor (`null`) und erzeugt kein Ereignis. Die Asymmetrie — Korrektur wiegt schwerer als Zustimmung — ist damit eine Eigenschaft der Tabelle, keine handgepflegte zweite Zahl. |
| **Widerruf** | `signal-rules.json#sources.feedback.retracted` | Ein Widerruf nimmt **genau eine Zeile** aus dem Protokoll; die Tafel wird aus dem Rest neu gerechnet und steht danach wieder auf dem Wert von vorher (gemessen bis zur letzten Nachkommastelle: `scoring-signale` und `scoring-memory`). Zurückgenommenes zählt auch für die Tendenz nicht mehr. Das ist die ehrliche Antwort auf Gaming: der Mensch darf zurücknehmen, und die Maschine vergisst das Geschenk mit. |
| **Vergessen** | `scoring-state.json#decay` | Pro **bekanntem** Ereignis wandert jede Dimension um `rate` Richtung `initial` — **vor** dem Delta. Nichts ist endgültig und nichts muss es sein: ein Rauschen-Strom verblasst von selbst, während echte Leistung immer wieder neu verdient wird. Kein Sekunden-Zähler, keine Uhr — vergessen wird pro Ereignis, nicht pro Zeit. |

**Was NICHT dazugekommen ist:** keine Sekundenregel, kein Zähler-Limit, kein Deckel,
keine Laufzeit-Entscheidung. Fehlt einem Signal die Stärke, wird es nicht geraten.
Steht ein Ereignis nicht im Vertrag, ändert es nichts (`UNKNOWN_EVENT`) und wird nur
gezählt. Die drei Mechanismen sind die ganze Rechnung — die Tafel ist aus dem
Protokoll hergeleitet, und was nicht mehr im Protokoll steht, zählt auch nach dem
Neustart nicht mehr (§2.5).

### 4.1 Die Tendenz — aus dem Protokoll, nicht aus dem Ton (Zug 3)

Die Tendenz beantwortet eine Frage über das **Protokoll** (was ist passiert), nicht
über den Ton (wie klingt das). Sie steht deshalb im Kern und nicht in der Persona:
wer sie liest — Prompter, Persona — entscheidet über die Wirkung; gerechnet wird sie
hier. Alle Regeln liegen als **Daten** in `packages/scoring/assets/tendency-rules.json`
(`shinon.tendency-rules/v1`), die Ableitung selbst ist eine reine Funktion
(`deriveTendency` in `packages/scoring/assets/scoring-core.js`): gleiche Zeilen,
gleiche Tendenz —
kein `Math.random`, kein `Date.now`, kein Modell.

- **Klassen** (`classes`): welche Signale eine Klasse speist und welchen **Pol** sie
trägt — `korrektur` (negative: `selffix`, `rephrase`, `dismiss`) und `zustimmung`
  (positive: `copy`, `accept`). Ein Signal ohne Klasse ist keine Haltung, sondern
  eine Zeile aus einer älteren Regel: sie steht als `unmatched` sichtbar da.
- **Stufen** (`levels`): Anteil → Wort, absteigend, die letzte Stufe trägt 0.
- **Haltungen** (`stances`): geordnete Bedingungen über diese Worte; die erste
  passende gilt, die **letzte muss bedingungslos sein**. Die Reihenfolge IST die
  Asymmetrie der Haltung: `kritisch` steht vor `zustimmend`, deshalb kippt eine
  50/50-Lage zur Korrektur hin und nie zur Zustimmung.
- **Mindestevidenz** (`minSignals`): darunter wird **nichts** behauptet
  (`ready: false`, `THIN_EVIDENCE:2/3`) — kein Dünnschluss aus zwei Zeilen.

Zwei Zahlen, nicht eine: `signals` ist das ganze Protokoll (ehrliche Summe),
`counted` ist die Evidenzlage, auf der Anteile und Mindestevidenz rechnen — nämlich
die Zeilen, die eine Klasse auch liest. Eine zurückgenommene Zeile zählt in keiner
von beiden. Die Prüfung des Vertrags (Klassen, Stufen, Haltungen, Herkünfte, jeden
Mechanismus-Ort) ist Gate-Arbeit (`scripts/gate/plugins/scoring.mjs`), die Rechnung
ist Kern-Arbeit — dieselbe Trennung wie bei den Signalen.
