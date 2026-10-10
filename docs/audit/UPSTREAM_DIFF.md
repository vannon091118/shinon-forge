# UPSTREAM_DIFF — alpha.1 vs. alpha.2 an den Overlay-Andockstellen

> **Status:** current — Phase-P-Nachweis (P2). **Stand:** 2026-10-10
> **Einstieg:** `docs/INDEX.md` · **Zahlen:** `docs/ZAHLEN.md`

**Zweck:** Dieses Dokument ist der Nachweis für **P2** des Umbauplans. Es vergleicht die
beiden DSH-Tags an genau den Stellen, an die sich Shinons MVP-UI andockt, und benennt
ausdrücklich, was **OFFEN** bleibt.

**Methode (in diesem Durchlauf ausgeführt):** je Tag und Verzeichnis ein Abruf der
GitHub-Contents-API (`api.github.com/repos/deepseek-ai/deepseek-harness/contents/<pfad>?ref=<tag>`),
jeder Abruf mit **HTTP 200**. Verglichen werden **`sha`** und **`size`** jeder
Verzeichnisposition. Ein gleicher `sha` bei gleichem Pfad heißt: identischer Blob.
Alle Ergebnisangaben unten sind Ablesungen aus genau diesen Abrufen.

---

## 1. Tags

| Tag | Rolle | Commit-ID |
|---|---|---|
| `dsh-v0.2.1-alpha.1` | bisheriger Repo-Pin (lokal installiert) | **UNGEPRÜFT** |
| `dsh-v0.2.1-alpha.2` | Zielbasis laut Entscheidung A2 | **UNGEPRÜFT** |

Die Commit-IDs der Tags wurden in diesem Durchlauf **nicht** lokal verifiziert (kein
Upstream-Klon angelegt). Genannt wurde in der Vorrecherche `5badb15…` (alpha.1) und
`d743267…` (alpha.2); diese Angaben sind **nicht** durch einen eigenen Befehl belegt und
werden hier nicht als Befund geführt. Für die Andockstellen ist das ohne Belang: dort
zählt der Blob-Vergleich unten.

## 2. `deepseek-ai/deepseek-harness/packages/client/ui-theme` — **geändert**

`…/contents/packages/client/ui-theme/src?ref=<tag>`

| Position | alpha.1 `sha` | alpha.1 `size` | alpha.2 `sha` | alpha.2 `size` | Verdikt |
|---|---|---|---|---|---|
| `boot-theme.ts` | `5eb180bd80804d2b720f0a872fa96d3aa7fd3eb9` | 2446 | `fa7f1c281e8aaef1ec666d652a4a7bf3c66e21b7` | 3183 | **geändert** |
| `index.ts` | `0b9b2c05ff6e4764984fe770198070761f1e3639` | 1805 | `bbc037ef8e8206da0d2dac4c548d0e11d805d3bf` | 2753 | **geändert** |
| `theme-settings.ts` | `d00af8e9cf53650edf55ed69e57242323e365bdc` | 2133 | `af7d1d22b61f1d18286b8a17b12185eb4d910ef9` | 7391 | **geändert** |
| `client/` (Verzeichnis) | `3a9e03714638ed0fa20e686ac86cefbb6307be45` | 0 | `da0052a28c8181c2b12058e55ee8db151ebac171` | 0 | **geändert** |
| `styles/` (Verzeichnis) | `7160c563db4928f61d2062826f1d8ed04a4ff92b` | 0 | `2e2a302273c16c76b75b7cd34e73b55624acab2f` | 0 | **geändert** |
| `css-modules.d.ts` | `e0bddc152857ef632eb06f69707909364e780638` | 199 | `e0bddc152857ef632eb06f69707909364e780638` | 199 | gleich |

**Größenordnung:** `theme-settings.ts` wächst von 2133 auf 7391 Byte (**×3,5**),
`boot-theme.ts` von 2446 auf 3183 Byte. Die Datei `theme-settings.ts` trägt die
Einstellungen des Themes, `boot-theme.ts` wendet sie vor den Plugins an. Der Zuwachs
ist damit genau an der Stelle, an der ein Token-Overlay andockt.

### 2.1 `ui-theme/src/client/` — neue Dateien

Beide Abrufe endeten **abgeschnitten**; vollständig vergleichbar ist nur der jeweils
sichtbare alphabetische Präfix.

| Position | alpha.1 | alpha.2 | Verdikt |
|---|---|---|---|
| `AppearanceRow.module.css` | `8f5da5985aa21ff29c6211cfcb00dfa046139415` (1460) | `8f5da5985aa21ff29c6211cfcb00dfa046139415` (1460) | gleich |
| `AppearanceRow.tsx` | `d234bd81a5ccacba9fdfc7b629a3b60594d9d94d` (2582) | `d234bd81a5ccacba9fdfc7b629a3b60594d9d94d` (2582) | gleich |
| `FontFamilyRow.module.css` | an dieser alphabetischen Position **nicht vorhanden** | `c3ca4ff66ec5926d2594e736d9b641875e584b78` (205) | **neu in alpha.2** |
| `FontFamilyRow.tsx` | an dieser Position **nicht vorhanden** | `b14b9af0344b107dc970e8ca594821682b1d5e09` (2701) | **neu in alpha.2** |
| `FontSettingsGroup.module.css` | an dieser Position **nicht vorhanden** | `ee28b4ed6718bbee9812f524874315157f3c2bfb` (333) | **neu in alpha.2** |
| `FontSettingsGroup.tsx` | an dieser Position **nicht vorhanden** | vorhanden (Eintrag im Abruf angeschnitten) | **neu in alpha.2** |
| `FontSizeRow.module.css` | `f3e66754ef086259608aa252bc97a8ff5a6728e1` (2568) | im alpha.2-Abruf **nicht mehr sichtbar** (Abruf endet vorher) | **UNGEPRÜFT** |
| `FontSizeRow.tsx` | `5754ae7ad92c5c3755e6d2600086689ddfbf9dce` (2904) | im alpha.2-Abruf **nicht mehr sichtbar** | **UNGEPRÜFT** |
| Rest des Verzeichnisses | — | — | **UNGEPRÜFT** (beide Abrufe abgeschnitten) |

Die Einordnung „neu in alpha.2" ist **gemessen**, nicht angenommen: die API listet
alphabetisch, und der alpha.1-Abruf zeigt vor `FontSizeRow.module.css` unmittelbar
`AppearanceRow.tsx` — die Position, an der `FontFamilyRow.*` und `FontSettingsGroup.*`
stünden. Dass sie dort fehlen, ist damit belegt.

## 3. `deepseek-ai/deepseek-harness/packages/client/locale` — **im geprüften Teil unverändert**

`…/contents/packages/client/locale/src?ref=<tag>`

| Position | alpha.1 | alpha.2 | Verdikt |
|---|---|---|---|
| `client/` (Verzeichnis) | `43ce3a7cb5e9c6cda04c368e0026cd8cb570d8b3` | `43ce3a7cb5e9c6cda04c368e0026cd8cb570d8b3` | gleich |
| `css-modules.d.ts` | `bc5e482353ccdad2cac56977c6880a9453324cd6` (123) | `bc5e482353ccdad2cac56977c6880a9453324cd6` (123) | gleich |
| `index.ts` | `2ab8ee295fe52c11064ee21f1979c92e9f2dea26` (1171) | `2ab8ee295fe52c11064ee21f1979c92e9f2dea26` (1171) | gleich |
| `locale-settings.ts`, `locales/` | — | — | **UNGEPRÜFT** (beide Abrufe abgeschnitten) |

**Aussagekraft:** Belegt ist „unverändert" für die drei **sichtbaren** Positionen
einschließlich des gesamten Unterverzeichnisses `client/` (über dessen Verzeichnis-`sha`).
**Nicht** belegt ist Unverändertheit für die abgeschnittenen Positionen.

## 4. `deepseek-ai/deepseek-harness/packages/client/ui-brand-official` — **vollständig geprüft, unverändert**

`…/contents/packages/client/ui-brand-official/src?ref=<tag>` — dieser Abruf war **nicht**
abgeschnitten; die Liste hat genau zwei Einträge.

| Position | alpha.1 | alpha.2 | Verdikt |
|---|---|---|---|
| `client/` (Verzeichnis) | `0d17e3c9f331f66804fc8d812fd56fc2776248fe` | `0d17e3c9f331f66804fc8d812fd56fc2776248fe` | gleich |
| `index.ts` | `df38f3cfa54aacccd6ca43b564dcb3a995a35b9d` (275) | `df38f3cfa54aacccd6ca43b564dcb3a995a35b9d` (275) | gleich |

Das ist der **stärkste** Teilbefund dieses Dokuments: die Marken-Seam-Quelle ist
zwischen den Tags byte-identisch, einschließlich des ganzen `client/`-Teilbaums.

## 5. Slot-Definitionen

### 5.1 Was lokal gemessen ist (dieses Repo, `git grep` über `packages/`)

Die Shinon-Pakete belegen sieben Slot-IDs:

| Slot-ID | Vorkommen | Besetzer |
|---|---|---|
| `sidebar.panellist` | 10 | `codingmon`, `dashboard`, `markers`, `popup` |
| `conversation.composer.dock` | 7 | `core`, `codingmon` (`shinon-forge` nur als Kommentar) |
| `sidebar.footer.action` | 3 | `token-usage` |
| `sidebar.brand.mark` | 2 | `core` |
| `sidebar.brand.name` | 2 | `core` |
| `shell.overlay` | 2 | `core` |
| `conversation.hero.brand.mark` | 2 | `core` |

`packages/core/client.js` registriert in einem Zug `sidebar.brand.mark`,
`sidebar.brand.name`, `conversation.hero.brand.mark`, `conversation.composer.dock` und
`shell.overlay` (Zeilen 307–329). Der Marken-Slot wird also bereits aus dem Repo
besetzt; das Profil deaktiviert dafür `ui-brand-official` (`profiles/shinon/cordis.patch.yml`,
Abschnitt `- id: ui-brand-official / disabled: true`).

Wichtig für die Migration auf alpha.2: **keiner** dieser Slots liegt in den drei oben
verglichenen Paketen. Ihre Definition liegt upstream in den UI-Paketen
(`ui-sidebar`, `ui-conversation`, `ui-layout`, …), die hier **nicht** abgerufen wurden.

### 5.2 OFFEN — die drei Punkte aus dem Plan

Diese drei Punkte sind laut Plan vor einer Festlegung zu klären und bleiben hier
ausdrücklich **OFFEN**:

1. **`conversation.hero.brand.mark` — OFFEN.** Nicht verifiziert ist, ob dieser Slot im
   Upstream-Tag `dsh-v0.2.1-alpha.2` existiert, wie er definiert ist und wer ihn
   rendert. Lokal belegt ist nur, dass Shinons `core` ihn besetzt. Der Abruf der
   Upstream-Slot-Definitionen wurde in Phase P **nicht** ausgeführt.
2. **Launcher-only-Patch-Behauptung — OFFEN.** Die im Repo geführte Notiz
   (`docs/contracts/markers.json`) behauptet, ein Patch-Overlay wirke nur als
   **Launcher-Option** (`dsh --profile shinon --patch <datei>`) und nicht als
   Web-App-Argument. Das ist in diesem Durchlauf **weder** widerlegt **noch** bestätigt:
   kein `dsh`-Lauf ausgeführt, keine Upstream-Quelle dafür geprüft.
3. **Remote-Listen-Extensibilität — OFFEN.** Ob die Client-Liste in
   `@deepseek-ai/dsh-api-remotes` statisch einkompiliert ist und ob ein Out-of-Tree-Bundle
   sich dort eintragen kann, ist **nicht** verifiziert. Betrifft die Gamification-Naht
   (Codemon) und damit Phase 6.

## 6. Wirkung auf den Plan

| Andockstelle | Befund | Konsequenz |
|---|---|---|
| Theme-Tokens (`ui-theme`) | **geändert**, deutlich größer | Das Token-Overlay bindet gegen den **alpha.2**-Stand. Die genaue Signatur-/Variablenänderung ist **UNGEPRÜFT** — vor Schritt 3.8 am Quelltext zu lesen, nicht aus diesen Bytes zu schließen. |
| Marke (`ui-brand-official`) | **unverändert** (vollständig geprüft) | Der Plan, dieses Paket zu deaktivieren und die Marke über Slots zu setzen, wird durch den Diff **nicht** berührt. |
| Sprache (`locale`) | im geprüften Teil **unverändert** | Deutsch bleibt bei `locale-de`; kein Upstream-`de` erwartet. Restpositionen UNGEPRÜFT. |
| Slots | Definitionen **nicht geprüft** | Stoppbedingung des Briefings („Slots verschwunden") ist **nicht** eingetreten und **nicht** ausgeschlossen — sie ist offen. Vor Schritt 3.8 sind die Definitionen der sieben Slots im alpha.2-Baum zu lesen. |

Die Entscheidung **A2 (alpha.2 als Basis)** bleibt aufrecht: die einzige Änderung an
einer Andockstelle (Theme) ist eine **Erweiterung**, kein Entfall, und die
Marken-Seam-Quelle ist byte-identisch.

## 7. UNGEPRÜFT in diesem Dokument

- Commit-IDs der Tags (§1).
- Vollständiger Verzeichnisinhalt von `ui-theme/src/client/` und `locale/src/`
  (beide Abrufe abgeschnitten; §2.1, §3).
- Upstream-**Definitionen** der sieben Slot-IDs (§5.2).
- Ob Upstream ein deutsches Locale liefert — hier nicht geprüft.
- Ob und wie `theme-settings.ts` seine Variablen setzt (§6: am Quelltext zu lesen).
- Kein lokaler Klon, kein `git diff`, kein Build: alle Aussagen beruhen auf den
  Blob-Vergleichen der Contents-API, nicht auf einem lokalen Checkout der Tags.
