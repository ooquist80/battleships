# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Running the app

The primary way to run the full stack is Docker Compose:

```bash
cp .env.example .env          # once
docker compose up --build
# App available at http://localhost:8080
```

To run the backend directly (without Docker):

```bash
cd backend
pip install -r requirements.txt
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

To run the frontend dev server (proxies `/ws` to `localhost:8000`):

```bash
cd frontend
npm install
npm run dev      # http://localhost:5173
npm run build    # production build → dist/
```

## Architecture overview

This is a server-authoritative 1v1 Battleships game. All game logic lives on the backend; the frontend only renders server state.

### Backend (`backend/app/`)

Pure in-memory FastAPI application with a single WebSocket endpoint (`/ws`). No database.

| File | Responsibility |
|---|---|
| `main.py` | FastAPI app, WebSocket handler, disconnect-forfeit scheduling |
| `connection_manager.py` | Tracks live WebSocket connections; maps `session_id → player_id` for reconnection |
| `game_manager.py` | All game state mutations (create invite, join, place ships, shoot, forfeit) |
| `models.py` | Pure dataclasses: `GameState`, `PlayerState`, `ShipState`, outcome types |
| `schemas.py` | Pydantic models for client→server messages and server→client events |
| `utils.py` | Board constants (`BOARD_SIZE=10`, `EXPECTED_FLEET_LENGTHS=(5,4,3,3,2)`), ship validation |

**Session/reconnection flow:** The client sends `?session_id=<uuid>` on connect. `ConnectionManager` maps the session to a stable `player_id`; reconnecting with the same session resumes the same identity. `main.py` cancels any pending disconnect-forfeit task on reconnect and sends a `state_sync` snapshot.

**Concurrency:** Both `ConnectionManager` and `GameManager` use a single `asyncio.Lock` per class. All mutating methods are async and acquire the lock. Methods named `_*_unlocked` are helpers that must only be called while the lock is already held.

**Game phases:** `lobby → placement → playing → finished`. Phase transitions are driven by WebSocket messages: `create_game` / `join_game` (lobby), `place_ships` (placement → playing when both ready), `shoot` (playing), then `game_over` (finished). Finished games are removed from memory immediately.

### Frontend (`frontend/src/`)

Vue 3 SPA with no router. State is managed by a hand-rolled reactive store (no Pinia), styled with Tailwind CSS v4.

| File | Responsibility |
|---|---|
| `services/websocket.js` | Singleton `WebSocketService`; event emitter; reads/writes `session_id` from `localStorage`; auto-detects WS URL |
| `store/game.js` | All application state (`reactive`), WebSocket event handlers, action functions. Exported via `useGameStore()`. |
| `components/Lobby.vue` | Name entry, create-invite / join-invite UI |
| `components/Game.vue` | Ship placement and turn-based shooting UI |
| `components/Board.vue` | 10×10 grid, renders own board and opponent board |
| `components/Cell.vue` | Single cell: empty / ship / hit / miss |

**Store design:** `store/game.js` exports a single frozen store object. State is `readonly` to consumers. The store subscribes to WebSocket events in `init()` and dispatches `handleServerMessage()`. Pending actions (`pendingCreatePayload`, `pendingJoinInviteCode`) are flushed in `handleOpen()` so lobby actions queue correctly before the socket is open.

**WebSocket URL resolution (`websocket.js`):** In dev (`import.meta.env.DEV`), connects to `ws://localhost:8000/ws`. In production (`import.meta.env.PROD`), derives the URL from `window.location` using the nginx proxy path `/ws`. Override with `VITE_WS_URL`.

**Invite link hostname:** The `VITE_APP_HOSTNAME` build arg (set via `docker-compose.yml` from `.env`) overrides the hostname in generated invite links, needed when the Raspberry Pi's LAN IP differs from `localhost`.

## WebSocket protocol

Client → Server message types: `create_game`, `join_game`, `place_ships`, `shoot`.

Server → Client event types: `connected`, `state_sync`, `invite_created`, `match_found`, `start_placement`, `game_start`, `your_turn`, `shot_result`, `game_over`, `error`.

All messages are JSON. The discriminator field is `type`. See `backend/app/schemas.py` for the exact shapes.

## Specialized agents

Two custom subagent definitions live in `.github/agents/`:

- `fastapi-developer` — use for backend work: FastAPI, Pydantic v2, async patterns, WebSocket design
- `vue-expert` — use for frontend work: Vue 3 Composition API, reactivity, Vite, Tailwind

Invoke them via the Agent tool with `subagent_type: "fastapi-developer"` or `subagent_type: "vue-expert"`.

## Key constraints

- All state is in-memory; restarting the backend clears all games.
- Fleet composition is fixed: ships of lengths [5, 4, 3, 3, 2] — validated in `utils.py`.
- Board coordinates are 0-indexed `(x, y)` with origin at top-left. Board snapshots are `board[y][x]`.
- `GameManager` never exposes opponent ship positions — `_build_opponent_board_snapshot_unlocked` only reveals cells the current player has shot at.
