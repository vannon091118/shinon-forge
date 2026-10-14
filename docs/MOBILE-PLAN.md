# Mobile-first Prototyp — Profil, Ballastabbau, CI-Gates und Android-Shell

> **Status:** plan — Architektur- und Umsetzungsplan; noch keine Mobile-Laufzeit oder Mobile-Gates implementiert. **Stand:** 2026-10-14
> **Einstieg:** docs/INDEX.md · **Zahlen:** docs/ZAHLEN.md (einziger Eigentümer harter Bestands- und Messzahlen)

## 1. Entscheidung in einem Satz

**Zuerst ein schlankes, echtes DSH-Profil plus mobiles Web-UI im bestehenden shinon-forge; danach — und erst nach einem reproduzierbaren Android-Proof — die App-Shell.** Desktop bleibt unverändert. Ballast wird zunächst aus dem Mobile-Profil ausgeschlossen, nicht global aus dem Repo gelöscht.

Das erste überprüfbare Ergebnis ist kein APK-Mockup, sondern ein auf einem echten Android-Gerät gestarteter DSH-Server, der das Mobile-Profil lädt und dessen Chat-Oberfläche ohne horizontales Quetschen, mit funktionierender Tastatur und erreichbaren Touch-Aktionen rendert.

## 2. Repository-Befund (Iststand, nicht Annahme)

Stand der Bestandsaufnahme: main, 2026-10-14. Referenzen sind die Dateien im aktuellen Baum.

| Befund | Beleg / Konsequenz |
|---|---|
| profiles/shinon ist das Desktop-/Hauptprofil; profiles/headless ist das One-shot-Profil. Ein Mobile-Profil gibt es noch nicht. | profiles/*/package.json; Mobile muss als eigenes Profil ergänzt werden. |
| Das Hauptprofil lädt 23 Bundle-Layer, davon 18 @shinon/*-Bundles und mehrere fremde DSH-Bundles einschließlich drei Experimental-Bundles. | profiles/shinon/package.json; nicht alle davon sind auf dem Telefon sinnvoll. |
| Root-Paket verlangt Node ^22.19.0 oder >=24.0.0; DSH ist im Root gepinnt. | package.json; Zielruntime muss mit exakt diesem DSH-/Node-Stack getestet werden. |
| dev:web legt Profil shinon und Port 3085 fest. scripts/open.mjs ermittelt sein Profil heute aus dem Root-Dev-Script, wählt aber einen freien Port und liest die tokenisierte READY-URL zurück. | package.json, scripts/open.mjs, scripts/lib/port.mjs; keine zweite Kopie der Spawn-/Port-/READY-Logik bauen und keinen festen Port voraussetzen. |
| Profil-Gate und Profil-Smoke sind derzeit am aktiven Profil orientiert. | scripts/gate/plugins/profile.mjs, scripts/shinon-profile-test.mjs, scripts/lib/repo.mjs; die Mobile-Prüfung muss ein Profil explizit auswählen können und darf nicht nur das Desktop-Profil prüfen. |
| Gate-Plug-ins werden dynamisch geladen; scripts/gate/policy.json verlangt, dass Plugin-Dateien und Policy-Slices zusammenpassen. gate:full ist der Vollprüflauf. | scripts/gate/engine.mjs, scripts/gate/policy.mjs, scripts/gate/policy.json; jedes neue Gate braucht Tests, einen passenden Slice und einen CI-Pfad. |
| Die CI hat bereits einen fail-closed Job verdict; Fehler, Abbruch und skipped müssen rot bleiben. | .github/workflows/commit-guard.yml, docs/CI.md; jeder neue verpflichtende Mobile-Job gehört explizit in verdict.needs. Der stabile Required-Check-Name bleibt Verdikt (fail-closed). |
| Das Profil verwendet link:-Dependencies. Die Repo-Doku hält fest, dass npm diese Profil-Links nicht regulär installieren kann und sie derzeit nicht durch einen naiven npm-install-Schritt gelöst werden. | README.md, docs/ARCHITECTURE.md; frischer Klon/CI muss das Profil reproduzierbar auflösen, bevor Mobile als bootbar gelten darf. |
| Das verlinkte Repo Shinon-git/Shinon-mobile- ist öffentlich, aber beim Abruf am 2026-10-14 leer (GitHub meldet Größe 0); die verbundene Integration hat dort nur Lesezugriff. | Der Plan und die Forge-seitigen Änderungen gehören zunächst in dieses Repo. Das Android-Repo kann danach separat initialisiert werden. |

### Korrekturen gegenüber den frühen Annahmen

- **Nicht behaupten, dass DSH fast vollständig Pure JS sei.** Der native Android-/Termux-Pfad kann native Abhängigkeiten wie koffi, node-pty oder sharp berühren. Vor einer Plattformentscheidung ist ein kompletter Installations- und Runtime-Smoke auf dem Zielstack erforderlich; ein einzelnes erfolgreiches node --version beweist nichts. Siehe auch [Termux-Ausführungsmodell](https://github.com/termux/termux-packages/wiki/Termux-execution-environment) und die technische Problemliste im [Android-Termux-DSH-Projekt](https://github.com/cokelaoshi1/android-termux-dsh).
- **Kein Linux-ARM64-Node-Binary blind mit ProcessBuilder starten.** Android verwendet Bionic; normale Ubuntu-/Debian-Userlands bauen auf glibc. Der APK-Proof muss daher eine definierte Linux-Userland-/proot-Strategie oder eine Android-kompatible Node-Einbettung nachweisen. Quelle: [Termux execution environment](https://github.com/termux/termux-packages/wiki/Termux-execution-environment).
- **Nicht pauschal auf 256 MB V8-Heap begrenzen.** Zuerst RSS/Heap, Kaltstart, Plugin-Ladezeit und OOM-Verhalten messen. Ein Heap-Limit ist ein späterer, gerätespezifisch begründeter Grenzwert — keine Performance-Optimierung per Vermutung.
- **Keine DSH-DOM-Hooks oder CSS-Klassennamen erfinden.** Der frühe Vorschlag, aus dem serverseitigen index.js direkt auf document zuzugreifen, verletzt die Host/Client-Trennung des Paketvertrags. DOM, Viewport und Styles gehören in client.js; nur verifizierte DSH-Client-Hooks/Slots verwenden. Selektoren wie [class*="sidebar"] gelten als fragil, bis sie am echten DOM belegt und getestet sind.
- **Zoom nicht für Touch deaktivieren.** viewport-fit=cover und Layout-Anpassungen sind sinnvoll; user-scalable=no wird nicht zum Ziel erklärt, weil Nutzer die Ansicht weiter vergrößern können müssen.

## 3. Zielarchitektur

    shinon-forge (dieses Repo)
      profiles/mobile/                 Profil-Allowlist + mobile-spezifische Patch-Ebene
      packages/mobile/                 Cordis-Bundle: Mobile CSS / Client-Anpassungen
      scripts/open.mjs                 gemeinsamer Startpfad; Profil + URL-Ausgabe konfigurierbar
      scripts/gate/plugins/mobile-*.mjs
      scripts/gate/tests/mobile-*.test.mjs
      .github/workflows/commit-guard.yml  Mobile-Checks + fail-closed verdict

    Shinon-mobile (separates Android-Repo, später)
      Kotlin App / WebView / Foreground Service / Log- und Fehleransicht
      gepinnter Runtime- und Rootfs-Installer, Integritätsprüfung, Update/Rollback
      verbindet sich ausschließlich mit der lokalen DSH-URL samt Auth-Token

Kein DSH-Fork und kein zweiter Plugin-Graph im Code: Profilgraphen unterscheiden sich, gemeinsame Pakete und Vertragsregeln bleiben identisch. Die native Shell ist nur Runtime-Manager und Fenster — sie ersetzt nicht DSHs Agent-, Session- oder Provider-Schicht.

**Wichtiger Vergleich vor Phase 3:** [dsh-io/dsh-mobile](https://github.com/dsh-io/dsh-mobile) implementiert bereits einen Android-Pfad mit Debian-Rootfs, proot, Foreground Service, WebView und CI-Build. Vor einem neuen Kotlin-Projekt muss ein Spike prüfen, ob diese Basis als Referenz, Fork-Basis oder integrierbarer Runtime-Runner taugt und wie shinon-forge-Profile eingebunden werden. Nicht unbesehen kopieren: Runtime-Pins, Verträge, Sicherheit und Lizenzhinweise separat prüfen.

## 4. Profil-Schnitt: klein, nützlich, explizit

### 4.1 Mobile-Allowlist — erster Kandidat

Die Liste ist ein **Startkandidat**, keine Behauptung, dass alle Komponenten bereits mobil funktionieren. Das tatsächliche dsh --profile mobile --dump-config entscheidet, ob die externen DSH-Bundles auflösbar sind.

**Kern für den ersten Prototyp:**
- @deepseek-ai/dsh-base
- @deepseek-ai/dsh-web-app
- @shinon/persona
- @shinon/core
- @shinon/events
- @shinon/locale-de
- @shinon/better-errors
- @shinon/token-usage
- @shinon/prompter
- @shinon/narrative
- @shinon/mobile (neu)

**Nur nach Smoke-Test als Zusatz aktivieren:** @shinon/dashboard, @shinon/markers, @shinon/popup. Ein Zusatz muss auf kleinem Viewport sichtbar nützlich sein und darf Chat-Eingabe, Speicherverhalten oder Startzeit nicht unverhältnismäßig verschlechtern.

**Zunächst NICHT in das Mobile-Profil aufnehmen:**
- @shinon/codingmon: spiel-/pollingorientierte Oberfläche; kein Kernpfad für Chat.
- @shinon/project-index: Dateiscan und persistenter Index sind für den ersten Chat-Prototyp kein Muss; späterer Bedarf muss mit echter Workspace-Anforderung begründet werden.
- @shinon/scoring, @shinon/task-router, @shinon/hook, @shinon/tooltip, @shinon/key-router: aus dem Erstprofil ausschließen, bis konkreter Nutzen/Abhängigkeit belegt ist. Das ist kein Urteil, dass die Pakete generell schlecht sind.
- @deepseek-ai/dsh-experimental-*: sämtliche Experimental-Bundles im Mobile-Profil weglassen.
- @shinon/openapi und @shinon/shinon-forge: derzeit ohnehin nicht aktive Pakete; nicht wegen Mobile neu aktivieren.

Für DSH-Bundles, die indirekt über andere Layer geladen werden, erst den echten Config-Dump lesen und die aufgelösten IDs prüfen. Keine spekulativen disabled:true-Einträge für IDs hinzufügen, die nicht existieren. Desktop-Bundles und Desktop-Verhalten bleiben in Phase 1–2 unverändert.

### 4.2 Konfigurationsregeln

- profiles/mobile/package.json: eigenständiger dsh.profile.bundles-Graph; eigene Dependency-Auflösung muss im frischen Klon funktionieren.
- profiles/mobile/cordis.yml: leere Liste wie in den bestehenden Profilen; Entscheidungen stehen in der Patch-Datei.
- profiles/mobile/cordis.patch.yml: nur validierte Mobile-Overrides und tatsächlich aufgelöste Disables. Modellroute aus der zentral bestätigten Route ableiten, nicht eine zweite Liste mit Secret-Werten pflegen.
- Secrets bleiben außerhalb des Repos. SHINON_API_KEY oder andere Provider-Schlüssel niemals in JSON/YAML, Query-Logs, Screenshots oder Kommandozeilen-Argumenten speichern.
- Mobile startet zuerst über Loopback und die von DSH ausgegebene READY-URL samt Token. Keinen externen Bind wie 0.0.0.0 für den ersten Prototyp.
- Das Rootfs, Node, ausführbare Dateien und node_modules gehören in die private Linux-/App-Laufzeit, nicht ungeprüft auf /sdcard (Symlink-, Rechte- und Execute-Einschränkungen). Benutzerdateien werden später bewusst und eingeschränkt freigegeben.

## 5. Phasen und konkrete Abnahme

Jede Phase ist einzeln abnehmbar. Keine Phase beginnt mit dem stillschweigenden Überspringen einer roten Vorphase.

### W0 — Android-Proof und Baseline (kein Produktcode)

**Arbeit**
1. DSH-Pin und Node-Engine aus Root-Manifest verifizieren; frischen Klon und Lockfile-Install reproduzieren.
2. Auf einem ARM64-Android-Gerät zunächst Termux-Node testen; bei Bionic-/Native-Addon-Problemen proot Ubuntu als getrennte Variante testen. Für jede Variante den kompletten npm-ci-/DSH-Profilboot dokumentieren.
3. Bestehenden Startpfad auf ein lokales Gerät bringen. Nicht Port 3085 erzwingen: freien Port bzw. DSH-READY-URL mit Token verwenden; Chrome/WebView auf demselben Gerät öffnet nur die tatsächlich ausgegebene Loopback-URL.
4. Baseline erfassen: Installationsdauer, Rootfs/Installationsgröße, Kaltstart bis READY, Ruhe-RSS, Last-RSS nach einem echten Modellturn, OOM/Crash und Verhalten bei gesperrtem Display. Metriken und Geräteklasse in einem Probe-Artefakt festhalten.

**Abnahme**
- Frischer Installationslauf mit Exit-Code und Logs, keine manuell reparierten node_modules.
- dsh --profile shinon --dump-config und ein echter lokaler Web-Request funktionieren.
- Modellturn wird separat als ungeprüft markiert, bis ein gültiger Testschlüssel in einer geschützten Umgebung genutzt wurde.
- Technische Entscheidung protokolliert: Termux-native Runtime vs. proot-Userland; keine Annahme wird als Erfolg verkauft.

### W1 — Mobile-Profil und startbarer CLI-Pfad

**Arbeit**
1. profiles/mobile/{package.json,cordis.yml,cordis.patch.yml} aus der Allowlist erstellen.
2. Profil-Resolution generisch machen: Profilname explizit an den Profile-Smoke übergeben können; das Desktop-Profil bleibt Standard.
3. scripts/open.mjs minimal erweitern: --profile mobile plus --print-url/No-browser-Modus. Portwahl, READY-Parsing, Kindprozess-Lebenszyklus und Token-Verhalten wiederverwenden. **Kein** zweites mobile-open.mjs mit duplizierter Spawn-Logik.
4. Root-Script dev:mobile hinzufügen und prüfen, dass es einen sauberen Start ermöglicht. Ein NODE_OPTIONS-Limit erst nach W0-Baseline einführen.
5. Gate-/Build-Validierung über das aktive Desktop-Profil hinaus für das explizite Mobile-Profil erweitern.

**Abnahme**
- Frischer Klon löst jedes Bundle ohne manuelle, undokumentierte Link-Schritte auf.
- Desktop-Profiltest bleibt unverändert grün; neuer Mobile-Profiltest prüft Layer und Aktivierung.
- npm test, npm run gate:full und Profil-Smokes sind grün.

### W2 — @shinon/mobile und responsiver Web-Prototyp

**Paketvertrag**
- Neues packages/mobile/ mit den vier Pflichtdateien aus docs/ARCHITECTURE.md: index.js, client.js, cordis.patch.yml, package.json.
- Host-index.js enthält Cordis-/Config-Logik, aber kein Browser-DOM; alle Styles und Client-DOM-Interaktionen leben im Client-Teil.
- Erst vorhandene DSH-Slots/Client-Hooks untersuchen, dann eine kleine, wiedererkennbare Client-Schicht registrieren. Keine DSH-Upstream-Dateien patchen.
- Mobile-CSS: einspaltiger Nachrichtenstrom bei schmalen Viewports; Sidebar per zugänglichem Toggle öffnen/schließen; Panels nur dann verstecken, wenn ihre Funktion über einen erreichbaren Weg weiter benutzbar ist; Safe-Area-Insets; vernünftige Scroll-Container für geöffnete Tastatur; keine erzwungene Zoom-Deaktivierung.
- Interaktionsziele mindestens 44 CSS-Pixel, Texteingaben mindestens 16 CSS-Pixel als Startwert; Tastatur, Fokus, Screenreader-Beschriftung und Landscape separat prüfen.
- Keine breit gefassten Klassen-Substring-Selektoren ohne echten DOM-Beleg. Einen eigenen Namespace/Root-Marker nutzen, wo das Slot-System dies erlaubt.

**Abnahme**
- 360, 390, 430 und 768 CSS-Pixel ohne horizontales Scrollen im Haupt-Chat; zusätzlich Landscape-Smoke.
- Senden, Stopp/Abbruch, Modellauswahl, Sidebar, Popup/Dialog, Sessionwechsel und Eingabe bei geöffneter Tastatur funktionieren per Touch.
- Desktop-Screenshot-/Smoke-Check zeigt keine Regression.
- Paket-Contract, npm-pack-Smoke und Paket-Gates bestehen.

### W3 — Neue CI-Gates (schrittweise scharf schalten)

| Gate / Job | Prüft | Wann blockierend |
|---|---|---|
| mobile-profile-contract | Pflicht-Bundles vorhanden; Allowlist/Denylist; keine Experimental- oder ausgeschlossenen Bundles; keine doppelten Bundle-/Patch-IDs; Paketnamen konsistent. | ab W1 |
| mobile-profile-boot | dsh --profile mobile --dump-config lädt jeden erlaubten Layer und meldet keinen ausgeschlossenen Layer als aktiv. Kein stiller Skip bei fehlendem DSH. | ab W1 |
| mobile-bundle-contract | Vier Pflichtdateien, Manifest-/Patch-/ModuleLoader-IDs, nur verifizierte Client-Hooks; Host/Client-Trennung. | ab W2 |
| mobile-security | keine hart codierten API-Keys, kein nicht-loopback Bind, keine externe Browsernavigation ohne Policy, keine Ausgabe des kompletten Auth-Tokens in App-Logs. | ab W1 für CLI, ab W4 für App |
| mobile-ui-smoke | Browser-Test mit Viewport-Matrix, Overflow, Touch-/ARIA-Kontrakt, Tastatur- und Sidebar-Smoke. Desktop-Regressions-Smoke mitführen. | ab W2, wenn CI-Browser reproduzierbar ist |
| android-unit / android-build | Kotlin-Logik, Manifest/Permissions, Release-/Debug-Build, reproduzierbare Runtime-Pins, SHA256-Verifikation des heruntergeladenen Runtime-Pakets. | ab W4 |
| android-device-smoke | Install, Start, READY/Token, WebView, Prozessende, Offline-/Crash-Recovery und Display-Lock auf Emulator/echtem Gerät. | zunächst nicht required; nach stabiler Runner-Verfügbarkeit schrittweise required |
| mobile-budget | installierte Bytes, Cold-start, RSS, Zeit bis READY und OOM/Crash. | erst nach mehreren reproduzierbaren Baselines; zuerst report-only |

**Verdrahtung ist Teil der Zusage.** Für jedes neue Gate:
1. Plugin-Datei unter scripts/gate/plugins/ und passenden Slice in scripts/gate/policy.json ergänzen.
2. Unit-/Regeltests unter scripts/gate/tests/ ergänzen.
3. In scripts/validate-test.mjs eine Mutations-Fixture hinzufügen: saubere Kopie bleibt grün, kaputtes Mobile-Profil wird sowohl von Gate als auch Build abgelehnt.
4. CI-Job in .github/workflows/commit-guard.yml hinzufügen und seine Job-ID in verdict.needs ergänzen. Testen, dass failure, cancelled und skipped alle das finale Verdikt rot machen.
5. Die bestehende Required-Check-Bezeichnung Verdikt (fail-closed) beibehalten, damit Branch-Protection nicht versehentlich auf einen optionalen Mobile-Job statt auf das finale Verdikt zeigt.
6. docs/CI.md, docs/INDEX.md und gegebenenfalls Probe-/Zahlenbelege aktualisieren. Solange die Jobs nur geplant sind, dürfen sie nicht als live oder grün bezeichnet werden.

### W4 — Android-Shell (separates Repo, erst nach W0–W3)

**Technikentscheidung**
- Zuerst Kompatibilität von dsh-io/dsh-mobile und seinem Rootfs-/proot-Runner evaluieren; nur fehlende Shinon-spezifische Teile ergänzen.
- Wenn eigenständiger Aufbau nötig ist: Kotlin-App mit minimalem WebView-Fenster, Foreground Service, Start/Stop, Status-/Fehleransicht und privatem Runtime-Verzeichnis. Node nicht einfach als Linux-ARM64-Binary auf Android ausführen; Userland-/Linkerstrategie ist Teil des ADR.
- Laufzeitpaket versionieren und mit SHA256/Signatur prüfen, bevor es entpackt oder gestartet wird. Update zuerst in isoliertem Verzeichnis testen, atomar umschalten und bei Fehler zurückrollen.
- Auth-Secret mit Android Keystore schützen, an den Prozess nur im Speicher als Environment übergeben; niemals in Build-Config, Repo, URL, Logs oder ProcessBuilder-Kommandozeile.
- WebView nur auf die lokale, von DSH ausgegebene Adresse navigieren lassen; externe Links in den Systembrowser, keine beliebigen externen Seiten mit privilegierten JavaScript-Bridges laden.
- Foreground-Service-Status, explizites Stoppen, Prozessende, Reconnect und Display-Lock testen. WAKE_LOCK oder START_STICKY allein sind kein Beweis gegen OEM-/Doze-Kills.

**Abnahme**
- android-build und android-unit grün; App startet auf ARM64-Gerät, DSH läuft nur lokal, Stop beendet Hostprozess und Service.
- Runtime-Update mit Erfolg und absichtlich fehlerhaftem Paket geprüft; fehlerhafte Version bleibt unaktiviert.
- App-Logs enthalten keine Schlüssel und keine tokenisierte URL.
- Installationsgröße/Updategröße und Ressourcen sind gemessen; Grenzwerte werden dokumentiert statt geraten.

## 6. Ballast-Cut ohne Desktop-Schaden

Der erste Cut ist **Profil-Scope**, nicht Löschung:

1. Mobile-Allowlist statt Desktop-Blacklist. So werden neue Desktop-Features nicht versehentlich mobile geladen.
2. Experimente, Codemon, Projektindex und nicht notwendige Hover-/Scoring-/Router-Schichten zunächst draußen lassen.
3. Optionales UI nur einzeln zurückholen, wenn ein konkreter Mobile-Use-Case besteht und W2-/Budget-Smoke grün ist.
4. Keine globalen npm-uninstall-/Paketlöschungen in diesem Vorhaben. Der Root-Monorepo-Test und das Desktop-Profil hängen weiter von der bestehenden Codebasis ab.
5. Jede spätere Löschung verlangt eigene Belege: keine Referenz in Profilen/Root-Manifest/Tests, kein Exportvertrag, keine Verbraucher und ein sauberer gate:full-/Distribution-Lauf.

## 7. Nicht-Ziele der ersten Lieferung

- Kein Fork von DSH und kein Umbau des Agent-Loops.
- Kein vollständiger Android-Dateimanager, kein Terminal und keine privilegierten Device-Tools in der ersten App-Version.
- Keine Behauptung von Offline-Modellbetrieb; Provider-Aufrufe benötigen erreichbare Dienste und korrekt konfigurierte Secrets.
- Keine festen RAM-/Storage-/Startup-Zusagen, bevor Geräte und Metriken feststehen.
- Kein automatisches Aktivieren inaktiver Forge-Pakete allein zur Erreichung einer Bundle-Zahl.
- Keine Android-Releases, bis Runtime-Herkunft, Third-Party-Lizenzen, SHA-Prüfung und Rollback geklärt sind.

## 8. Release- und Fertig-Kriterien

Mobile-Prototyp gilt als **fertig für Nutzerfeedback**, wenn:
- das Mobile-Profil auf einem frischen Klon reproduzierbar auflöst;
- der Web-Prototyp auf realem Android ohne horizontales Chat-Overflow funktioniert;
- die wichtigsten Aktionen bei Softwaretastatur, Hoch-/Querformat und Sidebar-Nutzung erreichbar sind;
- Desktop-Profil und bestehende Gates ohne Regression grün bleiben;
- die neuen Profile-/Bundle-Gates samt Negativ-Fixtures und fail-closed CI-Verdikt scharf sind;
- API-Keys und lokale Auth-Tokens nicht persistiert oder geloggt werden.

**APK gilt separat als releasefähig**, wenn zusätzlich die Runtime-Strategie, Geräte-Smokes, Prozesslebenszyklus, Update/Rollback, Integritätsprüfung und Third-Party-Notices abgenommen sind. Eine grüne Web-Probe allein reicht nicht.

## 9. Externe technische Referenzen

- [Termux Execution Environment](https://github.com/termux/termux-packages/wiki/Termux-execution-environment) — Bionic vs. glibc, Prozess-/Execute-Beschränkungen.
- [dsh-io/dsh-mobile](https://github.com/dsh-io/dsh-mobile) — bestehende Android-App mit Rootfs/proot, WebView, Foreground Service und Android-CI; als Integrationsreferenz prüfen.
- [android-termux-dsh](https://github.com/cokelaoshi1/android-termux-dsh) — dokumentierte native Abhängigkeits-/Build-Probleme und mobiler CSS-Ansatz; als Gegenprobe, nicht als undifferenziert zu übernehmende Installationsanleitung.
- [Node.js for Mobile Apps](https://github.com/nakiostudio/nodejs-mobile) — alternative Android-kompatible Node-Einbettung, separat auf DSH- und Native-Addon-Kompatibilität evaluieren.
