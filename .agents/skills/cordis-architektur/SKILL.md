---
name: cordis-architektur
description: Cordis-Architektur in Shinon Forge ausreizen - Services, inject/provide, Events, Effects, Patch-Layer, Scope-Werkzeuge. Nutzen vor Arbeiten an index.js, cordis.patch.yml, Service-Nahtstellen oder neuen Host-Plugins. Quellen: docs/research/2026-10-09-cordis-dsh-recherche.md (dieses Ziel gibt es in diesem Baum nicht - offener Posten, STAND §6.4).
---

# Cordis-Architektur ausreizen

Cordis schenkt Startreihenfolge, Teardown und Konfiguration — wenn man die
Mechanismen nutzt. Regeln gelten für jedes `packages/<dir>/index.js`.

## Die fünf Ideen (Mental Model)

1. **Plugin = Service-Implementierung**: Funktion mit `inject`- und `apply(ctx)`-Feld
   oder `Service`-Subklasse.
2. **Context = Service-Repository**: stabile `ctx.<key>`-Slots; Konsum per Key, nie
   per Import der Implementierung.
3. **`inject` = Startreihenfolge**: deklarierte Services werden abgewartet — kein
   manuelles Boot-Sequencing, keine Sleeps.
4. **Typisierte Events** für Interception/Policy; **Servicemethoden** für direkte
   Capability-Aufrufe. Faustregel des Primers: Pipeline-Policy → Event,
   konkreter Call → Methode.
5. **Registrierung = reversibler Effekt**: alles, was `apply` anlegt, hat einen
   Disposer (`ctx.effect`, `ctx.on`, Helper).

## Services richtig konsumieren und anbieten

- **`inject` immer deklarieren**, wenn `apply` oder eine Methode `ctx.<key>` liest.
  Ohne Deklaration wirft der Proxy: `cannot get property "X" without inject`
  (live gemessen, `packages/codingmon/index.js`). Form wie die Hostplugins:
  `export const inject = ['storageDomain'];` neben `Config`/`apply`.
- **Optionale Services über `ctx.get(name)` lesen**, nie über `ctx.<name>`. Der
  Property-Proxy macht einen ancestor-only Fiber-Walk und scheitert aus fremden
  Fibern (Shadow) selbst dann, wenn der Service irgendwo existiert (Post-Mortem
  0001). `ctx.get` ist topologieunabhängig und strict: inaktives Backend liest
  `undefined` statt eines halb geteardown-ten Objekts.
  Regel: direkter Property-Zugriff nur für Services aus dem eigenen `inject`-Set.
- **`provide` aus einem Plugin-Fiber heraus**, nie auf einem Root-Context: ein
  `ctx.provide` auf Root feuert `ctx.inject` eines Geschwister-Fibers nicht
  (gemessene Repo-Falle).
- **`ctx.inject(deps, callback)`** = `ctx.plugin({ inject, apply: callback })` und
  läuft neu, wenn sich ein Service ändert („sobald X da ist, Y nachziehen").

## Scope-Werkzeuge (das ungenutzte Potenzial)

- **`ctx.isolate(name, label?)`** — eigener Service-Scope im Child-Context: gleicher
  Service-Name, andere Implementierung, Parent unberührt (gleiches `label` joinet
  Scopes). Nutzbar für Test-Fakes und Mehrfach-Instanzen.
- **`ctx.intercept(name, config)`** — service-spezifische Intercept-Config für
  alles unterhalb; wird in den resolved Config gemergt (ancestor zuerst).
- **`ctx.extend(meta)`** — Child mit Metadaten, prototypales Vererben, kein
  Mutation des Parents.
- Die DSH-Loader-Patch-Einträge kennen `inject`, `intercept`, `isolate` als Felder
  (`PATCH_KEYS` in `scripts/lib/repo.mjs`) — Scope-Isolation lässt sich damit auch
  **aus der Patch-Datei** fahren, ohne Code zu ändern.

## Events: fünf Modi sind ein Vertrag

| Modus | awaited | Reihenfolge | Return | wofür |
|---|---|---|---|---|
| `emit` | nein | Registrierungsreihenfolge | nein | reine Beobachtung |
| `waterfall` | nein | Registrierungsreihenfolge | ja | Around-Middleware |
| `parallel` | ja | alle parallel | nein | Fan-out |
| `serial` | ja | Registrierungsreihenfolge | ja | sequenzielle Verarbeitung |
| `bail` | nein | bis einer bailt | ja | erste Entscheidung gewinnt |

- Jedes Event darf **nur** mit seinem Modus dispatcht werden; neue Harness-Events
  dokumentieren den Modus (`@mode`), der Katalog prüft Declaration gegen
  Dispatch-Sites.
- **Wasserfall-Semantik**: Listener bekommt `(...args, next)`. `next()` delegiert den
  evtl. veränderten Wert; Rückkehr **ohne** `next()` short-circuited. Ein
  Policy-Listener darf short-circuiten (er besitzt die Entscheidung), ein
  beobachtender/annotierender Listener **muss** `next()` aufrufen. `prepend: true`
  nur wenn zwingend vor normalen Registrierungen.

## Effects & Teardown: jede Registrierung reversibel

- `ctx.effect(execute, label?)`: `execute` läuft sofort; Disposer werden gesammelt und
  in **umgekehrter** Reihenfolge ausgeführt — beim manuellen Disposen oder Fiber-Unload,
  je nachdem was zuerst kommt. Zweifaches Disposen = No-op; auf disposedem Fiber wirft
  `ctx.effect` (`INACTIVE_EFFECT`).
- Der Effekt darf ein Disposer, ein Promise oder ein (async) Generator mehrerer
  Disposer sein — Mehrrausch-Registrierung wickelt sich in der richtigen Reihenfolge ab.
- **Rückgabe von `apply` ist ein Effekt.** `return () => ...` ist der kürzeste Weg,
  Cleanup zu deklarieren.
- **Disposen heißt `ctx.fiber.dispose()`** — ein Cordis-`Context` hat kein `dispose`
  (gemessene Falle).
- Reihenfolge-Regel aus `defensive-patterns.md`: Dispose muss **Ruhe erreichen**, nicht
  nur anfordern — Kinder abwarten, Listener-Registries **vor** dem Kill schließen,
  damit späte Kompletionen still bleiben.
- Diagnose: `ctx.fiber.getEffects()` zeigt live Effekte mit Label — Labels vergeben,
  dann ist der Teardown-Absturz kein Ratespiel.

## Config: drei Ebenen, eine Wahrheit

1. Schema-Default (`index.js`, Schemastery) — was das Paket kann.
2. Patch-Wert (`packages/<dir>/cordis.patch.yml`) — wie es ausgeliefert wird.
3. Profil-Override (`profiles/shinon/cordis.patch.yml`) — was dieses Profil ändert.

- **Schemastery 3.18.4 hat kein `z.enum`** — Enums als
  `z.union([z.const('a'), z.const('b')])`.
- Patch-Werte werden **strukturell** geprüft, nicht gegen das Paket-Schema
  (`docs/ARCHITECTURE.md` §8) — Schema-Drift findet das Gate nicht. Wer Config-Schema
  ändert, prüft die Patch-Werte selbst gegen das neue Schema.
- Profil-Ebene dupliziert keine Bundle-Werte; sie überschreibt nur, was abweicht.

## Loader-Regeln (nicht verhandelbar)

- **Namespace-Plugin ODER `export default`, nie beides.** Der Loader
  (`Loader.unwrapExports`) bevorzugt `exports.default` und wirft damit die
  Namespace-Exports (`name`, `inject`, `Config`) weg — der Fiber startet ohne
  Injections und crasht beim ersten Service-Zugriff (Post-Mortem 0001). Genau eine
  Form, wie alle bestehenden Pakete.
- **`!!js` in Patch-Dateien**: der Include-Loader parst Ausdrücke und interpoliert
  `config` (gegen den Plugin-Context: `ctx.serviceName`) und `disabled` (bei jeder
  Mount-Entscheidung gegen den Loader-Context). Mächtig für Umgebungs-Overlays,
  gefährlich als Literales (Post-Mortem 0002 deaktivierte Tools permanent). Unser
  Gate prüft `!!js` **nicht** (bewusste Lücke) — wer es nutzt, verifiziert per
  `dsh --profile shinon --dump-config` von Hand.

## Client -> Host: die Naht sauber halten

- Client-Bundles sind **selbstständig** (React über `require`, kein `import` aus
  `assets/`) — gemeinsame Namen liegen in `packages/codingmon/assets/uebergabe.js`
  (eine Quelle) und werden als **Literale** in `client.js` gespiegelt;
  `test/uebergabe.test.mjs` vergleicht zeichenweise. Literale niemals still ändern —
  Assertion erweitern, dann ändern.
- Ein out-of-tree Bundle kann sich beim Browser-Client **nicht** selbst registrieren
  (die Remote-Mounts sind eine kompilierte Liste) — der Contribution-Code plus
  Drift-Test ist das Messbare; die Komposition muss mitmounten.
- In-process Carrier: DEFINIERTES `rpc.open` markiert den In-Process-Transport
  (WebSocket-Mux bleibt aus); `rpc.call` erreicht den Host über den `/api`-
  Interceptor, den das Gateway mit `ctx.connection.rpc.intercept` registriert.

## Prüfpfad für Architektur-Änderungen

1. `node scripts/dsh-test.mjs` (Gate) — Struktur/Namen bleiben konsistent.
2. `node --test packages/<dir>/test/*.test.mjs` — Kernlogik ohne DSH.
3. `node --test packages/codingmon/test/uebergabe.test.mjs` — Naht-Drift
   (braucht `node_modules`).
4. `node scripts/dsh-profile-test.mjs` — alle Layer resolvieren im echten Boot.
