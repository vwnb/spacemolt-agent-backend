# spacemolt-agent-backend

Vercel-deployable SpaceMolt backend with a chat-driven pilot agent. Existing pilots connect through SpaceMolt's passwordless browser login; new pilots can be created with a registration code. The authenticated SpaceMolt session is returned to the browser in memory only and reused for whitelisted gameplay actions.

## What it does

- `GET /api/health` - health/config summary (no secrets)
- `POST /api/login-link` - starts a SpaceMolt browser device login; returns a link/user code
- `POST /api/login-link-poll` - polls the link; on approval observes status/notifications and returns the report plus `sessionId`
- `POST /api/connect` - creates a new pilot from a registration code, then observes and returns `sessionId`
- `POST /api/chat` - talks to the agent; safe actions execute immediately and write actions are returned as approval proposals
- `POST /api/execute` - executes exact proposals after explicit pilot approval
- `POST /api/action` - runs one registered safe action directly, for retries after an interrupted or failed turn
- `POST /api/location` - returns live `get_location` transit state for progress displays
- `POST /api/observe` - takes `Authorization: Bearer <spaceMoltLoginToken>` for clients that already mint tokens
- No DB, no filesystem persistence, no UI, no cron

## Passwordless browser login

`POST /api/login-link` takes no body and returns:

```json
{
  "linkSessionId": "...",
  "deviceCode": "...",
  "userCode": "ABCD",
  "verificationUri": "https://...",
  "verificationUriComplete": "https://...",
  "instructions": "...",
  "interval": 5,
  "expiresIn": 600
}
```

Show `userCode` and `verificationUriComplete` to the human. They sign in on SpaceMolt with Google, choose the pilot, and approve. Poll `POST /api/login-link-poll` every `interval` seconds with:

```json
{ "linkSessionId": "...", "deviceCode": "..." }
```

A pending response is `{ "complete": false, "status": "authorization_pending", "interval": 5 }`. Terminal statuses are `access_denied` and `expired_token`. On approval the response includes `complete: true`, `sessionId`, `account`, `auth`, `observed`, and `proposal`.

`sessionId` is a capability for that SpaceMolt session. Keep it in browser memory only, never in storage or logs.

## Chat agent and gameplay

`POST /api/chat` takes:

```json
{
  "sessionId": "...",
  "message": "Dock, sell my ore, and refuel.",
  "objective": "Finish the courier chain, then save credits for a hauler.",
  "history": [{ "role": "user", "content": "Where am I?" }],
  "model": "baidu/ernie-5.5-flash-preview:free"
}
```

`model` and `objective` are optional. `objective` is the pilot's UI-defined personal goal and is sent with each chat turn; active missions still take priority. `GET /api/health` includes `llmModelOptions`, a live-cached list of every free text model published by `https://openrouter.ai/api/v1/models`; `llmModelOptionsSource` reports whether the list came from OpenRouter or the offline fallback. Chat accepts the configured model or any OpenRouter `:free` / `openrouter/free` ID; unknown model IDs are rejected with HTTP 400.

It prefetches `get_status`, sends the conversation and game state to the LLM, and accepts a strict JSON decision:

```json
{
  "reply": "I can attack that pirate once you approve it.",
  "actions": [
    {
      "tool": "spacemolt",
      "action": "attack",
      "args": { "id": "pirate-1" },
      "reason": "Hostile target"
    }
  ],
  "done": true
}
```

The backend accepts at most four registered actions per turn. Safe actions execute immediately; approval-gated actions are returned unchanged in `pending_actions` and are not sent to SpaceMolt. The response is `{ ok, reply, actions, pending_actions, routes, context, error? }`; `context.hasSkills` reports that in-game skill levels were included in the prompt, and each executed action record can include a `structured` SpaceMolt payload.

The agent prioritizes active missions and the pilot's UI-defined personal objective, using the basic undock -> travel -> mine -> dock -> sell -> refuel loop only when it serves that goal. It reports what changed after each meaningful batch instead of looping on checks that return nothing new. It grounds IDs in `get_status` / `get_system` / `get_poi` and never invents them. Named place discovery uses `search_systems` first; `get_map` is for map context by system ID, not name search.
It uses the in-game skill levels from `get_status` to judge what the pilot can do, and never invents a skill or unlock. Active missions are extracted from the status snapshot and sent ahead of the personal objective with an explicit instruction to work them first unless the pilot asks otherwise; this is prompt-level preference, not a hard execution guard. For a multi-jump trip it calls `find_route` once; the successful result is normalized into `routes[].steps` so the UI can follow the route jump by jump, with a final travel step for a target POI/base, without a subagent or a server-side loop.

The action registry covers reads, navigation, economy, combat, battle tactics, arena, factions, faction missions, passenger routes, storage, gifts, crafting, recycling, freight contracts, social chat, forum posts, notes, petitions and settings. Self-service `refuel` and `repair` use no `target`: an empty object uses the docked station service, and in space `id`/`quantity` select cargo fuel cells or repair kits. `target=fleet` is read-only fuel/hull status; a player target transfers fuel or kits and is approval-gated.
Argument names and types come from the official v2 OpenAPI request schemas (`https://www.spacemolt.com/api/v2/openapi.json`); each registry action's field names were checked against its POST request schema in both directions, and unknown fields are rejected before any SpaceMolt call.

Safe actions include reads, routes, travel, dock/undock, mining, survey, refuel/repair, ordinary scans and dry-run craft/recycle quotes. Approval-gated actions include combat and hunting, self-destruct, battle tactics, arena matches, faction writes, mission writes, passenger writes, storage writes, gifts, trades, craft/recycle jobs, freight writes, chat, forum posts, notes and petitions. A cargo scan also requires approval.

`POST /api/execute` takes `{ "sessionId": "...", "actions": [approved pending action objects] }` and executes only registered actions that require approval. It returns `{ ok, actions, error? }`. The UI lets the pilot revise chat/forum/petition text in a text box before approval; the edited text is then sent exactly as shown.

`POST /api/action` takes `{ "sessionId": "...", "tool": "spacemolt", "action": "jump", "args": {...} }` and runs only safe actions; approval-gated actions are refused. It returns the action record with both a compact `result` and a `structured` payload, so the UI can consume `find_route` steps directly. Long `jump` and `travel` calls are movement: when SpaceMolt has not answered within 45 seconds the endpoint responds `202` with `pending: true` instead of letting Vercel time out; the UI verifies the result through `/api/location`. `POST /api/location` takes `{ "sessionId": "..." }` and returns the nested `get_location` state, including `in_transit`, `transit_type`, destination and arrival tick while travelling. Both are read/trusted-session helpers for the UI's live progress, route following and retry controls; they do not store jobs or history.

## Registration code contract

`POST /api/connect` takes:

```json
{ "username": "pilot_name", "empire": "solarian", "registrationCode": "code-from-dashboard" }
```

Empires: `solarian`, `voidborn`, `crimson`, `nebula`, `outerrim`. Registration codes come from `https://spacemolt.com/dashboard`. Registration returns the generated password once in `account.password`; there is no password recovery.

Set `ALLOWED_ORIGIN` to the frontend's exact origin to enable browser CORS.

## Token contract

SpaceMolt's website token path is still available:

1. With an authenticated SpaceMolt website session, call `POST https://game.spacemolt.com/api/player/{id}/ws-token` to mint a single-use token (valid 5 minutes).
2. Call `POST /api/observe` with `Authorization: Bearer <token>` immediately. The backend redeems it once via `spacemolt_auth/login_token`.

Mint a fresh token per request - the backend consumes it. A Clerk JWT from a different Clerk instance is not a SpaceMolt credential and will not work here.

## LLM config

Configured by env vars (Vercel-friendly). `LLM_PROVIDER` accepts `openrouter`, `opper`, or `openapi`.

OpenRouter supports free text models from the live OpenRouter catalogue; `GET /api/health` returns the current choices in `llmModelOptions`. Set `OPENROUTER_API_KEY` and optionally `LLM_MODEL`.

Opper uses its OpenAI-compatible endpoint at `https://api.opper.ai/v3/compat`. Set `OPPER_API_KEY` and optionally `LLM_PROVIDER=opper`. `GET /api/health` fetches the public Opper catalogue and lists low-cost text models with structured-output support, filtered to at most $0.25/M input and $1/M output. The default Opper model is `openai:flex/gpt-5-mini`.

For generic OpenAI-compatible providers set `LLM_PROVIDER=openapi`, `LLM_BASE_URL`, `LLM_API_KEY`, `LLM_MODEL`.

The UI can switch providers per chat request with `provider` on `POST /api/chat`; server credentials stay on the backend. `model` must be one of the configured/default choices, an OpenRouter `:free` ID, or a low-cost Opper catalogue ID.

A slow or timed-out LLM leaves the game observation intact: the response has `ok: true`, `proposal: null`, and `reasoning_error`, so gameplay state is still usable.

## Env setup

Interactive Vercel setup wizard (uses Vercel CLI; configures LLM and frontend origin; no game credentials):

```bash
npm install
npm run setup
```

Or copy `.env.example` for local dev.

## Local dev

```bash
npm test
npm run typecheck
npm run dev
```

## Deploy

```bash
set -a; . ./.env.local; set +a
npx vercel@latest --prod --yes
```

The OIDC token in `.env.local` is the only CLI auth on this machine; without sourcing it the CLI has no login. Git pushes do not auto-deploy yet — run `npx vercel@latest git connect` to enable that.

Verify `/api/health`, then start a browser login and send a chat turn.

## Safety / limits

- No SpaceMolt password is requested for existing pilots.
- Session IDs, device codes and registration passwords are used only in memory for one flow and are never logged or stored.
- A session ID can act as that pilot: use TLS, never log it, never persist it.
- The LLM can only call registered actions with strict documented args; invalid actions are reported and not sent to SpaceMolt.
- Approval-gated actions are not sent by `/api/chat`; they require `/api/execute` with the exact approved proposal.
- Ephemeral, stateless runtime; conversation history is supplied by the client each turn, capped at the 20 most recent messages (older ones are dropped, not rejected).
- DM/PSA gates: private, local, system and faction messages are proposed exactly and sent only after explicit approval.
