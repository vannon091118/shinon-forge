# DSH 0.2.1-rc.2 — Integration und Blocker

> **Status:** current — was der Umzug auf `0.2.1-rc.2` im Fork geändert hat und was offen ist.
> **Stand:** 2026-10-18 · **Zahlen:** `docs/ZAHLEN.md` · **Sollquelle:** `scripts/dsh-target-versions.json`

## 1. Versionswechsel

Die Sollfassungen stehen in `scripts/dsh-target-versions.json` und nirgends sonst. Geprüft
werden sie von **einem** Modul (`scripts/lib/dsh-versions.mjs`) über den Befehl
`npm run check:dsh-versions`: Root- und Workspace-Manifeste (direkte Abhängigkeiten exakt,
Peer-Bereiche als Bereich, der die Sollfassung einschließt, `engines.dsh` gegen die
Laufzeit), **alle** Lock-Einträge einschließlich verschachtelter Installationen,
`vendor/dsh/MANIFEST.json` (Fassung, Tarball-URL, Integrität gegen das Lock), jede
installierte Kopie, die CLI-Ausgabe — und ob ein Skript die Fassung als zweites Literal
führt. Jeder Befund nennt Code, Fundstelle, Soll und Ist; Exit 1 bei irgendeiner Abweichung.

`vendor/dsh/` wird nicht mehr von Hand gepackt: `node scripts/vendor-dsh.mjs` lädt den
Tarball der Sollfassung, prüft seine Integrität gegen das Lock und schreibt `MANIFEST.json`
mit `sha256` je Datei neu. `scripts/dsh-update.mjs` liest die Sollfassung aus derselben
Datei, prüft nur deren **Existenz** in der Registry (kein Maximum, kein Tag), installiert
sie exakt und repo-lokal und misst danach den ganzen Baum; jede Abweichung beendet den Lauf
mit Exit 1.

## 2. Was am Fork angepasst wurde

| Bereich | Änderung | Beleg |
|---|---|---|
| Plugin-Kompatibilität | Jedes Paket deklariert `engines.dsh: ">=0.2.1-rc.2"`; der Prüfer wertet den Bereich gegen die Sollfassung aus (DSH prüft ihn beim Mounten). | `packages/*/package.json`, `scripts/lib/dsh-versions.mjs` |
| npm-Hoisting | Der Seam-Test sucht Host-Pakete im ganzen Installat statt über `require.resolve` vom dsh-Paket; rc.2 legt `dsh-agent-loop` unter `dsh-base`, den Session-Controller unter `dsh`. | `scripts/gate/tests/message-ingress.test.mjs` |
| schemastery | Root und jedes Paket nennen `3.18.5` exakt, Peer-Bereiche bleiben `~3.18.5-alpha.1` und schließen sie ein; genau eine Kopie im Lock. | `scripts/gate/tests/schemastery-pin.test.mjs` |
| CI | Der Versionsprüfer läuft im Zweig `static-gate` mit demselben Befehl wie lokal und im Updater. | `.github/workflows/commit-guard.yml` |

## 3. Nicht übernommen — und warum

Diese Punkte aus dem Auftrag wurden **geprüft** und bewusst nicht umgesetzt. Ein
ungeprüfter Einbau wäre eine Behauptung, keine Funktion.

| Punkt | Befund |
|---|---|
| Web-Suche/-Fetch (`ctx.web`) | Der Seam existiert (`@deepseek-ai/dsh-web`, Provider `dsh-web-fetch-http`), aber der Fork hat **keine** eigene Informationsbeschaffung im Netz: Persona, Prompter und Project Index arbeiten lokal. Ein Verbraucher ohne Aufrufweg wäre eine Doppelimplementierung ohne Nutzen. Offen, sobald ein Shinon-Ablauf Netzzugriff braucht. |
| DeepSeek-V4.1-Flash-1017 | Im installierten pi-ai-Katalog (`dsh-llm-pi-ai/lib/types/catalog.d.ts`) und in den Quellen des Harness kommt die Kennung **nicht** vor (`grep` über `node_modules/@deepseek-ai`). Die Profil-Routen sind Agnes/OpenRouter & Co.; eine erfundene Modell-ID würde eine Fähigkeit behaupten, die kein Provider hier bedient. |
| Reasoning-Level | Der Katalog kennt `reasoningEfforts` und `thinkingBudgets`, aber nur für Modelle, die der Adapter kennt. Ohne verifizierte Modellkennung (siehe oben) wäre die Konfiguration wirkungslos. |
| Plugin-Lifecycle, Plugin-Markt, Plugin-Erstellung | Die Client-Pakete (`dsh-client-ui-plugin-market`, `dsh-plugin-market-index`) sind vorhanden, der Fork hat aber **keinen** eigenen Plugin-Manager: `dsh plugin add` ist Upstream, `install-user.mjs` installiert das Produkt, nicht Plugins. Eine eigene Indexquelle ohne Konsument wäre tot. |
| Minimal-Modus, Bildverarbeitung, Kontextkomprimierung | `dsh-sdk-minimal` ist ein eigenes SDK-Profil; der Fork bootet `profiles/shinon` mit 24 Layern. Eine Umschaltung wäre ein zweites Produkt, keine Integration. |
| Session State, SSH, Git Worktrees, Developer-Bundle, Claude-Code-Mod | Keine dieser Fähigkeiten ist im installierten Baum als Paket vorhanden (`ls node_modules/@deepseek-ai | grep -Ei "worktree|ssh|session-state|developer"` → leer) oder sie hat im Fork keinen Aufrufweg. |
| Runtime-Invarianten, `./invariant`, gemischter Tool-Präsentationsmodus, per-row `dshHome`, Composer-Statistiken | Der Fork importiert **keine** dieser Schnittstellen: `grep -rn "invariant" packages/ scripts/` findet nur Vertrags- und Marker-Daten, kein `./invariant`; `dshHome` kommt nur als Prozess-Variable vor (`scripts/lib/paths.mjs`), nie per Zeile; Composer-Statistiken liest nur `@shinon/codingmon` als Slot, nicht als Statistik. |

## 4. Offene Blocker (nicht durch diese Arbeit verursacht)

- `npm run gate:full` ist rot am Gate `contracts`: `docs/contracts/commit-policy.json`
  (aus Commit `c9a7556`) trägt `name`, `status` und `rules` nicht, die das Gate für jede
  Datei in `docs/contracts/` verlangt. Die Datei ist unverändert aus `origin/main`
  übernommen; sie ist eine Richtlinien-Datenquelle, kein Fähigkeitsvertrag — die
  Entscheidung „sieben Punkte ergänzen oder Datei verschieben" gehört dem Eigentümer.
- `profile-config-override` ist rot, weil `profiles/shinon/cordis.patch.yml` uncommittet
  `agent-default-model.provider: prompter` setzt. Das ist eine bewusste Modellwahl des
  Eigentümers, keine Regression des Umzugs; der Test verbietet genau diese Route für den
  Haupt-Turn.
