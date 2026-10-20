# Vision-Abgleich — was der Code-Kern heute ist und wo er von der Vision abweicht

> **Status:** current — Befund, keine Planung: der Stand der Vision gegen den
> Stand des Baums, mit jedem Beleg an einem Pfad. **Stand:** 2026-10-20
> **Einstieg:** `AGENTS.md` · **Zahlen:** [`ZAHLEN.md`](ZAHLEN.md) · **offene Arbeit:** [`ROADMAP.md`](ROADMAP.md)
> **Quellen der Vision:** [`../IDEA.md`](../IDEA.md) (Kurzfassung) ·
> [`../shinon-forge-implementierungsplan.md`](../shinon-forge-implementierungsplan.md) (historischer Arbeitsplan, §1–§30) ·
> `git show ffbf721:IDEA.md` (Roh-Export der Idee) · `git show 0630350:docs/FOUNDATION-PLAN.md` (Schichtenplan L0–L3) ·
> `git show 0630350:docs/REPO-ANALYSIS.md` (Vertragsbestand der Schwesterrepos)

Dieses Dokument nennt **keine** Bestandszahlen selbst — die stehen in
[`ZAHLEN.md`](ZAHLEN.md) — und es wiederholt **keine** offenen Punkte — die
stehen in [`ROADMAP.md`](ROADMAP.md). Was hier steht, ist ein Befund: was die
Vision verlangt, was der Baum heute tut, und wo der Abstand liegt.

**Wie man diesen Befund nachprüft:** jeder Abschnitt nennt den Pfad und die
Zeile. Wo ein Befund eine Abwesenheit behauptet, steht der Befehl dabei, mit
dem man sie nachzählen kann (Anhang, §8).

---

## 1. Was Shinon sein will

Die Vision ist **keine Feature-Liste**, sondern eine Architekturthese: DSH
liefert Harness, Laufzeit und Oberfläche; Shinon legt die Schichten darum, in
denen Fähigkeiten explizit aktiviert werden, Datenflüsse prüfbare Verträge
tragen und Aussagen über den eigenen Zustand an beobachtbare Evidenz gebunden
bleiben ([`../IDEA.md`](../IDEA.md)).

### 1.1 Die fünf Organe

| Organ | Was es liefern soll | Quelle |
|---|---|---|
| **7-Punkt-Contract** | Jeder Baustein definiert `POSITIVE` / `FORBIDDEN` / `FALLBACK` / `ERROR` / `TRACE` / `REPLAY` / `INVARIANT` und einen Zustand aus `IMPLEMENTED` / `STUB` / `NOT_IMPLEMENTED` / `NOT_VERIFIED` | Roh-Export, Abschnitt „3. 7-Punkt-Contract-Schema" |
| **Live Plugin Registry** | Eine Instanzwahrheit: `resolve()`, `activate()`, `deactivate()`, `health()` — damit die Figur zur Laufzeit weiß, welche Fähigkeiten wirklich aktiv sind | Roh-Export, Abschnitt „2. Live Plugin Registry" |
| **Gate Engine** | Selektive Governance über den Änderungs-Scope: build-, runtime-, evidence-, governance- und release-Gate | Roh-Export, Abschnitt „1. Shinon Gate Engine" |
| **Persona Policy** | Eigene Schicht mit Identity, Values, Personality, Self-Model, Memory, Affect/State, Goals und **Decision Policy** — „nicht in Prompts verstecken" | Roh-Export, Abschnitte „shinon auch als persona" und „9. Das wäre dann deine eigentliche Shinon-Architektur" |
| **Falsification → KARMA → Evidence → Governance → ALLOW/DENY → LIMEN** | Der Urteils-Ursprung: was ist wahr, was darf daraufhin geschehen | Roh-Export, Abschnitte „Die drei Systeme + Persona zusammen" und „11. Der entscheidende Kreislauf" |

### 1.2 Der Kreislauf

Die Vision ist eine Kette, und die Kette ist der Kern:

```
EXPERIENCE → OBSERVATION → EVIDENCE → VERDICT → NARRATIVE EVENT
          → PERSONA STATE → NEW GOALS → NEXT DECISION      (+ REPLAY)
```

Dazu die Trennung der Substrate (Roh-Export, „Der Kernunterschied"):
`Memory` = was passiert ist · `Evidence` = warum wir es glauben ·
`Narrative` = was es für die Geschichte bedeutet · `Persona` = wer ich dadurch
gerade bin · `Goals` = was daraus als Nächstes wichtig wird. Und die Regel,
die nicht verhandelbar war: **FACT → INTERPRETATION → NARRATIVE**, niemals
NARRATIVE → FACT.

### 1.3 Die Schichtenplanung des Vision-Autors

`git show 0630350:docs/FOUNDATION-PLAN.md`, Abschnitt „Fundament — Schichten":

```
L0  telemetry   fail-OPEN    Beobachtung
L1  router      fail-OPEN    Dispatch-Policy
L2  verify      fail-CLOSED  FalsificationGate (KARMA-Contract) + Probe/Twin
                            Claims-Lifecycle: unverified → supported → confirmed
                            | refuted | conflicted
                            Verdict-Vokabular: PLAN / RESEARCH / ASK / WRITE
L3  dashboard   fail-OPEN    Präsentation
```

Und der Maßstab, den die Vision selbst gesetzt hat (ebenda, „Reihenfolge und
*fertig*"): **„der erste echte Beweis ist nicht *alles bauen*, sondern einen
Handoff real zum Laufen bringen"** — weil in den Schwesterrepos die Contracts
reif waren, aber **0 Claims** die Grenze gewandert waren und **0 Runs**
geschlossen wurden (`git show 0630350:docs/REPO-ANALYSIS.md`).

---

## 2. Was der Code-Kern heute ist

**Ehrlich gebaut ist:**

- **Die Gate Engine.** Der Organ „Gate" ist real: Plugin-Runner mit
  Slice-Auswahl über den Änderungs-Scope, `policy.json` mit `always` /
  `local` / `slices` (`scripts/gate/policy.json`), fail-closed-Verhalten,
  Mutationsproben. Die Engine ist `scripts/gate/engine.mjs`.
- **Der 7-Punkt-Contract.** Alle zwölf Verträge unter `docs/contracts/`
  tragen die sieben Punkte je Regel (`positive`, `forbidden`, `fallback`,
  `error`, `trace`, `replay`, `invariant`) und einen `status` aus
  `{IMPLEMENTED, STUB, NOT_IMPLEMENTED, NOT_VERIFIED}`. Geprüft wird das vom
  Gate `contracts` (`scripts/gate/plugins/contracts.mjs`, `GATE_POINTS`).
  Die propsa-Form wurde nicht kopiert, sie ist angewendet.
- **Replay** — für den Event-Hook (`packages/hook/test/replay.test.mjs`) und
  für den Signalstrom des Scorings (`packages/scoring/assets/scoring-core.js`,
  `replay()`).
- **Die Provenienz-Leiter** des Prompters (`packages/prompter/assets/`) mit
  fünf Klassen und Zeigerpflicht — das DOKI-Prinzip („persistierte Information
  braucht eine Herkunft") als Code, nicht als Satz.
- **Die Narrative-Schicht** — `packages/narrative/assets/narrative-core.js`:
  `createArc()`, `relationshipState()`, `deriveComposite()`, `appendChronicle()`,
  `deriveMood()`. Aus Daten, ohne Uhr und ohne Zufall; das ist die
  Vision-„Narrative" und keine Chat-Historie.
- **Self-Model und Gedächtnis der Persona** —
  `packages/persona/assets/self-model.js` (`verifiedLimits()`,
  `openQuestions()`, Decay) und `packages/persona/assets/memory-core.js`
  (Kinds `preference` / `limit` / `lesson` / `evidence`, Commitments mit
  `proposed → decided`, Beleg-Zählung, Decay).
- **Der Project Index** — eine Quelle, inkrementell, mit Inode-Stempel,
  Symbolen und Kanten (`packages/project-index/assets/index-core.js`).

**Nicht gebaut ist:** eine Urteilsschicht, ein Aktivierungs-Register, ein
Handlungsrecht der Persona. Das ist der Kern dieses Dokuments (§3).

---

## 3. Die Divergenzen

### A. Die Urteilsschicht fehlt (L2 / Falsification / KARMA)

**Die Vision will:** Beobachtung → Evidenz → Urteil, ein lebendes
Verdikt-Vokabular, ein ALLOW/DENY-Gate, ein Claim-Lifecycle
`unverified → supported → confirmed | refuted | conflicted`.

**Der Code tut:** Er beantwortet überall die Formfrage, nie die Wahrheitsfrage.
`packages/prompter/assets/result-contract.js` kennt `acceptance()` — das prüft
*ein einzelnes Prompt-Ergebnis* auf Wohlgeformtheit
(`preservedIntent`, `addedRequirements`, `references`). `packages/scoring`
rechnet eine weiche Scorecard. `packages/hook/index.js:136` kennt
`allow | block` — der Block kommt aber aus der Konfiguration, nicht aus
fehlender Evidenz.

**Wo:** kein Paket für L2; kein Claim-Vertrag unter `docs/contracts/`; die
Begriffe `DENY`, `Falsification`, `KARMA`, `LIMEN` kommen im Laufzeitcode
nicht vor (Anhang §8). Das einzige Urteilsvokabular, das existiert, ist
`allow | block` — und `packages/hook/index.js:132` nennt es selbst
„Durchlass-Policy".

**Wie tief:** strukturell. Es fehlt kein Detail, es fehlt das Organ.

### B. Die Persona ist beschrieben, nicht verhaltenswirksam

**Die Vision will:** Zustände, „die das Verhalten beeinflussen", in einer
eigenen Schicht — „nicht in Prompts verstecken".

**Der Code tut:** `packages/persona/index.js` besteht aus Prompttexten
(`Config` ab `:714`: `identity`, `epistemic`, `changeClasses`, `determinism`,
`discipline`, `report`, `workaround`, `identityOverview` — jeweils ein
`z.string()`), die in den System-Prompt gehen (`:1185`). Der Zustand
(`identity`, `stance`, `uncertainty`, `mood`, `capabilities`, `limitations`,
`relation`) wird gerendert, nicht gelesen.

**Der Beleg für den Eigentümerwechsel:** Die Haltung, die das Verhalten
tatsächlich steuert — die Auswahl der Prompt-Blöcke — kommt aus dem
**Scoring**, nicht aus der Persona: `packages/prompter/assets/pre-step.js:439`
liest `toneState?.tone?.stance`, und der Dienst ist
`shinon_scoring_state` (`packages/scoring/index.js:83`). Die Persona liest
denselben Dienst nur lesend (`packages/persona/index.js:385`, Kommentar:
„Die Persona ist LESEND").

**Wo:** `packages/persona/index.js:385` (lesender Zugriff),
`packages/prompter/assets/pre-step.js:439` (steuernder Zugriff).

**Wie tief:** Eigentümer. Die Vision wollte die Persona als Eigentümer der
Interpretation; im Baum ist das Scoring der Eigentümer und die Persona eine
Sicht auf ihn.

### C. Keine Aktivierungs-Wahrheit

**Die Vision will:** `resolve / activate / deactivate / health` — eine Wahrheit
über *aktive* Fähigkeiten.

**Der Code tut:** `window.__shinonPlugins` (Map, `packages/core/client.js:374`)
vermerkt geladene Client-Bundles; `window.__shinonPluginCatalog`
(`packages/key-router/client.js:34`) ist eine Panel-Tabelle, deren eigener
Statuswert wörtlich `"beobachtet"` lautet (`:39`). Aktivierung, Deaktivierung
und Gesundheitsabfrage gibt es nicht.

**Der Beleg, dass die Lücke praktisch war:** Im echten Modellturn am 2026-10-20
war der Dienst des Begleiters im Host vorhanden („Spiegel aktiv — Domain
codingmon_pet v1"), aber der Stand ging nicht über die Leitung — der Browser
holt seine Remote-Beiträge aus einer kompilierten Liste in
`@deepseek-ai/dsh-api-remotes`, und ein Bundle außerhalb dieser Liste kann
sich nicht selbst anmelden. *Seit demselben Tag ist der konkrete Fall
geschlossen*: `@shinon/codingmon` mountet seinen eigenen Beitrag beim Start
(`packages/codingmon/client.js`, Form in `packages/codingmon/assets/uebergabe.js`).
**Die strukturelle Lücke bleibt** — die Registrierung hängt an der
komponierten Fremdliste, nicht an einem Register, in dem ein Paket sich
einträgt.

**Die faire Gegenrechnung:** Der `FOUNDATION-PLAN` hat die Registry bewusst
*nicht* gebaut („DSH hat Registry"). Das ist eine dokumentierte Entscheidung,
kein Versehen. Die Folge bleibt: „welche Fähigkeiten sind *aktiv*" ist nicht
beantwortet. Die Fähigkeitskarte (`packages/prompter/assets/capabilities.json`)
beantwortet eine verwandte, andere Frage — wer ist **zuständig** (statisch aus
Dateien gelesen), nicht wer ist **aktiv** (Laufzeit).

### D. Der Kreislauf ist offen

**Die Vision will:** `… → NARRATIVE EVENT → PERSONA STATE → NEW GOALS →
NEXT DECISION`.

**Der Code tut:** `packages/narrative/index.js:45` sagt es selbst — die Persona
übernimmt den Composite **nicht** in ihren eigenen Zustand; der Vertrag sagt
`authority: NONE`. *Das ist die richtige Entscheidung*: Narrative darf nie zur
Wahrheit werden, genau wie in der Vision. Aber die andere Hälfte fehlt: es
gibt keinen Pfad von Narrative- oder Persona-Zustand zurück zu **neuen
Zielen**. Und das Gedächtnis kennt kein `conflict`
(`packages/persona/assets/memory-core.js:32`: `preference`, `limit`, `lesson`,
`evidence`) — „Contradiction → preserve conflict" hat im Gedächtnis keinen
Platz.

**Wie tief:** die Schleife. Jedes Glied einzeln ist gebaut; die Kette ist es
nicht.

### E. Kein Verbund-Replay

**Die Vision will:** „gleiche Events → gleiche Narrative Transition →
prüfbare Persona-Entwicklung".

**Der Code tut:** Replay existiert je Glied (Hook: Envelope-Replay; Scoring:
Signalstrom-Replay). Für die Kette Ereignis → Evidenz → Urteil → Narrative →
Persona-Zustand → Prompt gibt es **keinen** Replay-Test — weil es keine
Urteilsschicht gibt, die man wiederholen könnte. Replayability ist damit pro
Glied belegt und für das System nicht.

### F. Zwei DoD-Punkte sind still verschwunden

Der historische Arbeitsplan listet in §27 („Definition of Done — Shinon
Runtime v1") die Kästchen des fertigen Systems. Abgleich gegen den Baum:

| Kästchen | Baum | Status |
|---|---|---|
| Code-Graph-Grundstruktur | **gebaut** — `packages/project-index/assets/index-core.js:438` (`SYMBOL_PATTERNS`) und `:447` (`EDGE_PATTERNS`: Import, Require, dynamischer Import), Schema `:460`/`:461`, Befüllung `:694`/`:711` | erfüllt |
| Loop Guard (§19 `LAST_VERIFIED_FACT`) | Der **Produzent** existiert (`packages/task-router/index.js:505`, `:564`, `:662` — die Angabe kommt aus einem benannten Quellschlitz); der **Auswerter** fehlt | offen — in [`ROADMAP.md`](ROADMAP.md) §2.2 geführt |
| Capability Router (Phase 8) | kein Organ, das alternative Fähigkeitspfade nach Priorität auflöst (native → Provider → Browser → Human). Was existiert, sind Provider-Fallbacks *innerhalb* einer Fähigkeit (`packages/prompter/assets/schema.js:127`) | **nirgends geführt** |
| Browser Vision (Phase 9) | `packages/vision-fallback/` existiert nicht | **nirgends geführt** |

Die letzten beiden sind nicht „offen" — sie stehen in **keiner** offenen
Liste. Das ist die einzige Form von Drift, die beim Abschalten des Werkzeugs
unbemerkt bleibt, weil niemand einen Posten trägt, den es nicht gibt.

### G. Die Werte der Vision sind Prosa, nicht Mechanik

Die Vision formuliert drei Werte (Roh-Export, „7. Shinon braucht Werte, nicht
nur Regeln"):

- `No evidence → no WRITE`
- `Contradiction → preserve conflict`
- `Governance failure → DENY`

Im Code stehen sie als Prompttext in der Persona
(`packages/persona/index.js:162` IDENTITY, `:205` EPISTEMIC) — an der richtigen
Stelle, aber **ohne Vollzugsstelle**. Es gibt keinen Ort, an dem fehlende
Evidenz eine Schreibaktion verhindert. Das Scoring-Ledger speichert Urteile; es
verweigert nichts. Der einzige Verweigerer ist der Hook — und der nach
Konfiguration.

**Das ist der Kern der Divergenz in einem Satz:** Die Vision war eine Ethik
*mit* Mechanik; der Baum hat die Ethik (als Text) und eine Mechanik (als
Formprüfung) — aber nicht die Ethik *in* der Mechanik.

### H. Zwei Pakete ohne Wirkung

`packages/token-usage/index.js:15` und `packages/better-errors/index.js:8` —
beide `apply()` **loggen nur** und tun sonst nichts. Der `FOUNDATION-PLAN`
wollte L0 Telemetrie, die `token-usage` *echt* macht („Panel = View über
Telemetrie"). Das ist nie geschehen; das Paket war vom ersten Commit an so
(`ffbf721`).

---

## 4. Die Gegenrichtung — was der Code besser gemacht hat

Diese Bilanz gehört in dieselbe Rechnung, sonst wird der Befund einseitig:

1. **Die Form wurde verschärft, nicht übernommen.** Die 7-Punkt-Verträge
   prüfen nicht nur sich selbst, sondern erzwingen fail-closed-Verhalten im
   Code: ein Vertragsverstoß führt zu `reject`, nicht zu `console.warn`.
2. **Die Provenienz ist strenger als die Vision.** Fünf Klassen, Zeigerpflicht,
   „keine Beförderung" — das DOKI-Prinzip als ausführbarer Vertrag.
3. **Die Anti-Frankenstein-Entscheidung war richtig.** „Nicht die Contracts neu
   bauen — die existieren. Sondern die Komponenten in DSH-Bundles gießen"
   (`git show 0630350:docs/REPO-ANALYSIS.md`) hat den Anschluss an das Harness
   erhalten, statt eine zweite Runtime zu bauen.
4. **Ein Index statt vieler** hat die doppelte Wahrheit im Projekt-Teil
   aufgelöst (Beleg: `docs/probes/index-konsolidierung.json`).
5. **Die Skalierbarkeit ist gemessen**, nicht behauptet (`npm run scale:check`).

---

## 5. Die eine fehlende Probe

Die Vision liefert das Maß selbst: **„der erste echte Beweis ist nicht *alles
bauen*, sondern einen Handoff real zum Laufen bringen."** Bei den
Schwesterrepos waren es 0 Claims über die Grenze, 0 Runs, 0 verified Claims.

Im heutigen Baum ist die entsprechende Probe **eine**:

> **Ein Behauptungs-Objekt, das eine Paketgrenze überquert und in ein Urteil
> mit Beleg mündet — und dessen Status sich von `unverified` auf `supported`
> hebt, ohne dass ein Mensch ihn bestätigt.**

Bisher belegt Shinon Aussagen **über sich** (Prompt, Zustand, Fähigkeiten);
Aussagen **für sich** — eine Behauptung, geprüft, begründet, entschieden — hat
es nicht.

Der Plan im Baum, der genau das liefert, ist [`WISSENS-RUNTIME-PLAN.md`](WISSENS-RUNTIME-PLAN.md)
— allerdings **geplant, nicht gebaut**, und in anderer Sprache: `kind ∈
FACT/DERIVED/DECISION/PROPOSAL/CONFLICT`, `status ∈
DISCOVERED/EXTRACTED/VALIDATING/VALID/STALE/DISPUTED/SUPERSEDED/REJECTED`
(Plan §2, Zug 1). Was ihm noch fehlt, ist das, was §3 A hier als L2
beschreibt: ein Organ, das ein Urteil **erzwingt** — ein `CONFLICT` wird dort
sichtbar, aber nichts wird verweigert.

---

## 6. Was dieses Dokument nicht behauptet

- **Ob die Absicht eine war.** Die Entscheidung gegen eine eigene Registry
  (`FOUNDATION-PLAN`), der Vertragssatz „Die Persona handelt nicht … keine
  Entscheidung" (`docs/contracts/persona.json`) und die Einstufung von L2 als
  späteres Werk — das kann bewusste Entmachtung sein (die Figur wird
  Werkzeug) oder Verdrängung. Die Dokumente belegen die Entscheidung, nicht
  ihre Bewertung.
- **Wie der Stand außerhalb dieses Repos ist.** `Shinon_Agent/interface-specs`,
  `karma`, `Falsify_Me` und `DOKI` wurden hier **nicht** gelesen — nur ihre
  Beschreibung in `git show 0630350:docs/REPO-ANALYSIS.md` (Stand 2026-10-07).
  Lebt dort inzwischen Urteilslogik, ist die Divergenz eine des Anschlusses,
  nicht des Bestands.
- **Dass „mehr Code" die Lösung wäre.** Dieser Befund sagt, welche Organe
  fehlen. Er sagt nicht, wie viele Dateien sie brauchen — dafür ist die
  Struktur- und Bestandsregel zuständig (`docs/contracts/structure.json`).

---

## 7. Was daraus folgt

Die offenen Punkte stehen in [`ROADMAP.md`](ROADMAP.md) §2.2. In einem Satz:
die Form ist präziser als die Vision, der Inhalt ist eine Ebene zu dünn — und
die fehlende Ebene ist nicht ein weiterer Baustein, sondern ein Organ, das
Aussagen prüft, Fähigkeiten als aktiv meldet und der Figur ein Handlungsrecht
gibt.

---

## 8. Anhang — die Messbefehle

Jede Abwesenheitsaussage in diesem Dokument ist mit einem Befehl nachprüfbar
(Stand 2026-10-20, Repo-Root):

```sh
# A — Urteilsvokabular im Laufzeitcode (ohne Testdateien)
grep -rniE 'DENY|Falsification|KARMA|LIMEN' --include=*.js --include=*.mjs packages/ scripts/ | grep -v '/test/'

# B — Registry: welche Aktivitäts-API gibt es?
grep -rniE 'activate|deactivate|health' --include=*.js packages/ | grep -iE 'plugin|registry'

# C — Vertrag der Persona: darf sie handeln?
node -e "const j=require('./docs/contracts/persona.json');j.rules.forEach(r=>console.log(r.forbidden))"

# D — Narrative → Persona-Zustand
grep -n 'authority' packages/narrative/index.js packages/persona/index.js

# E — Wer steuert die Blockauswahl?
grep -n 'stance' packages/prompter/assets/pre-step.js packages/scoring/index.js

# F — die sieben Vertragspunkte
grep -l 'invariant' docs/contracts/*.json | wc -l

# G — DoD-Kästchen gegen den Baum
grep -nE 'Code-Graph|Capability Router|Browser Vision' shinon-forge-implementierungsplan.md
ls packages | grep -i vision
```
