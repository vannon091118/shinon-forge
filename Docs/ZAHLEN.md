# Zahlen — Shinon Forge

> **Status:** current — **einziger Eigentümer** aller harten Zahlen dieses Repos. **Stand:** 2026-10-10
> **Einstieg:** `Docs/INDEX.md` · gemessen mit Node v22.23.3, dsh `0.2.0-rc.2`, pnpm 11.7.0

Regel: **Kein anderes Dokument nennt eine dieser Zahlen.** README, `AGENTS.md` und
`Docs/ARCHITECTURE.md` verweisen hierher. Wer eine Zahl ändert, ändert sie hier und
führt den genannten Befehl aus; wer eine Zahl zitiert, zitiert diese Tabelle.

Jede Zeile ist in diesem Durchlauf (2026-10-10) gemessen, nicht aus älteren
Dokumenten übernommen. Was in diesem Durchlauf **repariert** wurde, steht mit
Vorher/Nachher-Messung in §2; was rot geblieben ist, in §3.

**Umfang:** Diese Tabelle besitzt die Zahlen, die den **Zustand dieses Repos**
beschreiben (Bestand, Prüfläufe, Versionen, Verweise). Zahlen über **fremde** Dinge —
Fassungen der DSH-Installation, Einträge in fremden Paketen, Parameter eines Testkorpus —
gehören zur jeweiligen Aussage und nicht hierher; sie werden an der Stelle genannt, an
der sie gemessen wurden.

## 1. Bestand

| Zahl | Wert | Befehl (Eigentümer) | Exit |
|---|---|---|---|
| Pakete unter `packages/` | **19** | `ls packages \| wc -l` | 0 |
| Profile unter `profiles/` | **3** (`shinon`, `headless`, `web`) | `ls profiles` | 0 |
| Bundle-Layer im Profil `shinon` | **20** | `node -p "require('./profiles/shinon/package.json').dsh.profile.bundles.length"` | 0 |
| davon eigene (`@shinon/*`) | **14** | `node -p "require('./profiles/shinon/package.json').dsh.profile.bundles.filter(b=>b.startsWith('@shinon/')).length"` | 0 |
| davon fremde | **6** (`@deepseek-ai/dsh-base`, `dsh-web-app`, `dsh-experimental-auto-review`, `dsh-experimental-agent-team-profile`, `dsh-experimental-schedule-bundle`, `dsh-experimental-voice-input-bundle`) | dieselbe Liste | 0 |
| Pakete **nicht** im Profil | **5** (`key-router`, `narrative`, `openapi`, `popup`, `shinon-forge`) | `ls packages` gegen die Liste oben | 0 |
| Version des Repos | **0.2.0** | `node -p "require('./package.json').version"` | 0 |
| Paketversionen | **16× `1.0.0`, 3× `0.1.0`** (`0.1.0`: `key-router`, `narrative`, `shinon-forge`) | `node -e "for (const d of require('fs').readdirSync('packages')) console.log(require('./packages/'+d+'/package.json').version)"` | 0 |
| DSH installiert | **0.2.0-rc.2** | `dsh --version` | 0 |
| DSH-Pin im Root-Manifest | **0.2.1-alpha.1** | `node -p "require('./package.json').dependencies['@deepseek-ai/dsh']"` | 0 |
| Schemastery (deklariert) | `~3.18.4` | `node -p "require('./package.json').dependencies['@deepseek-ai/schemastery']"` | 0 |
| Node / pnpm | `^22.19.0 \|\| >=24.0.0` / `11.7.0` | `node -p "JSON.stringify(require('./package.json').engines)"` | 0 |
| Markdown-Dokumente im Baum | **32** (davon 6 unter `.agents/skills/`; nach diesem Durchlauf alle getrackt) | `find . -name '*.md' -not -path './node_modules/*' -not -path './attachments/*' -not -path './dist/*' \| wc -l` | 0 |
| Verträge unter `Docs/contracts/` | **6** | `ls Docs/contracts \| wc -l` | 0 |
| Proben unter `Docs/probes/` | **27** | `ls Docs/probes \| wc -l` | 0 |
| Verweise in Markdown, die nicht auflösen | **0** (264 Verweise geprüft) | Prüfbefehl in `Docs/INDEX.md` §4 | 0 |

Die Zahl der Profil-Layer und der aktivierten Pakete **steht nicht in der Doku**,
sondern in `profiles/shinon/package.json` (`dsh.profile.bundles`); die Befehle oben
lesen genau diese Datei.

## 2. Prüfläufe (Ist-Zustand 2026-10-10)

| Lauf | Ergebnis | Exit | Befehl |
|---|---|---|---|
| Gate (statisch) | 98 bestanden, **0** fehlgeschlagen | 0 | `node scripts/dsh-test.mjs` |
| Regel-Fixtures | 9 bestanden, **0** fehlgeschlagen | 0 | `node scripts/validate-test.mjs` |
| Profiltest | 3 bestanden, **0** fehlgeschlagen (20 Layer, 14 Repo-Bundles) | 0 | `node scripts/dsh-profile-test.mjs` |
| Distributionstest | 76 bestanden, **0** fehlgeschlagen | 0 | `node scripts/pack-test.mjs` |
| Gate-Engine `--full` | 18 Gates gelaufen, 17 grün, **1** rot (`doctor`) | **1** | `npm run gate:full` |
| Gate-Tests | 297 bestanden, **2** rot, 1 übersprungen (300) | **1** | `npm run gate:test` |
| Codingmon-Tests | 29 bestanden, **0** rot, 3 übersprungen (32) | 0 | `npm run test:codingmon` |
| Marker-Tests | 20 bestanden, 0 rot | 0 | `node --test scripts/gate/tests/markers.test.mjs` |
| Events-Spine-Tests | 26 bestanden, 0 rot | 0 | `node --test scripts/gate/tests/events-spine.test.mjs` |
| Panel-Beleg gegen die laufende UI | 7 bestanden, **0** fehlgeschlagen | 0 | `node scripts/panel-check.mjs --url http://127.0.0.1:3085 --token <token>` |
| Volle Kette | alle Suiten grün (29 → 98 → 9 → 76 → 3) | 0 | `npm test` |

**Volle Kette:** `npm test` führt Codingmon-Tests → Gate → Fixtures → Distribution →
Profil in dieser Reihenfolge aus (`package.json`) und lief in diesem Durchlauf
vollständig durch (Exit 0) — damit läuft auch `dsh-profile-test` innerhalb von
`npm test` mit.

### 2.1 Repariert in diesem Durchlauf (jeweils mit Vorher/Nachher-Messung)

| Befund | vorher | nachher | Beleg |
|---|---|---|---|
| `profiles/shinon/cordis.patch.yml`: `config:MAX` statt `config:` — die Datei war **kein gültiges YAML**, das Profil lud nicht | Gate `97 bestanden, 1 fehlgeschlagen`, Exit 1 | Gate `98 bestanden, 0 fehlgeschlagen`, Exit 0 | `node scripts/dsh-test.mjs` |
| [packages/shinon-forge](packages/shinon-forge) `index.js`: Ketten wie `.default(false).describe(...)` und `.optional()` — die deklarierte Schemastery-Fassung (`3.18.4`, §1) hat `description` statt `describe`, `required(false)` statt `optional`, und `default(...)` beendet die Kette | Distributionstest `75 bestanden, 1 fehlgeschlagen`, Exit 1 (`TypeError: z.boolean(...).default(...).describe is not a function`) | `76 bestanden, 0 fehlgeschlagen`, Exit 0 | `node scripts/pack-test.mjs` |
| [packages/core/client.js](packages/core/client.js): die WebP lag im Paket, wurde aber per `document.baseURI` adressiert — DSH liefert Plugin-Ressourcen aber nur unter `/plugins/<id>/client*.js` (`@deepseek-ai/dsh-client-modules`, `CLIENT_CHUNK`) | Browser: `GET /assets/persona.webp → 404`, `naturalWidth 0` | WebP als data-URI im self-contained Bundle: `naturalWidth 260 × 460`, kein 404 in der Netzwerkliste | Chromium gegen `dsh --profile shinon` + `node scripts/panel-check.mjs` |
| `key-router`, `narrative`, `shinon-forge` waren `git status`-untracked, standen aber im Root-`devDependencies`-Anspruch nicht — und fehlten dort wirklich | `doctor`: 4 Befunde (3× fehlende `devDependencies`, Drift) | eingecheckt; `doctor`: **1** Befund (nur Drift, §3.1) | `git status --porcelain`, `npm run gate:full` |
| Doku-Pfade auf das alte Verzeichnis packages/shion-forge (fünf Stellen) und auf die geplante, nicht existierende Datei starter/README.md (zwei Stellen) | Prüfbefehl aus `Docs/INDEX.md` §4: 2 defekt | 0 defekt | Prüfbefehl in `Docs/INDEX.md` §4 |

## 3. Rote Befunde (in diesem Durchlauf gemessen, **nicht** repariert)

1. **`doctor` (in `gate:full`)**: Versions-Drift über Pakete — `1.0.0`×16, `0.1.0`×3
   ([packages/key-router](packages/key-router),
   [packages/narrative](packages/narrative),
   [packages/shinon-forge](packages/shinon-forge), Zahlen in §1). Das Gate erlaubt den
   Drift, meldet ihn aber; deshalb ist `gate:full` nicht „grün“. Die drei Pakete sind als
   bewusst-inaktiv geführt (`scripts/gate/plugins/dead-package.mjs`) — der Grund für den
   eigenen Versionsstand ist nirgends verzeichnet.
2. **Gate-Tests (2 rot in `npm run gate:test`)**:
   - Test 3, `codingmon-store` („die Host-Hälfte öffnet den Spiegel selbst und gibt ihn
     als Dienst heraus“): `@deepseek-ai/schemastery` ist im Repo-Root **nicht installiert**
     (`ERR_MODULE_NOT_FOUND` aus [packages/codingmon/index.js](packages/codingmon/index.js)) —
     der Test wird rot, statt sichtbar zu überspringen.
   - Test 143, `message-ingress` („der Vertrag gilt für die geprüfte Fassung, nicht für
     jede“): installiertes DSH `0.2.0-rc.2` ≠ geprüfte Fassung `0.2.1-alpha.1` (Pin im
     Root-Manifest). Der Test **verweigert** die Zusage, statt sie stillschweigend gegen
     eine ungeprüfte Fassung weiterzuführen — das ist sein Zweck.

## 4. In diesem Durchlauf **nicht** geprüft (kein Exit-0-Beleg vorhanden)

- Echter Modell-Aufruf (braucht `SHINON_API_KEY`): nicht ausgeführt.
- `npm run verify:panel` **Stufe 3** (Rendering von `dist/packages/markers/client.js` in
  jsdom) braucht `jsdom`, `react`, `react-dom` aus einem fremden `node_modules`; hier nicht
  ausführbar. Stufe 1 + 2 dieses Skripts liefen dagegen gegen die laufende UI und sind in
  §2 belegt.
- Ob die drei inaktiven Pakete (`key-router`, `narrative`, `shinon-forge`) ins Profil
  sollen, wurde hier **nicht** entschieden.
- `npm run build` wurde in diesem Durchlauf nicht ausgeführt; `dist/packages/` enthält 19
  Paketkopien (`ls dist/packages | wc -l`).

Ältere Belege (Proben, Verträge) tragen ihr eigenes Datum und stehen unter
`Docs/probes/` bzw. `Docs/contracts/` — sie sind **keine** Quelle für aktuelle Zahlen.
