# @shinon/notion-live

**Status: experimental scaffold only.** This DSH bundle adds a native side panel and a host/client status contract. It does not currently implement Notion OAuth, Notion API synchronization, relay networking, or bench locking.

## Current behavior

- Included in the Shinon profile as a disabled-by-default plugin.
- Publishes a truthful host status through the shinon/notion-live/status channel.
- Allows the client panel to request the current configuration status.
- Never calls Notion, opens a tunnel, starts an agent, or changes files.
- A configured relayUrl is only syntax-checked; it is not a successful connection.

## Planned product shape

See Docs/NOTION-LIVE-ARCHITECTURE.md for the public OAuth connection, hosted gateway, local bench coordinator, concurrency policy, and Free-plan-compatible trigger strategy.

## Safety defaults

- enabled is false until OAuth and the coordinator are implemented.
- No Notion access token, OAuth secret, or tunnel token is accepted in plugin configuration.
- Notion is the dashboard/control surface, not the authoritative lock manager.
- Shared-worktree writes must be serialized by a local coordinator; status rows in Notion are not mutexes.
