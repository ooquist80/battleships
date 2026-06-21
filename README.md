# Battleships

## Running with Docker Compose

1. Copy the environment template:
   ```bash
   cp .env.example .env
   ```
2. Start the stack:
   ```bash
   docker compose up --build
   ```
3. Open the app at `http://${APP_HOSTNAME}:${FRONTEND_PORT}` (default: `http://localhost:8080`).

The frontend container serves the built Vue app and proxies `/ws` and `/health` to the backend container.

## Invite Game Flow

1. The host enters their own name and the opponent name.
2. The host creates a game and gets an invite link from the app.
3. The opponent opens that invite link to join the game.
4. Both players place ships, then normal turn-based gameplay begins.

## Session Resilience

- The browser keeps a persistent WebSocket `session_id` (stored in local storage) and reuses it on reconnect.
- Reconnecting with the same browser session resumes the same server player identity instead of creating a new player.
- Disconnecting during an active game starts a grace period (`DISCONNECT_GRACE_SECONDS`, default `60`); reconnecting in time continues the match.
- If the grace period expires, the disconnected player forfeits and the opponent wins (`opponent_disconnected`).
- On reconnect, the server sends a state sync snapshot so active games restore board/turn/phase state when still available.

## Configuration

Compose reads values from `.env`:

- `FRONTEND_PORT`: host port mapped to the frontend container
- `APP_HOSTNAME`: hostname used when generating shareable invite links
- `BACKEND_LOG_LEVEL`: Uvicorn log level for the backend container
- `DISCONNECT_GRACE_SECONDS`: grace period before a disconnected player forfeits
