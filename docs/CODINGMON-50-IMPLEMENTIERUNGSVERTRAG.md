# CodingMon 50 · Zucht · Progression · visuelle Gamification

> **Status:** plan — verbindlicher Implementierungsvertrag; Produktionscode ist noch nicht integriert. **Stand:** 2026-10-18
> **Einstieg:** docs/INDEX.md · **Zahlen:** docs/ZAHLEN.md

## 1. Ziel, Autorität und Status

Dieser Vertrag konsolidiert die Fachentscheidungen D1–D47 aus dem CodingMon-Ergänzungsplan und ergänzt sie nur dort, wo die 50-Arten-Daten oder die reale Shinon-Architektur einen präziseren Vertrag benötigen. D48 legt die verzweigte Nachkommenauswahl fest; D49 definiert den Reward-Wechsel beim Wechsel von der exponentiellen auf die gedeckelte lineare Stat-Kurve.

Autoritätsreihenfolge bei Konflikten:

1. AGENTS.md, docs/ARCHITECTURE.md, docs/ZAHLEN.md, aktuelle Tests, Manifest-/Patch-Verträge und der tatsächliche Quellbaum.
2. Die vorhandenen CodingMon-Fachentscheidungen D1–D47.
3. Die konsolidierten Ergänzungen D48/D49 sowie das ArtPack-Manifest und codingmon-50.json.
4. Externe Community-Plugins und Agentenempfehlungen sind Musterquellen, niemals eine stärkere Autorität als der gepinnte DSH-Vertrag.

Dieser Dokumentations-Commit ist ausdrücklich keine Produktimplementierung. Der Status der Definition of Done bleibt BLOCKED, bis der unten definierte Test- und Integrationsnachweis am Feature-Branch vorliegt. Kein Testresultat aus einem hochgeladenen ZIP oder einem unveränderten Main-Commit ist ein Nachweis für die neue Funktion.

## 2. Befund aus dem aktuellen Repo und den gelieferten Assets

| Bereich | Im Quellstand belegt | Konsequenz |
|---|---|---|
| Paketgrenze | packages/codingmon enthält index.js, client.js, cordis.patch.yml, package.json und assets/ | Bestehendes Bundle erweitern. Kein zweites Runtime-Paket und keine neue Storage-Domain. |
| Engine | assets/mechanik.js ist der importfreie, testbare Mechanikkern und exportiert die Regeln für den Host | Reine Funktionen dort halten; keine UI, Timer, DOM-, Zod- oder DSH-Abhängigkeiten hineinziehen. |
| Browser | client.js ist ein selbstständiges ModuleLoader-Bundle mit eingebetteten Daten und generierten Regionen | Keine relativen ESM-Imports vom Client in assets/ oder andere Pakete. Spiegelungen ausschließlich generieren und auf Drift testen. |
| Aktuelle Leiter | Der vorhandene Code verwendet LEVEL_CAP 2000, Faktor 1,35 und powerAt/powerAtExact | Das ist Altverhalten und wird nicht mit dem neuen Level-50-Vertrag vermischt. Alle Aufrufer und E2E-Erwartungen migrieren. |
| Aktueller Datenbestand | Engine und Client enthalten doppelte Tabellen für 10 Arten und 21 Fähigkeiten | Das ist der Integrationspunkt für die kanonische 50-Arten-Quelle, kein Grund, eine weitere handgepflegte Tabelle anzulegen. |
| ArtPack | Das gelieferte codingmon-50.json enthält Species-, Abstammungs-, Ability-, Element-, Buff- und Lootdaten; 50 Creature-SVGs/PNGs sind vorhanden. Die drei enthaltenen Validatoren liefen im gelieferten Asset-Archiv erfolgreich. | Die Daten sind noch nicht dadurch in CodingMon integriert. SVGs und nötige Effekte selektiv übernehmen; Katalogseiten, Kontaktbögen, Motion-Lab-HTML und Vorschau-PNGs gehören nicht in das Laufzeitpaket. |
| Client→Host-Naht | assets/uebergabe.js ist die Quelle für Paket, Service, Namespace, Methode, Endpunkte und SNAPSHOT_FIELDS; der Client spiegelt Literale, die uebergabe.test.mjs vergleicht. | Namen und Reihenfolge nicht eigenmächtig ändern. Vertragsänderungen müssen beide Seiten und den Paritätstest in einem Schritt aktualisieren. |
| Host-Snapshot | assets/snapshot-schema.js enthält die bisherige Snapshot-/StoredSnapshot-Schemafamilie; der aktuelle Host-Snapshot bewahrt keinen Roster, Kreaturnamen oder aktuellen Kreaturen-HP. | Browser- und Host-Migration sind separate Funktionen. Daten, die die alte Host-Fassung nie hatte, dürfen nicht als wiederhergestellt ausgegeben werden. |
| Slot-Nutzung | client.js registriert main, sidebar.panellist, conversation.composer.dock und conversation.chat.turnTail. | Gamification an diesen nachgewiesenen Flächen vervollständigen. Keine neue oder nur vermutete Slot-ID wie shell.overlay voraussetzen. |
| Config | packages/codingmon/index.js deklariert xpPerLevel, roundDelayMs, species, petName und eventsChannel; der Bundle-Patch setzt xpPerLevel, wildLimit und idleAfterMs. | P0: jeden Config-Schlüssel bis zu einem Schema und einem echten Leser verfolgen. Tote oder patch-only Felder entfernen oder mit begründetem ADR vollständig verdrahten. Keine stillen Zusatzfelder. |

### Baseline-Status

Die lokale Prüfung des bereitgestellten Source-Archivs lief mit Node v22.16.0, obwohl das Root-Manifest Node ^22.19.0 oder >=24.0.0 fordert. Dort liefen die reinen CodingMon-Tests, während vier DSH-abhängige Tests mangels installierter Abhängigkeiten sichtbar übersprungen wurden. Das ist ARCHIVE_BASELINE_ONLY, kein Release-Gate-Pass. Für die Feature-Abnahme müssen die übersprungenen Tests in einer unterstützten, mit dem gepinnten DSH installierten Umgebung tatsächlich laufen.

## 3. Verbindliche Architekturentscheidungen

### 3.1 Kein neues Paket und keine geteilte Runtime-Abhängigkeit

Die Umsetzung bleibt in @shinon/codingmon. Das Paket folgt docs/ARCHITECTURE.md: index.js ist Host-/Engine-Einstieg, client.js die UI-/ModuleLoader-Hälfte, cordis.patch.yml die Bundle-Konfiguration und package.json das Manifest. Laufzeithelfer gehören unter assets/; wiederverwendbare Repo-Werkzeuge gehören unter scripts/lib/ bzw. scripts/assets/. Pakete importieren keine Runtime-Implementierungen anderer Shinon-Pakete.

Die DSH-Bundle-/Client-Deklaration, Exports, Patch-ID, package-name, ModuleLoader-ID, Profilaktivierung und erlaubten Ressourcen müssen über die bestehenden Repo-Gates und den Build validiert sein. Keine DSH-Core-Änderung, wenn die vorhandene Bundle-/Slot-/Storage-Naht genügt.

### 3.2 Kanonische Datenquelle und enger Generator

Die einzige fachliche Quelle für Species, statische Abstammung, Ability-Zuordnung, Elementchart, Buffs und Lootdaten ist die gelieferte codingmon-50.json, nach der Integration im CodingMon-Paket. Dynamische Kreaturen-Generation (creature.gen) ist Spielzustand und darf nicht aus der statischen Abstammungstiefe berechnet oder als dieselbe Eigenschaft gespeichert werden.

Ein kleiner Node-Built-in-Generator erweitert scripts/assets/build-sprites.mjs oder liegt als scripts/assets/build-codingmon.mjs vor. Er bekommt --write und --check und:

- validiert eindeutige IDs, alle Referenzen, vollständige 50-SVG-Abdeckung, Ability-Referenzen, geschlossenen zyklusfreien Abstammungsbaum und erwartete Familien;
- generiert markierte Regionen in assets/mechanik.js und client.js aus derselben JSON-Quelle;
- bettet nur die benötigten SVG-/Effekt-/CSS-Ressourcen in das Client-Bundle ein und wandelt relative CSS-URLs offline-tauglich um;
- akzeptiert nur bekannte Zielregionen und Eingabeformate; unbekannte Imports/Exports, fehlende Assets oder Drift sind Fehler, kein Regex-Fallback;
- ist idempotent: ein zweiter --write-Lauf ändert keine Bytes; --check mutiert nichts und liefert bei Drift einen Fehler;
- integriert Generator- und Asset-Prüfungen in vorhandene CodingMon-Tests und Repo-Gates.

Keine neue Runtime-Abhängigkeit, kein allgemeiner ESM-Bundler und keine handgepflegte Kopie der 50 Species/101 Abilities im Client. Die bisherigen zehn Grid-Sprites können als Legacy-/Fallback-Assets bestehen bleiben, bis die neuen SVGs durch Paritätstests alle Aufrufer abdecken. Wenn ein ArtPack pro Creature nur eine Ansicht liefert, wird keine zweite Ansicht erfunden: dieselbe Quelle darf mit klarer UI-Richtung wiederverwendet werden, oder bestehende Vorder-/Rückansichten bleiben erhalten, wo sie existieren.

### 3.3 Cordis-Lifecycle und Slots

Die Host-Seite behält den bestehenden inject-Vertrag für storageDomain und den vorhandenen Pet-Store-/Remote-Aufbau. Jede neue Registrierung, jeder Timer und jede Queue hat einen Besitzer und einen reversiblen Cleanup-Pfad. Auf optionale Dienste wird entsprechend der lokalen Cordis-Regel mit ctx.get zugegriffen; direkter ctx.<service>-Zugriff setzt deklarierte Injektion voraus. Der asynchrone Mount-/Unmount-Pfad muss Handles schließen und Timer/Listener entfernen, bevor verspätete Arbeit noch Zustand ändern kann.

Die UI bleibt in den bereits belegten Slots:
- main: Roster/aktive Kreatur, Statuswerte, Level-/Generation-Fortschritt, Zucht und Abstammungsansicht.
- sidebar.panellist: kompakte Creature-Miniatur und Statusanzeige.
- conversation.composer.dock: Level-/XP-HUD, Wildbegegnung, Kampf und Ei-Fortschritt.
- conversation.chat.turnTail: bestätigtes Kampf-/Schlupf-/Meilensteinergebnis.

Additive Beiträge bekommen eindeutige IDs und kollidieren nicht mit Single-/Keyed-Slots. Ein Slot darf nur dann hinzukommen, wenn seine Deklaration und sein Besitzer im gepinnten DSH-Clientkatalog nachgewiesen sind. Slot Stores transportieren nur View-State; dauerhaftes Spiel-State gehört in den bestehenden Zustand/Store.

### 3.4 Keine zweite Persistenzdomäne

Es bleibt die bestehende Storage-Domain und die vorhandene Client→Host-Naht. Die Service-/Wire-Namen aus assets/uebergabe.js bleiben stabil, sofern kein nachgewiesener Grund eine versionierte Vertragsänderung erzwingt. Die Liste der Snapshot-Felder und alle Client-Literale werden durch denselben Paritätstest geprüft.

Alle Client-Schreibvorgänge laufen durch eine einzige serialisierte Write-Queue. Ein älterer asynchroner Write darf keinen neueren Snapshot überschreiben; Fehler dürfen die Queue nicht dauerhaft blockieren und müssen als Fehler sichtbar bleiben. Der Host validiert den kompletten Snapshot vor dem Schreiben; invalides Material darf die durable Ablage nicht verändern. Die Quittung beschreibt den tatsächlich gespeicherten Stand.

## 4. Gameplay-Vertrag

### 4.1 Level 1–50, lineare Stat-Kurve

- Levelgrenze: 1 bis 50; XP bleiben nichtnegative kumulative Ganzzahlen.
- Schwelle für Level L: threshold(L) = 250 × (L − 1) × L / 2.
- levelFor(xp) ist die inverse Schwellenfunktion, ganzzahlig und auf Level 1–50 begrenzt.
- statAt(base, level) = floor(base × (10000 + 1200 × (clamp(level, 1, 50) − 1)) / 10000).
- Level 50 zeigt eine abgeschlossene Decke statt einer erfundenen nächsten Stufe oder eines 0/0-Fortschrittsbalkens.
- Jeder alte Aufrufer von powerAt, powerAtExact, threshold(level+1), levelFor, statsAt, rewardFor, Wild-Level und Anzeigeformatierung wird über die Repo-Suche erfasst. Alte Funktionen erst löschen, wenn kein Call-Site und kein Test mehr darauf angewiesen ist.

D49 legt rewardFor(level) verbindlich auf statAt(20, clamp(floor(level)+1, 1, 50)) fest. Damit ändert sich die Balancierung der Kampfbelohnung gegenüber powerAt(20, level+1); eine vor/nachher Tabelle ist Pflicht. Diese Änderung darf nicht als balanceneutral beschrieben werden.

**Gemessene Balanceänderung (alt: `250 × min(Level, 50)`, neu: D49):**

| Gegner-Level | Alte XP | Neue XP | Änderung |
|---:|---:|---:|---:|
| 1 | 250 | 22 | −91,2 % |
| 2 | 500 | 24 | −95,2 % |
| 3 | 750 | 27 | −96,4 % |
| 5 | 1.250 | 32 | −97,4 % |
| 10 | 2.500 | 44 | −98,2 % |
| 25 | 6.250 | 80 | −98,7 % |
| 49 | 12.250 | 137 | −98,9 % |
| 50 | 12.500 | 137 | −98,9 % |

Die Veränderung ist absichtlich groß und muss im Playtest gegengeprüft werden. Die Client- und Host-Implementierung verwenden nun dieselbe Funktion; die alte Multiplikation darf nicht auf einer Seite zurückbleiben.

### 4.2 ZE, Generation und deterministischer Zufall

Alle ZE-Modifikatoren, Bonus-Caps, Pools, Whitelist, Generationenformel, Glück-Wurf, Kosten, Saat und Effektarten aus D1–D47 bleiben die fachliche Quelle. Die Datenquelle beschreibt statische Abstammung; die Kreatur speichert ihre dynamische Zuchtgeneration separat. Gründer starten mit dem laut Fachplan definierten ZE-Wert, Kinder mit dem dort festgelegten Kinderwert.

Alle Zuchtwürfe nutzen den festgelegten persistierten Seed und einen deterministischen RNG-Strom. Kein Math.random in Zucht, Migration, Simulation oder reproduzierbaren Tests. randInt und weightedPick weisen ungültige Eingaben sofort zurück; leere Pools, ungültige Gewichte und Summen kleiner/gleich null dürfen keine Endlosschleife oder implizites Shiny erzeugen. Bonus-Effekte werden gegen die Whitelist validiert, bevor sie Persistenz oder Stats erreichen.

### 4.3 D48 – Nachkommenauswahl bei verzweigtem Stammbaum

Kinderkandidaten werden als Vereinigungsmenge der eindeutigen direkten Kinder beider Eltern gebildet: children(A) ∪ children(B). Keine Schnittmenge, kein erster Treffer aus Object-Iteration und keine Zufallsauswahl der Art.

- Genau ein Kandidat: automatisch wählen.
- Mehrere Kandidaten: UI zeigt die gültige Kandidatenliste vor der Paarung; die ausgewählte Species-ID wird ausdrücklich an pair() übergeben.
- pair() berechnet die Kandidaten erneut und lehnt nicht angebotene/ungültige Arten ab; die UI ist keine Vertrauensgrenze.
- Kein direkter Nachkomme beider Eltern: der bestehende deterministische ZE-/ID-Fallback aus D1–D47 bleibt gültig.
- Die Art, Generation, Eltern, Seed/Ergebnis und Boni des Kindes werden im Ei eingefroren.

### 4.4 Paarung, Ei, Completion und Schlupf

- Vor jeder Mutation sämtliche IDs, Eltern, verschiedene Kreaturen, Kosten, Brauchbar-Teile, ZE, Species-Auswahl, Pool und Bonusmöglichkeiten validieren.
- Paarungskosten sind die fachlich definierte Funktion aus D1–D47 (inklusive clutch); der Bonuswurf verwendet den ZE-Snapshot vor dem Paarungsbonus. Eltern bekommen den definierten Paarungsgewinn erst nach erfolgreichem Erstellen des Eis.
- Ein neu bestätigter Completion-Zählerstand wird in genau einen Reducer geleitet: Delta bestimmen → XP/Spawn → Fortschritt aller offenen Eier → schlupfbereite Eier in stabiler ID-Reihenfolge → Meilensteine → ein Zustandsschreibvorgang. Statuswechsel, Token-Zahlen, Polling-Wiederholungen, Fehler/Abbruch und Reconnect ohne neues Completion-Delta erzeugen keinen Fortschritt.
- Jedes bestätigte Completion erhöht jedes offene Ei nach Fachvertrag einmal. Ab dem definierten Brutpunkt schlüpfen Eier einmalig und deterministisch. Eltern erhalten Schlupfbonus nur für tatsächlich erstellte Kinder.
- Alle IDs sind eindeutig; nextId bleibt größer als jede existierende ID; active verweist auf eine Kreatur; Elternreferenzen existieren; Species-/Ability-/Bonus-IDs sind gültig; HP und Level liegen innerhalb der gültigen Grenzen.

## 5. Getrennte Migrationen und Zustandsgrenzen

Browser-State und Host-Snapshot sind unterschiedliche Verträge. Beide können eigene v3-Versionen haben, ohne dieselbe Schema- oder Migrationsfunktion zu sein.

### Browser-Migration

Die echte alte Browserform wird zuerst aus Quelle und Golden Fixture festgehalten. Vorhandene Namen, XP, Siege/Niederlagen, Runde, Schaden, Treffer, Loot, Completion, Meilensteine, Drops und Wild werden nach den fachlichen Regeln zugeordnet. Neuer Roster/Eierzustand wird deterministisch aufgebaut. Aktuelle HP bewahren, sofern alt und gültig vorhanden, die HP-Quote: round(clamp(oldHP / oldMaxHP, 0, 1) × newMaxHP). Ein ungültiger oldMaxHP-Fall bekommt eine dokumentierte deterministische Wiederherstellung. Kampf, Lock, Timer und Präsentationsqueue sind flüchtig; ein Reload darf keine ewige Sperre oder einen unbestätigten Zug restaurieren. Den bisherigen Browser-Key erhalten, sofern die Baseline ihn bestätigt.

### Host-Migration

Die Host-Migration liest das aktuelle Snapshot-v2-Schema aus assets/snapshot-schema.js. Die bisherige Host-Fassung besitzt keine Kreaturnamen, Roster oder aktuellen Player-HP. Diese Felder werden deshalb nicht vorgetäuscht; ein Host-only Migrationspfad baut einen deterministischen Startkreatur-Namen aus Species-Metadaten, setzt gültige MaxHP und einen leeren Ei-Bestand und bewahrt alle tatsächlich gespeicherten Zähler, XP, Schaden, Loot, Completion und Wild soweit gültig. Wild-Level und HP-Quote werden nach dem dokumentierten Regeln auf die neue Kurve angepasst.

Der Store muss sowohl alte gültige gespeicherte v2-Datensätze als auch den neuen v3-Stand lesen können, migrieren und erst beim nächsten erfolgreichen Write als v3 ablegen. Fehlerhafte Datensätze dürfen nur gemäß der bestehenden Storage-Domain-Policy behandelt werden; vorwärtsmigrierte Daten nie still verlieren. Domain-Version, Snapshot-Version, Browser-Key und Wire-Service-Version sind getrennte Achsen und werden nicht automatisch gemeinsam erhöht.

## 6. Visuelle Gamification und Motion

Die fünf vorhandenen ArtPack-Grundzustände idle, combat, action, hit und victory werden direkt verwendet. Weitere Ereignisse wie encounter, defeat, retreat, level-up, pair, egg-progress, hatch, loot und milestone sind kurzlebige Präsentationszustände/Ereignisse; dafür werden keine 50 Sonderanimationen gebaut.

Eine einzige pure Motion-Entscheidung gibt Zustand und Ziel an. Action erscheint nur nach akzeptierter Aktion, hit nur bei wirklichem HP-Verlust am betroffenen Ziel, Sieg/Niederlage/Rückzug kommen ausschließlich aus dem bestätigten Kampfergebnis. Das Animation-Ende entscheidet niemals über HP, XP, Loot, Completion, Zucht oder Schlupf. CSS unterstützt prefers-reduced-motion; Timer, Queues und listeners werden beim Unmount/Disposal bereinigt.

Die visuelle Oberfläche bleibt einfach:
- Collection/Roster mit Species-Art, aktiver Markierung, Level-/XP-Fortschritt, HP, ZE, Generation und Fähigkeiten.
- Zuchtansicht mit Eltern, Kosten, validierten Nachkommenkandidaten, Bonus-Chips und eingefrorenem Ei.
- Fortschrittselemente für Level 10/25/50, Generation 2/4/7, ZE-Grenzen, Schlupf, Shiny, Freischaltung neuer Arten und Loot.
- Keine zweite Achievement-Datenbank: Freischaltungen werden aus gespeichertem Spielzustand abgeleitet. Benachrichtigungen werden nur beim Überschreiten eines neuen Zustands erzeugt, dedupliziert und auf höchstens drei sichtbare Meldungen begrenzt.
- 360-px-Viewport, Tastatur/Fokus, korrekte disabled-Buttons, Text/Symbol zusätzlich zur Farbe und klare leere-/Fehler-/Ladezustände müssen getestet werden.
- Keine permanent laufenden 50 Sprites und keine externen Asset-URLs. Laufzeitpaket nur mit tatsächlich genutzten SVGs/CSS/JSON und generiertem Client-Embed packen.

### Kampfanimation ohne zweite Engine

Der vorhandene Kampf-/settle-Pfad berechnet und verbucht Schaden einmal. Er liefert zusätzlich unveränderliche Präsentationsdaten in der wirklichen Berechnungsreihenfolge. Die UI spielt diese Beats nacheinander ab, verändert aber keine Spielregel. Wenn der aktuelle Ergebniswert beide HP-Verluste zusammenfasst, die Engine-Rückgabe um reine Presentation-Deskriptoren erweitern; keine zweite Schadensberechnung und kein zweiter Kampfautomat.

## 7. Geordnete Phasen und Progress-Gates

Jeder Gate-Status muss eine konkrete Datei oder CI-Ausführung nennen. Erlaubte Werte: NOT_STARTED, IN_PROGRESS, BLOCKED, VERIFIED. Kein Prozentbalken kann einen fehlenden Nachweis ersetzen.

| Gate | Ergebnis | Sperrbedingung |
|---|---|---|
| G0 Baseline | Aktueller Branch-SHA, sauberer Diff, unterstützte Node-Version, reproduzierbare Main-Gates, echte Config-/Slot-/State-Verträge, Alt/Neu-Reward-Tabelle | Abweichende Node-Version, nicht reproduzierbarer Baselinefehler oder unklare Config-Owner |
| G1 Daten + Generator | Kanonische JSON-/SVG-Quelle, Schema, vollständige Referenzen, --write/--check, idempotenter Build, Client/Host-Parität | Eine zweite manuelle Datentabelle, fehlendes Asset oder Drift |
| G2 Pure Engine | Alle Formeln, Level-50-Decke, Kampfrewards, ZE/RNG/Pool, D48 und D49 mit Golden-/Mutationstests | Nichtdeterministischer RNG, Balancewechsel undokumentiert, alt verwendete Exporte ohne Migrationsentscheidung |
| G3 State + Storage | Browser-/Host-Schemas, separate v2→v3-Fixtures, Querbedingungen, fehlerfreies Lesen/Schreiben, serialisierte Writes | Host v2 wird von v3-Schema abgelehnt, Datenverlust, überholter Write gewinnt |
| G4 Completion + Zucht | Completion-Reducer, Pairing, Ei, Brut, Hatch, Meilensteine und Loot Ende-zu-Ende idempotent | doppelte Polls/Reload/Recon-Reads geben doppelte XP, Kosten oder Kinder |
| G5 Assets + Motion | Alle 50 Arten im gebauten Client, Offline-SVGs, 5 Grundzustände, echte Combat-Beats, reduced-motion und Disposal | Asset-Drift, remote Asset-Abhängigkeit oder Animation verändert Regeln |
| G6 UI + Slots | Alle vorhandenen Slot-Pfade rendern, Roster/Zucht/HUD/TurnTail vollständig; Responsive-/Keyboard-/Disabled-Tests | Unbekannter Slot, Kollisions-/Replacement-Risiko, nicht bedienbare Auswahl |
| G7 Release | Volle Tests, Gates, Build, Pack, echtes DSH-Profil und Browser-Smoke, fertiges Validierungsprotokoll | Fehler, Skip, nicht ausgeführter Pflichtgate oder nicht verifizierter echter Integrationspfad |

### Reihenfolge kleiner Arbeitsaufträge

1. G0 nur lesen/messen; keine Featureänderung. Inventar aller Config-Leser, alter Exporte, Snapshot-Schreibpfade, Slots, Generatorregionen und Tests.
2. Kanonische Daten-/Art-Quelle integrieren und Generator-/Drift-Tests hinzufügen; nur diesen Slice verifizieren.
3. Reine Engine-Formeln und Species-/Ability-/Lineage-Spiegel umstellen; Rewards vergleichen; noch keine Storage-Migration.
4. Snapshot-Schemas, Browser-Migration und Host-Migration mit Golden Fixtures separat implementieren; keine neue Domain.
5. Serialized Write Queue und Completion-Reducer einführen, dann Pair/Hatch. Fehler- und Wiederholpfade vor UI schließen.
6. Asset-Embed und Motion-Presentation integrieren; zuerst Eventfolge-Tests, dann CSS/Ansicht.
7. Roster, Zuchtwahl, HUD und Meilensteine in existierenden Slots vervollständigen; abschließend Simulation und Release-Proben.
8. Jedes Gate mit finalem SHA, Befehl, Exit-Code, Pass/Fail/Skip-Zählung, geänderten Dateien und offenem Risiko dokumentieren. Kein fehlgeschlagener Gate darf durch Skip, Abschwächen oder einen LLM-Kommentar grün erklärt werden.

## 8. Definition of Done

DoD ist nur VERIFIED, wenn alle Bedingungen gleichzeitig erfüllt sind:

- alle G0–G7-Gates nachgewiesen und im Validierungsprotokoll mit dem finalen Branch-SHA verknüpft;
- keine fehlgeschlagenen oder übersprungenen Pflichttests;
- npm run test:codingmon, npm test, npm run test:full, npm run gate:test, npm run gate:full, npm run build sowie die erforderlichen Profil-, Distribution- und Pack-Prüfungen erfolgreich;
- DSH-Profilprüfung über das tatsächlich installierte gepinnte Harness und funktionierendes Boot von profiles/shinon;
- echter Web-/Chromium-Smoke mit 50 Arten, Kampf, XP, Zuchtwahl, Ei-Fortschritt, Hatch, Reload und Disposal;
- Daten-/Sprite-/Config-/Slot-/Wire-Spiegel driften nicht;
- Browser-/Host-Migrationen sind golden-fixture-belegt, Completion und Hatch sind idempotent, Writes überschreiben nie neuere Daten;
- ArtPack ist im gebauten Bundle verfügbar/offline, Animationen respektieren Reduced Motion und können Spielregeln nicht verändern;
- das Abschlussprotokoll nennt alle Änderungen, tatsächlich gelaufenen Befehle/Exit-Codes, Source- und Final-Diff, Assets/Packgröße, Risiken und nicht verifizierte Punkte.

Ein grüner Testlauf auf Main, ein bestandenes Asset-Archiv oder ein grüner Dokumentations-PR genügt ausdrücklich nicht. Bis G7 nachgewiesen ist, lautet der Status BLOCKED / NOT VERIFIED.

## 9. Primärquellen und Arbeitsreferenzen

- Repo-Vertrag: AGENTS.md, docs/ARCHITECTURE.md, docs/ZAHLEN.md, packages/codingmon/index.js, client.js, assets/mechanik.js, assets/snapshot-schema.js, assets/uebergabe.js, assets/pet-store.js, assets/pet-remote.js und packages/codingmon/test/.
- Gelieferte Fachbasis: CodingMon-Ergänzung D1–D47, konsolidierte Entscheidungen D48/D49 und ArtPack codingmon-50.json. Beim Einchecken wird die verwendete Quelle mit Hash im Validierungsprotokoll geführt.
- DSH Cordis Lifecycle: https://deepseek-harness.github.io/deepseek-harness/en/develop/framework/
- DSH Client Slots und Slot-Ownership: https://deepseek-harness.github.io/deepseek-harness/en/reference/subsystems/slots
- DSH Client-Module/Bundle-Wire: https://deepseek-harness.github.io/deepseek-harness/en/reference/subsystems/client-modules
- DSH Storage Domain: https://deepseek-harness.github.io/deepseek-harness/en/reference/subsystems/storage

Kein Community-Plugin wird zur Runtime-Abhängigkeit. dsh-plugin-check darf nur als optionaler read-only Preflight gegen den lokalen DSH-Pin bewertet werden; seine Ausgabe ersetzt kein eigenes Repo-Gate. Ziel-Loops, Team-Koordination, Workspace-Isolation und Approval-Gates sind getrennte Muster und werden nicht als Runtime-System parallel zu DSH eingebaut.
