# Repo-Prüfung: Shinon Forge gegen die DeepSeek Harness API

> **Stand:** 2026-10-22 (gegen `CLEANREPO-AUDIT.md` und DSH-Pin gegengeprüft) · **Zweck:** Bestandsaufnahme und Vorschläge, keine
> Architekturentscheidung und kein Änderungsauftrag. Die Prüfung bezieht sich
> auf den aktuellen Worktree; er enthielt bereits nicht committete Änderungen.
>
> **Zusammenführung:** Die kanonische, sprint- und taskfähige Fassung steht in
> `docs/CLEANREPO-AUDIT.md` §11. Dieser Bericht bleibt als Begründung und
> DSH-Pin-Nachweis bestehen; Screenshot-Befunde und neue Sprint-V-Aufgaben
> werden dort geführt.

## Ergebnis

Shinon Forge baut auf einer brauchbaren Trennlinie auf: DSH stellt Agent,
Cordis-Laufzeit, Sessions, Goals, Skills, Werkzeuge, Storage und UI. Shinon
ergänzt Repo-Kontext, Herkunftsnachweise, fachliche Regeln, Visualisierung und
Produktspezifika. Der größte Leerlauf liegt nicht in einer zweiten Harness-
Implementierung, sondern bei Erweiterungen ohne wirksame Laufzeitfunktion und
bei Prototypen, deren UI/Vertrag noch nicht mit dem echten Turn verbunden ist.

Die höchste Wirkung erzielen zuerst Reparaturen, die heute Daten verlieren
oder versprochenes Verhalten nicht ausführen: Scoring-Gewichte gehen beim
Store verloren, Persona-Selbstmodelle können sich zwischen Workspaces
überschreiben, Block-Lernhistorie kann beim Schreibabbruch verschwinden, und
Codingmon-Boni sind teilweise ohne Produktionswirkung. Diese Befunde sind im
`CLEANREPO-AUDIT.md` mit konkreten Pfaden, Folgen und Abnahmen beschrieben.

Die klarste DSH-Dopplung ist enger umrissen als im ersten Bericht:
`token-usage` portiert DSHs bereits exportierte und in der Chat-UI genutzte
Turn-Usage-Faltung. `better-errors` ist ein lokaler Platzhalter; dass DSH eine
gleichwertige Fehleransicht anbietet, ist hier nicht belegt. Daneben nennt der
Audit mehrere tote Shinon-Pfade und Services ohne Abnehmer. Die zwei neuen
Pakete hatten zuvor keine Capability-Frage; diese Zuordnungen sind inzwischen
additiv ergänzt. Die Paketanzahl ist deshalb kein Impact-Maß. Jede
behaltene Funktion braucht einen Produktionsaufrufer, eine sichtbare oder
fachlich notwendige Wirkung und einen Beleg für diese Wirkung.

## Vergleichsgrundlage und Grenzen

- Installierte Ground Truth: Root pinnt `@deepseek-ai/dsh` auf `0.2.1-rc.2`;
  installiert liegt das CLI-Paket mit Loader-/Dump-Dateien unter
  `node_modules/@deepseek-ai/dsh`, eine zweite Kopie gibt es nicht. Die Laufzeit-
  Pakete liegen in `node_modules/@deepseek-ai/*`; Aussagen zu API-Verfügbarkeit
  wurden daran und an den geladenen Profil-Bundles gegengeprüft.
- Profilwahrheit: `profiles/shinon/package.json` schaltet DSH Base/Web App,
  drei experimentelle DSH-Bundles und Shinon-Pakete zusammen. Es aktiviert
  nicht einfach „alle DSH-APIs“; einzelne DSH-Funktionen liegen als
  injizierbare Services vor.
- Upstream-Dokumentation ist beweglich und kann aktueller als der Pin sein.
  Die aktuelle [DSH API Gateway-Dokumentation](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/api-gateway.md)
  beschreibt inzwischen eine Typert-Remote-Schicht und grenzt Business-Regeln
  ausdrücklich von Transport und Session-Lifecycle ab. Der Vergleich hier
  verwendet Upstream-Doku als Richtungsanzeiger und den installierten Pin als
  Laufzeitmaßstab.
- Der vollständige Funktions-/Strukturabgleich nutzt die **58 nummerierten
  Konflikte** in `docs/CLEANREPO-AUDIT.md` als vorhandene Einzelprüfung. Die
  unabhängige DSH-API-Gegenprüfung prüfte im Pin besonders Token-Meter/Chat und
  Remote-Mount/Assembly. Frühere Konfliktmessungen werden hier als
  Auditbefunde kenntlich gemacht, nicht als in diesem Durchgang neu
  reproduziert. Änderungen im aktuellen Worktree wurden gesondert geprüft.
- Nicht ausgeführt wurden Volltests, Build oder Profilboot. Die Repo-Regel
  `AGENTS.md` erlaubt Volltests nur nach Absprache. Status- und Messangaben
  unten sind daher vorhandene Belege aus `docs/ZAHLEN.md`, `docs/ROADMAP.md`
  und Probes, keine neu erzeugten Abnahmen.

## Befunde: wo Arbeit ins Leere läuft

| Priorität | Fläche | Befund aus dem Baum | Lösungsvorschlag |
|---|---|---|---|
| **P0 – stiller Datenverlust** | Project Index Store, Persona Self-Model, Prompter Learned Store (`CLEANREPO-AUDIT.md` Konflikte #1, #46, #53) | Die Audit-Proben beschreiben drei unabhängige Pfade, auf denen Speichern Erfolg meldet oder Fehler still verschluckt, obwohl Daten fehlen: `blockWeights`/`blockAttributions`, Root-getrennte Self-Models und Block-Lernhistorie. Folgen sind verlorene Lernwirkung oder Workspace-übergreifender Zustand. | Diese drei Store-Pfade vor Extraktionen reparieren. Jeweils echten Store/Dateisystem im Test verwenden: Save→Load muss alle Felder halten; Root A/B müssen isoliert bleiben; Parse-/Abbruchfehler müssen sichtbar sein und die letzte gültige Datei erhalten. |
| **P0 – sichtbare Funktion ohne Wirkung** | Codingmon Zucht-/Loot-Pfad (`CLEANREPO-AUDIT.md` Konflikte #2, #3, #34, #35) | Der Audit belegt, dass `lootLuck` im Produktionswurf nicht ankommt, `childChoice` im Client fehlt und `hatchReady()` einen Stand ohne `hp` erzeugt. Das sind direkt sichtbare falsche Nutzerergebnisse, keine bloße Code-Dopplung. | Vor neuem Encounter-Ausbau Host- und Client-Regel als einen generierten Kern synchronisieren. Abnahme: gleicher Zucht-/Beute-Output auf beiden Seiten und erzeugter Stand besteht `SnapshotSchema.parse`. |
| **P0 – Profilroute im Pin-Katalog verifizieren** | `profiles/shinon/cordis.patch.yml`, `scripts/lib/model-route.mjs` | Der Worktree setzt `agent-default-model` auf `openrouter/google/gemma-4-31b-it:free`. Der dynamische Provider führt absichtlich keine handgepflegte `models:`-Liste. Der Extraktor akzeptiert leere Listen jetzt als dynamische DSH-Kataloge; ein gezielter Test findet die Route im gepinnten pi-ai-Katalog. Ein direkter OpenRouter-GET am 2026-10-22 lieferte HTTP 200 und enthielt die Modell-ID. | Im Gate DSH-Pin gegenprüfen; aktuellen Anbieterkatalog separat per Live-Probe belegen. Der Key-Router-Liveabruf verändert die DSH-Auswahlliste noch nicht. |
| **P0 – tote / konkurrierende Prompter-Mechanik** | `skill-registry-core.js`, `budget-core.js`, `selection.js`, Skill-Ladeweg (`CLEANREPO-AUDIT.md` Konflikte #11–13, #54; §6) | Registry-, Budget- und Selection-Funktionen sind laut Audit ohne Produktionsaufrufer; Skill-Auswahl liest `description`, aber nicht das versprochene `use-when`. DSH hat einen Skill-Katalog, Shinon hat zusätzlich Ledger/Lifecycle und Auswahlregeln. Das aktuelle Risiko ist zwei halbverbundene Wege plus getestete, aber wirkungslose Funktionen. | Shinons Skills nicht durch ein zweites Katalogsystem ersetzen. Einen einzigen Ladeweg über DSH-Katalog oder explizite Prompter-Injektion festlegen; dann nur die benötigten Shinon-Trigger/Lifecycle-Regeln verdrahten. Toten Zwilling und Budget-/Selection-Code entweder in diesen Weg integrieren oder entfernen. Abnahme muss reale Auswahl im Prompt zeigen, nicht nur Unit-Tests. |
| **P1 – Pre-Flight ohne Request-Handoff** | Encounter-Bühne und Deck (`docs/probes/preflight-live.json`, gemessen 2026-10-21) | Die Probe belegt für ihren Messstand: Auswahl blieb im Browser, `includeIds` erreichte den Prompter nicht und vor dem One-Shot gab es kein Preview-Gate. Eine spätere Remote-Naht für Codingmon existiert, aber sie ist keine Encounter-Auswahl-Anbindung. | Fachliche Auswahl → Host-Vertrag → Prompter-Selektion → geänderter Request verbinden. Die Probe aktualisieren und echten Request-Diff plus Turn belegen; bis dahin weitere Deck-Erweiterung stoppen. |
| **P1 – feste DSH Remote-Auswahl** | Codingmon Client Remote / DSH `api-remotes` | Korrektur nach Typ-/Quellprüfung des gepinnten DSH: `@deepseek-ai/dsh-api-gateway/client` bietet bereits `ctx.remote.$mount()`; es fehlt also nicht die Remote-Montage-API. Der Engpass ist die feste/kompilierte Auswahl in `@deepseek-ai/dsh-api-remotes`, die Codingmon nicht enthält. Der lokale `uebergabe`-Test mountet den Beitrag manuell. | Kein eigenes Gateway und kein RPC-Adapter. Die Client-Assembly erweiterbar machen oder die DSH-Auswahlliste unterstützen lassen; bis dahin den begrenzten manuellen Mount als explizite Kompatibilitätsnaht testen. |
| **P1 – Review-/Gate-Regeln erfassen ihre Behauptung nicht** | Kanon, Scoring-Slice, Struktur-Contract (`CLEANREPO-AUDIT.md` Konflikte #6, #48–52, #55–56) | Der Cleanrepo-Audit nennt stille Slice-Ausfälle nach Pfadverschiebungen, 59 nicht registrierte Vertragsliterale, unklare Bestandsausnahmen, widersprüchliche `STORE_SERVICE`-Exports und einen Kanon-Check, der im modularen Gate fehlt. Das macht grüne Abnahmen unzuverlässig: Features können driften, ohne dass die behauptete Regel greift. | Vor Funktionsausbau Riegel vervollständigen: registrierte Vertragsnamen, eindeutige Ownership mit Host/Client-Ausnahmen, Gate-Slices gegen Umzug absichern und maschinenlesbare Strukturausnahmen. Jede neue Regel braucht eine Mutation, die genau diesen Riegel rot macht. |
| **P2 – überlappende Aufgabe, anderer Zweck** | `packages/project-index` gegen DSH Datei-/Workspace-Suche | DSH besitzt Workspace-Datei- und Suchwerkzeuge. Shinons Index liefert darüber hinaus inkrementellen Symbol-/Kantenindex, warme Treffer, gemeinsame Workspace-Identität und Fakten-Snapshot. `docs/ZAHLEN.md` §2 enthält eine echte Warmmessung und `docs/probes/index-konsolidierung.json` belegt den Verzicht auf den zweiten Prompter-Index. | DSH-Suche nicht nachbauen. Den Index als präzisen Kontextanbieter behalten, aber nur dessen nachweislich bessere Treffer/Graph-/Faktenfunktionen abfragen. Weiterer Ausbau braucht Vergleich gegen DSH-Suche auf demselben Aufgaben-Set und gleiche Warm/Kalt-Bedingungen. |
| **P2 – vermeintliche DSH-Dopplung** | `packages/task-router` gegen DSH Goals / Goal Round | Der Router verwendet `ctx.goals` als Zustandsquelle (siehe `packages/task-router/index.js`, `docs/ZAHLEN.md` §2); DSH besitzt Goal- und Round-Mechanik. Der Shinon-Code projiziert daraus jedoch die eigene Task-Gruppe und trifft Policy-/Entscheidungsentscheidungen. Das ist Integration, keine zweite Goal-Datenbank. | Den Router nicht vorschnell entfernen. Sicherstellen, dass DSH Eigentümer von Goal-Lifecycle und Persistenz bleibt. Shinon soll nur Projektion/Policy ergänzen; kein eigener paralleler Goal-Status und keine zweite Round-Engine. |
| **P2 – Sicht ohne Zustandsautorität** | Persona, Narrative, Scoring | `docs/VISION-ABGLEICH.md` §§3 B/D zeigt die bekannte Naht: Persona-Zustand wird dargestellt, Scoring steuert aktuell die Tonhaltung, Narrative übernimmt keine Autorität in die Persona. DSH hat ein Persona-System, aber das löst Shinons fachliche Provenienz- und Entscheidungsregeln nicht automatisch. | Vor weiterem Persona-Code einen Eigentümerentscheid treffen: DSH für Laufzeit-Persona/Sessionzustand nutzen; Shinon hält nur prüfbare Fachpolitik und Evidenz. Keine zweite allgemeine Persona-/Memory-Schicht. Den Narrative→Persona→Goal-Kreislauf nur bauen, wenn eine konkrete Entscheidung davon abhängt und ein End-to-End-Replay existiert. |
| **P2 – Laufzeit- und Testkosten** | Index-Start und Testline (`CLEANREPO-AUDIT.md` Konflikte #51, #58; P0-1) | Der Audit misst `openIndex` mit sieben Einzelcommits: p50 ca. 1947 ms gegenüber ca. 248 ms in einer Transaktion (**7,9×** Unterschied). Eine Codingmon-Kreuzung rechnet 6,3 Mio. Fälle und braucht 40 s; mehrere wartende Tests binden zusammen ungefähr 11 Minuten. Das ist messbarer Impact auf Start und Entwicklerdurchsatz. | Index-Metadaten in einer Transaktion aktualisieren. Rechenexplosion durch vorberechnete Objekte oder belegte Stichprobe lösen; Warte-Tests mit kurzer Ereignisfrist in die CI-Tier verschieben. Keine CI-Verschiebung für reine Rechenzeit. |

## DSH-Fähigkeiten: übernehmen statt nachbauen

Der installierte DSH-Baum enthält bereits unter anderem `dsh-goal`,
`dsh-session`, `dsh-skill`, `dsh-subagent`, `dsh-storage`, `dsh-token-meter`,
`dsh-api-gateway`, `dsh-api-remotes`, `dsh-client-ui-workspace`,
`dsh-client-ui-session`, `dsh-client-ui-goal` und `dsh-client-ui-subagent`.
Diese Existenz allein beweist keine API-Verfügbarkeit in jedem Profil; die
jeweilige Bundle-/Service-Registrierung ist vor Nutzung zu prüfen.

Die aktuelle [Upstream API-Gateway-Doku](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/api-gateway.md)
trennt RPC/Connection vom fachlichen Dienst. Der [Capability-Seams-Überblick](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/capability-seams.md)
und die [Cordis Context API](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/cordis-api/context.md)
zeigen die Erweiterungsrichtung: Cordis-Services und Events verbinden Plugins;
die Anwendung entscheidet, welche Remotes freigegeben werden. Daraus folgen
diese Grenzen:

- DSH sollte Sessions, Goal-Rounds, Skills, Modellzugang, Toolausführung,
  Permission-Mechanik, UI-Transport und Session-Log besitzen.
- Shinon sollte Repo-Fakten, Quellen/Provenienz, konkrete Persona-Policy,
  Projekt-Indexierung, Shinon-spezifische Narrative und Visualisierung besitzen,
  soweit diese Funktionen durch echte Nutzung belegt sind.
- Shinon sollte keine parallelen Session-/Goal-Speicher, generischen RPC-
  Transporte, Modellkatalog-Schreibwege, Tokenzähler oder generischen
  Plugin-Manager bauen.

Die aktuelle Upstream-Doku ist eine bewegliche `master`-Quelle. Der hier
eingearbeitete API-Nachweis kommt daher vom gepinnten lokalen DSH:
`dsh-token-meter` exportiert `deriveTurnTokenUsage` über den öffentlichen
`./client`-Pfad (`lib/types/client.d.ts:4-8`; Signatur in
`lib/types/turn-usage.d.ts:7-32`); das installierte DSH-Chat-Bundle nutzt die
Faltung und rendert ein Usage-Panel (`dsh-client-ui-chat/lib/client.js`,
TurnUsagePanel und Token-Usage-Strings). Die Routenliste deckt Anbieter/Modell
bereits ab; ein Shinon-Mehrwert kann nicht bloß „Route anzeigen“ sein. Ebenso bietet
`dsh-api-gateway/client` `ctx.remote.$mount()` für eine generierte
Remote-Contribution. Nicht gelöst ist damit die Auswahl der Beiträge in
`dsh-api-remotes`: die gepinnte Browser-Assembly enthält Codingmon nicht
automatisch.

## Positiv: kein Leerlauf

- **Repo-Gates und Vertragsprüfungen:** DSH ist eine Laufzeit, nicht der
  Eigentümer von Shinon-Namensverträgen, Paketform, Release-Gates oder
  Mutationsbeweisen.
- **Project Index:** DSH Workspace Search ist keine nachgewiesene Entsprechung
  zum Symbol-/Kantenindex und seinem Warm-Reconcile. Ersetzen nur nach Messung.
- **Provenienz und Faktenpipeline:** DSH Session-Logs dokumentieren Verlauf;
  sie sind kein Claim-/Source-Lifecycle mit Konfliktbehandlung.
- **Codingmon:** spiel-/Begleiter-Mechanik ist Produktfunktion, keine Harness-
  Duplikation. Store und Client/Host-Naht haben bereits lokale Tests/Probes.
- **Task Router:** als dünne Policy-Projektion über DSH Goals plausibel,
  solange er weder Goal-Lifecycle noch DSH-Round-Mechanik erneut implementiert.

## Paket-für-Paket-Abgleich

Dieser Durchgang hat alle Paketordner und den aktiven/inaktiven Profilstatus
inventarisiert. „Kein Duplikat“ bedeutet hier: kein direktes DSH-Gegenstück
für die konkrete fachliche Aufgabe gefunden; es ist keine Qualitätsabnahme.

| Paket(e) | Einordnung gegen DSH |
|---|---|
| `better-errors` | Platzhalter: keine Fehlerdarstellung, nur Styles und Aktivierungslog. Leerlauf belegt; gleichwertiger DSH-Fehler-UI-Ersatz ist in dieser Analyse nicht belegt. |
| `token-usage` | DSH-eigene Turn-Usage-Regel wird kopiert; DSH liefert öffentliche API und native UI samt Anbieter-/Modell-Routen. Kopie entfernen; eigener Footer nur bei belegtem anderem Nutzerwert. |
| `core`, `locale-de`, `tooltip`, `widget-dock`, `version` | Shinon Branding, Übersetzung und Status-/Widget-Oberfläche. DSH besitzt UI-Slots und Produktoberfläche, aber kein gleiches Shinon-Branding. Behalten, sofern das Profil diese Oberfläche tatsächlich nutzt; Status-Anzeigen nicht als Aktivierungsautorität behandeln. |
| `dashboard`, `diff-overview` | Shinon-Status-/Arbeitsübersicht und Git-Diff. Überlappen mit DSH Workspace/Session-Oberfläche; prüfen, dass keine zweite Session-Verwaltung entsteht. Der Git-Diff bleibt eine eigene Repo-Funktion. |
| `events`, `hook`, `markers`, `popup`, `traceability` | Ereignisbeobachtung, konfigurierbare Hook-Schranke, Notizen/Overlay und Provenienz-/Capability-Übersicht. DSH hat Session-Events, User Approval und Referenz-/Trajectory-UI, aber diese Shinon-spezifischen Regeln/Objekte sind keine Transport-Duplikate. UI nur dort behalten, wo native Slots statt paralleler DOM-Flächen verwendet werden. |
| `key-router` | Eigene Key-Pools/429-Rotation; DSH besitzt Credentials und Provider-Settings. DSH muss Schlüsselbesitz bleiben, Shinon soll Pool-/Eskalationspolicy ergänzen. Der bestätigte offene Punkt ist der saubere Zugang vom DSH-Credential-Store in den Router, nicht ein weiterer Schlüssel-Store. |
| `narrative`, `persona`, `scoring` | Eigene fachliche Zustands-/Evidenzregeln mit Überschneidung zu DSH Persona, Session-Log und Verlauf. Einzigartiger Mehrwert ist nur dann gegeben, wenn daraus prüfbare Entscheidungen folgen. Zuständigkeit und Schreibrecht klar halten; keine generische zweite Persona oder Session-Historie. |
| `project-index`, `prompter` | Repo-Symbol-/Kantenkontext bzw. vor dem Turn laufender Prompt-Enhancer. DSH hat Datei-/Websuche und Prompt-Assembly; Shinon bietet dazu den gemessenen warmen Projektindex und explizite Selektion/Provenienz. Behalten, aber Kosten und Trefferqualität regelmäßig gegen DSH-Basisweg messen. |
| `task-router` | Dünne deterministische Entscheidungsschicht über DSH Goals. Wertvoll, solange DSH Goals/Rounds den Lifecycle behalten. `shinon_goal_micro_state` wird im Cleanrepo-Audit als Dienst ohne Abnehmer geführt: Dienst entweder anschließen oder entfernen. |
| `codingmon` | Produkt-/Begleiterfunktion, keine Harness-Dopplung. Offene Handoffs der Encounter-/Pre-Flight-Arbeit separat vom fertigen Store/Kern bewerten. |
| `openapi`, `mobile`, `seams` | Inaktiv laut Manifest. `seams` ist ein internes, importfreies Host-Kernmodul statt Nutzerfeature. `openapi` ist derzeit Vertrags-/Vorbereitungscode ohne aktiven Server. `mobile` ist ein zurückgestelltes Profil. Nicht als aktive Laufzeitleistung zählen; erst bei konkreter Abnahme aktivieren. |

Der Worktree enthielt bereits Änderungen am `widget-dock`, Profil-Modellkatalog,
Key-Router, Marker-Slot und Diff-Anzeige. Der Seitenleisten-Order-Konflikt
`CLEANREPO #38` ist im aktuellen Stand ausgeräumt: die geänderten Marker- und
Prompter-Clients entfernen ihre Einträge, wie es der Audit für den Stand nach
`7c2c3c8` beschreibt; ein Wächter für künftige Order-Kollisionen bleibt offen.
Ein konkreter Audit-Delta: die neue
WidgetDock-Fassung schreibt jetzt `window.__shinonWidgetDock` (dirty
`packages/widget-dock/client.js`), obwohl `CLEANREPO-AUDIT.md` §4/#50 den
älteren Stand als reinen Leser ohne eigenes Global beschreibt. Der aktuelle
Kanon hat dafür keinen Eintrag und `capabilities.json` hat weiterhin weder
`widget-dock` noch `diff-overview` als Owner. Die Capability-Lücke ist also
weiter da; der Kanon-Befund für `widget-dock` ist durch die aktuelle Änderung
neu entstanden. `/shinon/diff` und der Credential-Pfad bleiben ohne aktuelle
Echt-Host-Probe unbestätigt.

## Impact-Menge und Abnahmeregel

Der Cleanrepo-Audit enthält **58** nummerierte Konfliktbefunde und ergänzt
konkrete Tasks. Davon sind bereits allein in den priorisierten Gruppen
mindestens **3 Datenverlustpfade**, **4 zusammenhängende Codingmon-Defekte**,
**3 tote Prompter-Mechaniken**, **4 Dienste ohne Abnehmer** sowie **2 Pakete
ohne Capability-Zuordnung** benannt. Diese Zahlen sind Befundmengen, keine
fertigen Nutzerwirkungen; ein Konflikt kann mehrere Symptome bündeln. Größter
quantifizierter Impact: Store-Verlust, falsche Spielstände/Belohnungen,
unsichtbare Pakete, sowie 7,9× unnötige Index-Startkosten. Größter
Entwicklungsimpact: rund 11 Minuten blockierte Testzeit in der gemessenen
Testline.

Für jede behaltene Shinon-Funktion gelten ab jetzt vier Prüffragen im Review:

1. Gibt es einen Aufrufer im Produktionspfad (nicht nur einen Test oder Export)?
2. Ändert die Funktion einen echten Turn, gespeicherten Zustand oder sichtbare
   Nutzerentscheidung?
3. Besitzt DSH bereits dieselbe Funktion im gepinnten API-Stand? Wenn ja: wird
   DSH genutzt und nur der belegte Shinon-Mehrwert ergänzt?
4. Belegt eine Probe oder ein Abnahmetest die konkrete Wirkung inklusive
   Fehlerfall?

Wenn 1 oder 2 „nein“ ist, ist die Funktion tot oder ein Prototyp. Wenn 3 „ja“
ist und keine Shinon-spezifische Wirkung belegt wird, ist sie Duplikat. Wenn 4
„nein“ ist, darf sie nicht als wirksam oder `Verified` gezählt werden.

## Empfohlene Reihenfolge

1. Die Profilroute zuerst klären: der Form-Extraktor verwirft das neu gewählte
   OpenRouter-Modell. Danach die P0-Laufzeitdefekte mit Datenverlust oder
   sichtbarer Falschfunktion reparieren (CLEANREPO #1–3, #34, #46, #53).
   Das ist direkter Nutzerimpact.
2. Tote Pfade und Services ohne Abnehmer inventarisieren; pro Funktion
   verdrahten oder löschen, nicht durch neue Pakete überdecken (CLEANREPO
   #11–13, #23, #35, #57).
3. DSH-Dopplungen entfernen: `token-usage` auf `dsh-token-meter/client`
   umstellen und native Chat-Usage gegen Shinon-Footer vergleichen;
   `better-errors` bleibt nur bei implementierter Fehleransicht aktiv.
4. Encounter/Pre-Flight: den echten Request-Handoff implementieren und messen;
   keine weiteren Attrappen-Funktionen bis Request-Diff und Nutzerwirkung belegt
   sind.
5. Für jeden DSH-nahen Bereich eine kurze Ownership-Tabelle in der bestehenden
   Roadmap ergänzen: DSH-Dienst, Shinon-Ergänzung, verbotene Doppelhaltung,
   lokaler API-Beleg für Pin `0.2.1-rc.2`.
6. Vor Upstream-Anschluss eine schmale Probe gegen den installierten DSH
   erstellen (Typdeklaration/Export, Bundle-Auflösung, Cordis-Registrierung,
   realer Aufruf). DSH `master` allein ist kein Abnahmebeleg.
7. Offene Langtests nach `docs/CLEANREPO-AUDIT.md` überarbeiten; die
   dokumentierten Volltestketten erst nach Absprache starten.

## Geprüfte lokale Belegstellen

- `package.json`, `scripts/dsh-target-versions.json`
- `profiles/shinon/package.json`
- `docs/ZAHLEN.md` §§1–3, `docs/ROADMAP.md` §§1.5/2, `docs/VISION-ABGLEICH.md`
- `docs/WISSENS-RUNTIME-PLAN.md`, `docs/CLEANREPO-AUDIT.md`
- DSH API-Pin: `node_modules/@deepseek-ai/dsh-token-meter/package.json`,
  `lib/types/client.d.ts`, `node_modules/@deepseek-ai/dsh-api-gateway/lib/types/client/index.d.ts`
- `packages/token-usage/index.js`, `packages/better-errors/index.js`
- `packages/task-router/index.js`, `packages/project-index/index.js`
- `packages/codingmon/assets/encounter.js`, `packages/codingmon/client.js`
- `docs/probes/preflight-live.json`, `docs/probes/live-model-catalog.json`
