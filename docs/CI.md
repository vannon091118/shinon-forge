# CI — die eine Schranke und ihr Name

> **Status:** current — CI als Schranke: welche Zweige laufen, welcher Name verlangt werden muss. **Stand:** 2026-10-14
> **Einstieg:** `docs/INDEX.md` · **Zahlen:** `docs/ZAHLEN.md`

## 1. Der Punkt: EIN Name, den eine Branch-Regel verlangen kann

`.github/workflows/commit-guard.yml` läuft bei **jedem** `push` und `pull_request`
sowie auf Zuruf (`workflow_dispatch`) — ohne `paths`-Filter, ohne
`continue-on-error`. Neun Zweige tun die Arbeit:

| Job (id) | Anzeigename | Was er tut |
|---|---|---|
| `commit-guard` | Commit-Wächter (Footer + Trailer) | Der Bereichs-Wächter: kein KI-Footer, Vannon-Trailer (Regeln: `docs/COMMIT-REGELN.md`) |
| `unit` | (Matrix) | Die Paket-Tests (`npm test`-Kette ohne die Regel-Läufe) |
| `gate-rules` | Gate-Tests (Regeln, Verträge, Nähte) | `npm run gate:test` |
| `static-gate` | Statisches Gate (manifest, name contract, Profile) | `node scripts/shinon-test.mjs` |
| `fixtures` | Fixtures (Validierung gegen den echten Bau) | `node scripts/validate-test.mjs` |
| `distribution` | Distribution (npm pack → Isolat → Laden) | `node scripts/pack-test.mjs` |
| `profile` | Profilboot (dsh --profile shinon --dump-config) | `node scripts/shinon-profile-test.mjs` |
| `prompter` | Prompter (Zettel, Skill-Auswahl) | Die Prompter-Zusagen |
| `typescript` | TypeScript Gate (gepinnter Compiler + Quellüberdeckung) | `npm run typecheck` (heute `NOT_APPLICABLE`: es gibt keine First-Party-`.ts`-Datei — der Lauf validiert Compiler, Pin und `tsconfig`, statt zu schweigen) |
| **`verdict`** | **`Verdikt (fail-closed)`** | Der letzte Job: er liest `needs` und wird rot bei `failure`, `cancelled` **und** `skipped` |

**Warum der zehnte Job existiert:** eine Branch-Regel kann **einen** Namen
verlangen oder eine Liste — aber sie kann nicht „alle" verlangen. Ohne `verdict`
müsste der Schutz neun Namen kennen und bei jedem neuen Zweig erweitert werden;
mit `verdict` ist es ein Name, und ein vergessener neuer Zweig fällt auf, weil der
Job ihn nicht in `needs` hat.

**Warum `if: always()`:** ohne das würde `verdict` bei einem roten Zweig gar nicht
starten — und die Zusammenfassung wäre bei genau den Läufen stumm, für die sie
gebaut ist. Ein übersprungener Zweig ist kein grüner Zweig: `verdict` wertet
`skipped` wie `failure`.

## 2. Der verpflichtende Statuscheck für `main`

**Der Name, der einzugeben ist, lautet exakt:**

```text
Verdikt (fail-closed)
```

Das ist der Anzeigename des Jobs (`name:`), nicht die Job-id (`verdict`): GitHub
verlangt den Namen, den die Oberfläche zeigt. Die id steht in `needs:
[commit-guard, unit, gate-rules, static-gate, fixtures, distribution, profile,
prompter, typescript]`.

**Setzen (einmalig, mit Rechten am Repository — Handlung des Betreibers, nicht des
Arbeitsbaums).** Branch-Regeln sind eine Einstellung bei GitHub; sie liegen
**nicht** in diesem Repository und können deshalb von keinem Skript hier gesetzt
werden. Zwei Wege, gleicher Effekt:

```bash
# (a) Oberfläche: Settings → Branches → Branch protection rules → Add rule for `main`
#     → "Require status checks to pass before merging" → Suche: Verdikt (fail-closed)
#     → "Require branches to be up to date before merging" (empfohlen)

# (b) API (gh muss angemeldet sein und Schreibrecht haben):
gh api --method PUT "repos/{owner}/{repo}/branches/main/protection" \
  --field required_status_checks='{"strict":true,"contexts":["Verdikt (fail-closed)"]}' \
  --field enforce_admins=true \
  --field required_pull_request_reviews=null \
  --field restrictions=null
```

**Nachkontrolle** (der Befehl, der die Zusage prüft — ohne ihn ist es eine
Absicht):

```bash
gh api "repos/{owner}/{repo}/branches/main/protection" \
  --jq '.required_status_checks.contexts[]'
```

Erwartet: `Verdikt (fail-closed)`.

**GEMESSEN am 2026-10-13 (Durchgang zu `bf003a2`, Run `38474747771`, Beleg:
`docs/handshakes/2026-10-13-ci-lauf-gruen-verdict-schranke-und-sieben-luecken.md`):**
der Schutz ist **nicht gesetzt** — genauer: nicht setzbar von hier. `GET
.../branches/main/protection` antwortet `401 „Requires authentication"`, `gh`
ist in der Arbeitsumgebung nicht installiert, kein Admin-Token verfügbar. Es
wurde bewusst kein Workaround gebaut (Selbstbestätigung ist keine Schranke).
Fällig ist der Copy-paste-Befehl oben durch den Betreiber; erst seine
Nachkontrolle schließt diesen Punkt.

### Warum `enforce_admins: true`

Ohne das gilt die Regel nicht für Administratorinnen — und genau die pushen hier.
Eine Regel, die sich für den, der sie bricht, nicht gilt, ist keine Schranke,
sondern eine Empfehlung.

### Was eine rote Regel NICHT heilt

Die Regel verhindert das **Mergen** ohne grünen Verdict. Sie verhindert keinen
direkten Push auf `main` durch einen Administrator und keinen Force-Push. Wer das
auch verhindern will, braucht zusätzlich „Do not allow bypassing the above
settings" in der Oberfläche; die API-Fassung davon ist `enforce_admins` (oben).

## 3. Was hier gemessen ist und was nicht

**GEMESSEN im Arbeitsbaum (2026-10-13):** die Workflow-Datei trägt keine
Pfad-/Branch-Filter, kein `continue-on-error: true`, und leitet den Prüfbereich
nicht selbst im YAML ab (`scripts/lib/ci-range.mjs` tut das, und im Zweifel prüft
er die **volle** Historie). Das statische Gate (`commit-trailer`) prüft diese
Eigenschaften am Dateiinhalt, nicht an der Absicht: `npm run gate:full` →
**Exit 0**, 21 Gates, 0 rot.

**NICHT GEMESSEN:** ob die Branch-Regel in GitHub **gesetzt ist**. Das ist kein
Dateiinhalt, sondern ein Zustand bei GitHub, und der ist von hier aus nicht
lesbar. Bis der Nachkontroll-Befehl aus §2 den Namen ausgibt, gilt: die Schranke
ist **gebaut**, aber nicht **scharf**. Wer beides verwechselt, hat eine grüne
Momentaufnahme, die nichts verspricht.


## 4. Mobile-Gates — geplant, noch nicht implementiert

Der Umsetzungspfad steht in [docs/MOBILE-PLAN.md](MOBILE-PLAN.md). Die Namen unten sind **geplante Gate-/CI-Verträge**, keine bereits vorhandenen Jobs und keine grünen Prüfungen:

| Gate / Job | Prüft | Einbindung |
|---|---|---|
| `mobile-profile-contract` | Mobile-Allowlist, Pflicht-Bundles, Denylist, doppelte IDs und Paketnamen. | Gate-Plugin + Slice + Mutations-Fixture; ab Mobile-Profil blockierend. |
| `mobile-profile-boot` | `dsh --profile mobile --dump-config` löst jedes Bundle auf; fehlender DSH darf nicht als Skip grün werden. | eigener expliziter Profil-Smoke; ab W1 blockierend. |
| `mobile-bundle-contract` | Vier Pflichtdateien, Manifest-/Patch-/Client-IDs, Host/Client-Trennung. | Paketgate + Negativ-Fixtures; ab W2 blockierend. |
| `mobile-security` | keine Schlüssel im Quelltext/Logs, Loopback-only für Prototyp, eingeschränkte WebView-Navigation und Runtime-Hash-Prüfung. | statische Checks plus Runtime-/App-Tests; gestaffelt W1/W4. |
| `mobile-ui-smoke` | Viewport-Matrix, horizontales Overflow, Sidebar, Eingabe mit Softwaretastatur, ARIA/Touch-Targets, Desktop-Regression. | reproduzierbarer Browser-Smoke; ab W2 blockierend, sobald Runner stabil ist. |
| `android-unit` / `android-build` | Kotlin-/Rust-Tests, APK-Build, APK-Signatur, Runtime-Pins und Asset-Integrität. | separater Android-Workflow; ab W4 blockierend. |
| `android-device-smoke` | Install/Start/Stop, READY, WebView-Reconnect, Crash/Offline und Display-Lock auf Gerät/Emulator. | zunächst report-only; erst mit stabilem Runner verpflichtend. |
| `mobile-budget` | Kaltstart, installierte Größe, RSS und OOM/Crash unter Last. | zuerst report-only; Grenzwerte nur aus wiederholbaren Messungen ableiten. |

### 4.1 Regeln, damit Mobile nicht an der Schranke vorbeifällt

1. Jedes neue Gate bekommt einen Test unter `scripts/gate/tests/` und einen Slice in `scripts/gate/policy.json`. Weil die Engine Plug-ins dynamisch lädt und Policy-/Plug-in-Inventar gegeneinander prüft, müssen beide gleichzeitig geändert werden.
2. `scripts/validate-test.mjs` bekommt Mutations-Fixtures: der unveränderte Kontrollbaum bleibt grün; ungültige Mobile-Profile müssen sowohl im Gate als auch im Build rot werden.
3. Jeder blockierende Mobile-Job muss in `verdict.needs` aus `.github/workflows/commit-guard.yml` stehen. `failure`, `cancelled` und `skipped` bleiben rot; kein `continue-on-error` und keine Pfadfilter, die den Required Check umgehen.
4. Der erforderliche Statuscheck bleibt exakt **`Verdikt (fail-closed)`**. Keine separate Mobile-Job-ID als alleinige Branch-Schranke festlegen.
5. Neue Gates zuerst als echte ausführbare Prüfungen implementieren. Ein Dokumenteintrag oder ein Workflow mit `continue-on-error` zählt nicht als Gate.
6. Android-Build und Android-Geräte-Smoke werden erst in W4 eingeführt. Sie dürfen die bestehende schnelle Forge-CI nicht in jedem Job mit SDK/NDK-/Rootfs-Kosten belasten; ein separater Workflow darf dennoch ein eigenes fail-closed Release-Verdikt erfordern.

**Status am 2026-10-14:** Die oben genannten Mobile-Gates sind Plan. Die bestehende CI enthält derzeit nur den beschriebenen Forge-Gate-Workflow; Mobile-Jobs wurden in diesem Dokumentationszweig nicht implementiert und dürfen noch nicht als scharf bezeichnet werden.
