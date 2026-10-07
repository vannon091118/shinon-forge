# Prompts — DSH-native Persona-Schicht

> **Die alten goose-Prompts liegen in `Docs/legacy-goose-prompts/`.** Sie zielten
> auf `~/.config/goose/prompts/` und die Goose-Binary — Shinon Forge läuft auf DSH.
> Sie sind historisch, nicht aktiv.

## Wie DSH Prompts einspeist

DSH hat **kein** Datei-Template-System wie goose. Es gibt einen Prompt-Registry-Service:

| Fläche | Mechanismus | Was wir steuern |
|---|---|---|
| System-Prompt | `ctx.systemPrompt.section({ name, order, text })` | **voll** — Text, Position, Reihenfolge |
| Prompt-Variablen | `ctx.systemPrompt.variable(name, provider)` | `{{name}}` in Abschnitten |
| Persona-Prefix/-Suffix | Config `personaPrefix` / `personaSuffix` | je ein Abschnitt |
| Harness-Identität | Config `includeHarnessIdentity` | DSH-Eröffnungssatz an/aus |
| Compaction | `dsh-compaction-basic` | **nur** Backend-Route — Text nicht überschreibbar |
| Session-Titel | `dsh-session-title-*-llm` | **nur** Route/Budget — Text nicht überschreibbar |
| Approval-Policy | `approval:policy`-Section | auto-generiert aus der Policy |

**Konsequenz:** Von zehn goose-Prompts haben in DSH nur die überschreibbaren Flächen
ein Äquivalent. Die Persona gehört in den System-Prompt, nicht in Dateien.

## Die Lösung: `@shinon/persona`

Ein Bundle, das Shinon als **Persona-Schicht** in den DSH-System-Prompt schreibt.

```
packages/persona/
├── index.js            # ctx.systemPrompt.section() × 7
├── client.js           # leer (Persona ist host-seitig)
├── cordis.patch.yml    # insert-Eintrag
└── package.json
```

### Abschnitte und Positionen

Positionen über die reservierten Namen (`getSectionOrder`), nicht über magische
Zahlen — so driftet die Reihenfolge nicht gegen DSH:

| Abschnitt | Position | Inhalt |
|---|---|---|
| `shinon:identity` | `DEPLOYMENT_PERSONA_PREFIX` (0) | Wer Shinon ist, Ton, kein „verstehe" |
| `shinon:augenhoehe` | 2 | Niveau/Tempo/Humor des Nutzers lernen |
| `shinon:epistemic` | 1 | Keine Behauptung ohne Beleg, Widerspruch ist normal |
| `shinon:change-classes` | 1000 | SAFE / BEHAVIOR CHANGE / BREAKING CHANGE |
| `shinon:determinism` | 1100 | Seed/RNG-Regeln |
| `shinon:discipline` | 1200 | Zuständigkeit, Parallelität, Git |
| `shinon:report` | `DEPLOYMENT_PERSONA_SUFFIX` (10200) | Gemacht/Gefunden/Risiko/Tests/Offen |

Alle Texte sind **Config-Werte** (Schemastery) mit Defaults — das Bundle besitzt
den Mechanismus, das Profil die Werte.

## Aktivieren

Das Bundle ist in beiden Profilen eingetragen:

```yaml
# profiles/shinon/package.json → dsh.profile.bundles
"@shinon/persona"
```

Der `persona`-Gate-Check verifiziert, dass das Bundle `ctx.systemPrompt` nutzt
**und** im aktiven Profil aktiviert ist — sonst wäre es toter Text.

## Verifizieren

```bash
# Boot-Log muss zeigen:
dsh --profile shinon --no-open 2>&1 | grep persona
# → [shinon-persona] 7 Prompt-Abschnitte registriert

# Live-Test (Modell muss sich als Shinon vorstellen, nicht als DeepSeek-Agent):
SHINON_API_KEY=... dsh --profile headless "Wer bist du? Ein Satz, kein Firmensprech."
# → Shinon — dein pragmatischer Coding-Agent für die Forge, kein Corporate-Assistent.
```

## Bewusste Grenzen

- **Compaction, Session-Titel, Approval-Policy** sind in DSH **nicht**
  text-überschreibbar. Wer dort Shinon-Ton will, muss ein eigenes
  Backend-Plugin schreiben — nicht hier verstecken.
- **Subagent-Prompts** kommen vom Subagent-Tool, nicht aus einer Datei.
- **`apps_create` / `apps_iterate`** (goose Desktop-Apps-Extension) haben in
  DSH kein Gegenstück — die Apps-Extension existiert hier nicht.
- **Das Modell hält die epistemische Regel nicht immer ein.** Der Prompt sagt
  „was ich nicht ausgeführt habe, behaupte ich nicht" — beobachtet wurde, dass
  V3.1 trotzdem Testergebnisse erfindet. Das ist ein Modell-Limit, kein
  Prompt-Fehler; der Prompt ist korrekt.
