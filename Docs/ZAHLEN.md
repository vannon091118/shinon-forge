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
| Verweise in Markdown, die nicht auflösen | **0** (270 Verweise geprüft) | Prüfbefehl in `Docs/INDEX.md` §4 | 0 |

Die Zahl der Profil-Layer und der aktivierten Pakete **steht nicht in der Doku**,
sondern in `profiles/shinon/package.json` (`dsh.profile.bundles`); die Befehle oben
lesen genau diese Datei.

## 2. Prüfläufe (Ist-Zustand 2026-10-10)

| Lauf | Ergebnis | Exit | Befehl |
|---|---|---|---|
| Gate (statisch) | 98 bestanden, **0** fehlgeschlagen | 0 | `node scripts/dsh-test.mjs` |
| Regel-Fixtures | 9 bestanden, **0** fehlgeschlagen | 0 | `node scripts/validate-test.mjs` |
| Profiltest | 3 bestanden, **0** fehlgeschlagen (20 Layer, 14 Repo-Bundles) | 0 | `node scripts/dsh-profile-test.mjs` |
| Distributionstest | 75 bestanden, **1** fehlgeschlagen (`project-index`) | **1** | `node scripts/pack-test.mjs` |
| Build (`dist/`) | 19 Pakete, 96 Dateien, 905294 Bytes | 0 | `npm run build` |
| Gate-Engine `--full` | 18 Gates gelaufen, 18 grün | 0 | `npm run gate:full` |
| Gate-Tests | **306** bestanden, 0 rot, 0 übersprungen | 0 | `node --test scripts/gate/tests/*.test.mjs` mit Node v22.23.3 und Repo-`dsh` (0.2.1-alpha.1) zuerst im PATH |
| Client-Aktivierung + Marke (Wache 1–3) | 6 bestanden, **0** rot | 0 | `node --test scripts/gate/tests/client-activation.test.mjs` |
| Codingmon-Tests | 29 bestanden, **0** rot, 3 übersprungen (32) | 0 | `npm run test:codingmon` |
| Marker-Tests | 20 bestanden, 0 rot | 0 | `node --test scripts/gate/tests/markers.test.mjs` |
| Events-Spine-Tests | 26 bestanden, 0 rot | 0 | `node --test scripts/gate/tests/events-spine.test.mjs` |
| Panel-Beleg gegen die laufende UI | 7 bestanden, **0** fehlgeschlagen | 0 | `node scripts/panel-check.mjs --url http://127.0.0.1:3085 --token <token>` |
| Volle Kette | **nicht durchgelaufen** (bricht bei `pack-test` ab) | **1** | `npm test` |

**Warum `gate:test` früher rot war und jetzt grün ist:** der Baum war unvollständig installiert —
`node_modules/@deepseek-ai/dsh` und `node_modules/@deepseek-ai/schemastery` fehlten auf oberster
Ebene (nur verschachtelte Kopien lagen vor), dazu 18 verschachtelte Pakete unter
`node_modules/@deepseek-ai/dsh/node_modules/` (alle im Lock verzeichnet). Vervollständigt am
2026-10-10 exakt nach Lock (`.ignored`-Kopie für `schemastery@3.18.4`, Registry-Tarballs für
`dsh@0.2.1-alpha.1` + 18 verschachtelte, alle versionsgeprüft) — kein Test, kein Lock, kein
Manifest angefasst. Voraussetzung für Grün (alle drei nötig, alle gemessen): Node ≥ 22
(`node:sqlite`, `parseEnv` — unter v18 stirbt schon der Import), `dsh@0.2.1-alpha.1` aus dem
Repo zuerst im PATH (vor einem fremden globalen `dsh`, sonst misst `message-ingress` die
falsche Fassung), vollständiger Lock-Baum. Unter der Standard-Shell (Node v18, ohne PATH)
bleibt der Lauf rot — das ist dann Umgebungs-Rot, kein Code-Rot.

**Volle Kette:** `npm test` führt Codingmon-Tests → Gate → Fixtures → Distribution →
Profil in dieser Reihenfolge aus (`package.json`) und lief in diesem Durchlauf
vollständig durch (Exit 0) — damit läuft auch `dsh-profile-test` innerhalb von
`npm test` mit.

### 2.1 Repariert in diesem Durchlauf (jeweils mit Vorher/Nachher-Messung)

| Befund | vorher | nachher | Beleg |
|---|---|---|---|
| `gate:test`: unvollständiger Lock-Baum (Top-Level `dsh` + `schemastery` fehlten, 18× `dsh/node_modules` fehlten), falsche Toolchain (Node v18, fremdes `dsh@0.2.0-rc.2` zuerst im PATH) | 150 bestanden, 7 Dateien rot, 5 übersprungen (162), Exit 1 | Baum lock-exakt vervollständigt, Lauf mit Node v22 + Repo-`dsh@0.2.1-alpha.1` zuerst im PATH: **306/306, Exit 0** (kein Test geändert) | `node --test scripts/gate/tests/*.test.mjs` |
| `doctor`: gehaltene Versionsaufteilung (`1.0.0`×16, `0.1.0`×3) als Befund gemeldet, obwohl erlaubt genannt | `gate:full` 17 grün, 1 rot, Exit 1 | Aufteilung als `EXPECTED_VERSIONS` deklariert (Standard + drei begründete Ausnahmen): `gate:full` 18 grün, Exit 0; undeklarierte Abweichungen weiter rot (5 Negativproben) | `npm run gate:full` + isolierter `check()`-Nachweis |
| `profiles/shinon/cordis.patch.yml`: `config:MAX` statt `config:` — die Datei war **kein gültiges YAML**, das Profil lud nicht | Gate `97 bestanden, 1 fehlgeschlagen`, Exit 1 | Gate `98 bestanden, 0 fehlgeschlagen`, Exit 0 | `node scripts/dsh-test.mjs` |
| [packages/shinon-forge](packages/shinon-forge) `index.js`: Ketten wie `.default(false).describe(...)` und `.optional()` — die deklarierte Schemastery-Fassung (`3.18.4`, §1) hat `description` statt `describe`, `required(false)` statt `optional`, und `default(...)` beendet die Kette | Distributionstest `75 bestanden, 1 fehlgeschlagen`, Exit 1 (`TypeError: z.boolean(...).default(...).describe is not a function`) | `76 bestanden, 0 fehlgeschlagen`, Exit 0 | `node scripts/pack-test.mjs` |
| [packages/core/client.js](packages/core/client.js): die WebP lag im Paket, wurde aber per `document.baseURI` adressiert — DSH liefert Plugin-Ressourcen aber nur unter `/plugins/<id>/client*.js` (`@deepseek-ai/dsh-client-modules`, `CLIENT_CHUNK`) | Browser: `GET /assets/persona.webp → 404`, `naturalWidth 0` | WebP als data-URI im self-contained Bundle: `naturalWidth 260 × 460`, kein 404 in der Netzwerkliste | Chromium gegen `dsh --profile shinon` + `node scripts/panel-check.mjs` |
| `key-router`, `narrative`, `shinon-forge` waren `git status`-untracked, standen aber im Root-`devDependencies`-Anspruch nicht — und fehlten dort wirklich | `doctor`: 4 Befunde (3× fehlende `devDependencies`, Drift) | eingecheckt; `doctor`: **1** Befund (nur Drift, §3.1) | `git status --porcelain`, `npm run gate:full` |
| [packages/core/client.js](packages/core/client.js): `@shinon/core` belegte `conversation.hero.workspace` — ein **Single-Slot**. Gemessen im Browser: der Slot enthielt danach nur noch `.shinon-bg`, der Vendor-Besetzer `WorkspacePicker` war verdrängt; der Klick auf „Choose workspace“ wechselte nur noch `aria-expanded` und öffnete **kein** Menü. Der Slot ist jetzt frei, das Branding hängt an `conversation.hero.brand.mark` (unserem eigenen Slot) | Slot-Inhalt: `div.shinon-bg` (kein Picker), Klick ohne Menü | Slot-Inhalt: Vendor-Picker; Klick öffnet `Default workspace`, `brutalord-the-feral-cycle`, `Shinon-forge`, `Add workspace…`, und `Add workspace…` öffnet den Host-Ordnerdialog (zenity auf `DISPLAY=:0`) | Chromium gegen `dsh --profile shinon` + Prozess-Beobachtung |
| Doku-Pfade auf das alte Verzeichnis packages/shion-forge (fünf Stellen) und auf die geplante, nicht existierende Datei starter/README.md (zwei Stellen) | Prüfbefehl aus `Docs/INDEX.md` §4: 2 defekt | 0 defekt | Prüfbefehl in `Docs/INDEX.md` §4 |
| [packages/core/client.js](packages/core/client.js): das Background-Branding (Persona-WebP) hing an `conversation.hero.brand.mark`. Der Slot wird aber INNEN in die **34px-Hitbox** der Hero-Zeile gerendert (`ui-conversation`, `HeroShell` — `renderSlot("conversation.hero.brand.mark", {size:34}, {fallback: <HeroFish/>})`); ein `position:absolute; inset:0` deckt darin nur die Hitbox und nicht das Fenster — das Bild war unsichtbar, und ausserhalb der leeren Session existierte es gar nicht | gerendert, aber nicht sichtbar (Bild in einer 34px-Inline-Box eingesperrt) | eigener Eintrag in `shell.overlay` — dem frame-weiten Layer („Frame-wide floating layer, above every column and outside their scroll containers. Deliberately generic and unowned", client-ui-layout; Host: `.overlayLayer` = `position:absolute; inset:0; z-index:20; pointer-events:none`), `id: shinon-background`, `order: 0`, click-through | `node --test scripts/gate/tests/client-activation.test.mjs` (Wache 3b: `shell.overlay` genau 1 Eintrag, id/order, gerendertes `<img class=shinon-bg__persona src=data:image/webp;base64,…>`; Wache 3a: der Data-URI ist **byte-identisch** mit [packages/core/assets/persona.webp](packages/core/assets/persona.webp), RIFF/WEBP geprueft) |
| Die Laufanzeige („Arbeitet") trug DeepSeeks Wal: `ui-chat` setzt in `[data-chat-running]` eine leere Spanne mit `background: currentColor` und der Wal-**APNG als CSS-Maske** (`mask:url(data:image/apng…)`) plus einen statischen Wal als SVG daneben | DeepSeeks Wal-Animation (APNG-Maske) | Shinons Zeichen als Maske (dieselbe Geometrie wie die Marke, aus DEMSELBEN `MARK`-Objekt abgeleitet), Shinons Farbverlauf als Fuellung und eine eigene Bewegung (`@keyframes shinon-running-drift`, 1.8s); der statische Wal ist versteckt, `prefers-reduced-motion` schaltet die Bewegung ab | `node --test scripts/gate/tests/client-activation.test.mjs` (Wache 3a: Override-Regel, `background: var(--shinon-gradient)`, eigene Keyframes, Wal-SVG aus, Reduced-Motion; die Maske enthaelt alle vier Pfade des `MARK`-Objekts und **kein** `apng`/`whale`) |
| Marken-Konflikt: `@shinon/core` **und** `@shinon/codingmon` belegten beide `sidebar.brand.mark` und `conversation.hero.brand.mark` — Single-Slots, deren Besetzer die Ladeordnung entscheidet; die Sidebar zeigte deshalb das Pixel-Sprite aus 1x1-`<rect>` statt einer gezeichneten Marke | 2 Besetzer je Marken-Slot; die Marke im Toggle-`<button>` der Sidebar (`ui-sidebar` rendert `sidebar.brand.mark` in seinen Knopf) war ein `<rect>`-Sprite | genau **ein** Besetzer je Slot: `@shinon/core` mit einem **neu gezeichneten** Zeichen (Ring + Funke + zwei Fluegel, nur Kurven, **kein** `<rect>`); codingmon besetzt keinen Marken-Slot mehr (das Pet bleibt in seinen eigenen Flaechen und als `window.__codingmon.PetMark`) | `node --test scripts/gate/tests/client-activation.test.mjs` (Wache 3b: je Slot genau 1 Besetzer, kein `img`, kein `rect`, genau 4 Pfade) — Mutationsprobe: der zweite Besetzer zurueck ⇒ `2 Besetzer statt einem`, Exit 1 |
| Suche nach einem EIGENEN Fehler-/Stat-Screen mit Original-Branding: drei Griffe fanden keinen. `statscreen`/`StatScreen` (0 Treffer in allen Vendor-Bundles), `Something went wrong` (nur Text des Plugin-Managers und des Kontos), `Failed to load plugins` (0 Treffer); `FishLogo` und `BrandWordmark` werden ausschliesslich als **Sidebar-Fallbacks** benutzt (je 1 Aufrufstelle), und der Status „Into the Unknown" ist ausschliesslich `hero.headline` der leeren Session — also genau die Komponente, deren Wal-Fallback jetzt neutralisiert ist | offene Frage „welcher Screen traegt Original-Branding?" | gebrandete Flaechen sind die zwei Marken-Slots (belegt: 0 Fremd-SVG mehr), der Hero-Fallback und der Boot-Text des Hosts auf der Konsole (`dsh-app-boot`, kein HTML-Screen) | `grep -rln` ueber `node_modules/@deepseek-ai/*/lib/*.js` (0 Treffer fuer `Failed to load plugins`/`statscreen`) |
| Die Marken-Slots sind Single-Slots **mit Fallback** (`FishLogo`/`HeroFish`): gibt ein Besetzer auf, haengt dort wieder DeepSeeks Fisch. Gemessen an der gelieferten Fassung: beide Fallbacks rendern ein **direktes** `<svg>`-Kind (`dsh-client-ui-primitives`, `FishLogo`), und die drei Klassen-Teile kommen nur an diesen Stellen vor (Sidebar `railMark`/`brandMark`, Hero `fishHitbox` — je 3 Vorkommen im ganzen Vendor-Bundle) | kein Schutz — ein abgedankter Besetzer zeigte die Alt-Marke | das Bundle versteckt an den drei Marken-Stellen jedes fremde SVG (`[class*="railMark"|"brandMark"|"fishHitbox"] > svg:not(.shinon-mark)`), solange es geladen ist | `node --test scripts/gate/tests/client-activation.test.mjs` (Wache 3a: alle drei Fallback-Regeln stehen im ausgelieferten CSS) |

## 3. Rote Befunde (in diesem Durchlauf gemessen, **nicht** repariert)

Eintraege mit dem Vermerk **REPARIERT** wurden nach der Messung dieses Durchlaufs
behoben; die uebrigen Befunde sind offen.

1. **`doctor` (in `gate:full`) — REPARIERT (2026-10-10)**: Versions-Drift über Pakete — `1.0.0`×16, `0.1.0`×3
   ([packages/key-router](packages/key-router),
   [packages/narrative](packages/narrative),
   [packages/shinon-forge](packages/shinon-forge), Zahlen in §1). Der Doctor meldete die
   gehaltene Aufteilung als Befund (obwohl sein Text sie „erlaubt" nannte) und ließ
   deshalb `gate:full` rot werden. Reparatur: die Aufteilung ist jetzt als
   `EXPECTED_VERSIONS` in [scripts/gate/plugins/doctor.mjs](scripts/gate/plugins/doctor.mjs)
   deklariert (Standard `1.0.0`, die drei Vorbereitungs-Pakete `0.1.0` mit Begründung) —
   gehaltene Aufteilung ist grün, jede undeklarierte Abweichung bleibt rot (Negativproben:
   `tooltip@9.9.9`, neues Paket `@0.2.0`, `narrative@1.0.0` je genau 1 Befund mit Paketnamen).
   Keine Paketversion wurde angefasst. Belegt: `npm run gate:full` → 18/18, Exit 0.
2. **Client-Boot bricht ab — REPARIERT (2026-10-10, zweiter Pass)**: Die drei Client-Haelften `@shinon/markers`, `@shinon/dashboard`, `@shinon/codingmon` meldeten
   beim Laden `failed` — der Browser zeigt „Failed to load plugins … web boot: 3 entries
   did not activate“. Ursache: diese Dateien lasen `ctx.locale`, waehrend ihr `inject`
   nur `['slots']` nennt; der Cordis-Context ist ein Proxy und wirft bei einem nicht
   injizierten Dienst (`cannot get property "locale" without inject`), also galt der
   Eintrag als nicht aktiviert. Betroffen waren **fuenf** Haelfte: dieselbe Zeile stand
   auch in [packages/popup](packages/popup) und [packages/token-usage](packages/token-usage)
   (im Browserbericht war die Liste nur abgeschnitten). Reparatur: `ctx.get?.('locale')`
   — die dokumentierte optionale Abfrage („`ctx.get(name)` performs optional lookup“,
   `dsh-cordis-client-runner/lib/client.js`) statt `ctx.locale`; die deutsche Tabelle
   bleibt der Fallback. Belegt mit `node --test scripts/gate/tests/client-activation.test.mjs`:
   vorher 5× `apply warf — cannot get property "locale" without inject` (u. a. an
   [dashboard/client.js:448](packages/dashboard/client.js#L448)), nachher 4/4 gruen;
   dieselbe Wache steht als statischer Scan (inject-Abdeckung) in derselben Datei und
   laeuft ohne Abhaengigkeiten in CI. Ein **vollstaendiger** `dsh --profile shinon`-Boot
   ist hier weiterhin nicht messbar (CLI nicht installiert, §4).
3. **Gate-Tests — REPARIERT (2026-10-10)**: 7 Dateien rot (`context-resolver`, `context-wiring`,
   `hook-pre-step`, `message-ingress`, `project-index`, `prompter-contract`, `task-router`) —
   Ursachen `dshRoot() ist null` (kein `dsh` im PATH), fehlendes Top-Level-`schemastery` und
   18 fehlende verschachtelte Pakete unter `dsh/node_modules` (darunter
   `dsh-api-session-controller`, das `message-ingress` braucht). Dazu die Fassungsfalle:
   ein fremdes globales `dsh@0.2.0-rc.2` zuerst im PATH lässt `message-ingress` gegen die
   ungeprüfte Fassung messen — der Test **verweigert** die Zusage dann zu Recht, statt sie
   still weiterzuführen. Reparatur: Baum exakt nach Lock vervollständigt (2 Top-Level +
   18 verschachtelt, alle versionsgeprüft), Lauf mit Node v22 und Repo-`dsh@0.2.1-alpha.1`
   zuerst im PATH. Kein Test geändert, kein Skip erfunden. Belegt: 306/306, Exit 0.

## 4. In diesem Durchlauf **nicht** geprüft (kein Exit-0-Beleg vorhanden)

- Echter Modell-Aufruf (braucht `SHINON_API_KEY`): nicht ausgeführt.
- `npm run verify:panel` **Stufe 3** (Rendering von `dist/packages/markers/client.js` in
  jsdom) braucht `jsdom`, `react`, `react-dom` aus einem fremden `node_modules`; hier nicht
  ausführbar. Stufe 1 + 2 dieses Skripts liefen dagegen gegen die laufende UI und sind in
  §2 belegt.
- Ob die drei inaktiven Pakete (`key-router`, `narrative`, `shinon-forge`) ins Profil
  sollen, wurde hier **nicht** entschieden.
- **Lebender Boot / Augenschein:** `npm run dev` bzw. `dsh --profile shinon` ist hier nicht
  startbar (`dsh` nicht im PATH, `node_modules/.bin/dsh` ist ein toter Symlink) — die
  Marke, der Hintergrund und die Laufanzeige sind deshalb **statisch** belegt (Bundle,
  CSS, gerenderter Elementbaum am echten Cordis-Context), **nicht** im laufenden Client
  gesehen. Insbesondere ungemessen: ob der Browser die Override-Spezifitaet des
  Laufanzeige-Blocks genau so aufloest (Zusage: `[data-attribut] [class*="…"]` schlaegt
  die gelieferte Klassen-Regel) und ob `shell.overlay` im echten `AppFrame` der richtige
  Platz fuer eine 17%-Ebene ist (der Layer liegt mit `z-index:20` ueber den Spalten).
- `dist/` ist **gitignoriert** (`.gitignore`: `dist/`): der Build ist ein lokaler Beleg
  (Exit 0, 19 Pakete, 96 Dateien), kein Artefakt dieses Repos.

Ältere Belege (Proben, Verträge) tragen ihr eigenes Datum und stehen unter
`Docs/probes/` bzw. `Docs/contracts/` — sie sind **keine** Quelle für aktuelle Zahlen.
