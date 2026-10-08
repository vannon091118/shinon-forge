# Notion Live — Shinon Forge / DSH Plugin Architecture

**Status:** design + experimental UI/status scaffold. OAuth, sync, cloud gateway, and bench locks are not implemented.

## Product goal

A user with a Notion workspace — including a Free workspace — connects it to Shinon Forge, sees sessions and 2–3 agents in a live dashboard, and can follow or guide work without manually remembering every workflow step. The same task board and event timeline can be shared by the agents operating against a common worktree bench.

## Three components, three authorities

### 1. @shinon/notion-live — DSH plugin

Lives inside shinon-forge/packages/notion-live and follows the repo's four-file bundle contract. It owns the DSH side-panel UI, displays actual connection/agent/bench state, and maps DSH session/agent events to the connector's event contract. The current scaffold is read-only and disabled by default.

It must not store OAuth tokens, decide distributed lock ownership, or claim that a relay is connected based only on a configured URL.

### 2. Notion Live Gateway — serverless public endpoint

Recommended first implementation: a Cloudflare Worker (or equivalent serverless HTTPS gateway) with a stable public hostname. Its responsibilities:

- Complete the Notion public-connection OAuth callback and exchange authorization codes server-side.
- Store per-installation access/refresh tokens encrypted, isolated by installation/workspace, and never in Notion pages, plugin config, Git, or logs.
- Expose authenticated status/sync/approval endpoints with tenant scoping, CSRF/state validation, request signing or short-lived access tokens, and rate limiting.
- Validate and process Notion connection-webhook events when the public connection and workspace support them; verify signatures and treat events as notifications, not as authoritative lock commands.
- Batch/coalesce status updates and handle API throttling/retries.
- Keep the client secret only in deployment secret storage.

A public Notion connection is the correct model for a plugin product: each user authorizes the app via OAuth and receives a token scoped to their workspace/pages. Do not ask users to paste a personal/internal integration token into a Notion property. Before Marketplace distribution, complete Notion's public-connection setup/review and configure a stable redirect URI.

### 3. Local Bench Coordinator — authoritative for worktree operations

The local coordinator runs beside the actual filesystem/worktree on the machine that owns that worktree. A Cloudflare Worker cannot directly edit a local checkout. The coordinator:

- maintains agent presence and heartbeats;
- atomically claims tasks and issues time-limited leases;
- owns exclusive write/resource locks;
- persists a checkpoint and idempotency/request ledger;
- verifies every handoff and test result before marking a task done;
- reconnects outbound to the gateway and publishes snapshots/events to Notion.

For the first single-machine pilot, use one local coordinator process and a transactional local store (SQLite is a reasonable option). If agents run on multiple machines, move the lock/lease authority to a single remote coordinator with a durable store; do not create separate competing lock authorities.

## Data flow

Notion Free workspace
  -> Public connection (OAuth; user selects shared pages)
  <-> Notion API + connection webhooks where available
Notion Live Gateway (stable HTTPS hostname, encrypted per-workspace tokens)
  <-> authenticated outbound connection / signed commands
Local Bench Coordinator (lives beside the worktree; atomic leases + event ledger)
  <-> verified DSH event contract
2–3 DSH agents -> task claims -> isolated/serialized changes -> tests -> handoff

Notion shows the dashboard and stores resumable session/task summaries. The coordinator is authoritative for live process state, lock leases, and filesystem mutation. The DSH plugin is the UX/event adapter. This avoids using Notion API writes as a lock or relying on stale dashboard state to prevent concurrent edits.

## Notion Free compatibility

- Use a public OAuth connection so users can connect their own workspace and select the pages/databases they authorize.
- Treat the Free account as supported through the Notion API, but test actual API access, permission scopes, rate limits, and the connection installation flow during onboarding.
- Do not make the first release depend on Notion's database-button "Send webhook" action: Notion documents that action as a paid-plan feature. Prefer plugin-side initiation, coordinator outbound sync, and API/webhook-driven refresh where available.
- Use a lightweight template or setup wizard to create/select the Session Board and share only those pages/databases the integration needs.
- Batch writes and use change-driven/coalesced updates. Notion is a dashboard/store, not a sub-second transport or atomic concurrency primitive.

## Global tunnel and security

The phrase "global tunnel" should mean a stable, authenticated HTTPS path to the relay — not an unauthenticated public port into DSH. Cloudflare Tunnel can publish a local service under a hostname, but Cloudflare recommends placing Access in front of it; a published route without an Access application can be publicly reachable. For the first version, the DSH machine should usually make outbound authenticated connections to the gateway. Only expose a local service through a tunnel when inbound access is genuinely required.

- Separate end-user dashboard auth from agent/runner credentials.
- Authenticate every command; sign short-lived commands and bind them to an installation and worktree ID.
- Apply tenant isolation; never let one workspace read another workspace's events or tokens.
- Keep Notion OAuth tokens, client secrets, tunnel tokens, and signing keys out of Notion and Git.
- Use least-privilege Notion capabilities and provide disconnect/revoke + token deletion.
- Redact session/message contents by default; allow workspace owners to opt into richer transcript sync.
- Fail closed for writes when the relay or coordinator state is stale.

## Mandatory agent-to-agent role negotiation

**Requirement:** When two or more agents are active on one task, they must negotiate Owner/Reviewer from their real capabilities before any mutation. The user does not assign these roles manually. This is not implemented by the current scaffold; it becomes mandatory only once the coordinator and every mutating adapter enforce it.

### Negotiation protocol

1. **DISCOVER:** Each agent registers a stable agent/session ID and reports only verifiable capabilities: model name if known (otherwise `UNKNOWN`), available tools, repository/worktree access, write permissions, and concrete independent verification abilities. Model branding alone never determines the role.
2. **PROPOSE:** Agents compare those capabilities against the task and propose Owner, Reviewer, bounded scope, write target, and verification plan. The Owner must be able to perform the scoped change; the Reviewer must be able to inspect the resulting diff/evidence independently.
3. **ACK:** The other agent confirms or raises a concrete objection. The coordinator stores a versioned role contract. Both agents must acknowledge the same version before a lease can be issued. If candidates are equivalent, the first valid timestamped claim wins Owner and the other becomes Reviewer.
4. **LEASE:** The coordinator atomically issues a time-limited writer lease bound to task ID, resource/worktree ID, scope hash, contract version, agent ID, and fencing token.
5. **GUARD:** Every filesystem, shell, editor, Git, or repository mutation must pass through a coordinator-checked executor or isolated writer sandbox. At the actual mutation boundary, validate the current lease and fencing token. If any mutating route can bypass this check, serialize all mutations behind the single-writer executor.
6. **REVIEW:** Reviewer is read-only for the change under review and returns `PASS`, `PASS MIT RISIKEN`, or `BLOCK` with evidence. Owner cannot self-approve or overwrite a Reviewer block.
7. **RELEASE:** Record verified outcome and checkpoint, release the lease, and publish a read-back-confirmed handoff. A lease timeout or process crash requires atomic lease recovery and readback before retrying a potentially completed write.

### Fail-closed rules

- No peer connection or missing second ACK: `COORDINATION_BLOCKED`; no shared-resource mutation. Read-only analysis and truly non-overlapping work may continue.
- Conflicting scope/owner proposals, changed contract version, missing/invalid token, stale lease, or lost coordinator heartbeat: block writes; never silently select a new scope.
- Solo mode is permitted only when the session explicitly starts as `Solo`. An agent cannot downgrade a multi-agent session to bypass coordination.
- Separate worktrees may be written in parallel only on isolated branches; integration/merge remains serialized and must pass the gate again.
- Notion status fields, a prompt, or a preflight check alone are not enforcement. Notion is a dashboard/context store; the coordinator is the atomic authority.

### Required acceptance tests

- No contract, one ACK, conflicting ACKs, or changed scope all block mutation.
- Simultaneous claims for one worktree yield exactly one valid writer lease.
- Wrong/expired fencing token and stale coordinator state block mutation at the tool boundary.
- Reviewer `BLOCK` prevents integration/completion.
- Explicit Solo works, but an agent cannot switch into Solo itself.
- Crash between write and readback resumes by reading actual state first and does not duplicate the mutation.
- Peer outage, duplicate request, lease expiry, competing claims, and recovery are stress-tested.

Current status: **specified, not enforced** until these tests pass against the real coordinator and all write paths.

## Multi-agent safety: same worktree bench

Sharing a task board is safe; unrestricted simultaneous writes to one worktree are not. Git does not make concurrent edits to the same working directory atomic. The coordinator must enforce one of these modes:

### Mode A — safest MVP: single writer per worktree

- Allow multiple agents to inspect, plan, search, and test read-only in parallel.
- Each worktree has one writer lease at a time. Other agents can prepare patches but may not write until they own the lease.
- Use resource/path locks for shared files such as package manifests, profile configuration, lockfiles, and generated bundles.
- The lease must be enforced at the actual mutation boundary: every mutating tool call (shell/editor/file/repository write) must pass through a coordinator-checked executor or be confined to an isolated writer sandbox. A prompt instruction or Notion status field is not enforcement. If any write path can bypass the check, serialize all mutation actions under the single-writer lease.
- The coordinator issues a monotonically increasing fencing token with each lease; every write operation validates the token and current lease at execution time. Stale agents must not publish writes after lease expiry.
- Tests and integration use a separate integration lease. Completion requires a current lease and successful readback of the actual diff/test result.

### Mode B — higher parallelism: separate worktree per writer

- Give each agent a separate Git worktree/branch based on a shared base commit.
- Agents can write concurrently in isolated directories.
- A single integrator/merge queue serializes cherry-picks/merges and reruns relevant gates after each integration.
- Conflicts become explicit merge tasks, not silent overwrites.

Do not promise conflict-free operation if all agents directly edit the same physical worktree without locking. For a literal shared worktree, Mode A is the safe MVP.

## Canonical session/bench data model

Keep current session/task facts in the coordinator and sync a readable subset to Notion:

- Bench: bench_id, repo/worktree path fingerprint, branch, base commit, lock mode, coordinator heartbeat.
- Agent presence: agent_id, DSH session ID, role, capabilities, status, heartbeat, current task.
- Task: task_id, goal, done criterion, scope, status, dependencies, claimed_by, lease expiry, fencing token, required gate.
- Resource lease: resource_key (whole worktree or path), owner agent, request ID, expiry, fencing token.
- Event log: event_id, timestamp, bench/task/agent IDs, event type, evidence reference, resulting checkpoint.
- Approval: action, scope, risk, requesting agent, user decision, expiry, audit reference.

In Notion, show tasks/agent presence/last event/approval needs, but do not make Notion properties the source of truth for lease arbitration.

## Incremental delivery

1. Scaffold (current): inactive plugin, side panel, explicit status contract, architecture document.
2. Single-workspace dev: public OAuth gateway for read-only connect + page picker + connection health.
3. Dashboard sync: create/select session database; coalesced updates; revoke/disconnect; stale-state indicator.
4. Local coordinator: single writer lease, durable task claims, heartbeat, checkpoints, idempotent resume.
5. Control commands: start/pause/resume/approve from a secure command queue, never from unsigned page changes alone.
6. Multi-agent pilot: two or three agents, one physical worktree, stress tests for simultaneous claims, lock expiry, duplicate triggers, process death, and merge/test handoff.
7. Public distribution: stable OAuth redirect URI, connection review/listing if desired, privacy/security notes, setup wizard, versioned contract.

## Pilot acceptance criteria

- Free Notion workspace can complete the public OAuth flow without pasting an API token.
- Integration can access only pages the user deliberately authorized.
- Disconnect revokes/forgets stored credentials; logs and Notion pages contain no secrets.
- A repeated command or webhook cannot create a duplicate claim or duplicate mutation.
- With three agents and one physical worktree, never more than one writer lease is valid at once.
- Expired leases fence out stale agents; recovery resumes from the last verified checkpoint.
- Notion and the panel distinguish connected, syncing, stale, disconnected, and blocked.
- A session is complete only after the actual tests/diff and handoff have been verified.

## References (official documentation)

- Notion — Add and manage API connections (OAuth page selection): https://www.notion.com/en-gb/help/add-and-manage-connections-with-the-api
- Notion — Create integrations with the Notion API (public vs. internal connections and capabilities): https://www.notion.com/help/create-integrations-with-the-notion-api
- Notion — Webhook actions (paid-plan constraint; unauthenticated action webhook): https://www.notion.com/de/help/webhook-actions
- Cloudflare — Publish a self-hosted app through Tunnel and protect it with Access: https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/self-hosted-public-app/
- Cloudflare — Access for Workers: https://developers.cloudflare.com/workers/configuration/cloudflare-access/
- DSH / Shinon Forge implementation basis: https://github.com/vannon091118/shinon-forge
