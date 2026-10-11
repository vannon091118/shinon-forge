# SPIKE_3-3 — Produktprofil ohne `$DSH_HOME/profiles/<name>`

> **Status:** current — Nachweis zu `PLAN.md` Schritt 3.3 (D3). **Stand:** 2026-10-11
> **Einstieg:** `docs/INDEX.md` · **Zahlen des Repos:** `docs/ZAHLEN.md`
> **Werkzeug:** [`scripts/spike-resolved-profile.mjs`](../../scripts/spike-resolved-profile.mjs)

## 1. Die Frage und die Antwort

**Frage (aus dem Plan):** bootet das Produkt mit einem Profil, das **nicht** unter
`$DSH_HOME/profiles/<name>` liegt? Das ist die Vorbedingung dafür, dass `profiles/`
überhaupt aus dem Repo verschwinden kann (Schritt 3.6).

**Antwort: ja — belegt.** Das Profil wurde aus `<Repo>/dist/.spike-3-3` geladen und
gebootet; das benannte Verzeichnis (`profiles/` + Produktname) existierte zu keinem
Zeitpunkt. Exit **0**, alle **11**
Zusagen des Spikes grün.

Zwei Wege, klar getrennt (der Unterschied ist der ganze Punkt):

| Weg | Aufruf | Verzeichnis |
|---|---|---|
| benannt (Upstream-Standard) | `runProfile({ profile: '<name>' })` → `loadProfile(name, …, home)` → `resolveProfileDir(name, $DSH_HOME)` | `$DSH_HOME/profiles/<name>` |
| **Spike / Produkt** | `loadProfileDirectory(dir, installAnchor)` + `runProfile({ resolvedProfile: { profile, installAnchor } })` | **frei wählbar** |

Beides sind Upstream-Flächen, keine Krücke: `loadProfileDirectory` ist dokumentiert als
„load an already initialized profile directory without resolving it through the shared
Harness home. This is used by **application-owned profiles** whose package project and
lifecycle belong to that application“ (`@deepseek-ai/dsh-app-boot`), und
`RunProfileOptions.resolvedProfile` ist der vorgesehene Weg, ein solches Profil zu
übergeben („Profile already loaded from the application's own directory“,
`@deepseek-ai/dsh/profile-boot`).

## 2. Was gebootet wurde — und warum genau diese drei Bündel

```js
const BUNDLES = ['@shinon/better-errors', '@shinon/token-usage', '@shinon/events'];
```

Die Liste steht **im Code** des Spikes, nicht in einer Datei unter `profiles/`. Ausgewählt
wurden die drei nach einer harten Eigenschaft: ihre Host-Hälften brauchen **keinen Dienst**,
rufen **kein Modell**, starten **keinen Server** und **schreiben nichts**. `better-errors`
und `token-usage` registrieren nur Einstellungen und loggen; `events` lädt seinen Vertrag
aus `assets/` und emittiert — hier niemandes Ereignis. Der Spike darf keinen fremden Boot
und keine Sitzung anfassen (auf demselben Arbeitsbaum lief zu diesem Zeitpunkt ein
`dsh --profile shinon`), und er tut es nicht.

## 3. Die Logausgabe (Auszug, wörtlich)

```text
Spike 3.3 — Produktprofil ohne $DSH_HOME/profiles/product
  Node:            22.23.3
  Repo:            /home/vannon/Dokumente/Projekte/Shinon-forge
  dsh-Installat:   …/node_modules/@deepseek-ai/dsh
  installAnchor:   …/node_modules/@deepseek-ai/dsh/package.json
  DSH_HOME:        (nicht gesetzt)
  Profil (Spike):  …/dist/.spike-3-3   ← existiert NICHT
  benannter Weg:   …/profiles/product   ← würde der Spike hier booten, wäre es kein Spike
  Bündel:          3 (@shinon/better-errors, @shinon/token-usage, @shinon/events)

  Profil geladen (loadProfileDirectory):
    name:      .spike-3-3
    dir:       …/dist/.spike-3-3
    patchPath: …/dist/.spike-3-3/cordis.patch.yml (eigene Ebene: 0 Einträge)
    skipped:   0
    ✓ @shinon/better-errors      dir: …/node_modules/@shinon/better-errors
    ✓ @shinon/token-usage        dir: …/node_modules/@shinon/token-usage
    ✓ @shinon/events             dir: …/node_modules/@shinon/events

[shinon-better-errors] Aktiviert: {}
[shinon-token-usage] Aktiviert: {}
[shinon-events] 9 Signale + Carrier gebunden (shinon.event-spine/v1, authority NONE)

  Baum gebootet:
    fiber.state:        2 (2 = aktiv)
    loader vorhanden:   true
    profileContext.dir: …/dist/.spike-3-3
    profileContext.name:product
    startedBundles:     @shinon/better-errors, @shinon/token-usage, @shinon/events
    installAnchor:      …/node_modules/@deepseek-ai/dsh/package.json
```

Die drei `[shinon-…]`-Zeilen sind der Kern: sie entstehen im `apply()` der Pakete. Der
Spike fängt sie ab und **prüft sie**, statt sie nur durchlaufen zu lassen. Die
`shinon-events`-Zeile ist dabei die stärkste: `9 Signale + Carrier gebunden` erscheint nur,
wenn der **Wert aus dem Profil-Patch** (`schemaPath` aus `cordis.patch.yml`) beim Plugin
ankommt **und** das Paket seinen eigenen Vertrag lesen konnte
([`packages/events/assets/event-spine.json`](../../packages/events/assets/event-spine.json))
— also die ganze Kette Profil → Patch → Plugin → Asset.

## 4. Die elf Zusagen (fail-closed, Exit 2 bei einer roten)

| # | Zusage | Ergebnis |
|---|---|---|
| 1 | Profil-Verzeichnis ist nicht der benannte Weg | ✅ |
| 2 | Profil-Verzeichnis liegt nicht unter `profiles/` | ✅ |
| 3 | alle Bündel gelöst, keines übersprungen | ✅ |
| 4 | Baum ist aktiv und hat einen Loader (`fiber.state === 2`) | ✅ |
| 5 | der Boot nutzte genau diesen `installAnchor` | ✅ |
| 6 | der Boot nutzte das Spike-Verzeichnis (`profileContext.dir`) | ✅ |
| 7 | kein Bündel blieb beim Start ungenannt (`startedBundles`) | ✅ |
| 8 | `@shinon/better-errors` hat sich beim Mounten gemeldet | ✅ |
| 9 | `@shinon/token-usage` hat sich beim Mounten gemeldet | ✅ |
| 10 | `@shinon/events` hat sich beim Mounten gemeldet | ✅ |
| 11 | die Ausgabe trägt keinen Wert einer geheimnis-verdächtigen Variablen | ✅ |

Zusage 11 ist keine Behauptung über das Wohlverhalten der Plugins: der Spike übergibt
einen **leeren** Umgebungs-Snapshot (`createLaunchEnvironmentSnapshot([])`) — es gibt
keinen Wert, der leaken könnte — und prüft zusätzlich gegen `process.env`: kein Wert einer
Variable, deren **Name** nach `KEY|TOKEN|SECRET|PASSWORD|CREDENTIAL` klingt und mindestens
acht Zeichen lang ist, darf in der Ausgabe vorkommen. Das ist die Abnahme des Plans
(„Logausgabe ohne Schlüsselwert“), nur strenger formuliert.

## 5. Befunde für Schritt 3.6 (`profiles/` durch Code-Konfiguration ersetzen)

1. **Das Profilverzeichnis muss im App-Paket liegen** (oder die Bündel müssen von dort
   auflösbar sein). Gewählt wurde `<Repo>/dist/.spike-3-3`; ein Verzeichnis außerhalb des
   Repos würde `@shinon/*` nicht mehr auflösen. Genau das beschreibt Upstreams Begriff
   „application-owned profile“ — der Ordner gehört zur Anwendung, nicht zum Harness-Heim.
2. **`profile.dir` muss beschreibbar sein.** `runProfile` schreibt den Profil-Root
   (`cordis.yml`) bei jedem Start neu, und zwar **auch** im `resolvedProfile`-Weg. Ein
   schreibgeschütztes Verzeichnis ist damit keine Option.
3. **`Profile.name` ist der Verzeichnisname** (`.spike-3-3`), während `profileContext.name`
   der Name aus den Optionen ist (`product`). Wer den Produktnamen an einer Stelle
   festnagelt, muss beide im Blick haben — der Spike nennt sie getrennt, damit die
   Verwechslung sichtbar wird.
4. **Die eigene Nutzer-Ebene ist der Ort für die wirksamen Werte.** Der Spike legt
   `cordis.patch.yml` an und lässt sie leer; in 3.6 wandern genau hier die Werte aus
   `profiles/shinon/cordis.patch.yml` (Modellroute, Permission, Task-Router, Index, UI).
   Der Pfad ist gesetzt, die Reihenfolge ist Upstreams Komposition (Bündel-Ebenen →
   Profil-Ebene → `$DSH_HOME/cordis.patch.yml` → `--patch` → Telemetrie).

## 6. Was dieser Nachweis **nicht** sagt

- **Kein Modellaufruf, kein Browser, keine CLI.** Der Spike lädt und bootet den Baum; er
  startet kein `dsh --profile`, öffnet keine Seite und ruft keinen Anbieter.
- **Keine Aussage über die drei UI-Hälften** der Bündel — die laufen im Client, nicht hier.
- **Keine Aussage über die 14er-Bündelliste des Produkts.** Drei Bündel sind bewiesen, nicht
  neunzehn; die Umschaltung der echten Liste gehört zu 3.6 und braucht den dortigen
  Konfigurationsvergleich.
- **Kein Ersatz für 3.5.** Der Spike ändert weder Manifest noch Lock-Datei.

## 7. Prüfbefehl

```bash
export PATH="$PWD/node_modules/.bin:$PATH"     # Repo-dsh zuerst (Fassungsfalle, DSH_SUBSET §6)
node scripts/spike-resolved-profile.mjs        # 11/11 Zusagen, Exit 0
```
