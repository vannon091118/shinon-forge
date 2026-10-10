# @shinon/shinon-forge

> **Status:** current — Paket-Doku Shinon Forge. **Stand:** 2026-10-10
> **Einstieg:** `Docs/INDEX.md` · **Zahlen:** `Docs/ZAHLEN.md`

Memory Sync, Global Runner und Engine Adapters für alle Agents.

Das Paket ist gebaut und lädt im Distributionstest, ist aber **nicht** in
`dsh.profile.bundles` aktiviert; der Runner startet also nicht von selbst.

## Features

### Memory Sync
- Integriert mit bestehendem `notion-agent` (`.agents/notion-agent/memory-sync.mjs`)
- Tools: `memory_sync`, `memory_status`
- Prüft Stale-Memory gegen `~/.agents/memory.json`
- Schreibschutz durch Marker (`MEMORY-VERSION: sha256:...`)

### Global Runner
- Pollt Agent Sessions auf `Status = idle`
- Claim per Lock gegen Doppelausführung
- Dispatch via Engine Adapters (claude, codex, agy, muse, hermes, pi, cline, grok, freebuff)
- Tools: `runner_control`, `engine_dispatch`
- Heartbeat-Schreiben pro Agent

### Engine Adapters
Headless-Execution für alle supported Engines:
- `claude -p` (mit USE_ANALYTICS=0)
- `codex exec`
- `agy -p`
- `muse exec`
- `hermes -z`
- `pi`
- `cline --json`
- `grok`
- `freebuff-app`

## Config

```yaml
- id: shinon-shinon-forge
  name: '@shinon/shinon-forge'
  config:
    pollInterval: 5        # Sekunden zwischen Polls
    notionMcpServer: 'notion'
    memoryPageId: ''       # Leer = nutze memory.json
    maxEngineFails: 3      # Stops Agent nach N Fails
    heartbeatTimeout: 60   # Sekunden bis stale
```

## Tools

| Tool | Beschreibung |
|------|--------------|
| `memory_sync` | Sync von Notion (mit `force`/`verify`) |
| `memory_status` | Zeige Freshness, Marker, Quellen |
| `runner_control` | `start`/`stop`/`status` des Runners |
| `engine_dispatch` | Direkter Engine-Aufruf |

## Architektur

```
Notion (MCP)
    │
    ▼
notion-agent/memory-sync.mjs
    │
    ├─▶ ~/.agents/AGENTS.md (kanonisch)
    ├─▶ ~/.claude/CLAUDE.md (@-Import)
    ├─▶ ~/.codex/AGENTS.md (@-Import)
    ├─▶ ~/.gemini/AGENTS.md (@-Import)
    ├─▶ ~/.grok/rules/notion-memory.md (Copy)
    └─▶ ~/.hermes/SOUL.md (Block)
    
Agent Sessions
    │
    ▼
Global Runner (Polling)
    │
    ├─▶ Lock-Check
    ├─▶ Memory laden
    ├─▶ Prompt bauen
    ├─▶ Engine dispatch
    └─▶ Heartbeat schreiben
```

## Abhängigkeiten
- `@deepseek-ai/schemastery` (Peer, aus DSH)
- `notion-agent` (optional, für Memory Sync)
