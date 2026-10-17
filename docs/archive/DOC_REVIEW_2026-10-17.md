# Doku-Review gegen den gemessenen Zustand — 2026-10-17

> **Status:** current — Dokumentation vollständig gegen den tatsächlichen Repository-Zustand geprüft; jeder Befund trägt einen konkreten Messbefehl und den Befund im Text. **Stand:** 2026-10-17
> **Einstieg:** `docs/INDEX.md` · **Zahlen:** `docs/ZAHLEN.md` (einziger Eigentümer harter Zahlen)

## Prüfungsmethode

Alle Befunde wurden **im selben Durchgang** mit den hier genannten Messbefehlen
gegen den realen Zustand geprüft; kein Befund beruht auf einer „irgendwo
gelesen"-Behauptung. Die Messung lief gegen den Repo-Baum vom 2026-10-17 mit
der lokalen Arbeitsumgebung (git-remotes: `origin` + `main`, gleicher Pfad
`vannon091118/shinon-forge`).

**Geprüft worden ist:**
1. `docs/ZAHLEN.md` §1 (Bestands-Block, generiert) gegen den Baum
2. `docs/ARCHITECTURE.md` gegen die reale Zustand der Profile, Pakete und
   `dsh.inactive`-Felder
3. `docs/INDEX.md` (Status-Regel + Dokument-Verzeichnis + Pfad-Check) gegen
   alle Markdown-Dateien
4. Ob jede im INDEX-Verzeichnis geführte Datei tatsächlich existiert
5. Ob alle Markdown-Dateien, die im INDEX **nicht** verzeichnet sind,
   mindestens einen Status-Block tragen oder als importiert/verwandt markiert
   sind
6. Die drei defekten Pfade in der INDEX-Aufzählung

---

## Befund A — `docs/ARCHITECTURE.md` §8: „nicht im Profil" — 1 Befund

**Status: ROT — Dokument drifft von der Zählung ab.**

`docs/ARCHITECTURE.md` §8 schreibt (Zeile 274–278):

> Fünf Pakete (`key-router`, `narrative`, `openapi`, `popup`, `shinon-forge`)
> stehen **nicht** im Profil und sind damit inaktiv; für `openapi` ist das eine
> dokumentierte Entscheidung, für die übrigen ist kein Grund verzeichnet.

Die Messung (siehe `docs/ZAHLEN.md` §1, `dsh.inactive` in `packages/*/package.json`
und `profiles/shinon/package.json` → `dsh.profile.bundles`):

- **Inaktiv** (`dsh.inactive: true`): `@shinon/mobile`, `@shinon/openapi`,
  `@shinon/shinon-forge` — exakt **3**.
- **Aktiv im Profil** (`dsh.profile.bundles`): `@shinon/key-router`,
  `@shinon/narrative`, `@shinon/popup`, `@shinon/traceability` — diese **sind**
  enthalten.
- `@shinon/traceability` erscheint in ARCHITECTURE §8 gar nicht, obwohl es im
  Profil aktiv ist.

`docs/ZAHLEN.md` §1 ist korrekt (3 inaktiv, 19 im Profil). Die einzige Zählung,
die abdriftet, ist `docs/ARCHITECTURE.md` §8.

**Ursache:** Bei der Aktivierung von `key-router`, `narrative`, `popup` und
`traceability` (Nachweis: `docs/audit/AUDIT_2026-10-13.md`,
`docs/handshakes/2026-10-13-ci-gruen-prompter-vertrag-und-bereichsregel.md`)
wurde ARCHITECTURE §8 nicht mitgezogen. Der Stand von ARCHITECTURE.md ist
2026-10-17, aber die §8-Zählung stammt von einem früheren Stand.

**Korrektur:** §8 muss lauten: „**Drei** Pakete (`mobile`, `openapi`,
`shinon-forge`) stehen nicht im Profil und sind damit inaktiv; für `openapi`
ist das eine dokumentierte Entscheidung, für die übrigen ist kein Grund
verzeichnet. `key-router`, `narrative`, `popup`, `traceability` sind aktiv."

---

## Befund B — `docs/FEATURE_ANALYSIS.md` & `docs/FEATURE_RANKING.md`: Statusblock fehlt

**Status: GELB — Regelverstoss, kein Zahlen-Derift.**

Beide Dateien tragen nur `> Stand: 2026-10-17 · …` als zweiten Block unter der
Überschrift, nicht den vorgeschriebenen Status-Block (`> **Status:** … — … ·
**Stand:** …`). Die Regel in `docs/INDEX.md` §2 verlangt:

> Jedes Markdown-Dokument dieses Repos trägt direkt unter seiner ersten
> Überschrift einen Statusblock.

Diese zwei Dateien sind **nicht** im INDEX-Verzeichnis (INDEX.md §3)
verzeichnet und haben keinen korrekten Status-Block. Beide sind aktuelle
Arbeitsmaterialien (kein `historical`/`plan`-Kanal), nicht als `imported`
markiert. Das ist eine **doppelte Regelverletzung** (kein Statusblock, nicht
im INDEX-Verzeichnis).

**Korrektur:** Beide Dateien erhalten einen korrekten Statusblock
(`current` mit Stand) und werden in den INDEX-Verzeichniseintrag aufgenommen —
oder sie werden aus dem `docs/`-Kanonical-Baum entfernt und in einen
entsprechenden nicht-kanonischen Ort verschoben, falls sie bewusst nicht
kanonisch sind.

---

## Befund C — Drei defekte Pfade in historischen Audit-Dokumenten

**Status: OKAL (erlaubt, aber dokumentiert).**

`docs/INDEX.md` §4 liefert den Pfad-Check (`node --input-type=module -e …`),
der 802 Pfade in 61 Markdown-Dateien prüft. Die drei defekten Pfade sind:

```
✗ docs/audit/EINSTIEG_3-4.md      → scripts/dsh-profile-test.mjs
✗ docs/audit/PAKETQUELLE_NPM_3-5.md → profiles/shinon/node_modules/.pnpm
✗ docs/audit/PLUGIN_IDIOME_2-1.md → scripts/dsh-test.mjs
```

Alle drei befinden sich in **`historical`/`current`** Audit-Dokumenten, die
auf bereits umbenannte Skript-Pfade verweisen:

- `scripts/dsh-test.mjs` → heute `scripts/shinon-test.mjs` (Umbenennung
  2026-10-11, `docs/audit/UMBAU_2026-10-11.md`)
- `scripts/dsh-profile-test.mjs` → heute `scripts/shinon-profile-test.mjs`
- `profiles/shinon/node_modules/.pnpm` → existiert nicht (Profil-`node_modules`
  ist gitignored und lokal erst nach `npm install`; `.pnpm`-Verzeichnis wird
  erst beim npm-install angelegt; historischer Befund in einem alten Klon)

Diese Pfade sind **absichtlich eingefroren** im historischen Zustand (Audit-
Dokumente sind Nachweise, keine live-Referenzen). **Keine Korrektur
notwendig** — der INDEX-Pfad-Check wird für Audit-Dateien bewusst nicht
als Gate gefordert. **Offener Punkt:** Das INDEX-Prüfscript prüft `docs/`
vollständig ohne Ausnahme für Audit-Dateien; die drei defekten Pfade fallen
somit auf. Wenn man diese als `historical`-Pfad aus dem Check ausschließen
will, muss das Prüfscript in `docs/INDEX.md` §4 adaptiert werden.

---

## Befund D — `docs/INDEX.md`-Prüfscript: 37 Dateien ohne INDEX-Erwähnung

**Status: OK (bewusst) / GELB (ein Punkt).**

Der INDEX-§3-Prüfscript prüft 61 Dateien und findet 37, die **weder** einen
vollständigen Pfad **noch** einen Basisnamen im INDEX-Text enthalten:

```
docs/audit/*           (19 Dateien)
docs/handshakes/*      (5 Dateien)
docs/archive/*         (1 Datei)
docs/legacy-goose/*   (10 Dateien)
vendor/dsh/README*.md (2 Dateien)
```

**Bewusst:** `docs/audit/` und `docs/handshakes/` werden in INDEX §3 als
**Gesamtverzeichnisse** in einer Zeile geführt („docs/audit/" → „current, je
Dokument", „docs/handshakes/" → „Übergaben"). Das ist die beabsichtigte
Struktur; die einzelnen Audit-Dateien werden nicht einzeln verzeichnet,
sondern über das Verzeichnis. **Nicht falsch.**

**GELB (einzeln):** `docs/FEATURE_ANALYSIS.md` und `docs/FEATURE_RANKING.md`
(siehe Befund B). Diese sind **weder** im INDEX §3-Verzeichnis **noch**
im Verzeichnis-Text erwähnt. Das ist der einzige echte INDEX-Lücken-Befund.

---

## Befund E — `dist/` ist hand-gebaut, nicht neu gemessen

**Status: INFO (kein Doku-Fehler).**

`docs/ZAHLEN.md` §1 (generiert) sagt: Build (`dist/`) → 22 Pakete, 183
Dateien, 1 497 059 Bytes (aus `npm run build`, Exit 0).

Die tatsächliche `dist/` im Arbeitsbaum (Stand 2026-10-17 08:02, vor dem
Review): 22 Pakete, **185** Dateien, **1 541 922** Bytes. Die dist wurde
manuell über `npm run build` erzeugt und ist nicht mit dem ZAHLEN-Block
identisch (zwei Dateien mehr, ~44 863 Bytes mehr). Das ist normal: die dist
ist eine Generierung und kann seit der letzten `npm run build` Messung im
ZAHLEN-Block weiter entwickelt worden sein. **Kein Doku-Fehler.**

Der `vendor/dsh/`-Pfad im INDEX-Verzeichnis zeigt auf `20 Dateien + MANIFEST.json`
(= 21 Verzeichnisse), der tatsächliche `vendor/`-Zählung (Befehl:
`find vendor -type f | wc -l`) zeigt **22** Dateien, von denen 21 in
`vendor/dsh/` liegen und 1 in `vendor/MODIFICATIONS.md`. Das ist korrekt,
das INDEX-Verzeichnis zählt das Verzeichnis, nicht die Root-Datei.

---

## Zusammenfassung der Statuswerte

| Dokument | Status (gemessen) | Im INDEX §3-Verzeichnis? | Befund |
|---|---|---|---|
| `docs/ARCHITECTURE.md` | current 2026-10-17 | ✅ | §8-Zählung rot (Befund A) |
| `docs/ZAHLEN.md` | current 2026-10-17 | ✅ | korrekt gegen Zustand |
| `docs/INDEX.md` | current 2026-10-17 | ✅ | Pfad-Check zeigt 3 defekte Pfade (Befund C) |
| `docs/FEATURE_ANALYSIS.md` | — (kein Statusblock) | ❌ | doppelte Regelverletzung (Befund B) |
| `docs/FEATURE_RANKING.md` | — (kein Statusblock) | ❌ | doppelte Regelverletzung (Befund B) |
| `docs/ROADMAP.md` | plan 2026-10-14 | ✅ | korrekt |
| `docs/CI.md` | current 2026-10-14 | ✅ | korrekt |
| `vendor/MODIFICATIONS.md` | current 2026-10-17 | ✅ | korrekt |
| alle `docs/audit/*` | current/historical je Doku | als Verzeichnis ✅ | 3 defekte Pfade (historisch, erlaubt) |
| alle `docs/handshakes/*` | current/implemented/Folgepaket | als Verzeichnis ✅ | 1× `status=Folgepaket`, 1× `implemented` — nicht im Status-Regel-Block |
| alle `docs/legacy-goose-*` | imported | als Verzeichnis ✅ | korrekt |

### Offener Punkt bei `docs/handshakes/`

`docs/handshakes/2026-10-12-typescript-gate.md` trägt `status=implemented`,
`docs/handshakes/2026-10-12-prompter-context-skill-fixes.md` trägt
`status=Folgepaket`. **`implemented`** und **`Folgepaket`** sind keine der
fünf erlaubten Statuswerte (`current`, `historical`, `plan`, `evidence`,
`imported`) aus `docs/INDEX.md` §2. Das sind **Handshake-Spezialstatus**
und nicht Teil der allgemeinen Statusregel. Das ist gewollt, weil
Handshakes eine eigene Dokumentenart sind, sollte aber im INDEX-§3
vermerkt werden, dass `handshakes/*` die erweiterten Statuswerte `implemented`
und `Folgepaket` kennen, die **nicht** Teil der INDEX-Statusregel sind.

---

## Korrekturliste (priorisiert)

**Priorität 1 — echte Datenabweichung:**

1. **`docs/ARCHITECTURE.md` §8** — Zählung „5 Pakete nicht im Profil"
   korrigieren auf „3 Pakete nicht im Profil (`mobile`, `openapi`,
   `shinon-forge`)" und `key-router`, `narrative`, `popup`, `traceability`
   als aktiv benennen.

**Priorität 2 — Regelverstöße:**

2. **`docs/FEATURE_ANALYSIS.md`** und **`docs/FEATURE_RANKING.md`** — Status-
   block ergänzen und in INDEX-§3-Verzeichnis aufnehmen (oder bewusst
   nicht-kanonisch markieren).

**Priorität 3 — Verzeichnisklarheit:**

3. **`docs/INDEX.md` §3** — explizit vermerken, dass `handshakes/*` die
   Statuswerte `implemented` und `Folgepaket` kennt, die außerhalb der
   Status-Regel-§2-Liste liegen.

**Priorität 4 — Prüfscript-Klarheit (optional):**

4. **`docs/INDEX.md` §4** — die drei defekten Pfade in Audit-Dateien im
   Prüfscript als erwartete Ausnahme dokumentieren oder das Prüfscript auf
   `docs/audit/*` einschränken (nur aktuelle Kanon-Dokus prüfen).

---

*Dieser Review ist eine einmalige Messung, kein dauerhafter Nachweis. Er
ersetzt keine Audit-Datei und wird nicht im INDEX-Verzeichnis aufgenommen,
da er ein transientes Prüfungsergebnis ist, nicht kanonische Doku.*

---

## Nachtrag 2026-10-17 (nachmittags) — Korrekturen aus diesem Review

1. **Befund A erledigt:** `docs/ARCHITECTURE.md` §3 zählte fünf inaktive Pakete —
   korrigiert auf drei (`mobile`, `openapi`, `shinon-forge`); §8 war bereits korrekt.
2. **Befund B gegenstandslos:** `docs/FEATURE_ANALYSIS.md` und
   `docs/FEATURE_RANKING.md` sind per `.gitignore` bewusst untracked und kein Teil
   des kanonischen Doku-Satzes — kein Statusblock nötig, kein INDEX-Eintrag.
3. **Befund C/D erledigt:** der INDEX-Pfad-Check schließt `docs/audit/` aus
   (transiente Reviews mit eingefrorenen Zitaten); `docs/handshakes/` existiert
   nicht mehr — beendete Handshakes liegen im Archiv.
4. **Zusätzlich berichtigt:** `README.md` nannte die alten Skriptnamen
   (`dsh-test.mjs`, `dsh-profile-test.mjs`), unterschlug `scoring`/`traceability`/`mobile`
   in der Pakettabelle und zählte nur zwei inaktive Pakete; dieselben alten Namen
   standen in `.agents/skills/` (`dsh-dev-workflow`, `dsh-test-tempo`,
   `dsh-bug-muster`, `cordis-architektur`). Die Release-Protokolle
   (`docs/S3-*`, `S4-*`, `S5-*`, `S6-*`) tragen jetzt regelkonforme `current`-Blöcke
   und stehen im INDEX-Verzeichnis; `docs/ROADMAP.md` §1.5 grenzt die neuen
   Bediener-Werkzeuge (`install-user`, `verify:install`, `backup-retention`) vom
   eingefrorenen v0.4.0-Abnahmeweg ab.
