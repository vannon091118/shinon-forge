# SETUP — Installation, Profile, Schlüssel, Diagnose

> **Status:** current · **Stand:** 2026-10-20
>
> Der eingefrorene v0.4.0-Abnahmeweg ist der **Quellklon**. Was belegt ist,
> steht in [`ZAHLEN.md`](ZAHLEN.md) §2; was noch nicht belegt ist, in §4.
> Offene Arbeit (weitere Installationswege, `.deb`, Autoupdate):
> [`ROADMAP.md`](ROADMAP.md) §1.5.

## 1. Voraussetzungen

- **Node `^22.19.0 || >=24.0.0`** (`engines` in `package.json`; die Fassung
  des Baums steht in [`ZAHLEN.md`](ZAHLEN.md) §1). `bin/shinon.mjs` heilt
  eine zu alte Node-Version selbst und startet erneut, wenn eine passende
  gefunden wird.
- **npm** ist die einzige Paketquelle (`npm ci` aus dem Lockfile). Kein pnpm,
  kein Yarn — ein `pnpm-workspace.yaml` führt dieses Repo nicht.
- Ein **Modellschlüssel** für mindestens eine Route (siehe §4) — ohne
  gesetzte Variable schlägt der Headless-Aufruf fail-closed fehl
  (beabsichtigt).

## 2. Frischklon (der belegte Weg)

```bash
git clone https://github.com/vannon091118/shinon-forge.git
cd shinon-forge
npm ci                # Wurzel-Abhängigkeiten aus dem Lockfile
npm run profile:links # Profil-Links setzen (idempotent; --check zum Prüfen)
npm run dev           # Web-UI starten (Kurzform des Boots)
```

Warum Schritt 3 existiert: `profiles/shinon` bindet seine Bundles per
`link:`; npm lehnt das außerhalb des Root-Workspace-Modells ab
(`EUNSUPPORTEDPROTOCOL`). `scripts/profile-links.mjs` setzt genau diese Links
und verweigert Fremdpfade mit Exit 2.

Wer den Boot ohne npm-Script will (wie im README-Quickstart):

```bash
DSH_HOME=$PWD ./node_modules/.bin/dsh --profile shinon --dump-config  # Profil prüfen
DSH_HOME=$PWD ./node_modules/.bin/dsh --profile shinon                # booten
```

> Der `DSH_HOME=$PWD`-Form oben steht dort als Prüfform für den Frischklon.
> Der Dauerbetrieb über `bin/shinon.mjs` (§3) legt das Home dagegen
> **außerhalb** des Repos an — das ist kein Widerspruch, sondern der
> Unterschied zwischen Profilprüfung und Betrieb.

## 3. `DSH_HOME` — wo der Zustand wohnt

DSH liest `$DSH_HOME/AGENTS.md` als **benutzerglobale** Anweisung in jeder
Sitzung. Mit dem Repo als Home wäre das Repo-`AGENTS.md` zur globalen
Anweisung fremder Projekte geworden. Deshalb legt `bin/shinon.mjs` das Home
in den Zustandsordner (`dev-dsh-home`, im Installat `dsh-home`) und verlinkt
hinein, was zusammengehört: `profiles/`, `sessions/`, `logs/`, `.env`,
`.credentials.yaml`. Die Anweisungsdatei bleibt draußen und wird nur als
Projektanweisung geladen, wenn die Sitzung in diesem Repo läuft.

Regeln, wenn du das Home **selbst** setzt:

- absolut setzen (`DSH_HOME=/pfad`) — ein relativer Wert wird abgelehnt;
- ein fremder Link im Home wird gemeldet, **nie** überschrieben;
- ein Schlüssel gehört **nie** ins Repo.

## 4. Schlüssel und Modellrouten

Das Profil nennt nur den **Referenznamen** (`apiKeyEnv`), das Secret kommt
aus der Umgebung (echte Werte in die ungetrackte `.env`; Vorlage:
[`.env.example`](../.env.example)):

| Variable | Wofür |
|---|---|
| `SHINON_API_KEY` | Standardroute der Profile `headless`/`shinon` |
| `AGNES_API_KEY` | Route `agnes` (`profiles/mobile`, Prompter-Fallback) — empfohlene kostenlose Route des Repos |
| `PROMPTER_API_KEY` | eigene One-Shot-Route des Prompters |
| `DEEPSEEK_API_KEY` | Pool-Einstieg des Key-Routers |
| `NVIDIA_API_KEY`, `GROQ_API_KEY`, `CEREBRAS_API_KEY`, `GOOGLE_API_KEY`, `MISTRAL_API_KEY`, `TOGETHER_API_KEY`, `HUGINGFACE_API_KEY` | Anbieter des „Anbieter-Shinon"-Profils |

Nur Namen, keine Werte. Beispiel für den One-Shot:

```bash
export SHINON_API_KEY="…"
node bin/shinon.mjs --profile headless "Sag nur: OK"
```

**Wichtig — `MISSING_CREDENTIAL`:** In der Web-UI entscheidet die bewusst
gewählte Modellroute, welcher Schlüssel gebraucht wird. Ein Schlüssel für
die Agnes-Standardroute ersetzt `DEEPSEEK_API_KEY` **nicht**, wenn du
gezielt eine DeepSeek-Route wählst. Fehlt die Referenz, nennt
`MISSING_CREDENTIAL` aktive Route und fehlende Variable. Dann: genau dieses
Credential konfigurieren — oder die Route zurückwählen. **Nicht** von einem
automatischen Wechsel zur Standardroute ausgehen. Ob eine Route in deiner
Umgebung antwortet, hängt an deinem Schlüssel und ist kein Teil der
belegten Zusagen des Repos.

Welches Modell läuft, entscheidet allein das Profil
(`profiles/*/cordis.patch.yml`) — Pakete führen keinen Modellnamen.

## 5. Diagnose und Startprüfungen

| Befehl | Was er tut |
|---|---|
| `node bin/shinon.mjs doctor` (oder `node scripts/doctor.mjs`) | read-only Diagnose: Node, DSH-Herkunft, Home, Schlüssel nur als **Anwesenheit**; stabile Codes 0/1/2 |
| `node bin/shinon.mjs --check` | prüft nur die Startfähigkeit, ohne zu starten |
| `npm run verify:install` | read-only Selbsttest eines bestehenden Installats: Check → Doctor → Boot → HTTP-Nachweis (Exit 0 nur bei 4/4) |
| `npm run stages` | Startstufen/Ready-Zeile aus `scripts/open.mjs` nachvollziehen |

Das statische Gate `doctor` (`scripts/gate/plugins/doctor.mjs`) prüft
daneben die Repo-Konsistenz — nicht den laufenden Rechner.

## 6. Pins

- Der Pin steht zweimal: `package.json` (Dependencies) und
  `scripts/dsh-target-versions.json` (kanonische Zielversion).
  `npm run check:dsh-versions` vergleicht beide; `npm run update` ist der
  **DSH-Upstream**-Updater und aktualisiert **nicht** Shinon Forge selbst.

## 7. Werkzeuge für Betreiber

| Befehl | Zweck |
|---|---|
| `npm run install:user` | Nutzer-Installation mit Abnahme: `install`/`update`/`rollback`/`status`/`history`/`auto`/`units`/`selftest`/`uninstall` |
| `npm run uninstall:user` | Rückweg: Timer und Desktop-Verknüpfung weg, Zugangsdateien in einen Tresor (0600); `--purge` löscht sie, `--keep-checkout` lässt den Baum stehen. Die nächste Installation setzt den Tresor zurück und überschreibt nie einen neueren Stand (`scripts/lib/secrets.mjs`) |
| `npm run backup:retention` | Aufbewahrung des Sicherungsordners (`--keep`, `--max-age`, `--dry-run`, `--json`; jede Anwendung wird protokolliert) |
| `npm run desktop:launcher` | Desktop-Starter (Konzept, Stand: [`ROADMAP.md`](ROADMAP.md) §2.3) |

Nicht v0.4.0-Umfang (also Folgearbeit, siehe ROADMAP): `shinon update`,
persistentes `shinon autoupdate`, `.deb` als unterstützter
Release-Installationsweg.

## 8. Profile im Alltag

```bash
npm run dev            # kanonisches Profil, Web-UI
npm run dev:web        # nur localhost/127.0.0.1 als trusted hosts, Port 3085
npm run dev:mobile     # Mobile-Profil, URL ausgeben (--print-url)
npm run open           # vorhandene Instanz öffnen (scripts/open.mjs)
```

Headless (One-Shot, kein Browser):

```bash
SHINON_API_KEY="…" node bin/shinon.mjs --profile headless "Sag nur: OK"
```

## 9. Abnahme eines echten Modell-Turns (S6)

Die Abnahme braucht einen echten Schlüssel; kein Test ersetzt ihn. Der Lauf
ist reproduzierbar, und jeder Schritt nennt seinen Beleg:

1. **Route und Schlüsselname lesen** — beides kommt aus dem effektiven Profil,
   nicht aus diesem Dokument:

   ```bash
   npm run s6:check
   ```

   Die Zeile `key:` nennt die Variable, die Zeile `route:` Provider und Modell.
   Den Wert trägst du selbst in die ungetrackte `.env` (chmod 600) ein — nie in
   den Baum, nie in ein Log, nie in eine Antwort; Vorlage ist
   [`.env.example`](../.env.example).
2. **Preflight** — derselbe Befehl endet mit `Preflight grün — boot ist bereit`
   (Exit 0). Rot oder ungeprüft ist Exit 2: kein Start.
3. **Boot** — `npm run s6:boot` startet den Host auf Port 3099 und nennt die
   PID-Datei; Protokoll und PID-Datei liegen unter `<Zustand>/logs/s6/`.
4. **Turn in der echten UI** (`http://localhost:3099`): Sitzung anlegen, eine
   echte Frage stellen, die Antwort abwarten. Das ist der Modellaufruf — kein
   Übungszug.
5. **Urteil** — „Good response“ → Kategorie „Task result“ → „Submit“.
6. **Widerruf** — derselbe Knopf, jetzt „Remove rating“: die Zeile muss wieder
   weg sein.
7. **Host-Ende** — `npm run s6:stop` (SIGTERM an die gelogte PID).
8. **Neustart** — erneut `npm run s6:boot`; der Host lädt den Stand und meldet
   `[shinon-scoring] Stand geladen: …`.

Bestanden ist die Abnahme nur, wenn (a) eine echte Modellantwort vorliegt,
(b) das Urteil als Zeile erscheint, (c) der Widerruf genau diese Zeile
entfernt, (d) der Host sauber endet und (e) der nächste Host den Stand lädt.
Ein grüner Preflight allein ist kein Turn. Der gemessene Erstlauf mit allen
Zahlen steht in [ZAHLEN.md](ZAHLEN.md) §2 und
[probes/store-cost.json](probes/store-cost.json) — hier stehen nur die Schritte.

## 10. Häufige Stolpersteine

| Symptom | Ursache |
|---|---|
| `EUNSUPPORTEDPROTOCOL` bei `npm ci`/`npm install` | `profile:links` lief noch nicht — Bundles sind `link:`-Verweise |
| `MISSING_CREDENTIAL` | Route gewählt, deren `apiKeyEnv` nicht gesetzt ist (§4) — kein Auto-Fallback |
| Profil löst nicht auf / Bundles fehlen | Links stale; `node scripts/profile-links.mjs --check`, dann `npm run profile:links` |
| Fremdes `dsh` im PATH | Der Einstieg löst Repo-Installat → vendor → PATH und **nennt die Herkunft**; ein global installiertes `dsh` ist nicht der getestete Weg |
| Alte Node-Version | `bin/shinon.mjs` heilt selbst; andernfalls Node 22.19+/24+ |
| relativer `DSH_HOME` | wird abgelehnt — absolut setzen (§3) |
