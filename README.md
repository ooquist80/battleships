# Battleships MVP

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

## Configuration

Compose reads values from `.env`:

- `FRONTEND_PORT`: host port mapped to the frontend container
- `APP_HOSTNAME`: hostname used when generating shareable invite links
- `BACKEND_LOG_LEVEL`: Uvicorn log level for the backend container
