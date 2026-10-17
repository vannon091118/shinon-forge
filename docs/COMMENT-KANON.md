# Kommentar-Kanon — der Überhang aus dem Code

> **Status:** current — kanonische Ablage aller Kommentar-Blöcke, die 10 LOC überstiegen. **Stand:** 2026-10-17
> **Regel:** `node scripts/comment-limit.mjs --check` (schnell, ohne node_modules). Gekürzte Blöcke tragen einen Zeiger `→ Kanon: docs/COMMENT-KANON.md#<anker>`.


## Kanon k-cd1719de90f7 {#k-cd1719de90f7}

Fundstellen: bin/shinon.mjs:76–87

Volltext des gekürzten Blocks (Stand 2026-10-17):

```
/**
 * Signale weiterreichen UND den eigenen Status danach korrekt setzen.
 *
 * Gemessen 2026-10-16 mit dem reale Einstieg: SIGINT nur auf die Einstiegs-
 * prozess-Kette ohne Forwarding beendete den Einstieg (Shell meldet 130),
 * ließ aber Self-Heal-Kind und dsh als Waisen weiterlaufen — Port blieb offen.
 * Deshalb erhält JEHE Ebene hier ihre Handler: das Kind bekommt dasselbe Signal
 * (INT/TERM/HUP); stirbt das Kind per Signal, werden die eigenen Listener
 * entfernt und dasselbe Signal neu aufgelegt. Der Prozess stirbt dann ECHT
 * signalisiert (Shell: 128+Nummer) und nicht über einen Listener, der sich
 * selbst neu anstößt — das wäre eine Endlosschleife.
 */
```

## Kanon k-066458efe5c7 {#k-066458efe5c7}

Fundstellen: bin/shinon.mjs:2–41

Volltext des gekürzten Blocks (Stand 2026-10-17):

```
/**
 * bin/shinon.mjs — der echte Einstieg von Shinon Forge (PLAN.md Schritt 3.4 / D4).
 *
 * Ein Aufruf, **keine** Voraussetzung im PATH. Was hier passiert:
 *
 *   1. Node-Heilung: verlangt wird die Range aus `engines` im Root-Manifest
 *      (darunter sterben `node:sqlite` und `parseEnv` schon beim Import). Läuft
 *      die Datei unter einem untauglichen Node, startet sie sich mit dem ersten
 *      VERIFIZIERTEN Node aus `scripts/lib/runtime.mjs` selbst neu — geprüft
 *      werden `--version` gegen die Range UND der `node:sqlite`-Rauchtest.
 *   2. dsh-Auflösung: genau EINE Quelle — `dshBinary()` aus `scripts/lib/dsh.mjs`
 *      (Repo-Installat, Vendor, PATH, bekannte Prefixe). Sie liefert ein
 *      `[node, bin.js]`-Paar: kein Shebang-Node und kein Shell-Quoting dazwischen.
 *      `--check` nennt zusätzlich die HERKUNFT (`dshSource()`), damit „findet sein
 *      dsh ohne globales Installat" nicht behauptet, sondern gezeigt wird.
 *   3. Start: `node <bin.js> --profile <aktiv> …` mit `DSH_HOME=<Repo-Root>`;
 *      eigene Argumente werden durchgereicht (`shinon --no-open --port 3085`).
 *
 * **Kein Stub.** Die Audit-Befunde A-INV-03 (`docs/archive/DEPENDENCY_FINDINGS.md`)
 * und A-INV-03 (`docs/archive/ARCHITECTURE_MAP.md`) beschreiben genau diesen Pfad
 * als „verwaist: nur Logs, kein `bin`-Feld, kein Script verweist darauf". Diese
 * Fassung arbeitet: sie löst auf, prüft und startet — und sie steht im
 * `bin`-Feld des Root-Manifests, also unter dem Namen `shinon`.
 *
 * Was hier NOCH nicht passiert (bewusst, nicht vergessen): der Einstieg startet
 * das aufgelöste dsh mit `--profile <name>`. Der Bootpfad, der ohne
 * `$DSH_HOME/profiles/<name>` auskommt (`resolvedProfile`, Schritt 3.3 ist dafür
 * belegt), wird hier erst eingehängt, wenn die Profilwerte aus Code kommen
 * (Schritt 3.6) — sonst gäbe es zwei Orte, an denen das Profil definiert ist.
 * Ebenso bleibt `vendor/dsh` unverdrahtet: es läuft das Repo-Installat, also der Pin
 * aus `package.json`. Die vendorte Kopie trägt seit dem 2026-10-17 dieselbe Fassung
 * wie Pin, Lock und Installat und hat **keinen** Laufzeitleser — welcher Code sie
 * lädt (heute: keiner), welche Kandidaten `dshRoot()` kennt und was ein Umzug auf
 * eine andere Fassung kostet, steht in `vendor/MODIFICATIONS.md`.
 *
 * Aufruf:  shinon [--check] [dsh-Argumente …]      (bzw. `npm start [-- …]`)
 *          shinon doctor [--json]                 (Laufzeit-Diagnose, S4)
 * Exit:    0 = läuft bzw. geprüft bzw. doctor-gesund · 1 = doctor-Befunde
 *          · 2 = Umgebungsfehler (fail-closed)
 */
```

## Kanon k-2abda3500328 {#k-2abda3500328}

Fundstellen: packages/codingmon/assets/mechanik.js:429–439

Volltext des gekürzten Blocks (Stand 2026-10-17):

```
/**
 * Der Wurf: `uniform` aus [0,1) wird auf die kumulierten Gewichte abgebildet.
 * Reine Funktion — der Client reicht Math.random() hinein, eine Probe eine
 * feste Folge. Der hoehere Treffer gewinnt den Gleichstand nicht: die Grenzen
 * sind halboffen, deshalb ist jede Quote exakt ihr Gewicht.
 *
 * FAIL-CLOSED: ein nicht endlicher Wert (NaN, Infinity, Text, undefined) wird
 * als 0 gelesen. Sonst liefe er durch jeden Vergleich und die Funktion gaebe
 * die SELTENSTE Stufe aus — ein kaputter Eingabewert duerfte nicht der Jackpot
 * sein. Der Client spiegelt diese Zeile (client.js, `rollLoot`).
 */
```

## Kanon k-12e039dfc775 {#k-12e039dfc775}

Fundstellen: packages/codingmon/assets/mechanik.js:14–58

Volltext des gekürzten Blocks (Stand 2026-10-17):

```
/**
 * @shinon/codingmon — die Codemon-Engine (Host-Hälfte).
 *
 * Der Host hält den VERTRAG, der Client hält den ZUSTAND. Diese Trennung ist
 * Absicht: die Leiter der Eskalation, das Regelwerk, die Loot-Gewichte und die
 * Rundendauer sind reine Tabellen und reine Funktionen ohne Zeit und ohne
 * Zufallsquelle. Damit ist „was kostet Level 12, was trifft es und was faellt
 * dabei\" eine nachrechenbare Aussage und keine Behauptung aus einer Animation
 * — und sie ist ohne Browser pruefbar.
 *
 * VIER MECHANIKEN, EINE QUELLE JE MECHANIK.
 *   1. ESKALATION: jede Stufe multipliziert, nichts addiert. `ESCALATION.factor`
 *      ist die eine Zahl, aus der XP-Schwelle, Gegner-Lohn, Werte und Schaden
 *      folgen (Math.pow). Fuer den LEBENSLAUF (Summe allen Schadens) fuehrt der
 *      Client ein BigInt — dort sind Millionen exakt und nicht gerundet.
 *      `formatNumber` setzt Tausenderpunkte, `describeValue` nennt die
 *      Stellenzahl, damit der Sprung von zwei- auf fuenfstellig inszenierbar
 *      ist, ohne dass die Anzeige luegt. Die Leiter ist bei LEVEL_CAP gedeckelt
 *      (siehe dort), weil `Math.pow` sonst Infinity liefert und die Anzeige in
 *      Exponentialschreibweise ausbricht.
 *   2. REGELWERK: `ELEMENTS`/`ELEMENT_CHART` (Elementarkreis),
 *      `CATEGORY` (Verteidigungsdurchgriff), `SYNERGY` (Element mal Art),
 *      `BUFFS` (Zustandslagen) und `LINEAGE` (Vererbungsbaum der zehn Linien).
 *      Der Schaden ist BaseDamage * Element * Synergie * Buff - DEF * Durchgriff,
 *      also fuenf Nachschlagevorgaenge in festen Tabellen und KEINE Fallunter-
 *      scheidung ueber Zahlen. Das System rechnet nicht klug, es schlaegt nach;
 *      die Analyse muss der Spieler machen.
 *   3. PACING: `PACING.delayMs` ist die kuenstliche Rundendauer. Der Host nennt
 *      nur die Zahl und die Absage (LOCKED_TEXT); die Sperre selbst haelt der
 *      Client, weil dort der Zustand liegt.
 *   4. LOOT: `LOOT_TABLE` in Basispunkten (8500/1400/100 = 85/14/1 Prozent).
 *      `rollLoot(uniform)` ist eine reine Funktion eines Wertes aus [0,1) —
 *      derselbe Wurf ergibt immer dieselbe Beute, damit die Tabelle pruefbar
 *      ist und erst der Client echtes Math.random() einsetzt.
 *
 * Der Host entscheidet nichts und handelt nicht: er validiert die Parameter,
 * stellt die Vertragsfunktionen bereit und protokolliert die Aktivierung.
 * Alles Sichtbare — Pet, Arena, EXP — lebt im Client.
 *
 * ZEHN SPEZIES, ZWEI FAEIGKEITEN JE SPEZIES. `family` waehlt die Pixelart-Form
 * im Client (drei handgezeichnete Familien) und ist zugleich das ELEMENT der
 * Linie; die Spezies unterscheidet sich in Werten, Faehigkeiten und Vererbung.
 * Zehn eigene 16x16-Matrizen waeren 21 weitere handgezeichnete Sprites — die
 * gibt es nicht, und sie werden hier nicht erfunden.
 */
```

## Kanon k-3c3e561a6d25 {#k-3c3e561a6d25}

Fundstellen: packages/codingmon/assets/mechanik.js:1–12

Volltext des gekürzten Blocks (Stand 2026-10-17):

```
/**
 * @shinon/codingmon — der KERN der Codemon-Engine: Leiter, Regelwerk, Pacing,
 * Loot. Reine Tabellen und reine Funktionen, KEIN Bare-Import.
 *
 * WARUM GETRENNT VON index.js (gemessen, nicht Geschmack): dieses Modul laedt
 * ohne jede Abhaengigkeit, also auch in einer Umgebung ohne node_modules. Die
 * Einzeltests der Mathematik importieren deshalb DIESE Datei, und die CI faehrt
 * sie ohne Installation. `index.js` gibt alles hiervon weiter (`export *`) und
 * haelt nur, was den Host als Plugin ausmacht (`Config`, `apply`, der Spiegel).
 * Dieselbe Aufteilung wie beim Project Index: der Kern kennt keine
 * Host-Abhaengigkeit.
 *
```

## Kanon k-4753c134ca3d {#k-4753c134ca3d}

Fundstellen: packages/codingmon/assets/pet-remote.js:139–149

Volltext des gekürzten Blocks (Stand 2026-10-17):

```
/**
 * Der CLIENT-Beitrag: die generierte Form, die `ctx.remote.$mount(...)` erwartet
 * (`{ package, descriptors }`). Die Codecs sind der Grund, warum die Umwandlung
 * hier und nicht in `uebergabe.js` steht: `mode: 'strict'` mit einer
 * Schemafabrik ist die Form der generierten Beitraege, und das Client-Gateway
 * lehnt einen Beitrag mit einem Codec ohne strict VOR dem Mounten ab
 * („Client-supplied fields without strict generated codecs fail before methods
 * become callable"). Die Fabrik wird auf der Client-Seite nicht ausgefuehrt —
 * der Client schickt die Werte, der Host prueft sie.
 * @returns {object} Beitrag aus Paketname und einem Endpunkt.
 */
```

## Kanon k-2b8e8cc83d2f {#k-2b8e8cc83d2f}

Fundstellen: packages/codingmon/assets/pet-remote.js:41–57

Volltext des gekürzten Blocks (Stand 2026-10-17):

```
/**
 * Eine oeffentliche Methode als Remote-Endpunkt kennzeichnen — ohne
 * Build-Schritt.
 *
 * `Remote` aus `dsh-typert-protocol` ist die oeffentliche Fassung der
 * Standard-Methodendekoratoren: sie bekommt den Methodenwert und einen
 * Dekoratorkontext und traegt die Kennzeichnung ueber dessen `addInitializer`
 * in die Prototyp-Tabelle ein (die kompilierte DSH-Fassung desselben Aufrufs
 * steht in jedem `lib/types/index.js` der DSH-Pakete). Ein ESM-Modul ohne
 * Compiler hat keinen solchen Kontext — also stellt der Aufruf unten genau den
 * Vertrag her, den die Spezifikation vorsieht: ein Empfaengerobjekt, dessen
 * Prototyp die Klasse ist, an dem der Initialisierer laeuft. Mehr braucht die
 * Kennzeichnung nicht; sie ist idempotent und haengt am Prototyp, nicht an
 * einer Instanz.
 * @param {object} prototype - Prototyp der Dienstklasse.
 * @param {string} method - Name der oeffentlichen Methode.
 */
```

## Kanon k-6ba3af2466b5 {#k-6ba3af2466b5}

Fundstellen: packages/codingmon/assets/pet-remote.js:1–32

Volltext des gekürzten Blocks (Stand 2026-10-17):

```
/**
 * pet-remote — die Host-Haelfte der Uebergabe (Client -> Host).
 *
 * WARUM ES DIESE DATEI GIBT: `pet-store.js` legt den Stand dauerhaft ab, aber
 * ein Speicher ohne Absender ist ein leeres Blatt: bis hierher hat NICHTS im
 * Baum je `write` gerufen, und der Spiegel meldete folgerichtig „noch kein
 * Stand". Diese Datei ist der Empfaenger. Sie ist die Host-Seite des
 * Typert-RPC von DSH (api-gateway): ein Cordis-Dienst mit ZWEI als Remote
 * gekennzeichneten Methoden (`writeSnapshot` nimmt an, `readActivity` nennt den
 * Aktivitaetsstand), von denen der Client einen generierten Beitrag mountet
 * und sie ueber den gemeinsamen Carrier ruft.
 *
 * WARUM SRC UND NICHT EIN GENERIERTES HOST-MANIFEST: das Gateway loest einen
 * Endpunkt zuerst aus `ctx.typert.local` (strenge, GENERIERTE Definition) und
 * sonst aus dem Dienst selbst auf („SRC": Name, Parameterliste und
 * `typertRemote`-Bindung des Dienstes). Die zweite Form ist die ehrliche fuer
 * dieses Paket: die strict-Datei ist ein Erzeugnis von
 * `@deepseek-ai/dsh-typert-generator`, den dieses Paket nicht mitbringt, und
 * eine von Hand nachgebaute „generierte" Datei waere eine Fiktion mit
 * Dateinamen. SRC verlangt dafuer weniger: oeffentliche Methode mit einfachen
 * ParameterNamen (das Gateway liest sie aus der Signatur — deshalb steht
 * `writeSnapshot(snapshot)` genau so da und mit einem Parameter, nicht mit
 * einem Objekt), JSON-sichere Werte, und die Bindung aus `TypertRemoteService`.
 * Was SRC NICHT tut, ist den Inhalt pruefen — deshalb prueft der SPIEGEL
 * (`pet-store.js` parst, BEVOR er ein Medium anfasst). GENAU EINE Grenze: eine
 * zweite Pruefung desselben Schemas hier waere eine zweite Wahrheit, und im
 * Test nicht auseinanderzuhalten, weil beide dieselbe Meldung erzeugen.
 *
 * WAS HIER NICHT STEHT: kein Timer, kein Netz, kein Modell, und keine zweite
 * Ablage. Die Methode nimmt einen Stand an, prueft ihn, gibt ihn an den Spiegel
 * weiter und quittiert ihn.
 */
```

## Kanon k-39478e8b79a2 {#k-39478e8b79a2}

Fundstellen: packages/codingmon/assets/pet-store.js:1–35

Volltext des gekürzten Blocks (Stand 2026-10-17):

```
/**
 * pet-store — der DAUERHAFTE Spiegel des Codemon-Stands (Host-Hälfte).
 *
 * WARUM ES DIESE DATEI GIBT: der Spielstand liegt im Browser (`localStorage`,
 * geschrieben bei jeder Mutation in client.js). Er überlebt damit einen Absturz
 * des Node-Prozesses — aber er hängt am BROWSER-Profil. Ist das weg, ist der
 * Grind weg, und der Host hat nie etwas davon gesehen. Diese Datei ist die
 * Host-Seite dieses Spiegels: ein validierter Datensatz auf einem Medium, das
 * der Host selbst besitzt.
 *
 * WARUM `ctx.storageDomain` UND NICHT EINE EIGENE DATEI: das Profil mountet die
 * Storage-Familie bereits (`storage` + `storage-json` mit Wurzel
 * `dshHomePath('storages')` + `storage-domain`). Der Vertrag dieser Familie ist
 * genau der gesuchte: schema-validierte Datensätze, synchrone Reads, ein
 * dauerhafter Write, der erste nach der Medium-Bestaetigung aufloest, ein
 * lesbares JSON je Einheit. Eine zweite Ablage daneben waere ein zweiter
 * Wahrheitsbegriff — und `node:sqlite` waere fuer einen Datensatz dieser Groesse
 * ohnehin das falsche Medium (das JSON-Backend schreibt EINE Datei
 * `codingmon_pet.json` unter `$DSH_HOME/storages`).
 *
 * ABHAENGIGKEITEN (bewusste Entscheidung, nicht Nebenwirkung): `zod` fuer die
 * Datensatz-Schemas (die Domain ruft `parse`/`safeParse` duck-typed, ohne
 * `instanceof`), `@deepseek-ai/dsh-storage-domain` fuer `defineDomain`/
 * `domainTable`. Beide werden NICHT importiert, bevor `apply` sie braucht:
 * dieses Modul wird dynamisch geladen, damit ein reiner Ladetest des Pakets
 * (pack-test) nicht an der Modulaufloesung eines fremden Baums haengt. Zur
 * Laufzeit loest der Host sie ueber seine eigene, gepatchte Aufloesung auf —
 * dieselbe Mechanik, mit der `index.js` Schemastery zieht. `defineDomain`
 * validiert den Namen (`/^[a-z][a-z0-9_]*$/`) beim Laden dieses Moduls, also
 * bevor irgendein Medium angefasst wird.
 *
 * WAS HIER NICHT STEHT: kein Timer, kein Netz, kein Modell, kein Schreibvorgang
 * ausser dem einen Datensatz. Der Store entscheidet nichts und rechnet nichts
 * nach — er nimmt einen Stand an und gibt ihn zurueck.
 */
```

## Kanon k-7489450126b0 {#k-7489450126b0}

Fundstellen: packages/codingmon/assets/snapshot-schema.js:1–19

Volltext des gekürzten Blocks (Stand 2026-10-17):

```
/**
 * snapshot-schema — der Uebergabe-Vertrag (Client -> Host) als Zod-Schema.
 *
 * WARUM ES DIESE DATEI GIBT: der Stand hat zwei Verbraucher mit zwei
 * verschiedenen Grenzen. Der SPIEGEL (`pet-store.js`) legt ihn dauerhaft ab und
 * ergaenzt dabei den Zeitstempel des Schreibvorgangs; der REMOTE-DIENST
 * (`pet-remote.js`) nimmt ihn ueber die Leitung an und muss ihn pruefen, BEVOR
 * etwas auf ein Medium geht. Beide brauchen dieselben Felder mit denselben
 * Grenzen — zweimal getippt wuerden sie driften, und die Drift waere genau an
 * der Stelle, an der ein fremder Wert in die Ablage gelangt.
 *
 * `damageTotal` ist Dezimaltext (`'454'`): JSON kennt kein BigInt, der Client
 * fuehrt den Lebenslauf als BigInt, und eine Ziffernfolge ist im Speicher exakt
 * statt ab 2^53 gerundet.
 *
 * WAS HIER NICHT STEHT: keine Grenze nach zeitlicher Gueltigkeit, kein BigInt,
 * keine Deutung. Unbekannte Felder fallen weg (Zod-Objekt ohne `.passthrough`)
 * — wer mehr schickt als der Vertrag nennt, schickt es ins Leere.
 */
```

## Kanon k-ceb8420c5755 {#k-ceb8420c5755}

Fundstellen: packages/codingmon/assets/uebergabe.js:1–21

Volltext des gekürzten Blocks (Stand 2026-10-17):

```
/**
 * uebergabe — die NAMEN der Naht Client -> Host, an einer Stelle.
 *
 * WARUM ES DIESE DATEI GIBT: der Client spiegelt den Spielstand zum Host, und
 * eine Naht hat Namen, die auf beiden Seiten dieselben sein MUESSEN: Paket,
 * Namespace, Methode, Dienstschluessel und die Feldliste des Vertrags. Diese
 * Namen standen sonst zweimal im Baum (Host in index.js, Client als Literal in
 * client.js), und zwei Wahrheiten driften — genau das, was der Rest dieses
 * Pakets vermeidet.
 *
 * WAS HIER BEWUSST NICHT STEHT: kein Import. Das Client-Bundle ist
 * selbststaendig (es zieht React ueber `require`, nicht ueber `import`) und kann
 * diese Datei deshalb nicht laden; client.js traegt die Namen als Literal und
 * `test/uebergabe.test.mjs` vergleicht beide Seiten Zeichen fuer Zeichen. Die
 * Dopplung bleibt so sichtbar und geprueft statt still.
 *
 * Die Naht selbst ist DSHs Typert-RPC (api-gateway): der Client holt sich den
 * generierten Beitrag ueber `ctx.remote.$mount(contribution)` und ruft die
 * Methode; der Host loest den Endpunkt in seiner Registry auf und ruft den
 * Dienst. Was hier steht, muss in BEIDEN Haelften passen.
 */
```

## Kanon k-c83e791235d1 {#k-c83e791235d1}

Fundstellen: packages/codingmon/client.js:1345–1356

Volltext des gekürzten Blocks (Stand 2026-10-17):

```
    // ENTFERNT (WEG b): `Arena` + `ArenaSide` (`__cm_arena` im Panel `main`)
    // sind ins Dock gezogen (`WildDock`/`DockBattle`) — der Kampf laeuft im
    // Chat-Bereich. `startBattle`, `rest` und `useAbility` bleiben: als
    // Fenster-API und fuer den Dock-Kampf.
    /**
     * ESKALATION: was eine Stufe ausmacht. Die Zahlen stehen formatiert da,
     * weil die Aussage die Zahl ist: Schwelle, Werte und Lohn wachsen
     * multiplikativ (x1,35 je Stufe), und der Lebenslauf steht daneben als
     * BigInt — in Millionenhöhe exakt und nicht gerundet. Der Stellensprung
     * (zwei- auf fuenfstellig) ist damit der Beweis der investierten Zeit und
     * keine Behauptung: er steht als Meilenstein mit Wert und Datum im Log.
     */
```

## Kanon k-8a3e82b5bc53 {#k-8a3e82b5bc53}

Fundstellen: packages/codingmon/client.js:700–718

Volltext des gekürzten Blocks (Stand 2026-10-17):

```
    /**
     * ── Uebergabe (Client -> Host) ─────────────────────────────────────────
     * Der Stand liegt in `localStorage` und haengt damit am BROWSER-Profil: ist
     * das weg, ist der Grind weg. Der Host haelt daneben einen dauerhaften
     * Spiegel (`assets/pet-store.js`), und diese Funktion ist der ABSENDER —
     * sie schickt den Stand ueber den Typert-RPC von DSH an den Host, sofern
     * das Client-Bundle den Beitrag dieses Pakets gemountet hat.
     *
     * Die Namen stehen hier als LITERAL und nicht als Import: dieses Bundle ist
     * selbststaendig (es zieht React ueber `require`, nicht ueber `import`) und
     * kann keine Datei aus `assets/` laden. Quelle ist `assets/uebergabe.js`;
     * `test/uebergabe.test.mjs` vergleicht beide Seiten Zeichen fuer Zeichen,
     * damit die Dopplung nicht STILL driftet.
     *
     * WAS DIESE FUNKTION NICHT TUT: sie wirft nie, sie wartet nie, und sie
     * aendert nie den Spielstand. Ohne gemounteten Beitrag ist der Host schlicht
     * nicht da — dann bleibt alles wie vorher (der Browser haelt den Stand
     * allein), und der Zustand merkt sich die Absage, statt sie zu verschweigen.
     */
```

## Kanon k-10be308a1da3 {#k-10be308a1da3}

Fundstellen: packages/codingmon/client.js:116–129

Volltext des gekürzten Blocks (Stand 2026-10-17):

```
    /**
     * Pixelart, 16x16, ein Zeichen je Pixel. Keine fremden Assets: die
     * Sprites sind hier als Daten authored, damit das Bundle vierteilig
     * bleibt, der Diff lesbar ist und keine Lizenzfrage entsteht.
     *
     * Die zehn Spezies teilen sich DREI Familien — die Form kommt aus der
     * Familie, die Identitaet aus Werten, Faehigkeiten und Farbton. Zehn eigene
     * Matrizen waeren 21 weitere handgezeichnete Sprites; sie werden nicht
     * erfunden, sondern benannt.
     *
     *   .  transparent        o  Outline
     *   a  hell               b  Koerper      c  Schatten
     *   w  Augenweiss         e  Pupille      y  Akzent (Blitz/Horn/Flamme)
     */
```

## Kanon k-a552c23582de {#k-a552c23582de}

Fundstellen: packages/codingmon/client.js:1–27

Volltext des gekürzten Blocks (Stand 2026-10-17):

```
/**
 * @shinon/codingmon — Client-Hälfte (Codemons + Arena).
 *
 * Die Marken-Slots der Sidebar und des Hero haelt @shinon/core: es zeigt dort
 * Shinons gezeichnetes Zeichen (eine Marke, eine Formensprache). Dieser Client
 * besetzt keinen Marken-Slot und gibt auch keine Marke heraus — die Figur
 * bleibt in ihren eigenen Flaechen (Panel, XP-Leiste, Arena). Nach aussen
 * lesbar ist allein der ZUSTAND, ueber eine Fenster-Konvention statt ueber
 * einen Import: `window.__codingmon` mit `state()` (dasselbe Muster wie
 * `window.__mk` bei @shinon/markers, damit Pakete referenzfrei bleiben).
 *
 * ZEHN CODEMONS: Werte, Faehigkeiten und Gegnerauswahl stehen in `SPECIES`,
 * `ABILITIES` und `arenaFor()` — gespiegelt aus der Host-Hälfte in index.js.
 * Der Client haelt keinen eigenen Vertrag: dieselbe Formel, dieselbe Tabelle,
 * dieselbe Reihenfolge. Was hier zusaetzlich lebt, ist ZUSTAND (XP, HP, Runde)
 * und Darstellung.
 *
 * KAMPF: rundenbasiert, ausgeloest durch Klick. Der Challenger waehlt eine
 * Faehigkeit, der Gegner antwortet sofort mit seiner eigenen — kein Timer,
 * kein Autoplay, keine Hintergrundschleife. Wer zuerst schlaegt, entscheidet
 * die AGI (Gleichstand an den Herausforderer). Jede Zahl im Log kommt aus
 * einer reinen Funktion (damage), nicht aus einer Animation.
 *
 * XP: Fortschritt kommt aus erfolgreichen Agent-Completions und Kampfsiegen.
 * Der Host zaehlt erfolgreiche `turn/end`-Ereignisse; der Client liest diesen
 * Zaehler und belohnt neue Completions. Tokenverbrauch hat keinen Einfluss auf XP.
 */
```

## Kanon k-b0f78dc914e1 {#k-b0f78dc914e1}

Fundstellen: packages/codingmon/index.js:84–100

Volltext des gekürzten Blocks (Stand 2026-10-17):

```
  // Fuer die Leiter und das Regelwerk gilt weiter: wer sie braucht, importiert
  // die Named Exports dieses Moduls — dieselbe Quelle, kein Nachbau. Einen
  // SERVICE gibt es nur fuer den Spiegel, und zwar weil er Zustand ist statt
  // Tabelle: der Stand liegt im Browser, der Spiegel liegt hier, und die
  // Uebergabe (Client -> Host) braucht eine Naht, die einen Stand annimmt.
  //
  // `apply` bleibt SYNCHRON, obwohl das Oeffnen des Spiegels es nicht ist:
  // Cordis faesst den Rueckgabewert als Disposer, und der Vertrag des Gates
  // (`export function apply`) ist eine Zusage. Der Zustand des Spiegels steht
  // deshalb in einer EIGENEN Zeile — er kann erst nach dem ersten `await`
  // bekannt sein, und eine Aktivierungszeile, die ihn vorher behauptet, waere
  // geraten.
  // ── Aktivitaet: erfolgreiche Completions (J3) ────────────────────────────
  //
  // `agent/status` beschreibt nur, ob Arbeit laeuft; idle allein ist KEIN
  // Erfolgsbeleg. XP und Fortschritt entstehen ausschliesslich aus einem
  // erfolgreichen `turn/end` auf dem DSH-Carrier (`session/event`).
```

## Kanon k-5c2ed91c33fc {#k-5c2ed91c33fc}

Fundstellen: packages/codingmon/test/animation.test.mjs:2–13

Volltext des gekürzten Blocks (Stand 2026-10-17):

```
/**
 * packages/codingmon/test/animation.test.mjs — die Rendering-Regel als Zusage.
 *
 * EINZELTEST: kein Browser, kein React, kein DSH. Die Regel aus der Review
 * („Panik- und Fluchtanimationen duerfen ausschliesslich `transform` und
 * `opacity` animieren — kein `margin`, `top` oder `left` im Keyframe\") ist eine
 * Eigenschaft des Quelltextes und wird deshalb am Quelltext gehalten, nicht in
 * einem Screenshot. Die Probe ersetzt KEINE Messung im Browser; sie verhindert,
 * dass die Regel still verrottet, sobald eine neue Animation dazukommt.
 *
 * Lauf: `npm run test:codingmon` bzw. `node --test packages/codingmon/test/*.test.mjs`.
 */
```

## Kanon k-92e73217687a {#k-92e73217687a}

Fundstellen: packages/codingmon/test/durchstich.test.mjs:2–19

Volltext des gekürzten Blocks (Stand 2026-10-17):

```
/**
 * packages/codingmon/test/durchstich.test.mjs — der E2E-DURCHSTICH.
 *
 * EIN Durchstich, ganz am Ende, wie im Review gefordert: echter Nutzer-Input
 * (Klick) -> die Sperre des Clients -> der Ergebnis-Wurf -> das DOM-Ereignis ->
 * die CSS-/Anzeige-Schicht. Gefahren wird das ECHTE Client-Bundle in einem
 * vm-Kontext mit Attrappen-Uhr, Attrappen-DOM und fest gesetztem Math.random —
 * kein DSH, kein Browser, kein Modell und keine Installation (der Host-Vertrag
 * kommt aus ../assets/mechanik.js, das ohne Bare-Import laedt).
 *
 * WAS DIE ATTRAPPEN NICHT BEWEISEN (ehrlich): die Wartezeit laeuft in einer
 * Attrappen-Uhr, nicht in einem echten Browser; React, Layout und Compositor
 * sind Attrappen. Bewiesen ist der VERTRAG des Bundles: Sperre, ein Ergebnis je
 * Zug, ein Wurf je Sieg, Host-Spiegel, Persistenz, Meilensteine und Abbau.
 *
 * Die Zusagen des Laufs stehen als Einzelmeldungen im Protokoll; der Test selbst
 * ist EINE Zusage: keine Abweichung.
 */
```

## Kanon k-abeeabc4d60e {#k-abeeabc4d60e}

Fundstellen: packages/codingmon/test/loot.test.mjs:2–12

Volltext des gekürzten Blocks (Stand 2026-10-17):

```
/**
 * packages/codingmon/test/loot.test.mjs — der gewichtete Beutewurf.
 *
 * EINZELTEST: kein DSH, kein Browser, kein Modell, keine Uhr, keine
 * Installation (der Kern laedt ohne Abhaengigkeit). Der Zufall sitzt
 * AUSSCHLIESSLICH im Loot und ist als reine Funktion eines Wertes aus [0,1)
 * gebaut — hier wird die Tabelle deshalb ueber ALLE 10000 Basispunkte
 * abgezaehlt, nicht mit einer Stichprobe „ungefaehr" geprueft.
 *
 * Lauf: `npm run test:codingmon` bzw. `node --test packages/codingmon/test/*.test.mjs`.
 */
```

## Kanon k-a6ba014a7a44 {#k-a6ba014a7a44}

Fundstellen: packages/codingmon/test/regelwerk.test.mjs:2–13

Volltext des gekürzten Blocks (Stand 2026-10-17):

```
/**
 * packages/codingmon/test/regelwerk.test.mjs — der Schaden als Nachschlagewerk.
 *
 * EINZELTEST: kein DSH, kein Browser, kein Modell, keine Uhr, keine Zufalls-
 * quelle — und keine Installation: gefahren wird der KERN
 * (`../assets/mechanik.js`), der keinen Bare-Import hat. Geprueft wird gegen die
 * ROHEN Tabellen (SPECIES, ELEMENTS, CATEGORY, SYNERGY, BUFFS) — die Formel ist
 * hier ein zweites Mal von Hand aufgeschrieben. Waere der Pruefer ein Aufruf von
 * `resolveAttack` gegen sich selbst, bewiese er nichts.
 *
 * Lauf: `npm run test:codingmon` bzw. `node --test packages/codingmon/test/*.test.mjs`.
 */
```

## Kanon k-18f4ff319cf5 {#k-18f4ff319cf5}

Fundstellen: packages/codingmon/test/spawn.test.mjs:2–13

Volltext des gekürzten Blocks (Stand 2026-10-17):

```
/**
 * packages/codingmon/test/spawn.test.mjs — der Wild-Spawn als reine Funktion.
 *
 * WAS HIER BEWIESEN WIRD: die Spawn-Rate haengt an ABGESCHLOSSENEN Schritten
 * (J3), nicht an Tokens, und sie ist deterministisch — derselbe Zaehlerstand
 * ergibt immer dasselbe Wild (oder keines). Daneben die Typwirkung als Zeichen
 * (`effectiveness`): dieselbe Zahl wie in `resolveAttack`, aber mit Symbol statt
 * Tabelle — die Kampfansicht zeigt `×1,5 ▲`, keine Matrix.
 *
 * Reine Mathematik aus `assets/mechanik.js`: laeuft ohne node_modules
 * (CI: `npm run test:codingmon`).
 */
```

## Kanon k-985b9a414f31 {#k-985b9a414f31}

Fundstellen: packages/codingmon/test/sprites.test.mjs:2–18

Volltext des gekürzten Blocks (Stand 2026-10-17):

```
/**
 * packages/codingmon/test/sprites.test.mjs — die 27 Assets als Vertrag.
 *
 * WAS HIER BEWIESEN WIRD (Abschnitt 3a des Auftrags):
 *   1. Jede Spezies hat Vorder- und Rueckseite (20 Gitter aus SPECIES abgeleitet,
 *      nicht gezaehlt — eine elfte Spezies ohne Sprites faellt hier, nicht erst
 *      im Browser).
 *   2. Jedes Gitter ist 32x32, kennt nur die Palette und hoechstens fuenf Farben.
 *   3. Jedes erzeugte SVG ist gueltig (Namensraum, viewBox, mindestens ein
 *      Rechteck) und traegt nur Palettenfarben.
 *   4. Die Einbettung in `client.js` ist deckungsgleich mit den Quelldateien
 *      (`--embed` schreibt, dieser Test vergleicht — keine stille Drift).
 *   5. Die 7 UI-SVGs existieren, sind gueltig und kennen nur `#A855F7`.
 *
 * Reine Dateiarbeit aus `assets/` plus dem Generator: laeuft ohne node_modules
 * (CI: `npm run test:codingmon`).
 */
```

## Kanon k-93b8c0ad1994 {#k-93b8c0ad1994}

Fundstellen: packages/codingmon/test/uebergabe.test.mjs:411–426

Volltext des gekürzten Blocks (Stand 2026-10-17):

```
  // Ein Stand, der den Vertrag verletzt, wird ABGELEHNT und beruehrt das Medium nicht.
  //
  // WAS HIER GEPRUEFT WIRD — UND WAS NICHT (ehrlich): geprueft ist, dass der
  // Aufruf als Fehlerergebnis zurueckkommt UND das Medium unveraendert bleibt.
  // NICHT geprueft ist, WELCHE der Schichten ablehnt: die Schichtung ist echte
  // Tiefenverteidigung mit EINER Schemaquelle (`assets/snapshot-schema.js`) —
  // der Dienst reicht weiter, der Spiegel ergaenzt `storedAt` und prueft, und
  // die deklarierte Tabelle der Domain prueft beim Ablegen noch einmal. Eine
  // Probe, die eine dieser Pruefungen entfernt, bleibt deshalb gruen; das ist
  // Absicht und keine Luecke. Die Zusage des Vertrags selbst haelt
  // `scripts/gate/tests/codingmon-store.test.mjs` fest.
  // Grundlage ist ein WIRKLICH uebertragbarer Stand: der zuletzt angenommene
  // Datensatz vom Medium. `window.__codingmon.state()` taugt dafuer NICHT — es
  // fuehrt `damageTotal` als BigInt (das JSON nicht kennt), und ein Aufruf damit
  // scheiterte schon an der Serialisierung. Genau so entsteht eine Zusage, die
  // gruen ist, ohne etwas zu beweisen.
```

## Kanon k-2c76177d02de {#k-2c76177d02de}

Fundstellen: packages/codingmon/test/uebergabe.test.mjs:208–220

Volltext des gekürzten Blocks (Stand 2026-10-17):

```
/**
 * Der Ereignisstrom der Verbindung. Die Client-Seite oeffnet `$events` als
 * GENERATION; ein Strom, der sofort endet, waere eine Generation, die sofort
 * stirbt und den Ruecklauf neu startet. Also liefert der Traeger die Eroeffnung
 * (`{ type: 'ready', clientId, host: { home } }`, genau diese Schluessel) und
 * bleibt offen, bis der Client abbricht — das ist das Verhalten, das die
 * Dokumentation des Gateways dem In-Process-Carrier zuschreibt.
 *
 * Was dieser Traeger NICHT kann: ausgewaehlte Anwendungsereignisse liefern. Die
 * Ereignis-Auswahl gehoert api-remotes, das hier nicht montiert ist, und dieser
 * Test fahrt einen unary-Aufruf.
 * @param {AbortSignal} signal - Abbruch der Generation durch den Client.
 */
```

## Kanon k-0b296a4baf7a {#k-0b296a4baf7a}

Fundstellen: packages/codingmon/test/uebergabe.test.mjs:2–41

Volltext des gekürzten Blocks (Stand 2026-10-17):

```
/**
 * packages/codingmon/test/uebergabe.test.mjs — der Durchstich der UEBERGABE
 * (Client -> Host).
 *
 * WAS HIER BEWIESEN WIRD: der Spielstand des BROWSERS erreicht den HOST und
 * liegt danach dauerhaft auf einem Medium, das der Host besitzt. Gefahren wird
 * das nicht gegen Attrappen, sondern gegen die ECHTEN Bausteine der
 * installierten DSH-Fassung in EINEM Prozess:
 *
 *   Client-Seite                        Host-Seite
 *   ─────────────                       ───────────
 *   echter Cordis-Root                  echter Cordis-Root
 *   ctx.typert  (TypertRegistry)        ctx.typert  (TypertRegistry)
 *   ctx.connection  <- installConnection ctx.connection (Carrier-Gegenstelle)
 *   ctx.remote      <- api-gateway       ctx.typertGateway <- api-gateway
 *   ctx.remote.$mount(Beitrag)           CodingmonRemote (unser Dienst)
 *                                        pet-store -> storage-json -> Datei
 *
 * Das BINDEGLIED ist der IN-PROCESS-CARRIER: DSHs Client-Verbindung nimmt einen
 * `transport.rpc` entgegen (`installConnection(ctx, { transport })`, im Browser
 * ueber `globalThis.__DSH_TRANSPORT__`), und `ctx.connection.rpc.open` bzw.
 * `call` ist genau der Weg, den das Gateway auf der Client-Seite bevorzugt
 * („an in-process Connection carrier provides equivalent streams directly
 * without opening [the WebSocket]"). Hier wird dieser Traeger gestellt: `call`
 * reicht den Aufruf an den Interceptor weiter, den das ECHTE Gateway auf
 * `/api` registriert hat. Kein WebSocket, kein Browser, kein HTTP.
 *
 * WAS DIESER TEST NICHT BEWEIST (ehrlich): es laeuft keine echte
 * Browser-Assembly. Im AUSGELIEFERTEN Client waehlt eine kompilierte Liste in
 * `@deepseek-ai/dsh-api-remotes` die Beitraege aus, und DIESES Paket steht nicht
 * darauf — der Beitrag muss also erst von einer Client-Composition ausgewaehlt
 * werden (eine Zeile dort, ausserhalb dieses Forks). Was hier bewiesen ist, ist
 * die Naht selbst: der Beitrag ist mountbar, das Gateway nimmt ihn an, der Aufruf
 * landet im Dienst, der Stand liegt danach validiert auf der Platte, und ein
 * Vertragsbruch wird abgelehnt, ohne das Medium anzufassen.
 *
 * Lauf mit `node --test` (CI: .github/workflows/commit-guard.yml). Fehlt die
 * DSH-Abhaengigkeit (kein node_modules, wie in CI), wird der Test SICHTBAR
 * uebersprungen statt rot zu werden.
 */
```

## Kanon k-fab6cedebe07 {#k-fab6cedebe07}

Fundstellen: packages/core/client.js:1–17

Volltext des gekürzten Blocks (Stand 2026-10-17):

```
/**
 * shinon-core — Branding-Overlay (Client-Hälfte).
 *
 * Ersetzt DeepSeeks Marke in der Sidebar und im Hero. Die Official-Brand
 * (@deepseek-ai/dsh-client-ui-brand-official) ist im Profil deaktiviert, weil
 * `sidebar.brand.mark` / `sidebar.brand.name` / `conversation.hero.brand.mark`
 * Single-Slots sind: genau ein Besetzer.
 *
 * Abgeleitet aus @deepseek-ai/dsh-client-ui-brand-official (DSH-eigenes Muster):
 *   - factory(require) bekommt CommonJS-require; React aus 'react'.
 *   - ctx.slots.inject(<slot>, …) wartet auf den deklarierten Slot.
 *   - Styles als <style data-plugin-css>, kein 'styles'-Service.
 *   - Das Bundle ist SELF-CONTAINED: kein top-level `import`, denn der
 *     __ModuleLoader__ lädt klassische Scripts (kein ES-Modul).
 *
 * Die Marke ist ein eigener SVG-Pfad (weibliche Cyberpunk-Persona), kein Fremdlogo.
 */
```

## Kanon k-2812e8832d65 {#k-2812e8832d65}

Fundstellen: packages/dashboard/client.js:1–32

Volltext des gekürzten Blocks (Stand 2026-10-17):

```
/**
 * shinon-dashboard - Dashboard UI (Client-Hälfte).
 *
 * DAS FENSTER ZUR SICHTBARKEIT: was laeuft, steht hier. Jede Client-Haelfte
 * meldet sich in `window.__shinonPlugins` an (Konvention, kein Import — Pakete
 * bleiben referenzfrei) und schickt dazu ein `shinon:plugin`-Ereignis. Dieses
 * Panel liest die Liste und stellt sie gegen die ERWARTETEN Bundles: ein
 * erwartetes Plugin, das sich nicht meldet, steht als STILL da und nicht als
 * fehlende Zeile. Genau das ist der Unterschied zwischen „laeuft" und „sieht
 * so aus, als laufe es".
 *
 * `EXPECTED` spiegelt `profiles/shinon/package.json` (`dsh.profile.bundles`) —
 * die eine Quelle steht dort, der Browser kann sie nicht lesen. Deshalb ist
 * jede Abweichung hier sichtbar statt still: ein Bundle, das im Profil steht
 * und sich nicht meldet, faellt auf; ein Bundle, das sich meldet und nicht im
 * Profil steht (openapi), ist als inaktiv gekennzeichnet.
 *
 * WORKSPACES UND SITZUNGEN (gemessen, docs/probes/workspace-list.json): der
 * Host haelt die Liste in `ctx.workspaceRegistry` (dsh-workspace). In den
 * Browser kommt sie nicht ueber diesen Registry-Dienst, sondern ueber die
 * Client-Haelfte von dsh-api-workspace-controller: die registriert den Dienst
 * `workspaces` (WorkspaceController, `.list` ist der ClientWorkspaceModel) und
 * `sessions` ist der Sitzungskatalog (ClientSessions, `.list` mit `byId`).
 * Beide haben die ObservableSnapshot-Form der Client-Dienste - getSnapshot()
 * liefert den Wert, subscribe() meldet Aenderungen - und genau so werden sie
 * hier gelesen. Dieses Panel zeigt sie NUR: es legt keinen Workspace an,
 * benennt nichts um und heftet/archiviert nichts.
 *
 * 'main' ist ein keyed-Slot (options.key) und die Sidebar-Leiste
 * 'sidebar.panellist' eine list (options.id) - ohne diesen Eintrag wäre das
 * Panel nicht erreichbar.
 */
```

## Kanon k-7eff35fa4f9f {#k-7eff35fa4f9f}

Fundstellen: packages/events/client.js:1–11

Volltext des gekürzten Blocks (Stand 2026-10-17):

```
/**
 * @shinon/events — Client-Hälfte.
 *
 * Der Hook/Event-Spine lebt im Host: er beobachtet dort die DSH-Signale. Im
 * Client gibt es nichts zu besetzen — dieser Platzhalter existiert, weil der
 * Bundle-Vertrag genau vier Dateien verlangt und der Client-Loader eine
 * Registrierung mit der Contract-id erwartet.
 *
 * Ein späteres @shinon/brand-state darf hier andocken (Persona-State →
 * Animation), aber erst, wenn es echte Events zu zeigen gibt.
 */
```

## Kanon k-5029c455e3a2 {#k-5029c455e3a2}

Fundstellen: packages/events/index.js:5–36

Volltext des gekürzten Blocks (Stand 2026-10-17):

```
/**
 * @shinon/events — Wave 2: Shinon Hook/Event Spine.
 *
 * Rolle: beobachten, normalisieren, validieren, emittieren. Mehr nicht.
 *
 *   DSH-Signal → Normalisierung → Contract-Gate → Emission
 *                    │                 │
 *                    │                 └─ ungültig ⇒ VERWERFEN (fail-closed für das Event)
 *                    └─ niemals eine Aktion, niemals ein Schreibzugriff, niemals ein Modell
 *
 * Zwei Fail-Richtungen, bewusst getrennt (DOKI-Prinzip):
 *   - fail-closed für das EVENT: ein Event, das den Contract verletzt, wird nie emittiert.
 *   - fail-open für den HOST: die Beobachtung darf den beobachteten Prozess nie blockieren
 *     (kein Throw aus einem Handler heraus, kein Absturz bei fehlendem Signal).
 *
 * Der Spine ist ein Durchleiter, keine Autorität (`authority: NONE` im Vertrag).
 * Er darf keinen State setzen, keine Datei schreiben, kein Netz und kein Modell aufrufen.
 * Das Gate prüft genau diese Grenze statisch (scripts/gate/plugins/events-spine.mjs).
 *
 * Drei Ausgänge, bewusst getrennt:
 *   EMITTIERT  — der Typ steht in der typeMap (oder auf einem shinon/*-Signal).
 *   IGNORIERT  — der Typ steht in carrier.ignoredTypes: bekannt, bewusst nicht
 *                modelliert. Kein Ereignis, kein onDrop, keine Warnung; gezählt
 *                in stats.ignored/ignoredTypes. DSH emittiert Dutzende Typen
 *                (approval/*, compaction/*, ptc-dispatch/*, …), die niemand
 *                abbilden will — als UNKNOWN_SIGNAL würden sie das Log fluten.
 *   VERWORFEN  — alles andere: unbekannt oder vertragsbrüchig, fail-closed.
 * Ein NEUER DSH-Typ ist nicht ignoriert und warnt deshalb weiter.
 *
 * Der Vertrag selbst liegt als Daten in ./assets/event-spine.json — nicht im Code.
 * Ein neuer Event-Typ ist damit zuerst eine Datenänderung, kein Code-Umbau.
 */
```

## Kanon k-00acdc929186 {#k-00acdc929186}

Fundstellen: packages/hook/index.js:82–96

Volltext des gekürzten Blocks (Stand 2026-10-17):

```
/**
 * Event-Schema: die erzeugten Datensätze und ihre acht Vertragsfelder.
 *
 * Das Schema IST der Envelope-Contract-Gate — es validiert und wirft
 * `ValidationError`.
 *
 * `required()` trägt diese Zusage: in Schemastery sind Objekt-Schlüssel
 * **optional**. Ohne `required()` lieferte `normalizeEvent({})` hier ein
 * Ergebnis statt eines Fehlers — `{"payload_ref": ""}` —, ein hohler Datensatz
 * hätte den Gate also passiert. Das ist geschlossen.
 *
 * `payload_ref` behält seinen `.default('')`: der Vertrag aus Wave 2 erklärt
 * das Feld ausdrücklich als vorbelegt, und das ist eine andere Zusage als
 * "Pflichtfeld".
 */
```

## Kanon k-e614774c8c2f {#k-e614774c8c2f}

Fundstellen: packages/hook/index.js:4–42

Volltext des gekürzten Blocks (Stand 2026-10-17):

```
/**
 * shinon-hook — der echte DSH-Entry-Point von Shinon (Phase 1).
 *
 * Die frühere Observer-Simulation ist ersetzt: `observe()` registrierte nichts,
 * sondern protokollierte nur. Der Hook registriert jetzt einen echten
 * Waterfall-Listener auf `agent/pre-step` und reicht den Schritt kontrolliert
 * durch.
 *
 * Verifizierte Grundlage — installiertes DSH 0.2.0-rc.2, nichts davon geraten:
 *
 *   Signatur   @deepseek-ai/dsh-agent/lib/types/runtime-types.d.ts
 *              'agent/pre-step'(this: Scoped<Agent>, payload: {
 *                agent: Agent; messages: UserMessage[]; turn: number;
 *                step: number; signal: AbortSignal;
 *              }, next: () => Promise<PreStepDecision>): Promise<PreStepDecision>
 *              @mode waterfall
 *   Entscheidung  type PreStepDecision =
 *                 { kind: 'reject' } | { kind: 'enter'; messages; startsRequestSeries? }
 *   Weitergabe    „Calling `next()` preserves the current messages."
 *   Dispatch      @deepseek-ai/dsh-agent-loop/lib/index.js fährt den Waterfall mit
 *                 dem Default-Downstream { kind: 'enter', messages }; `agent` wird
 *                 vom fused Dispatcher (@deepseek-ai/dsh-agent, `agentEvents`) in
 *                 die Nutzlast injiziert.
 *   Lifecycle     ctx.on liefert einen Disposer; apply() gibt ihn zurück.
 *   Referenz      @deepseek-ai/dsh-hooks-claude-code bindet genau diesen Seam
 *                 app-weit und lehnt einen Schritt mit { kind: 'reject' } ab.
 *
 * Verantwortungsgrenze: registrieren, Lifecycle, Korrelation, kontrollierte
 * Weitergabe. KEINE Prompt-Logik, kein SQLite, keine Goal-Schleife, kein
 * Browser, keine Persona.
 *
 * Zwei Fail-Richtungen, bewusst getrennt (dieselbe DOKI-Grenze wie im
 * Event-Spine): fail-closed für den DATENSATZ — ein Schritt, der den Vertrag
 * verletzt, wird nie als Trace emittiert; fail-open für den HOST — die
 * Beobachtung darf den beobachteten Prozess nie blockieren. Eine Nutzlast, die
 * wir nicht verstehen, wird deshalb laut protokolliert und durchgereicht.
 * `onContractViolation: 'reject'` kehrt genau das um — eine bewusste
 * Einstellung, kein stiller Fallback.
 */
```

## Kanon k-822a3b1508c4 {#k-822a3b1508c4}

Fundstellen: packages/hook/test/replay.test.mjs:2–20

Volltext des gekürzten Blocks (Stand 2026-10-17):

```
/**
 * packages/hook/test/replay.test.mjs — die zwei Zusagen, die der Host-Test nicht abdeckt.
 *
 * Der Verhaltensvertrag des Hooks (echter Waterfall, Durchreichen, Korrelation,
 * Absage, Lifecycle) steht in scripts/gate/tests/hook-pre-step.test.mjs und wird
 * dort gegen echtes Cordis gefahren. Hier bleibt nur, was dort nicht hingehört:
 *
 *   1. Die Replay-Fixture bleibt ein gültiges, in sich stimmiges Orakel des
 *      Wave-2-Event-Vokabulars — sie soll nicht still verrotten.
 *   2. Die Client-Hälfte ist ein LADBARES Cordis-Plugin. Das ist eine echte
 *      Bruchstelle: ein Datenobjekt ohne apply() reißt den GESAMTEN Client-Boot
 *      der Web-UI ab, weil der Loader alle Einträge in einem Promise.all mountet.
 *      Statisch prüft das bisher niemand (siehe Probe hook-client-plugin-shape).
 *
 * Was hier bewusst NICHT mehr steht: String-Inspektion von index.js. Sie war
 * implementierungsgekoppelt (sie prüfte z. B. das Vorhandensein von
 * `EventSchema.safeParse`, einer Schemastery-API, die es nicht gibt) und
 * bewies Verhalten nur scheinbar. Dieses Feld gehört dem ausführbaren Vertrag.
 */
```

## Kanon k-3151d0b41c2a {#k-3151d0b41c2a}

Fundstellen: packages/key-router/assets/pool-core.js:335–345

Volltext des gekürzten Blocks (Stand 2026-10-17):

```
/**
 * Die Anfrage des Verbindungstests: die Modelle des Anbieters abfragen.
 *
 * Zurück kommt ein BESCHREIBUNGSOBJEKT — `url`, `method`, `headers`. Der Kopf
 * trägt den Schlüssel, alles andere ist öffentlich; der Aufrufer darf `url` und
 * `method` protokollieren und die Kopfzeilen nicht.
 *
 * @param provider - { baseUrl, probePath }.
 * @param key - der Schlüsselwert.
 * @param probePath - Rückfall, wenn der Anbieter keinen eigenen Pfad nennt.
 */
```

## Kanon k-45cb09b9a337 {#k-45cb09b9a337}

Fundstellen: packages/key-router/assets/pool-core.js:296–307

Volltext des gekürzten Blocks (Stand 2026-10-17):

```
/**
 * Jedes Vorkommen von Schlüsselmaterial aus einem Text entfernen — der Filter,
 * durch den JEDER Log-Eintrag dieses Pakets geht.
 *
 * Ersetzt wird die ganze Zeichenfolge, nicht ein Präfix: eine Meldung mit
 * `sk-abc…` ist so brauchbar wie die mit dem ganzen Schlüssel. Gesucht wird auch
 * in zusammengesetzten Texten, weil ein Fehlerobjekt seinen Eingabe-Wert mit
 * sich führen kann.
 *
 * @param text - der Text (oder ein beliebiger Wert; er wird zu Text).
 * @param secrets - die Werte, die nicht erscheinen dürfen.
 */
```

## Kanon k-b3798f386737 {#k-b3798f386737}

Fundstellen: packages/key-router/assets/pool-core.js:229–240

Volltext des gekürzten Blocks (Stand 2026-10-17):

```
/**
 * Den nächsten Platz wählen: der mit den wenigsten Fehlschlägen unter den
 * verfügbaren. Ist keiner verfügbar, gewinnt der, dessen Cooldown zuerst endet.
 *
 * `force` überspringt die Bevorzugung nach Fehlschlägen — eine erzwungene
 * Rotation soll den Platz WECHSELN, sonst dreht sie sich im Kreis.
 *
 * @param entries - der Pool.
 * @param now - Zeitstempel in ms.
 * @param force - erzwingt einen anderen Platz, wenn es einen gibt.
 * @param activeLabel - der zuletzt benutzte Platz (für `force`).
 */
```

## Kanon k-2ed2ae9919fc {#k-2ed2ae9919fc}

Fundstellen: packages/key-router/assets/pool-core.js:182–193

Volltext des gekürzten Blocks (Stand 2026-10-17):

```
/**
 * Die Werte zu den NAMEN aus der Umgebung lesen — der einzige Bezug von
 * Schlüsselmaterial in diesem Paket.
 *
 * `names` sind ausdrückliche Namen, `prefix` sammelt zusätzlich `<prefix>_*`.
 * Eine Config kann KEINEN Schlüssel tragen: das Schema dieses Pakets hat kein
 * Feld dafür (`scripts/gate/tests/key-router-security.test.mjs` prüft das am
 * Schema, nicht an der Absicht) — eine Profildatei ist versioniert.
 *
 * @param env - die Umgebung (ein Objekt, damit der Test sie stellen kann).
 * @param options - { names, prefix }.
 */
```

## Kanon k-8eba23c96bba {#k-8eba23c96bba}

Fundstellen: packages/key-router/assets/pool-core.js:159–171

Volltext des gekürzten Blocks (Stand 2026-10-17):

```
/**
 * Eine fehlgeschlagene Anfrage lesen — der einzige Auslöser der Rotation.
 *
 * Gezählt wird NUR die stabile Klasse `RATE_LIMIT` (die Taxonomie des Harness,
 * gemessen in `@deepseek-ai/dsh-llm`: „route on this, never by parsing
 * `message`"), und nur für einen benannten Anbieter. Alles andere — Timeouts,
 * Abbrüche, Auth-Fehler, namenlose Nutzdaten — ist kein Grund zum Wechseln: ein
 * falscher Wechsel bei einem kaputten Schlüssel würde den gesunden Pool
 * für einen toten Anbieter leeren.
 *
 * @param payload - die Nutzdaten von `agent/request-error`.
 * @returns `{ provider }` oder null.
 */
```

## Kanon k-8e61ae3a6e32 {#k-8e61ae3a6e32}

Fundstellen: packages/key-router/assets/pool-core.js:118–134

Volltext des gekürzten Blocks (Stand 2026-10-17):

```
/**
 * Die Klammer um `resolve`: bedient die verwalteten Referenzen aus dem Pool,
 * gibt alles andere an das Original weiter.
 *
 * Drei Zusagen, alle prüfbar: (1) Eine Referenz, die nicht verwaltet wird, erreicht
 * das Original unverändert — derselbe Aufruf, dasselbe Ergebnis. (2) Eine
 * verwaltete Referenz ohne Pool (leer, kein Eintrag wählbar) fällt auf das
 * Original zurück — der Router behauptet nie einen Schlüssel, den er nicht hat.
 * (3) `restore()` baut die Klammer ab; danach sieht der Dienst wieder genau so
 * aus wie vorher. Was `select` zurückgibt (`{ key }`), verlässt das Paket nur in
 * Richtung des fragenden Anbieters — derselbe einzige Ausgang wie die Kopfzeilen
 * des Verbindungstests.
 *
 * @param service - der `credentials`-Dienst (oder etwas, das so aussieht).
 * @param options - { managed: [Namen], select: (name) => Eintrag|null }.
 * @returns `{ restore, names }` oder null, wenn es nichts zu klammern gibt.
 */
```

## Kanon k-03e87e2a2faf {#k-03e87e2a2faf}

Fundstellen: packages/key-router/assets/pool-core.js:83–93

Volltext des gekürzten Blocks (Stand 2026-10-17):

```
/**
 * Werte zu ausdrücklichen Namen aus der Startumgebung lesen.
 *
 * `launch` ist die Naht (`ctx.get('launchEnvironment')`, drei Schichten: Prozess,
 * Projekt-`.env`, Benutzer-`.env`) — oder fehlt, dann gilt nichts. Die Form ist
 * absichtlich schmal (`{ get(name) }`): was DSH dort liefert (`{ value, source }`)
 * und was ein Stub liefert, liest sich gleich.
 *
 * @param launch - die Startumgebung oder nichts.
 * @param names - die ausdrücklichen Namen, in Reihenfolge.
 */
```

## Kanon k-10eea7afa416 {#k-10eea7afa416}

Fundstellen: packages/key-router/assets/pool-core.js:63–81

Volltext des gekürzten Blocks (Stand 2026-10-17):

```
// ── Override: die Übergabe an den Lauf ───────────────────────────────────────
//
// Die Mechanik, mit der der Pool die Route erreicht (PLAN.md §3.12). Gemessen am
// installierten Harness (0.2.1-alpha.1), nicht geraten:
//
//   - Die Route (`agnes`, `apiKeyEnv: AGNES_API_KEY`) löst ihren Schlüssel pro
//     Aufruf über `ctx.get("credentials").resolve(ref)` auf; fehlt der Dienst,
//     gilt die Startumgebung. Der Aufruf ist eine Funktion, kein Wert — jeder
//     neue Aufruf sieht den aktuellen Poolstand.
//   - Eine fehlgeschlagene Anfrage läuft als Middleware über
//     `agent/request-error` (Nutzdaten: provider, failure mit stabilem
//     `code`, z. B. `RATE_LIMIT` bei 429); wer dort nur beobachtet und `next()`
//     weitergibt, ändert nichts am Wiederholungsverhalten — das gehört
//     `llm-retry`.
//
// Der Override ist deshalb eine Klammer um genau EINE Methode (`resolve`), die
// genau die Referenzen bedient, die das Profil nennt, und alles andere an das
// Original weitergibt. Kein Schreiben in den Tresor (kein
// Persistenz-Rauschen bei jeder Rotation), kein eigener Wiederholungs-Entscheid.
```

## Kanon k-89d13e2c5858 {#k-89d13e2c5858}

Fundstellen: packages/key-router/assets/pool-core.js:1–30

Volltext des gekürzten Blocks (Stand 2026-10-17):

```
/**
 * @shinon/key-router — reiner Kern (assets/pool-core.js).
 *
 * KEINE Imports: nur dann läuft der Test in CI ohne `node_modules` — dieselbe
 * Regel wie bei `@shinon/scoring` (scoring-core.js), `@shinon/popup`
 * (trajectory-core.js) und `@shinon/prompter` (note-core.js). `index.js`
 * re-exportiert, was die Host-Hälfte braucht; die Namen bleiben dieselben.
 *
 * DIE SICHERHEITSREGEL IST HIER MECHANIK, NICHT EINE ZUSAGE IM KOMMENTAR:
 * Schlüsselmaterial verlässt diesen Kern nur auf ZWEI Wegen —
 *
 *   1. `buildProbeRequest()` legt es in den `Authorization`-Kopf. Das ist der
 *      einzige Ort, an dem es das darf: Kopfzeilen gehen an den Anbieter, nicht
 *      in eine Antwort.
 *   2. `redact()` entfernt es aus Text, der geloggt wird.
 *
 * Alles andere, was nach außen geht — `statusOf()`, die Werkzeug-Ergebnisse,
 * jeder Log-Eintrag — trägt die BESCHRIFTUNG des Poolplatzes (`key#1`, `key#2`)
 * und niemals den Schlüssel. Der Grund ist gemessen und nicht theoretisch: was
 * ein Werkzeug zurückgibt, landet im Kontext des Modells und damit in der
 * Transkription der Sitzung; ein „Key-Präfix zur Wiedererkennung" ist dort ein
 * Leck, kein Komfort. Die Reihenfolge des Pools ist der Ausweis (die Namen kommen
 * aus der Umgebung) — mehr braucht ein Mensch nicht, um einen Platz zu benennen.
 *
 * WARUM DAS ÜBERHAUPT EINE DATEI IST: die Backoff-Rechnung und die Auswahl waren
 * vorher mit einer echten Uhr (`Date.now()`) und echtem Zufall (`Math.random()`)
 * verwoben; damit war jeder Test eine Wahrscheinlichkeitsaussage über einen
 * Zeitpunkt. Hier kommen Uhr und Zufall als ARGUMENTE herein, und das Verhalten
 * ist nachrechenbar.
 */
```

## Kanon k-d1e6b11e02d7 {#k-d1e6b11e02d7}

Fundstellen: packages/key-router/client.js:1–21

Volltext des gekürzten Blocks (Stand 2026-10-17):

```
/**
 * @shinon/key-router — Client-Hälfte: SICHTBARKEIT (kein Panel).
 *
 * WAS HIER VORHER STAND war eine Fassade: ein `<style>`-Block mit Regeln für
 * `.key-router-status`, `.key-router-dot.active`, `.cooling`, `.exhausted` — und
 * keine einzige Stelle, die eines dieser Elemente gerendert hätte. Eine
 * Oberfläche, die Klassen definiert, die niemand benutzt, ist von einer kaputten
 * nicht zu unterscheiden. Ersetzt durch das, was wirklich da ist.
 *
 * WARUM ES KEIN PANEL GIBT (gemessen, nicht bequem): der Zustand des Pools lebt
 * in der HOST-Hälfte. Ein Out-of-Tree-Bundle kann keinen Host-Endpunkt
 * registrieren — die Remote-Beiträge der Browser-Hälfte kommen aus einer
 * kompilierten Liste in `@deepseek-ai/dsh-api-remotes`, und die Connection-Naht
 * ist reines Anfrage/Antwort ohne Abo. `@shinon/popup` löst dasselbe Problem,
 * indem es die SITZUNG liest; einen Pool gibt es dort nicht. Der Status ist
 * deshalb ein Werkzeug des Hosts (`key_router_status`) — und ein Panel, das diese
 * Zahl nur behaupten könnte, wird nicht gebaut.
 *
 * Was bleibt: ein Eintrag in `__shinon_plugins` und eine Zeile in der
 * Sidebar-Liste. Beide behaupten nichts über eine Oberfläche, die es nicht gibt.
 */
```

## Kanon k-947b86581950 {#k-947b86581950}

Fundstellen: packages/key-router/index.js:131–143

Volltext des gekürzten Blocks (Stand 2026-10-17):

```
/**
 * Einen Pool aus der STARTUMGEBUNG bauen — nicht aus `process.env` allein.
 *
 * Der gemessene Grund: `.env` liegt nicht im Prozess, sondern in den Schichten
 * der Startumgebung (`ctx.get('launchEnvironment')`: Prozess, Projekt-`.env`,
 * Benutzer-`.env`). Wer nur `process.env` liest, findet den Schlüssel aus der
 * Datei nicht — genau so stand der Pool im echten Boot leer. Die ausdrücklichen
 * Namen kommen aus allen Schichten (fehlt die Naht, gilt `process.env`); der
 * Präfix-Scan kann nur den Prozess aufzählen (die Momentaufnahme zählt nicht auf)
 * und bleibt dort.
 *
 * Leer ist ein Befund, kein Fehler.
 */
```

## Kanon k-726d03a69335 {#k-726d03a69335}

Fundstellen: packages/key-router/index.js:1–46

Volltext des gekürzten Blocks (Stand 2026-10-17):

```
/**
 * @shinon/key-router — Multi-API-Key-Pool mit 429-Rotation (Host-Hälfte).
 *
 * ARCHITEKTUR
 *   Startumgebung ──▶ Pool (je Anbieter) ──▶ Auswahl ──┬─▶ Werkzeuge
 *       (alle 3 Schichten)                             │
 *                                                      ├─▶ Verbindungstest (Kopfzeilen)
 *                                                      └─▶ OVERRIDE: `credentials.resolve(ref)`
 *                                                          bedient die verwalteten Referenzen
 *                                                          aus dem Pool
 *
 * Beim 429 wird ein Platz gedeckelt (`initialDelayMs` → `maxDelayMs`,
 * exponentiell); ein erfolgreicher Lauf baut die Schuld wieder ab. Die Rechnung
 * steht in `assets/pool-core.js` — importfrei und damit in CI testbar; `index.js`
 * ist die Naht zum Lauf (Umgebung, Werkzeuge, Override, Log).
 *
 * DER SICHERHEITSVERTRAG (drei Zusagen, jede an einer Stelle prüfbar):
 *
 *   1. DAS SCHEMA TRÄGT KEIN SCHLÜSSELFELD. Eine Profildatei ist versioniert;
 *      ein Schlüssel darin wäre ein Leck mit Ansage. Die Namen kommen aus der
 *      Umgebung (`envNames`, `envPrefix`) — nur die NAMEN stehen in der Config.
 *   2. NACH AUSSEN GEHT NUR DIE BESCHRIFTUNG DES PLATZES (`key#1`, `key#2`),
 *      niemals ein Präfix des Schlüssels. Der Grund ist gemessen: was ein
 *      Werkzeug zurückgibt, landet im Kontext des Modells und in der
 *      Sitzungstranskription. Ein „Präfix zur Wiedererkennung" ist dort ein
 *      Leck, kein Komfort — Schlüsselmaterial ist ganz oder gar nicht geheim.
 *      (Der Zustand VOR dieser Änderung gab `key.slice(0, 8) + '…'` aus drei
 *      Werkzeugen und in jede Log-Zeile.)
 *   3. JEDER LOG-EINTRAG GEHT DURCH `redact(...)`. Ein Fehlerobjekt kann den
 *      Eingabewert tragen; die Umgebungsvariable kann in einer Meldung stehen.
 *      Damit ist die Zusage eine Funktion und keine Absicht.
 *
 * DER OVERRIDE (PLAN.md §3.12): DSH einen rotierenden Schlüssel geben.
 *
 * Gemessen am installierten Harness, nicht geraten: die Route löst ihren Schlüssel
 * pro Aufruf über `ctx.get("credentials").resolve(ref)` auf (fehlt der Dienst, gilt
 * die Startumgebung), und eine fehlgeschlagene Anfrage läuft als Middleware über
 * `agent/request-error` (Nutzdaten: provider, failure mit stabilem `code`). Darauf
 * steht die Klammer: sie bedient genau die Referenzen, die das Profil als
 * `envNames` nennt, aus dem Pool — alles andere erreicht das Original unverändert
 * (`createResolveOverlay` in pool-core.js, drei Zusagen). Die 429-Beobachtung ruft
 * nur `next()` weiter und trifft keine Wiederholungs-Entscheidung — das gehört
 * `llm-retry`. Was dabei NICHT gemessen ist: eine echte 429-Rotation gegen die
 * laufende Route (dafür bräuchte es zwei echte Schlüssel und einen erzwungenen
 * 429 in dieser Umgebung). Benannt in docs/ZAHLEN.md §4, nicht behauptet.
 */
```

## Kanon k-a2ba73f0ea2e {#k-a2ba73f0ea2e}

Fundstellen: packages/key-router/test/pool-core.test.mjs:2–18

Volltext des gekürzten Blocks (Stand 2026-10-17):

```
/**
 * Key-Router-Kern — ohne DSH, ohne Netz, ohne Modell, ohne node_modules.
 *
 * Belegt wird, was der Kern VERSPRICHT:
 *
 *   - Die Wartezeit wächst exponentiell, ist gedeckelt und mit gestelltem Zufall
 *     nachrechenbar (der erste Fehlschlag wartet `initialDelayMs`, nicht das
 *     Doppelte).
 *   - Ausgewählt wird der Platz mit den wenigsten Fehlschlägen unter den
 *     verfügbaren; sind alle im Cooldown, gewinnt der früheste.
 *   - `force` WECHSELT den Platz (sonst dreht eine erzwungene Rotation im Kreis).
 *   - Nach außen geht NUR die Beschriftung (`key#N`): `statusOf` trägt kein
 *     Schlüsselmaterial, `redact` entfernt es aus jedem Text, und `buildProbeRequest`
 *     setzt es ausschließlich in die Kopfzeilen.
 *
 * Läuft mit `node --test` (`npm test`) — kein DSH, kein node_modules.
 */
```

## Kanon k-d316f8fedd75 {#k-d316f8fedd75}

Fundstellen: packages/markers/client.js:1–22

Volltext des gekürzten Blocks (Stand 2026-10-17):

```
/**
 * shinon-markers — der Marker-Spiegel (Client-Hälfte).
 *
 * Spiegel des Element-Marker-Systems aus brutalord-the-feral-cycle
 * (tools/preview/marker-core.js + marker.js). Dort hängt ein CDP-Daemon den
 * Marker in ein fremdes Chrome-Fenster; hier ist der Marker ein DSH-Client-
 * Plugin und das Panel ist KEIN schwebendes div, sondern der native Side Panel:
 *
 *   ctx.slots.register({ name: 'main', key: 'shinon-markers' }, MarkerPanel)
 *   ctx.slots.register({ name: 'sidebar.panellist', id: 'shinon-markers', … }, MarkerIcon)
 *
 * Gespiegelte Regeln (identisch zum Vertrag in assets/marker-model.json):
 *   - Marke: id, label, selector, text, rect, href, url, ts
 *   - Ausschnitt-Label: tag#id.class (höchstens zwei Klassen)
 *   - Selektor: stabiler Pfad, höchstens 6 Stufen, :nth-of-type bei Geschwistern
 *   - Nutzlast: Brutalords Zeilenformat (`payload.line`)
 *   - Speicher: localStorage __mk.marks / __mk.comments (Browserseite)
 *   - Taste `m` schaltet den Modus, Escape verlässt ihn
 *
 * Nicht gespiegelt: CDP-Verbindung, Chrome-Daemon, Injektion in fremde Seiten.
 * Self-contained: kein top-level `import`, React kommt aus `require`.
 */
```

## Kanon k-b323262b6700 {#k-b323262b6700}

Fundstellen: packages/markers/index.js:4–31

Volltext des gekürzten Blocks (Stand 2026-10-17):

```
/**
 * @shinon/markers — der Marker-Spiegel.
 *
 * Spiegel des Element-Marker-Systems aus vannon091118/brutalord-the-feral-cycle
 * (tools/preview/marker-core.js + marker.js). Gespiegelt werden die REGELN, nicht
 * der Code: Feldmenge, id-Fortschreibung, Selektor-Ableitung, Nutzlast-Format,
 * Speicherschlüssel, Grenzen. Nicht gespiegelt: CDP-Verbindung, Chrome-Daemon,
 * Injektion in fremde Seiten.
 *
 * Rollenteilung:
 *   Host  (diese Datei)  — Vertrag als Daten + reine Prüfer/Ableiter. Kein Netz,
 *                          keine Datei-Schreibzugriffe, kein Modell, keine Aktion.
 *   Client (client.js)   — der Spiegel im nativen DSH-Side-Panel: markieren,
 *                          kommentieren, Nutzlast bauen, kopieren.
 *
 * DIE EINE NAHT ZUM BROWSER (INDEX_INJECT/LIMITS_GLOBAL): die WIRKSAMEN Grenzen
 * — Profilwerte, nicht Vertragsvorgaben — legt der Host beim Ausliefern der Seite
 * als `window.__DSH_MARKERS_CONFIG__` in den Index (dieselbe Naht, über die DSH
 * Theme, Dokument-Vorschau und Modell-Einstellungen ausliefert). Der Client liest
 * sie beim Mounten; er kann die Grenzen nicht erraten, weil er ein selbständiges
 * Bundle ist. Beide Seiten führen den Namen als Literal, der Test vergleicht sie.
 *
 * Fail-closed für die Marke: eine Marke ohne Selektor oder ohne ganzzahliges Rect
 * existiert nicht. Fail-open für den Host: die Beobachtung darf die Sitzung nie
 * mit einem Throw stören — Verstöße werden gezählt, nicht geworfen.
 *
 * Der Vertrag selbst liegt als Daten in ./assets/marker-model.json.
 */
```

## Kanon k-460edae63587 {#k-460edae63587}

Fundstellen: packages/narrative/assets/narrative-core.js:1–15

Volltext des gekürzten Blocks (Stand 2026-10-17):

```
/**
 * @shinon/narrative — reiner Kern (assets/narrative-core.js).
 *
 * KEINE Imports (weder Bare noch node:): nur dann laeuft der Test in CI ohne
 * node_modules — dieselbe Regel wie bei `@shinon/scoring` (scoring-core.js) und
 * `@shinon/prompter` (note-core.js). `index.js` re-exportiert diesen Kern, die
 * Host-Anbindung (Events, Zustand, apply) bleibt dort.
 *
 * WAS ZUG 5 GEÄNDERT HAT: dieser Kern hatte eine eigene XorShift-PRNG und wuerfelte
 * Mood und Erzaehler aus. Ein Wuerfel ist auch dann ein Wuerfel, wenn er
 * deterministisch ist: niemand kann im Vertrag nachlesen, WARUM dieser Takt so
 * klingt. Jetzt entscheiden DATEN — die Mood-Tabelle je Ereignis (mit der
 * Anti-Wiederholung als benannte Regel) und der Erzaehler aus dem Ereignis-Praefix.
 * Kein `Math.random`, kein `Date.now`, kein Modell: gleiche Historie, gleicher Takt.
 */
```

## Kanon k-4ee7381077b9 {#k-4ee7381077b9}

Fundstellen: packages/narrative/index.js:5–53

Volltext des gekürzten Blocks (Stand 2026-10-17):

```
/**
 * @shinon/narrative — Narrative Engine (Zug 5: aktiviert).
 *
 * Architektur:
 *   session.event ──▶ @shinon/events ──▶ shinon/event ──▶ Chronicle
 *                                                            │
 *                                                            ▼
 *                                                    Arc Tracking
 *                                                            │
 *                                                            ▼
 *                                                    Relationship State
 *                                                            │
 *                                                            ▼
 *                                                    Composite → Persona
 *
 * Deterministisch: gleicher Input + gleiche Historie = gleicher Output.
 * Keine Zeit, kein Zufall, kein Modell.
 *
 * WAS ZUG 5 GEÄNDERT HAT (dieses Paket war bis dahin `inactive`):
 *
 *   1. Der eigene Schema-Fallback ist weg. Eingebunden wird `@deepseek-ai/schemastery`
 *      wie in jedem anderen Paket — ein zweiter, selbstgebauter Schemabau war ein
 *      Sonderweg, den nur dieses Paket kannte (er haette jede Schema-Version
 *      stillschweigend anders beantwortet als der Rest des Repos).
 *   2. Die XorShift-PRNG ist weg. Mood und Erzaehler kommen aus DATEN
 *      (`assets/narrative-state.json#derivation`) — der Vertrag sagt jetzt, WARUM
 *      ein Takt so klingt, statt es zu wuerfeln (siehe assets/narrative-core.js).
 *   3. Die Uhr ist weg: ein fehlender Zeitstempel bleibt `null`, statt aus
 *      `new Date()` zu kommen. „Nur aus Vorgaenger + Ereignis" steht als Invariante
 *      im Vertrag, und die gilt jetzt auch hier.
 *   4. Der tote Dienst ist weg: `ctx.set('narrative', …)` war an `typeof ctx.set`
 *      gebunden (Cordis bietet `provide`, nicht `set`) und hatte keinen Leser.
 *      Was niemand liest, wird nicht angeboten — der Composite geht als Ereignis
 *      `shinon/narrative/state` raus, und das ist der geprüfte Weg.
 *   5. ZUG 6 — DER LESER IST DA: bis dahin hatte den Kanal niemand abonniert, der
 *      Composite ging ins Leere (die Engine rechnete, aber niemand sah es). Die
 *      Persona hoert jetzt auf `STATE_CHANNEL` und rendert daraus ihren Abschnitt
 *      `shinon:narrative-arc`. Sie uebernimmt den Composite NICHT in ihren eigenen
 *      Zustand (dessen `mood` bleibt maßgeblich) — der Vertrag sagt `authority:
 *      NONE`, und ein Abschnitt, der eine Interpretation als Tatsache ausgibt,
 *      waere genau der Fehler, den `authority` verhindern soll. Kanalname und
 *      Vertragsname sind auf beiden Seiten LITERALE; die Gleichheit pinnt
 *      `scripts/lib/repo.mjs` (SOURCE_TWINS) plus
 *      `scripts/gate/tests/narrative.test.mjs`.
 *
 * Die reinen Funktionen (Mood-Tabelle, Anti-Wiederholung, Arc, Relationship,
 * Composite, Chronik) liegen in `assets/narrative-core.js` — ohne Imports, damit
 * der Test in CI ohne node_modules laeuft.
 */
```

## Kanon k-2d45581b039d {#k-2d45581b039d}

Fundstellen: packages/narrative/test/narrative.test.mjs:2–15

Volltext des gekürzten Blocks (Stand 2026-10-17):

```
/**
 * Narrative Engine (Zug 5) — ohne DSH, ohne Netz, ohne Modell.
 *
 * Belegt wird, was der Vertrag VERSPRICHT, seit die PRNG weg ist:
 *   - Der Mood kommt aus der Tabelle und wiederholt sich nie zweimal
 *     (Anti-Wiederholung als benannte Regel, nicht als Wuerfel).
 *   - Der Erzaehler kommt aus dem Ereignis-Praefix.
 *   - Gleicher Input + gleiche Historie = gleicher Composite (zweimal gefahren).
 *   - Die Chronik liest keine Uhr: ein fehlendes `timestamp` bleibt `null`.
 *   - Der Arc friert bei der Schwelle ein und ein neuer beginnt — der rote Faden
 *     reisst nicht, er wechselt benannt.
 *
 * Läuft mit `node --test` (`npm run test:narrative`) — kein DSH, kein Netz.
 */
```

## Kanon k-8cfad5dd55da {#k-8cfad5dd55da}

Fundstellen: packages/openapi/index.js:13–35

Volltext des gekürzten Blocks (Stand 2026-10-17):

```
/**
 * OpenAPI v1 Spec
 * 
 * @openapi
 * /api/v1/status:
 *   get:
 *     summary: Get system status
 *     responses:
 *       200:
 *         description: System is running
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   enum: [ok, error]
 *                 version:
 *                   type: string
 *                 uptime:
 *                   type: number
 */
```

## Kanon k-5432d0bdaafb {#k-5432d0bdaafb}

Fundstellen: packages/persona/index.js:336–347

Volltext des gekürzten Blocks (Stand 2026-10-17):

```
/**
 * Den Composite der Narrative Engine als System-Abschnitt rendern.
 *
 * Die Beschriftung steht im Vertrag (`narrative.fields`), nicht im Code: ein
 * neues Feld ist zuerst eine Datenzeile. Was der Composite nicht traegt, wird
 * ausgelassen; ein Composite ohne darstellbares Feld ergibt `null` — dann faellt
 * der Abschnitt weg, statt leer dazustehen (dieselbe Ehrlichkeit wie beim Ton).
 *
 * Die Persona BEHAUPTET hier nichts: der Abschnitt ist als gelesene Interpretation
 * ausgewiesen, und der eigene Zustand (stance/mood) bleibt daneben unveraendert
 * maßgeblich.
 */
```

## Kanon k-c233ec2da666 {#k-c233ec2da666}

Fundstellen: packages/persona/index.js:24–45

Volltext des gekürzten Blocks (Stand 2026-10-17):

```
/**
 * @shinon/persona — Identity, State, Voice.
 *
 * Zwei Hälften, eine Grenze:
 *   Identity  statische Abschnitte im System-Prompt (Config-Werte).
 *   State     abgeleitet aus den emittierten Events des Spines: kein Raten, kein Modell.
 *   Voice     eine Stimme je Mood, aus dem Zustandsvertrag — Kontext, keine Aktion.
 *
 *   session/event ──▶ @shinon/events ──▶ shinon/event ──▶ Persona State ──▶ System Context ──▶ Modell
 *
 * Die Persona entscheidet nichts: sie liest Events, hält einen Zustand und
 * schreibt ihn als Prompt-Abschnitt. Sie ruft kein Modell, startet kein Tool,
 * schreibt keine Datei, mutiert keinen fremden State. Das Gate prüft diese
 * Grenze statisch (scripts/gate/plugins/persona.mjs).
 *
 * Der Zustandsvertrag liegt als Daten in ./assets/persona-state.json — ein
 * neuer Mood oder Übergang ist zuerst eine Datenänderung, kein Code-Umbau.
 *
 * WICHTIG: Die Persona wird NUR im Shinon-Projekt aktiv (isShinonProject()).
 * In anderen Projekten bleibt sie stumm — Shinon-interne Daten werden nicht
 * in fremde Projekte injiziert.
 */
```

## Kanon k-84b84a002cbc {#k-84b84a002cbc}

Fundstellen: packages/popup/client.js:98–114, packages/popup/assets/trajectory-core.js:67–83

Volltext des gekürzten Blocks (Stand 2026-10-17):

```
/**
 * Den Fortschritt aus dem Ereignisfenster falten — deterministisch, ohne Uhr.
 *
 * Die Lesart ist eine Momentaufnahme des FENSTERS: das Fenster ist
 * „zusammenhängend" (laut `SessionEventSource`), also beschreibt die Faltung den
 * letzten Abschnitt der Sitzung. Ein neues `turn/start` setzt sie zurück, ein
 * `turn/end` schließt sie ab — die Anzeige ist damit „läuft" oder „bereit", und
 * beides ist aus den Ereignissen ablesbar statt behauptet.
 *
 * Ohne `callId` ist ein Aufruf nicht zuordenbar. Er zählt trotzdem als OFFEN —
 * fail-closed: es gibt keine Evidenz, dass er fertig ist, und „geschlossen" wäre
 * eine Behauptung. Sein synthetischer Schlüssel kann von keinem `tool/result`
 * getroffen werden (die tragen echte callIds), also bleibt er es auch.
 *
 * @param entries - Einträge des Sitzungsfensters (`binding.eventSource…entries`).
 * @param limit - wie viele Werkzeugnamen behalten werden.
 */
```

## Kanon k-3573fb010fc1 {#k-3573fb010fc1}

Fundstellen: packages/popup/assets/trajectory-core.js:1–44

Volltext des gekürzten Blocks (Stand 2026-10-17):

```
/**
 * @shinon/popup — reiner Kern (assets/trajectory-core.js).
 *
 * KEINE Imports (weder Bare noch node:): nur dann läuft der Test in CI ohne
 * node_modules — dieselbe Regel wie bei `@shinon/scoring` (scoring-core.js),
 * `@shinon/narrative` (narrative-core.js) und `@shinon/prompter` (note-core.js).
 *
 * WARUM DIE FALTUNG IN EINER MARKIERTEN REGION STEHT: die Client-Hälfte kann
 * diese Datei NICHT importieren (ein Client-Bundle ist eigenständig; es zieht
 * React per `require`, nicht per `import`). Sie trägt denselben Text deshalb als
 * bytegleiche Kopie — dieselbe Bauform wie die Turn-Faltung der Token-Anzeige
 * (`zwilling:token-turn`). Die Region markiert genau den geteilten Text; die
 * `export`-Zeile darunter gehört nur dieser Datei, denn `export` wäre im
 * Funktionsrumpf eines Client-Bundles ein Syntaxfehler.
 *
 * WARUM ES DIESEN KERN GIBT — der gemessene Befund: `@shinon/popup` hieß
 * „Trajectory-Overlay" und hatte KEINEN Renderer. Der Host emittierte Einträge
 * auf `shinon/trajectory`, und die Client-Hälfte sagte in ihrem eigenen Kopf,
 * dass sie sie nicht rendert. Ein Overlay, das nichts anzeigt, ist von einem
 * kaputten nicht zu unterscheiden.
 *
 * DER DATENWEG, und warum er nicht über den Host läuft: ein Out-of-Tree-Bundle
 * kann keinen Host-Endpunkt registrieren (die Remote-Beiträge der Browser-Hälfte
 * kommen aus einer kompilierten Liste in `@deepseek-ai/dsh-api-remotes`), und die
 * Connection-Naht ist reines Anfrage/Antwort (`rpc.call`) ohne Abo. Was der
 * Client DAGEGEN lesen kann, ist die Sitzung selbst — genau der Weg, den
 * `@shinon/token-usage` schon geht:
 *
 *   ctx.get('uiSession')?.adapter?.current?.getSnapshot()   → welche Sitzung
 *   ctx.get('sessions')?.binding(id)                        → deren Bindung
 *   …binding.eventSource.getSnapshot().entries              → das Ereignisfenster
 *   …binding.eventSource.subscribe(fn)                       → jede Änderung
 *
 * DIE FELDPFADE SIND GEMESSEN, nicht geraten — sie stehen im Vertrag der
 * installierten DSH-Fassung (`@deepseek-ai/dsh-session/lib/types/types.d.ts`):
 *
 *   'tool/call'    { turn, step, callId, name, arguments }
 *   'tool/result'  { turn, step, message, … }   → callId unter message.source.callId
 *   'turn/start'   { turn }        'turn/end'   { turn }
 *   'step/start'   { turn, step }
 *
 * Die Ereignisse liegen im Fenster als `{ type: 'event', event }` — dieselbe
 * Form, die `@shinon/token-usage` faltet (`entry.type === 'event'`).
 */
```

## Kanon k-cf9fdc4a21d3 {#k-cf9fdc4a21d3}

Fundstellen: packages/popup/client.js:1–38

Volltext des gekürzten Blocks (Stand 2026-10-17):

```
/**
 * @shinon/popup — Client-Hälfte: DAS OVERLAY (Zug 6).
 *
 * WARUM DIESE DATEI NEU GESCHRIEBEN WURDE — der gemessene Befund: der Kopf dieser
 * Datei sagte selbst, dass sie NICHTS rendert. Ein „Trajectory-Overlay", das nur
 * einen Sidebar-Eintrag malt, ist von einem kaputten nicht zu unterscheiden; das
 * Paket erklärte sich deshalb im eigenen Manifest als inaktiv.
 *
 * DER DATENWEG (der einzige, der einem Out-of-Tree-Bundle offensteht): ein
 * Client-Bundle kann KEINEN Host-Endpunkt registrieren — die Remote-Beiträge der
 * Browser-Hälfte kommen aus einer kompilierten Liste in
 * `@deepseek-ai/dsh-api-remotes`, und die Connection-Naht ist reines
 * Anfrage/Antwort (`rpc.call`) ohne Abo. Der Host emittiert seine
 * Trajectory-Einträge weiterhin auf `shinon/trajectory` (index.js), hier als
 * Probe-API ohne In-Tree-Konsument (siehe Gate-Test `popup-overlay.test.mjs`) —
 * dieser Client faltet stattdessen die SITZUNG:
 *
 *   ctx.get('uiSession')?.adapter?.current?.getSnapshot()   → welche Sitzung
 *   ctx.get('sessions')?.binding(id)                        → deren Bindung
 *   …binding.eventSource.getSnapshot().entries              → das Ereignisfenster
 *   …binding.eventSource.subscribe(fn)                      → jede Änderung
 *
 * Denselben Weg geht `@shinon/token-usage`; er ist gemessen, nicht behauptet
 * (der Vertrag der installierten DSH-Fassung: `ctx.get(name)` ist die optionale
 * Abfrage, ein direkter Dienst-Zugriff wirft ohne `inject`).
 *
 * DIE REGEL SELBST steht als bytegleiche Region aus dem Kern
 * (packages/popup/assets/trajectory-core.js): ein Client-Bundle ist eigenständig
 * und zieht kein `import` über die Paketgrenze. Die Region ist die Zusage, dass
 * der Browser dieselbe Rechnung fährt wie die Unit-Tests — geprüft von
 * `scripts/lib/repo.mjs` (Zwilling) bei jedem Gate-Lauf.
 *
 * WAS SIE RENDERT: den Fortschritt des laufenden Vorgangs (Schritt, offene
 * Aufrufe, zuletzt benutztes Werkzeug) im Dock über dem Eingabefeld — derselbe
 * Slot, den `@shinon/core` (Info-Leiste) und `@shinon/codingmon` (EXP-Leiste)
 * schon besetzen. Ohne laufenden Turn rendert sie NICHTS (ein leeres Overlay wäre
 * eine Oberfläche, die nichts aussagt) — sichtbar bleibt die Sidebar-Zeile.
 */
```

## Kanon k-92f06b8275f8 {#k-92f06b8275f8}

Fundstellen: packages/popup/index.js:27–37

Volltext des gekürzten Blocks (Stand 2026-10-17):

```
/**
 * Trigger → Signal, als EINE Tabelle.
 *
 * Vorher deckte der Zweig in `apply` nur 'user/message' und 'agent/pre-step' ab;
 * der dritte im Schema erlaubte Wert ('session/event') fiel in einen stillen
 * No-Op — eine Zeile in einem Profil, die nichts registriert und nichts meldet.
 *
 * 'user/message' hängt am kanonischen Spine-Signal `shinon/message/received`
 * (packages/events/assets/event-spine.json), nicht am Carrier `session/event`:
 * der Spine normalisiert bereits, ein zweiter Weg wäre eine zweite Wahrheit.
 */
```

## Kanon k-5cb9ff2f3777 {#k-5cb9ff2f3777}

Fundstellen: packages/popup/test/trajectory-core.test.mjs:2–17

Volltext des gekürzten Blocks (Stand 2026-10-17):

```
/**
 * Popup-Kern (Zug 6) — ohne DSH, ohne Netz, ohne Modell, ohne node_modules.
 *
 * Belegt wird, was der Kern VERSPRICHT, und zwar an der GEMESSENEN Ereignisform
 * (`@deepseek-ai/dsh-session/lib/types/types.d.ts`, installierte Fassung):
 *
 *   - Das Fenster liefert `{ type: 'event', event }`; Chunks und Fremdes fallen weg.
 *   - Ein `turn/start` setzt die Lesart zurück, ein `turn/end` schließt sie ab.
 *   - Ein `tool/call` ist offen, bis sein `tool/result` es über
 *     `data.message.source.callId` schließt — der laufende Aufruf ist der jüngste
 *     offene.
 *   - Ohne `callId` wird NICHTS geschlossen (kein Raten).
 *   - Die Werkzeugliste ist gedeckelt (das Fenster wächst unbegrenzt).
 *
 * Läuft mit `node --test` (`npm test`) — kein DSH, kein node_modules.
 */
```

## Kanon k-502129437108 {#k-502129437108}

Fundstellen: packages/project-index/assets/index-core.js:1696–1707

Volltext des gekürzten Blocks (Stand 2026-10-17):

```
/**
 * Kandidaten mit Rang. Jede Stufe aus §14 hat ihre Quelle:
 *
 *   exakter Pfad    die Dateitabelle; ein Name ohne Verzeichnis zaehlt schwaecher
 *   exaktes Symbol  die Symboltabelle, nur referenzierbare Arten
 *   Paket/Modul     Kanten der Art 'dependency'
 *   Touch           Touches in beide Richtungen
 *   Volltext        FTS5 zuletzt und mit dem niedrigsten Rang
 *
 * Die Reihenfolge entsteht aus den RANGEN, nicht aus der Abfragereihenfolge:
 * eine spaetere Stufe kann einen frueheren Kandidaten nur bestaetigen.
 */
```

## Kanon k-bd0e4151fdea {#k-bd0e4151fdea}

Fundstellen: packages/project-index/assets/index-core.js:1616–1642

Volltext des gekürzten Blocks (Stand 2026-10-17):

```
// ══ Der MAX-Kontext (Plan §14/§15) ═══════════════════════════════════════════
//
// Diese Sektion ist die fehlende Haelfte zwischen Index und Enhancer: der Index
// weiss alles ueber das Projekt, der Enhancer kennt den Kontextvertrag — aber
// niemand machte aus einem ROHTEXT relevanten Kontext. Der naheliegende Weg ist
// gemessen der falsche: die Chunks dieses Repos sind 978903 Zeichen (≈ 244726
// Token bei 4 Zeichen je Token), das Budget aus §14 erlaubt 6000. Ein Resolver,
// der nicht rangiert, kann das Budget nicht halten — er kann nur zufaellig
// klein sein. Und die Volltextsuche allein ist nicht selektiv: das haeufigste
// Symbol dieses Repos ('apply') liefert 10 Dateien mit 31 Treffern.
//
// DREI EIGENSCHAFTEN, die keine Geschmacksfrage sind:
//
//   1. NUR DER INDEX IST DIE QUELLE. Kein Dateisystemzugriff in dieser Sektion.
//      Der Index traegt redigierten Text (Plan §13), die Platte den Rohinhalt —
//      ein Resolver, der die Datei nachliest, umgeht den Secret-Schutz.
//   2. DAS BUDGET IST HART. Was nicht hineinpasst, wird an der Zeilengrenze
//      abgeschnitten; danach ist Schluss, statt die naechste Datei halb
//      anzufangen. Ein halber Kontext verspricht mehr, als er traegt.
//   3. DIE RANGFOLGE IST DATEN. `CONTEXT_PRIORITIES` haelt die Ordnung aus §14,
//      und ein Gleichstand entscheidet der Pfad — zwei Laeufe liefern dieselbe
//      Ausgabe, sonst waere der Kontext nicht nachpruefbar.
//   4. DAS BUDGET FOLGT DEM RANG. Jeder Kandidat darf so viel nehmen, wie sein
//      Rang am verbleibenden Gesamtrang ausmacht. Ohne diese Aufteilung frisst
//      die erste grosse Datei das ganze Budget: live gemessen fiel bei einem
//      Prompt, der ZWEI Pfade nennt, der zweite heraus — genau der Bezug, den
//      der Nutzer ausdruecklich genannt hat.
```

## Kanon k-966d299ece78 {#k-966d299ece78}

Fundstellen: packages/project-index/assets/index-core.js:1490–1503

Volltext des gekürzten Blocks (Stand 2026-10-17):

```
/**
 * Die Ablage EINES Namensraums schreiben — ein Aufruf, eine Transaktion.
 *
 * Der Aufruf ERSETZT den Namensraum: was nicht mehr in `state` steht, ist
 * danach nicht mehr da. Genau das braucht ein Widerruf — die Zeile faellt weg,
 * und niemand rechnet daneben ein Gegen-Delta. Faellt irgendetwas um, rollt die
 * Transaktion zurueck: ein halb geschriebener Stand waere schlimmer als der
 * alte, weil er wie ein ganzer aussieht.
 *
 * Die drei Arten sind bewusst die einzigen: `record` (eine Zeile des
 * Protokolls, mit `ordinal` in der Reihenfolge des Eingangs), `memo` (Zustand
 * je Sitzung, geschluesselt nach `ref`) und `summary` (der Stand, der aus dem
 * Protokoll folgt). Ein Dokument ohne Nummer ist hier nicht vorgesehen.
 */
```

## Kanon k-d351abac315d {#k-d351abac315d}

Fundstellen: packages/project-index/assets/index-core.js:1441–1458

Volltext des gekürzten Blocks (Stand 2026-10-17):

```
/**
 * Die Ablage EINES Namensraums lesen — `null`, wenn dort nichts steht.
 *
 * Drei Zusagen halten den Unterschied zwischen „leer" und „kaputt":
 *
 *   keine Zeile   `null`. Kein erfundenes leeres Protokoll: "hier war noch
 *                 nichts" ist eine andere Aussage als "hier stand nichts mehr".
 *   kaputte Zeile GEZAEHLT und uebergangen (`broken`), nicht geworfen: ein
 *                 einzelner unlesbarer Eintrag darf die ganze Ablage nicht
 *                 unbrauchbar machen — und still verschwinden darf er auch
 *                 nicht. Der Aufrufer nennt die Zahl im Protokoll.
 *   Reihenfolge   folgt `ordinal`, nicht der Einfuegereihenfolge: dieselbe
 *                 Folge von Signalen ergibt dieselbe Tafel, auch ueber einen
 *                 Neustart hinweg.
 *
 * Was ein Dokument BEDEUTET, weiss diese Funktion nicht — sie liefert die drei
 * Arten getrennt zurueck und ueberlaesst das Lesen dem Aufrufer.
 */
```

## Kanon k-03d8991ec153 {#k-03d8991ec153}

Fundstellen: packages/project-index/assets/index-core.js:1186–1223

Volltext des gekürzten Blocks (Stand 2026-10-17):

```
/**
 * Einen Indexlauf fahren — inkrementell nach Plan §11:
 *
 *   stat -> mtime+size gleich?  ja: nicht einmal lesen (unchanged)
 *                             und mit verify=stamp zusaetzlich: Stempel gleich?
 *        -> sonst lesen und sha256 vergleichen (hashed)
 *             gleicher Hash: nur die Dateizeile auffrischen (rehashed)
 *             neuer Hash:    neu parsen und die Primaerdaten ersetzen (written)
 *
 * Damit ist 'kein vollstaendiger Rebuild' ZAEHLBAR statt behauptet: der Bericht
 * nennt, wie viele Dateien gelesen (hashed) und wie viele neu geparst (written)
 * wurden, und wie viele BYTES dabei gelesen wurden (readBytes) — die Kosten
 * stehen im Bericht, nicht nur in einem Messskript. Ein zweiter Lauf ohne
 * Dateiaenderung hat hashed = 0, written = 0 und readBytes = 0.
 *
 * VERIFY (Umgang mit Zeitstempel-Problemen, §11) — drei Politiken, die sich in
 * dem unterscheiden, was sie ueber eine Datei ANNEHMEN:
 *
 *   'stamp'   (Standard) glaubt Groesse und mtime NICHT allein. Stimmen beide,
 *             wird zusaetzlich der Inode-Stempel verglichen (inodeStamp): ctime
 *             und Identitaet schliessen die Luecke, ohne dass eine unveraenderte
 *             Datei gelesen wird. Ein verdaechtiger Stempel kostet EINEN
 *             Lesevorgang; stellt sich der Inhalt als gleich heraus, ist das ein
 *             gezaehlter Fehlalarm (falseAlarms) und der Stempel wird mit
 *             aufgefrischt, damit er sich nicht wiederholt.
 *   'changed' vertraut mtime+size. Benannte Luecke: gleiche Groesse, geaenderter
 *             Inhalt, zurueckgesetzte mtime bleibt unentdeckt.
 *   'all'     liest und hasht jede Datei. Nimmt nichts an — und kostet ein
 *             vollstaendiges Lesen je Lauf.
 *
 * Alle drei sind FAIL-CLOSED in derselben Richtung: was nicht sicher gleich ist,
 * wird gelesen. 'stamp' ist strenger als 'changed' und billiger als 'all'.
 *
 * Der Lauf wirft nicht wegen einer einzelnen Datei; er gibt einen Bericht
 * zurueck. Der Referenzdurchgang laeuft nur, wenn sich die Menge der
 * Referenzziele geaendert hat (sonst nur fuer die neu geschriebenen Dateien), und
 * die Touch-Aufloesung raeumt Ziele weg, die es nicht mehr gibt.
 */
```

## Kanon k-496de3328f9f {#k-496de3328f9f}

Fundstellen: packages/project-index/assets/index-core.js:1118–1132

Volltext des gekürzten Blocks (Stand 2026-10-17):

```
/**
 * Eine Datei vollstaendig indexieren: Dateizeile, Symbole, Kanten, Chunks und
 * die FTS-Spiegelung. Gibt die Kanten zurueck — der Aufrufer loest daraus die
 * Touches auf, weil dafuer die Kenntnis aller Dateien noetig ist.
 *
 * Der Text wird VOR der ersten Zeile redigiert (Plan §13: der Schutz greift vor
 * der persistierten Speicherung). Danach gibt es keinen Pfad mehr, auf dem
 * Rohinhalt in die Datenbank kommt: Symbole, Kanten, Chunks und FTS lesen den
 * redigierten Text.
 *
 * Der digest bleibt der Hash des ROHEN Inhalts: er entscheidet, ob sich eine
 * Datei geaendert hat, und ein Hash ist kein Geheimnis. Wuerde er aus dem
 * redigierten Text gebildet, saehe ein Lauf eine Aenderung nicht, die nur einen
 * bereits ersetzten Wert betrifft.
 */
```

## Kanon k-596cc0a82f7b {#k-596cc0a82f7b}

Fundstellen: packages/project-index/assets/index-core.js:944–956

Volltext des gekürzten Blocks (Stand 2026-10-17):

```
/**
 * Einen Stand aus dem INDEX in den Ledger holen — verlustfrei, atomar, idempotent.
 *
 * Der Index wird READ-ONLY geoeffnet (`openIndex` wuerde fehlende Tabellen
 * anlegen und einen fremden Index neu bauen — ein Migrationslauf darf die Quelle
 * nicht anfassen). Kopiert wird in EINER Transaktion; faellt etwas um, bleibt
 * der Ledger leer statt halb gefuellt.
 *
 * Idempotent ist es, weil VOR dem Schreiben geprueft wird, ob der Ledger den
 * Namensraum schon hat: der zweite Aufruf tut nichts. Nichts wird geloescht — die
 * Zeilen des Index bleiben stehen, sie sind die Sicherung (und der naechste
 * Index-Neuaufbau raeumt sie ohnehin selbst weg).
 */
```

## Kanon k-b9057d4d6388 {#k-b9057d4d6388}

Fundstellen: packages/project-index/assets/index-core.js:894–910

Volltext des gekürzten Blocks (Stand 2026-10-17):

```
/**
 * Die EINE Stelle, an der eine SQLite-Verbindung dieses Pakets aufgesetzt wird.
 *
 * Warum als Funktion: Index und Ledger sind zwei Dateien, aber nicht zwei
 * Datenbanken mit zwei Politiken. Jede Verbindung traegt dieselbe Form:
 *
 *   journal_mode = wal   ein Leser blockiert den Schreiber nicht (und umgekehrt)
 *   synchronous = full   die Haltbarkeit wird BENANNT, nicht geerbt — der
 *                        SQLite-Standard ist keine Zusage
 *   secure_delete = on   ein `delete` loescht Zeilen, nicht Bytes (gemessen: nach
 *                        dem Entfernen eines Werts stand er in den freigegebenen
 *                        Seiten der Datei weiterhin drin)
 *   busy_timeout         zwei Prozesse (Host + Worker) warten statt zu scheitern
 *   foreign_keys = on    die Kanten des Index sind Beziehungen, keine Zahlen
 *
 * Gepinnt von `scripts/gate/tests/project-index.test.mjs` gegen die echten Dateien.
 */
```

## Kanon k-fa97efea8861 {#k-fa97efea8861}

Fundstellen: packages/project-index/assets/index-core.js:784–804

Volltext des gekürzten Blocks (Stand 2026-10-17):

```
/**
 * Die Parser-Registry: Sprache -> verfuegbarer Parser -> Symbole / Kanten.
 *
 * `parser` benennt, WELCHER Parser traegt. Die Zuordnung ist gemessen
 * (docs/probes/project-index-parserstrategie.json), nicht behauptet:
 *
 *   javascript/jsx/typescript/tsx  KEIN Parser. acorn, espree, meriyah,
 *       typescript, @babel/parser und esprima sind weder im Repo noch in der
 *       DSH-Installation aufloesbar. Also zeilenbasiert, best effort.
 *   json  `JSON.parse` — eingebaut, immer verfuegbar; traegt die Kanten.
 *   markdown  KEIN Parser (marked, gray-matter nicht aufloesbar); Ueberschriften
 *       sind die best-effort-Struktur.
 *   yaml  KEIN Parser, der aus DIESEM Paket erreichbar waere. `yaml`/`js-yaml`
 *       liegen in der DSH-Installation als internes Beiwerk einer Fassung; sie
 *       zu benutzen bindet das Paket an eine nicht deklarierte Abhaengigkeit und
 *       schliesst den Worker aus. Also Text, ohne Symbolbegriff.
 *
 * Diese Registry ist die Erweiterungsstelle fuer spaetere AST-Parser: ein echter
 * Parser wird hier eingetragen, der Lauf bleibt unveraendert. Heute traegt sie
 * keine AST-Zusage.
 */
```

## Kanon k-087d1c4e7400 {#k-087d1c4e7400}

Fundstellen: packages/project-index/assets/index-core.js:669–679

Volltext des gekürzten Blocks (Stand 2026-10-17):

```
/**
 * Symbole im Code (JavaScript/TypeScript): eine Zeile liefert hoechstens ein
 * Symbol, das erste passende Muster gewinnt.
 *
 * Grenze, die nicht behauptet, sondern gebaut ist: Zeilen, die in einem
 * Blockkommentar stehen oder mit `//`, `/*` oder `*` beginnen, werden
 * uebersprungen; die Muster greifen nur am Zeilenanfang, ein Kommentar NACH
 * einem Ausdruck stoert also nicht. Ein Blockkommentar-Zustand wird ueber die
 * Zeilen mitgefuehrt, weil die Doc-Kommentare dieses Repos sonst als Code
 * gelesen wuerden.
 */
```

## Kanon k-c45acf51b44e {#k-c45acf51b44e}

Fundstellen: packages/project-index/assets/index-core.js:614–640

Volltext des gekürzten Blocks (Stand 2026-10-17):

```
/**
 * Alle indexierbaren Dateien unterhalb von `root` — in DETERMINISTISCHER
 * Reihenfolge, und jeder Ausschluss benannt.
 *
 * Zwei Zusagen, jede einzeln pruefbar:
 *
 *   1. REIHENFOLGE: das Ergebnis ist aufsteigend nach Pfad sortiert. Der
 *      Durchlauf besucht die Eintraege je Ordner schon namenssortiert, aber erst
 *      diese Sortierung macht die Reihenfolge eine Funktion der DateiMENGE —
 *      unabhaengig davon, wie der Baum durchlaufen wurde, in welcher Reihenfolge
 *      `readdirSync` geantwortet hat und ob ein Ordner tiefer oder flacher lag.
 *      `localeCompare` waere hier falsch: es haengt von der Locale des Prozesses
 *      ab, und ein Bericht, der je Rechner anders sortiert, ist kein Nachweis.
 *   2. AUSSAHME: `onError` bekommt JEDEN ausgelassenen Ordner mit Pfad und Grund.
 *      Vorher kehrte der Durchlauf bei einem unlesbaren Ordner wortlos um, und
 *      sein ganzer Teilbaum fehlte im Index — der Bericht sah danach genauso aus
 *      wie ein Projekt ohne diesen Ordner. Ein stummer Ausfall, der wie ein
 *      Ergebnis aussieht, ist die teuerste Sorte Befund.
 *
 * Der Rueckgabewert bleibt ein Array (die Aufrufer im Repo und in den Proben
 * erwarten genau das); `onError` ist die optionale dritte Angabe, damit die
 * Erweiterung nichts bricht.
 *
 * @param root - Projektwurzel.
 * @param extensions - die aufgenommenen Endungen.
 * @param onError - optionale Senke `({ path, reason, detail })` fuer Auslassungen.
 */
```

## Kanon k-94f7076f39a8 {#k-94f7076f39a8}

Fundstellen: packages/project-index/assets/index-core.js:494–524

Volltext des gekürzten Blocks (Stand 2026-10-17):

```
/**
 * Der Stempel eines Inodes: Geraet, Inode, Groesse, mtime (Millisekunden) und
 * ctime (Nanosekunden) — eine Zeile, die man lesen kann.
 *
 * WOZU: Groesse und mtime sind eine Behauptung des Schreibers. Beide kann ein
 * Werkzeug nach einer Aenderung WIEDERHERSTELLEN; deshalb bleibt die Luecke aus
 * §11 (gleiche Groesse, zurueckgesetzte mtime) fuer den klassischen Vergleich
 * unsichtbar. Die ctime kann das nicht: sie ist die Zeit der letzten Aenderung
 * des INODES, jeder Schreibvorgang bewegt sie, und es gibt keinen Aufruf, der
 * sie setzt. Der Inode selbst deckt die zweite Form derselben Luecke: eine
 * ERSETZTE Datei hat eine neue Identitaet, auch bei gleicher Groesse und mtime.
 *
 * GEMESSEN auf diesem Rechner (ext4), nicht angenommen: writeFileSync mit
 * gleich langem Inhalt + utimesSync auf die alte mtime laesst Groesse und mtime
 * auf Millisekunden gleich und bewegt die ctime; ein chmod bewegt die ctime
 * OHNE Inhaltsaenderung (das ist der Fehlalarm, der im Bericht gezaehlt wird).
 *
 * UND EHRLICH ZUR ROLLE DES INODES: in den Proben dieses Repos traegt die ctime
 * die Erkennung — eine ersetzte Datei wird auch ohne die Inode-Nummer erkannt
 * (Mutationsprobe: Inode entfernt, das Ersetzungs-Szenario bleibt gruen, rot
 * werden nur die Format-Zusagen). Der Inode ist deshalb REDUNDANZ, kein eigener
 * Nachweis: er deckt Dateisysteme ab, deren ctime grob ist (Sekundengranularitaet
 * oder aus mtime abgeleitet), und genau dort ist er die zweite Chance.
 *
 * GRENZEN, benannt: (1) Das ist eine Eigenschaft des DATEISYSTEMS, keine Zusage.
 * Ein Dateisystem ohne brauchbare ctime — grob oder aus mtime abgeleitet — macht
 * dieses Signal schwaecher; `verify: 'all'` bleibt die Antwort, die nichts
 * annimmt. Faellt der Stempel ganz aus (null), wird gelesen, nie vertraut.
 * (2) Ein Stempel ist kein Inhaltsnachweis: er sagt "dieselbe Datei, seit dem
 * letzten Lauf nicht angefasst", nicht "derselbe Inhalt".
 */
```

## Kanon k-965056f5e698 {#k-965056f5e698}

Fundstellen: packages/project-index/assets/index-core.js:314–326

Volltext des gekürzten Blocks (Stand 2026-10-17):

```
/**
 * Schicht 2 — typische Secret-MUSTER im Inhalt (Plan §13: der Schutz darf nicht
 * nur auf Dateinamen beruhen).
 *
 * Gemessen vor dem Bau gegen 167 Dateien dieses Repos: 0 Fehlalarme ausserhalb
 * der echten Datei. Zwei Entwurfsentscheidungen stammen aus dieser Messung:
 *
 *   - KEIN Lookbehind auf Bezeichnerzeichen. Die Fassung mit `(?<![A-Za-z0-9_])`
 *     lieferte 0 Treffer, weil in `SHINON_API_KEY` vor `API_KEY` ein Unterstrich
 *     steht — sie waere blind genau fuer die haeufigste Schreibweise.
 *   - `valueGroup` haelt den NAMEN und ersetzt nur den Wert. Der Name ist kein
 *     Geheimnis; ihn zu entfernen wuerde den Fund unbrauchbar machen.
 */
```

## Kanon k-abc7af297fd8 {#k-abc7af297fd8}

Fundstellen: packages/project-index/assets/index-core.js:255–273

Volltext des gekürzten Blocks (Stand 2026-10-17):

```
/**
 * Schicht 1 — Dateien, die Zugangsdaten SIND. Sie werden nie gelesen.
 *
 * Warum nicht einfach `credentials*` und `secrets*` aus Plan §13: gemessen haben
 * Praefixmuster zwei Luecken. (a) `.credentials.yaml` liegt in der Wurzel dieses
 * Repos und traegt drei echte Schluessel — `credentials*` trifft sie NICHT, weil
 * ein Punkt vorangeht. (b) Ein Praefixmuster trifft auch Quelldateien, die
 * Zugangsdaten nur VERWALTEN; die gehoeren in den Index, sonst kann der Agent die
 * Stelle nicht finden, die einen Schluessel benutzt.
 *
 * Deshalb: ganze Namen statt Praefixe. Ein Name zaehlt als Zugangsdatentraeger,
 * wenn er genau `credentials`/`secrets` heisst (mit optionalem fuehrenden Punkt
 * und optional EINER Endung) oder wenn er eine Schluesselendung traegt. Damit
 * faellt `secrets.mjs` unter den Schutz — Plan §13 nennt `secrets*`, und eine
 * Datei mit diesem Namen ist ebenso wahrscheinlich ein Buendel ausgeschriebener
 * Werte wie ein Modul, das sie verwaltet. `credentials-handling.mjs` dagegen
 * bleibt indexiert: die Regel trifft Namen, nicht Praefixe, und eine Quelldatei
 * mit sprechendem Namen gehoert auffindbar. Ihr Inhalt wird von Schicht 2 geprueft.
 */
```

## Kanon k-217225e35edd {#k-217225e35edd}

Fundstellen: packages/project-index/assets/index-core.js:197–210

Volltext des gekürzten Blocks (Stand 2026-10-17):

```
/**
 * Verzeichnisse, die nie betreten werden: Fremdcode, Historie, Laufzeitdaten,
 * Werkzeug-Caches. Das ist DIESELBE Menge wie `PRUNE_DIRS` in
 * `scripts/lib/scan.mjs` — der Kern kann sie nicht importieren (er darf nur
 * `node:*` laden und wird in jedes Tarball gepackt), deshalb pinnt
 * `scripts/gate/tests/scan-pruning.test.mjs` beide Listen zeichengenau
 * gegeneinander. Wer hier etwas ergänzt, muss es dort auch tun (und umgekehrt),
 * sonst wird der Drift im Gate sichtbar statt still.
 *
 * `.agents` steht aus S1 darin: darunter liegen die Skills. Sie sind eine EIGENE
 * Quelle (eigene Auswahl, eigenes Budget) und dürfen nicht zusätzlich als
 * gewöhnlicher Projektquelltext im Kontext landen — sonst stünde derselbe Skill
 * zweimal in der Nachricht, einmal als Datei und einmal als Skill-Block.
 */
```

## Kanon k-3d3a8e86dcb1 {#k-3d3a8e86dcb1}

Fundstellen: packages/project-index/assets/index-core.js:163–186

Volltext des gekürzten Blocks (Stand 2026-10-17):

```
/**
 * Die Ablage der NICHT herleitbaren Daten (Zug 2).
 *
 * Warum eine eigene Tabelle und nicht ein Feld im Index: alles andere in dieser
 * Datei ist ABGELEITET — Dateien, Symbole, Kanten, Chunks entstehen aus dem
 * Projekt und sind aus ihm wieder herstellbar (SCHEMA_VERSION steigt, der
 * naechste Lauf baut sie neu). Was hier liegt, ist das Gegenteil: die
 * Bewertungen des Menschen, ihre Zuordnung und der daraus gerechnete Stand
 * lassen sich nirgends nachlesen. Ein Index-Neuaufbau darf sie deshalb NICHT
 * verwerfen — die Ablage traegt ihre eigene Fassung (MEMORY_VERSION), und nur
 * deren Wechsel wirft sie weg.
 *
 * Der Index kennt den INHALT nicht: eine Zeile ist ein Namensraum, eine Art,
 * ein Schluessel und ein JSON-Dokument. Was darin steht, ist Sache des Lesers
 * (der Scoring-Host legt dort Protokoll, Merkzettel und Tafel ab). Diese
 * Trennung ist der Grund, warum die Ablage kein zweites Scoring-Schema im
 * Index versteckt: der Index transportiert, der Leser versteht.
 *
 * GRENZE, benannt: je Signal wird der ganze Namensraum neu geschrieben. Die
 * Zeilenzahl ist die Zahl der Signale eines Projekts (gemessen: zweistellig je
 * Sitzung, nicht je Token) — der Aufwand waechst mit dem Protokoll und ist
 * damit bewusst nicht inkrementell. Ein inkrementelles Append braucht stabile
 * Zeilen-Identitaeten ueber Laeufe hinweg; die gibt es heute nicht.
 */
```

## Kanon k-219af403ec19 {#k-219af403ec19}

Fundstellen: packages/project-index/assets/index-core.js:111–122

Volltext des gekürzten Blocks (Stand 2026-10-17):

```
/**
 * Der DAUERHAFTE Ledger des Scorings — Nutzerurteile und der daraus gerechnete
 * Stand sind NICHT herstellbar, also gehoeren sie in die Daten des Nutzers:
 * `SHINON_LEDGER_FILE`, sonst `$XDG_DATA_HOME/shinon/ledger.sqlite`, sonst
 * `~/.local/share/shinon/ledger.sqlite`.
 *
 * Warum NICHT im Index (frueher: Namensraum in index.sqlite): der Index liegt im
 * Cache. Ein `rm -rf ~/.cache`, ein Projektrechtwechsel oder ein Cache-Aufraeumer
 * haette dort das Gedaechtnis des Nutzers mitgenommen. Ein Index-Neuaufbau war
 * schon vorher unschaedlich (eigene MEMORY_VERSION), die Cache-Bereinigung war
 * es nicht.
 */
```

## Kanon k-b4f7bf978070 {#k-b4f7bf978070}

Fundstellen: packages/project-index/assets/index-core.js:94–108

Volltext des gekürzten Blocks (Stand 2026-10-17):

```
/**
 * Wurzel aller Indizes — ausserhalb jedes Projekts und WEGWERFBAR.
 *
 * Der Index ist reine Ableitung (Dateien, Symbole, Kanten, Chunks entstehen aus
 * dem Projekt und sind aus ihm wieder herstellbar). Er gehoert deshalb in den
 * CACHE des Nutzers und nicht in die Daten: `SHINON_INDEX_ROOT`, sonst
 * `$XDG_CACHE_HOME/shinon/indexes`, sonst `~/.cache/shinon/indexes`.
 *
 * Die fruehere Fassung lag unter `~/.shinon/indexes` — einem eigenen Ort ohne
 * Konvention, der bei einem `rm -rf ~/.cache` ueberlebt haette, obwohl er nichts
 * Dauerhaftes traegt, und der beim Aufraeumen der Nutzerdaten niemandem auffiel.
 * Dieselbe Regel steht als Dienst in `scripts/lib/paths.mjs` (indexRoot());
 * `scripts/gate/tests/scan-pruning.test.mjs` pinnt beide Werte gegeneinander,
 * damit die zwei Orte nicht auseinanderlaufen.
 */
```

## Kanon k-17bb1310be3f {#k-17bb1310be3f}

Fundstellen: packages/project-index/assets/index-core.js:77–91

Volltext des gekürzten Blocks (Stand 2026-10-17):

```
/**
 * Fassung der EXTRAKTION — der Grund, warum es diesen Marker gibt:
 *
 * Der Lauf ist inkrementell (Plan §11). Eine unveraenderte Datei wird deshalb
 * NICHT neu geparst. Wird die Extraktion geaendert (hier: Sprachregistry mit
 * Ueberschriften, Abhaengigkeitskanten und Prosa-Ausschluss), dann bleiben die
 * Zeilen der unveraenderten Dateien auf dem alten Stand — gemessen im Live-Boot:
 * nach dem Parserwechsel standen 643 Symbole im Index statt der gemessenen rund
 * 1030, weil nur 12 Dateien neu geschrieben wurden. Ein Index, der seine eigene
 * Herkunft nicht kennt, ist damit still falsch. Also traegt er sie: eine andere
 * Fassung verwirft den Index und baut ihn neu auf.
 *
 * Erhoehen heisst: die Bedeutung des Inhalts hat sich geaendert, auch wenn die
 * Tabellen gleich geblieben sind.
 */
```

## Kanon k-3c6712e15061 {#k-3c6712e15061}

Fundstellen: packages/project-index/assets/index-core.js:1–55

Volltext des gekürzten Blocks (Stand 2026-10-17):

```
/**
 * shinon-project-index — der Kern: Extraktion, Schema, inkrementeller Lauf, Worker.
 *
 * Diese Datei kennt KEINE Host-Abhaengigkeit, nur node:* Builtins. Genau deshalb
 * kann sie auch ein Worker laden (Plan §12): der Worker importiert diesen Kern
 * ueber seine Datei-URL, waehrend er an einem Bare-Import des Host-Pakets
 * scheitern wuerde. Die Host-Haelfte (Config + apply) steht in index.js.
 *
 * VERIFIZIERTE RUNTIME (gemessen, nicht aus einer Doku abgeleitet):
 *
 *   node:sqlite    laedt OHNE Flag (nur `ExperimentalWarning: SQLite is an
 *                  experimental feature`). Exporte: DatabaseSync, StatementSync,
 *                  constants, backup. Form: new DatabaseSync(path); db.exec(sql)
 *                  fuer DDL; db.prepare(sql) -> run() = { lastInsertRowid,
 *                  changes }, all() = Zeilenarray, get() = eine Zeile.
 *   FTS5           `create virtual table ... using fts5(path, body, tokenize =
 *                  'porter')` wird akzeptiert, `match` liefert Treffer, und
 *                  `delete from <fts> where path = ?` entfernt die Indexzeilen
 *                  wirklich (gemessen: 2 Treffer vor, 0 danach). SQLite 3.51.3.
 *   `references`   ist ein SQLite-Schluesselwort: `create table references(...)`
 *                  ist ein Syntaxfehler, `create table "references"(...)` geht.
 *                  Deshalb traegt die Tabelle aus Plan §9 exakt ihren Namen, aber
 *                  ueberall gequotet.
 *   Parser         ES GIBT KEINEN. Weder acorn, espree, meriyah, typescript,
 *                  @babel/parser noch esprima sind aufloesbar; im Harness liegt
 *                  unter @babel nur code-frame/helper/runtime, global nur
 *                  cline/corepack/npm. Deshalb eine eigene, BEWUSST BEGRENZTE
 *                  Extraktion (siehe extractSymbols).
 *   Worker         ein Worker, der index.js laedt, scheitert im Host an
 *                  `Cannot find package '@deepseek-ai/schemastery'` — deshalb
 *                  dieser Kern ohne Bare-Importe.
 *
 * PRIMAERDATEN (Plan §9): files, symbols, edges, references, touches, chunks,
 * dazu die FTS5-Spiegelung der Chunks. Keine Vector-First-Architektur.
 *
 * SECRET PROTECTION (Plan §13) — zwei Schichten, beide VOR jedem Insert:
 *
 *   1. Pfad   Dateien, die Zugangsdaten SIND, werden nicht einmal geoeffnet: kein
 *             stat, kein Lesen, kein digest, keine Zeile. Hatten sie aus einer
 *             frueheren Fassung Zeilen, werden die entfernt (Remediation).
 *   2. Inhalt Ist ein eingegebener Wert schon ausgeschrieben, wird er ersetzt,
 *             bevor Text in die Datenbank geht — Symbole, Kanten, Referenzen,
 *             Chunks und FTS sehen nur den redigierten Text. Die Fundstelle
 *             (Pfad, Zeile, Art) wird festgehalten, der WERT NICHT.
 *
 * Gemessen vor dem Bau (docs/probes/secret-protection.json): die Musterliste aus
 * Plan §13 trifft die entscheidende Datei dieses Repos nicht — `credentials*`
 * scheitert an `.credentials.yaml`, weil dem Namen ein Punkt vorangeht. Beide
 * Schichten bauen deshalb auf ganzen Namen bzw. auf dem Inhalt, nicht auf Praefixen.
 *
 * GRENZE, die nicht verschwiegen wird: das ist ein Detektor mit benannten Mustern,
 * kein Beweis. Kodierte, geteilte oder unbekannte Formen werden nicht erkannt.
 * Die WIRKSAME Schutzmassnahme ist Schicht 1 plus eine Positivliste; Schicht 2
 * faengt den Rest der bekannten Muster.
 */
```

## Kanon k-82440b0f6b33 {#k-82440b0f6b33}

Fundstellen: packages/project-index/assets/workspace.js:1–20

Volltext des gekürzten Blocks (Stand 2026-10-17):

```
/**
 * @shinon/project-index — workspace.js
 *
 * DIE EINE QUELLE der Workspace-Identität (S1), für die Host-Hälfte des
 * Project Index. Der Prompter hält dieselbe Datei als Besitzer; dieser Spiegel
 * ist bytegleich zwischen den Markern `zwilling:workspace-identitaet` und wird
 * von `SOURCE_TWINS` in `scripts/lib/repo.mjs` (Gate + Build) geprüft.
 *
 * Warum eine Kopie und kein Import: Pakete dieses Repos referenzieren einander
 * nicht — jedes wird als eigenes Tarball gepackt und geladen. Ein Import über
 * die Paketgrenze wäre bequem und würde die Verteilung brechen.
 *
 * Warum die Werte übereinstimmen MÜSSEN: Prompter und Index beantworten
 * dieselbe Frage („welcher Workspace ist aktiv?"). Zwei verschiedene Antworten
 * hießen, dass ein Prompt den Index eines anderen Projekts liest — genau die
 * Verwechslung, die S1 ausschließt. `scripts/gate/tests/project-index.test.mjs`
 * vergleicht zusätzlich das Verhalten beider Fassungen.
 *
 * Nur Node-Builtins — keine Bare-Imports, damit der Kern workerfähig bleibt.
 */
```

## Kanon k-699a4d85c2ff {#k-699a4d85c2ff}

Fundstellen: packages/project-index/client.js:1–13

Volltext des gekürzten Blocks (Stand 2026-10-17):

```
/**
 * @shinon/project-index — Client-Hälfte.
 *
 * Der Index lebt im Host: er liest das Projekt, schreibt SQLite außerhalb des
 * Projekts und liefert später den MAX-Kontext. Im Client gibt es nichts zu
 * besetzen — dieser Platzhalter existiert, weil der Bundle-Vertrag genau vier
 * Dateien verlangt und der Client-Loader eine Registrierung mit der
 * Contract-id erwartet.
 *
 * Ein späteres Panel darf hier andocken und den letzten Lauf zeigen
 * (Dateien, Symbole, Chunks), aber erst, wenn es dafür einen echten Zustand im
 * Client gibt. Heute wäre jede Anzeige eine Erfindung.
 */
```

## Kanon k-86bcb8c92b8a {#k-86bcb8c92b8a}

Fundstellen: packages/project-index/index.js:328–345

Volltext des gekürzten Blocks (Stand 2026-10-17):

```
/**
 * Den Index beim Mounten aufbauen bzw. fortschreiben.
 *
 * Plan §12: der Index-Build darf den kritischen Agent-Eventloop nicht blockieren.
 * Gemessen auf diesem Repo (163 Dateien): ein vollstaendiger Lauf dauert 817 ms.
 * Deshalb laeuft er (a) nicht im Mount, sondern danach, und (b) im Worker statt
 * im Host. Ist der Worker nicht nutzbar, laeuft derselbe `runIndex` im Host und
 * die Ursache steht im Protokoll — ein stiller Wechsel waere ein Befund ohne Spur.
 *
 * Der Anlauf selbst laeuft NACH dem Mounten; die Abfrage-Faehigkeit wird aber
 * schon hier bereitgestellt. Das ist kein Widerspruch: sie antwortet `null`,
 * solange kein Index vorliegt, und benutzt denselben Dateipfad, den der Lauf
 * schreibt. Damit gibt es kein Fenster, in dem ein Aufrufer nichts bekaeme.
 *
 * Der Secret-Schutz (Plan §13) ist nicht konfigurierbar: er ist keine Option,
 * sondern eine Eigenschaft des Index. Was er nicht schuetzt, steht als Grenze im
 * Kern — ein Detektor mit benannten Mustern ist kein Beweis.
 */
```

## Kanon k-03e5d719ce37 {#k-03e5d719ce37}

Fundstellen: packages/project-index/index.js:258–273

Volltext des gekürzten Blocks (Stand 2026-10-17):

```
  /**
   * Wie der Lauf Unveraendertheit feststellt — die Frage ist, was er ueber eine
   * Datei ANNIMMT:
   *
   *   'stamp'    (Vorgabe) Groesse und mtime werden nicht allein geglaubt. Stimmen
   *              beide, vergleicht er zusaetzlich den Inode-Stempel (Geraet,
   *              Inode, Groesse, mtime, ctime). Damit wird ein Inhalt, der bei
   *              GLEICHER Groesse geaendert und dessen mtime zurueckgesetzt wurde,
   *              erkannt, ohne dass eine unveraenderte Datei gelesen wird. Der
   *              Preis sind Lesevorgaenge fuer verdaechtige Dateien; ein Signal
   *              ohne Inhaltsaenderung (chmod) ist ein gezaehlter Fehlalarm.
   *   'changed'  vertraut mtime + size. Benannte Luecke: derselbe Inhalt bei
   *              gleicher Groesse und zurueckgesetzter mtime bleibt unbemerkt.
   *   'all'      jede Datei lesen und sha256 pruefen; nimmt nichts an und kostet
   *              ein vollstaendiges Lesen je Lauf.
   */
```

## Kanon k-460a91877e9e {#k-460a91877e9e}

Fundstellen: packages/project-index/index.js:198–212

Volltext des gekürzten Blocks (Stand 2026-10-17):

```
/**
 * Die Abfrage-Faehigkeit bauen.
 *
 * `resolveContext(prompt, { budgetTokens })` liefert die Form des Kontextvertrags
 * oder `null`. Die drei Richtungen sind Absicht:
 *
 *   null      es gibt (noch) keinen Index — eine ehrliche Leere. Ein leerer
 *             Index waere eine Behauptung: "das Projekt hat keine Dateien".
 *   Kontext   der vertragsgemaesse Kontext; die Budgetgrenze ist hart (§14).
 *   wirft     der Index ist da, aber unbrauchbar (kaputte Datei). Ein Fehler,
 *             kein stilles Nichts — der Aufrufer entscheidet, was er daraus macht.
 *
 * Die Abfrage ERZEUGT KEINEN Index: `openIndex` legt fehlende Dateien an, eine
 * Suche darf das nicht. Deshalb steht davor `existsSync`.
 */
```

## Kanon k-4ecd728f7f18 {#k-4ecd728f7f18}

Fundstellen: packages/project-index/index.js:142–153

Volltext des gekürzten Blocks (Stand 2026-10-17):

```
    /**
     * Den Stand eines Namensraums lesen. Erzeugt KEINEN Index und KEINEN Ledger:
     * fehlt die Datei, ist die Antwort `null` und nicht ein leerer Stand.
     *
     * Der Namensraum wird ZUERST geprueft: ein Aufruf ohne Adresse ist ein
     * Fehler, und die ehrliche Leere („keine Ablage") darf ihn nicht verdecken.
     *
     * EINMALIGE MIGRATION: hat der Ledger den Stand nicht, der INDEX aber schon
     * (so stand es bis zur Trennung), wird er hier heruebergeholt — verlustfrei
     * und in einer Transaktion. Danach meldet `reason` nichts mehr. Das ist
     * keine stille Datenbewegung: `save` schreibt weiterhin nur in den Ledger.
     */
```

## Kanon k-c723d54e00a3 {#k-c723d54e00a3}

Fundstellen: packages/project-index/index.js:90–112

Volltext des gekürzten Blocks (Stand 2026-10-17):

```
/**
 * Die Ablage-Faehigkeit bauen: einen Namensraum lesen, einen Namensraum
 * schreiben. Mehr nicht.
 *
 * Die Rueckgaben sind ausdruecklich dreiwertig, weil der Unterschied zwischen
 * „nichts da" und „nicht lesbar" die ganze Aussage ist:
 *
 *   load  { ok: true, state: null }   es gibt (noch) keinen Index — ehrliche
 *                                     Leere. Nichts ist verloren, nichts ist
 *                                     kaputt: hier war noch nie ein Stand.
 *   load  { ok: true, state: {…} }    der Stand (records, memos, scorecard,
 *                                     notes, broken).
 *   load  { ok: false, error }        die Datei ist da, aber unbrauchbar. Ein
 *                                     Fehler, kein stilles Nichts — der Aufrufer
 *                                     entscheidet, ob er leer startet.
 *   save  { ok: true, rows }          geschrieben (ein Aufruf, eine Transaktion).
 *   save  { ok: false, error }        nicht geschrieben; der alte Stand steht.
 *
 * `save` legt die Datei AN, `load` nicht: schreiben ist unsere eigene Ablage
 * (sie darf ihr Zuhause bauen), lesen waere sonst ein erfundener Index —
 * dieselbe Regel wie bei der Abfrage. Ein Namensraum ist Pflicht: ohne ihn
 * waere die Ablage ein namenloser Haufen, und niemand koennte sie wiederfinden.
 */
```

## Kanon k-04269fb71dcc {#k-04269fb71dcc}

Fundstellen: packages/project-index/index.js:24–62

Volltext des gekürzten Blocks (Stand 2026-10-17):

```
/**
 * shinon-project-index — die Host-Haelfte: Konfiguration und Mount.
 *
 * Der Kern (Extraktion, Schema, inkrementeller Lauf, Worker) steht in
 * `./assets/index-core.js` und kennt keine Host-Abhaengigkeit. Das ist kein
 * Geschmack, sondern gemessen: ein Worker, der DIESE Datei importiert, scheitert
 * im echten Host an `Cannot find package '@deepseek-ai/schemastery'` — der
 * Worker hat die Modulaufloesung des Hosts nicht. Der Kern laedt deshalb ohne
 * Bare-Importe, und der Worker laedt den Kern.
 *
 * WAS DER INDEX IST: der persistente Projektindex aus Plan §9–§12 — files,
 * symbols, edges, references, touches, chunks + FTS5, ausserhalb des Repos unter
 * ~/.shinon/indexes/<project-hash>/index.sqlite.
 *
 * WAS ER ANBIETET: ZWEI Faehigkeiten, jede schmal und jede ueber `ctx.provide`.
 *
 *   1. `QUERY_SERVICE` (Plan §14/§17) — EIN Vertragsname und EINE Operation
 *      (`resolveContext`). Das ist die Naht zum Prompt-Enhancer. Kein
 *      Dateihandle, kein Schema, kein Lauf — wer mehr braucht, importiert den
 *      Kern; wer einen Kontext braucht, fragt hier.
 *   2. `STORE_SERVICE` (Zug 2) — zwei Operationen (`load`, `save`) auf einem
 *      Namensraum. Das ist die Naht zum Scoring, und sie ist die Antwort auf
 *      eine gemessene Luecke: der Index war reine Ableitung (Dateien, Symbole,
 *      Kanten — aus dem Projekt wieder herstellbar), dem Scoring fehlte jeder
 *      Ort fuer das, was NICHT herstellbar ist: Urteile, ihre Zuordnung und der
 *      daraus gerechnete Stand. Bis dahin lebte das im Arbeitsspeicher eines
 *      Hosts und war nach jedem Neustart weg.
 *
 * WARUM ALS DIENST UND NICHT ALS IMPORT: die Pakete dieses Repos referenzieren
 * einander nicht. Enhancer und Scoring lesen ihre Faehigkeit optional ueber
 * `ctx.get`; fehlt sie, ist MAX nur ueber eine Datei zu haben statt gar nicht —
 * und das Scoring rechnet im Speicher weiter, statt zu verschwinden.
 *
 * WARUM ZWEI DIENSTE UND NICHT EINER MIT VIER OPERATIONEN: die schmale Form der
 * Abfrage ist per Test festgenagelt (`contract` + `resolveContext`, genau diese
 * beiden Schluessel). Sie zu erweitern hiesse, jedem Leser des Kontexts ein
 * Schreib-Modul in die Hand zu geben. Zwei Namen, zwei Vertraege, zwei
 * Berechtigungen — dasselbe Prinzip wie bei den Marken-Slots.
 */
```

## Kanon k-b2be43d3772c {#k-b2be43d3772c}

Fundstellen: packages/prompter/assets/block-review.js:1–16

Volltext des gekürzten Blocks (Stand 2026-10-17):

```
/**
 * @shinon/prompter — block-review.js (Phase 4: Vorschlag → Prüfung → Aktivierung).
 *
 * KEINE Imports (weder Bare noch node:): nur dann läuft der Test in CI ohne
 * node_modules — dieselbe Regel wie `note-core.js`. Die drei Prüfungen selbst
 * (`zu spitz`, `zu breit`, `doppelt`) stehen in `note-core.js#reviewNotes` und
 * werden vom Host auf die Zettel-HÜLLE des Vorschlags angewendet; was HIER
 * steht, ist nur baustein-spezifisch: Form des Blocks, Duplikat gegen AKTIVE
 * Bausteine (die keine Zettel sind) und das Zusammenführen mit der Registry.
 *
 * Ein Vorschlag ist eine Zettel-Hülle mit Block-Kern: { thema, bei, immer,
 * weil, beleg, block: { id, quelle, lage, modus, budgetTokens, ausloeser } }.
 * Die Hülle prüft der Veredler wie jeden Zettel (Form via `parseNote`, die drei
 * Prüfungen via `reviewNotes` — der Host ruft beides auf); der Kern wird hier
 * geprüft. Nur was beides besteht, wird aktiv.
 */
```

## Kanon k-e2e295eae3c5 {#k-e2e295eae3c5}

Fundstellen: packages/prompter/assets/block-select.js:314–334

Volltext des gekürzten Blocks (Stand 2026-10-17):

```
/**
 * Alle Bausteine wählen — deterministisch, gedeckelt, fail-open.
 *
 * @param registry - validierte Registry (`validateRegistry`).
 * @param opts - { mode, promptText, context, intentClass, stance, available,
 *   weights, totalBudgetTokens, includeIds } — `available`: { contextPresent,
 *   notesOn, skillsOn, intentOn, narrative, recentEvents }; `weights`: gelernte
 *   Zähler ({ id: { up, down } }), wirken nur als Gleichstands-Brecher nach
 *   Treffern; `includeIds`: der Vorschlag des Selektionsagenten (nur IDs aus
 *   `candidateBlocks`).
 * @returns { selected: [{ id, quelle, hits, reason, budgetTokens }],
 *   skipped: [{ id, quelle, reason }], totalTokens }
 *
 * Die Agentenwahl ist der EINE zweite Weg in die Auswahl, und sie ist kein
 * Freifahrtschein: Pflicht steht immer, Modus und Quelle sperren weiter (der
 * Agent sah nur Kandidaten), das Budget bleibt hart, und jede nicht gewählte
 * Kandidatur wird mit `AGENT_ABGELEHNT` benannt statt still zu verschwinden.
 * Ohne `includeIds` (leer, unbekannt, fehlend) gilt unverändert der rein
 * deterministische Weg — der Rückfall ist kein Sonderfall, sondern derselbe
 * Code.
 */
```

## Kanon k-f9dd0c524fdf {#k-f9dd0c524fdf}

Fundstellen: packages/prompter/assets/block-select.js:1–25

Volltext des gekürzten Blocks (Stand 2026-10-17):

```
/**
 * @shinon/prompter — block-select.js
 *
 * Der Baustein-Selektor (Phase 2): verallgemeinert die `selectNotes`/
 * `selectSkills`-Mechanik auf ALLE Bausteine der Registry (`blocks.json`).
 *
 * KEINE Imports (weder Bare noch node:): nur dann läuft der Test in CI ohne
 * node_modules — dieselbe Regel wie `note-core.js`. Die `tokens`-Zerlegung ist
 * deshalb hier absichtlich dupliziert statt importiert (begrenzte, benannte
 * Duplikation wie bei den Zwillingen, kein heimliches Teilen).
 *
 * WAS HIER STEHT: Haystack bauen, Bausteine matchen, Budgets deckeln,
 * Entscheidungsanteil bauen. Alles rein: gleiche Eingabe, gleiche Auswahl.
 * WAS HIER NICHT STEHT: kein Modell (der Laufzeit-Dienst wird hier weder
 * gelesen noch aufgerufen — der Paket-Test pinnt das statisch), keine Uhr,
 * kein Dateisystem, kein Netz. Fehlt eine Quelle, fehlt der Baustein
 * (fail-open); der Schritt läuft immer weiter.
 *
 * Semantik eines Treffers (erste zutreffende Achse gewinnt, in dieser
 * Reihenfolge): PFLICHT > TRIGGER > INTENT > HALTUNG > EREIGNIS > HAYSTACK.
 * Die Reihung ist Teil des Vertrags: Pflicht zuerst (Registry-Reihenfolge),
 * dann Treffer absteigend, dann id aufsteigend. Budgets werden in genau dieser
 * Reihenfolge verbraucht; Pflicht sprengt das Gesamtbudget nie still — sie
 * steht immer, Situatives weicht mit BUDGET_ERSCHOEPFT.
 */
```

## Kanon k-cec9fb972199 {#k-cec9fb972199}

Fundstellen: packages/prompter/assets/enhancer.js:258–271

Volltext des gekürzten Blocks (Stand 2026-10-17):

```
/**
 * Den One-Shot fahren, ohne dass ein Fehler in UNSEREM Code den Schritt bricht.
 *
 * `enhance` soll nie werfen — aber „soll" ist keine Zusage, und der Fall ist
 * nicht theoretisch: die Signal-Konstruktion im Aufruf wirft bei kaputter
 * Konfiguration (gemessen: `timeoutMs: -1` → RangeError ERR_OUT_OF_RANGE,
 * `NaN` → RangeError, ein fremdes Signal → TypeError) und liegt VOR dem try des
 * Modellaufrufs. Ein werfender Aufruf waere kein Fallback, sondern ein kaputter
 * Nutzer-Schritt: der Loop saehe den Enhancer, den es nicht geben darf. Deshalb
 * wird jeder solche Fall zu einem benannten Verwerfen — Roh-Prompt gilt, Grund steht.
 *
 * Die Grenze ist bewusst schmal: Fehler von `next()` sind NICHT unsere Fehler
 * und werden hier nicht gefangen (siehe onPreStep).
 */
```

## Kanon k-2866d84c7342 {#k-2866d84c7342}

Fundstellen: packages/prompter/assets/enhancer.js:189–202

Volltext des gekürzten Blocks (Stand 2026-10-17):

```
/**
 * Die verworfene One-Shot-Antwort mitschreiben — die eine Quelle fuer die
 * NO_JSON-Diagnose.
 *
 * Vorher fiel der Rohtext bei JEDEM Verwerfen still weg: der Sitzungsverlauf
 * nannte den Grund (NO_JSON), aber nie, was das Modell tatsaechlich geantwortet
 * hatte — die Ursache blieb damit undiagnostizierbar (gemessen am Fehlerfall
 * 2026-10-16). Deshalb steht hier der volle Text auf stderr, NUR auf dem seltenen
 * Verwerfungsweg (kein Dauer-Log im Normalbetrieb). Kein Dateischreiben: der
 * Isolationstest verbietet writeFile im Laufzeitcode dieses Pakets, und die
 * Spur ueber DECISION_CHANNEL traegt bewusst keinen Prompt-Text.
 * Länge begrenzt (6000 Zeichen), damit eine unerwartet riesige Antwort den
 * Terminal-Log nicht sprengt — der Anfang ist immer vollstaendig sichtbar.
 */
```

## Kanon k-8e2d80ffff69 {#k-8e2d80ffff69}

Fundstellen: packages/prompter/assets/enhancer.js:12–22

Volltext des gekürzten Blocks (Stand 2026-10-17):

```
/**
 * Den One-Shot-Aufruf bauen.
 *
 * Hier steht die Capability-Isolation: es gibt kein `tools`-Feld. Dazu kommen
 * nur die Felder, die `GenerateOptions` wirklich kennt — `purpose` bleibt
 * ungesetzt, weil DSH dort keine passende Klasse fuehrt.
 *
 * Der Kontextblock landet in der Nutzer-Nachricht, nicht im System-Prompt: er
 * ist Daten, und das Modell soll ihn als Daten lesen. MIN und MID bekommen ihn
 * gar nicht — ihr Modus kennt keine Projektkenntnis.
 */
```

## Kanon k-bf50f2cfb46f {#k-bf50f2cfb46f}

Fundstellen: packages/prompter/assets/index-manager.js:534–547

Volltext des gekürzten Blocks (Stand 2026-10-17):

```
/**
 * Prüfen, ob ein Prompt einem der bekannten Intent-Patterns entspricht.
 * Gibt { matched, patternId, label, expansion, classification } oder null.
 *
 * Zwei Regeln, beide fail-closed gegenüber der Nutzerabsicht:
 *   1. Trigger sind Handlungsphrasen (Daten), keine Themenwörter — ein Satz
 *      über Tests ist kein Auftrag, Tests zu schreiben.
 *   2. Eine Frage wird höchstens KLASSIFIZIERT, nie erweitert: `expansion` ist
 *      dann leer, und der Aufrufer hängt keinen `# Aufgabe`-Block an. Sonst
 *      beantwortet der Agent die Frage nicht, sondern erfindet eine Aufgabe.
 *
 * Score-basiert: Patterns mit mehreren Phrasentreffern gewinnen vor solchen
 * mit nur einem.
 */
```

## Kanon k-54687d80016d {#k-54687d80016d}

Fundstellen: packages/prompter/assets/index-manager.js:491–502

Volltext des gekürzten Blocks (Stand 2026-10-17):

```
/**
 * Eine JSON-Datei schreiben — der EINE Schreibweg des Pakets.
 *
 * Der Isolationstest verlangt, dass die Host-Komposition (`index.js`) und die
 * One-Shot-Kerne kein Dateisystem öffnen; dieses Modul ist die benannte
 * Ausnahme und schreibt bereits den Runtime-Index. Die gelernte Baustein-Ablage
 * (Phase 4) nimmt denselben Weg statt einer zweiten Schreibstelle: ein Pfad,
 * ein `mkdir`, ein `write` — und die Grenze bleibt an genau einer Stelle
 * sichtbar, statt sie pro Aufrufer neu zu ziehen.
 *
 * Ein absoluter Pfad bleibt absolut (dieselbe Regel wie bei Zetteln/Skills).
 */
```

## Kanon k-2664d6482bf0 {#k-2664d6482bf0}

Fundstellen: packages/prompter/assets/index-manager.js:353–365

Volltext des gekürzten Blocks (Stand 2026-10-17):

```
/**
 * Alle .js/.mjs/.ts/.json/.yml/.yaml/.md-Dateien in einem Verzeichnis
 * rekursiv einlesen und in den Index aufnehmen.
 *
 * Zwei Budgets, beide hart: eine Datei über MAX_FILE_CHARS und jeder Inhalt
 * über MAX_INDEX_CHARS wird NICHT aufgenommen. Jeder Ausschluss steht mit
 * Grund in `excluded` — `[{ path, reason, detail }]`, reason ist `ZU_GROSS`
 * oder `BUDGET_ERSCHOEPFT`. Ein stiller Schnitt wäre ein Index, der behauptet,
 * das Projekt zu kennen, und dabei Dateien verschweigt.
 *
 * Die Reihenfolge ist sortiert, damit der Budget-Schnitt deterministisch ist:
 * derselbe Baum ergibt denselben Index, nicht Filesystem-Reihenfolge.
 */
```

## Kanon k-95fe4da8abd3 {#k-95fe4da8abd3}

Fundstellen: packages/prompter/assets/index-manager.js:145–168

Volltext des gekürzten Blocks (Stand 2026-10-17):

```
/**
 * Den Kontext für einen Prompt zusammenstellen.
 *
 * Liefert alles, was zum Prompt passt — dateipfadt-basiert UND token-basiert.
 * Maximal `maxFiles` Dateien UND höchstens `budgetTokens` (Default §14) —
 * beides zusammen, weil eins allein nicht reicht: `maxFiles` begrenzt die
 * Anzahl, nicht die Grösse, und 20 grosse Dateien sind mehr Inhalt als ein
 * Modellaufruf in seinem Zeitlimit verarbeiten kann.
 *
 * GEMESSEN 2026-10-16 (echter Profil-Lauf): ohne Budget baute der Prompter für
 * einen 132-Zeichen-Prompt eine Nutzer-Nachricht von 1 457 948 Zeichen
 * (package-lock.json 521 512, client.js 130 353, …). Der Aufruf lief in sein
 * eigenes 15-s-Limit, die Antwort kam leer zurück und jedes Verwerfen hiess
 * `NO_JSON` — der Enhancer kam in MAX nie an. Deshalb: harte Grenze wie §14.
 *
 * ZWEI REGELN, die zusammen die Ursache treffen:
 *   1. Ein Prompt-Wort zählt je Datei höchstens MAX_TOKEN_HITS-mal (nicht je
 *      Vorkommen im Tokenhaufen dieser Datei). Vorher gewann eine Datei durch
 *      Grösse: package-lock.json hatte zehntausende Tokens, die alle auf "js"
 *      oder "der" passten, und damit Rang 1 für einen Prompt über den Prompter.
 *   2. Das Budget wird nach Anteil verteilt (dieselbe Fairshare-Rechnung wie
 *      der Project Index), damit eine genannte grosse Datei die kleine
 *      genannte nicht verdrängt.
 */
```

## Kanon k-8a29e2b7759c {#k-8a29e2b7759c}

Fundstellen: packages/prompter/assets/index-manager.js:1–11

Volltext des gekürzten Blocks (Stand 2026-10-17):

```
/**
 * shinon-prompter-runtime-index — Index-Manager für den Prompter.
 *
 * Der Prompter pflegt SEINEN EIGENEN Index: hash-basiert, speichert Dateien
 * als { path, content, hash, tokens }, liefert Kontext passend zum Prompt.
 *
 * Keine Abhängigkeit vom Project Index mehr — der Prompter bleibt funktionsfähig,
 * auch wenn project-index nicht verfügbar ist.
 *
 * Persistenz: JSON-Datei auf Disk (load/save). Alle Operationen synchron.
 */
```

## Kanon k-dd7d8973d632 {#k-dd7d8973d632}

Fundstellen: packages/prompter/assets/mode-core.js:120–132

Volltext des gekürzten Blocks (Stand 2026-10-17):

```
/**
 * Der Aufstieg als DATEN: eine Zeile je Modus, in Stufenreihenfolge.
 *
 * Alles, was einen Modus ausmacht, steht hier — die zusaetzlichen Faehigkeiten
 * (`delta`), ob er Projektkontext BRAUCHT (`needsContext`) und welche Bloecke
 * sein System-Prompt zusaetzlich traegt (`extras`). `MODES`, `MODE_DELTAS`,
 * `MODE_CAPABILITIES` und `POLICIES` werden daraus ABGELEITET.
 *
 * Vorher lagen die Deltas in einer Tabelle und der Kontextbedarf als
 * `mode === 'MAX'` an fuenf Stellen im Code: ein vierter Modus haette fuenf
 * Aenderungen gebraucht, und eine vergessene Stelle haette still das Falsche
 * getan — MAX ohne Kontextregel, MIN mit Kontextblock.
 */
```

## Kanon k-e0e8bc1c4076 {#k-e0e8bc1c4076}

Fundstellen: packages/prompter/assets/note-core.js:233–249

Volltext des gekürzten Blocks (Stand 2026-10-17):

```
/**
 * Den Stand als EINEN Block rendern — Haltung, Tendenzen, passende Zettel.
 *
 * Der Stand ist eine Auskunft, keine Anweisung: er steht in eigenen Marken und
 * nennt seine Herkunft. Leere Teile FALLEN WEG statt leer dazustehen: ein
 * `<haltung>` ohne Haltung wäre eine Behauptung. Ist nichts davon da, kommt
 * `null` zurück — der Aufrufer hängt dann keinen Block an (kein leerer Block im
 * Prompt).
 *
 * ZUG 6 — die Narrative-Lage: der Composite der Narrative Engine kommt als
 * EIGENES Element `<narrative contract="…">` in den Stand. Er trägt seinen
 * Vertragsnamen als Herkunft und ist damit als gelesen ausgewiesen; die Engine
 * sagt selbst `authority: NONE` (abgeleitet ist nicht autoritativ), und dieses
 * Element behauptet deshalb nichts über die Welt — es sagt, wie der Takt
 * gelesen wurde. Nur die FELDER, die der Composite wirklich trägt: ein Arc, den
 * es nicht gibt, wird nicht erfunden.
 */
```

## Kanon k-38e83b11365d {#k-38e83b11365d}

Fundstellen: packages/prompter/assets/note-core.js:95–112

Volltext des gekürzten Blocks (Stand 2026-10-17):

```
/**
 * Die passenden Zettel wählen — über die Thema-Marke, nicht über eine Uhr.
 *
 * Der Heuhaufen ist das, was der Lauf WIRKLICH aufgelöst hat (Kontext und
 * Prompt). Ein Zettel lädt, wenn mindestens `minHits` seiner Thema-Begriffe dort
 * vorkommen. Ohne Heuhaufen lädt keiner: wer nichts aufgelöst hat, hat auch
 * keinen Anlass.
 *
 * Die Reihenfolge ist Teil des Vertrags: mehr Treffer zuerst, bei Gleichstand
 * die alphabetische Marke. Ohne diese Regel hinge die Auswahl an der Reihenfolge
 * des Dateisystems, und zwei Läufe mit demselben Kontext könnten zwei
 * verschiedene Stände laden.
 * @param entries - `{ file, note }`, so wie der Host sie liest (EINE Huelle je Zettel).
 *                  Die Huelle ist Teil der Form: ohne Datei waere ein Befund nicht
 *                  zuzuordnen, und ein Befund ohne Ort ist keine Auskunft.
 * @returns { loaded, skipped } — `loaded` sind die Hüllen (mit Trefferzahl),
 *          `skipped` nennt je Datei den Grund.
 */
```

## Kanon k-13a3df667889 {#k-13a3df667889}

Fundstellen: packages/prompter/assets/note-core.js:1–20

Volltext des gekürzten Blocks (Stand 2026-10-17):

```
/**
 * @shinon/prompter — Zettel-Kern (assets/note-core.js).
 *
 * KEINE Imports (weder Bare noch node:): nur dann läuft der Test in CI ohne
 * node_modules — dieselbe Regel wie bei `@shinon/scoring` (assets/scoring-core.js),
 * `@shinon/events` und `@shinon/codingmon`. `index.js` re-exportiert diesen Kern,
 * die Host-Anbindung (Dateien lesen) bleibt dort.
 *
 * WAS HIER STEHT: das Lesen und Prüfen der Zettel — Thema-Marke gegen den
 * aufgelösten Kontext, dann die drei Prüfungen (zu spitz, zu breit, doppelt).
 * WAS HIER NICHT STEHT: das Schreiben. Zettel erzeugt das ARBEITENDE Modell mit
 * seinen eigenen Werkzeugen; der Veredler liest und prüft, er erzeugt nichts und
 * ändert nichts. Deshalb gibt es hier keinen Datei-, keinen Netz- und keinen
 * Modellzugriff — jede Funktion ist rein: gleiche Eingabe, gleiches Ergebnis.
 *
 * Kein `Math.random`, kein `Date.now`: Thema-Marke und Prüfung entscheiden nach
 * INHALT und Reihenfolge, nie nach Zeit. Eine Auswahl, die von der Uhr abhinge,
 * wäre nicht nachrechenbar — und ein Zettel, der zufällig lädt, ist ein Zettel,
 * dem niemand trauen kann.
 */
```

## Kanon k-df74878c5180 {#k-df74878c5180}

Fundstellen: packages/prompter/assets/prompt-files.js:169–180

Volltext des gekürzten Blocks (Stand 2026-10-17):

```
/**
 * Ein Skill lesen: Name + Beschreibung + Use-When aus seinem Ordner.
 *
 * Ein Skill liegt in `.agents/skills/<name>/` mit einer `SKILL.md` (Frontmatter
 * oder freier Text). Das Feld, das die Auswahl steuert, ist die BESCHREIBUNG
 * (name + description + use-when) — nicht der Inhalt. Wie bei den Zetteln gilt:
 * nur was geladen wird, geht in den Block; was nicht passt, bleibt außen vor.
 *
 * Fail-Richtungen, wie beim Zettel: ein unlesbarer Ordner landet in `skipped`,
 * nicht in der Liste. Ein leerer Ordner ergibt `reason: SKILLS_EMPTY`, nicht
 * einen still leeren Block.
 */
```

## Kanon k-27780b8e524c {#k-27780b8e524c}

Fundstellen: packages/prompter/assets/prompt-files.js:60–73

Volltext des gekürzten Blocks (Stand 2026-10-17):

```
/**
 * Die Zettel eines Laufs lesen — Datei fuer Datei, in Namensreihenfolge.
 *
 * Kein Cache, und das ist Absicht: die Zettel SCHREIBT das arbeitende Modell
 * WAEHREND des Laufs. Ein Zwischenspeicher muesste an einer Uhr oder an einer
 * Aenderungszeit haengen, um eine geaenderte Datei zu bemerken — beides gibt es
 * hier nicht. Ein paar kleine Dateien je Schritt kosten weniger als ein
 * veralteter Stand.
 *
 * Was nicht gelesen werden kann, verschwindet nicht: es steht als Grund in
 * `skipped`. Eine stille Luecke waere hier die teure Variante — ein Modell, das
 * ohne seinen Zettel arbeitet und nicht weiss, warum.
 * @returns { notes, skipped, reason } — `notes` sind gepruefte Zettel mit Datei.
 */
```

## Kanon k-fb13497c3c56 {#k-fb13497c3c56}

Fundstellen: packages/prompter/assets/render-context.js:21–37

Volltext des gekürzten Blocks (Stand 2026-10-17):

```
/**
 * Die Marken des Blocks in einem DATEIINHALT entschaerfen.
 *
 * §15 sagt ausdruecklich: die XML-Markierung ist KEINE Sicherheitsgrenze. Das
 * stimmt — die Grenze ist die fehlende Faehigkeit (kein `tools`-Feld, siehe
 * buildEnhancerRequest). Aber die Markierung ist die einzige Auskunft darueber,
 * was Daten sind, und ein Inhalt, der die Marken SELBST traegt, hebt genau diese
 * Auskunft auf: er schliesst den Block vorzeitig, und alles danach liest das
 * Modell als Anweisung ausserhalb des Datenblocks. Das ist kein konstruierter
 * Fall — gemessen am echten Index dieses Repos: der Prompt, der die Plan-Datei
 * nennt, erzeugte ZWEI Abschluesse und 10431 Zeichen ausserhalb der Markierung.
 *
 * Entschaerft werden NUR die Marken des Blocks, nicht der Code: aus `a < b`
 * wird nichts, und eine Datei, die diese Zeichenfolgen als TEXT beschreibt (wie
 * die Plan-Datei selbst), bleibt lesbar — sie steht dann als Text im
 * Datenblock, was sie auch ist.
 */
```

## Kanon k-c9ae41353ef9 {#k-c9ae41353ef9}

Fundstellen: packages/prompter/assets/result-contract.js:135–148

Volltext des gekürzten Blocks (Stand 2026-10-17):

```
/**
 * Der Ausgang des Enhancers → seine Wirkung. Eine Tabelle statt verteilter
 * Praedikate (der Marker [DSH-Refactor] in der alten Fassung: `mode` wurde
 * zweimal geprueft, `outcome === 'accepted'` dreimal, und `MESSAGE_NOT_FOUND`
 * musste nachtraeglich aus `messages === null` geraten werden).
 *
 *   replacePrompt   nur `accepted` ersetzt den Prompt-Text im Schritt
 *   missingMessage  der Grund, wenn die Nachricht nicht auffindbar war — der
 *                   Ausgang heisst dann `rejected`, weil der Roh-Prompt gilt
 *
 * Die Tabelle ist ein Vertrag: sie deckt jeden Ausgang ab, den enhance() und
 * enhanceGuarded() erzeugen (geprueft im Abnahmetest), und sie ist die einzige
 * Stelle, an der ein Ausgang eine Wirkung hat.
 */
```

## Kanon k-d0ccc39c6bab {#k-d0ccc39c6bab}

Fundstellen: packages/prompter/assets/result-contract.js:96–106

Volltext des gekürzten Blocks (Stand 2026-10-17):

```
/**
 * Annahme-Policy (Plan §7). Das Modellergebnis wird nie direkt uebernommen:
 * jedes genannte Kriterium verwirft und laesst den Roh-Prompt gelten.
 *
 * Die Anforderungs-Regeln gelten in JEDEM Modus — das ist die Zusage „MIN/MID
 * ändern keine Anforderungen", und sie gilt auch für MAX: Kontext erweitert den
 * Blick, nicht den Auftrag. MAX kommt genau eine Regel hinzu: Referenzen muessen
 * im gelieferten Kontext aufloesbar sein — und nur MAX kennt das Feld ueberhaupt
 * als Pflicht (siehe resultSchema). Wo es fehlt, ist die Regel gegenstandslos,
 * nicht verletzt.
 */
```

## Kanon k-0be2944b10a1 {#k-0be2944b10a1}

Fundstellen: packages/prompter/assets/result-contract.js:63–76

Volltext des gekürzten Blocks (Stand 2026-10-17):

```
/**
 * Ist die Referenz eine relative Schreibweise eines GELIEFERTEN Pfads?
 *
 * Gemessen im Profil-Lauf 2026-10-16: der Runtime-Index liefert ABSOLUTE Pfade
 * (`/home/vannon/…/packages/prompter/index.js`), das Modell nennt die Datei so,
 * wie ein Mensch sie nennt (`packages/prompter/index.js`) — und die Referenz galt
 * als unbekannt, obwohl die Datei im Kontext stand. Das Protokoll meldete
 * "Unbekannte Referenzen ignoriert" für genau die Datei, ueber die der Prompt
 * ging.
 *
 * Verlangt wird ein Treffer an einer VERZEICHNISGRENZE: der gelieferte Pfad
 * endet auf `/<Referenz>`. Damit ist eine relative Schreibweise derselben Datei
 * aufloesbar, ein erfundener Pfad bleibt es nicht.
 */
```

## Kanon k-8b2fcb37ec27 {#k-8b2fcb37ec27}

Fundstellen: packages/prompter/assets/schema.js:88–103

Volltext des gekürzten Blocks (Stand 2026-10-17):

```
/**
 * Hook-Konfiguration (Schemastery).
 *
 * `provider`/`model` sind der Route-Schluessel des One-Shots und kommen aus dem
 * Profil, nicht aus dem Paket. Bleiben sie leer, gibt es keinen Aufrufweg — das
 * wird gemeldet (`NO_ROUTE`), nicht stillschweigend als Erfolg verbucht.
 *
 * `contextPath` ist der definierte Kontext-Input fuer MAX: eine JSON-Datei in der
 * Form von `ContextSchema`, relativ zum Paket aufgeloest. Leer heisst nicht mehr
 * „MAX gibt es nicht": dann wird der Project Index gefragt (`INDEX_SERVICE`),
 * und MAX gilt, wenn eine der beiden Quellen einen Kontext liefert. Der
 * Entscheidungsdatensatz nennt, WELCHE (`context_source`). Eine konfigurierte,
 * aber kaputte Datei sperrt MAX dagegen weiterhin (`CONTEXT_INVALID`) — eine
 * ausdrueckliche Angabe, die nicht stimmt, darf nicht stillschweigend auf eine
 * andere Quelle ausweichen.
 */
```

## Kanon k-941496eaef11 {#k-941496eaef11}

Fundstellen: packages/prompter/assets/schema.js:13–34

Volltext des gekürzten Blocks (Stand 2026-10-17):

```
/**
 * Der Resultatvertrag (Plan §7), je Modus.
 *
 * `required()` ist hier keine Formalie, sondern trägt die Sicherheit: in
 * Schemastery sind Objekt-Schlüssel **optional**, und ein fehlendes `z.array()`
 * wird still mit `[]` gefüllt (gemessen an 3.18.4). Ohne `required()` würde ein
 * Modell, das `addedRequirements` einfach weglässt, als "nichts hinzugefügt"
 * durchgehen — die Lücke sähe genau wie Compliance aus. Mit `required()` ist ein
 * fehlendes Feld ein Schemafehler und führt zum Roh-Prompt.
 *
 * Für `references` gilt genau das NUR in MAX. Das Feld gehört zum MAX-Auftrag
 * (`references.code`) und wird nur dort gelesen: `acceptance()` prüft jede
 * Referenz gegen den gelieferten Kontext. In MIN und MID bedeutet ein fehlendes
 * Feld nichts, und ein Pflichtfeld kostet dort eine sonst einwandfreie Antwort —
 * gemessen am 2026-10-08: `SCHEMA_INVALID:$.references missing required value`
 * bei `mode=MIN`, der Roh-Prompt galt. Deshalb ist die Pflicht an den Modus
 * gebunden, in dem der Wert konsumiert wird. Was bleibt: ein ANWESENDES, aber
 * falsches Feld (etwa `null`) wird in jedem Modus abgelehnt.
 *
 * `intentClassification` ist keine Empfehlung an das Modell, sondern Daten: nur
 * diese fünf Werte passieren. Eine unbekannte Klasse wird verworfen.
 */
```

## Kanon k-e366b30efdaa {#k-e366b30efdaa}

Fundstellen: packages/prompter/assets/selection.js:84–102

Volltext des gekürzten Blocks (Stand 2026-10-17):

```
/**
 * Die Antwort des Agenten prüfen — streng, fail-closed.
 *
 * Prüfungen in fester Reihenfolge (jede gibt einen benannten Grund):
 *   KEIN_JSON       nicht-parsbares JSON
 *   VERTRAG_FREMD   falscher oder fehlender contract
 *   UNSICHERHEIT    kein Zahlwert 0..1 (Vektor der Unsicherheit)
 *   LEERE_AUSWAHL   selected nicht als Array (leer erlaubt — dann greift der Fallback)
 *   ID_UNBEKANNT    id nicht in der erlaubten Liste (der Kern des Vertrags)
 *   NICHT_ERLAUBT   der Kandidat ist für den gegebenen Modus NICHT freigegeben (id)
 *   PFLICHT_FEHLT   eine Pflicht-ID fehlt bei nicht-leerer Auswahl (id)
 *   BUDGET          Aufruftrag-Budgetverletzung (Kandidat > Gesamtbudget)
 *
 * @param text     - die Rohantwort (oder ein Objekt, schon geparst)
 * @param allowed - die erlaubten { id, budgetTokens, modus?, pflicht? } der Situation
 * @param opts    - { totalBudgetTokens, mode } — ohne `mode` wird die
 *                  Modus-Freigabe übersprungen (der Host schickt ihn immer)
 * @returns { ok: true, selected, uncertainty } | { ok: false, reason }
 */
```

## Kanon k-fd1f300dd9ba {#k-fd1f300dd9ba}

Fundstellen: packages/prompter/assets/selection.js:1–21

Volltext des gekürzten Blocks (Stand 2026-10-17):

```
/**
 * @shinon/prompter — selection.js (Slice 1: Selektionsarchitektur).
 *
 * KEINE Imports (weder Bare nor node:): dieselbe Regel wie `note-core.js` —
 * die Vertragsprüfung läuft in CI ohne node_modules.
 *
 * WAS HIER STEHT: der SELEKTIONSVERTRAG (`shinon.selection/v1`). Ein kleiner
 * Selektionsagent bekommt pro Schritt nur KOMPAKTE Beschreibungen der
 * Bausteine (id, lage, budget, kanalischer Zusammус), niemals deren vollen
 * Text — Inhalt lädt die Runtime erst NACH der Auswahl. Die Antwort muss ein
 * strenges JSON sein; was den Vertrag verletzt, wird verworfen (fail-closed)
 * und die deterministische Auswahl bleibt der Rückfall.
 * WAS HIER NICHT STEHT: kein Modell, kein Netz, kein Dateisystem — nur Bauen,
 * Prüfen, Entscheiden-über-Form. Der Modellaufruf selbst bleibt im Host (so wie
 * beim Enhancer), die Antwortprüfung ist hier, damit sie ohne node_modules
 * testbar ist.
 *
 * DIE EINE REGEL: Der Agent schlägt vor, die Runtime setzt Verträge durch.
 * Unbekannte IDs verwirft die Runtime; Bausteine, die der aktuelle Modus
 * nicht erlaubt, verwirft sie; Grenzen (Budget, Unsicherheit) setzt sie selbst.
 */
```

## Kanon k-8f36ddaa4a12 {#k-8f36ddaa4a12}

Fundstellen: packages/prompter/assets/workspace.js:1–22

Volltext des gekürzten Blocks (Stand 2026-10-17):

```
/**
 * @shinon/prompter — workspace.js
 *
 * DIE EINE QUELLE der Workspace-Identität (S1).
 *
 * Bis hierher bestimmte `process.cwd()` stillschweigend die Projektidentität —
 * verstreut über `prompt-files.js`, `index.js` und `index-manager.js`. Wer aus
 * einem anderen Ordner startete, las einen anderen Index, andere Skills, andere
 * Zettel — ohne dass ein Test es merkte. Diese Datei benennt die Quelle EINMAL:
 *
 *   explizite Config `workspaceRoot` > Env `SHINON_WORKSPACE_ROOT` > `cwd`.
 *
 * Dazu die Grenzen: `resolveInRoot` lehnt `..`, absolute Pfade und
 * Separatorvarianten ab, die aus der Root ausbrechen; `checkRealpathInside`
 * stoppt Symlink-Ausbrüche an der Realpath-Grenze; `fingerprintRoot` gibt die
 * überprüfbare Root-Identität, an die persistierte Indexe gebunden werden;
 * `reconcileEntries` entfernt Veraltetes, statt es aus JSON zurückkehren zu
 * lassen.
 *
 * Nur Node-Builtins (`node:path`, `node:crypto`, `node:fs` für den Realpath) —
 * keine Bare-Imports, damit die Tests in CI ohne `node_modules` laufen.
 */
```

## Kanon k-f618ee270fae {#k-f618ee270fae}

Fundstellen: packages/prompter/client.js:1–12

Volltext des gekürzten Blocks (Stand 2026-10-17):

```
/**
 * @shinon/prompter — Client-Hälfte: Trace-Panel.
 *
 * Zeigt die letzten Prompter-Entscheidungen (Outcome, Modus, Gründe, Kontextquelle).
 * Host→Client läuft über den Kanal, nicht über das Fenster: der Host emittiert
 * jeden Datensatz auf `DECISION_CHANNEL`, und diese Hälfte spiegelt ihn nach
 * `window.__shinonPrompterTrace` (Fenster-Konvention, wie `window.__codingmon`
 * bei @shinon/codingmon). Der Host schreibt NUR im In-Prozess-Fall selbst ins
 * Fenster — in Produktion (Host in Node, Panel im Browser) käme sein `window`
 * nie auf der Seite an, und das Panel bliebe ewig leer (gemessen 2026-10-17:
 * `verworfen (NO_JSON)` im Terminal, „Keine Entscheidungen" im Panel).
 */
```

## Kanon k-7bf397ab7eeb {#k-7bf397ab7eeb}

Fundstellen: packages/prompter/index.js:296–310

Volltext des gekürzten Blocks (Stand 2026-10-17):

```
/**
 * Provenienz-Datensatz: was entschieden wurde, ohne den Prompt-Text zu kopieren.
 * Genau einer pro Schritt — auch im Randfall, damit die Spur nicht doppelt laeuft.
 *
 * `session_id` traegt die Zuordnung, nicht den Inhalt: der Task Router (§17) muss
 * die Klassifikation einem LEBENDEN Agenten zuordnen, und `ctx.goals` akzeptiert
 * nur die exakte Instanz der Registry — ueber die Sitzung ist sie eindeutig.
 * Ohne dieses Feld waere die Zuordnung ein Raten nach Reihenfolge.
 *
 * `context_source` nennt die QUELLE, die den Kontext geliefert hat (`index` |
 * `file` | `none`), waehrend `context` sagt, wie es ihr erging. Zwei Felder, weil
 * es zwei Fragen sind: „hat MAX einen Kontext benutzt" und „woher kam er".
 * Ohne das zweite waere ein Indexkontext von einer Datei nicht zu unterscheiden,
 * und die Naht nicht nachpruefbar.
 */
```

## Kanon k-cf83279e4d43 {#k-cf83279e4d43}

Fundstellen: packages/prompter/index.js:179–195

Volltext des gekürzten Blocks (Stand 2026-10-17):

```
/**
 * Den MAX-Kontext aus dem Project Index holen.
 *
 * Die Faehigkeit ist OPTIONAL und ihre Antwort ist eine Behauptung, bis sie
 * geprueft ist. Deshalb vier Richtungen, jede mit eigenem Grund:
 *
 *   kein Dienst        `MODE_NEEDS_CONTEXT` — es gibt keine Quelle. Das ist der
 *                      Normalfall in einem Profil ohne Project Index, kein Fehler.
 *   falscher Vertrag   `CONTEXT_INVALID` — wer unter diesem Namen etwas anderes
 *                      anbietet, liefert keine Projektkenntnis.
 *   `null`             `MODE_NEEDS_INDEX` — der Index ist noch nicht da. Eine
 *                      eigene Ursache, weil sie sich von selbst behebt: der
 *                      naechste Schritt hat ihn.
 *   unbrauchbar        `CONTEXT_INVALID` — Wurf oder Formverstoss. Geprueft wird
 *                      gegen DENSELBEN `ContextSchema` wie die Datei, damit es
 *                      fuer MAX genau eine gueltige Form gibt.
 */
```

## Kanon k-b7a8cb95e475 {#k-b7a8cb95e475}

Fundstellen: packages/task-router/index.js:309–322, packages/prompter/index.js:127–140

Volltext des gekürzten Blocks (Stand 2026-10-17):

```
/**
 * Die letzte MENSCHLICHE Nachricht mit Text — oder null.
 *
 * `source.kind === 'user'` ist der Unterschied zwischen Eingabe und Harness: der
 * Batch eines Schritts besteht oft AUSSCHLIESSLICH aus erzeugtem Kontext (Zeit,
 * Terminal, Instruktionen, Erinnerungen, Werkzeug-Feedback). Ohne diesen Test
 * waere die jeweils letzte Nachricht irgendein Harness-Text — und der wuerde
 * veredelt und ersetzt (Enhancer) bzw. als Auftrag gelesen (Router). Fremde
 * Herkunft heisst deshalb: nicht anfassen.
 *
 * Die Nachricht kommt MIT zurueck, weil ein Aufrufer sie ueber ihre Identitaet
 * wiederfinden muss — ueber einen Index zu raten waere ein stiller Fehler. Der
 * Text ist UNGETRIMMT; was ein Aufrufer davon will, entscheidet er.
 */
```

## Kanon k-914a925b339b {#k-914a925b339b}

Fundstellen: packages/prompter/index.js:111–122

Volltext des gekürzten Blocks (Stand 2026-10-17):

```
/**
 * Die Dienste, die dieser Host braucht. Ohne deklarierte Injektion verweigert
 * Cordis den Zugriff auf `ctx.llm` (live gemessen im echten Boot: „cannot get
 * property \"llm\" without inject"). Der Fehler wurde korrekt zu einem
 * Verwerfen — der Host lief weiter und der Roh-Prompt galt —, aber der Enhancer
 * hat nie etwas veredelt, und ohne sichtbaren Lauf waere das nicht aufgefallen.
 * Genau so deklarieren es die mitgelieferten Hostplugins (dsh-agent-instructions
 * exportiert `inject` neben `Config` und `apply`).
 *
 * Nebenwirkung, die dazugehoert: ohne `llm`-Dienst wird dieser Host gar nicht
 * erst montiert — er kann ohne ihn nichts tun. Der Hook bleibt unabhaengig davon.
 */
```

## Kanon k-f4c0e94d7ce6 {#k-f4c0e94d7ce6}

Fundstellen: packages/prompter/index.js:49–109

Volltext des gekürzten Blocks (Stand 2026-10-17):

```
/**
 * shinon-prompter — der interne One-Shot Prompt Enhancer.
 *
 *   agent/pre-step
 *     → dieser Hook
 *     → One-Shot-Child  (ctx.llm.stream, KEINE Tools)
 *     → strukturiertes Ergebnis
 *     → Host-Validierung (Schema + Policy)
 *     → übernommener oder verworfener Prompt
 *
 * Verifizierte Grundlage — installiertes DSH 0.2.0-rc.2, nichts davon geraten:
 *
 *   LLM           ctx.llm: LlmRuntime (@deepseek-ai/dsh-llm)
 *                 stream(options: GenerateOptions): AsyncIterable<StreamChunk>
 *                 GenerateOptions: provider, model, messages: RequestMessage[],
 *                 system?, tools?, temperature?, maxTokens?, stop?, signal?,
 *                 sessionId?, purpose?: 'compaction' | 'session-title'
 *   One-Shot      RequestUserInput = { role: 'user', content, id?: never, source?: never }
 *                 Die Doku nennt den Fall ausdrücklich: „a hand-built one-shot may
 *                 include identity-free user inputs."
 *   Stream        StreamChunk u. a. { type: 'text-delta', index, text }
 *   Seam          agent/pre-step, @mode waterfall (siehe @shinon/hook für die
 *                 vollständige Signatur-Verifikation)
 *
 * ZWEI DINGE, DIE DSH NICHT HAT — und die deshalb hier liegen, statt erfunden
 * zu werden:
 *
 *   1. Kein Structured Output. Es gibt in der ganzen Installation kein
 *      `json_schema`, `response_format` oder `generateObject`. Die
 *      Schema-Durchsetzung ist damit zwangsläufig host-seitig: extrahieren,
 *      parsen, validieren, sonst verwerfen.
 *   2. Keine Modus-Semantik für Prompts. MIN/MID/MAX sind keine DSH-Konzepte,
 *      sondern unser Vertrag. Er steht deshalb als DATEN in MODE_CAPABILITIES,
 *      und die System-Prompts werden daraus ERZEUGT (policyFor). Ein separater
 *      Prompt-Text könnte von der Fähigkeitsliste abdriften; ein erzeugter
 *      nicht. Was dieser Vertrag NICHT behauptet: dass ein Modell sich daran
 *      hält. Prüfbar sind die Fähigkeitsliste, der erzeugte Text und die
 *      Annahme-Regeln — nicht der Gehorsam eines Modells.
 *
 * WER IST DER MENSCH? — der Seam liefert NICHT nur Nutzereingaben. Gemessen in
 * DSH 0.2.0-rc.2 reisen mindestens zwanzig Harness-Produzenten als
 * `role: 'user'`-Nachricht durch denselben Batch (`user-approval`,
 * `time-context`, `agent-instructions`, `repeat-tool-reminder`, `ptc-mode` …; die
 * Werkzeug-Kontexte kommen ueber `additionalContexts` der Werkzeuge). Die
 * Menschen erkennt man an `source.kind === 'user'` — genau diesen Test benutzt
 * DSH selbst (der API-Session-Controller raeumt Datei-Uploads damit auf, und der
 * UI-Weg setzt `{ kind: 'user', rpcId, clientTimeZone }`). Ohne die Pruefung
 * haelt der Enhancer Harness-Text fuer die Nutzereingabe und ersetzt ihn: eine
 * umformulierte Freigabe-Antwort („ja") ist eine geaenderte Entscheidung, keine
 * Stilfrage.
 *
 * CAPABILITY-ISOLATION (die eigentliche Sicherheitsgrenze): der One-Shot-Child
 * bekommt **kein `tools`-Feld**. Es gibt keinen Werkzeugkatalog, den man
 * einschränken könnte — die Liste ist leer, weil sie nicht existiert. Damit
 * fehlen Dateisystem, Shell, Subprozess, Terminal, Browser, beliebige Tools und
 * verschachtelte Agent-Steuerung nicht durch eine Policy, sondern durch
 * Abwesenheit. Ein XML-Tag wäre keine Grenze; das ist eine. Die
 * `<untrusted_project_context>`-Markierung aus Plan §15 ist ausdrücklich KEINE
 * Sicherheitsgrenze — sie sagt dem Modell, was Daten sind. Die Grenze bleibt die
 * fehlende Fähigkeit.
 */
```

## Kanon k-7f580637ddfa {#k-7f580637ddfa}

Fundstellen: packages/prompter/test/block-propose.test.mjs:2–13

Volltext des gekürzten Blocks (Stand 2026-10-17):

```
/**
 * block-propose.test.mjs — die Agenten-Sequenz (Phase 4) als Weg.
 *
 * Vorschlag → Prüfung (zu spitz mit Datum/Sitzung/Absolutpfad, zu breit,
 * doppelt via geteilte Begriffe plus Themenmarke) → Aktivierung. Wie
 * `reviewNotes`, aber Ende-zu-Ende: Ablehnung lässt die Registry unberührt,
 * Annahme landet in der Projekt-Ablage, wirkt in der Auswahl und überdauert
 * den Neustart.
 *
 * Läuft mit `node --test` (braucht node_modules für Schemastery, wie unter
 * `npm test` vorhanden); kein Netz, kein Modell, kein DSH.
 */
```

## Kanon k-9ed5e7ce90f6 {#k-9ed5e7ce90f6}

Fundstellen: packages/prompter/test/block-select.test.mjs:1–11

Volltext des gekürzten Blocks (Stand 2026-10-17):

```
/**
 * block-select.test.mjs — der Baustein-Selektor (Phase 2).
 *
 * Gepinnt wird: Registry lädt und prüft, Pflicht steht immer, Modus filtert,
 * Haystack/Intent/Trigger lösen aus, Budgets deckeln, Auswahl ist
 * deterministisch, der Entscheidungsanteil trägt keinen Prompt-Text, und das
 * Modul nutzt kein Modell (statisch geprüft).
 *
 * Läuft mit `node --test`; kein Netz, kein Modell, kein node_modules nötig
 * (das Modul hat keine Imports — dieselbe Regel wie note-core).
 */
```

## Kanon k-f49a33fc9647 {#k-f49a33fc9647}

Fundstellen: packages/prompter/test/note-core.test.mjs:2–18

Volltext des gekürzten Blocks (Stand 2026-10-17):

```
/**
 * Zettel-Kern des Veredlers (Zug 4) — ohne DSH, ohne Netz, ohne Modell.
 *
 * Belegt wird, was der Kern ZUSAGT und was er VERWEIGERT:
 *   - Ein Zettel ohne Feld, mit leerem Feld, fremdem Vertrag oder unbekannter
 *     Fassung ist KEIN Zettel (fail-closed) — es gibt keine Reparatur.
 *   - Geladen wird über die Thema-Marke im aufgelösten Kontext; ohne Treffer
 *     gibt es einen Grund, keine stille Lücke.
 *   - Die Auswahl ist deterministisch: gleicher Kontext, gleiche Reihenfolge.
 *   - Die drei Prüfungen treffen ihre Grenze genau: ein Dateiname zu viel ist
 *     zu spitz, ein Begriff zu wenig ist zu breit, gleicher Inhalt bei
 *     gleichem Thema ist doppelt.
 *   - Der gerenderte Stand ist Daten: kein Zettel kann die Markierung
 *     schließen, und ein leerer Stand wird gar nicht erst gebaut.
 *
 * Läuft mit `node --test` (`npm run test:prompter`) — kein DSH, kein Netz.
 */
```

## Kanon k-0d1e79ab85b8 {#k-0d1e79ab85b8}

Fundstellen: packages/prompter/test/route-fallback.test.mjs:2–12

Volltext des gekürzten Blocks (Stand 2026-10-17):

```
/**
 * route-fallback.test.mjs — die wirksame One-Shot-Route (Phase 5).
 *
 * Gepinnt wird: eigener Schlüssel → Primärroute; fehlender Schlüssel +
 * konfiguriertem Fallback → Fallback; ohne beides → Primärroute (dann meldet
 * der Enhancer NO_ROUTE und der Roh-Prompt gilt — unveraendertes Fail-open).
 * Der Name der Umgebungsvariable kommt aus der Config (nie ein Wert in der
 * Config) — dieselbe Regel wie beim Key-Router.
 *
 * Läuft mit `node --test`; kein Netz, kein Modell.
 */
```

## Kanon k-7c72da4327b9 {#k-7c72da4327b9}

Fundstellen: packages/prompter/test/runtime-index.test.mjs:2–17

Volltext des gekürzten Blocks (Stand 2026-10-17):

```
/**
 * Runtime-Index des Prompter — ohne DSH, ohne Netz, ohne Modell.
 *
 * Belegt wird, was der Index-ZUSTAND garantiert:
 *   - Erstellen, Speichern, Laden mit Vertrag.
 *   - Hash-basierte Deduplikation: gleicher Inhalt = gleicher Hash = kein Double.
 *   - Token-Präfix-Matching: "test" trifft auf "tests", "testen", ...
 *   - Nur Treffer werden geliefert (score > 0).
 *   - Größenbudget: Datei über MAX_FILE_CHARS und Inhalt über MAX_INDEX_CHARS
 *     wird nicht aufgenommen — jeder Ausschluss trägt einen Grund (ZU_GROSS,
 *     BUDGET_ERSCHOEPFT), der Schnitt ist sortiert und damit deterministisch.
 *   - Intent-Matching: Handlungsphrase → Expansion; Themenwort und Frage → null
 *     bzw. Klassifikation ohne Expansion (der Agent antwortet, statt zu handeln).
 *
 * Läuft mit `node --test` — kein DSH, kein Netz.
 */
```

## Kanon k-d8a521ca0e5a {#k-d8a521ca0e5a}

Fundstellen: packages/prompter/test/selection.test.mjs:2–17

Volltext des gekürzten Blocks (Stand 2026-10-17):

```
/**
 * selection.test.mjs — der Selektionsvertrag (Slice 1).
 *
 * Gepinnt wird: Die Antwort des Selektionsagenten wird streng aufghalten —
 * falsches JSON, fremder Vertrag, Unsicherheit ausserhalb 0..1, nicht-Array,
 * unbekannte IDs und Budgetverletzungen fallen jeweils mit eigenem Grund
 * aus; leeres `selected` bleibt gueltig (der Fallback uebernimmt); Kandidaten,
 * die der Runtime gezeigt werden, tragen NIE Inhalt.
 *
 * Schlüsselzustände und die unveränderte Haupt-Route stehen bereits in
 * `route-fallback.test.mjs` (Primärroute/Fallback ohne Schlüssel) und werden
 * hier nicht doppelt abgebildet; die Unberührtheit des Haupt-Turns pinnt der
 * Gate-Test `profile-config-override` (provider ≠ prompter).
 *
 * Läuft mit `node --test`; kein Netz, kein Modell, kein node_modules nötig.
 */
```

## Kanon k-f51318a25fd4 {#k-f51318a25fd4}

Fundstellen: packages/prompter/test/workspace.test.mjs:2–17

Volltext des gekürzten Blocks (Stand 2026-10-17):

```
/**
 * Workspace-Vertrag (S1) — Negativtests zuerst.
 *
 * Ein Prompt-Enhancer mit falschem Projektkontext ist kein Enhancer, sondern
 * eine Verwechslung. Diese Tests erzwingen den Vertrag, bevor der Code ihn
 * erfüllt:
 *   - zwei Workspaces mit gleichen relativen Pfaden haben verschiedene Identitäten,
 *   - ein Index aus Projekt A wird in Projekt B abgelehnt (FOREIGN_ROOT),
 *   - `..`, absolute Pfade und Separatorvarianten brechen nicht aus der Root aus,
 *   - ein Symlink aus der Root heraus wird an der Realpath-Grenze gestoppt,
 *   - gelöschte/umbenannte Dateien kehren nicht aus dem JSON-Index zurück (stale),
 *   - `.agents/skills/` wird nicht als gewöhnlicher Quelltext indexiert (kein Doppel),
 *   - unbekannte Referenzen vernichten nicht den richtigen Kontext.
 *
 * Kein DSH, kein Netz, kein Modell — nur reine Funktionen + Temp-Verzeichnisse.
 */
```

## Kanon k-dbfe85cfd222 {#k-dbfe85cfd222}

Fundstellen: packages/scoring/assets/block-weights.js:1–19

Volltext des gekürzten Blocks (Stand 2026-10-17):

```
/**
 * @shinon/scoring — Block-Gewichte (assets/block-weights.js).
 *
 * KEINE Imports (weder Bare noch node:): nur dann läuft der Test in CI ohne
 * node_modules — dieselbe Regel wie `scoring-core.js` und `note-core.js`.
 * Der Host (`index.js`) besitzt den Zustand, dieser Kern die Rechnung.
 *
 * WAS HIER STEHT: aus den vorhandenen Signalen Erfolgszähler je Baustein.
 * Urteil (copy/selffix), Turn-Ende (accept/dismiss) und Widerruf (retract)
 * tragen Polarität; die Sitzungsbemerkung (note) hat keinen Pol und wird
 * beobachtet, aber nie gewertet — genau wie in der Signaltabelle.
 * WAS HIER NICHT STEHT: kein Modell, keine Uhr, kein Dateisystem. Unbekannte
 * Signale und unbekannte Bausteine ändern nichts (fail-closed).
 *
 * DIE EINE REGEL (Phase 3): das Gewicht ordnet nur INNERHALB der
 * Haystack-Relevanz — es ersetzt sie nie. Der Selektor sortiert nach
 * (Pflicht, Treffer, Gewicht, id); ein höherer Treffer schlägt jedes Gewicht.
 * Lernen ordnet, rät nicht.
 */
```

## Kanon k-8c408ccbe0ca {#k-8c408ccbe0ca}

Fundstellen: packages/scoring/assets/scoring-core.js:538–567

Volltext des gekürzten Blocks (Stand 2026-10-17):

```
/**
 * Der Sammler: haelt das Protokoll der Signale und den Zustand je Sitzung.
 *
 * Zustand je Sitzung ist das, was ein Signal braucht — nichts weiter: die
 * zuletzt gesehene Frage (fuer die Wiederholung) und zwei Zaehler fuer die Spur.
 * `forgetSession` raeumt ihn auf, ein neues `session.created` schliesst die
 * Sitzung ab (der Merkzettel geht, es entsteht KEINE leere Huelle — eine Huelle
 * ohne Inhalt waere nur Ballast, der sich ueber die Laufzeit ansammelt), und
 * `closeAllSessions` schliesst alle offenen, wenn der Host endet. DSH kennt im
 * Spine kein Sitzungsende-Ereignis — das ist eine benannte Luecke, und deshalb
 * ist der PROZESS die Grenze: was der Host noch weiss, schliesst er selbst ab,
 * statt eine Ereignisform zu erfinden, die es nicht gibt.
 *
 * Die Tafel entsteht aus dem Protokoll: `replay` ueber alle Zeilen. Ein Widerruf
 * ist damit exakt — die Zeile faellt weg, der Rest wird neu gerechnet, und altes
 * Evidence verblasst weiter nach dem Vertrag. Genau diese Eigenschaft traegt den
 * Neustart: das Protokoll ist die Wahrheit, die Tafel ist daraus hergeleitet,
 * und was nicht mehr im Protokoll steht, zaehlt auch nach dem Laden nicht mehr.
 *
 * WAS HIER NICHT HINEINGEHOERT: das Schreiben. Der Sammler kennt keine Datei,
 * keine Datenbank und keine Zeit. Er MELDET seinen Stand (`onPersist`) — wohin
 * er geht, entscheidet der Host. Ein reiner Kern, der den Rueckruf nicht
 * bekommt, verhaelt sich exakt wie vorher (er rechnet im Speicher).
 *
 * EINE HUELLE OHNE INHALT IST KEIN ZUSTAND: im Speicher entsteht fuer jede
 * Sitzung, die ein Ereignis hatte, ein Merkzettel (auch ohne Frage — die
 * Zaehler brauchen ihn). Geschrieben wird er nur, wenn er eine Frage kennt: er
 * ist sonst nur Ballast, der sich ueber die Laufzeit zu einer Zeile je Sitzung
 * summierte, und er sagt nichts, was nicht schon "kein Merkzettel" sagt.
 */
```

## Kanon k-bd6814cf86c3 {#k-bd6814cf86c3}

Fundstellen: packages/scoring/assets/scoring-core.js:446–472

Volltext des gekürzten Blocks (Stand 2026-10-17):

```
/**
 * Die Tendenz aus dem Protokoll ableiten — rein und datengetrieben.
 *
 * Warum das hier steht und nicht in der Persona: die Tendenz ist eine Aussage
 * ueber das PROTOKOLL (was ist passiert), nicht ueber den Ton (wie klingt das).
 * Wer sie liest — Prompter, Persona — entscheidet ueber die Wirkung; hier steht
 * nur die Rechnung. Kein `Math.random`, kein `Date.now`, kein Modell: dieselben
 * Zeilen ergeben dieselbe Tendenz.
 *
 * Was die Regeln liefern (`assets/tendency-rules.json`):
 *   classes   — welche Signale eine Klasse speisen und welchen Pol sie traegt
 *   levels    — Anteil → Wort, absteigend; die letzte Stufe traegt 0
 *   stances   — geordnete Bedingungen ueber diese Worte; die erste passende gilt
 *   minSignals— darunter wird NICHTS behauptet (fail-closed, kein Duennschluss)
 *
 * ZWEI ZAHLEN, nicht eine: `signals` ist das GANZE Protokoll (ehrliche Summe),
 * `counted` ist die Evidenzlage, auf der die Anteile und die Mindestevidenz
 * rechnen — naemlich die Zeilen, die eine Klasse auch liest. Eine Zeile aus
 * einer aelteren Regel (ein Signal, das heute keine Klasse fuehrt) darf die
 * Anteile nicht verwaessern, aber sie darf auch keine Haltung erzeugen; sie
 * steht als `unmatched` sichtbar da. Zurueckgenommenes zaehlt gar nicht mit:
 * ein Widerruf nimmt die Zeile aus dem Protokoll, und was nicht mehr dasteht,
 * faerbt die Tendenz nicht.
 * @param tendency - der Vertrag `assets/tendency-rules.json`.
 * @param records - die Protokollzeilen des Sammlers (`kind: 'score'`).
 * @returns { contract, ready, signals, counted, unmatched, counts, shares, levels, stance, reason }
 */
```

## Kanon k-3888533791a6 {#k-3888533791a6}

Fundstellen: packages/scoring/assets/scoring-core.js:331–341

Volltext des gekürzten Blocks (Stand 2026-10-17):

```
/**
 * Ein Ereignis des Spines in ein Signal uebersetzen. Rein: der Sitzungszustand
 * kommt als Argument herein, nicht als Modulzustand.
 *
 * Rueckgabe:
 *   kind      'score' (es gibt ein Ereignis fuer den Replay), 'retract' (eine
 *             Zeile wird zurueckgenommen), 'note' (beobachtet, nie gewertet)
 *   event     das Ereignis fuer den Replay — oder null
 *   reason    benannter Grund, wenn NICHTS passiert (jeder Grund ist ein Test wert)
 *   question  der gerade gesehene Menschen-Text (der Host merkt ihn sich)
 */
```

## Kanon k-caec6905770f {#k-caec6905770f}

Fundstellen: packages/scoring/assets/scoring-core.js:211–230

Volltext des gekürzten Blocks (Stand 2026-10-17):

```
/**
 * ── Signale (K5): aus dem internen Ereignisstrom zur Scorecard ───────────────
 *
 * Diese Schicht LIEST den Strom, den der Spine emittiert, und uebersetzt ihn
 * nach der Signaltabelle (assets/signal-rules.json) in die Ereignisse, die der
 * Replay oben schon kennt. Nichts davon ist geraten:
 *
 *   - Nur was in der Tabelle steht, erzeugt ein Signal. Alles andere ergibt
 *     einen benannten Grund und aendert nichts (fail-closed).
 *   - Menschen-Text ist nur Text mit `data.source.kind === 'user'` — gemessen
 *     an den echten Sitzungsereignissen traegt Harness-Text ('agent-instructions',
 *     'runtime-context') denselben Typ user/message. Ohne die Marke zaehlt er nicht.
 *   - Wiederholung wird am INHALT gemessen (gemeinsame und ueberlappende Woerter),
 *     nicht an der Uhr: kein Date.now, keine Sekundenregel.
 *   - Der Widerruf rechnet exakt: die Zeile verschwindet aus dem Protokoll und die
 *     Tafel wird aus dem Rest neu nachgerechnet — kein Gegen-Delta, kein Rest.
 *
 * Die Funktionen hier sind rein und deterministisch (keine Imports, keine Zeit,
 * kein Zufall): dieselbe Folge von Ereignissen ergibt dieselbe Tafel.
 */
```

## Kanon k-de37b8714556 {#k-de37b8714556}

Fundstellen: packages/scoring/assets/scoring-core.js:85–95

Volltext des gekürzten Blocks (Stand 2026-10-17):

```
/**
 * Ein Event, ein Übergang. Reihenfolge pro Event: prüfen (Typ, Payload,
 * Relation) — dann erst mutieren (Decay, Delta, Kühlen). Eine fehlgeschlagene
 * Prüfung lässt den Zustand byte-identisch.
 *
 * `event.weight` skaliert das Delta (Vorgabe 1). Der Faktor kommt aus der
 * Signaltabelle (Stärke → Faktor) und wird hier angewandt — nicht als zweite
 * Delta-Tabelle, sondern als Multiplikator auf den Vertragswert. Ein Ereignis
 * ohne `weight` verhält sich damit exakt wie vorher (der Golden-Replay der
 * Fixture bleibt unverändert).
 */
```

## Kanon k-8f45c798f974 {#k-8f45c798f974}

Fundstellen: packages/scoring/assets/scoring-core.js:1–12

Volltext des gekürzten Blocks (Stand 2026-10-17):

```
/**
 * @shinon/scoring — reiner Kern (assets/scoring-core.js).
 *
 * KEINE Imports (weder Bare noch node:): nur dann läuft der Replay-Test in
 * CI ohne node_modules — dieselbe Regel wie bei `@shinon/events` (Vertrag als
 * Daten) und `@shinon/codingmon` (assets/mechanik.js). `index.js` re-exportiert
 * diesen Kern, die Host-Anbindung (Dateien laden) bleibt dort.
 *
 * replay(Anfangszustand, Event-Strom) → { scorecard, injection, digest }.
 * Rein und deterministisch: kein Math.random, kein Date.now, kein Modell.
 * Unbekanntes ändert nichts (fail-closed); gezählt wird es trotzdem.
 */
```

## Kanon k-d2a0f472685d {#k-d2a0f472685d}

Fundstellen: packages/scoring/index.js:181–196

Volltext des gekürzten Blocks (Stand 2026-10-17):

```
  /**
   * Die Zeile ueber die Ablage — und zwar die Wahrheit.
   *
   * GEMESSEN im echten Boot (2026-10-11, `dsh --profile shinon`): der Index
   * mountet NACH dem Scoring. Beim Mounten stand hier deshalb „kein Gedaechtnis
   * … der Stand bleibt im Speicher", waehrend derselbe Lauf mit dem ersten
   * Signal in genau diese Ablage schrieb (belegt: `Stand geladen: 1 Signale`
   * im naechsten Boot). Ein Satz, der eine Frage beantwortet, die zu diesem
   * Zeitpunkt noch offen ist, ist keine Auskunft.
   *
   * Deshalb jetzt: gefunden wird sofort genannt (das ist ein Fakt), NICHT
   * gefunden erst beim ersten echten Gebrauch — dort liegt der Blick hinter
   * allen Mounts, und dort ist „kein Gedaechtnis" eine Aussage statt einer
   * Vermutung. Ein Boot ohne ein einziges Signal nennt die Ablage gar nicht:
   * eine Zeile, die nichts weiss, ist besser als eine, die etwas behauptet.
   */
```

## Kanon k-cc7e067c400e {#k-cc7e067c400e}

Fundstellen: packages/scoring/index.js:163–178

Volltext des gekürzten Blocks (Stand 2026-10-17):

```
  // ── Die Ablage: das dauerhafte Gedaechtnis ────────────────────────────────
  //
  // Vier Fail-Richtungen, jede benannt — und keine davon haelt den Host an:
  //
  //   kein Dienst       kein Gedaechtnis in diesem Profil. Das Scoring rechnet
  //                     im Speicher weiter, als waere nichts: kein Fehler.
  //   fremder Dienst    wer den Namen traegt, muss den Vertrag UND beide
  //                     Operationen tragen. Sonst wird er nicht benutzt.
  //   nicht lesbar      LEER starten (die Tafel steht bei initial) mit dem
  //                     GRUND im Protokoll. Ein kaputter Index darf den Host
  //                     nicht anhalten — und nicht so tun, als sei er heil.
  //   nicht schreibbar  warnen und weiterrechnen: der laufende Prozess ist
  //                     wichtiger als die Ablage.
  // Einmal gefunden, bleibt gefunden. Ein NICHT gefundener Dienst wird dagegen
  // erneut gefragt: die Mount-Reihenfolge eines Profils ist keine Zusage, und
  // eine Abfrage ist ein Nachschlagen im Dienstverzeichnis — kein Aufwand.
```

## Kanon k-03cfefd4eb43 {#k-03cfefd4eb43}

Fundstellen: packages/scoring/index.js:70–80

Volltext des gekürzten Blocks (Stand 2026-10-17):

```
/**
 * Die Naht zum TON (Zug 5) — der Stand als schmale Faehigkeit.
 *
 * Wer den Ton eines Schritts lesen will (der Veredler fuer seinen Stand-Block,
 * die Persona fuer Haltung und Haerte), braucht NICHT die Tafel: er braucht die
 * HALTUNG und ihre Stufen. Deshalb genau ZWEI Felder — `contract` und EINE
 * Operation `read` — und `read` gibt `null` zurueck, solange nichts zu sagen
 * ist. Dieselbe Bauform wie die Abfrage des Index, aus demselben Grund: kein
 * Paket liest ein anderes, und der Vertragsname wird auf beiden Seiten geprueft.
 * Die Gleichheit der Namen pinnt `scripts/gate/tests/context-wiring.test.mjs`.
 */
```

## Kanon k-3a0bdde97092 {#k-3a0bdde97092}

Fundstellen: packages/scoring/index.js:4–29

Volltext des gekürzten Blocks (Stand 2026-10-17):

```
/**
 * @shinon/scoring — Scorecard, Decay, Relation (Kern, K3) und die Ohren (K5).
 *
 * Rolle: lesen, nie schreiben. Diese Schicht hält die Scorecard
 * (./assets/scoring-state.json), das Technik-Profil, die Skill-Trigger und die
 * Signaltabelle (./assets/signal-rules.json) — reines Replay: Anfangszustand +
 * Signalstrom → Scorecard + Injektion + Digest. Deterministisch (kein
 * Math.random, kein Date.now, kein Modell), fail-closed bei Unbekanntem. Die
 * reine Mechanik liegt in ./assets/scoring-core.js (keine Imports, testbar ohne
 * node_modules); diese Datei lädt nur Verträge, haengt die Ohren an den
 * Ereigniskanal des Spines und re-exportiert den Kern.
 *
 * Kein Browser, keine Plattform-Abhaengigkeit: die Quellen sind Ereignisse, die
 * DSH selbst schreibt (Urteil je Antwort, Widerruf, Sitzungsbemerkung,
 * Menschen-Text, Turn-Ende). Was intern keine Quelle hat, steht in der Tabelle
 * als nicht beobachtbar — und wird nie geraten.
 *
 * DIE ABLAGE (Zug 2): dieser Host SCHREIBT SELBST NICHTS — kein Dateisystem,
 * keine Datenbank, kein `Date.now` (das Gate haelt das fest). Der Stand geht
 * ueber den zweiten, schmalen Dienst des Projekt-Index (`shinon_index_store`,
 * `shinon.project-index/store-v1`) in die SQLite, die der Index ohnehin fuer das
 * Projekt fuehrt — und wird beim Start von dort wieder gelesen. Fehlt der Dienst
 * (ein Profil ohne Project Index) oder ist er unbrauchbar, rechnet das Scoring
 * unveraendert im Speicher weiter: die Ablage ist eine Verstaerkung, keine
 * Bedingung.
 */
```

## Kanon k-897a5dd7deb9 {#k-897a5dd7deb9}

Fundstellen: packages/scoring/test/signals.test.mjs:2–20

Volltext des gekürzten Blocks (Stand 2026-10-17):

```
/**
 * Signaltests des Scorings (K5) — die Ohren.
 *
 * Was hier belegt wird, ist der ganze Weg ohne Browser, ohne DSH, ohne
 * Schlüssel und ohne Netz: ein internes Ereignis (so, wie der Spine es
 * liefert) hinein, ein Scorecard-Wert heraus. Dazu die Zusagen, die die
 * Schicht von einer Vermutung unterscheiden:
 *
 *   - Nur was in der Signaltabelle steht, erzeugt ein Signal (fail-closed).
 *   - Menschen-Text zählt nur mit der Marke `data.source.kind === 'user'`;
 *     Harness-Text mit demselben Ereignistyp zählt nicht.
 *   - Wiederholung wird am INHALT gemessen, nicht an der Uhr.
 *   - Ein Widerruf rechnet exakt: die Zeile fällt weg, die Tafel wird aus dem
 *     Rest nachgerechnet — der Wert ist danach wieder der von vorher.
 *   - Kein Deckel, kein Zähler-Limit, keine Sekundenregel — auch nicht als
 *     vergessene Zahl in der Tabelle.
 *
 * Läuft mit `node --test` (`npm run test:scoring`) — kein DSH, kein Netz.
 */
```

## Kanon k-0127dedfbabd {#k-0127dedfbabd}

Fundstellen: packages/scoring/test/tendency.test.mjs:2–20

Volltext des gekürzten Blocks (Stand 2026-10-17):

```
/**
 * Tendenz- und Gewichtungstests des Scorings (Zug 3) — die Rechnung.
 *
 * Was hier belegt wird, ist der Kern ohne Browser, ohne DSH und ohne Netz:
 *
 *   - GEWICHTUNG: die Stärke eines Signals (`high`/`medium`/`low`) wird über
 *     `limits.strengths` in einen Faktor übersetzt und skaliert das Basis-Delta
 *     des Vertrags. Keine zweite Delta-Tabelle, kein Laufzeit-Parameter.
 *   - WIDERRUF: eine zurückgenommene Zeile fällt aus dem Protokoll, und die
 *     Tafel wird aus dem Rest NACHGERECHNET — exakt der Wert von vorher.
 *   - BETREFF: jede Zeile trägt ihren Betreff (Sitzung + Kennung), deshalb
 *     trifft späte Kritik dieselbe Aufgabe und ein zweites Urteil ERSETZT die
 *     erste Zeile; `judgementOf` ist die Leseseite davon.
 *   - TENDENZ: aus dem Protokoll abgeleitet, datengetrieben (Klassen, Stufen,
 *     Haltungen aus `tendency-rules.json`), deterministisch — und unter
 *     `minSignals` wird NICHTS behauptet.
 *
 * Läuft mit `node --test` (`npm run test:scoring`) — kein DSH, kein Netz.
 */
```

## Kanon k-25e8172398c2 {#k-25e8172398c2}

Fundstellen: packages/shinon-forge/index.js:1–14

Volltext des gekürzten Blocks (Stand 2026-10-17):

```
/**
 * @shinon/shinon-forge — Memory Sync, Global Runner, Engine Adapters
 *
 * Architektur:
 *   notion-agent sync script ──▶ ~/.agents/AGENTS.md ──▶ Agent Configs
 *                                        │
 *                                        ▼
 *                              Global Runner (Polling + Dispatch)
 *
 * Tools:
 *   - memory_sync: Trigger sync via notion-agent
 *   - runner_control: Start/Stop/Polling
 *   - engine_dispatch: Manueller Engine-Aufruf
 */
```

## Kanon k-4935c8c78815 {#k-4935c8c78815}

Fundstellen: packages/task-router/client.js:1–13

Volltext des gekürzten Blocks (Stand 2026-10-17):

```
/**
 * shinon-task-router — Client-Hälfte.
 *
 * Keine autonome Aktion und KEINE eigene Policy: die Entscheidung UND die
 * Aktivierung fallen im Host (`index.js`), weil sie dort nachprüfbar sind. Der
 * Client spiegelt nur lesbar, damit im Browser nachvollziehbar ist, welche
 * Schwelle gilt und ob ein Goal entstand — eine Anzeige, die dieselben Zahlen
 * errät statt sie zu lesen, wäre eine zweite Wahrheit. Kein Goal-State hier:
 * den führt DSH, und ihn zu duplizieren hiesse, ihm zu widersprechen.
 *
 * Kein Config-Schema hier (die Konfiguration lebt im Host), kein Goal-State:
 * §16 endet bei goal/no goal; die Goal-Anzeige gehört zur Projektion (§22).
 */
```

## Kanon k-559c39d1c208 {#k-559c39d1c208}

Fundstellen: packages/task-router/index.js:699–713

Volltext des gekürzten Blocks (Stand 2026-10-17):

```
/**
 * Die Projektion als DIENST (§18): angeboten, nicht gespeichert.
 *
 * Jeder Aufruf liest den Zielzustand FRISCH aus `ctx.goals` — es gibt keinen
 * gehaltenen Zwischenzustand, keinen Verlauf, keine zweite Historie; was
 * zwischen zwei Aufrufen geschah, liegt bei DSH und in den Session-Daten.
 * Genau EINE Leseoperation: `get` des Ziel-Dienstes. Jede SCHREIBmethode
 * dieses Dienstes (create, edit, pause, block, ...) wird von dieser Schicht
 * nie aufgerufen — die einzige Schreibstelle bleibt activateGoal (§17), und
 * dass sie die einzige bleibt, prueft ein Abnahmetest mit einer Attrappe, auf
 * der jede Schreibmethode wirft.
 *
 * Fehler werden NICHT zu NO_GOAL: „ich kann nicht lesen“ ist eine andere
 * Aussage als „es gibt keins“. Beide fail-closed, beide benannt (UNAVAILABLE).
 */
```

## Kanon k-aea0e2db1f0f {#k-aea0e2db1f0f}

Fundstellen: packages/task-router/index.js:614–640

Volltext des gekürzten Blocks (Stand 2026-10-17):

```
/**
 * Die Projektion als REINE Funktion: Eingabe ein GoalView (oder null),
 * Ausgabe die fuenf Felder. Kein Zustand, keine Uhr, kein Dienst — und damit
 * auch nichts, was zweite Autoritaet werden koennte.
 *
 * QUELLENREGEL je Feld (§18: „Autoritative Zustände bleiben die dafür
 * vorgesehenen DSH-Services und Session-Daten“):
 *
 *   OBJECTIVE ......... view.objective — die vom Menschen gewollte Absicht,
 *                       die DSH dauerhaft fuehrt. Wortgleich, nie veraedelt.
 *   CURRENT_STATE ...... view.phase wortgleich (autoritativ); NO_GOAL und
 *                       UNAVAILABLE sind AUSSAGEN DIESES Lesers, nicht DSH-
 *                       Phasen, und deshalb benannt statt gemischt.
 *   LAST_VERIFIED_FACT AUSSCHLIESSLICH aus der benannten Quelle
 *                       (options.fact). Die Projektion leitet ihn nicht ab,
 *                       merkt ihn sich nicht und entnimmt ihn schon gar nicht
 *                       dem Modelltext — leer statt erfunden. Es gibt heute
 *                       noch keine Evidenzquelle, die ihn fuellt (§19); das
 *                       Feld und sein Schlitz sind gebaut, die Quelle fehlt.
 *   CURRENT_BLOCKER .... view.blockedReason, und nur bei Phase `blocked`
 *                       (die Types sagen: „present exactly while blocked“).
 *                       Kein Grund vorhanden → leer, nicht raten.
 *   NEXT_ACTION ........ NEXT_ACTIONS — Beratung, die nie ausgefuehrt wird.
 *
 * FAIL-CLOSED in beide Richtungen: kein View → NO_GOAL, unlesbarer View →
 * UNAVAILABLE, unbekannte Phase → gespiegelt und ohne Empfehlung.
 */
```

## Kanon k-24f9e61a8e70 {#k-24f9e61a8e70}

Fundstellen: packages/task-router/index.js:543–565

Volltext des gekürzten Blocks (Stand 2026-10-17):

```
/**
 * NEXT_ACTION als DATEN — Beratung, nie eine Aktion.
 *
 * Jeder Wert benennt, was als NAECHSTES zu erwarten bzw. zu tun waere; die
 * Projektion fuehrt keinen davon aus, und es gibt im Paket keinen Code, der
 * diesen Wert liest, um zu handeln. Die einzige Schreibstelle an Goal-State
 * bleibt `create` in activateGoal (§17). Die Tabelle ist eine Entscheidung,
 * keine Wahrheit — sie steht deshalb hier als Daten und nicht als Verzweigung.
 *
 *   NO_GOAL / UNAVAILABLE . NONE — nichts zu erinnern bzw. nichts zu raten
 *   active:armed ......... ROUND — die naechste Runde reserviert DSHs
 *                            Round-Driver, nicht wir (§17)
 *   active:disarmed ...... NONE — der Prozess darf nicht automatisch
 *                            weiterfahren; eine Weiterfahrt waere DSHs
 *                            Angelegenheit, keine unsere
 *   paused ............... RESUME — Fortsetzen ist ein Befehl an DSH
 *   blocked .............. HUMAN — die Blockade heben WIR NICHT selbst
 *                            (§17 Block-Policy: nicht ueberschreiben)
 *   complete ............. NONE — die Absicht ist erfuellt
 *   unbekannte Phase ..... NONE — fail-closed: wer die Phase nicht kennt,
 *                            empfiehlt nichts (die Phase selbst wird
 *                            trotzdem gespiegelt, sie ist autoritativ)
 */
```

## Kanon k-562017bf4059 {#k-562017bf4059}

Fundstellen: packages/task-router/index.js:412–422

Volltext des gekürzten Blocks (Stand 2026-10-17):

```
/**
 * Einen Fehler der Goal-Domaene einordnen.
 *
 * Die Domaene wirft `GoalError` mit einem stabilen `code`; aus der installierten
 * Fassung gelesen sind das GOAL_AGENT_NOT_LIVE, GOAL_ALREADY_EXISTS,
 * GOAL_STALE_REVISION, GOAL_NOT_FOUND, GOAL_CHANGE_VERSION und GOAL_INVALID_*
 * (@deepseek-ai/dsh-goal). Ein Fehler MIT Code wird als Code gemeldet; ein
 * Fehler OHNE Code kommt nicht aus dieser Taxonomie und wird als `NAME:<Klasse>`
 * gemeldet. Vorher entschied `error?.code ?? error?.name ?? 'Error'`, und ein
 * fremder Fehler sah damit aus wie ein Code der Domaene.
 */
```

## Kanon k-99eb498d7536 {#k-99eb498d7536}

Fundstellen: packages/task-router/index.js:3–77

Volltext des gekürzten Blocks (Stand 2026-10-17):

```
/**
 * shinon-task-router — Phase 5/6, Plan §16 und §17.
 *
 *   LLM  →  validierte Klassifikation (aus @shinon/prompter)
 *        →  Shinon policy (DIESES Paket)
 *        →  goal / no goal
 *        →  DSH Goal State (ctx.goals)
 *        →  DSH Goal Round Driver        ← NICHT unser Code
 *        →  DSH Agent
 *
 * §16 (dieses Pakets erste Haelfte): „Das LLM liefert eine Klassifikation. Die
 * Runtime entscheidet." Das Modell liefert ein ETIKETT, dieses Paket entscheidet
 * nach einer Policy, die als DATEN dasteht. Naeheres an INTENT_WEIGHTS/decide().
 *
 * §17 (die zweite Haelfte): „DSHs vorhandenen Goal-/Round-Mechanismus
 * verwenden. Nicht selbst implementieren: while (goal.active)." GENAU SO IST ES
 * GEBAUT: es gibt in dieser Datei keine Schleife, keinen Timer und keinen
 * eigenen Goal-Zustand. Die Aktivierung ist ein Aufruf an den vorhandenen
 * Dienst; alles danach — Dauerhaftigkeit, Runden, Quiescence, Abbruch bei
 * Fehlern — gehoert DSH.
 *
 * VERIFIZIERTE API — installiertes DSH 0.2.0-rc.2, nichts davon geraten
 * (@deepseek-ai/dsh-goal):
 *
 *   Dienst   `ctx.goals` — class GoalService (TypertRemoteService)
 *            get(agent) -> GoalView | undefined
 *            create(agent, { objective, maxGoalRounds? }) -> GoalView   (erzeugt
 *              UND armt; eine abgeschlossene Absicht darf ersetzt werden, jede
 *              andere Phase muss stattdessen fortgesetzt/geloescht werden)
 *            edit/pause/resume/complete/block/clear/disarm — hier NICHT benutzt
 *   Config   defaultMaxGoalRounds — Default der Installation: 256
 *   Fehler   GoalError mit code ∈ {GOAL_AGENT_NOT_LIVE, GOAL_ALREADY_EXISTS,
 *            GOAL_STALE_REVISION, GOAL_INVALID_*...}
 *   Ereignis `goal/changed` (emit, agent-scoped) nach jeder dauerhaften Mutation
 *   Driver   @deepseek-ai/dsh-goal-round-driver: lauscht auf agent/status
 *            (idle = Quiescence), goal/changed und die Lifecycle-Ereignisse;
 *            reserviert RUNDEN mit agent.followup(<goal_round>-Prompt), blockt
 *            am Rundenlimit selbst (code 'round-limit') und entwaffnet bei
 *            agent/error und agent/disposed.
 *
 * WAS SHINON AUS §17 BEITRAEGT — und nur das:
 *   * Goal-Eignung ................ §16 (Rangfolge, Schwelle, Substanzgrenze)
 *   * Aktivierungsentscheidung .... `activate` (Policy-Schalter) + der Aufruf
 *   * Stop-Policy ................. `maxGoalRounds` — DSHs Default waere 256
 *                                   Runden; Shinons Wert ist eine Entscheidung
 *                                   und steht im Profil, nicht im Code
 *   * Block-Policy ................ kein Ueberschreiben: existiert bereits eine
 *                                   Absicht, wird sie NICHT angetastet
 *                                   (GOAL_EXISTS) — eine Entscheidung eines
 *                                   Menschen ist keine Zufallsvariable
 *   * Progress-Auswertung ......... NICHT hier (§19 loop-guard)
 *
 * §18 (GOAL MICRO-STATE) — die ZUSAETZLICHE Projektion dieses Pakets:
 * OBJECTIVE, CURRENT_STATE, LAST_VERIFIED_FACT, CURRENT_BLOCKER, NEXT_ACTION.
 * Die Zusage, die dabei mehr wiegt als die fuenf Felder: „Dieser Zustand ist
 * keine zweite autoritative Session-Historie.“ GEBAUT als ein Dienst
 * (`shinon_goal_micro_state`), der bei JEDEM Aufruf frisch aus `ctx.goals`
 * liest und nichts speichert — kein eigener State, kein Listener, keine
 * Meldung, kein Zeitstempel. Autoritativ bleiben DSHs Goal-View und die
 * Session-Daten; die Projektion gibt OBJECTIVE, CURRENT_STATE und
 * CURRENT_BLOCKER wortgleich zurueck, leitet nichts davon ab und erfindet
 * nichts (leer statt geraten). LAST_VERIFIED_FACT hat einen benannten
 * Quellschlitz und sonst keine Quelle. NEXT_ACTION ist eine Beratung als
 * DATEN — ausgefuehrt wird sie nirgends; die EINZIGE Schreibstelle an
 * Goal-State bleibt `create` in activateGoal (§17).
 *
 * FAIL-CLOSED, jede Richtung benannt: ohne lebenden Agenten, ohne Dienst, ohne
 * Aktivierungsschalter oder ohne Substanz gibt es KEINEN Goal — und der Grund
 * steht im Datensatz. Die ENTSCHEIDUNG (goal/linear) ist dabei unabhaengig von
 * der AKTIVIERUNG: §16 bleibt richtig, auch wenn es keine Goal-Domaene gibt.
 *
 * WAS DIESES PAKET AUSDRUECKLICH NICHT BEHAUPTET: dass ein Modell richtig
 * klassifiziert. Geprueft sind Policy, Vokabular, Entscheidung und der
 * Aktivierungsaufruf — nicht die Urteilskraft eines Modells.
 */
```

## Kanon k-8c3450c1e801 {#k-8c3450c1e801}

Fundstellen: packages/token-usage/client.js:320–331, packages/token-usage/assets/token-core.js:295–306

Volltext des gekürzten Blocks (Stand 2026-10-17):

```
/**
 * Port von `formatCacheHitPercent`: der Cache-Anteil als Text.
 *
 * `100` steht NUR für einen exakten Volltreffer. Ein Teil-Treffer, der auf 100
 * runden würde, bekommt genug zusätzliche Stellen, um unter 100 zu bleiben
 * (`99.5`, `99.99`, `99.9991`, …) — DSH verkauft einen verfehlten Treffer nie
 * als perfekten.
 * @param cacheReadTokens - exakte, aus dem Cache bediente Prompt-Token.
 * @param promptTokens - exakte Prompt-Token insgesamt.
 * @param decimalPlaces - 0 für die Sitzungs-Pille, 1 für die Turn-Offenlegung.
 * @returns Prozent-Text oder null, wenn es keinen Prompt-Token gab.
 */
```

## Kanon k-35e5d3644878 {#k-35e5d3644878}

Fundstellen: packages/token-usage/client.js:168–178, packages/token-usage/assets/token-core.js:143–153

Volltext des gekürzten Blocks (Stand 2026-10-17):

```
/**
 * Port von `deriveTurnTokenUsage`: faltet den Versuchs-Lebenslauf EINES Turns zu
 * exakten Anbieter-Zahlen.
 *
 * Kein Versuch wird aus einer Usage-Probe geschlossen. Fehlt eine
 * Lebenslauf-Grenze, ist eine Usage unvollständig oder widerspricht die exakte
 * Summe den Buckets, ist die ganze Offenlegung nicht verfügbar (`undefined`) —
 * die Anzeige fällt dann sichtbar auf ihren Stand zurück statt zu schätzen.
 * @param events - turn-lokale dauerhafte Ereignisse von `turn/start` bis `turn/end`.
 * @returns exakte Aggregat-Usage oder undefined, wenn sie nicht beweisbar ist.
 */
```

## Kanon k-cd450594e437 {#k-cd450594e437}

Fundstellen: packages/token-usage/assets/token-core.js:1–31

Volltext des gekürzten Blocks (Stand 2026-10-17):

```
/**
 * token-core.js — die reine Regel der Token-Anzeige (Zahlen rein, Text raus).
 *
 * WARUM HIER UND NICHT IM CLIENT: dieses Paket hat zwei Hälften. Der Client ist
 * ein selbstständiges Bundle (`window.__ModuleLoader__.load`, React per
 * `require`) und kann keine Repo-Datei importieren. Deshalb steht die Regel
 * EINMAL hier und als **bytegleiche Region** in `packages/token-usage/client.js`;
 * die Zwillings-Regel in `scripts/lib/repo.mjs` (`SOURCE_TWINS`, Marker
 * `zwilling:token-turn`) lässt Drift im Gate und im Build auffallen, nicht erst
 * im Betrieb. Kein `import`, kein DOM, keine Uhr, kein Zufall — kein `Date.now`,
 * kein `Math.random`; die Zeit kommt als Datum aus dem Ereignis, nie aus dem
 * Prozess.
 *
 * DIE NAHT, AUS DER DIE ZAHLEN KOMMEN (nicht erfunden, gemessen):
 *  1. **Je Turn** — die dauerhaften Ereignisse des Turns. DSH führt sie im
 *     Browser als `SessionEventWindow` (`SessionEventSource` der Sitzungs-
 *     Bindung: „Observable contiguous Session event window", `entries` mit
 *     `turn/start` … `turn/end`). Genau daraus rechnet das Chat-Bundle seine
 *     Zeile „Usage 18.5K tok" — mit `deriveTurnTokenUsage` aus
 *     `@deepseek-ai/dsh-token-meter` (`lib/types/turn-usage.js`). Diese Datei
 *     trägt DIESE Regel: dieselben Ereignisse, dieselbe Faltung, keine neue
 *     Ereignisform und kein neuer Projektionsschlüssel.
 *  2. **Je Sitzung** — die Sitzungs-Projektion `tokenUsage` von
 *     `@deepseek-ai/dsh-token-meter`, im Browser über
 *     `ISession.projections.faceOf(key)` gelesen (der Weg, den `useProjection`
 *     nennt). Sie ist der Rückfall, wenn für keinen Turn eine Beweislage
 *     vorliegt.
 *  Beide Regeln sind hier wortgleich zu DSHs eigenen Funktionen portiert und
 *  werden in `scripts/gate/tests/token-usage-projection.test.mjs` über den
 *  ganzen Wertebereich gegen die ausgelieferten Vendor-Funktionen gemessen.
 */
```

## Kanon k-20c7dabbd1b8 {#k-20c7dabbd1b8}

Fundstellen: packages/token-usage/client.js:1–28

Volltext des gekürzten Blocks (Stand 2026-10-17):

```
/**
 * shinon-token-usage - Token-Anzeige (Client-Hälfte)
 *
 * DIE NAHT, aus der diese Anzeige ihre Zahl nimmt (gemessen, nicht erfunden):
 *  1. **Je Turn** — DSH führt das Ereignisfenster der offenen Sitzung als
 *     `SessionEventSource` („Observable contiguous Session event window") an der
 *     Sitzungs-Bindung. Aus den dauerhaften Ereignissen eines Turns
 *     (`turn/start` … `turn/end`) rechnet DSHs eigenes Chat-Bundle seine Zeile
 *     „Usage 18.5K tok" mit `deriveTurnTokenUsage`. Diese Hälfte liest DIESES
 *     Fenster (`ctx.get?.('sessions')` → `binding(id).eventSource`) und faltet
 *     die Turn-Ereignisse mit derselben Regel — sie erfindet kein Ereignis und
 *     keinen Projektionsschlüssel.
 *  2. **Je Sitzung** — die Sitzungs-Projektion `tokenUsage`
 *     (`@deepseek-ai/dsh-token-meter`), im Browser über
 *     `binding.session.projections.faceOf(key)` gelesen (der Weg, den
 *     `useProjection` nennt). Sie steht im Titel und ist der sichtbare Rückfall,
 *     wenn für keinen Turn eine Beweislage vorliegt.
 *  Welche Sitzung gezeigt wird, sagt die Vorgabe-Bindung des Renderers
 *  (`ctx.get?.('uiSession')` → `adapter.current`).
 *
 * Die Regel selbst (Faltung, Prozent, Form) steht NICHT hier als zweite Quelle:
 * sie ist eine **bytegleiche Region** mit `packages/token-usage/assets/token-core.js`.
 * Deshalb beginnen diese Zeilen in der Region ohne Einrückung — die
 * Zwillings-Regel in `scripts/lib/repo.mjs` (`SOURCE_TWINS`) vergleicht sie
 * zeichengenau, und `npm run idioms:check` / Gate / Build lassen Drift auffallen.
 *
 * 'sidebar.footer.action' ist eine list und verlangt daher options.id.
 */
```

## Kanon k-b554efc2dd9a {#k-b554efc2dd9a}

Fundstellen: packages/token-usage/test/token-core.test.mjs:2–20

Volltext des gekürzten Blocks (Stand 2026-10-17):

```
/**
 * token-core.test.mjs — die reine Rechnung der Token-Anzeige.
 *
 * Läuft ohne `node_modules`, ohne DSH und ohne Browser (`node --test
 * packages/token-usage/test/*.test.mjs`, eingebunden in `npm test`). Geprüft wird
 * die Regel des Besitzers (`packages/token-usage/assets/token-core.js`):
 *
 *   1. FALTUNG eines Turns aus seinen eigenen dauerhaften Ereignissen
 *      (`turn/start` … `turn/end`) — dieselbe Regel, die DSHs Chat-Bundle
 *      anwendet; die Formen der Ereignisse und der Fenster-Einträge sind die
 *      des gelieferten Clients (`SessionEventLikeEntry`: `{ type: 'event',
 *      event }` bzw. `{ type: 'transient', event }`), nichts davon ist erfunden.
 *   2. PROZENT-REGEL: ein verfehlter Treffer wird nie als 100 verkauft.
 *   3. FORM: kompakte Zahl, deutsche Tausenderpunkte.
 *
 * Der Beweis GEGEN DSHs eigene Funktionen (Wertebereichs-Sweep, Faltung über
 * erzeugte Ereignisfolgen) steht in `scripts/gate/tests/token-usage-vendor.test.mjs`
 * — der braucht `node_modules` und überspringt ohne sie sichtbar.
 */
```

## Kanon k-b1b7b4947e76 {#k-b1b7b4947e76}

Fundstellen: packages/traceability/assets/trace-core.js:1–26

Volltext des gekürzten Blocks (Stand 2026-10-17):

```
/**
 * @shinon/traceability — KERN DER TOAST-FALTUNG.
 *
 * Reine Rechnung, ohne Bare-Imports, ohne DOM, ohne Netz, ohne Sprache: der Kern
 * kennt KEINE Worte, nur Schluessel und Werte (dieselbe Teilung wie
 * `packages/popup/assets/trajectory-core.js` — die Texte liegen in
 * `@shinon/locale-de`, dem Eigentuer, und der Client fuellt sie beim Rendern).
 *
 * WAS HIER ENTSCHIEDEN WIRD und sonst nirgends:
 *
 *   - Ein Eintrag ist nur ein Toat, wenn das Fenster `{ type: 'event', event }`
 *     liefert (gemessene Form `@deepseek-ai/dsh-session`, dieselbe wie popup).
 *   - `tool/call` oeffnet, `tool/result` schliesst ueber
 *     `data.message.source.callId` — OHNE callId wird NICHTS geschlossen.
 *   - `step/start` und `agent/error` sind eigene Toats; `agent/error` bekommt
 *     den Text, nichts anderes.
 *   - Deduplizierung ueber callId, dann Deckelung auf `maxVisible`; die
 *     juestigsten stehen oben.
 *
 * DIE REGION IST EIN ZWILLING: der Marker `zwilling:trace-toasts` steht
 * bytegleich in `packages/traceability/client.js` — ein Client-Bundle ist
 * eigenstaendig und darf diese Datei nicht importieren. Besitzer dieser Datei,
 * geprueft von `SOURCE_TWINS` in `scripts/lib/repo.mjs` (Region + Vertragsname).
 * Der Marker wird hier nicht ausgeschrieben: `regionOf()` sucht die erste
 * Vorkommen der Marke und faende sonst den Hinweis im Kopf statt der Region.
 */
```

## Kanon k-b02592ec21d4 {#k-b02592ec21d4}

Fundstellen: packages/traceability/client.js:1–40

Volltext des gekürzten Blocks (Stand 2026-10-17):

```
/**
 * @shinon/traceability — CLIENT-HÄLFTE: LS-Popup-Toasts im Chat.
 *
 * DER DATENWEG (der einzige, den ein Out-of-Tree-Bundle hat): ein Client-Bundle
 * kann KEINEN Host-Endpunkt registrieren — die Remote-Beiträge der
 * Browser-Hälfte kommen aus einer kompilierten Liste in
 * `@deepseek-ai/dsh-api-remotes`, und die Connection-Naht ist reines
 * Anfrage/Antwort ohne Abo. Diese Hälfte foldet deshalb die SITZUNG selbst:
 *
 *   ctx.get('uiSession')?.adapter?.current?.getSnapshot()   → welche Sitzung
 *   ctx.get('sessions')?.binding(id)                        → deren Bindung
 *   …binding.eventSource.getSnapshot().entries              → das Ereignisfenster
 *   …binding.eventSource.subscribe(fn)                      → jede Änderung
 *
 * Denselben Weg gehen `@shinon/popup` und `@shinon/token-usage`; er ist gemessen
 * (der Vertrag der installierten DSH-Fassung: `ctx.get(name)` ist die optionale
 * Abfrage, ein direkter Dienst-Zugriff wirft ohne `inject`).
 *
 * DIE EINE NAHT ZUM HOST: die WIRKSAMEN Grenzen (enabled/maxVisible/duration)
 * legt der Host beim Ausliefern der Seite über `webserver/index-inject` als
 * `window.__SHINON_TRACEABILITY_CONFIG__` in den Index — dieselbe Naht, die
 * `@shinon/markers` für seine Grenzen benutzt. Der Name steht hier als LITERAL,
 * weil dieses Bundle eigenständig ist; `scripts/lib/repo.mjs` (SOURCE_TWINS)
 * und `scripts/gate/tests/traceability.test.mjs` vergleichen beide Seiten.
 *
 * WAS HIER NICHT MEHR STEHT (gemessene Befunde, konsolidiert):
 *   - Kein zweites Ereignis-Abo auf dem Host: die vier Record-Typen
 *     (`tool/call`, `tool/result`, `step/start`, `agent/error`) sind Formen des
 *     SESSION-LOGS, keine Bus-Events — der Host hätte nichts empfangen. Das
 *     Fenster zu falten ist dieser Hälfte eigene Arbeit, wie bei popup.
 *   - Kein `globalThis.window`-Schreibvorgang am Host: der Host läuft in Node,
 *     wo es kein `window` gibt (der Befund, durch den das Trace-Panel leer
 *     blieb). Konfiguration wandert über den Index in die Seite, nicht über ein
 *     Fenster zur Laufzeit.
 *
 * FEHLERISOLIERUNG: die Beobachtung darf das Rendern nie stören — Lesen und
 * Abo laufen in try/catch, Verstöße werden gezählt und EINMAL gemeldet
 * (dieselbe Regel wie `@shinon/markers`). Was trotzdem wirft, fängt der
 * Plattform-Ring ab (`SlotErrorBoundary` in `dsh-client-ui-renderer`).
 */
```

## Kanon k-aaed9acb4716 {#k-aaed9acb4716}

Fundstellen: packages/traceability/index.js:3–27

Volltext des gekürzten Blocks (Stand 2026-10-17):

```
/**
 * @shinon/traceability — HOST-HÄLFTE: die WIRKSAMEN Grenzen in die Seite legen.
 *
 * ROLLENTEILUNG (dieselbe wie `@shinon/markers`): der Host kennt die Profilwerte
 * und liefert sie beim Ausliefern der Seite; der Client kann sie nicht erraten,
 * weil er ein eigenständiges Bundle ist. Der Datensatz wandert über
 * `webserver/index-inject` als `window.__SHINON_TRACEABILITY_CONFIG__` in den
 * Index — dieselbe Naht, über die DSH Theme, Dokument-Vorschau und
 * Modelleinstellungen ausliefert.
 *
 * WAS DIESE HÄLFTE NICHT TUT (konsolidiert, mit Grund):
 *
 *   - Sie lauscht NICHT auf `tool/call`/`tool/result`/`step/start`/`agent/error`.
 *     Das sind Record-Typen des SESSION-LOGS (belegt: `session.v4.jsonl`, 199×
 *     `tool/call`), keine Events eines Cordis-Bus — ein `ctx.on` darauf bliebe
 *     still. Das Falten des Ereignisfensters ist Arbeit der Client-Hälfte,
 *     exakt wie bei `@shinon/popup`.
 *   - Sie schreibt NICHTS in `globalThis.window`: der Host läuft in Node, wo es
 *     kein `window` gibt. Genau das war der Befund, durch den das
 *     Trace-Panel des Prompters leer blieb.
 *
 * Der Vertrag des Datensatzes ist `TOAST_CONTRACT` — der Besitzer steht hier,
 * der Client trägt denselben Wert als Literal (SOURCE_TWINS, geprüft von Gate
 * und Build; `scripts/gate/tests/traceability.test.mjs` pinnt die Naht).
 */
```

## Kanon k-18af7fbd74d2 {#k-18af7fbd74d2}

Fundstellen: packages/traceability/test/trace-core.test.mjs:2–20

Volltext des gekürzten Blocks (Stand 2026-10-17):

```
/**
 * Traceability-Kern — ohne DSH, ohne Netz, ohne Modell, ohne node_modules.
 *
 * Belegt, was der Kern VERSPRICHT, und zwar an der gemessenen Ereignisform
 * (`@deepseek-ai/dsh-session`, dieselbe wie popup):
 *
 *   - Das Fenster liefert `{ type: 'event', event }`; Chunks und Fremdes fallen weg.
 *   - `tool/call` oeffnet, `tool/result` schliesst ueber
 *     `data.message.source.callId` — OHNE callId wird NICHTS geschlossen.
 *   - Ein geschlossener Datensatz wird fertig, statt ein zweiter zu entstehen.
 *   - Deduplizierung ueber callId, Deckelung auf `maxVisible`, juengste zuerst.
 *   - Der Kern ist SPRACHFREI: er liefert Schluessel und Werte, keine Toatetexte.
 *
 * Laeuft mit `node --test` (`npm test`) — kein DSH, kein node_modules.
 *
 * Die BYTEGLEICHHEIT dieser Region zur Client-Haelfte traegt die Zwillings-Regel
 * `zwilling:trace-toasts` in `scripts/lib/repo.mjs` (geprueft von Gate und
 * Build) — hier steht nur die Rechnung, nicht noch einmal ihr Textabgleich.
 */
```

## Kanon k-4ae8e5d285a2 {#k-4ae8e5d285a2}

Fundstellen: scripts/assets/build-sprites.mjs:2–26

Volltext des gekürzten Blocks (Stand 2026-10-17):

```
/**
 * scripts/assets/build-sprites.mjs — Gitterdateien zu SVG (Codemon-Sprites).
 *
 * WARUM ES DIESES SKRIPT GIBT: Die Sprites sind HANDGEZEICHNETE 32x32-Gitter
 * (`packages/codingmon/assets/sprites/*.grid`, ein Zeichen je Pixel, `.` ist
 * transparent), keine fremden Bilder — also keine Bildrechte-Frage. Dieses
 * Skript wandelt sie in SVG um (ein Rechteck je Pixel, gleiche Pixel einer
 * Zeile zusammengefasst) und PRUEFT dabei das Format: genau 32 Zeilen zu je
 * 32 Zeichen, nur Palettenzeichen, hoechstens fuenf Farben je Sprite.
 *
 * Aufruf:
 *   node scripts/assets/build-sprites.mjs [--check] [--embed]
 * Ohne Flag schreibt es `packages/codingmon/assets/sprites/*.svg` neben die
 * Gitter; mit `--check` prueft es nur; mit `--embed` schreibt es die
 * eingebetteten Spiegel in `packages/codingmon/client.js` neu (das Bundle ist
 * selbststaendig und kann keine Datei aus `assets/` laden). Exit 1 bei
 * Verletzung. Der Gate-Test (`packages/codingmon/test/sprites.test.mjs`)
 * nutzt denselben Vertrag: jede Spezies hat Vorder- und Rueckseite, jedes SVG
 * ist gueltig, jede Farbe stammt aus der Palette, die Einbettung ist deckungsgleich.
 *
 * STILHINWEIS (fuer kuenftige Aenderungen): Diese Datei nutzt bewusst nur
 * `indexOf`/`slice`/`endsWith` und `String.fromCharCode(10)` statt
 * Escape-Sequenzen — die Blocksuche ist literale Zeilensuche und kann nicht an
 * Escapes scheitern.
 */
```

## Kanon k-465b4232cadc {#k-465b4232cadc}

Fundstellen: scripts/backup-retention.mjs:2–39

Volltext des gekürzten Blocks (Stand 2026-10-17):

```
/**
 * scripts/backup-retention.mjs — die Aufbewahrungsregel des Sicherungsordners.
 *
 * Warum es dieses Werkzeug gibt: eine Sicherung, die niemand aufräumt, wächst
 * unbegrenzt und wird irgendwann selbst zum Problem. Aber „aufräumen" ohne
 * Regel ist gefährlich: wer die falsche Datei löscht, merkt es erst, wenn er
 * sie braucht. Deshalb steht die Regel hier EINMAL, schriftlich, und jede
 * Anwendung protokolliert sich.
 *
 * Die Regel (Standardwerte, alle übersteuerbar) — beide Grenzen sind OBERGRENZEN,
 * keine Untergrenzen, und die erste Fassung war hier zweideutig: lag eine alte
 * Sicherung noch unter den jüngsten N, gewann die Anzahl und die Altersgrenze
 * war wirkungslos. Jetzt gilt:
 *
 *   1. Die **jüngsten N** Sicherungen sind die Obergrenze der Anzahl (`--keep`,
 *      Default 5): was darüber liegt, fliegt.
 *   2. Zusätzlich fliegt, was **älter als M Tage** ist (`--max-age`, Default 30)
 *      — auch dann, wenn dadurch weniger als N übrig bleiben. Wer `--bare 30`
 *      sagt, will keine Sicherung sehen, die älter als einen Monat ist.
 *   3. Die **jüngste Sicherung wird NIE gelöscht** — auch nicht, wenn sie die
 *      Altersgrenze reißt. Sonst löschte ein Regelwerk die letzte Kopie.
 *   4. Angefasst werden ausschließlich Dateien, die wie eine Sicherung AUSSEHEN
 *      (`.tar.gz`, `.tgz`, `.tar`, `.zip`, `.sqlite`, `.db`). Protokolle,
 *      Notizen und alles andere bleiben liegen und werden als „unberührt"
 *      gemeldet — fail-closed statt Sammel-Löschung.
 *   5. Nichts wird stillschweigend getan: `--dry-run` zeigt den Plan, jeder
 *      Lauf schreibt eine Zeile nach `<logDir>/backup-retention.jsonl`.
 *
 * Der Ordner dokumentiert sich selbst: jeder Lauf schreibt die geltende Policy
 * samt letztem Ergebnis in `KEEP.md` im Zielordner. Wer später fragt, „warum
 * fehlt Sicherung 7?", liest das dort und im Protokoll — nicht in der
 * Erinnerung von jemandem.
 *
 * Aufruf:  node scripts/backup-retention.mjs [--dir DIR] [--keep N]
 *          [--max-age TAGE] [--dry-run] [--json] [--quiet]
 * Exit:    0 = durchgeführt bzw. (dry-run) nur geplant · 1 = Löschen scheiterte
 *          · 2 = Bedienfehler (Zielordner fehlt, widersprüchliche Werte)
 */
```

## Kanon k-52a5373a3255 {#k-52a5373a3255}

Fundstellen: scripts/branding-check.mjs:2–31

Volltext des gekürzten Blocks (Stand 2026-10-17):

```
/**
 * scripts/branding-check.mjs — die Wirkungs-Messung des Brandings.
 *
 * Warum eine eigene Datei: der Gate-Test (scripts/gate/tests/client-activation.test.mjs)
 * belegt STATISCH, dass unsere Regeln im Bundle stehen — er kann nicht sagen, ob sie im
 * Browser GEWINNEN. Genau das ist die offene Frage: Shinons Overrides treffen gehashte
 * Vendor-Klassen (`EvIC1a_runningWhaleAnimated`, `hHd-Xa_railMark`, `pXSMma_fishHitbox`),
 * und das gelieferte CSS-Modul steht je nach Ladereihenfolge VOR oder NACH unserem
 * Style-Tag. Ein Test, der nur unseren eigenen Text liest, kann das nicht entscheiden.
 *
 * Aufbau: das Skript zieht die CSS-Bloecke der gelieferten Bundles
 * (`node_modules/@deepseek-ai/<pkg>/lib/client.js` — dieselben Strings, die der Browser
 * bekommt, inklusive der Wal-APNG-Maske), baut damit und mit dem AUSGELIEFERTEN
 * `dist/packages/core/client.js` eine eigenstaendige Seite, haengt das Vendor-CSS
 * ABSICHTLICH ZWEIMAL ein (einmal vor, einmal nach unseren Styles — der unguenstigste
 * Fall fuer die Quellreihenfolge) und misst im echten Chromium:
 *
 *   1. Spezifitaet/Quellreihenfolge: computed `mask`, `background`, `animation` der
 *      Laufanzeige, `display` des gelieferten Wal-SVGs.
 *   2. Sichtbarkeit des Hintergrunds: dekodiert das WebP, deckt es den Rahmen, ist es
 *      dezent und click-through, erreicht ein Klick die UI darunter?
 *   3. Die drei Marken-Stellen: Zeichen sichtbar, Groesse aus dem Slot, Fallback weg.
 *   4. Paintbarkeit: laden die beiden Data-URIs (Maske, Persona) als Bild?
 *
 * Exit 0 = jede Zusage gemessen und erfuellt; Exit 1 = mindestens eine Messung widerlegt
 * sie (gemessene Werte im Klartext). Laeuft ohne Install und ohne Server: `--dump-dom`
 * liefert die Seite nach dem Skriptlauf zurueck.
 *
 * Nutzung: node scripts/branding-check.mjs [--keep] [--browser <pfad>]
 */
```

## Kanon k-fa327989c395 {#k-fa327989c395}

Fundstellen: scripts/build.mjs:2–15

Volltext des gekürzten Blocks (Stand 2026-10-17):

```
/**
 * build.mjs - Shinon Forge Build-Pipeline
 *
 * Stufen, alle auf derselben Validierungsquelle wie das Gate (lib/repo.mjs):
 *   1. Package Discovery     packages/* dynamisch
 *   2. Manifest-Validierung  Exports, DSH-Bundle-/Client-Metadaten
 *   3. Ressourcen            jede Manifest-/Config-Referenz existiert und parst
 *   4. Patch-Validierung     YAML-Schema der Loader-Patches (Felder, Typen, required)
 *   5. Namensvertrag         package.json ↔ Patch ↔ ModuleLoader-id
 *   6. Komposition           Profil-Bundles, doppelte ids, Paketgraph
 *   7. Artefakte             dist/ inkl. jeder referenzierten Ressource
 *
 * Läuft ohne node_modules - nur node:-Module und der YAML-Parser des DSH-Stacks.
 */
```

## Kanon k-67fd024927e6 {#k-67fd024927e6}

Fundstellen: scripts/commit-guard.mjs:2–26

Volltext des gekürzten Blocks (Stand 2026-10-17):

```
/**
 * commit-guard.mjs — der Commit-Wächter.
 *
 * Modi:
 *   --file <pfad> [--fix]   Hook-Modus: eine Nachricht prüfen (--fix tauscht
 *                           verbotene Footer gegen den Vannon-Trailer).
 *   --stdin                 eine Nachricht von stdin prüfen (Agenten-Dry-Run,
 *                           ohne temporäre Datei). Kein Tausch, nur Urteil.
 *   --ci                    CI-Modus: den Bereich aus der GitHub-Umgebung
 *                           ableiten und prüfen (scripts/lib/ci-range.mjs).
 *   --range <rev-range>     jeden Commit des Bereichs prüfen.
 *   --last <n>              die letzten n Commits prüfen (Standard: 1).
 *   --all                   Audit der gesamten Historie.
 *
 * Fail-closed: ein verbotener Footer oder ein fehlender Vannon-Trailer ist
 * Exit 1. Es gibt keinen Schalter, der das abschaltet — nur --fix, und das
 * ersetzt die Signatur, statt sie durchzuwinken.
 *
 * Die entscheidende Eigenschaft: dieser Wächter wird NIE enger. Lässt sich ein
 * Bereich nicht auflösen (neuer Branch, Force-Push, flacher Klon, unbekanntes
 * Event), prüft er die volle Historie — nicht bloß den Kopf-Commit. Ein
 * Prüfwerkzeug, das im Zweifel weniger prüft, ist kein Prüfwerkzeug.
 *
 * Exit: 0 = sauber, 1 = Verstoß, 2 = Bedienfehler.
 */
```

## Kanon k-61a04b901e9b {#k-61a04b901e9b}

Fundstellen: scripts/deb-build.mjs:2–27

Volltext des gekürzten Blocks (Stand 2026-10-17):

```
/**
 * deb-build.mjs — ein reproduzierbares Linux-Mint/Debian-Paket (.deb).
 *
 * Warum so und nicht anders:
 *
 *   - Ein Installat braucht einen KLAREN Root: `/opt/shinon-forge`. Zur Laufzeit
 *     ist er read-only (das ist die Zusage, an der die Pfad-Trennung hängt); alle
 *     Nutzerdaten liegen unter XDG (config/data/state/cache), siehe
 *     `scripts/lib/paths.mjs`.
 *   - Das Tarball-Paket ist NICHT dabei: `node_modules` (gemessen: dreistellige
 *     MB) gehört nicht in ein .deb dieser Größenordnung. Stattdessen liefert das
 *     Paket den Code plus eine Anweisung (`postinst`), die Abhängigkeiten einmal
 *     mit `npm ci --omit=dev` in den Root zu ziehen — den Pfad nennt der
 *     Starter selbst, wenn er fehlt.
 *   - Kein zweites Installationsformat: kein AppImage, kein Flatpak, keine
 *     Kopie daneben. Ein Weg, ein Root.
 *
 * Gebaut wird AUSSCHLIESSLICH mit `dpkg-deb` (auf Mint vorhanden) und mit
 * denselben Early-Pruning-Regeln wie jeder andere Baumlauf dieses Repos:
 * `node_modules`, `.git`, `dist`, Cache-, Werkzeug- und Laufzeitordner kommen
 * nicht ins Paket.
 *
 * Aufruf:  node scripts/deb-build.mjs [--out <dir>] [--keep]
 * npm-Entry: `npm run deb`
 * Exit: 0 = Paket gebaut · 1 = Befund (fehlt dpkg-deb) · 2 = Bedienfehler
 */
```

## Kanon k-a3a91e99873c {#k-a3a91e99873c}

Fundstellen: scripts/desktop-launcher.mjs:2–29

Volltext des gekürzten Blocks (Stand 2026-10-17):

```
/**
 * desktop-launcher.mjs — Desktop-Icon / Dock-Symbol für den 1-Click-Start.
 *
 * Erzeugt .desktop-Eintrag(e), die scripts/open.mjs (Stufe 1) OHNE Terminal
 * aufrufen: ein Klick auf Desktop-Icon bzw. Dock-/Menü-Symbol startet DSH
 * mit dem aktiven Profil und öffnet die tokenisierte UI im Systembrowser.
 * Terminal=false ist die Zusage — kein Fenster, kein Terminal.
 *
 * Ziele (werden bei Bedarf angelegt, nie überschrieben mit fremdem Inhalt):
 *   1. ~/.local/share/applications/shinon-forge.desktop  (App-Menü + Dock)
 *   2. ~/.config/cinnamon/desktop/  (+ Cinnamon-Spice-Varianz)  (Desktop-Icon)
 *
 * Linux-Desktop-Icons brauchen ein trusted Markierung (freedesktop), damit
 * Cinnamon/GNOME sie ausführen — das passiert hier per .desktop: + chmod +x.
 *
 * Aufruf:  node scripts/desktop-launcher.mjs [--uninstall|--check]
 * npm-Entry: desktop:launcher / desktop:launcher:uninstall
 * Exit: 0 = ok, 1 = Befund (fehlt dsh/node/profil; bei --check: Eintrag veraltet),
 *       2 = Bedienfehler.
 *
 * WAS HIER STEHEN MUSS: der ABSOLUTE Pfad der VERIFIZIERTEN Laufzeit (Version
 * gegen `engines` + `node:sqlite`-Rauchtest). Die frühere Fassung schrieb
 * `process.execPath` — den Interpreter, mit dem der Launcher zufällig gestartet
 * wurde. Ein `.desktop`-Eintrag überlebt den Aufruf, der ihn geschrieben hat;
 * zeigt er danach auf ein untaugliches Node, startet der Klick in einen Fehler,
 * der nirgends sichtbar wird. Und der Eintrag wird bei jedem Lauf neu geprüft:
 * ändert sich die Laufzeit (Upgrade), schreibt der nächste Lauf den Eintrag um.
 */
```

## Kanon k-5b134c7199f6 {#k-5b134c7199f6}

Fundstellen: scripts/doctor.mjs:2–24

Volltext des gekürzten Blocks (Stand 2026-10-17):

```
/**
 * scripts/doctor.mjs — `shinon doctor`, die Laufzeit-Diagnose (Release-Slice S4).
 *
 * Was das ist: ein read-only Unterbefehl des Einstiegs (`bin/shinon.mjs` reicht
 * `doctor` hierher durch, statt es an DSH weiterzugeben). Er misst die
 * Laufzeit-Gesundheit in einer frischen Umgebung: Node-Range, dsh-Auflösung,
 * Profil-Bündel-Auflösung, statische Repo-Konsistenz (dieselbe Regel wie das
 * Gate-Plugin `scripts/gate/plugins/doctor.mjs`, kein zweiter Regelsatz) und
 * Schlüssel-Präsenz. Er schreibt nichts: kein Profil-Link, kein Index, kein
 * Log, kein DSH-Start.
 *
 * Exit-Codes (stabil, in PLAN.md §9.1 S4 dokumentiert):
 *   0 = gesund (keine Befunde)
 *   1 = Befunde (Repo-Drift oder Bündel-Verstoß — behebbar, kein Absturz)
 *   2 = Umgebung (kein tauglicher Node, kein dsh, kein Profil — fail-closed)
 *
 * Schlüssel sind presence-only: der Bericht nennt je Name nur vorhanden/fehlt,
 * niemals Werte, Längen oder Präfixe. Ein Test setzt einen Fake-Wert und
 * prüft, dass er in stdout/stderr nicht vorkommt.
 *
 * Aufruf:  node scripts/doctor.mjs [--json] [--root <pfad>]
 *           shinon doctor [--json]
 */
```

## Kanon k-dd28ec2eac28 {#k-dd28ec2eac28}

Fundstellen: scripts/dsh-update.mjs:2–16

Volltext des gekürzten Blocks (Stand 2026-10-17):

```
/**
 * dsh-update.mjs - DSH Upstream Update Script
 *
 * Vergleicht die installierte DSH-Fassung mit der Registry und installiert
 * bei einem echten Update die Bundles in das KANONISCHE Profil (nicht `web`).
 *
 * Ehrlichkeitsregeln dieser Datei (keine Scheinaussagen):
 * - Die Versionsaussage stammt aus einer gemessenen Registry-Abfrage
 *   (`npm view @deepseek-ai/dsh versions --json`, Maximum nach Semver).
 * - Ist die Registry nicht erreichbar, lautet die Antwort UNGEPRÜFT —
 *   niemals „keine Updates“.
 * - Alle Pfade und Namen sind abgeleitet (`lib/dsh.mjs`-Auflösung,
 *   `activeProfile()` aus dem dev-Skript): keine hartcodierten Heimpfade,
 *   kein fest verdrahtetes Profil, kein `dsh`-Aufruf über den bloßen PATH-Namen.
 */
```

## Kanon k-6900c0cc6b3f {#k-6900c0cc6b3f}

Fundstellen: scripts/gate/engine.mjs:2–20

Volltext des gekürzten Blocks (Stand 2026-10-17):

```
/**
 * scripts/gate/engine.mjs — Shinon Gate Engine (Wave 0)
 *
 * Modularer, slice-fähiger Runner. Ersetzt shinon-test.mjs nicht, sondern ergänzt
 * es: derselbe Vertrag (scripts/lib/repo.mjs ist die eine Quelle), aber pro
 * Fähigkeit als eigenes Plugin, ausgewählt über den geänderten Dateipfad.
 *
 * Modi:
 *   (default)   SLICE    — nur Gates mit passendem Slice im staged Diff
 *   --local     LOCAL    — die kurze Menge aus policy.engine.local (Hooks)
 *   --full      FULL     — alle Gates gegen den Stand vs. HEAD (CI)
 *   --release   RELEASE  — wie --full, für den Release-Lauf
 *   --branding  Zusatzstufe: die Wirkungs-Messung im echten Chromium
 *               (scripts/branding-check.mjs) läuft mit. Ohne das Flag steht sie als
 *               sichtbarer Skip mit Grund in der Ausgabe — sie braucht `dist/` und
 *               ein Browser-Binary und ist deshalb kein Gate der schnellen Läufe.
 *
 * Läuft ohne node_modules — nur node:-Module und scripts/lib/repo.mjs.
 */
```

## Kanon k-92e2eb4222c8 {#k-92e2eb4222c8}

Fundstellen: scripts/gate/plugins/bundle-resolution.mjs:1–20

Volltext des gekürzten Blocks (Stand 2026-10-17):

```
/**
 * bundle-resolution — jedes Bündel des aktiven Profils löst aus dem PROFIL in
 * `packages/` auf.
 *
 * Warum dieses Gate existiert (gemessen 2026-10-17): `profiles/shinon/node_modules/@shinon/traceability`
 * war ein Link auf einen Prototyp AUSSERHALB dieses Repos. Node lädt für einen
 * Profil-Import zuerst `profiles/<name>/node_modules` — das Repo-Paket wurde also
 * beschattet, und der Boot starb mit `... (reading 'validate')`. Alle übrigen
 * Gates waren grün, weil keines den LINK ansah: sie prüfen `packages/` direkt.
 *
 * Die Regel ist EINE Quelle (`repo.bundleResolutionIssues`) — dasselbe Ergebnis
 * lesen Gate und `scripts/profile-links.mjs --check`; das geplante Laufzeit-CLI
 * `shinon doctor` ist noch nicht implementiert (Release-Slice S4). Ein Befund nennt
 * immer Quelle, aufgelöstes Ziel und Abhilfe; ein Gate, das nur „kaputt" sagt,
 * kostet die nächste Person dieselbe Suche noch einmal.
 *
 * Fail-closed: ein vorhandener Link, der woandershin zeigt, ist ein Fehler. Ein
 * FEHLENDER Link ist keiner — ein frischer Klon hat kein
 * `profiles/<name>/node_modules`, und DSH setzt ihn beim Start aus dem Manifest.
 */
```

## Kanon k-b0a12d4b6f35 {#k-b0a12d4b6f35}

Fundstellen: scripts/gate/plugins/commit-trailer.mjs:1–24

Volltext des gekürzten Blocks (Stand 2026-10-17):

```
/**
 * commit-trailer — der Wächter über den Wächter.
 *
 * Die Commit-Regeln sind ein Vertrag: kein KI-Footer, Vannon-Trailer Pflicht,
 * Wort-Regel (150+ Wörter, Daten namentlich, Bildsprache).
 * Dieses Plugin prüft nicht die Historie (das tut der Guard im CI-Job),
 * sondern dass der Mechanismus tatsächlich existiert und fail-closed ist:
 *
 *   1. Verhalten: die eingefrorene Codebuff-Signatur MUSS abgelehnt werden,
 *      eine saubere Nachricht MUSS durchgehen, und der Tausch MUSS den Footer
 *      entfernen und den Trailer setzen. Das ist der Beweis, dass die Regeln
 *      wirken — nicht nur, dass eine Datei existiert.
 *   2. Hooks: pre-commit fährt NUR die schnelle Linie (`npm test` — der volle
 *      Lauf `test:full` gehört in CI), commit-msg prüft ohne --fix
 *      (fail-closed), prepare-commit-msg tauscht (--fix), der Installer setzt
 *      core.hooksPath.
 *   3. CI: der Workflow läuft bei push UND pull_request und hat keinen
 *      paths-Filter — „immer" ist eine Eigenschaft der Datei, nicht ein Versprechen.
 *      Der Prüfbereich kommt aus dem Wächter (--ci), nicht aus Shell-Zeilen im
 *      YAML, und der Job darf nicht mit continue-on-error entschärft sein.
 *   4. Bereich: der Resolver (scripts/lib/ci-range.mjs) wird nie enger — kann er
 *      den Bereich nicht bestimmen, bleibt die volle Historie. Das ist die
 *      Eigenschaft, ohne die „fail-closed" nur ein Wort wäre.
 */
```

## Kanon k-e6425c89a590 {#k-e6425c89a590}

Fundstellen: scripts/gate/plugins/contracts.mjs:1–15

Volltext des gekürzten Blocks (Stand 2026-10-17):

```
/**
 * contracts — 7-Punkt-Vertragsform (propsa-Prinzip, nativ).
 *
 * Eine Fähigkeit ist erst implementiert, wenn sie falsifizierbar ist. Jeder
 * Vertrag in docs/contracts/*.json muss die sieben Punkte tragen; ein Vertrag
 * mit Lücken ist eine Behauptung, kein Vertrag.
 *
 * Zustände (propsa): IMPLEMENTED | STUB | NOT_IMPLEMENTED | NOT_VERIFIED
 *   STUB          = die Entscheidung, es nicht zu bauen, ist getroffen.
 *   NOT_VERIFIED  = gebaut, aber niemand hat es geprüft.
 * Beides ist ehrlich, aber es führt zu verschiedenen Entscheidungen.
 *
 * Fehlt docs/contracts/ komplett, meldet das Gate das — nicht als Fehler,
 * sondern als offenen Posten (es gibt dann nichts zu prüfen).
 */
```

## Kanon k-9a8e9aad014b {#k-9a8e9aad014b}

Fundstellen: scripts/gate/plugins/dead-package.mjs:1–11

Volltext des gekürzten Blocks (Stand 2026-10-17):

```
/**
 * dead-package (Slice) — ein Paket, das kein aktives Profil referenziert, ist
 * tot: es lädt nie, kostet aber Pflege. Erlaubt ist ein Paket, das seine
 * Zurückstellung SELBST erklärt: `"dsh": { "inactive": true }` im eigenen
 * Manifest.
 *
 * Warum nicht als zentrale Liste im Gate (bis 2026-10-11 `KNOWN_INACTIVE`):
 * mit vielen Paketen hieße das, für jedes neue Paket dieses Gate-File
 * anzufassen — gemessen an 39 Paketen fünf Befunde, bis die Liste wuchs. Die
 * Erklärung gehört dem Paket (ein Besitzer), das Gate liest sie nur.
 */
```

## Kanon k-d74f36f7429b {#k-d74f36f7429b}

Fundstellen: scripts/gate/plugins/doctor.mjs:18–31

Volltext des gekürzten Blocks (Stand 2026-10-17):

```
/**
 * Versionen — eine REGEL, keine Liste.
 *
 * Zwei Zeilen gibt es in diesem Repo: `1.0.0` für ausgelieferte Pakete und
 * `0.1.0` für Vorbereitungs-Pakete (siehe `docs/ZAHLEN.md` §1). Welche Zeile ein
 * Paket führt, entscheidet das PAKET: ein aktives Paket führt `1.0.0`, ein im
 * eigenen Manifest als `dsh.inactive` deklariertes darf `0.1.0` führen.
 *
 * Warum nicht als Tabelle im Gate (bis 2026-10-11 `EXPECTED_VERSIONS`): die
 * Tabelle war eine zweite Quelle für dieselbe Zahl — jedes Vorbereitungs-Paket
 * musste sich hier eintragen, und ein neues Paket war bis dahin rot, obwohl sein
 * eigenes Manifest vollständig war. Dieselbe Begründung wie in `dead-package`:
 * die Erklärung gehört dem Paket, das Gate liest sie nur.
 */
```

## Kanon k-3c4a20a765c9 {#k-3c4a20a765c9}

Fundstellen: scripts/gate/plugins/doctor.mjs:1–12

Volltext des gekürzten Blocks (Stand 2026-10-17):

```
/**
 * doctor — Konsistenz-Scanner (Syx_Bridge-Muster `checkX(opts) → issues[]`, nativ).
 *
 * Prüft Drift, der still kaputtgeht:
 *   - Version-Drift: Paketversionen weichen vom Root ab
 *   - Dependency-Drift: Workspace-Deps im Root vs. tatsächliche Pakete
 *   - Stale-Resource: in package.json referenzierte Datei fehlt (icon etc.)
 *   - Dead-Reference: package.json exports zeigt auf fehlende Datei
 *   - Profile-Drift: Profil-Bundles ↔ Paket-Registry
 *
 * Reine programmatische Gates statt Shell-Spaghetti. Kein Zustand, kein Netz.
 */
```

## Kanon k-39e9824ae233 {#k-39e9824ae233}

Fundstellen: scripts/gate/plugins/events-spine.mjs:43–66

Volltext des gekürzten Blocks (Stand 2026-10-17):

```
/**
 * Die Event-Typen des Vertrags: die neun Pfade aus Wave 2 plus die Typen, die
 * ausschließlich über den DSH-Carrier `session/event` erreichbar sind.
 *
 * Diese Menge wächst nur mit einem Carrier-Namen, der in der installierten
 * DSH-Fassung belegt ist — nie mit einem Alias. Vier Einträge der typeMap
 * (message.created, message.completed, tool.requested, tool.completed) standen in
 * keiner DSH-Fassung; sie sind entfernt, und der Abgleich unten fängt den
 * nächsten solchen Fall.
 *
 * `step.start`/`step.end` sind dabei eine Korrektur: sie hingen vorher an
 * tool.requested/tool.completed und hätten damit bei jedem Schritt einen
 * Tool-Aufruf behauptet, den es nicht gab.
 *
 * Dazu drei shinon-eigene Signaltypen für die Scoring-Schicht: `feedback.*`
 * (Korrektur/Zustimmung aus dem Verlauf) und `relation.updated` (Beziehungsstand).
 *
 * Und drei NATIVE Urteile des Menschen, die der Carrier liefert: `feedback.noted`
 * (Sitzungsbemerkung), `feedback.rated` (Urteil je Antwort mit messageId) und
 * `feedback.retracted` (Widerruf dieses Urteils). Sie waren bewusst ignoriert,
 * bis die Scoring-Schicht sie als Signale brauchte; jetzt sind sie abgebildet
 * und aus `ignoredTypes` entfernt (ein Typ ist entweder abgebildet oder
 * ignoriert — das Gate prüft genau das).
 */
```

## Kanon k-b6d70b07c391 {#k-b6d70b07c391}

Fundstellen: scripts/gate/plugins/events-spine.mjs:1–24

Volltext des gekürzten Blocks (Stand 2026-10-17):

```
/**
 * events-spine — Contract-Gate des Hook/Event-Spines (Wave 2).
 *
 * Der Spine beobachtet, normalisiert, validiert und emittiert. Dieses Gate
 * prüft genau diese vier Zusagen — und die fünfte, wichtigere: dass er NICHTS
 * anderes tut.
 *
 * Geprüft wird:
 *   1. Vertrag (assets/event-spine.json): Envelope, neun Event-Typen, Quellen,
 *      Pflicht-Nutzlast, Signal-/Carrier-Abdeckung, authority NONE.
 *   2. Replay-Fixture: jeder Schritt zeigt auf ein bekanntes Signal, jede
 *      Erwartung trägt den vollständigen Envelope; Verwerfungsgründe sind
 *      bekannte Codes (fail-closed dokumentiert).
 *   3. Laufzeitgrenze (index.js): beobachtet (ctx.on), emittiert (ctx.emit),
 *      enthält die Envelope-Felder — und keinen einzigen Aktions-/Schreib-/
 *      Modell-/Netzaufruf (Nicht-Autonomie ist statisch geprüft, nicht nur
 *      behauptet).
 *   4. Aktivierung: das Profil muss das Bundle laden, sonst ist der Spine toter
 *      Text (dieselbe Regel wie beim Persona-Gate).
 *
 * Die reinen Funktionen sind ohne node_modules testbar; die Tests liegen in
 * scripts/gate/tests/events-spine.test.mjs und fahren zusätzlich das echte
 * Bundle gegen die Fixture.
 */
```

## Kanon k-f606a450c8d7 {#k-f606a450c8d7}

Fundstellen: scripts/gate/plugins/markers.mjs:1–20

Volltext des gekürzten Blocks (Stand 2026-10-17):

```
/**
 * markers — Gate des Marker-Spiegels (Wave 3).
 *
 * Der Spiegel übersetzt das Element-Marker-System aus brutalord-the-feral-cycle
 * in ein DSH-Bundle. Dieses Gate prüft die drei Zusagen, die daraus folgen:
 *
 *   1. Vertrag (assets/marker-model.json): acht Marken-Felder, id-Regel,
 *      Selektor-Grenze, Nutzlast-Format, Inbox, Speicherschlüssel, Grenzen,
 *      authority NONE, forbidden inkl. cdp_attach — und dass der Quellpfad
 *      benennt, was NICHT übernommen wurde (CDP/Daemon).
 *   2. Host (index.js): reine Ableiter und Prüfer, keine Datei-Schreibzugriffe,
 *      kein Netz, kein Modell, kein Zufall, kein Prozess-Ende. Ein Spiegel, der
 *      schreibt, ist kein Spiegel.
 *   3. Client (client.js): der native Side Panel über `main` + `sidebar.panellist`,
 *      dieselben Speicherschlüssel, dieselbe Nutzlast-Vorlage (keine zweite
 *      Wahrheit) und keine DOM-Injektions-Tricks (innerHTML, eval, document.write).
 *
 * Die Tests (scripts/gate/tests/markers.test.mjs) fahren zusätzlich das echte
 * Bundle isoliert gegen den Vertrag — inklusive der exakten Nutzlast-Zeile.
 */
```

## Kanon k-e11366863b90 {#k-e11366863b90}

Fundstellen: scripts/gate/plugins/narrative.mjs:221–236

Volltext des gekürzten Blocks (Stand 2026-10-17):

```
/**
 * Den ABNEHMER prüfen — die Zusage, die bis Zug 6 fehlte.
 *
 * Geprüft wird nicht, dass irgendwo "narrative" steht, sondern die drei Dinge,
 * die einen Abnehmer ausmachen: der Kanalname als LITERAL (das Paket kann
 * `@shinon/narrative` nicht importieren), ein `ctx.on` auf diesen Namen, und ein
 * Element, das aus dem Composite entsteht. Ein Abnehmer, der den Kanalnamen
 * falsch schreibt, sieht aus wie "es gibt keine Narrative" — deshalb ist die
 * Buchstabenfolge hier keine Stilfrage, sondern der Befund. Und es sind ZWEI
 * Abnehmer: die Prüfung läuft über die Liste CONSUMERS, an den Abnehmer selbst
 * werden die beiden Quelltexte gereicht.
 *
 * @param consumer - Eintrag aus CONSUMERS.
 * @param sources - `{ main, evidence }`; `null`, wo die Datei fehlt.
 * @param stateContract - geparster Zustandsvertrag des Abnehmers (nur Persona).
 */
```

## Kanon k-347ad0731e05 {#k-347ad0731e05}

Fundstellen: scripts/gate/plugins/narrative.mjs:52–68

Volltext des gekürzten Blocks (Stand 2026-10-17):

```
/**
 * Die ABNEHMER. Bis Zug 6 war diese Liste leer — und das Gate hätte die Lücke
 * benannt, statt sie zu überspringen.
 *
 * Ein Abnehmer ist: ein Paket, das den Kanalnamen als LITERAL trägt (es kann
 * `index.js` nicht importieren), den Kanal wirklich abonniert (`ctx.on` auf genau
 * diesen Namen) und aus dem Composite etwas SICHTBARES macht — ein Element, das
 * eine Prüfung finden kann. Es sind zwei, und sie lesen denselben Composite in
 * zwei verschiedene Ausgänge:
 *
 *   persona   den System-Prompt-Abschnitt `shinon:narrative-arc`
 *   prompter  das Element `<narrative>` im Stand-Block, den MAX als eigenen
 *             Block in den Modellaufruf hängt
 *
 * Beide Spiegel werden von `scripts/lib/repo.mjs` (SOURCE_TWINS) gegen den einen
 * Besitzer gepinnt; hier wird geprüft, dass daraus auch ein Abnehmer wird.
 */
```

## Kanon k-b02775091853 {#k-b02775091853}

Fundstellen: scripts/gate/plugins/narrative.mjs:1–35

Volltext des gekürzten Blocks (Stand 2026-10-17):

```
/**
 * narrative — die Narrative Engine: lesen, ableiten, melden. Sie handelt nicht.
 *
 * WARUM DIESES GATE EXISTIERT (gemessen, nicht behauptet): `@shinon/narrative`
 * ist seit Zug 5 im Profil aktiv und rechnet bei jedem Spines-Ereignis einen
 * Composite (Arc, Erzähler, Beziehungsstufe, eigener Mood). Emittiert wurde er
 * auf `shinon/narrative/state` — und diesen Kanal hatte NIEMAND abonniert. Die
 * Engine war ein Radiosender ohne Empfänger: sie rechnete, und kein Gerät in der
 * Wohnung hatte ein Programm eingestellt. Das Paket hatte Unit-Tests für seine
 * Mathematik und kein Gate für seine VERDRAHTUNG — genau die Lücke, durch die
 * der Composite ins Leere gehen konnte.
 *
 * Fünf Zusagen, fünf Prüfungen:
 *   1. Der Vertrag (assets/narrative-state.json) trägt seinen Namen und ist
 *      vollständig: Mood-Tabelle, Erzähler-Regel, Arc-Themen, Beziehungsstufen.
 *      Jeder Ereignistyp der Mood-Tabelle ist ein Typ des Spines — eine Zeile
 *      auf ein Ereignis, das es nicht gibt, wäre ein Takt, der nie klingt.
 *   2. Die Ableitung ist deterministisch und uhrfrei: kein Zufall, keine Uhr,
 *      kein Modell, kein Tool, kein Schreiben — im Laufzeitcode UND im Kern.
 *   3. Der Ausgang ist genau EINER: der Composite geht als Ereignis
 *      (`STATE_CHANNEL`) hinaus. Es gibt keinen zweiten Weg — ein `ctx.provide`
 *      eines Zustands wäre der „tote Dienst" von vorher, und der ist entfernt.
 *   4. Der KANAL HAT ABNEHMER. Das ist die Zusage, die bis Zug 6 fehlte: die
 *      Persona trägt den Kanalnamen als Literal und registriert daraus einen
 *      Prompt-Abschnitt, der Veredler trägt ihn ebenso und baut daraus das
 *      Element `<narrative>` seines Stand-Blocks (der in den MAX-Aufruf geht).
 *      Ohne diese Prüfung darf das Gate nicht grün sein — ein Sender ohne
 *      Empfänger ist kein Feature.
 *   5. Das Profil aktiviert das Bundle, sonst läuft die Engine nie (dieselbe
 *      Regel wie beim Persona- und beim Scoring-Gate).
 *
 * Die reinen Funktionen des Pakets sind schon ohne node_modules getestet
 * (packages/narrative/test/narrative.test.mjs). Dieses Gate prüft die
 * VERDRAHTUNG, die ein Pakettest von innen nicht sehen kann.
 */
```

## Kanon k-bebd10ff7f1a {#k-bebd10ff7f1a}

Fundstellen: scripts/gate/plugins/persona.mjs:1–13

Volltext des gekürzten Blocks (Stand 2026-10-17):

```
/**
 * persona — Identity, State, Voice. DSH-nativ und im Profil aktiv.
 *
 * Drei Zusagen, drei Prüfungen:
 *   1. Verdrahtung: das Bundle nutzt ctx.systemPrompt, exportiert `Config` und
 *      `apply`, und das aktive Profil aktiviert es. Ein Persona-Bundle, das
 *      niemand mountet, ist toter Text.
 *   2. Zustandsvertrag (assets/persona-state.json): Baseline, die neun
 *      Event-Übergänge, und für jeden erreichbaren Mood eine Stimme. Ein Mood
 *      ohne Voice wäre ein Zustand ohne Ausdruck.
 *   3. Grenze: der Laufzeitcode beobachtet und rendert — er ruft kein Modell,
 *      startet kein Tool, schreibt nichts. Statisch geprüft, kommentarblind.
 */
```

## Kanon k-4a72578c6500 {#k-4a72578c6500}

Fundstellen: scripts/gate/plugins/probe-twin.mjs:28–39

Volltext des gekürzten Blocks (Stand 2026-10-17):

```
/**
 * `nachtrag` — die standardisierte Nachmessung.
 *
 * Warum es das Feld gibt und warum es eine FORM hat: eine Probe wird nicht
 * nachträglich aktuell gemacht (`docs/INDEX.md` §2), aber eine Aussage kann durch
 * eine spätere Messung teilweise überholt sein. Statt den Belegtext still zu
 * überschreiben, trägt die Probe einen Nachtrag mit DATUM und GELTUNGSBEREICH —
 * maschinenlesbar, damit er nicht zur Prosa wird, die niemand prüft.
 *
 * @param {unknown} nachtrag
 * @param {string} file
 */
```

## Kanon k-c577bc271c7d {#k-c577bc271c7d}

Fundstellen: scripts/gate/plugins/probe-twin.mjs:1–19

Volltext des gekürzten Blocks (Stand 2026-10-17):

```
/**
 * probe-twin — Probe/Twin-Contract (Falsify_Me-Prinzip, nativ).
 *
 * Trennung, die trägt:
 *   - Der STRUKTUR-Prüfer (Validator) sieht nur Form: gibt es Proben, haben
 *     sie Ziele, sind IDs eindeutig? Er urteilt NICHT über Wahrheit.
 *   - Der SEMANTIK-Executor (Twin) führt aus und liefert Evidenz.
 *   - Das Gate entscheidet aus tatsächlichen Ergebnissen, nie aus Prosa.
 *
 * Dieses Gate ist der Validator: es prüft die Probe-Definitionen in
 * docs/probes/*.json strukturell. Es führt nichts aus (kein Netz, kein
 * Modell) — Ausführung ist der Twin, und der gehört nicht in ein Gate.
 *
 * Vokabular (Falsify_Me): BESTAETIGT | WIDERSPRUCH | UNKLAR
 * Verdicts:                 PLAN | RESEARCH | ASK | WRITE
 *
 * Anti-Vakuum: eine Probe ohne Ziel oder ohne erwartetes Ergebnis ist keine
 * Probe. „Wiederholung ist kein Beweis" — eine leere Probe bestätigt nichts.
 */
```

## Kanon k-fde21885c05c {#k-fde21885c05c}

Fundstellen: scripts/gate/plugins/registry.mjs:1–12

Volltext des gekürzten Blocks (Stand 2026-10-17):

```
/**
 * registry — Live Plugin Registry (nativ).
 *
 * Statt Boot-Time-Snapshots liest dieses Gate die tatsächlich vorhandenen
 * Bundles und meldet Abweichungen zwischen:
 *   - was auf der Platte liegt (packages/*)
 *   - was die Pakete deklarieren (package.json dsh.bundle.patch)
 *   - was das Profil lädt (dsh.profile.bundles)
 *
 * Eine Registry, die driftet, ist keine Registry. Geprüft wird Auflösbarkeit,
 * nicht nur Vorhandensein: ein Bundle ohne Patch-Datei kann DSH nicht mounten.
 */
```

## Kanon k-efca969d699e {#k-efca969d699e}

Fundstellen: scripts/gate/plugins/scoring.mjs:689–699

Volltext des gekürzten Blocks (Stand 2026-10-17):

```
/**
 * Ein Schreibverb zählen — lokale Map/Set-Aufräumarbeit ist KEIN Dienst-Ausgang.
 *
 * `sessionBlocks.delete(sessionId)` leert eine Map im Speicher, wenn eine
 * Sitzung neu beginnt; das ist dieselbe Buchhaltung wie `splice`, kein zweiter
 * Weg in die Ablage. Der Scan unterscheidet deshalb nach dem EMPFÄNGER: ein
 * `delete` auf einer hier als `new Map(...)`/`new Set(...)` gebundenen Variablen
 * zählt nicht, `store.delete('x')` schon. Die Zusage bleibt dieselbe — der eine
 * Ausgang ist der Signal-Anhang, jedes andere Schreibverb auf einem Dienst ist
 * ein Befund.
 */
```

## Kanon k-16875fba6079 {#k-16875fba6079}

Fundstellen: scripts/gate/plugins/scoring.mjs:520–535

Volltext des gekürzten Blocks (Stand 2026-10-17):

```
/**
 * Die Tendenz-Regeln prüfen (Zug 3): Vertrag, Klassen, Herkünfte.
 *
 * „Klassen und Herkünfte" heißt hier konkret: jede Klasse nennt ihren POL, jedes
 * von ihr beanspruchte Signal muss es geben, beobachtbar sein und DENSELBEN Pol
 * im Vertrag tragen (das Vorzeichen seines Deltas, nicht sein Name), kein Signal
 * darf zwei Klassen speisen, und kein beobachtbares Signal darf übrig bleiben —
 * sonst rechnet die Tendenz an ihm vorbei. Dazu die Stufen (absteigend, Ende bei
 * 0), die Haltungen (geordnet, benannte Klasse + Stufe, letzte bedingungslos),
 * die Mindestevidenz — und die drei Mechanismen mit auflösendem Ort.
 *
 * @param tendency - der Vertrag `assets/tendency-rules.json`.
 * @param rules - die Signaltabelle (Herkunft jedes Signals).
 * @param scoring - der Scorecard-Vertrag (Pol über das Delta, Vergessen über decay).
 * @param file - Anzeigename für Befunde.
 */
```

## Kanon k-503f02d3b7d7 {#k-503f02d3b7d7}

Fundstellen: scripts/gate/plugins/scoring.mjs:320–330

Volltext des gekürzten Blocks (Stand 2026-10-17):

```
/**
 * Die Signaltabelle prüfen (K5): genau sieben Zeilen, jede mit einem
 * erreichbaren Zulieferer oder einem benannten Grund, und keine erfundene
 * Quelle.
 *
 * Was hier fail-closed heißt: eine Zeile, die `observable: true` sagt und deren
 * Signaltyp nicht im Scorecard-Vertrag steht, wäre ein Wert, den niemand
 * berechnen kann. Eine Zeile, deren natives Ereignis der Spine nicht abbildet,
 * wäre ein Signal, das nie entstehen kann. Beides ist ein Befund, kein
 * stiller Ausfall.
 */
```

## Kanon k-147bc4dec520 {#k-147bc4dec520}

Fundstellen: scripts/gate/plugins/scoring.mjs:1–49

Volltext des gekürzten Blocks (Stand 2026-10-17):

```
/**
 * scoring — Scorecard, Decay, Relation, Tendenz. Lesen, nie schreiben.
 *
 * DIE ZUSAGE, ehrlich formuliert (Zug 3): der Scoring-Laufzeitcode LIEST. Sein
 * einziger Ausgang ist der Signal-Anhang im Index — EINE Operation (`save`) auf
 * dem einen schmalen Dienst, den der Projekt-Index anbietet; dazu genau EIN
 * `load` beim Start. Alles andere, was diese Schicht hervorbringt (Tafel,
 * Tendenz, Injektion), ist HERGELEITET und geht nirgendwohin. Frühere Fassungen
 * dieses Kopfes sprachen von „drei Zusagen" und von einer Schreib-Scope-Grenze,
 * die den Host nicht nannte: die Weitergabe an die Ablage ist ein Ausgang, und
 * ein Gate, das ihn verschweigt, prüft ihn auch nicht.
 *
 * Sieben Prüfungen:
 *   1. Schreib-Scope: der Scoring-Laufzeitcode enthält keinen einzigen
 *      Schreib-/Ausführungs-/Netz-/Modellaufruf, und jede Pfad-Angabe im Code
 *      bleibt im eigenen Paket auf bekannte Dateien beschränkt. Was nicht
 *      schreiben KANN, schreibt auch nicht daneben.
 *   2. Trigger-Vertrag fail-closed: kein Trigger feuert ins Leere — jede
 *      Dimension existiert, jede Relationsstufe ist benannt, jeder Skill steht
 *      im Technik-Profil, jeder Event-Typ kommt aus dem Spine, und die
 *      erwartete Nutzlast ist die, die der Spine liefert. Eine Lücke ist ein
 *      Fehler, kein stilles Überspringen.
 *   3. Konservativ bleibt konservativ: Decay klein, Kühlen mindestens zwei
 *      Signale, Triggerzahl gedeckelt — gegen Reward-Sparsität gebaut, nicht
 *      gegen sie getestet.
 *   4. Aktivierung: das Profil muss das Bundle laden, sonst läuft das
 *      Scoring nie (dieselbe Regel wie beim Persona-Gate).
 *   5. Signal-Vertrag (K5, fail-closed): die Signaltabelle trägt genau die
 *      sieben Zeilen, jede beobachtbare Zeile nennt eine Quelle, die es im
 *      Spine wirklich gibt und die er wirklich erreicht, jede nicht
 *      beobachtbare Zeile nennt ihren Grund, keine Zeile verspricht ein Signal
 *      ohne Zulieferer — und die Quelle eines Signals ist ein NATIVER DSH-Typ,
 *      den der Carrier abbildet. Kein Deckel, kein Zähler-Limit, keine
 *      Sekundenregel in den Daten.
 *   6. Tendenz-Vertrag (Zug 3): die Tendenz-Regeln tragen ihren Vertragsnamen,
 *      ihre KLASSEN decken jedes beobachtbare Signal genau einmal ab und kein
 *      Signal zwei Pole, ihre Stufen sind absteigend und enden bei 0, ihre
 *      Haltungen sind geordnete Bedingungen über benannte Klassen und Stufen
 *      (die letzte bedingungslos), die Mindestevidenz ist eine ganze Zahl ≥ 1 —
 *      und jeder der drei Mechanismen (Faktor, Widerruf, Vergessen) nennt einen
 *      ORT, der im Vertrag wirklich auflöst. Eine Tendenz ohne Herkunft wäre
 *      eine Behauptung; ein Mechanismus ohne Ort wäre eine Absichtserklärung.
 *   7. Ausgang: genau EIN `save` auf dem Dienst der Ablage (der Signal-Anhang)
 *      und genau EIN `load` beim Start — kein zweites Schreibverb, kein zweiter
 *      Weg. Das ist die Zusage aus dem Kopf, als Prüfung.
 *
 * Die reinen Funktionen sind ohne node_modules testbar; die Tests liegen in
 * scripts/gate/tests/scoring.test.mjs.
 */
```

## Kanon k-b45547fe86bf {#k-b45547fe86bf}

Fundstellen: scripts/gate/tests/backup-retention.test.mjs:2–12

Volltext des gekürzten Blocks (Stand 2026-10-17):

```
/**
 * scripts/gate/tests/backup-retention.test.mjs — die Aufbewahrungsregel als Vertrag.
 *
 * Warum diese Datei existiert: eine Löschregel ist die gefährlichste Art Regel,
 * die ein Werkzeug haben kann. Wer sie falsch schreibt, merkt es erst, wenn er
 * die Sicherung braucht. Diese Tests pinnen genau die vier Zusagen, die im
 * Kopf von `scripts/backup-retention.mjs` stehen — und sie laufen in einem
 * Temp-Ordner, damit kein Test je die echten Sicherungen des Nutzers sieht.
 *
 * Kein Netz, kein Boot, kein npm: reines Dateisystem, deshalb in jedem CI-Lauf.
 */
```

## Kanon k-9a8f05cad762 {#k-9a8f05cad762}

Fundstellen: scripts/gate/tests/bundle-resolution.test.mjs:2–44

Volltext des gekürzten Blocks (Stand 2026-10-17):

```
/**
 * scripts/gate/tests/bundle-resolution.test.mjs — der Ladepfad der Bündel.
 *
 * Warum diese Datei existiert: der Boot des aktiven Profils starb mit
 * `TypeError: Cannot read properties of undefined (reading 'validate')`. Der Grund
 * lag nicht im Paket, sondern in der AUFLÖSUNG: `profiles/shinon/node_modules/@shinon/traceability`
 * ist ein Link auf einen Prototyp AUSSERHALB dieses Repos
 * (`../../../../../Projekt Type/traceability-proto`). Node lädt für einen
 * Profil-Import zuerst `profiles/<name>/node_modules` — das Repo-Paket
 * `packages/traceability` wurde also nie geladen, sondorn beschattet. Der Prototyp
 * exportiert `Config = {}` (dokumentiert in seiner eigenen Zeile 78), Cordis liest
 * beim Mounten aber `Config['~standard'].validate` — und stirbt.
 *
 * Alle bisherigen Suiten waren grün, weil keine von ihnen den ECHTEN Ladepfad
 * ging: sie importierten `packages/<dir>/index.js` direkt (hook-pre-step,
 * prompter-contract, …) und sahen den Link nie. Ein frischer Klon hat umgekehrt
 * gar kein `profiles/<name>/node_modules` — deshalb war auch das Gate grün.
 *
 * Deshalb prüft diese Datei DREI Dinge am selben Gegenstand, und zwar in dieser
 * Reihenfolge der Härte:
 *
 *   1. STATIK (ohne node_modules, immer): `repo.bundleResolutionIssues()` ist
 *      leer. Die Regel ist EINE Quelle (`scripts/lib/repo.mjs`) und wird vom
 *      Gate-Plugin `bundle-resolution` und `scripts/profile-links.mjs --check`
 *      gelesen; `shinon doctor` ist als Laufzeit-CLI noch offen (S4). Ein Befund
 *      nennt Quelle, aufgelöstes Ziel und Abhilfe.
 *   2. AUFLÖSUNG (braucht eine Installation, sonst sichtbarer Skip): jedes
 *      Bündel des aktiven Profils löst aus dem PROFILVERZEICHNIS
 *      (`createRequire(profiles/<name>/package.json)`) in `packages/` auf — die
 *      Auflösung, die ein echter `shinon`-Start nimmt.
 *   3. MOUNT (braucht Installation und Cordis, sonst sichtbarer Skip): das
 *      aufgelöste Modul wird mit GENAU der installierten Profil-Config
 *      (`profiles/shinon/cordis.patch.yml`, Eintrag `shinon-traceability`) durch
 *      echtes Cordis validiert und aktiviert; die Auslieferung über
 *      `webserver/index-inject` trägt danach `{enabled: true, maxVisible: 3,
 *      duration: 4000}`. Eine Config OHNE Schema (`Config = {}`) durch DENSELBEN
 *      Weg muss genau den belegten Fehler werfen — der Fix darf den Fehler nicht
 *      verstecken, er muss ihn im Prototyp belassen und hier nachweisen.
 *
 * Was diese Datei NICHT beweist: kein `dsh --profile shinon` über die CLI, kein
 * Browser, kein Modellaufruf. Sie beantwortet genau eine Frage: löst ein
 * Profil-Start jedes Bündel in DIESES Repo auf, und trägt es die Profilwerte?
 */
```

## Kanon k-6adb1972ed54 {#k-6adb1972ed54}

Fundstellen: scripts/gate/tests/client-activation.test.mjs:2–58

Volltext des gekürzten Blocks (Stand 2026-10-17):

```
/**
 * scripts/gate/tests/client-activation.test.mjs — Aktivierungs-Wache der Client-Hälften.
 *
 * Warum diese Datei existiert: beim Web-Boot fielen `@shinon/markers`,
 * `@shinon/dashboard` und `@shinon/codingmon` als „did not activate“ heraus, obwohl
 * alle übrigen Suiten grün waren. Der Grund lag nicht in der Logik, sondern im
 * Zugriff: die drei Hälften lesen `ctx.locale`, deklarieren aber `inject: ['slots']`.
 * Ein Cordis-Context ist ein PROXY; ein direkter Dienst-Zugriff ohne Deklaration
 * wirft (`cannot get property "locale" without inject`) und kostet die ganze
 * Aktivierung. Die bis dahin einzigen Client-Tests hängten die Bundles an ein
 * PLATTES Attrappen-`ctx` an — ein flaches Objekt kann nicht werfen, also war der
 * Fehler unsichtbar (docs/testing.md: „test the real entry path“).
 *
 * Zwei Wachen, absichtlich mit verschiedenem Geltungsbereich (der Vertrag, den sie
 * prüfen, steht in der ausgelieferten Fassung: `dsh-cordis-client-runner/lib/client.js`
 * — „`ctx.get(name)` performs optional lookup; direct `ctx.serviceName` access is
 * gated by the fiber's `inject` declaration“):
 *
 *   1. STATIK (keine Abhängigkeiten, läuft auch in CI ohne Install): jede
 *      `packages/<dir>/client.js` darf `ctx.<dienst>` nur lesen, wenn `<dienst>` in
 *      ihrer `inject`-Liste steht oder eine dokumentierte Cordis-Fläche ist
 *      (`ctx.effect` aus `fiber.d.ts`, `ctx.on`/`ctx.emit` aus `events.d.ts`, …).
 *      Kommentare und Strings zählen nicht — der Scan läuft über `codeOnly`
 *      (`scripts/lib/source-scan.mjs`). Geprüft werden **nur** die Client-Hälften:
 *      die Host-Hälften lesen ihre Dienste in `ctx.inject([...], (ctx) => …)`-
 *      Rückrufen, wo der verschachtelte Context seine eigene Deklaration hat —
 *      ein statischer Scan kann das nicht verfolgen (gemessen: `key-router`,
 *      `prompter`, `shinon-forge`, `narrative`, `codingmon` `index.js` wären
 *      Fehlalarme), und der Host-Boot hat seine eigene Diagnose (`dsh-app-boot`).
 *   2. DYNAMIK (braucht `node_modules`, sonst sichtbarer Skip): jedes Bundle wird in
 *      einem vm-Kontext mit Browser-Attrappen geladen und über `ctx.plugin(...)` an
 *      eine ECHTE Cordis-Wurzel gehängt, die `slots` und `locale` aus einer
 *      Plugin-Fiber anbietet — dieselbe Komposition wie im Client. Zusage: `apply`
 *      läuft, wirft nicht, und das Menü-Label kommt aus der Registry
 *      (`@shinon/locale-de`s Wörterbuch), ohne Locale-Dienst aus der deutschen
 *      Tabelle — beides ohne Wurf.
 *
 *   3. MARKE (statisch + dynamisch): drei sichtbare Regressionen, gemessen am
 *      ausgelieferten Bundle statt am Augenschein. (a) Das Background-Branding
 *      hing am Hero-Slot und lag damit INNEN in der 34px-Hitbox der Hero-Zeile —
 *      `position:absolute; inset:0` deckte dort nur die Hitbox, das Fenster sah
 *      nichts. Es gehört in `shell.overlay` (kind list, scope root), den der
 *      ui-layout-`AppFrame` frame-weit rendert. (b) Die Laufanzeige („Arbeitet“)
 *      trug DSHs Wal als CSS-Maske; Shinons Zeichen, seine Palette und seine
 *      Bewegung müssen das ersetzen. (c) Die Marken-Slots der Sidebar und des
 *      Hero sind Single-Slots MIT Fallback — gibt ein Besetzer auf, haengt dort
 *      wieder DSHs Fisch. Deshalb genau EIN Besetzer je Slot, und das eigene
 *      Zeichen ist aus Kurven gebaut, nicht aus Pixeln.
 *
 * Was der Test NICHT beweist (ehrlich): der Locale-Dienst ist eine Attrappe mit
 * derselben Schnittstelle (`addLanguage`/`register`/`bind`), nicht der echte
 * DSH-Dienst; ein voller `dsh --profile shinon`-Boot ist hier nicht möglich (die
 * CLI ist nicht installiert). React, DOM und Uhr sind Attrappen. Die CSS-Regeln
 * werden als Text geprueft — ob der Browser sie GENAU so anwendet, zeigt erst
 * ein lebender Boot (Spezifitaet: Attribut + Klasse schlaegt die gelieferte
 * Klassen-Regel; die Konvention steht hier als Zusage, nicht als Messung).
 */
```

## Kanon k-481e2ce4aee7 {#k-481e2ce4aee7}

Fundstellen: scripts/gate/tests/client-locale.test.mjs:2–25

Volltext des gekürzten Blocks (Stand 2026-10-17):

```
/**
 * Abnahmetest für Schritt 2.6 (F-l / F-m): kein werfender Dienstzugriff in den
 * Client-Hälften, und keine zweite Sprachtabelle ohne Besitzer.
 *
 * Warum diese Datei existiert: zwei Fehler derselben Familie haben die
 * Oberfläche schon einmal gekostet — ein direkter Dienstzugriff (`ctx.locale`,
 * `ctx[name]`) am Cordis-Proxy wirft ohne `inject`
 * ('cannot get property "locale" without inject'), und die Fallback-Texte der
 * Hälften waren neben dem Wörterbuch von @shinon/locale-de eine zweite Wahrheit.
 * Beides ist statisch prüfbar, also wird es geprüft statt erinnert:
 *
 *   1. `ctx.locale` darf NUR in `@shinon/locale-de` stehen (der Besitzerin des
 *      Namensraums); jede andere Hälfte liest `ctx.get?.('locale')`.
 *   2. `ctx[<name>]` (Klammerzugriff auf einen Dienst) kommt in keiner
 *      Client-Hälfte vor — das ist derselbe direkte Zugriff in anderer Schreibweise.
 *   3. Jeder Fallback-Schlüssel der generierten Bausteine existiert als Schlüssel
 *      im `shinon`-Wörterbuch von `locale-de` — keine Texte ohne Besitzer.
 *
 * Geprüft wird CODE (Kommentare und String-Inhalte zählen nicht, siehe
 * scripts/lib/source-scan.mjs): die Blöcke ERKLÄREN den Fehler, den sie vermeiden.
 *
 * Läuft mit `node --test` (CI: .github/workflows/commit-guard.yml), in der
 * Gate-Suite `npm run gate:test`. Kein Netz, kein node_modules.
 */
```

## Kanon k-9165167c107a {#k-9165167c107a}

Fundstellen: scripts/gate/tests/codingmon-store.test.mjs:2–19

Volltext des gekürzten Blocks (Stand 2026-10-17):

```
/**
 * Abnahmetest des dauerhaften Spiegels (@shinon/codingmon, Host-Seite).
 *
 * WAS HIER BEWIESEN WIRD: der Spielstand ueberlebt einen NEUSTART. Nicht gegen
 * eine Attrappe, sondern gegen die echten Bausteine der installierten
 * DSH-Version: `ctx.storageDomain` aus @deepseek-ai/dsh-storage-domain ueber
 * dem JSON-Backend aus @deepseek-ai/dsh-storage-json, gemountet in einen echten
 * Cordis-Context — dieselbe Mechanik, die das Profil mountet.
 *
 * Die Zusage ist bewusst NICHT „es gibt eine Datei\": geprueft wird, dass ein
 * ZWEITER Prozess-Kontext (frisches `Context`, frisch geoeffnete Domain)
 * denselben Stand liest — genau das, was beim Absturz der Forge zaehlt.
 *
 * Lauf mit `node --test` (CI: .github/workflows/commit-guard.yml). Braucht die
 * installierte DSH-Version im PATH und die Schema-/Domain-Pakete aufloesbar;
 * fehlt eines davon, wird der Test SICHTBAR uebersprungen (Grund im Namen)
 * statt rot zu werden — CI hat kein node_modules.
 */
```

## Kanon k-55c75852748d {#k-55c75852748d}

Fundstellen: scripts/gate/tests/commit-trailer.test.mjs:2–14

Volltext des gekürzten Blocks (Stand 2026-10-17):

```
/**
 * Tests der Commit-Regeln (kein KI-Footer, Vannon-Trailer Pflicht).
 *
 * Drei Ebenen:
 *   1. Regeln (reine Funktionen): was verboten ist, was Pflicht ist, was der
 *      Tausch tut — inklusive Idempotenz.
 *   2. Mechanismus: Hooks und CI-Workflow werden gegen ihre Zusagen geprüft
 *      (fail-closed prüfen, nicht reparieren; immer laufen, nicht filtern).
 *   3. Echter Lauf: der Wächter als CLI gegen eine Datei und gegen ein
 *      temporäres Git-Repository — Exit-Codes zählen, nicht Absichten.
 *
 * Läuft mit `node --test` — kein node_modules, kein Netz.
 */
```

## Kanon k-e0470d3d54de {#k-e0470d3d54de}

Fundstellen: scripts/gate/tests/context-resolver.test.mjs:2–30

Volltext des gekürzten Blocks (Stand 2026-10-17):

```
/**
 * Abnahmetest des MAX Context Resolvers — Phase 9 (Plan §14 Rangfolge und
 * Context Budget, §15 Untrusted Project Context).
 *
 * Der Resolver ist die fehlende Haelfte zwischen Index und Enhancer: der Index
 * traegt Symbole, Kanten, Touches und Chunks, der Enhancer kennt den
 * Kontextvertrag — aber niemand machte aus einem ROHTEXT relevanten Kontext.
 *
 * Fuenf Ebenen, bewusst getrennt:
 *   1. Die Rangfolge aus §14 an einem Fixture: exakter Pfad vor exaktem Symbol
 *      vor Paket/Modul vor Touches vor FTS — als Ausgabereihenfolge, nicht als
 *      Kommentar.
 *   2. Das harte Budget: die Ausgabe bleibt unter der Grenze, auch wenn eine
 *      Datei allein groesser ist als das Budget, und ein groesseres Budget
 *      liefert eine Obermenge.
 *   3. Die einzige Quelle ist der INDEX: eine nach dem Lauf geaenderte Datei
 *      liefert den indizierten Text, eine geloeschte liefert ueberhaupt noch
 *      Text, und ein ausgeschriebener Wert kommt redigiert an. Damit haengt der
 *      Resolver am Secret-Schutz aus Phase 8 statt an der Platte.
 *   4. Der Seam zum Enhancer: die Ausgabe besteht den Kontextvertrag des
 *      Prompt-Pakets (ContextSchema), ihre Pfade sind fuer Referenzen
 *      aufloesbar, und der Kontextblock aus §15 landet als DATEN in der
 *      Nutzer-Nachricht — der Aufruf traegt weiterhin keine Faehigkeit.
 *   5. Der Randfall: kein bekannter Bezug heisst leerer Kontext, nicht
 *      geworfener Fehler; zwei Laeufe liefern dasselbe.
 *
 * Kein Netz, kein Modell, kein node_modules im Repo — wie die uebrigen
 * Abnahmetests dieses Ordners.
 */
```

## Kanon k-715a14a768e8 {#k-715a14a768e8}

Fundstellen: scripts/gate/tests/context-wiring.test.mjs:2–27

Volltext des gekürzten Blocks (Stand 2026-10-17):

```
/**
 * Abnahmetest der Naht „MAX Context Resolver → Prompt-Enhancer".
 *
 * Bisher war MAX an eine JSON-DATEI gebunden: ohne `contextPath` wurde der Modus
 * abgelehnt (MODE_NEEDS_CONTEXT). Der Index aus §14 kann denselben Kontext je
 * Prompt liefern — aber der Enhancer darf ihn nicht IMPORTIEREN: die Pakete
 * dieses Repos referenzieren einander nicht. Die Naht ist deshalb eine
 * Faehigkeit, die der Index ueber `ctx.provide` anbietet und der Enhancer
 * OPTIONAL ueber `ctx.get` liest (kein Injektionszwang — sonst waere der
 * Enhancer in einem Profil ohne Index gar nicht geladen).
 *
 * Vier Ebenen, bewusst getrennt:
 *   1. Die Faehigkeiten des Index: seit Zug 2 sind es ZWEI — die Abfrage
 *      (`resolveContext`, der Kontext fuer MAX) und die Ablage (`load`/`save`,
 *      das dauerhafte Gedaechtnis des Scorings). Jede ist schmal, jede hat
 *      ihren eigenen Vertragsnamen, und ohne Index gibt die Abfrage eine
 *      ehrliche Leere (null) statt eines leeren Index.
 *   2. Die Naht als Daten: Dienstname und Vertragsname stimmen in beiden Paketen
 *      ueberein — gepinnt von AUSSEN, weil kein Paket das andere liest.
 *   3. Der echte Durchlauf: beide Bundles an einem echten Cordis-Context, echter
 *      Waterfall agent/pre-step, echte Validierung des gelieferten Kontexts.
 *   4. Die Quelle im Datensatz: index | file | none — die Herkunft ist
 *      nachpruefbar, nicht geraten.
 *
 * Kein Netz, kein Modell, kein node_modules im Repo.
 */
```

## Kanon k-0da7e92c5dad {#k-0da7e92c5dad}

Fundstellen: scripts/gate/tests/desktop-integration.test.mjs:1–23

Volltext des gekürzten Blocks (Stand 2026-10-17):

```
/**
 * desktop-integration.test.mjs — der Starter zeigt auf eine VERIFIZIERTE Laufzeit,
 * und der Mint/Debian-Weg ist ein echter .deb-Build.
 *
 * Warum es diesen Test gibt (Befund 2026-10-17): `desktop-launcher.mjs` setzte den
 * `.desktop`-Start aus `process.execPath` zusammen — dem Interpreter, mit dem der
 * Launcher zufällig gestartet wurde. Ein `.desktop`-Eintrag überlebt den Aufruf,
 * der ihn geschrieben hat: zeigt er danach auf ein untaugliches Node, startet der
 * Klick in einen Fehler, den niemand sieht. Außerdem gab es keinen
 * Paketierungsweg (nur einen Satz in `docs/STARTER-PLAN.md`).
 *
 * Gepinnt wird:
 *   1. Exec nennt ABSOLUTE Pfade, und das Node-Binary ist gegen `engines`
 *      verifiziert (gestartet mit dem SYSTEM-Node, der das NICHT ist),
 *   2. die Quoting übersteht eine echte Shell (Arbeitsbaum mit Leerzeichen),
 *   3. der Lauf ist idempotent und `--check` erkennt einen veralteten Eintrag,
 *   4. `--uninstall` entfernt genau die Einträge,
 *   5. `node scripts/deb-build.mjs` baut mit `dpkg-deb` ein echtes Paket nach
 *      /opt/shinon-forge — ohne node_modules, ohne Laufzeitdaten.
 *
 * Läuft mit `node --test`; kein Netz, kein Modell. Ohne `dpkg-deb` meldet der
 * Paketteil SICHTBAR „übersprungen mit Grund\" statt grün zu lügen.
 */
```

## Kanon k-da88cab557ba {#k-da88cab557ba}

Fundstellen: scripts/gate/tests/doctor-cli.test.mjs:2–23

Volltext des gekürzten Blocks (Stand 2026-10-17):

```
/**
 * scripts/gate/tests/doctor-cli.test.mjs — `shinon doctor` (Release-Slice S4).
 *
 * Warum diese Datei existiert: `bin/shinon.mjs` reichte jedes Argument an DSH
 * durch — `shinon doctor` startete DSH, statt eine eigene Diagnose zu liefern.
 * Das statische Gate (`scripts/gate/plugins/doctor.mjs`) prüft nur
 * Repo-Konsistenz, keine Laufzeit-Gesundheit. PLAN.md §9.1 S4 verlangt den
 * Laufzeit-Unterbefehl mit drei Eigenschaften, und genau die drei prüft diese
 * Datei — wie ein Messgerät, das zwischen gebautem Code und belegter Zusage
 * unterscheidet, statt eine Absicht grün zu färben:
 *
 *   1. EIGENER Unterbefehl: `node bin/shinon.mjs doctor --json` liefert den
 *      Doctor-Bericht (kein DSH-Start, kein fremder Exit-Code).
 *   2. READ-ONLY: ein Lauf ändert den Arbeitsbaum nicht
 *      (`git status --porcelain` vorher/nachher gleich) und die Quelle
 *      enthält keinen Schreibaufruf.
 *   3. STABILE Codes + PRESENCE-ONLY: Exit ∈ {0,1,2}, JSON-`exitCode` gleich
 *      Prozess-Exit, `status`↔`exitCode` deckungsgleich — und ein gesetzter
 *      Fake-Schlüssel erscheint weder in stdout noch stderr (nur `true`).
 *
 * Kein Netz, kein Modell, kein DSH-Boot: der Doctor fragt nur `--version` ab.
 */
```

## Kanon k-c52bbfb3e3dc {#k-c52bbfb3e3dc}

Fundstellen: scripts/gate/tests/dsh-pin.test.mjs:1–24

Volltext des gekürzten Blocks (Stand 2026-10-17):

```
/**
 * dsh-pin.test.mjs — vier Quellen, EINE DSH-Fassung.
 *
 * Warum es diesen Test gibt (Befund 2026-10-17, Punkt A4 der Release-Abnahme):
 * Root-Pin und Lockfile nannten `0.2.1-alpha.1`, genau diese Fassung lud auch die
 * Laufzeit — und `vendor/dsh` stand mit `0.2.1-alpha.2` daneben. Vier Stellen, zwei
 * Meinungen: wer die Fassung ändert, musste sie an vier Orten ändern und erfuhr
 * nirgends, wenn er es an einem vergaß. Ein Beleg, der nicht stimmen *kann*, ist
 * schlimmer als keiner, weil er wie ein Nachweis aussieht.
 *
 * Gepinnt wird (fail-closed, ohne Netz, ohne `node_modules`):
 *   1. Root-Pin und Lock nennen dieselbe Fassung, und das Lock zeigt auf genau
 *      diesen Tarball — die Fassung ist damit an das ausgelieferte Artefakt gebunden,
 *   2. das Manifest und das vendorte `package.json` nennen sie ebenfalls,
 *   3. die `integrity` im Manifest ist die des Locks (derselbe Tarball, nicht ein
 *      zweiter),
 *   4. jede vendorte Datei trägt den `sha256` und die Größe aus dem Manifest —
 *      keine fehlt, keine ist übrig.
 *
 * Was hier NICHT geprüft wird: die **installierte** Binary. Sie ist nicht Teil des
 * Baums (CI hat kein `node_modules`), und ein Test, der dann sichtbar überspringt,
 * verletzt die Zusage „kein Skip“ aus B2. Die Gleichheit von Pin und Installation
 * prüft `scripts/gate/tests/message-ingress.test.mjs`, wo der Harness wirklich da ist.
 */
```

## Kanon k-42c3fadcad85 {#k-42c3fadcad85}

Fundstellen: scripts/gate/tests/events-spine.test.mjs:2–14

Volltext des gekürzten Blocks (Stand 2026-10-17):

```
/**
 * Tests des Hook/Event-Spines (Wave 2).
 *
 * Zwei Ebenen, bewusst getrennt:
 *   1. Contract-Gate (reine Funktionen): Vertrag, Fixture, Nicht-Aktions-Grenze.
 *   2. Replay des ECHTEN Bundles: das Paket wird in ein temporäres Verzeichnis
 *      kopiert, mit einem Schemastery-Stub versehen (die einzige peer-Dependency,
 *      die hier nicht installiert ist) und über seine echte apply()-Schnittstelle
 *      gefahren. Die Fixture ist das Orakel: derselbe Event-Pfad muss dieselben
 *      Envelopes ergeben.
 *
 * Läuft mit `node --test` — kein node_modules, kein DSH, kein Netz.
 */
```

## Kanon k-5e9bc74b18ed {#k-5e9bc74b18ed}

Fundstellen: scripts/gate/tests/helpers/client-sandbox.mjs:1–16

Volltext des gekürzten Blocks (Stand 2026-10-17):

```
/**
 * scripts/gate/tests/helpers/client-sandbox.mjs — Browser-Attrappe und Lader
 * für Client-Hälften.
 *
 * Warum das eine eigene Datei ist: `scripts/gate/tests/client-activation.test.mjs`
 * und `scripts/gate/tests/markers.test.mjs` prüfen BEIDE das echte Bundle in einem
 * `vm`-Kontext (der eine die Aktivierung, der andere die wirksamen Grenzen aus der
 * Seite). Zwei Kopien derselben Attrappe würden driften und genau den Fehler
 * wiederholen, den die Tests finden sollen. Diese Datei ist KEIN Test (sie liegt
 * nicht im Glob `scripts/gate/tests/*.test.mjs`) und läuft in CI ohne node_modules.
 *
 * Sie liefert eine Fläche, die bewusst nur das trägt, was die Hälften anfassen:
 * `document`, `localStorage`/`sessionStorage` (dieselbe Attrappe — ein zweiter
 * Speicher fällt im Vertragstest auf), eine Uhr ohne echte Timer, `CSS.escape`,
 * `matchMedia` und den `require`-Vertrag des Loaders (`react` oder Befund).
 */
```

## Kanon k-8b7ce787e486 {#k-8b7ce787e486}

Fundstellen: scripts/gate/tests/hook-pre-step.test.mjs:2–25

Volltext des gekürzten Blocks (Stand 2026-10-17):

```
/**
 * Phase 1 — Abnahmetest des echten DSH-Hooks (@shinon/hook).
 *
 * Die Gate-Bedingung aus dem Implementierungsplan lautet: „Ein Test beweist,
 * dass agent/pre-step tatsächlich durch @shinon/hook läuft und der normale
 * DSH-Ablauf erhalten bleibt."
 *
 * Deshalb wird hier NICHT gegen einen selbstgebauten Fake-Host geprüft, sondern
 * gegen die echten Bausteine der installierten DSH-Version: das Bundle wird über
 * seine echte apply()-Schnittstelle registriert (mit dem ECHTEN Schemastery der
 * DSH-Installation, nicht gestubbt), und der Waterfall läuft über einen echten
 * Cordis-Context — also über dieselbe Mechanik, die
 * @deepseek-ai/dsh-agent-loop für `agent/pre-step` benutzt.
 *
 * Wäre die Waterfall-Semantik falsch verstanden (falscher Rückgabewert, kein
 * next(), doppeltes next()), würden diese Tests fehlschlagen.
 *
 * Aufbau: die Tests sind der Vertrag. Jeder Test benennt eine Zusage und deckt
 * ihre Fälle als Tabelle ab, statt Fälle zu wiederholen.
 *
 * Läuft mit `node --test` (CI: .github/workflows/commit-guard.yml). Kein
 * node_modules im Repo, kein Netz, kein Modell. `dsh` muss im PATH liegen —
 * dieselbe Voraussetzung wie für den Profiltest.
 */
```

## Kanon k-9668127c3c07 {#k-9668127c3c07}

Fundstellen: scripts/gate/tests/install-user.test.mjs:2–18

Volltext des gekürzten Blocks (Stand 2026-10-17):

```
/**
 * scripts/gate/tests/install-user.test.mjs — der Vertrag des User-Installats
 * (`scripts/install-user.mjs`).
 *
 * Warum diese Datei existiert: der Befehl ist der wiederholbare Weg in ein
 * Nutzer-Installat und trifft Entscheidungen, die man nicht am Bildschirm
 * erkennen kann — welchen Unterbefehl er kennt, wann er sich weigert und was
 * `status` über einen leeren Ort sagt. Ein Werkzeug, das bei einem falschen
 * Argument still das Falsche tut, wäre schlimmer als Handarbeit.
 *
 * Geprüft wird NUR die Oberfläche (kein Netz, kein npm ci, kein Boot): die
 * Abnahme selbst ist ein Laufzeitbeleg und steht im Protokoll der Sitzung,
 * nicht in einem Test, der ohne Registry und ohne 621 Pakete laufen muss.
 *
 * Die Zustandsdatei wird über `SHINON_STATE_DIR` in ein Temp-Verzeichnis
 * gelenkt — der Test liest und schreibt nie den echten Installationszustand.
 */
```

## Kanon k-a0977c801963 {#k-a0977c801963}

Fundstellen: scripts/gate/tests/key-router-override.test.mjs:2–45

Volltext des gekürzten Blocks (Stand 2026-10-17):

```
/**
 * key-router-override — der Pool erreicht die Route (PLAN.md §3.12).
 *
 * WARUM DIESE DATEI EXISTIERT: der Router verwaltete seinen Pool und
 * beantwortete seine Werkzeuge — aber DSH bekam keinen rotierenden Schlüssel an
 * die Hand. Der alte Stand hatte das Problem an der falschen Stelle gesucht (zwei
 * Ereignisnamen ohne Emitter) und die Schlüssel obendrein aus `process.env`
 * gelesen, wo die `.env`-Werte nie stehen — im echten Boot blieb der Pool leer.
 * Ein Override, den niemand prüft, ist eine Behauptung mit Konfiguration.
 *
 * GEMESSEN AM INSTALLIERTEN HARNESS (0.2.1-alpha.1), NICHT GERATEN:
 *
 *   - Die Route löst ihren Schlüssel pro Aufruf über
 *     `ctx.get("credentials").resolve(ref)` auf (`resolveApiKey` in
 *     `dsh-llm-pi-ai`, eine Funktion, kein Wert); fehlt der Dienst, gilt die
 *     Startumgebung mit drei Schichten (Prozess, Projekt-`.env`,
 *     Benutzer-`.env`). Die Referenz ist zur Laufzeit eine Zeichenkette
 *     (`brandString` gibt den Wert unverändert zurück).
 *   - Eine fehlgeschlagene Anfrage läuft als Middleware über
 *     `agent/request-error` (Nutzdaten: provider, failure mit stabilem `code`);
 *     die Wiederholungs-Entscheidung fällt `llm-retry` — wer dort nur beobachtet
 *     und `next()` weitergibt, ändert nichts daran.
 *
 * DREI EBENEN:
 *
 *   1. QUELLE (ohne node_modules) — das Profil nennt für jeden Anbieter einen
 *      Umgebungsnamen (ohne Referenz kein Override — fail-closed), und die
 *      Naht-Ereignisnamen stehen als Literale in `index.js` (ein vertippter Name
 *      wäre ein Zuhörer ohne Sender, exakt der alte Fehler).
 *   2. VERHALTEN (ohne node_modules, am ausgelieferten Paket mit
 *      Dienst-Attrappen) — die Klammer bedient die verwaltete Referenz aus dem
 *      Pool, gibt Fremdes weiter, rückt nach einem beobachteten 429 vor und
 *      stellt nach `dispose` den Dienst wieder her. Jeder Schritt mit
 *      Kanarienvogel-Schlüsseln und abgefangenem Log.
 *   3. KETTE (braucht `node_modules`, sonst sichtbarer Skip wie beim
 *      Store-Test) — entfällt hier: `schemastery` ist installiert, der Test
 *      läuft direkt.
 *
 * Was der Test NICHT beweist (ehrlich): eine echte 429-Rotation gegen die
 * laufende Route — dafür bräuchte es zwei echte Schlüssel und einen erzwungenen
 * 429 in dieser Umgebung. Das steht in docs/ZAHLEN.md §4, nicht hier.
 *
 * Läuft mit `node --test` (`npm run gate:test`, CI mit `npm ci`).
 */
```

## Kanon k-e4b062f19c9f {#k-e4b062f19c9f}

Fundstellen: scripts/gate/tests/key-router-security.test.mjs:2–27

Volltext des gekürzten Blocks (Stand 2026-10-17):

```
/**
 * key-router-security — Schlüsselmaterial verlässt das Paket nicht.
 *
 * WARUM DIESE DATEI EXISTIERT: `@shinon/key-router` gab vor dieser Änderung aus
 * DREI Werkzeugen `key.slice(0, 8) + '…'` zurück und schrieb Schlüsselpräfixe in
 * jede Log-Zeile. Was ein Werkzeug zurückgibt, landet im Kontext des Modells und
 * in der Sitzungstranskription — ein „Präfix zur Wiedererkennung" ist dort ein
 * Leck, kein Komfort. Das Paket war inaktiv, also fiel es niemandem auf; beim
 * Aktivieren wäre es still mitgelaufen.
 *
 * DREI EBENEN, damit die Zusage nicht an einer Schreibweise hängt:
 *
 *   1. QUELLE (läuft ohne node_modules) — das Schema hat kein Schlüsselfeld, und
 *      die einzigen `console.log`/`console.warn`-Aufrufe des Pakets stehen in den
 *      beiden Filtern (`say`/`warn`). Wer künftig daneben loggt, wird rot, egal
 *      wie er die Zeile formuliert.
 *   2. KERN (läuft ohne node_modules) — `redact` und `statusOf` auf ihre Zusage:
 *      der Zustand trägt Beschriftungen, der Text wird gefiltert.
 *   3. AUSGELIEFERTES PAKET (braucht `node_modules`, sonst sichtbarer Skip) — das
 *      echte `apply` mit einer Kanarienvogel-Umgebung: jedes Werkzeug wird
 *      aufgerufen, jeder Log-Aufruf abgefangen, und danach wird gesucht, was nicht
 *      vorkommen darf. Der Verbindungstest läuft gegen ein gestelltes `fetch`, das
 *      beweist, dass der Schlüssel im KOPF ankommt — und danach nirgends mehr.
 *
 * Läuft mit `node --test` (`npm run gate:test`, CI ohne node_modules).
 */
```

## Kanon k-479c6716c93a {#k-479c6716c93a}

Fundstellen: scripts/gate/tests/key-router-wire.test.mjs:2–34

Volltext des gekürzten Blocks (Stand 2026-10-17):

```
/**
 * key-router-wire — der Draht beweist die Rotation (PLAN.md §3.12, EBENE 4).
 *
 * WARUM DIESE DATEI EXISTIERT: ein Pool, der gesunde Anbieter waehlt, ist noch
 * keine Rotation des tatsaechlich verwendeten Providers. Der Override-Test
 * (`key-router-override.test.mjs`) beweist, dass `credentials.resolve` den
 * Pool bedient — aber zwischen `resolve` und dem Anbieter steht noch der
 * REQUEST. Erst wenn ein echter Request mit dem gewaehlten Schluessel am
 * gewaehlten Anbieter ankommt, ist die Kette geschlossen.
 *
 * WAS HIER ECHT IST: `apply()` mit Dienst-Attrappen (wie im Override-Test),
 * das echte `key_router_probe`-Werkzeug, echtes `fetch` gegen einen echten
 * HTTP-Server — aber nur auf Loopback (127.0.0.1, ephemerer Port): kein Paket
 * verlaesst die Maschine. Die Schluessel sind Kanarienvogel (kein Material).
 *
 * WAS GEMESSEN WIRD, STUFE FUER STUFE:
 *
 *   1. Der erste Probe-Request traegt `Authorization: Bearer <K_A>` an die
 *      baseUrl des gewaehlten Anbieters — Auswahl, Kopfzeilen, Draht.
 *   2. Antwortet der Anbieter EINMAL mit 429, markiert genau dieser Versuch
 *      seinen Platz (failCount hoch, Cooldown laeuft).
 *   3. Der naechste Request traegt `Bearer <K_B>` — die Rotation ist auf dem
 *      Draht angekommen, nicht nur im Pool.
 *   4. Nirgendwo Schluesselmaterial: weder in den Werkzeug-Antworten noch im
 *      Status — nur auf dem Draht, nur Richtung Anbieter.
 *
 * Was der Test NICHT beweist (ehrlich): eine 429-Rotation gegen die laufende
 * Route mit echten Schluesseln — dafuer braeuchte es zwei echte Schluessel und
 * einen erzwungenen 429 in dieser Umgebung. Das steht in docs/ZAHLEN.md §4,
 * nicht hier.
 *
 * Laeuft mit `node --test` (`npm run gate:test`, CI mit `npm ci`).
 */
```

## Kanon k-624662eb6a53 {#k-624662eb6a53}

Fundstellen: scripts/gate/tests/ledger-separation.test.mjs:1–19

Volltext des gekürzten Blocks (Stand 2026-10-17):

```
/**
 * ledger-separation.test.mjs — der dauerhafte Ledger liegt NICHT mehr im Index.
 *
 * Warum es diesen Test gibt (Befund 2026-10-17): der Scoring-Stand lebte als
 * Namensraum in `~/.shinon/indexes/<hash>/index.sqlite` — derselben Datei, die
 * der Index jederzeit neu bauen darf und die als Cache jederzeit verschwinden
 * kann. Nutzerurteile sind nicht herstellbar; ein `rm -rf` im Cache hätte sie
 * mitgenommen. Seit der Trennung: Index → XDG-Cache (wiederherstellbar),
 * Ledger → XDG-Daten (`ledger.sqlite`, eigene Fassung, eigene Verbindung).
 *
 * Gepinnt wird:
 *   1. WAL/Busy-Timeout/Foreign-Keys an BEIDEN Verbindungen (eine Öffnungsquelle),
 *   2. die Migration ist VERLUSTFREI (Zeilen, Ordnung, Dokumente byte-gleich),
 *   3. sie ist IDEMPOTENT (zweiter Lauf tut nichts) und lässt die Quelle stehen,
 *   4. der Stand überlebt einen Index-Neuaufbau UND eine geleerte Indexwurzel,
 *   5. ein Lauf im Worker hinterlässt keinen Zombieprozess und kein Handle.
 *
 * Läuft mit `node --test`; kein Netz, kein Modell, kein node_modules nötig.
 */
```

## Kanon k-a29e0a72ced1 {#k-a29e0a72ced1}

Fundstellen: scripts/gate/tests/markers.test.mjs:2–16

Volltext des gekürzten Blocks (Stand 2026-10-17):

```
/**
 * Tests des Marker-Spiegels (Wave 3).
 *
 * Drei Ebenen:
 *   1. Vertrag + Gates (reine Funktionen): die echte Datei muss sauber sein,
 *      und jede mutierte Kopie muss Befunde liefern — ein Gate, das nie rot
 *      werden kann, ist Dekoration.
 *   2. Spiegel-Logik im echten Bundle: das Paket wird in ein Temp-Verzeichnis
 *      kopiert und mit einem Schemastery-Stub geladen (wie beim Event-Spine).
 *      Geprüft werden Ableitung, Prüfung, Nutzlast-Format und Fail-Closed.
 *   3. Client-Vertrag: Slot-Verdrahtung, Speicherschlüssel und die Nutzlast-
 *      Vorlage — Client und Vertrag dürfen nicht auseinanderlaufen.
 *
 * Läuft mit `node --test` — kein node_modules, kein Netz.
 */
```

## Kanon k-38e58c249e52 {#k-38e58c249e52}

Fundstellen: scripts/gate/tests/message-ingress.test.mjs:2–22

Volltext des gekürzten Blocks (Stand 2026-10-17):

```
/**
 * Einheitlicher Message-Eingang — der Vertrag von Block 01.
 *
 * Behauptung: jeder Weg, auf dem ein Prompt in den Hauptagenten kommt (UI Send,
 * Enter, followup(), steer(), Warteschlange, headless, SDK, ACP, Befehl), laeuft
 * durch DENSELBEN Runtime-Seam `agent/pre-step` — und der Send-Button enthaelt
 * keine eigene Prompt-Logik.
 *
 * Warum das pruefbar ist, ohne einen Browser zu starten: der Harness hat genau
 * EINEN Einfuegepunkt (Agent.send -> inbox.splice) und genau EINEN Konsumenten
 * (preStep -> waterfall 'agent/pre-step'), und der Modellaufruf liegt hinter
 * diesem Seam. Wer immer eine Nachricht einspeist, benutzt `send`; wer immer den
 * Seam umgehen wollte, muesste `inbox` direkt fuellen — und auch dann laeuft er
 * durch `preStep`, weil es keinen zweiten Konsumenten gibt.
 *
 * Die Zusagen gelten fuer die INSTALLIERTE Fassung. Ein DSH-Update macht sie
 * nicht falsch, sondern ungeprueft — deshalb bricht der letzte Test bei einer
 * anderen Version absichtlich, statt still weiterzugelten.
 *
 * Läuft mit `node --test` (CI). Kein Netz, kein Modell, kein Browser.
 */
```

## Kanon k-8ac8d942847b {#k-8ac8d942847b}

Fundstellen: scripts/gate/tests/narrative.test.mjs:2–24

Volltext des gekürzten Blocks (Stand 2026-10-17):

```
/**
 * Narrative (Zug 6) — der Kanal hat einen Abnehmer.
 *
 * Der Befund, der dieses Gate nötig gemacht hat: `@shinon/narrative` emittierte
 * seit Zug 5 auf `shinon/narrative/state`, und diesen Kanal hatte NIEMAND
 * abonniert. Die Engine rechnete, der Composite ging ins Leere, und kein Test
 * konnte das sehen — die Paket-Tests prüfen die Mathematik, nicht die
 * Verdrahtung. Diese Datei prüft die Verdrahtung.
 *
 * Vier Ebenen:
 *   1. Der Vertrag: die Ableitung ist vollständig und jeder Mood-Ereignistyp
 *      existiert im Spine (ein Takt auf ein Ereignis, das es nicht gibt, klingt nie).
 *   2. Die Naht als DATEN: Kanalname und Vertragsname sind auf beiden Seiten
 *      LITERALE (kein Paket importiert das andere) — gepinnt über `twinIssues`
 *      und gegen das echte Bundle. Drift wäre hier STILL.
 *   3. `renderNarrative` ist rein: voller Composite → Abschnitt, fehlender → `null`.
 *      Kein leerer Abschnitt, keine Behauptung.
 *   4. Der echte Bundle-Pfad: das Persona-Bundle an einen Fake-Host gehängt, der
 *      nur `on`/`inject`/`get` kennt, ein Composite auf den Kanal geschickt — der
 *      Abschnitt erscheint, der Persona-Zustand bleibt unberührt (Vorrang!).
 *
 * Läuft mit `node --test` — kein DSH, kein node_modules (Schemastery-Stub).
 */
```

## Kanon k-47ea64290546 {#k-47ea64290546}

Fundstellen: scripts/gate/tests/paths.test.mjs:1–18

Volltext des gekürzten Blocks (Stand 2026-10-17):

```
/**
 * paths.test.mjs — EIN Pfaddienst, geprüfte Overrides, getrennte Lebensdauern.
 *
 * Warum es diesen Test gibt (Befund 2026-10-17): `DSH_HOME=$PWD` koppelte
 * Laufzeitzustand an das Repository, `sessions/` und `storages/` lagen im Baum,
 * und der Projektindex lag mit dem dauerhaften Ledger in DERSELBEN Datei unter
 * `~/.shinon/indexes` (einem selbstgewählten Ort ohne Konvention). `.gitignore`
 * verhindert Commits — es isoliert keine Pfade.
 *
 * Gepinnt wird:
 *   1. XDG-Basen mit korrekten Defaults (Linux), Overrides nur absolut,
 *   2. workspaceRoot ≠ installRoot, und das Installat ist zur Laufzeit read-only,
 *   3. der Index liegt im CACHE, der Ledger in den DATEN — physisch getrennt,
 *   4. kein Laufzeitort liegt unter einem Installat,
 *   5. `runtimeEnv()` setzt genau die Variablen, die unsere Host-Hälften lesen.
 *
 * Läuft mit `node --test`; kein Netz, kein Modell, kein node_modules nötig.
 */
```

## Kanon k-97fdc6865b4a {#k-97fdc6865b4a}

Fundstellen: scripts/gate/tests/persona-prompt.test.mjs:2–26

Volltext des gekürzten Blocks (Stand 2026-10-17):

```
/**
 * Der Projekt-Kontext der Persona — bis in den fertigen System-Prompt geprüft.
 *
 * ANLASS (gemessen 2026-10-16 im echten Profil-Lauf): in
 * `packages/persona/index.js` wurde `isAbsolute` benutzt, aber nie aus
 * `node:path` importiert. Der ReferenceError fiel in das try/catch des Blocks
 * und wurde zu einer Warnung:
 *
 *   [shinon-persona] Projekt-Kontext nicht lesbar (isAbsolute is not defined)
 *
 * Die Persona startete also OHNE den Projekt-Kontext — in JEDEM Lauf, weil das
 * Profil `projectContextPath: .shinon/project-context.md` setzt und damit genau
 * den relativen Zweig nimmt. Der Fehler war nur deswegen leise, weil eine
 * fehlende Datei und ein kaputter Import dieselbe Warnung ergaben.
 *
 * WARUM HIER UND NICHT AM FAKE-HOST: `persona-state.test.mjs` prüft das
 * Paketverhalten ohne node_modules und sieht nur die Abschnittsliste. DIESER
 * Test hängt dasselbe Bundle an den ECHTEN Dienst
 * `@deepseek-ai/dsh-system-prompt` aus der gepinnten Installation und liest den
 * zusammengebauten Prompt über dessen öffentliche Schnittstelle
 * (`assemble()` + `renderPrompt()`). Erst damit ist „der Inhalt landet im
 * System-Prompt" gemessen statt behauptet.
 *
 * Läuft mit `node --test`; braucht `dsh` im PATH (wie prompter-contract).
 */
```

## Kanon k-fb9ba8336530 {#k-fb9ba8336530}

Fundstellen: scripts/gate/tests/persona-state.test.mjs:501–513

Volltext des gekürzten Blocks (Stand 2026-10-17):

```
/**
 * GEMESSEN im echten Profil-Lauf 2026-10-16: JEDER Start meldete
 * `[shinon-persona] Projekt-Kontext nicht lesbar (isAbsolute is not defined)`.
 * `isAbsolute` wurde benutzt, aber nie aus `node:path` importiert; der
 * ReferenceError fiel in das try/catch dieses Blocks, das ihn in eine Warnung
 * verwandelt — die Persona startete also ohne Projekt-Kontext und sagte es nur
 * leise. Das Profil setzt `projectContextPath: .shinon/project-context.md`, der
 * RELATIVE Zweig ist damit der, der in jedem Lauf genommen wird.
 *
 * Der Prüfstand ist derselbe wie oben: echter Bundle-Pfad, Fake-Host, und die
 * registrierten Abschnitte sind von außen lesbar. Ein fehlender Import läßt den
 * Abschnitt verschwinden — dieser Test wird dann rot.
 */
```

## Kanon k-6b5398366388 {#k-6b5398366388}

Fundstellen: scripts/gate/tests/persona-state.test.mjs:2–16

Volltext des gekürzten Blocks (Stand 2026-10-17):

```
/**
 * Tests der Persona (Identity, State, Voice).
 *
 * Wie beim Event-Spine: zwei Ebenen.
 *   1. Vertrag + reine Ableitung (deriveState, renderStateContext) — ohne alles.
 *   2. Der echte Bundle-Pfad: Event → Zustand → System-Context. Das Paket wird
 *      in ein temporäres Verzeichnis kopiert, mit einem Schemastery-Stub
 *      versehen und über seine echte apply()-Schnittstelle an einen Fake-Host
 *      gehängt, der nur `on` (Events) und `inject` (System-Prompt) kennt.
 *
 * Damit ist die Nicht-Aktions-Grenze nicht nur behauptet: der Host hat gar
 * keine andere API, und die Tests würden bei jedem Zugriff darauf werfen.
 *
 * Läuft mit `node --test` — kein node_modules, kein DSH, kein Netz.
 */
```

## Kanon k-2ccb9a11e41d {#k-2ccb9a11e41d}

Fundstellen: scripts/gate/tests/plugin-idioms.test.mjs:2–23

Volltext des gekürzten Blocks (Stand 2026-10-17):

```
/**
 * Abnahmetest der einen Quelle für generierte Plugin-Bausteine
 * (scripts/lib/plugin-idioms.mjs).
 *
 * Warum diese Datei existiert: mehrere Host-Hälften trugen denselben
 * `settings.configure`-Block, mehrere Client-Hälften denselben Locale-Fallback —
 * dieselbe Prüfung, mehrfach gepflegt. Teilen ist hier nicht möglich
 * (jedes Paket wird einzeln verpackt, eine Client-Hälfte ist ein self-contained
 * Bundle, siehe Kopf der Quelle); also tragen die Pakete ABLEITUNGEN, und dieser
 * Test pinnt, dass die Ableitung wirklich eine ist:
 *
 *   1. Der Baum ist deckungsgleich: kein Block weicht von der Quelle ab, und
 *      keine Fundstelle der Signatur steht außerhalb eines Blocks.
 *   2. Die Prüfung ist nicht vakuum-grün: eine getippte Abweichung, eine fehlende
 *      Marke, eine überzählige Marke und eine neue Kopie ohne Marke werden
 *      JEWEILS rot — in einem temporären Wurzelverzeichnis, nicht am echten Baum.
 *   3. Der Schreiber repariert Drift, ist idempotent und rät nicht: fehlt eine
 *      Marke, bleibt die Datei unangetastet (fail-closed).
 *
 * Läuft mit `node --test` (CI: .github/workflows/commit-guard.yml). Kein Netz,
 * kein Modell, kein node_modules.
 */
```

## Kanon k-219fd7ed5cf1 {#k-219fd7ed5cf1}

Fundstellen: scripts/gate/tests/popup-overlay.test.mjs:2–35

Volltext des gekürzten Blocks (Stand 2026-10-17):

```
/**
 * popup-overlay — das Popup rendert WIRKLICH, und zwar an der Naht, die es kennt.
 *
 * WARUM DIESE DATEI EXISTIERT: `@shinon/popup` hiess „Trajectory-Overlay" und
 * hatte keinen Renderer. Der Host emittierte Eintraege auf `shinon/trajectory`,
 * die Client-Haelfte sagte in ihrem eigenen Kopf, dass sie sie nicht rendert, und
 * das Paket erklaerte sich im Manifest als `inactive`. Genau dieser Zustand ist
 * von einem kaputten nicht zu unterscheiden — kein Fehler, keine Warnung, kein
 * roter Test, nur eine leere Flaeche.
 *
 * GEPRUEFT WIRD DAS AUSGELIEFERTE BUNDLE (`__ModuleLoader__` -> `apply`), nicht
 * eine Kopie der Logik:
 *
 *   1. NAHT — der Slot, den das PROFIL wirksam setzt, ist derselbe, in dem sich
 *      die Client-Haelfte anmeldet. Die Haelfte kann den Host nicht importieren;
 *      ein anderer Slot im Profil liesse das Overlay still ins Leere rendern.
 *   2. SPRACHE — der Text kommt aus dem Woerterbuch (`popup.running`), die ZAHLEN
 *      aus der Sitzung; ohne Locale-Dienst gilt der deutsche Fallback der
 *      generierten Tabelle. Beide Wege werden gerendert und verglichen.
 *   3. VERHALTEN — mit einem laufenden Turn erscheint der Fortschritt, ohne Turn
 *      erscheint NICHTS (ein leeres Overlay sagt nichts aus), und ein beendeter
 *      Turn ist kein Vorgang.
 *   4. ZERLEGUNG — das Fenster liefert `tool/call` und `tool/result`
 *      (geschlossen ueber `data.message.source.callId`); die Anzeige nennt
 *      Schritt, offene Aufrufe und das zuletzt benutzte Werkzeug.
 *
 * Was der Test NICHT beweist (ehrlich): dass der Browser das Overlay malt. Er
 * fuehrt die Komponente mit einer React-Attrappe aus und vergleicht den Baum; die
 * Aktivierung am ECHTEN Cordis-Proxy (mit `slots`/`locale` aus einer Fiber)
 * prueft `client-activation.test.mjs` fuer jede Client-Haelfte, auch diese.
 *
 * Laeuft mit `node --test` (CI: .github/workflows/commit-guard.yml), in der
 * Gate-Suite `npm run gate:test`. Kein Netz, kein node_modules.
 */
```

## Kanon k-f09402fc7dad {#k-f09402fc7dad}

Fundstellen: scripts/gate/tests/port.test.mjs:2–18

Volltext des gekürzten Blocks (Stand 2026-10-17):

```
/**
 * port.test.mjs — Abnahmetest der dynamischen Port-Wahl (scripts/lib/port.mjs).
 *
 * Warum diese Datei existiert: der Wrapper hatte den Port als Konstante. War die
 * Nummer belegt, brach der Boot ab, bevor die READY-Zeile kam — und der Fehler
 * sah aus wie ein kaputtes Profil. Die Port-Wahl ist deshalb jetzt eine geprüfte
 * Zusage: eine ungültige Angabe wird gemeldet statt geraten, ein belegter Port
 * wird ÜBERSPRUNGEN, und ein volles Fenster endet in einem Abbruch statt in
 * einem stillen Rückfall auf einen belegten Port.
 *
 * Geprüft wird mit injizierter Probe (deterministisch, kein Socket) UND einmal
 * gegen einen echten Listener auf 127.0.0.1 — die Probe muss einen wirklich
 * belegten Port erkennen, sonst beweist sie nichts.
 *
 * Läuft mit `node --test` (CI: .github/workflows/commit-guard.yml). Kein Netz
 * nach außen, kein Modell, kein node_modules.
 */
```

## Kanon k-16a92d51f247 {#k-16a92d51f247}

Fundstellen: scripts/gate/tests/profile-config-override.test.mjs:2–28

Volltext des gekürzten Blocks (Stand 2026-10-17):

```
/**
 * profile-config-override — die Falle, die den Prompter drei Wochen stilllegte.
 *
 * BEFUND: eine id-gezielte Config in `profiles/<profil>/cordis.patch.yml` ERSETZT
 * die Config des Bundle-Eintrags, sie mischt nicht. Der Prompter hatte in
 * `packages/prompter/cordis.patch.yml` `mode: MAX` und eine Route; das Profil
 * fasste denselben Eintrag an, um `skillsPath` zu setzen — und damit fiel alles
 * auf Schema-Defaults zurueck (MIN, leere Route). Der Enhancer mountete, meldete
 * `NO_ROUTE` und veredelte nie etwas. Kein Fehler, keine Warnung, kein roter Test:
 * die Werte sahen wirksam aus und waren es nie.
 *
 * DREI ZUSAGEN, aufsteigend scharf:
 *
 *   1. KLASSE — keine id traegt ihre Config in BEIDEN Ebenen. Genau diese
 *      Doppelung produziert die stille Ersetzung, egal welches Paket sie trifft.
 *   2. SUBSTANZ — die id-gezielte Config im Profil ist nicht leer. Ohne diese
 *      Zusage waere Zusage 1 durch Loeschen aller Werte erfuellbar: die Falle
 *      waere weg und der Prompter trotzdem tot (fail-open).
 *   3. RUNTIME — `dsh --profile <p> --dump-config` liefert fuer den Prompter
 *      genau die Werte, die das Profil nennt. Das ist der Beweis am echten
 *      Resolver statt an einer Datei. Braucht `dsh`; ohne es wird sichtbar
 *      uebersprungen (dieselbe Regel wie beim Store- und Uebergabetest).
 *
 * Zusage 3 ist die einzige, die den Fehler AUCH am laufenden Profil gefunden
 * haette. Sie ist bewusst dabei und bewusst nicht die einzige: ein Test, der
 * ohne `dsh` schweigt, darf die anderen Zusagen nicht mitnehmen.
 */
```

## Kanon k-d56a37513cc9 {#k-d56a37513cc9}

Fundstellen: scripts/gate/tests/profile-foreign.test.mjs:2–17

Volltext des gekürzten Blocks (Stand 2026-10-17):

```
/**
 * profile-foreign.test.mjs — fremde Bundles im Profil (repo.mjs, foreignBundleTarget).
 *
 * Die Regel: ein `@shinon/*`-Name ist NICHT automatisch lokal. Entscheidend ist das
 * ZIEL der Profil-Abhaengigkeit — zeigt sie aus `packages/` heraus, ist das Bundle
 * fremd (wie die `@deepseek-ai/*`-Eintraege), und es darf hier fehlen. Drei Dinge
 * werden gezeigt:
 *
 *   1. Die Klassifikation stimmt: lokal (in packages/) → nicht fremd, ausserhalb →
 *      fremd, und ohne Ziel bleibt es fail-closed ein Fehler (Tippfehler-Schutz).
 *   2. Der echte Baum ist damit gruen: das aktive Profil meldet keinen fehlenden
 *      lokalen Bundle mehr, und jedes als fremd gemeldete Ziel liegt wirklich
 *      ausserhalb von packages/.
 *   3. Das Gate-Plugin `registry` wiederholt die Regel (sonst waere der eine Fix
 *      nur die Haelfte).
 */
```

## Kanon k-73f2a9f6ec5a {#k-73f2a9f6ec5a}

Fundstellen: scripts/gate/tests/profile-install.test.mjs:1–20

Volltext des gekürzten Blocks (Stand 2026-10-17):

```
/**
 * profile-install.test.mjs — die installierte Profil-Ebene und der Config-Vertrag.
 *
 * Warum es diesen Test gibt (gemessen 2026-10-17): ein Link unter
 * `profiles/shinon/node_modules/@shinon/traceability` zeigte aus `packages/`
 * heraus auf einen externen Prototyp; geladen wurde fremder Code, und der Boot
 * starb an `Config = {}` mit `Cannot read properties of undefined (reading
 * 'validate')`. Beide Zusagen werden hier an einem Miniatur-Baum geprüft —
 * nicht an der Installation dieses Rechners:
 *
 *   1. Jeder `@shinon/*`-Eintrag im Profil löst innerhalb von `packages/` auf;
 *      ein toter oder fremder Link ist ein benannter Befund, ein FEHLENDES
 *      `node_modules` dagegen nicht (ein frischer Klon hat keins).
 *   2. pnpm-Reste (`.pnpm`, `.modules.yaml`, `.pnpm-workspace-state-v1.json`)
 *      sind ein Befund — dieses Repo installiert mit npm.
 *   3. `Config` muss `~standard.validate` als Funktion tragen; ein blosses
 *      `Config = {}` wird abgelehnt, bevor es einen Boot erreicht.
 *
 * Läuft mit `node --test`; kein Netz, kein Modell, kein node_modules nötig.
 */
```

## Kanon k-e08e648c0d8d {#k-e08e648c0d8d}

Fundstellen: scripts/gate/tests/project-index.test.mjs:1461–1471

Volltext des gekürzten Blocks (Stand 2026-10-17):

```
/**
 * Die naive Messung zeigte drei Filter, nicht einen — und nur einer davon ist
 * Phase 8. Damit der Test nicht zwei Dinge verwechselt, sind sie getrennt:
 *
 *   ENDUNGS_LISTE      Dateien wie `.env` oder `*.pem` werden nie BETRACHTET,
 *                      weil `listFiles` nur Textendungen aufnimmt. Sie sind
 *                      deshalb auch ohne Schutz nie im Index — der Grund, warum
 *                      die Musterliste aus Plan §13 zu einem Teil redundant ist.
 *   SCHUTZ_REGELN      Dateien MIT indexierbarer Endung, die Zugangsdaten sind.
 *                      Genau hier lag der echte Fund: `.credentials.yaml`.
 */
```

## Kanon k-796e46177eae {#k-796e46177eae}

Fundstellen: scripts/gate/tests/project-index.test.mjs:1226–1236

Volltext des gekürzten Blocks (Stand 2026-10-17):

```
// ══ Indexdateien (Plan §10) ══════════════════════════════════════════════════
//
// Plan §10 nennt fuenf Angaben je Datei — path, language, size, mtime, sha256 —
// und sagt: „SHA wird nicht fuer jeden unveraenderten Start erneut unnoetig
// berechnet."
//
// Dieses Schema nennt Groesse und Hash `bytes` und `digest`: §10 nennt die
// ANGABEN, kein SQL. Die Tests pinnen deshalb die Bedeutung und nicht die
// Schreibweise — Groesse und mtime gegen das Dateisystem, der Digest als sha256
// des ROHEN Inhalts. Dass der Digest nicht dem redigierten Text folgt, ist kein
// Detail: er entscheidet, ob sich eine Datei geaendert hat.
```

## Kanon k-d5584f40faa5 {#k-d5584f40faa5}

Fundstellen: scripts/gate/tests/project-index.test.mjs:881–891

Volltext des gekürzten Blocks (Stand 2026-10-17):

```
/**
 * §11 nennt eine Luecke: gleiche Groesse, anderer Inhalt, zurueckgesetzte mtime.
 * `verify: 'stamp'` schliesst sie OHNE den Baum zu lesen. Verglichen wird der
 * Stempel des Inodes — Geraet, Inode, Groesse, mtime und die ctime. Eine
 * Inhaltsaenderung bewegt die ctime auch dann, wenn mtime und Groesse danach
 * wiederhergestellt werden; ein Ersatz der Datei bewegt den Inode.
 *
 * Die Kostenaussage steckt im Bericht selbst (`readBytes`), nicht nur in einem
 * Messskript: der stillste Lauf liest null Bytes, und der Lauf, der die Luecke
 * schliesst, liest genau die eine verdaechtige Datei.
 */
```

## Kanon k-34d55a3bd058 {#k-34d55a3bd058}

Fundstellen: scripts/gate/tests/project-index.test.mjs:2–26

Volltext des gekürzten Blocks (Stand 2026-10-17):

```
/**
 * Abnahmetest des persistenten Projektindex (@shinon/project-index) — Phase 3
 * (Plan §9 Primärdaten, §10 Indexdateien, §11 inkrementelles Indexing, §12
 * SQLite und Worker).
 *
 * Vier Ebenen, bewusst getrennt:
 *   1. Die reine Extraktion (Zeilenheuristik) gegen Fixtures UND gegen echte
 *      Dateien dieses Repos — die Grenze wird gemessen, nicht behauptet.
 *   2. Das Schema: die Primärdaten aus Plan §9, namentlich und zählbar, plus die
 *      gemessene Tatsache, dass `references` ein SQLite-Schlüsselwort ist.
 *   3. Ein echter Lauf gegen ein Fixture-Projekt: Vollauf, unveränderter zweiter
 *      Lauf, geänderter Inhalt, gelöschte Datei, zu große Datei, FTS5.
 *   4. Der Host-Pfad: der Lauf im Worker und im Host liefern denselben Index,
 *      der Mount startet den Lauf und blockiert den Start nicht, und ein
 *      scheiternder Worker wird protokolliert statt geworfen.
 *
 * Warum ein Fixture-Projekt und nicht nur dieses Repo: nur so sind „unverändert",
 * „gelöscht" und „zu groß" deterministisch herstellbar. Gegen die echten Dateien
 * dieses Repos läuft zusätzlich die Extraktion, damit die Zusage an echtem Text
 * hängt und nicht an erfundenen Beispielen.
 *
 * Läuft mit `node --test` (CI: .github/workflows/commit-guard.yml). Kein Netz,
 * kein Modell, kein node_modules im Repo (`dsh` muss im PATH liegen — wie beim
 * Profiltest, weil das echte Schemastery aus der DSH-Installation kommt).
 */
```

## Kanon k-1d7a3e2654ce {#k-1d7a3e2654ce}

Fundstellen: scripts/gate/tests/prompter-contract.test.mjs:1769–1785

Volltext des gekürzten Blocks (Stand 2026-10-17):

```
/**
 * Ein Skill, den erst die INTENT-ERWEITERUNG nennt, ist keine Nutzeranweisung.
 *
 * Der Enhancer baut in MAX aus `prompt.text` plus der Expansion aus
 * `assets/intent-rules.json` einen `expandedText`. Bis hierher ging dieser
 * `expandedText` als `explicitText` in die Skill-Auswahl — dann hätte ein
 * Skill-Name, der nur in einer Regeldatei steht, als „vom Nutzer genannt"
 * gegolten und den Prioritätsrang vor besser passenden Skills bekommen. Der
 * Nutzer hat ihn nie genannt; die Regel hat ihn genannt. `assets/stand.js`
 * übergibt seit jeher `promptText` — hier wird die zweite Stelle gepinnt.
 *
 * Der Fall ist so gebaut, dass die beiden Ausgänge SICHTBAR auseinandergehen:
 * `a-arch` trifft dreimal (quartz, runtime, architektur), `z-spezial` einmal
 * (sein eigener Name, aus der Expansion). Mit der alten Übergabe gewinnt
 * `z-spezial` als „explizit"; mit der richtigen Reihenfolge gewinnt `a-arch`
 * über die Trefferzahl.
 */
```

## Kanon k-7affc01b909e {#k-7affc01b909e}

Fundstellen: scripts/gate/tests/prompter-contract.test.mjs:451–461

Volltext des gekürzten Blocks (Stand 2026-10-17):

```
/**
 * Dieselbe Datei, zwei Schreibweisen — die Luecke, die der Profil-Lauf am
 * 2026-10-16 gezeigt hat.
 *
 * Der Pruefstand oben liefert RELATIVE Pfade (`packages/prompter/index.js`), der
 * Runtime-Index im echten Betrieb ABSOLUTE. Ein Modell nennt eine Datei aber so,
 * wie ein Mensch sie nennt — mit dem Ergebnis, dass die Referenz auf genau die
 * Datei, ueber die der Prompt ging, als "unbekannt" protokolliert und verworfen
 * wurde. Die Regel verlangt einen Treffer an der Verzeichnisgrenze, damit eine
 * andere Datei gleichen Namens nicht durchrutscht.
 */
```

## Kanon k-b94affa894de {#k-b94affa894de}

Fundstellen: scripts/gate/tests/prompter-contract.test.mjs:2–27

Volltext des gekürzten Blocks (Stand 2026-10-17):

```
/**
 * Abnahmetest des Prompt Enhancers (@shinon/prompter) — Phase 2 und 3.
 *
 * Gates:
 *   Phase 2  „Paket wird korrekt geladen und kann einen validierten
 *            Prompt-Resultatvertrag liefern."
 *   Phase 3  „MIN/MID ändern keine Anforderungen; MAX akzeptiert einen
 *            definierten Context-Input."
 *
 * Vier Ebenen, bewusst getrennt:
 *   1. Der Vertrag (Plan §7) als reine Funktionen: Parsen, Schema, Annahme-Policy.
 *   2. Der Modus-Vertrag als Daten: Fähigkeiten, erzeugte Prompts, Verbote.
 *   3. Der echte Durchlauf: das Bundle hängt über seine apply()-Schnittstelle an
 *      einem ECHTEN Cordis-Context, gefahren wird der echte Waterfall
 *      `agent/pre-step` mit dem Default-Downstream des Agent-Loops.
 *   4. Die Isolation: der Aufruf trägt keine Fähigkeit.
 *
 * Der Modell-Provider ist zwangsläufig eine Attrappe (extern, braucht
 * Zugangsdaten); alles andere — Dispatcher, Waterfall, next()-Kette,
 * Message-Identität, Schema, Kontextdatei — ist echt. Die Attrappe zählt die
 * Aufrufe und reicht die Optionen zur Prüfung heraus, damit die Isolation und
 * der Kontextblock an einem echten Aufruf belegt sind.
 *
 * Läuft mit `node --test` (CI: .github/workflows/commit-guard.yml). Kein
 * node_modules im Repo, kein Netz, kein Modell.
 */
```

## Kanon k-1f95451a5235 {#k-1f95451a5235}

Fundstellen: scripts/gate/tests/prompter-notes.test.mjs:2–13

Volltext des gekürzten Blocks (Stand 2026-10-17):

```
/**
 * Gate: die Zettel des Veredlers (Zug 4) — Daten, Drift, echte Sammlung.
 *
 * Der Zettel-Weg hat zwei Seiten, die auseinanderlaufen koennen, ohne dass ein
 * Test es merkt: die REGELDATEI (was gelesen und geprueft wird) und die
 * BESCHREIBUNG (`generated-skills/README.md`, was ein Mensch liest). Dazu kommt
 * die echte Sammlung, die das arbeitende Modell schreibt. Diese Datei prueft
 * alle drei — und die Fail-Richtung des Befehls an einer Fixture.
 *
 * Kein DSH, kein Netz, kein Modell: nur die reinen Funktionen des Kerns, die
 * Dateien des Repos und der echte Befehl `npm run notes:check`.
 */
```

## Kanon k-5feebda6c44e {#k-5feebda6c44e}

Fundstellen: scripts/gate/tests/prompter-profile-wiring.test.mjs:21–31

Volltext des gekürzten Blocks (Stand 2026-10-17):

```
/**
 * Die wirksame Config steht im PROFIL, nicht im Paket-Patch.
 *
 * Grund (gemessen 2026-10-13): eine id-gezielte Config im Profil ERSETZT die
 * Config des Bundle-Eintrags. Solange `mode: MAX` samt Route im Paket-Patch
 * stand und das Profil denselben Eintrag nur wegen `skillsPath` anfasste, war
 * beides wirkungslos — der Prompter mountete mit MIN und leerer Route, meldete
 * `NO_ROUTE` und veredelte nichts. Deshalb prueft dieser Test MAX und die
 * Abwesenheit des unbrauchbaren `contextPath` dort, wo sie greifen, UND dass
 * das Paket keine Config mehr traegt, die den Blick darauf verstellen koennte.
 */
```

## Kanon k-c2c0be6e9e5f {#k-c2c0be6e9e5f}

Fundstellen: scripts/gate/tests/runtime-resolver.test.mjs:1–18

Volltext des gekürzten Blocks (Stand 2026-10-17):

```
/**
 * runtime-resolver.test.mjs — die Node-Laufzeit wird GEPRÜFT, nicht angenommen.
 *
 * Warum es diesen Test gibt (gemessen 2026-10-17): `goodNode()` akzeptierte jede
 * laufende Hauptversion ≥ 22. Damit war Node 23 zulässig, obwohl `engines` es
 * ausschließt, und Node 22.0–22.18 ebenso, obwohl `^22.19.0` erst ab 22.19 gilt.
 * Der Fehler fiel nicht hier auf, sondern tief im Index (`node:sqlite` fehlt).
 *
 * Gepinnt wird:
 *   1. die Range kommt aus dem Root-Manifest (eine Quelle, keine zweite Liste),
 *   2. `satisfiesRange` weist 21/22.18/23 ab und lässt 22.19+/24 zu,
 *   3. ein Kandidat gilt nur mit bestandenem `node:sqlite`-Rauchtest,
 *   4. `SHINON_NODE` auf ein untaugliches Binary ⇒ fail-closed mit Grund,
 *   5. der Kind-Umgebungsblock trägt den verifizierten Node VORN im PATH —
 *      das ist die Ursache des `spawn node ENOENT` (geprüft mit leerem PATH).
 *
 * Läuft mit `node --test`; kein Netz, kein Modell, kein node_modules nötig.
 */
```

## Kanon k-07e3c3d9aab3 {#k-07e3c3d9aab3}

Fundstellen: scripts/gate/tests/scan-pruning.test.mjs:1–20

Volltext des gekürzten Blocks (Stand 2026-10-17):

```
/**
 * scan-pruning.test.mjs — kein Baumlauf betritt Fremdcode, Cache oder Symlink-Ziele.
 *
 * Warum es diesen Test gibt (Befund 2026-10-17): drei Verzeichnislisten liefen
 * auseinander (`repo.mjs`, der Index-Kern, das TypeScript-Gate), keine davon
 * prüfte Symlinks. Auf schwacher Hardware kostet ein Lauf durch `node_modules`
 * Minuten, und ein Symlink-Ziel verlässt den Baum — eine Suche, die ihm folgt,
 * liest fremde Dateien, und ein Schreibzugriff darüber landet außerhalb.
 *
 * Gepinnt wird:
 *   1. die Liste steht EINMAL (`scan.mjs`), der Kern hält dieselbe Menge,
 *   2. `walkDir` betritt `node_modules`/`.git`/`dist`/Cache nicht,
 *   3. ein Symlink auf ein Verzeichnis und einer auf eine DATEI werden nie
 *      verfolgt — auch nicht als Fundstück,
 *   4. die Kosten wachsen NICHT mit der Zahl der Fremddateien (gezählt),
 *   5. das TypeScript-Gate nimmt dieselbe Regel.
 *
 * Gemessen wird an einem Fixture-Baum im Temp — nie am echten `node_modules`.
 * Läuft mit `node --test`; kein Netz, kein Modell, kein node_modules nötig.
 */
```

## Kanon k-8e620b2f3713 {#k-8e620b2f3713}

Fundstellen: scripts/gate/tests/schemastery-pin.test.mjs:1–30

Volltext des gekürzten Blocks (Stand 2026-10-17):

```
/**
 * schemastery-pin.test.mjs — EINE schemastery-Fassung im ganzen Baum.
 *
 * Warum es diesen Test gibt (Befund 2026-10-17, Folgepaket Phase 1.4): das
 * Root-Manifest pinnte `~3.18.4`, der gepinnte Harness fordert in 156
 * Deklarationen `~3.18.5-alpha.1`. Die beiden Bereiche sind DISJUNKT — `~3.18.4`
 * akzeptiert keine Vorabfassung von 3.18.5, `~3.18.5-alpha.1` beginnt oberhalb von
 * 3.18.4 —, also durfte npm nicht hoisten: gemessen standen 1× `3.18.4` und 113×
 * `3.18.5-alpha.1` als eigene Verzeichnisse im Baum (114 Kopien, die jedes `npm ci`
 * erneut auspackt). Wer die Root-Range auf die des Harness zieht, bekommt eine
 * Fassung; das ist keine Installationskunst, sondern die Folge daraus, dass die
 * Bereiche sich dann decken.
 *
 * Gepinnt wird (fail-closed, ohne Netz, ohne `node_modules`):
 *   1. Root und JEDES Paket deklarieren dieselbe Range — in `peerDependencies`
 *      UND `devDependencies` (die Host-Shared-Regel aus `SHARED_DEPS`, hier auf
 *      die Fassung angewendet; `repo.mjs` prüft bisher nur die Anwesenheit),
 *   2. die Range ist die des gepinnten Harness (aus dem Lock, nicht aus dem
 *      installierten Verzeichnis),
 *   3. das Lock fordert diese Range überall und trägt GENAU EINEN Eintrag, auf
 *      oberster Ebene — keine verschachtelte Zweitfassung, die beim nächsten
 *      `npm ci` wieder entsteht,
 *   4. dieser Eintrag zeigt auf den Tarball seiner eigenen Fassung.
 *
 * Was hier NICHT geprüft wird: das installierte Verzeichnis. Es ist nicht Teil des
 * Baums (CI prüft ohne `node_modules`), und ein Test, der dann sichtbar
 * überspringt, verletzt die Zusage „kein Skip". Die installierte Seite ist eine
 * Messung, kein Test: `find node_modules -type d -name schemastery` nennt genau
 * einen Pfad, `npm ls @deepseek-ai/schemastery --all` sagt überall `deduped`.
 */
```

## Kanon k-702219ebf3d6 {#k-702219ebf3d6}

Fundstellen: scripts/gate/tests/scoring-block-learning.test.mjs:2–21

Volltext des gekürzten Blocks (Stand 2026-10-17):

```
/**
 * scoring-block-learning.test.mjs — das Lernen im Ledger (Phase 3) als Weg.
 *
 * Signal → Gewicht → Neustart → Retraction, nach dem Muster von
 * `scripts/gate/tests/scoring-memory.test.mjs`, aber mit gefälschter Ablage
 * statt der echten SQLite (kein DSH nötig).
 *
 * WARUM HIER und nicht in `packages/scoring/test/`: dieser Weg fährt die
 * HOST-Hälfte (`packages/scoring/index.js`) und damit `@deepseek-ai/schemastery`.
 * Die Paket-Suiten laufen in CI in einem Zweig OHNE `npm ci` — genau wie bei
 * `prompter` würde ein `../index.js`-Import diesen Zweig rot machen, ohne dass
 * eine Zusage bricht (gemessen 2026-10-17: Job 117312423811, 50/51, `ERR_MODULE_NOT_FOUND`).
 * Die reinen Kerne bleiben in `packages/scoring/test/`; die Naht läuft hier,
 * wo `npm ci` gelaufen ist.
 *
 * Gepinnt wird: die Auswahl des Veredlers (nur Ids, Sitzung) wird mit dem
 * nächsten Signal gewertet; die Gewichte überdauern den Neustart im selben
 * Snapshot wie das Protokoll; späte Kritik ersetzt statt zu stapeln; der
 * Widerruf nimmt exakt zurück; Bemerkung und Unbekanntes werten nie.
 */
```

## Kanon k-36e6754562b7 {#k-36e6754562b7}

Fundstellen: scripts/gate/tests/scoring-memory.test.mjs:2–26

Volltext des gekürzten Blocks (Stand 2026-10-17):

```
/**
 * Das dauerhafte Gedaechtnis (Zug 2): der ganze Weg ohne Browser, ohne Schluessel
 * und ohne Modell — aber MIT der echten Ablage.
 *
 * Warum als eigener Test: die Paket-Tests fahren den reinen Kern (der kennt kein
 * Dateisystem), `scoring-signals.test.mjs` faehrt beide Haelften an einem Bus
 * (dessen Host hat aber kein `ctx.get`, also keine Ablage). Hier haengen DREI
 * echte Bundles an einem Host — Events-Spine, Project-Index, Scoring — und
 * gemessen wird, was sonst nur behauptet waere:
 *
 *   Signal werten -> der Wert steht in der SQLite des Index -> Host neu
 *   aufsetzen -> der Stand ist wieder da. Der Widerruf wirkt auch nach dem
 *   Neustart, spaete Kritik trifft dieselbe frueher bewertete Antwort (derselbe
 *   Betreff, ersetzt statt gestapelt), eine beendete Sitzung wird sauber
 *   abgeschlossen, ein KAPUTTER Index ergibt einen leeren, aber laufenden Start
 *   — und die Abfrage-Faehigkeit des Index bleibt unberuehrt.
 *
 * Die zwei Nahten sind als Daten gepinnt (Dienstname, Vertragsname, Namensraum):
 * kein Paket liest das andere, also muss ein Test von aussen nachsehen.
 *
 * Laeuft mit `node --test` — die Pakete werden in ein temporaeres Verzeichnis
 * kopiert und mit dem ECHTEN Schemastery der DSH-Installation geladen (die
 * einzige peer-Dependency, die hier nicht im Paket liegt). Damit braucht dieser
 * Test `dsh` im PATH, wie `context-wiring.test.mjs` daneben.
 */
```

## Kanon k-b3aa670f5723 {#k-b3aa670f5723}

Fundstellen: scripts/gate/tests/scoring-signals.test.mjs:2–23

Volltext des gekürzten Blocks (Stand 2026-10-17):

```
/**
 * Der ganze Weg, mit den ECHTEN Bundles: Spine → shinon/event → Scoring → Scorecard.
 *
 * Warum als eigener Test: die Paket-Tests fahren den reinen Kern. Hier laufen
 * beide Pakete ueber ihre echte `apply()`-Schnittstelle an einem gemeinsamen Bus,
 * und die Ereignisse kommen in der Form, die DSH wirklich schreibt —
 * `session/event` mit `(session, event)` und `data`, wie im echten Log gemessen:
 *
 *   user/message   data.source.kind = 'user'  (Mensch)  |  'agent-instructions'
 *                                                    |  'runtime-context'  (Harness)
 *   turn/end       data.reason.kind = completed | aborted | error
 *   feedback/message-put     data.item = { messageId, rating }
 *   feedback/message-delete  data = { sessionId, messageId }
 *
 * Damit ist belegbar, was sonst nur behauptet waere: die Ohren haengen am echten
 * Kanal, Harness-Text zaehlt nicht, der Widerruf rechnet exakt zurueck, und ein
 * unbekanntes Ereignis aendert nichts. Kein Browser, kein DSH, kein Schluessel.
 *
 * Laeuft mit `node --test` — die Pakete werden in ein temporaeres Verzeichnis
 * kopiert und mit einem Schemastery-Stub versehen (die einzige peer-Dependency,
 * die hier nicht installiert ist).
 */
```

## Kanon k-d5ac5087f2be {#k-d5ac5087f2be}

Fundstellen: scripts/gate/tests/scoring.test.mjs:2–12

Volltext des gekürzten Blocks (Stand 2026-10-17):

```
/**
 * Tests des Scorings-Gates (K4).
 *
 * Zwei Ebenen wie bei Spine und Persona:
 *   1. Die reinen Prüffunktionen gegen die echten Verträge (fehlerfrei) und
 *      gegen gezielte Vertragsbrüche (jeder Bruch wird benannt).
 *   2. Die Laufzeitgrenze am echten Code (kein Schreiben/Handeln) plus
 *      Mutationsproben, die verbotene Aufrufe und fremde Pfade erkennen.
 *
 * Läuft mit `node --test` — kein node_modules, kein DSH, kein Netz.
 */
```

## Kanon k-6e2db373a8a8 {#k-6e2db373a8a8}

Fundstellen: scripts/gate/tests/source-scan.test.mjs:2–21

Volltext des gekürzten Blocks (Stand 2026-10-17):

```
/**
 * Abnahmetest des geteilten Quelltext-Scanners (scripts/lib/source-scan.mjs).
 *
 * Warum diese Datei existiert: der Scanner ist das Auge jedes Grenz-Gates
 * („dieser Code darf X nie aufrufen"). Ein Auge, das zu viel wegschneidet, macht
 * ein Gate still blind — es bleibt grün und beweist nichts. Genau das war
 * gemessen der Fall, als der Project Index seinen Worker-Quelltext als
 * Template-Literal mitbrachte: die alte Fassung entfernte erst Kommentare und
 * dann Strings, in zwei Durchläufen mit je einem eigenen Muster; ein Template,
 * das Quelltext als TEXT enthält, verschob die Paarung und verschluckte echten
 * Code (`new DatabaseSync(file)` war nicht mehr im 'codeOnly'-Ergebnis).
 *
 * Der Test pinnt deshalb die Zusagen des Scanners als Tabelle: Kommentare zählen
 * nicht, String-Inhalte zählen nicht, CODE IN `${…}` zählt, Escape und
 * Zeilenenden werden richtig gelesen, und nichts ausserhalb eines Literals
 * verschwindet.
 *
 * Läuft mit `node --test` (CI: .github/workflows/commit-guard.yml). Kein Netz,
 * kein Modell, kein node_modules.
 */
```

## Kanon k-efd6e1e2e599 {#k-efd6e1e2e599}

Fundstellen: scripts/gate/tests/source-twins.test.mjs:2–18

Volltext des gekürzten Blocks (Stand 2026-10-17):

```
/**
 * source-twins.test.mjs — die Beweise zur Zwillings-Regel (scripts/lib/repo.mjs, SOURCE_TWINS).
 *
 * Die Regel sagt: eine Regel, die in zwei Paketen liegen MUSS (weil kein Paket ein
 * anderes importieren darf und jedes Bundle eigenstaendig reist), hat EINEN Besitzer
 * und einen Spiegel — und Drift kann nicht landen. Drei Dinge werden hier gezeigt:
 *
 *   1. Der Baum ist driftfrei: Gate und Build sehen keinen Verstoss.
 *   2. Die Regel FAENGT Drift: eine abweichende Region, eine fehlende Region und ein
 *      fehlendes Literal werden je einzeln gemeldet. Ohne diesen Teil waere die Regel
 *      Prosa — sie sieht nur gut aus, wenn sie auch rot werden kann.
 *   3. An der MODULGRENZE hat sich das Verhalten nicht verschoben: `digest` erzeugt
 *      exakt die unabhaengig nachgerechneten IDs, und der Envelope-Gate-Ausgang ist
 *      der gemessene (sauber -> keine Beanstandung; verfaelschte event_id/payload_ref
 *      -> genau DIGEST_MISMATCH:*). Dieser Teil braucht node_modules (Schemastery) und
 *      wird ohne SICHTBAR uebersprungen, wie die uebrigen DSH-abhaengigen Tests.
 */
```

## Kanon k-687e05f7f81b {#k-687e05f7f81b}

Fundstellen: scripts/gate/tests/task-router.test.mjs:2–31

Volltext des gekürzten Blocks (Stand 2026-10-17):

```
/**
 * Abnahmetest des Task Routers (@shinon/task-router) — Phase 5, Plan §16.
 *
 * §16 in einem Satz: „Das LLM liefert eine Klassifikation. Die Runtime
 * entscheidet." Genau das wird hier gemessen — und die zwei Dinge, die dabei
 * schiefgehen koennen, werden getrennt geprueft:
 *
 *   1. DAS VOKABULAR. Der Router und der Enhancer fuehren dieselbe Liste. Kein
 *      Paket importiert das andere; die Uebereinstimmung wird hier von AUSSEN
 *      gepinnt. Zwei Listen, die auseinanderlaufen, waeren ein stiller Fehler:
 *      der Router wuerde jede Klasse des Enhancers als unbekannt verwerfen.
 *   2. DIE POLICY. Die Tabelle aus §16 (CHAT/LOOKUP/TRANSFORM linear,
 *      MULTI_STEP_TASK/LONG_RUNNING_GOAL Kandidat) ist eine ZAHLENTABELLE plus
 *      Schwelle, und die Entscheidung ist eine reine Funktion. Damit ist sie
 *      ohne Modell, ohne Netz und ohne Zustand nachpruefbar.
 *
 * Drei Ebenen, bewusst getrennt:
 *   a. Die Daten: Vokabular, Gewichte, Schwelle — und ihre Uebereinstimmung
 *      zwischen beiden Paketen.
 *   b. Die Entscheidung als reine Funktion: die Verhaltenstabelle aus §16, die
 *      Schwelle als POLICY (heben und senken aendert das Ergebnis, ohne Code
 *      anzufassen) und die Fail-closed-Faelle (kein Etikett -> kein Kandidat).
 *   c. Der ECHTE Durchlauf: beide Bundles haengen an EINEM echten
 *      Cordis-Context, gefahren wird der echte Waterfall `agent/pre-step`, der
 *      Enhancer emittiert seinen validierten Datensatz auf dem echten Bus, und
 *      der Router entscheidet daraus. Der Modell-Provider ist zwangslaeufig eine
 *      Attrappe (extern, braucht Zugangsdaten); alles andere ist echt.
 *
 * Kein Netz, kein Modell, kein node_modules im Repo.
 */
```

## Kanon k-708181dd6305 {#k-708181dd6305}

Fundstellen: scripts/gate/tests/token-usage-seam.test.mjs:2–62

Volltext des gekürzten Blocks (Stand 2026-10-17):

```
/**
 * token-usage-seam.test.mjs — die Naht der Token-Anzeige, am echten Bundle.
 *
 * Warum diese Datei existiert: `@shinon/token-usage` stand als „📊 --" in der
 * Sidebar, obwohl DSH die Zahl längst führt; danach zeigte es die SITZUNGS-Summe,
 * während der Auftrag die Zahl EINES Turns verlangt. Beide Zahlen sind da, sie
 * kommen aus zwei benachbarten Wegen der gelieferten Fassung:
 *
 *   TURN    — die dauerhaften Ereignisse des Turns (`turn/start` … `turn/end`) im
 *             Ereignisfenster der Sitzung: `binding.eventSource`, ein
 *             `SessionEventSource` mit den Einträgen
 *             `{ type: 'event', event }` (dauerhaft) bzw.
 *             `{ type: 'transient', event }` (client-only Live-Chunk). Genau diese
 *             Einträge faltet DSHs Chat-Bundle (die Zahl seiner Turn-Zeile); die
 *             Regel selbst ist als Region bytegleich mit dem Besitzer —
 *             verglichen mit DSHs eigener Funktion in `token-usage-vendor.test.mjs`.
 *   SITZUNG — die Sitzungs-Projektion `tokenUsage`, im Browser über
 *             `binding.session.projections.faceOf(key)` gelesen. Dieser Ausdruck
 *             IST der Weg, den `dsh-client-ui-session` als
 *             `keyedHooks: { projection: (key) => binding.session.projections.faceOf(key) }`
 *             anbietet (gemessen an der gelieferten Fassung).
 *   WELCHE  — die Vorgabe-Bindung des Renderers: `ctx.get?.('uiSession')` →
 *             `adapter.current` (eine Quelle mit `getSnapshot`), deren Sitzungs-id
 *             über `ctx.get?.('sessions')?.binding?.(id)` zur Bindung führt.
 *
 * Geprüft wird das ECHTE Bundle in einem `vm`-Kontext mit den echten Formen dieser
 * drei Wege; der beim Mounten gerenderte Wert wird gegen den Besitzer gestellt, und
 * das Abo wird über einen Sitzungswechsel gefahren (anhängen, ablösen, aufräumen).
 *
 * Was der Test NICHT beweist (ehrlich): React und die Uhren sind Attrappen, und
 * dass der echte Client die Zahl LIVE nachzieht, zeigt erst ein lebender Boot.
 * GEMESSEN (2026-10-12, `DSH_HOME=$PWD dsh --profile shinon --no-open --port 3099`,
 * echter Modell-Turn „Antworte mit genau einem Wort: drei" auf einer Sitzung mit
 * drei Turns) — Panel gegen DSHs eigene Offenlegung DESSELBEN Turns:
 *
 *   Panel (breit)  `📊 18.6K tok · 66 % aus Cache`
 *   Panel (Titel)  `Turn 3: 18.615 insgesamt · 18.612 Prompt (12.288 aus dem Cache,
 *                   6.324 neue Eingabe) · 3 Ausgabe · agnes/agnes-3.0-flash ·
 *                   Sitzung: 55.507 insgesamt · 36.864 aus dem Cache · 18.634 neue Eingabe · 9 Ausgabe`
 *   DSH Zeile      `Usage 18.6K tok`   (Turn 3)
 *   DSH Dialog     `18,615 tok · agnes/agnes-3.0-flash · Cache hit 66% ·
 *                   Uncached input 6,324 tok · Cached input 12,288 tok · Output 3 tok`
 *   DSH Fußpille   `55.5K tok·Cache hit 66%`   (= die Sitzung im Titel)
 *
 * Feld für Feld gleich; die Sitzungszeile ist als solche benannt und wird nicht für
 * die Turn-Zahl gehalten.
 *
 * ZWEITE MESSUNG, ohne Browser — die aufgezeichnete Sitzung selbst zurückgespielt
 * (`sessions/<workspace>/session-<id>/session.v4.jsonl.zstd`, Turn 3):
 *
 *   zstd -dc <log> > /tmp/session.jsonl   # dann die Ereignisse als
 *   { type: 'event', event } in `turnSliceOf` und beide Faltungen darauf anwenden
 *
 *   meine Faltung == DSH Faltung == { uncachedInputTokens: 6324, outputTokens: 3,
 *                                     totalTokens: 18615, cacheReadTokens: 12288,
 *                                     routes: [agnes/agnes-3.0-flash] }
 *
 * Die echten Ereignisse tragen genau die Felder, die gelesen werden (`turn/start`:
 * `turn`; `step/start`: `turn, step`; `assistant/message`: `turn, step, message,
 * stream, usage`; `turn/end`: `turn, reason`).
 */
```

## Kanon k-f7390febcb6c {#k-f7390febcb6c}

Fundstellen: scripts/gate/tests/token-usage-vendor.test.mjs:2–25

Volltext des gekürzten Blocks (Stand 2026-10-17):

```
/**
 * token-usage-vendor.test.mjs — die Kopie gegen DSHs EIGENE Funktionen.
 *
 * Warum diese Datei existiert: `packages/token-usage/assets/token-core.js` ist
 * eine Nachbildung zweier DSH-Regeln (Prozent-Text, Turn-Faltung). Eine Kopie,
 * die nur gegen die eigenen Erwartungen geprüft wird, ist eine Behauptung: die
 * frühere Fassung gab 136 von 45.531 Paaren als `100 %` aus, wo DSH `99.5`
 * schreibt, und ging mit ihrer eigenen Testtabelle grün durch. Dieser Test
 * vergleicht deshalb gegen den GELIEFERTEN Code selbst:
 *
 *   1. `formatCacheHitPercent` gegen die Funktion aus dem Bundle
 *      `@deepseek-ai/dsh-client-ui-chat` (Region
 *      `lib/types/client/chat/token-format.js`) — über den ganzen Wertebereich,
 *      beide Nachkommastellen. JEDE Abweichung ist rot.
 *   2. `deriveTurnUsage` gegen `deriveTurnTokenUsage` aus
 *      `@deepseek-ai/dsh-token-meter/client` — über vollständige, verstümmelte
 *      und zufällig erzeugte Ereignisfolgen (deterministisch, kein Zufall aus
 *      der Uhr).
 *   3. Die Client-Hälfte trägt DIESELBE Region (bytegleich): was hier für den
 *      Besitzer grün ist, gilt damit auch für das ausgelieferte Bundle.
 *
 * Braucht `node_modules` und überspringt ohne sie SICHTBAR (Grund im Testnamen) —
 * dieselbe Regel wie der Store- und der Übergabe-Test.
 */
```

## Kanon k-1f83cd1fe67b {#k-1f83cd1fe67b}

Fundstellen: scripts/index-scan-cost.mjs:2–31

Volltext des gekürzten Blocks (Stand 2026-10-17):

```
/**
 * index-scan-cost.mjs — was kostet der Startscan des Projektindex, und was der Mount?
 *
 * DIE FRAGE (eine, nicht drei): Plan §12 sagt, der Index-Build darf den kritischen
 * Agent-Eventloop nicht blockieren, und `packages/project-index/index.js` schiebt
 * den Lauf deshalb NACH den Mount und in einen Worker. Diese Entscheidung war im
 * Code als eine Zeile Kommentar belegt („gemessen: 817 ms") — eine Zahl ohne
 * Befehl. Dieses Skript ist der Befehl.
 *
 * WARUM DREI ZAHLEN UND NICHT EINE: „der Scan dauert X" verschmilzt drei
 * verschiedene Kosten, und aus der Summe lässt sich die Anordnung nicht mehr
 * begründen:
 *
 *   1. MOUNT    — was `apply()` den Aufrufer kostet (Fähigkeiten bereitstellen,
 *                 Lauf einplanen). Wäre sie groß, wäre „nach dem Mount" wirkungslos.
 *   2. LAUF     — was ein vollständiger Lauf im Worker kostet (kalt: alles lesen).
 *   3. WIEDERHOLUNG — was der nächste unveränderte Lauf kostet. Ist sie fast null,
 *                 ist der Preis des Starts einmalig und nicht pro Start.
 *
 * WAS HIER ECHT IST: der Kern (`runIndex`, `listFiles`, `indexPath`), die
 * Host-Hälfte (`apply`, `Config`) und der Worker (`runIndexInWorker`) — dieselben
 * Funktionen, die der Host benutzt. Was NICHT echt ist: die Uhr (drei Läufe,
 * keine Statistik), die Maschine (diese VM) und das Indexverzeichnis (temporär
 * statt `~/.shinon/indexes/<hash>`; der Ort ändert die Zeit nicht, die Menge
 * schon). Die Zahlen gehen nach docs/probes/project-index-startscan.json.
 *
 * Aufruf: `node scripts/index-scan-cost.mjs` (braucht `dsh` bzw. node_modules im
 * PATH, weil die Host-Hälfte `@deepseek-ai/schemastery` auflöst), dann
 * `node scripts/index-scan-cost.mjs --json` für die Rohform.
 */
```

## Kanon k-166493229b9e {#k-166493229b9e}

Fundstellen: scripts/install-hooks.mjs:2–21

Volltext des gekürzten Blocks (Stand 2026-10-17):

```
/**
 * install-hooks.mjs — repo-lokale Git-Hooks für die Commit-Regeln.
 *
 * Drei Hooks, drei Richtungen:
 *   pre-commit          fährt die schnelle lokale Linie (`npm test`: statisches
 *                       Gate + lokale Slices, Sekunden). Der volle Lauf gehört
 *                       in CI (`test:full`) — wer hier die Kette verlängert,
 *                       zahlt sie bei jedem Commit. Fail-closed: rot bleibt draußen.
 *   prepare-commit-msg  tauscht verbotene Footer gegen den Vannon-Trailer
 *                       (lokal ist Reparatur erlaubt — sonst wäre jeder
 *                       Agent-Commit Handarbeit).
 *   commit-msg          prüft fail-closed. Ohne Trailer kein Commit.
 *
 * Kein Husky, keine Dependency: die Hooks liegen in .githooks/ und werden über
 * `core.hooksPath` aktiviert. Das ist eine repo-lokale Einstellung — pro Klon
 * einmal `npm run hooks:install`.
 *
 * Idempotent: erneutes Ausführen überschreibt nur die eigenen Dateien.
 * Fremde Hook-Pfade werden nicht überschrieben, außer mit --force.
 */
```

## Kanon k-edd9ef983fc6 {#k-edd9ef983fc6}

Fundstellen: scripts/install-user.mjs:2–81

Volltext des gekürzten Blocks (Stand 2026-10-17):

```
/**
 * scripts/install-user.mjs — der wiederholbare Weg in ein NUTZER-Installat.
 *
 * Warum es dieses Werkzeug gibt: der dokumentierte Installationsweg war eine
 * handgetippte Kette (`git clone`, `npm ci`, `npm run profile:links`, Boot von
 * Hand). Handarbeit ist nicht wiederholbar: niemand weiß später, welcher Stand
 * läuft, ein misslungenes Update hinterlässt einen halbfertigen Baum, und ob
 * der neue Stand überhaupt startet, merkt man erst am Bildschirm. Dieses
 * Werkzeug macht aus der Kette einen Befehl und aus dem Start eine Abnahme.
 *
 * Vier Unterbefehle, ein Zustand:
 *
 *   install    Klon (falls nötig), Checkout des Ziels, `npm ci`, Profil-Links,
 *              Abnahme. Zieht standardmäßig `origin/main` (git fetch), nicht
 *              den lokalen Arbeitsbaum — ein Installat soll den veröffentlichten
 *              Stand tragen.
 *   update     derselbe Ablauf; ist der Stand schon aktuell, wird nur die
 *              Abnahme gefahren (kein sinnloses Neuinstallieren von 621 Paketen).
 *   rollback   Neuinstallation des vorherigen Standes (`--to <sha>` auch frei
 *              wählbar) aus dem Lockfile — sparsam auf der Platte, braucht Netz.
 *   status     was läuft, welcher Stand davor liegt, was die letzte Abnahme sagte.
 *   history    das dauerhafte Protokoll aller Abnahmen als Tabelle (oder --json).
 *   auto       der Timer-Lauf: neuen Stand in ein STAGING bauen, dort abnehmen
 *              und das Live-Verzeichnis erst bei grünem Urteil umschalten.
 *   units      den systemd-User-Timer schreiben/entfernen, der `auto` aufruft.
 *   selftest   der Ein-Befehl-Selbsttest (auch `npm run verify:install`): check,
 *              doctor, Boot und HTTP-Nachweis gegen einen bestehenden Stand.
 *              READ-ONLY — kein Checkout, kein `npm ci`, keine Zustandsänderung,
 *              kein Rückweg; Exit 0 nur bei vollständiger Kette (4/4), sonst 1.
 *
 * WARUM ES `auto` NEBEN `update` GIBT (gemessener Unterschied, keine Kosmetik):
 * `update` installiert IN das laufende Verzeichnis und prüft danach — für die
 * Dauer des `npm ci` steht dort ein ungeprüfter Stand, und ein rotes Urteil
 * muss danach zurückgerollt werden. `auto` baut den Kandidaten daneben, nimmt
 * IHN ab und benennt erst dann um (zwei `rename`s, kein Kopieren). Ein rotes
 * Urteil kostet damit nichts: das Live-Installat hat den Kandidaten nie
 * gesehen. Nach der Umschaltung wird der neue Ort erneut abgenommen; ist sie
 * rot, tauschen dieselben zwei Umbenennungen zurück.
 *
 * Jede Abnahme wird in `<stateDir>/logs/verify-log.jsonl` geschrieben — eine
 * Zeile je Lauf, ohne Geheimnisse (kein Token, keine Schlüssel): Stand, Trigger,
 * Boot-Dauer, Gesamtdauer, Plugins, Fehlerzahl, HTTP-Bytes, Ergebnis. Damit
 * lassen sich Boot-Zeiten und Fehlerzeilen über Versionen vergleichen, statt
 * sich auf die Erinnerung an den letzten Bildschirm zu verlassen.
 *
 * ROT HEISST NICHT STEHENBLEIBEN: besteht ein neu installierter Stand die
 * Abnahme nicht, kehrt der Befehl von selbst auf den letzten GRÜNEN Stand
 * zurück (der zuletzt abgenommene, nicht bloß der vorherige), installiert ihn
 * aus dessen Lockfile und prüft ihn erneut. Der Exit-Code bleibt 1 — das
 * Update ist gescheitert und soll nicht als Erfolg durchgehen —, aber das
 * Installat steht wieder auf einem belegten Stand. Der Rückweg wird in der
 * Historie als `auto-rollback` geführt. `--no-rollback` schaltet die
 * Selbstheilung aus, wenn jemand den roten Stand untersuchen will.
 *
 * Die Abnahme ist der Kern, nicht ein Anhängsel: `shinon --check`, `shinon
 * doctor`, dann ein echter Boot auf Loopback mit eigenem Port, Warten auf
 * `dsh web:`, HTTP-Nachweis (Token → Sitzung → Seite) und Zählung der
 * Fehlerzeilen. Exit 0 gibt es nur, wenn die ganze Kette steht. Der Server wird
 * danach über die PID aus dem Listener beendet, nicht über ein Muster.
 *
 * Grenzen, absichtlich:
 *   - Kein `git clean`: ein `--dry-run` gibt es nicht, aber auch kein Löschen
 *     unversionierter Dateien. Ein `.env` im Installat überlebt jedes Update.
 *   - Läuft eine Instanz aus dem Zielverzeichnis, verweigert der Befehl das
 *     Neuinstallieren (npm ci würde ihr node_modules unter den Füßen
 *     wegziehen) — `--force` ist die ausdrückliche Ausnahme.
 *   - Ein Rollback ist eine Neuinstallation, kein Symlinkwechsel: der Zustand
 *     (Sessions, Ledger, Index) liegt außerhalb und bleibt unberührt.
 *
 * Aufruf:
 *   node scripts/install-user.mjs install  [--prefix DIR] [--ref R] [--source URL] [--no-verify]
 *   node scripts/install-user.mjs update   [--prefix DIR] [--ref R] [--no-verify] [--force]
 *   node scripts/install-user.mjs rollback [--prefix DIR] [--to SHA] [--no-verify] [--force] [--no-rollback]
 *   node scripts/install-user.mjs status   [--prefix DIR] [--quiet]
 *   node scripts/install-user.mjs history  [--limit N] [--json]
 *   node scripts/install-user.mjs auto     [--prefix DIR] [--staging DIR] [--ref R] [--quiet]
 *   node scripts/install-user.mjs units    [--interval ZEIT] [--no-enable] [--remove]
 *   Abnahme: [--port N] [--timeout S] [--no-rollback]
 * Exit: 0 = Stand installiert und abgenommen · 1 = Abnahme rot · 2 = Bedien- oder Umgebungsfehler
 */
```

## Kanon k-f1100626103f {#k-f1100626103f}

Fundstellen: scripts/lib/ci-range.mjs:37–47

Volltext des gekürzten Blocks (Stand 2026-10-17):

```
/**
 * Die Verzweigungsbasis eines Branch-Pushes mit der Hauptlinie.
 *
 * Für einen neuen Branch ist `before` der Null-SHA und damit wertlos — aber
 * was der Push HINZUFÜGT, ist trotzdem bestimmbar: alles nach der Merge-Basis
 * mit `origin/main`. Der Klon in CI hat volle Historie (`fetch-depth: 0`),
 * also liegt sie vor. Fehlt sie (Fork ohne Hauptlinie, flacher Klon ohne
 * origin), gibt es keine Basis — dann gilt die volle Historie.
 *
 * @returns der Basis-SHA oder null.
 */
```

## Kanon k-aefcb3a7af9b {#k-aefcb3a7af9b}

Fundstellen: scripts/lib/ci-range.mjs:1–20

Volltext des gekürzten Blocks (Stand 2026-10-17):

```
/**
 * ci-range.mjs — welcher Bereich geprüft wird, entscheidet Logik, nicht YAML.
 *
 * Der Commit-Wächter muss in CI wissen, welche Commits ein Push oder ein Pull
 * Request mitbringt. Diese Entscheidung stand früher als Shell-`if` im Workflow
 * — also genau dort, wo sie niemand testen kann. Hier ist sie eine reine
 * Funktion: Umgebung rein, Bereich raus.
 *
 * Die eine Regel, die zählt: **dieser Resolver prüft nie weniger, als der Push
 * hinzufügt.** Kann der Bereich nicht bestimmt werden (Force-Push auf einen
 * verschwundenen Stand, flacher Klon ohne Hauptlinie, unbekanntes Event), ist
 * das Ergebnis die volle Historie der Spitze. Lieber zu viel geprüft als zu
 * wenig — ein Wächter, der im Zweifel weniger prüft, ist kein Wächter. Für
 * einen neuen Branch ist der Bereich dagegen bestimmbar (Spitze minus
 * Merge-Basis mit origin/main) — dort die volle Historie zu prüfen hieße, die
 * Hauptlinie bei jedem Branch erneut zu richten.
 *
 * `git` wird injiziert (Liste von Argumenten → stdout), damit die Funktion ohne
 * Repository testbar bleibt.
 */
```

## Kanon k-c2a86d55bdef {#k-c2a86d55bdef}

Fundstellen: scripts/lib/commit-text.mjs:98–112

Volltext des gekürzten Blocks (Stand 2026-10-17):

```
/**
 * Regel 3: die Wort-Regel. Eine Commit-Nachricht erzählt die Änderung — kein
 * Stichwort, keine anonyme Zahl. Drei Zusagen, alle am Inhalt (ohne Trailer
 * und ohne `#`-Kommentarzeilen, die git ohnehin abschneidet):
 *
 *   1. Umfang: mindestens WORD_MIN Wörter (Whitespace-getrennt; Zahlwörter und
 *      Code zählen mit — dokumentiert, nicht geraten).
 *   2. Daten namentlich: mindestens eine konkrete Referenz aus
 *      NAMED_DATA_PATTERNS (Pfad mit Endung, SHA, Messung `12/3`, Exit oder
 *      Run/PR/Issue). Eine Zahl ohne Herkunft ist kein Beleg.
 *   3. Bildsprache: mindestens ein Vergleichs-/Bildmarker aus
 *      BILDSPRACHE_MARKERS. Die Liste ist bewusst eng und fest: Der Wächter
 *      prüft einen Marker, kein Stilgefühl — was drinsteht, steht in
 *      `docs/COMMIT-REGELN.md`, und was nicht drinsteht, zählt nicht.
 */
```

## Kanon k-5c39318b2a8e {#k-5c39318b2a8e}

Fundstellen: scripts/lib/commit-text.mjs:1–28

Volltext des gekürzten Blocks (Stand 2026-10-17):

```
/**
 * commit-text.mjs — die eine Wahrheit für Commit-Nachrichten.
 *
 * Kein Git-Zugriff, keine I/O: der Text kommt rein, die Verstöße kommen raus.
 * Damit erzwingen lokaler Hook, Gate und CI dieselben Regeln, ohne sie zu
 * duplizieren (wie Feed-the-Floors lib/commit-text.mjs, hier für Shinon).
 *
 * Drei Regeln, alle fail-closed:
 *   1. Kein KI-Footer. Nie — und in keiner Schreibweise: `with`/`by`, eine oder
 *      mehrere Leerzeichen, Tabs, optionaler Doppelpunkt.
 *   2. Der Vannon-Trailer ist Pflicht — er ersetzt jede Maschinen-Signatur.
 *   3. Die Wort-Regel: mindestens 150 Wörter (ohne Trailer und `#`-Zeilen),
 *      alle Daten namentlich genannt (Pfad, SHA, Messung, Exit oder Run/PR)
 *      und Bildsprache Pflicht (Vergleichs-/Bildmarker aus fester Liste).
 *
 * Der Trailer ist bewusst ein Datenwert an EINER Stelle: ändert sich die
 * Schreibweise, ändert sich hier etwas, und CI, Hook, Gate und Tests ziehen mit.
 *
 * Prüfen und Tauschen benutzen dasselbe zeilenweise Prädikat
 * (`forbiddenLabelsOf`). Daraus folgt die Invariante, die die Tests pinnen:
 *
 *     swapTrailer(n) !== n  ⇒  checkMessage(n).ok === false
 *     checkMessage(n).ok    ⇒  swapTrailer(n) entfernt keine Inhaltszeile
 *
 * Heißt: was der lokale Hook entfernt, muss CI auch ohne Hook ablehnen. Keine
 * Ebene repariert heimlich, was die andere durchwinkt. Signaturen sind
 * zeilenweise — geprüft wird die Zeile, nicht der Fließtext.
 */
```

## Kanon k-17796b6922a8 {#k-17796b6922a8}

Fundstellen: scripts/lib/dsh.mjs:1–31

Volltext des gekürzten Blocks (Stand 2026-10-17):

```
/**
 * dsh.mjs - LOCALE-ERSTE Auflösung der DSH-Laufzeit.
 *
 * Eine Quelle für „wo ist dsh?" — genutzt von start.mjs und dsh-update.mjs,
 * damit niemand den Pfad hart kodiert. `open.mjs`, `stages.mjs`,
 * `desktop-launcher.mjs` und `dsh-profile-test.mjs` lösen weiter über
 * `findOnPath` (yaml.mjs) auf; ihre Migration auf `dshBinary()` ist der
 * offene Kandidat S10 (braucht einen Boot ohne Browser-Nebenwirkung als Beleg).
 * Die Gate-Tests nutzen `dshRoot` aus yaml.mjs (eigene Funktion gleichen
 * Namens, nur PATH-basiert) — dieses Modul ändert ihr Verhalten nicht.
 *
 * Auflösungsreihenfolge (lokal vor global, deterministisch):
 *   a) Repo-node_modules: `<Root>/node_modules/@deepseek-ai/dsh` — `npm install`
 *      (Root) legt den gepinnten DSH hier ab; der Starter besteht aus
 *      Repo + installiertem node_modules, kein `npm install -g` nötig.
 *   b) Vendor-Verzeichnis: `starter/vendor/@deepseek-ai/dsh` — falls ein
 *      Distributions-Schritt jemals DSH hier ablegt (Stand: keine 518 MB im
 *      Git, die Datei ist dokumentiert, nicht gevendert).
 *   c) PATH-Fallback: wie vorher — findOnPath('dsh') (yaml.mjs), damit
 *      bestehende globale Installationen weiterlaufen.
 *   d) Installations-Prefixe (nur wenn a–c fehlen): `npm install -g` legt den
 *      `dsh`-Shim unter `<prefix>/bin/` ab, ohne dass `<prefix>/bin` im PATH
 *      stehen muss. Die Prefixe werden aus den `node`-Binaries abgeleitet, die
 *      auf dem PATH liegen (`nodePrefixes()`) — keine Versionsnummer und kein
 *      Heimpfad steht hier fest; wer DSH anderswo installiert, nutzt a–c oder
 *      legt den Shim auf den PATH.
 *
 * Die Node-Laufzeit selbst kommt aus `runtime.mjs` (verifiziert: Version gegen
 * `engines.node` UND `node:sqlite`-Rauchtest). Dieses Modul entscheidet nur,
 * WO dsh liegt — nicht, welcher Node es startet.
 */
```

## Kanon k-160872a19dbc {#k-160872a19dbc}

Fundstellen: scripts/lib/paths.mjs:1–37

Volltext des gekürzten Blocks (Stand 2026-10-17):

```
/**
 * paths.mjs — EIN Pfaddienst für alle Laufzeitorte von Shinon Forge.
 *
 * Warum es diese Datei gibt: bisher setzte jedes Startskript `DSH_HOME=<Repo-Root>`,
 * und DSH legt seinen Laufzeitzustand (sessions/, storages/, logs/) genau dort
 * ab. Im Arbeitsbaum ist das bequem, für ein installiertes, schreibgeschütztes
 * Installat unmöglich — und `dist/`-Scans sowie Sitzungssuchen liefen über
 * Laufzeitdaten im Repo. Namen entstehen hier EINMAL; wer einen Ort braucht,
 * ruft hier an, statt einen Pfad zu wiederholen.
 *
 * Was DSH selbst unterstützt (gemessen an der gepinnten Fassung
 * `@deepseek-ai/dsh-home-paths`, nicht erfunden): genau EIN Knopf,
 * `DSH_HOME` — Home = `$DSH_HOME`, sonst `~/.dsh`. Weitere DSH_*-Variablen gibt
 * es dort nicht (`DSH_LAUNCH_ENVIRONMENT_KEY` und `DSH_TELEMETRY_DISABLED`
 * betreffen den Start bzw. die Telemetrie, keine Pfade). Deshalb:
 *
 *   - DSHs eigene Orte bleiben DSHs Sache: `dshHome()` nennt nur das Home.
 *   - UNSERE Artefakte (Index, Ledger, Logs) folgen der OS-Konvention (XDG auf
 *     Linux, AppData auf Windows) — DSH liest sie nicht, also darf es sie auch
 *     nicht definieren.
 *
 * Rollen (keine zwei Orte für dieselbe Sache):
 *   workspaceRoot()  der Arbeitsbaum (dieser Klon) — darf Laufzeitdaten tragen
 *   installRoot()    das Installat (/opt/shinon-forge) — zur Laufzeit READ-ONLY
 *   configDir()      Einstellungen     XDG_CONFIG_HOME  ~/.config/shinon
 *   dataDir()        dauerhafte Daten  XDG_DATA_HOME    ~/.local/share/shinon
 *   stateDir()       Zustand           XDG_STATE_HOME   ~/.local/state/shinon
 *   cacheDir()       WEGWERFBAR        XDG_CACHE_HOME   ~/.cache/shinon
 *   logDir()         Protokolle        <stateDir>/logs
 *   dshHome()        DSH-Home (Profil + DSHs eigener Zustand)
 *   indexRoot()      WEGWERFBARER Projektindex   <cacheDir>/indexes
 *   ledgerFile()     DAUERHAFTES Scoring-Protokoll <dataDir>/ledger.sqlite
 *
 * Overrides werden geprüft: nur absolute Pfade zählen, ein relativer Wert ist ein
 * Bedienfehler mit Begründung (kein stilles Auflösen gegen das Arbeitsverzeichnis
 * — das war die Falle, die `DSH_HOME=` auf das CWD zeigen ließ).
 */
```

## Kanon k-3acde3de8682 {#k-3acde3de8682}

Fundstellen: scripts/lib/plugin-idioms.mjs:266–276

Volltext des gekürzten Blocks (Stand 2026-10-17):

```
/**
 * Drift-Prüfung für eine Hälfte.
 *
 * Zwei Zusagen, beide aus dem Baum abgeleitet:
 *   - Jeder markierte Block ist zeichengenau `render(region)` mit den Parametern
 *     seiner eigenen Startmarke (die Quelle wird also nicht abgeschrieben).
 *   - Jede Signatur-Fundstelle liegt in einem SOLCHEN, gültigen Block — eine
 *     handgepflegte Kopie daneben fällt auf, auch wenn kein Block abweicht.
 *
 * @returns {string[]} Befunde (leer = ein Quelltext-Stand, keine Kopie)
 */
```

## Kanon k-784278a52113 {#k-784278a52113}

Fundstellen: scripts/lib/plugin-idioms.mjs:1–39

Volltext des gekürzten Blocks (Stand 2026-10-17):

```
/**
 * plugin-idioms.mjs — die EINE Quelle für die beiden Plugin-Bausteine, die in
 * mehreren Plugin-Hälften wortgleich vorkommen: die Registrierung beim
 * Settings-Dienst (Host-Hälften) und der Locale-Fallback (Client-Hälften).
 *
 * WARUM GENERIERT UND NICHT PER IMPORT GETEILT — gemessen, nicht angenommen:
 *   - Jedes Paket wird einzeln verpackt. `scripts/pack-test.mjs` packt genau
 *     `package.json`, `index.js`, `client.js`, `cordis.patch.yml` plus die
 *     referenzierten Ressourcen in ein Tarball und lädt es im Isolat. Eine
 *     `import`-Zeile auf `scripts/lib/…` läge außerhalb dieses Tarballs; das
 *     Paket ließe sich dort nicht mehr laden.
 *   - Eine Client-Hälfte ist ein self-contained Bundle
 *     (`window.__ModuleLoader__.load`, React kommt per `require`). Sie kann kein
 *     Repo-Modul erreichen.
 *   Beides zusammen heißt: Teilen ist in der Laufzeit nicht möglich. Also steht
 *   der Baustein einmal hier, die Pakete tragen generierte Blöcke, und ein
 *   Drift-Test hält beide Seiten gleich — keine handgepflegte Kopie.
 *
 * Marken im Ziel: `// >>> shinon:dsh-idiom <id> …` bis `// <<< shinon:dsh-idiom <id>`.
 * Zwischen den Marken steht Zeile für Zeile genau das, was `render(region)`
 * liefert (Einrückung eingeschlossen). Fehlt eine Marke, wird nichts geraten:
 * der Schreiber bricht ab, die Prüfung meldet es.
 *
 * WO DIE PARAMETER STEHEN — und warum sie nicht mehr zentral liegen:
 * Ein Baustein mit paketspezifischen Werten (Tabellenname, Schlüssel, Label)
 * trägt sie in seiner **Startmarke** (` params={…}` am Zeilenende). Vorher stand
 * diese Zuordnung in einer zentralen `REGIONS`-Liste in DIESER Datei; mit vielen
 * Plugins musste jedes neue Paket dort eingetragen werden, und ein neues Paket
 * war bis dahin rot (gemessen: 20 neue Pakete → 60 Befunde in `host-half`,
 * `client-half`, `dsh-test` und `gate:test`). Jetzt findet die Prüfung die
 * Regionen im Baum selbst: **jede Datei erklärt ihre eigene Region**, die
 * Garantie bleibt dieselbe — der Block muss zeichengenau `render(region)` sein.
 *
 * Werkzeuge:
 *   `npm run idioms`        schreibt alle Blöcke neu (scripts/sync-idioms.mjs)
 *   `npm run idioms:check`  prüft nur und bricht mit Exit 1 bei Drift ab
 *   Gate                    host-half und client-half prüfen ihre Hälfte mit
 *                           `idiomIssues(root, half)`; ebenso `dsh-test` und `build`
 */
```

## Kanon k-5859775b438d {#k-5859775b438d}

Fundstellen: scripts/lib/port.mjs:1–17

Volltext des gekürzten Blocks (Stand 2026-10-17):

```
/**
 * port.mjs — dynamische Port-Wahl für den 1-Click-Start.
 *
 * WARUM: der Wrapper hielt den Port als Konstante (`3081`). Ein zweiter Start
 * oder ein belegter Port kollidiert dann hart — DSH bricht am Bind ab, die
 * READY-Zeile kommt nie, und der Fehler sieht aus wie ein kaputtes Profil. Die
 * Nummer wird deshalb VOR dem Boot gewählt, und zwar mit einem echten
 * Bind-Versuch: „Port frei" ist eine Messung, keine Annahme.
 *
 * GRENZE, benannt statt verschwiegen: zwischen Probe und DSHs eigenem Bind
 * liegt ein Fenster (TOCTOU). Es ist klein; der Wrapper liest den tatsächlich
 * bedienten Port aus der READY-Zeile zurück und meldet eine Abweichung. Wer
 * jedes Fenster ausschließen will, gibt `--port 0` und läßt das Betriebssystem
 * binden (dsh-host-webserver: `server.listen(config.port)`).
 *
 * Reine Logik plus EIN echter Socket auf 127.0.0.1 — kein Netz nach außen.
 */
```

## Kanon k-965ff1e1d7ef {#k-965ff1e1d7ef}

Fundstellen: scripts/lib/repo.mjs:1075–1091

Volltext des gekürzten Blocks (Stand 2026-10-17):

```
/**
 * Die INSTALLIERTE Profil-Ebene prüfen — die Naht, an der eine Beschattung
 * entsteht, bevor irgendein Paketcode läuft.
 *
 * Zwei Befunde, beide gemessen bzw. benannt:
 *   1. Ein `profiles/<name>/node_modules/@shinon/<pkg>`-Eintrag, dessen
 *      `realpath` NICHT unter `<root>/packages/` liegt, beschattet das Repo-Paket.
 *      Gemessen am 2026-10-17 zeigte `@shinon/traceability` auf einen externen
 *      Prototyp; der Boot starb an `Config = {}` mit `reading 'validate'`. Ein
 *      toter Link wird ebenfalls gemeldet, nicht still übersprungen.
 *   2. pnpm-Reste (`.pnpm`, `.modules.yaml`, `.pnpm-workspace-state-v1.json`)
 *      unter `profiles/<name>/node_modules`: dieses Repo installiert mit npm; ein
 *      `dsh plugin add` (Upstream) darf sie anlegen, wir committen sie nie.
 *
 * Ein FEHLENDES `node_modules` ist kein Befund — ein frischer Klon hat keins.
 * @returns {string[]} Befunde (leer = die installierte Ebene ist sauber).
 */
```

## Kanon k-ea458e8d9a71 {#k-ea458e8d9a71}

Fundstellen: scripts/lib/repo.mjs:1045–1055

Volltext des gekürzten Blocks (Stand 2026-10-17):

```
/**
 * Der Cordis-Config-Vertrag: `Config` muss ein Schemastery-Schema sein, nicht
 * nur ein Objekt. Geprüft wird die EIGENSCHAFT, die Cordis liest —
 * `~standard.validate` als Funktion — am geladenen Modul, nicht am Quelltext.
 *
 * Genau diese Prüfung hätte den Fremd-Link vom 2026-10-17 abgefangen: dessen
 * `Config = {}` fiel erst im Boot als `reading 'validate'` auf. Ohne
 * installiertes Schemastery ist die Prüfung nicht durchführbar und meldet das
 * (fail-closed) — ein stiller Skip wäre die Lücke wieder.
 * @returns {Promise<string[]>} Befunde (leer = alle Configs sind Schemata).
 */
```

## Kanon k-093928499e48 {#k-093928499e48}

Fundstellen: scripts/lib/repo.mjs:867–886

Volltext des gekürzten Blocks (Stand 2026-10-17):

```
/**
 * Die Bündel-Auflösung des aktiven Profils — die EINE Regel für Gate und Doctor.
 *
 * Warum es diese Funktion gibt: ein `shinon`-Start löst jedes Bündel über
 * `profiles/<name>/node_modules` auf. Ein dort liegender Link, der aus `packages/`
 * herauszeigt, BESCHATTET das Repo-Paket — Node lädt dann fremden Code, ohne dass
 * irgendein Gate es merkt (gemessen 2026-10-17: `@shinon/traceability` zeigte auf
 * `../../../Projekt Type/traceability-proto`, dessen `Config = {}` den Boot mit
 * `... (reading 'validate')` abriss). Deshalb prüft diese Funktion die Naht, an der
 * die Beschattung entsteht, und nicht das Paket.
 *
 * Geprüft wird, was da ist. Ein FEHLENDER Eintrag ist kein Fehler — ein frischer
 * Klon hat kein `profiles/<name>/node_modules`, und DSH installiert ihn beim Start
 * aus dem Manifest. Ein vorhandener Eintrag dagegen muss dem Manifest folgen.
 *
 * @param {object} root - Root-Manifest (nur `name` wird gelesen: der Scope).
 * @param {{profileName?: string, profilesDir?: string, packagesDir?: string, base?: string}} [options]
 *   Übersteuerungen für Tests (Miniatur-Baum) und Doctor (fremde Wurzel).
 * @returns {string[]} Befunde; jeder nennt Quelle, aufgelöstes Ziel und Abhilfe.
 */
```

## Kanon k-7422f0982f82 {#k-7422f0982f82}

Fundstellen: scripts/lib/repo.mjs:840–851

Volltext des gekürzten Blocks (Stand 2026-10-17):

```
/**
 * Der installierte Link eines Bündels im Profil — ohne zu werfen.
 *
 * Drei Fälle, die sich unterscheiden MÜSSEN, weil sie drei Auskünfte sind:
 *   `null`     nichts installiert (ein frischer Klon hat kein node_modules)
 *   `link`     ein Symlink; `target` ist sein aufgelöstes Ziel
 *   `broken`   ein Symlink ins Leere; `target` ist sein ROHTEXT (er zeigt irgendwohin)
 *   `real`     kein Symlink, sondern eine echte Kopie — sie folgt dem Manifest nicht
 *
 * @param {string} file - Pfad des erwarteten Eintrags.
 * @returns {{kind: 'link'|'broken'|'real', target: string}|null}
 */
```

## Kanon k-ead9b6e4ff9e {#k-ead9b6e4ff9e}

Fundstellen: scripts/lib/repo.mjs:814–830

Volltext des gekürzten Blocks (Stand 2026-10-17):

```
/**
 * Ist ein Bundle fremd — lebt es bewusst ausserhalb von `packages/`?
 *
 * Entscheidend ist nicht der NAME, sondern das ZIEL: das Profil-Manifest fuehrt
 * jedes Bundle als Abhaengigkeit. Ein `link:../../packages/<dir>` zeigt in dieses
 * Repo (lokal, muss existieren); ein Ziel ausserhalb `packages/` (absoluter Pfad
 * oder aus dem Repo heraus) ist ein fremdes Bundle — wie die `@deepseek-ai/*`-
 * Eintraege, die schon immer erlaubt waren.
 *
 * Kein Eintrag, kein `link:`/`file:`-Ziel → `null`: ein unbekannter `@shinon/*`-
 * Name ohne Ziel bleibt ein Fehler (Tippfehler-Schutz bleibt fail-closed).
 *
 * @param {string} name - Bundle-Name aus `dsh.profile.bundles`.
 * @param {object|null} manifest - das Profil-Manifest.
 * @param {string} profileDir - Verzeichnis des Profils (Bezug fuer relative Ziele).
 * @returns {string|null} das aufgeloeste Ziel, wenn es fremd ist, sonst `null`.
 */
```

## Kanon k-1792d65d4401 {#k-1792d65d4401}

Fundstellen: scripts/lib/repo.mjs:793–808

Volltext des gekürzten Blocks (Stand 2026-10-17):

```
/**
 * Das aktive Profil als echtes DSH-Profil auflösen.
 *
 * DSH-Definition, abgeleitet aus @deepseek-ai/dsh-app-boot (loadProfile /
 * loadProfileDirectory): ein Profil ist das Verzeichnis <DSH_HOME>/profiles/<name>
 * mit
 *   package.json         dsh.profile.bundles - die Bundle-Patch-Layer in Reihenfolge
 *   cordis.patch.yml     die User-Ebene (top-level YAML-Array von Patch-Einträgen)
 * (eine `pnpm-workspace.yaml` legt UPSTREAMs initProfile bei Bedarf selbst an, wenn ein
 * Profil `dsh plugin add` nutzt; dieses Repo trackt keine — Schritt 3.5/A1)
 * Bundles sind Pakete mit dsh.bundle.patch; das Repo-Root ist ein gültiges
 * DSH_HOME, weil es profiles/ enthält.
 *
 * `bundles` sind alle Bundle-Namen, `entries` nur die Bundles aus diesem Repo
 * (Scope-Pakete). Fremde Bundles wie @deepseek-ai/dsh-base stehen nur in `bundles`.
 */
```

## Kanon k-5943fb806509 {#k-5943fb806509}

Fundstellen: scripts/lib/repo.mjs:460–482

Volltext des gekürzten Blocks (Stand 2026-10-17):

```
/**
 * Zwillings-Regeln: EINE Regel, die in zwei Paketen liegen MUSS.
 *
 * Warum die Dopplung ueberhaupt existiert (gemessen, nicht behauptet): Pakete
 * dieses Repos duerfen einander zur Laufzeit nicht importieren, und jedes Bundle
 * reist eigenstaendig (ein Host mit nur EINEM der beiden Pakete darf nicht am
 * fehlenden anderen scheitern; kein Paket erklaert ein `@shinon/*`-Paket als
 * Abhaengigkeit). Ein `import` ueber die Paketgrenze waere der einzige Weg zu
 * EINER Datei — und der kostet genau diese Eigenstaendigkeit.
 *
 * Der Transport ist deshalb eine Zwillingsregel mit EINEM Besitzer. Die Dopplung
 * ist damit nicht weg, aber Drift kann nicht mehr landen: Gate und Build pruefen
 * jede Regel bei jedem Lauf.
 *
 *   kind 'region'    Beide Seiten tragen den Regeltext zwischen zwei Markern,
 *                    BYTEGLEICH. Der Besitzer steht im Marker und in dieser Liste.
 *   kind 'literals'  Der Spiegel kann keinen Text teilen (ein selbststaendiges
 *                    Client-Bundle zieht kein `import`): ausgewaehlte WERTE des
 *                    Besitzers muessen als Literal im Spiegel stehen.
 *
 * Diese Liste ist die Besitzer-Erklaerung des Repos — nicht die Datei, die
 * zufaellig zuerst da war.
 */
```

## Kanon k-152c9aa2c45e {#k-152c9aa2c45e}

Fundstellen: scripts/lib/repo.mjs:393–404

Volltext des gekürzten Blocks (Stand 2026-10-17):

```
/**
 * pnpm-Reste: dieses Repo ruft pnpm nirgends auf und traegt keine pnpm-Datei
 * (PLAN.md Schritt 3.5/A1). Der Befund ist nicht theoretisch — UPSTREAMs
 * `initProfile` (`@deepseek-ai/dsh-app-boot`) legt bei `dsh plugin add` selbst eine
 * `pnpm-workspace.yaml` im Profilverzeichnis an, und ein `pnpm pack`/`pnpm install`
 * gerät leicht wieder in ein Skript.
 *
 * Deshalb hat die Invariante hier EINEN Eigentuemer mit praezisen Mustern statt eines
 * `grep pnpm` ueber Dateinamen: geprueft werden die zwei echten pnpm-Artefakte, ein
 * echter Prozess-/Script-Aufruf und die Script-Eintraege des Root-Manifests. Ein
 * Wortvorkommen in Kommentar oder Dokument ist kein Befund.
 */
```

## Kanon k-9dcaced34b1a {#k-9dcaced34b1a}

Fundstellen: scripts/lib/repo.mjs:1–28

Volltext des gekürzten Blocks (Stand 2026-10-17):

```
/**
 * repo.mjs - eine Quelle für Discovery und Validierung des Repositories.
 *
 * Genutzt von scripts/dsh-test.mjs (Gate), scripts/build.mjs (Pipeline) und
 * scripts/validate-test.mjs (Regel-Fixtures), damit alle dieselben Verträge
 * prüfen und nicht auseinanderdriften.
 *
 * Namensvertrag - alle Quellen müssen denselben Namen führen:
 *
 *   Quelle                                  Feld    erwarteter Wert
 *   packages/<dir>/package.json             name    @shinon/<dir>
 *   packages/<dir>/cordis.patch.yml         id      shinon-<dir>
 *   packages/<dir>/cordis.patch.yml         name    @shinon/<dir>
 *   packages/<dir>/client.js                id      @shinon/<dir>   (ModuleLoader)
 *   profiles/<profil>/package.json          bundles @shinon/<dir> je aktiviertem Paket
 *
 * Geprüfte Regeln:
 *   Manifest    Exports-Ziele, dsh.bundle.patch, dsh.client.platform, peer+dev,
 *               unbekannte dsh-Felder
 *   Patch       YAML-Schema der DSH-Loader-Patches: Struktur, Typen, required
 *               keys, unbekannte Keys (näher an DSH als die frühere Regex-Prüfung)
 *   Ressourcen  jede Referenz aus Manifest und Patch-Config existiert, ist eine
 *               Datei, liegt im Paket und parst in ihrem Format
 *   Komposition Profil-Manifest, doppelte insert-ids über alle Layer, azyklischer
 *               Paketgraph
 *   Idiome      generierte Plugin-Bausteine deckungsgleich mit ihrer einen Quelle
 *               (scripts/lib/plugin-idioms.mjs) — und keine Kopie daneben
 */
```

## Kanon k-9ab80e0ce68b {#k-9ab80e0ce68b}

Fundstellen: scripts/lib/runtime.mjs:1–22

Volltext des gekürzten Blocks (Stand 2026-10-17):

```
/**
 * runtime.mjs — die EINE Auflösung der Node-Laufzeit, geprüft statt angenommen.
 *
 * Warum es diese Datei gibt: `goodNode()` in dsh.mjs akzeptierte jede laufende
 * Hauptversion ≥ 22. Damit war Node 23 zulässig (obwohl `engines` es nicht
 * erlaubt) und Node 22.0–22.18 ebenso (obwohl `^22.19.0` erst ab 22.19 gilt) —
 * und `node:sqlite` fehlt in zu alten Fassungen ganz, sodass der Fehler nicht
 * hier, sondern tief im Index auftrat. Außerdem standen zwei Heimpfade fest im
 * Code (`~/.local/opt/node-v22.23.3-…`, `~/.nvm/…/v24.21.0`): auf einem anderen
 * Rechner ist das keine Auflösung, sondern eine Behauptung.
 *
 * DIE RANGE IST EINE QUELLE: `engines.node` im Root-Manifest. Dieses Modul
 * liest sie und schreibt keine zweite Liste — wer die unterstützte Fassung
 * ändert, ändert sie dort. Die exakte Fassung, mit der dieses Repo gemessen ist,
 * steht weiterhin in der Zahlendatei (`docs/ZAHLEN.md` §1) und NICHT als zweite
 * Konstante im Code.
 *
 * Ein Kandidat gilt nur, wenn er ZWEI Proben besteht:
 *   1. `--version` passt zur Range (nicht nur die Hauptversion),
 *   2. der `node:sqlite`-Rauchtest: DatabaseSync(':memory:'), `select 1`, close.
 * Netz und Modellschlüssel sind dafür nicht nötig.
 */
```

## Kanon k-1876fcced4a0 {#k-1876fcced4a0}

Fundstellen: scripts/lib/scan.mjs:1–23

Volltext des gekürzten Blocks (Stand 2026-10-17):

```
/**
 * scan.mjs — EINE Early-Pruning-Regel für jeden Baumlauf dieses Repos.
 *
 * Warum es diese Datei gibt: drei Verzeichnislisten liefen auseinander
 * (`repo.mjs` SKIP_DIRS, `index-core.js` SKIP_DIRS, `typescript.mjs`
 * IGNORED_DIRS), jede mit einer anderen Menge. Ein Lauf, der `node_modules`
 * betritt, kostet auf schwacher Hardware Minuten; ein Lauf, der einem Symlink
 * folgt, verlässt den Baum (und ein Schreibzugriff darüber landet außerhalb).
 *
 * Zwei Zusagen, die hier zusammen entstehen:
 *   1. PRUNE: bekannte Fremd-/Cache-Ordner werden VOR der Rekursion verworfen,
 *      nicht erst nach dem Lesen ihrer Einträge.
 *   2. KEINE SYMLINKS: `readdirSync(…, { withFileTypes: true })` meldet einen
 *      Symlink als `isSymbolicLink()`; er wird nie betreten — auch dann nicht,
 *      wenn er auf ein Verzeichnis zeigt. lstat-Semantik, kein realpath-Sprung.
 *
 * Die Liste hier ist die Quelle. `packages/project-index/assets/index-core.js`
 * kann sie nicht importieren (der Kern läuft im Worker und darf nur `node:*`
 * laden, und er wird in jedes Tarball gepackt) — deshalb pinnt
 * `scripts/gate/tests/scan-pruning.test.mjs` beide Listen gegeneinander, wie es
 * die Zwillingsregel für Client-Literale tut. Wer hier etwas ergänzt, sieht den
 * Drift im Gate, statt ihn zu übersehen.
 */
```

## Kanon k-23fa4b4e1e93 {#k-23fa4b4e1e93}

Fundstellen: scripts/lib/source-scan.mjs:33–48

Volltext des gekürzten Blocks (Stand 2026-10-17):

```
/**
 * Den Quelltext in Abschnitte zerlegen: 'code', 'comment', 'string'.
 *
 * Zusagen, die der Zustandsautomat gibt:
 *   - Kommentar-Start (`//`, `/*`) zaehlt nur im Code, nicht im String.
 *   - Ein String endet am passenden Anfuehrungszeichen oder (einfache Quotes)
 *     am Zeilenende; ein Backslash schluckt das naechste Zeichen.
 *   - In einem Template-Block ist `${…}` CODE (verschachtelt, mit Zaehler).
 *   - Ein Regex-Literal wird als CODE gelesen, nicht als String: ein Muster kann
 *     Anfuehrungszeichen und Backticks enthalten (`/^\s*(```|~~~)/`), und ohne
 *     Regex-Zustand kippt der String-Zustand daran. Gemessen war genau das ein
 *     blinder Fleck: die Doc-Kommentare nach einem solchen Muster galten dann als
 *     String und der Code dahinter verschwand. Regex-Inhalt bleibt sichtbar —
 *     lieber ein sichtbarer Fehlalarm als eine stille Luecke.
 *   - Ein unfertiges Literal am Ende wird als solches gemeldet, nicht als Code.
 */
```

## Kanon k-4163d64fcf87 {#k-4163d64fcf87}

Fundstellen: scripts/lib/source-scan.mjs:1–31

Volltext des gekürzten Blocks (Stand 2026-10-17):

```
/**
 * source-scan.mjs — Quelltext-Scan für die Gate-Plugins.
 *
 * Warum als eigene Datei: „dieser Code darf X nie aufrufen" ist ein Vertrag,
 * und ein Vertrag gehört an eine Stelle.
 *
 * Zwei Genauigkeiten, die den Unterschied machen:
 *   - Kommentare zählen nicht. Ein Modul darf erklären, was es NICHT tut,
 *     ohne dass das Gate rot wird (deshalb wird der Kommentar entfernt, nicht
 *     der Kommentar verboten).
 *   - Strings zählen nur dort, wo sie Code sein können. Die Persona trägt
 *     Prompt-Texte, in denen „Math.random()" als Warnung für das Modell steht —
 *     das ist Dateninhalt, kein Aufruf. `Math.random()` im Code daneben bleibt
 *     ein Befund.
 * Modul-Importe (`require('child_process')`) werden weiterhin erkannt: für
 * solche Token liest der Scan die Strings mit (`mode: 'module'`).
 *
 * EIN Durchlauf statt zwei Schritten, und zwar aus gemessenem Grund: die fruehere
 * Fassung entfernte erst Kommentare und dann Strings, jeder Schritt mit einem
 * eigenen Muster. Sobald ein Template-Literal Quelltext als TEXT enthaelt (der
 * Worker-Quelltext des Project Index) oder ein Kommentar eine ungerade Zahl von
 * Anfuehrungszeichen mitbringt, verschiebt sich die Paarung: der String-Entferner
 * verschluckt dann echten Code, und ein Gate kann blind werden, ohne rot zu sein.
 * Gemessen war das genau so: `new DatabaseSync(file)` verschwand aus dem
 * 'codeOnly'-Ergebnis, waehrend die Kontrolle in tests/project-index.test.mjs
 * weiterhin gruen war. Deshalb erkennt `tokenize` Kommentar, String und Template
 * in einem Zug — und `${…}` in einem Template bleibt CODE, weil dort Code steht.
 *
 * Bewusst naiv gehalten: kein Parser, kein node_modules. Was der Scanner zusagt,
 * ist unten als Tabelle geprueft (scripts/gate/tests/source-scan.test.mjs).
 */
```

## Kanon k-8a635cc59a4d {#k-8a635cc59a4d}

Fundstellen: scripts/lib/yaml.mjs:50–62

Volltext des gekürzten Blocks (Stand 2026-10-17):

```
/**
 * Das `@deepseek-ai`-Verzeichnis für BAUM-SCANS — nicht dasselbe wie dshRoot().
 *
 * dshRoot() ist das dsh-Paket; sein eigenes `node_modules/@deepseek-ai` ist nur
 * der verschachtelte Teilbaum dieses Pakets (lokal 18 Pakete — ohne den
 * Agent-Loop, ohne den Großteil des Harness). Ein Scan „über den ganzen Harness"
 * würde damit den falschen Baum zählen: die Aussage wäre über 18 Pakete statt
 * über 250+. Der vollständige Satz liegt bei einer lokalen Installation NEBEN
 * dem Paket, bei einer globalen kann er auch darin liegen.
 *
 * Deshalb werden die Kandidaten (im Paket und in den Ebenen darüber) verglichen
 * und der vollständigste genommen — layoutunabhängig, deterministisch.
 */
```

## Kanon k-c669b42ee6d9 {#k-c669b42ee6d9}

Fundstellen: scripts/notes-check.mjs:2–21

Volltext des gekürzten Blocks (Stand 2026-10-17):

```
/**
 * notes-check.mjs — die Prüfung der Zettel (Zug 4).
 *
 * Liest `generated-skills/` (der Pfad steht in den Regeln, nicht hier) und
 * meldet die drei Befunde des Veredlers: zu spitz, zu breit, doppelt. Geprüft
 * wird mit DENSELBEN reinen Funktionen, die der Veredler benutzt
 * (`packages/prompter/assets/note-core.js`) — ein zweiter Prüfer wäre ein
 * zweiter Maßstab, und dann gäbe es keinen.
 *
 * WARUM EIN BEFEHL UND KEIN LISTENER: DSH kennt im Spine kein
 * Sitzungsende-Ereignis. Eine Prüfung, die an einem erfundenen Ereignis hängt,
 * wäre eine Behauptung; ein Befehl mit Exit-Code ist nachprüfbar. Dieselbe
 * benannte Lücke steht in `generated-skills/README.md`.
 *
 * Fail-closed in beide Richtungen: ein Befund ist Exit 1, und eine Datei, die
 * gar kein Zettel IST (fremder Vertrag, leeres Feld, unbekannte Fassung), ist
 * ebenfalls Exit 1 — sie würde sonst stillschweigend nie laden.
 *
 * Exit: 0 = kein Befund, 1 = Befund oder ungelesene Datei, 2 = Bedienfehler.
 */
```

## Kanon k-56fa110709cb {#k-56fa110709cb}

Fundstellen: scripts/open.mjs:180–190

Volltext des gekürzten Blocks (Stand 2026-10-17):

```
/**
 * Sauberes Beenden: Ctrl-C oder Kind-Exit beendet beides, kein Orphan.
 *
 * Die Abwartefrist liegt auf dem Timer, nicht in einer Warteschleife. Eine
 * synchrone Warteschleife blockiert den Event-Loop — und damit genau den
 * 'exit'-Handler, der `child.exitCode` setzt: sie kann den Exit NIE beobachten
 * und läuft immer die volle Frist ab. Gemessen (Kind endet nach 300ms):
 * Warteschleife 3020ms Wanduhr und volle CPU-Last; mit der Frist auf dem Timer
 * endet der Wrapper nach 315ms, sobald das Kind wirklich weg ist. SIGKILL
 * greift nur, wenn es nicht wegkommt — das ist die harte Frist, wie vorher.
 */
```

## Kanon k-a4a8f65c357f {#k-a4a8f65c357f}

Fundstellen: scripts/open.mjs:2–23

Volltext des gekürzten Blocks (Stand 2026-10-17):

```
/**
 * open.mjs — 1-Click-Start (Stufe 1 der Starter-Roadmap).
 *
 * Führt DSH mit dem aktiven Profil hoch (--no-open, keine Browser-Autoöffnung)
 * und öffnet die tokenisierte Bereitschafts-URL im System-Standardbrowser.
 * Das ist der User-Flow, den die spätere Tauri-Shell 1:1 übernimmt:
 * dieselbe URL, dasselbe Profil — nur andere Fassade statt Browser-Tab.
 *
 * Warum --no-open + eigener Browser-Start: DSHs Autoöffnung kennt die
 * trusted-host-Zusagen nicht, und wir brauchen den stabilen, tokenisierten
 * Link aus der READY-Zeile `dsh web: http://…/?token=…` — den öffnen wir selbst.
 *
 * Port: NICHT fest. Früher stand hier die Konstante 3081; war sie belegt,
 * brach der Boot ab, bevor die READY-Zeile kam (Fehlerbild: „Profil kaputt“).
 * Jetzt wählt `lib/port.mjs` den ersten freien Port ab 3081 mit einem echten
 * Bind-Versuch, `--port <n>` bleibt der ausdrückliche Wunsch (`--port 0`: das
 * Betriebssystem bindet). Der bediente Port wird aus der READY-Zeile
 * zurückgelesen und eine Abweichung gemeldet — die Probe ist kein Beweis.
 *
 * Aufruf: `npm run open`  (Profil über das dev-Skript, eine Quelle)
 * Exit: Ctrl-C stoppt DSH und den Wrapper sauber (Kind-Process wird beendet).
 */
```

## Kanon k-402f313d670a {#k-402f313d670a}

Fundstellen: scripts/pack-test.mjs:2–25

Volltext des gekürzten Blocks (Stand 2026-10-17):

```
/**
 * pack-test.mjs - Distributionstest (Exit Gate für Block 1)
 *
 * Je Paket: `npm pack` -> Tarball entpacken -> isoliert installieren -> laden.
 * Rot, solange ein Paket seine host-shared Abhängigkeit nicht deklariert
 * (siehe SHARED_DEPS in scripts/lib/repo.mjs), grün, sobald alle Tarballs
 * im Isolat laden. Eingebunden in `npm test`.
 *
 * Eine Quelle: **npm**. Seit PLAN.md Schritt 3.5 ruft dieser Test kein pnpm
 * mehr auf (A1); der Tarball entsteht über `npm pack`, das Isolat über
 * `npm install`. Beide Wege sind gemessen gleichwertig: das Tarball heißt
 * `shinon-<dir>-<version>.tgz` und entpackt nach `package/`.
 *
 * Warum die Pakete PARALLEL laufen (und zwar in einem begrenzten Pool): der
 * Preis dieses Tests wächst linear mit der Zahl der Plugins — je Paket kostet
 * ein eigener `npm pack` plus ein netzgebundenes, isoliertes `npm install`
 * (gemessen 2026-10-11: 19 Pakete ≈ 22 s, also ≈ 1,2 s je Paket). Mit einem
 * `@shinon`-Plugin mehr wird der Lauf sonst zum Flaschenhals des gesamten
 * `npm test`. Jedes Paket arbeitet in einem eigenen Unterverzeichnis von WORK,
 * die Reihenfolge der Ausgabe hängt trotzdem nicht vom Pool ab: die Ergebnisse
 * werden gesammelt und danach in `repo.discover()`-Reihenfolge geschrieben.
 *
 * Option: --keep  Zwischenstände unter /tmp behalten (Debugging).
 */
```

## Kanon k-de67cef1e90b {#k-de67cef1e90b}

Fundstellen: scripts/panel-check.mjs:2–26

Volltext des gekürzten Blocks (Stand 2026-10-17):

```
/**
 * panel-check.mjs — beweist, dass der Marker-Spiegel wirklich ankommt.
 *
 * Drei Stufen, jede mit echtem Beleg statt Behauptung:
 *
 *   1. Auslieferung: gegen die laufende DSH-Web-UI (Token-Flow wie im Browser)
 *      wird die Seite geholt und geprüft, dass `@shinon/markers/client.js` in
 *      der Modul-Preload-Liste steht.
 *   2. Code im Bundle: das ausgelieferte Client-Bundle muss den Panel-Code
 *      enthalten (Panel-ID, Side-Panel-Slot, Panel-Klasse).
 *   3. Rendering: das gebaute Artefakt `dist/packages/markers/client.js` wird in
 *      einer DOM-Umgebung ausgeführt — Plugin laden, Slots einsammeln, Panel
 *      rendern, `m`-Modus schalten, Element anklicken und die Nutzlast prüfen.
 *      Dafür werden `jsdom`, `react` und `react-dom` gebraucht; ihr
 *      node_modules-Verzeichnis kommt über `--jsdom-root` (das Repo bleibt
 *      abhängigkeitsfrei). Ohne `--jsdom-root` laufen nur Stufe 1 und 2.
 *
 * Aufruf (DSH-Web-UI muss laufen, z. B. über `npm run dev` oder die Preview):
 *
 *   node scripts/panel-check.mjs --url http://127.0.0.1:5173 --token <token>
 *   node scripts/panel-check.mjs --url … --token … --jsdom-root /tmp/panelcheck/node_modules
 *
 * Exit 0 = alle ausgeführten Stufen grün, 1 = Befund, 2 = Bedienfehler.
 * Der Token steht in der Startzeile der UI: `dsh web: http://…/?token=…`.
 */
```

## Kanon k-c21108faa677 {#k-c21108faa677}

Fundstellen: scripts/profile-links.mjs:2–37

Volltext des gekürzten Blocks (Stand 2026-10-17):

```
/**
 * scripts/profile-links.mjs — die Bündel-Links der Profile aus ihren Manifesten setzen.
 *
 * Warum dieses Werkzeug existiert: ein Profil-Start löst jedes Bündel zuerst über
 * `profiles/<name>/node_modules/` auf. Wird dort ein Link auf ein Ziel AUSSERHALB
 * dieses Repos gesetzt — gemessen 2026-10-17: `@shinon/traceability` →
 * `../../../Projekt Type/traceability-proto` —, dann beschattet fremder Code das
 * Repo-Paket, ohne dass ein Gate es merkt: `packages/traceability` wird nie
 * geladen, der Prototyp exportiert `Config = {}`, und Cordis stirbt beim Mounten
 * mit `Cannot read properties of undefined (reading 'validate')`.
 *
 * Die einzige Wahrheit ist das Profil-Manifest: `dependencies["@shinon/<dir>"]`
 * deklariert `link:../../packages/<dir>`. Dieses Werkzeug liest genau diese
 * Zusagen und setzt die Links danach neu. Nichts anderes wird angefasst:
 *
 *   - Ein Ziel ausserhalb `packages/` wird VERWEIGERT (Exit 2, keine Änderung).
 *     Ein Werkzeug, das einen Fremdpfad durchreicht, wäre die Ursache statt der
 *     Reparatur.
 *   - Ein Ziel, das kein Paket mit DIESEM Namen ist, wird verweigert.
 *   - Ein echter Ordner im Weg wird NICHT gelöscht, sondern gemeldet: er ist
 *     fremde Handarbeit, und die zu überschreiben wäre Datenverlust.
 *   - Ein bereits richtiger Link bleibt unangetastet (idempotent).
 *
 * Prüfen statt schreiben: `--check` schreibt nichts und unterscheidet zwei Grade,
 * dieselben, die das Gate-Plugin `bundle-resolution` einnimmt. Das geplante
 * Laufzeit-CLI `shinon doctor` soll dieselbe Funktion nutzen, ist aber noch nicht
 * implementiert (Release-Slice S4):
 *
 *   💥 VERSTOSS  ein Link ist da, führt aber woandershin (oder ins Leere) → Exit 1
 *   –  HINWEIS  der Link fehlt noch (Normalzustand vor der Installation) → Exit 0
 *
 * Aufruf:  node scripts/profile-links.mjs [--check] [--profile <name>] [--quiet]
 * Exit:    0 = gesetzt bzw. geprüft und deckungsgleich · 1 = (--check) Abweichung
 *          · 2 = verweigert (Ziel ausserhalb packages/, fremder Name, echter
 *          Ordner im Weg) — in diesem Fall wurde NICHTS geschrieben.
 */
```

## Kanon k-db3c1f71444c {#k-db3c1f71444c}

Fundstellen: scripts/run-with-node.mjs:2–26

Volltext des gekürzten Blocks (Stand 2026-10-17):

```
/**
 * run-with-node.mjs — der selbstheilende Test-/Gate-Wrapper.
 *
 * WARUM: Agenten-Subshells starten regelmäßig mit einem nackten `/usr/bin/node`
 * (Node 18, ohne `node:sqlite`) und ohne `./node_modules/.bin` im PATH. Dann
 * scheitert `node --test` tief im Project Index mit
 * `ERR_UNKNOWN_BUILTIN_MODULE: node:sqlite`, und `gate:test` findet kein `dsh`.
 * Beides ist kein Code-Fehler, sondern eine Umgebungsfalle — und eine Falle,
 * die man nicht bei jedem Lauf neu erklären sollte.
 *
 * WAS: setzt `$ROOT/node_modules/.bin` VOR den PATH und re-exect sich selbst mit
 * einer VERIFIZIERTEN Node-Laufzeit (`scripts/lib/runtime.mjs`: Range aus
 * `engines.node`, `node:sqlite`-Rauchtest), wenn die laufende Fassung zu alt ist.
 * Ist gar keine taugliche Laufzeit da, endet der Lauf fail-closed mit den
 * geprüften Pfaden und Gründen — kein stiller Rückfall auf das kaputte Node.
 *
 * Aufruf:
 *   node scripts/run-with-node.mjs node --test packages/x/test/*.test.mjs
 *   node scripts/run-with-node.mjs scripts/shinon-test.mjs
 *   node scripts/run-with-node.mjs --runtime        # nur die Auflösung zeigen
 *
 * Der Wrapper führt KEINE Shell aus: Argumente werden als Vektor übergeben, und
 * `*`-Muster löst `fs.globSync` selbst auf (erst ab der verifizierten Fassung,
 * deshalb dynamisch geladen — unter Node 18 existiert die Funktion nicht).
 */
```

## Kanon k-0f65fa71eb2c {#k-0f65fa71eb2c}

Fundstellen: scripts/scale-check.mjs:2–35

Volltext des gekürzten Blocks (Stand 2026-10-17):

```
/**
 * scale-check.mjs — der Skalierungsnachweis: „das Gate bleibt grün, wenn Plugins
 * dazukommen" wird nicht behauptet, sondern gemessen.
 *
 * Warum dieses Skript existiert: die Gate-Kette (statisches Gate, Gate-Engine,
 * Gate-Tests, Distributionstest, Build) hatte drei Stellen, an denen ein NEUES
 * Plugin Pflege in einer ZENTRALEN Handliste verlangte — `host-half`/`client-half`
 * (Idiom-Regionen), `dead-package` (`KNOWN_INACTIVE`), `doctor`
 * (`EXPECTED_VERSIONS`), dazu der lineare Distributionstest. Gemessen am
 * 2026-10-11 mit 20 zusätzlichen Paketen (39 statt 19): 60 Befunde in
 * `host-half`/`client-half`, 5 in `dead-package`, plus ein Gate-Test. Jede dieser
 * Stellen ist seither beseitigt; dieses Skript ist der Lauf, der das belegt — und
 * der es beim nächsten Umbau wieder belegt.
 *
 * Wie gemessen wird: eine KOPIE des Baums in ein temporäres Verzeichnis, darin N
 * zusätzliche Plugin-Pakete — genau so, wie es ein Plugin-Autor täte. Ein Klon
 * bekommt einen eigenen Namen (Ordnername, Manifest, Patch, ModuleLoader-id), eigene
 * Idiom-Werte in seiner Startmarke und erklärt sich im eigenen Manifest als bewusst
 * zurückgestellt (`"dsh": { "inactive": true }`). Danach laufen die Stufen der
 * Kette über diese Kopie; der echte Baum wird dabei nie angefasst.
 *
 * Was der Lauf misst: dass ein neues Paket KEINEN Eingriff außerhalb seines eigenen
 * Ordners braucht, um die Ketten grün zu halten (`npm run idioms` schreibt den
 * generierten Block aus der Erklärung im Paket). Was er NICHT misst: ein neues
 * Paket, das ins PROFIL soll — das ist bewusst Handarbeit (Patch + Profil-Manifest,
 * siehe docs/ARCHITECTURE.md §2) und braucht ein Install.
 *
 * Aufruf:
 *   node scripts/scale-check.mjs [--plugins N] [--keep] [--json <pfad>]
 *
 * `--keep` behält das temporäre Verzeichnis (Debugging); `--json` schreibt die
 * Messung als JSON weg. Teil von `npm test` ist dieser Lauf NICHT: er kopiert den
 * Baum, installiert Tarballs und dauert rund anderthalb Minuten.
 */
```

## Kanon k-049acec77c27 {#k-049acec77c27}

Fundstellen: scripts/shinon-profile-test.mjs:2–15

Volltext des gekürzten Blocks (Stand 2026-10-17):

```
/**
 * shinon-profile-test.mjs - Exit Gate fuer das bootfaehige Profil (Block 2)
 *
 * Laedt das aktive Profil genau so, wie DSH es laedt:
 *
 *   DSH_HOME=<Repo-Root> dsh --profile <name> --dump-config
 *
 * Das Repo-Root ist ein gueltiges DSH_HOME, weil es profiles/ enthaelt; damit
 * ist der Lauf reproduzierbar, ohne etwas nach ~/.dsh zu installieren.
 *
 * Rot, solange profiles/<name> kein DSH-Profil ist (kein package.json ->
 * "profile does not exist"), gruen, sobald DSH das Profil aufloest und jeden
 * Bundle-Layer listet. Eingebunden in `npm test`.
 */
```

## Kanon k-6cd6adc0ab9c {#k-6cd6adc0ab9c}

Fundstellen: scripts/shinon-test.mjs:2–12

Volltext des gekürzten Blocks (Stand 2026-10-17):

```
/**
 * shinon-test.mjs - das Shinon Forge Gate
 *
 * Ein Gate statt drei (löst dsh-compat.mjs und tests/basic.test.mjs ab).
 * Prüft dynamisch jedes Paket unter packages/* gegen die Verträge aus
 * scripts/lib/repo.mjs - derselben Quelle, die auch scripts/build.mjs nutzt,
 * damit Gate und Build nicht auseinanderdriften.
 *
 * Pro Paket: package.json + Ressourcen, Namensvertrag, index.js, client.js,
 * cordis.patch.yml (YAML-Schema). Dazu: Legacy-Guard und Profil-Komposition.
 */
```

## Kanon k-027436516646 {#k-027436516646}

Fundstellen: scripts/spike-resolved-profile.mjs:58–68

Volltext des gekürzten Blocks (Stand 2026-10-17):

```
/**
 * Das Profil — HIER, im Code, nicht in `profiles/<name>/package.json`.
 *
 * Drei Bündel, gewählt nach einer harten Eigenschaft: ihre Host-Hälften
 * brauchen keinen Dienst, rufen kein Modell, starten keinen Server und
 * schreiben nichts. `better-errors` und `token-usage` registrieren nur und
 * loggen; `events` lädt seinen Vertrag aus `assets/` und emittiert — hier
 * niemandes Ereignis. Wer diese Liste erweitert, prüft dieselben vier
 * Eigenschaften neu: der Spike darf keinen fremden Boot und keine Sitzung
 * anfassen.
 */
```

## Kanon k-315887a16444 {#k-315887a16444}

Fundstellen: scripts/spike-resolved-profile.mjs:2–46

Volltext des gekürzten Blocks (Stand 2026-10-17):

```
/**
 * spike-resolved-profile.mjs — Spike zu PLAN.md Schritt 3.3 (D3).
 *
 * Frage: bootet das Produkt mit einem Profil, das **nicht** unter
 * `$DSH_HOME/profiles/<name>` liegt? Die Antwort ist die Vorbedingung dafür,
 * dass `profiles/` überhaupt aus dem Repo verschwinden kann (Schritt 3.6).
 *
 * Der Weg des Spikes ist ausdrücklich nicht der benannte Profilweg:
 *
 *   benannt   `runProfile({ profile: '<name>' })`  → `loadProfile(name, …, home)`
 *             → `resolveProfileDir(name, $DSH_HOME)` = `$DSH_HOME/profiles/<name>`
 *   Spike     `loadProfileDirectory(dir, installAnchor)` — Upstreams eigener
 *             Weg für „application-owned profiles whose package project and
 *             lifecycle belong to that application“ — plus
 *             `runProfile({ resolvedProfile: { profile, installAnchor } })`.
 *
 * Was der Spike beweist (jede Zusage ist am Ende eine Behauptung, die beim
 * kleinsten Zweifel rot wird — fail-closed, Exit 2):
 *
 *   1. Die Bündel-Liste kommt aus CODE (BUNDLES unten), nicht aus einer Datei
 *      unter `profiles/`. Der Spike schreibt das Profil-Verzeichnis selbst.
 *   2. `profile.dir` liegt NICHT unter `<Repo>/profiles/` und nicht unter
 *      `$DSH_HOME/profiles/` — beides wird vorher geprüft, nicht gehofft.
 *   3. Alle Bündel lösen auf (`layers`), keines wird übersprungen
 *      (`skippedBundles` leer).
 *   4. Die Bündel MOUNTEN wirklich: jede Client-freie Host-Hälfte schreibt beim
 *      `apply()` genau eine Zeile. Der Spike fängt sie ab, statt sie nur
 *      durchlaufen zu lassen — `[shinon-events]` liest dabei zusätzlich seine
 *      FASSUNG aus dem Profil-Patch und sein `assets/`-Dokument aus dem Paket,
 *      also die ganze Kette Config → Plugin → Asset.
 *   5. Der Lauf bleibt schlüsselfrei: kein Wert einer Umgebungsvariable, deren
 *      NAME nach Geheimnis klingt (KEY/TOKEN/SECRET/PASSWORD), darf in der
 *      Ausgabe vorkommen. Der Snapshot ist leer — es gibt nichts zu leaken.
 *   6. Der Abbau läuft (`shutdown`) und der Baum ist vorher aktiv
 *      (`ctx.fiber.state === 2`, `loader` vorhanden).
 *
 * Was der Spike NICHT beweist: keinen Modellaufruf, keinen Browser, kein
 * `dsh --profile` über die CLI, und keine der drei UI-Hälften der Bündel (die
 * laufen im Client). Er beantwortet genau eine Frage: trägt der Bootpfad ein
 * Profil aus dem eigenen Verzeichnis?
 *
 * Aufruf:  node scripts/spike-resolved-profile.mjs [--dir <pfad>]
 * Exit:    0 = belegt · 2 = widerlegt (eine Zusage ist rot) · 3 = Aufbau
 *          gescheitert (Bündel nicht auflösbar, Node zu alt, kein dsh)
 */
```

## Kanon k-026527b87839 {#k-026527b87839}

Fundstellen: scripts/stages.mjs:2–12

Volltext des gekürzten Blocks (Stand 2026-10-17):

```
/**
 * stages.mjs - Teststufen G1..G8, einzeln und aggregiert.
 *
 *   node scripts/stages.mjs            # alle Stufen
 *   node scripts/stages.mjs G4 G5      # nur diese Stufen
 *   node scripts/stages.mjs --strict   # auch G6..G8 müssen grün sein
 *
 * Jede Stufe hat ein echtes Erfolgskriterium und meldet grün oder rot mit Grund.
 * G4 fährt den Stack wirklich hoch (DSH_HOME=<Repo> dsh --profile shinon), alles
 * andere prüft gegen diese laufende Instanz oder gegen die früheren Stufen.
 */
```

## Kanon k-b511ea13ded6 {#k-b511ea13ded6}

Fundstellen: scripts/start.mjs:2–18

Volltext des gekürzten Blocks (Stand 2026-10-17):

```
/**
 * start.mjs — Kompatibilitäts-Einstieg, keine zweite Umsetzung.
 *
 * Die Startlogik (Node-Heilung, EINE dsh-Auflösung über `dshBinary()`,
 * `--check` mit Herkunftsangabe, Start mit `--profile <aktiv>`) steht seit
 * Schritt 3.4 in [bin/shinon.mjs](../bin/shinon.mjs) — dort, wo auch das
 * `bin`-Feld des Root-Manifests hinzeigt. Diese Datei bleibt, weil vorhandene
 * Aufrufe und Dokumente den Pfad `scripts/start.mjs` nennen; sie importiert
 * genau dieselbe Umsetzung, statt sie zu kopieren (zwei Startpfade wären zwei
 * Wahrheiten).
 *
 * Aufruf: `node scripts/start.mjs [--check] [dsh-Argumente …]` — identisch zu
 * `npm start [-- …]` und `shinon [--check] …`.
 *
 * Ob dieser Pfad weiterhin existieren muss, entscheidet Schritt 3.7
 * (Build- und Gate-Ballast); bis dahin ist er die kompatible Adresse.
 */
```

## Kanon k-ca4c5f7415a7 {#k-ca4c5f7415a7}

Fundstellen: scripts/store-cost.mjs:198–215

Volltext des gekürzten Blocks (Stand 2026-10-17):

```
/**
 * `openIndex` in seine Schritte zerlegt — NACHTGEBAUT, nicht importiert.
 *
 * Der Grund für die Nachbildung: der echte Aufruf ist eine Blackbox, und die
 * Frage „was kostet das Schreiben" braucht die Zeile, die die Zeit nimmt. Die
 * Nachbildung ist kontrolliert: sie ruft dieselben Anweisungen in derselben
 * Reihenfolge (`SCHEMA` und die Fassungskonstanten sind importiert, nicht
 * abgeschrieben), sie läuft auf einer EIGENEN Datei, und der Bericht stellt
 * ihre Summe NEBEN den echten `openIndex`. Weichen beide ab, ist diese
 * Zerlegung veraltet — dann gilt der echte Wert und die Zerlegung ist zu
 * reparieren. Sie ist ein Messmittel, kein zweiter Codepfad im Produkt.
 *
 * GEMESSEN und deshalb korrigiert: ein erster Nachbau schrieb die Metawerte als
 * `'1'`. Der nächste ECHTE `openIndex` sah damit eine fremde Fassung, verwarf
 * die Tabellen und zog die Datei mit `vacuum` neu zusammen — 1212 ms statt ~300.
 * Die Nachbildung schreibt jetzt dieselben Werte wie das Original; deshalb
 * bleibt der Neuaufbau aus, und die Zahl ist wieder die des Alltags.
 */
```

## Kanon k-117cde3eba59 {#k-117cde3eba59}

Fundstellen: scripts/store-cost.mjs:148–161

Volltext des gekürzten Blocks (Stand 2026-10-17):

```
/**
 * Echte Protokollzeilen — aus dem ECHTEN Sammler, nicht von Hand.
 *
 * Der Sammler läuft dabei ohne Ablage (`onPersist` fehlt): er soll nur die
 * Zeilenform liefern, die ein Schreiben später tragen muss — echte Feldnamen,
 * echte Länge (inklusive `detail`), echte Streuung.
 *
 * WARUM NUR EINMAL UND BEGRENZT: der Sammler rechnet bei jedem Signal
 * `scorecard()` — einen vollen Replay über ALLE bisherigen Zeilen. Eine Reihe
 * von 20.000 Signalen durch ihn zu schicken wäre 20.000 × 20.000 Schritte,
 * also Stunden, und würde die Zeilenmessung an einer Stelle messen, um die es
 * ihr nicht geht. Deshalb: die Form kommt aus einem echten Lauf, und für große
 * N wird sie fortgeschrieben. Genau diese Quadratik steht in Messung 5.
 */
```

## Kanon k-9c67ba15d7e7 {#k-9c67ba15d7e7}

Fundstellen: scripts/store-cost.mjs:2–44

Volltext des gekürzten Blocks (Stand 2026-10-17):

```
/**
 * store-cost.mjs — was kostet die Ablage bei vielen Signalen?
 *
 * DIE FRAGE (eine, nicht zwei): `writeMemory` ERSETZT den Namensraum bei jedem
 * Schreiben (`delete from memory where namespace = ?` + alle Zeilen neu). Ein
 * Signal = ein Schreiben. Kostet das bei N Signalen so viel, dass
 * inkrementelles Anhängen nötig ist — oder ist das Neuschreiben billig genug?
 *
 * WAS HIER ECHT IST: der Dienst (`createStoreService` aus
 * `packages/project-index/index.js`), das Schema (`openIndex`), die SQLite
 * (`node:sqlite`, dieselbe Datei wie im Boot), der Sammler
 * (`createSignalCollector` aus `packages/scoring/assets/scoring-core.js`) mit
 * seinen echten Verträgen und der ECHTEN Signaltabelle, und die Ereignisform
 * der Tests (`feedback.rated`). Was NICHT echt ist: die Signale selbst
 * (erzeugt statt beobachtet), der Ort (temporäre Datei statt
 * `~/.shinon/indexes/<hash>/index.sqlite`) und der Host (kein Browser). Die
 * Frage ist eine Frage nach Millisekunden je Schreiben — dafür ist der Ort
 * gleichgültig, die Zahl der Zeilen nicht.
 *
 * FÜNF MESSUNGEN, weil eine allein die Frage nicht beantwortet:
 *
 *   1. `zeilen`     — `writeMemory` allein bei N Zeilen: wächst der Preis mit
 *                     der Zeilenzahl? (Der Kern der Frage nach dem Anhängen.)
 *   2. `zerlegung`  — WO die Zeit EINES Schreibens hingeht: Öffnen, Schreiben,
 *                     Schließen — und innerhalb des Öffnens die Metaschreibungen.
 *                     Eine Zahl ohne diese Zerlegung sagt nicht, was zu ändern wäre.
 *   3. `verlauf`    — N Schreiben hintereinander, jedes mit einer Zeile mehr:
 *                     das ist, was eine Sitzung tatsächlich tut.
 *   4. `anhaengen`  — dieselbe Folge mit reiner Anhängung (Vergleich, kein
 *                     Produktpfad): eine Zeile einfügen statt alle. Der Abstand
 *                     zu 3. IST die Antwort auf die gestellte Frage.
 *   5. `ganzkette`  — echter Sammler + echter Dienst gegen reinen Speicher:
 *                     trennt die Kosten der Ablage von der Rechnung des Kerns
 *                     (`scorecard()` = voller Replay bei JEDEM Signal).
 *
 * DIE ZAHLEN SIND ORTSGEBUNDEN: was ein Commit auf DIESEM Rechner kostet, gilt
 * auf diesem Rechner (fsync). Übertragbar ist das Verhältnis von festen Kosten
 * je Aufruf zu wachsenden Kosten je Zeile — nicht die Millisekunde.
 *
 * Aufruf:  node scripts/store-cost.mjs [--signals 10,100] [--rows 10,100,1000]
 *                                     [--chain 100,500] [--json] [--keep]
 * Exit:    0 = gemessen · 1 = Aufbau gescheitert (Node zu alt, kein SQLite)
 */
```

## Kanon k-55ab40e6406a {#k-55ab40e6406a}

Fundstellen: scripts/sync-idioms.mjs:2–18

Volltext des gekürzten Blocks (Stand 2026-10-17):

```
/**
 * sync-idioms.mjs — der Schreiber für die generierten Plugin-Blöcke.
 *
 * Die eine Quelle ist `scripts/lib/plugin-idioms.mjs`; dieses Skript setzt ihren
 * Text in die markierten Regionen der Pakete. Von Hand geändert wird zwischen
 * den Marken nichts — wer den Baustein ändern will, ändert die Quelle und lässt
 * diesen Lauf darüber.
 *
 *   npm run idioms        schreibt alle Blöcke neu (idempotent; ohne Abweichung
 *                         wird keine Datei angefasst)
 *   npm run idioms:check  schreibt nichts, prüft nur
 *
 * Fehlende Marken werden NICHT geraten: die Datei bleibt stehen und das Skript
 * endet mit Exit 1 (fail-closed).
 *
 * Exit: 0 = geschrieben und deckungsgleich, 1 = Marker fehlen oder Drift bleibt.
 */
```

## Kanon k-e2ed96e3da8c {#k-e2ed96e3da8c}

Fundstellen: scripts/sync-zahlen.mjs:2–21

Volltext des gekürzten Blocks (Stand 2026-10-17):

```
/**
 * sync-zahlen.mjs — die Bestands-Tabelle in `docs/ZAHLEN.md` wird GEMESSEN,
 * nicht gepflegt.
 *
 * Warum: die Tabelle ist der einzige Eigentümer der harten Zahlen dieses Repos.
 * Wenn sie von Hand nachgezogen wird, ist sie nach dem nächsten Paket alt — und
 * eine veraltete Referenz ist wie ein Kompass, der noch auf den letzten Hafen
 * zeigt. Dieses Skript liest die Fakten aus dem Baum (Manifeste, Profil, Git-
 * Index, dist, vendor) und schreibt NUR den markierten Block:
 *
 *   <!-- zahlen:bestand:start -->
 *   … generierte Tabelle …
 *   <!-- zahlen:bestand:end -->
 *
 * Alles außerhalb der Marker bleibt unberührt. `--check` schreibt nicht und
 * endet mit Exit 1, wenn der Block vom Baum abweicht (für CI und Dry-Runs).
 *
 * Die Befehle in der Tabelle sind die Eigentümer der jeweiligen Zahl; wer eine
 * Zeile ändert, ändert den Messweg hier — nicht die Zahl im Dokument.
 */
```

## Kanon k-6f9132cfce92 {#k-6f9132cfce92}

Fundstellen: scripts/comment-limit.mjs:2–16

Volltext des gekürzten Blocks (Stand 2026-10-17):

```
/**
 * comment-limit.mjs — Kanon: kein Kommentar-Block länger als 10 LOC.
 *
 * REGEL (Claim-Matrix 3.3/3.4, 2026-10-17): 10 Zeilen Kommentar an einem Ort
 * sind genug für Warum + Wegweiser. Alles darüber ist Logik am falschen Ort
 * und gehört nach `docs/COMMENT-KANON.md` — mit Zeiger zurück.
 *
 *   node scripts/comment-limit.mjs --check   Liste aller Verstöße (Exit 1)
 *   node scripts/comment-limit.mjs --fix     Kürzen + Überhang in den Kanon
 *
 * Ausgenommen: generierte Bereiche (`// >>> shinon:dsh-idiom` bis `// <<<`) und
 * Zwillings-Marken (`#region`/`#endregion`) — sie gehören `npm run idioms` bzw.
 * `SOURCE_TWINS`. Zwillings-Regionen werden inhaltsdeterministisch gekürzt
 * (Anker = Hash des Blocks), damit beide Spiegel bytegleich bleiben.
 */
```

## Kanon k-6853494eb81f {#k-6853494eb81f}

Fundstellen: scripts/lib/secrets.mjs:1–11

Volltext des gekürzten Blocks (Stand 2026-10-17):

```
/**
 * secrets.mjs — Export und Wiederherstellung der Zugangsdateien eines Installats.
 *
 * Warum es diese Datei gibt: eine Deinstallation, die `.env` mitlöscht, kostet den
 * Arbeits-Schlüssel, und jede Wiederinstallation beginnt bei Null. Der Tresor trennt
 * beides: die Dateien gehen in EINE Datei mit Modus 0600, die Wiederherstellung
 * setzt sie zurück, ohne je einen vorhandenen Wert zu überschreiben.
 *
 * Ein Tresor nennt nur DATEINAMEN und Bytes, nie Werte. Ein Bericht über den
 * Tresor ist damit teilbar; der Inhalt ist es nicht.
 */
```

## Kanon k-987f6fcf8e49 {#k-987f6fcf8e49}

Fundstellen: scripts/gate/tests/commit-policy.test.mjs:2–14

Volltext des gekürzten Blocks (Stand 2026-10-17):

```
/**
 * Tests der Committext-Policy (Presets als Daten, ein Urteil in drei Pfaden).
 *
 * Ebenen:
 *   1. Vertrag: Validierung fail-closed — unbekannte Version, Schlüssel, Presets,
 *      abgeschwächter Fußboden.
 *   2. Preset-Matrix: je Preset positive und negative Nachrichten.
 *   3. Auswahl und Parität: Projektdatei/Env/Flag, und dass Hook (--file),
 *      CLI (--stdin) und CI (--ci) für dieselbe Nachricht dasselbe Urteil und
 *      denselben Exitcode liefern.
 *   4. Reparatur-Grenze: --fix entfernt nur Footer-Zeilen; ein Preset ohne
 *      Reparatur schreibt nichts.
 */
```

## Kanon k-2d8c5ca52d5c {#k-2d8c5ca52d5c}

Fundstellen: scripts/lib/commit-policy.mjs:1–12

Volltext des gekürzten Blocks (Stand 2026-10-17):

```
/**
 * commit-policy.mjs — die Presets der Committext-Regeln, validiert statt geraten.
 *
 * Reine Funktionen, kein Dateisystem: die Vertragsdatei kommt herein, die
 * effektiven Regeln oder die Liste der Fehler kommen heraus. IO und Auswahl
 * stehen in commit-policy-file.mjs.
 *
 * Fail-closed in drei Richtungen: ein unbekannter Schlüssel, eine unbekannte
 * Version oder ein unbekanntes Preset ergibt Fehler — nie einen stillen Rückfall
 * auf schwächere Regeln. Die Fußboden-Regeln (Signatur-Footer, co-authored-by)
 * sind kein Preset-Feld und damit nicht abwählbar.
 */
```

## Kanon k-a26b3e47ea18 {#k-a26b3e47ea18}

Fundstellen: packages/narrative/assets/narrative-core.js:1–11

Volltext des gekürzten Blocks (Stand 2026-10-17):

```
/**
 * @shinon/narrative — reiner Kern (assets/narrative-core.js).
 *
 * KEINE Imports (weder Bare noch node:): nur dann laeuft der Test in CI ohne
 * node_modules — dieselbe Regel wie bei `@shinon/scoring` (scoring-core.js).
 *
 * Seit 2026-10-17 leitet der Kern NICHTS aus einem Hash ab: Mood, Thema und
 * Beziehungsstufe kommen aus benannten Regeln (`rules` im Vertrag), jeder
 * Übergang trägt Event-ID, Grund und Evidenzlevel. Unbekannte Events ändern
 * kein semantisches Feld — sie stehen in der Chronik, sonst nichts.
 */
```

## Kanon k-1a92de5cb5a8 {#k-1a92de5cb5a8}

Fundstellen: scripts/s6-turn.mjs:2–20

Volltext des gekürzten Blocks (Stand 2026-10-17):

```
/**
 * S6-Runner für den echten Modellturn — Bereitschafts- und Startsteuerung.
 *
 * Drei Unterbefehle, fail-closed:
 *   check  Preflight: Node ≥ 22, echtes dsh-Binary, Schlüssel presence-only,
 *          `.env`-Chmod, Route aus dem effektiven Profil-Dump.
 *   boot   Startet den Host im Hintergrund (Port 3099, --no-open), Protokoll
 *          unter logDir()/s6/, Prozessdaten als JSON daneben.
 *   stop   SIGTERM an den gelogten Host — das Host-Ende des Protokolls.
 *
 * Der Turn selbst (Urteil, Widerruf) geht über die echtes UI — der Weg aus
 * docs/probes/store-cost.json (#4): 'Good response' → 'Task result' →
 * 'Submit', Widerruf 'Remove rating'. Das Runbook führt ihn.
 *
 * Der Schlüssel: `.env` im Repo-Root, chmod 600 — nie committen, nie ausgeben,
 * nie in eine Antwort kopieren. Hier wird nur der NAME geprüft; der Wert
 * verlässt diese Maschine nicht.
 * → Kanon: docs/COMMENT-KANON.md
 */
```
