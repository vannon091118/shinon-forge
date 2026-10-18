# Archiv — der eine Ort für abgeschlossene Stände

> **Status:** current — Verzeichnis und Umleitungstabelle des Archivs. **Stand:** 2026-10-17
> **Einstieg:** `docs/INDEX.md` · **Zahlen:** `docs/ZAHLEN.md`

## 1. Regel

Dieses Verzeichnis ist der **einzige** Ort für Dokumente, die nicht mehr aktiv
sind: abgeschlossene Audits, überholte Pläne, beendete Übergaben, importierter
Fremdtext. Nichts hier ist eine Quelle für den heutigen Baum, für aktuelle
Zahlen oder für offene Arbeit — auch dann nicht, wenn der ursprüngliche
Statusblock etwas anderes behauptet. Der Statusblock bleibt als Messzeitpunkt
stehen; der Archiv-Banner darüber sagt, wie er zu lesen ist.

Was **nicht** hierher gehört:

- aktive Anleitungen (`docs/ARCHITECTURE.md`, `docs/CI.md`,
  `docs/COMMIT-REGELN.md`, `docs/ROADMAP.md`, `docs/ZAHLEN.md`, `docs/INDEX.md`),
- Belege mit eigenem Datenfeld (`docs/contracts/`, `docs/probes/`) — sie werden
  neu gemessen, nicht umgeschrieben,
- `IDEA.md` im Repo-Root (aktive Kurzidee) — `PLAN.md` ist seit 2026-10-18 eingezogen (offen: `docs/ROADMAP.md`, erledigt: `docs/CHANGELOG.md).

Neue Nachweise entstehen weiter unter `docs/audit/` bzw. `docs/handshakes/`;
sobald ein Nachweis abgeschlossen ist, wandert er hierher. Ein Nachweis wird
dabei **nicht** inhaltlich umgeschrieben, nur verschoben und als `historical`
markiert.

## 2. Umleitung (alter Pfad → heutiger Pfad)

Die Tabelle existiert, weil eingefrorene Belege (`docs/probes/*.json`) und
ältere Commit-Nachrichten weiter die alten Pfade nennen. Sie werden nicht
umgeschrieben — hier steht, wo die Datei heute liegt.

| Alter Pfad | Heutiger Pfad |
|---|---|
| `docs/PLAN.md` | [`archive/PLAN-2026-10-07.md`](PLAN-2026-10-07.md) |
| `docs/FOUNDATION-PLAN.md` | [`archive/FOUNDATION-PLAN.md`](FOUNDATION-PLAN.md) |
| `docs/REPO-ANALYSIS.md` | [`archive/REPO-ANALYSIS.md`](REPO-ANALYSIS.md) |
| `docs/SYSTEM-ANALYSIS.md` | [`archive/SYSTEM-ANALYSIS.md`](SYSTEM-ANALYSIS.md) |
| `docs/audit/ARCHITECTURE_MAP.md` | [`archive/ARCHITECTURE_MAP.md`](ARCHITECTURE_MAP.md) |
| `docs/audit/AUDIT_2026-10-13.md` | [`archive/AUDIT_2026-10-13.md`](AUDIT_2026-10-13.md) |
| `docs/audit/A4_DSH_FASSUNG_2026-10-17.md` | [`archive/A4_DSH_FASSUNG_2026-10-17.md`](A4_DSH_FASSUNG_2026-10-17.md) |
| `docs/audit/CHANGELOG.md` | [`archive/CHANGELOG.md`](CHANGELOG.md) |
| `docs/audit/DEPENDENCY_FINDINGS.md` | [`archive/DEPENDENCY_FINDINGS.md`](DEPENDENCY_FINDINGS.md) |
| `docs/audit/DSH_SUBSET_3-1.md` | [`archive/DSH_SUBSET_3-1.md`](DSH_SUBSET_3-1.md) |
| `docs/audit/EINSTIEG_3-4.md` | [`archive/EINSTIEG_3-4.md`](EINSTIEG_3-4.md) |
| `docs/audit/PAKETQUELLE_NPM_3-5.md` | [`archive/PAKETQUELLE_NPM_3-5.md`](PAKETQUELLE_NPM_3-5.md) |
| `docs/audit/PLUGIN_IDIOME_2-1.md` | [`archive/PLUGIN_IDIOME_2-1.md`](PLUGIN_IDIOME_2-1.md) |
| `docs/audit/REPAIR_PLAN.md` | [`archive/REPAIR_PLAN.md`](REPAIR_PLAN.md) |
| `docs/audit/REPOSITORY_INVENTORY.md` | [`archive/REPOSITORY_INVENTORY.md`](REPOSITORY_INVENTORY.md) |
| `docs/audit/SHINON_MIGRATION_MAP.md` | [`archive/SHINON_MIGRATION_MAP.md`](SHINON_MIGRATION_MAP.md) |
| `docs/audit/SKALIERUNG_2026-10-11.md` | [`archive/SKALIERUNG_2026-10-11.md`](SKALIERUNG_2026-10-11.md) |
| `docs/audit/SPIKE_3-3.md` | [`archive/SPIKE_3-3.md`](SPIKE_3-3.md) |
| `docs/audit/STAND_2026-10-10.md` | [`archive/STAND_2026-10-10.md`](STAND_2026-10-10.md) |
| `docs/audit/UMBAU_2026-10-11.md` | [`archive/UMBAU_2026-10-11.md`](UMBAU_2026-10-11.md) |
| `docs/audit/UPSTREAM_DIFF.md` | [`archive/UPSTREAM_DIFF.md`](UPSTREAM_DIFF.md) |
| `docs/audit/VERIFICATION_MATRIX.md` | [`archive/VERIFICATION_MATRIX.md`](VERIFICATION_MATRIX.md) |
| `docs/audit/WORKTREE_REVIEW.md` | [`archive/WORKTREE_REVIEW.md`](WORKTREE_REVIEW.md) |
| `docs/handshakes/2026-10-12-prompter-context-skill-fixes.md` | [`archive/2026-10-12-prompter-context-skill-fixes.md`](2026-10-12-prompter-context-skill-fixes.md) |
| `docs/handshakes/2026-10-12-typescript-gate.md` | [`archive/2026-10-12-typescript-gate.md`](2026-10-12-typescript-gate.md) |
| `docs/handshakes/2026-10-13-ci-gruen-prompter-vertrag-und-bereichsregel.md` | [`archive/2026-10-13-ci-gruen-prompter-vertrag-und-bereichsregel.md`](2026-10-13-ci-gruen-prompter-vertrag-und-bereichsregel.md) |
| `docs/handshakes/2026-10-13-ci-lauf-gruen-verdict-schranke-und-sieben-luecken.md` | [`archive/2026-10-13-ci-lauf-gruen-verdict-schranke-und-sieben-luecken.md`](2026-10-13-ci-lauf-gruen-verdict-schranke-und-sieben-luecken.md) |
| `docs/handshakes/2026-10-13-project-index-scan-und-ci-schranke.md` | [`archive/2026-10-13-project-index-scan-und-ci-schranke.md`](2026-10-13-project-index-scan-und-ci-schranke.md) |
| `docs/legacy-goose-prompts/` | [`archive/legacy-goose-prompts/`](legacy-goose-prompts/) |
| `prompts/README.md` | [`archive/prompts-README.md`](prompts-README.md) |
| `PLAN.md` | offen in [`../ROADMAP.md`](../ROADMAP.md), erledigt in [`../CHANGELOG.md`](../CHANGELOG.md) |
| `docs/STARTER-PLAN.md` | Stufe 1 in [`../CHANGELOG.md`](../CHANGELOG.md), Stufen 2–4 in [`../ROADMAP.md`](../ROADMAP.md) §2.3 |
| `docs/MOBILE-PLAN.md` | komprimiert in [`../ROADMAP.md`](../ROADMAP.md) §2.2 |
| `docs/SCORING-KONZEPT.md` | gebaut in [`../CHANGELOG.md`](../CHANGELOG.md), Rest (K7b, K8) in [`../ROADMAP.md`](../ROADMAP.md) §2.2 |
| `.session-eval/` | [`archive/session-eval-2026-10-17/`](session-eval-2026-10-17/) (K5-Planung, Aufgabe erledigt; Offenpunkte in [`../ROADMAP.md`](../ROADMAP.md) §2.2) |

## 3. Schon vorher hier

| Datei | Herkunft |
|---|---|
| [`IDEA-raw-export.md`](IDEA-raw-export.md) | Roh-Export der Kurzidee, unverändert; der aktive Text ist `IDEA.md` im Root |
| [`legacy-profiles/`](legacy-profiles/) | archivierte Profil-Altdateien (`profiles/web`) — kein Markdown, deshalb ohne Statusblock |

## 4. Was aus dem Archiv **nicht** verschwindet

Ein Befund bleibt auffindbar, auch wenn er überholt ist: die Umleitungstabelle
nennt jeden verschobenen Pfad, und `git log --follow` zeigt die Historie. Wer
eine alte Messung zitiert, nennt den Archivpfad und den Messzeitpunkt — nicht
den heutigen Baum.
