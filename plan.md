# Battleship 1v1 Web Game — Implementation Plan

## 🎯 Goal

Build a 1v1 Battleship game with:

* **Frontend:** Vue 3 (Vite)
* **Backend:** Python (FastAPI + WebSockets)
* **Hosting:** Raspberry Pi
* **Architecture:** Server-authoritative (no P2P)

---

## 🧱 Project Structure

```
battleship/
├── backend/
│   ├── app/
│   │   ├── main.py
│   │   ├── game_manager.py
│   │   ├── models.py
│   │   ├── schemas.py
│   │   ├── connection_manager.py
│   │   └── utils.py
│   ├── requirements.txt
│   └── run.sh
│
├── frontend/
│   ├── src/
│   │   ├── main.js
│   │   ├── App.vue
│   │   ├── components/
│   │   │   ├── Board.vue
│   │   │   ├── Cell.vue
│   │   │   ├── Lobby.vue
│   │   │   └── Game.vue
│   │   ├── store/
│   │   │   └── game.js
│   │   └── services/
│   │       └── websocket.js
│   ├── index.html
│   └── vite.config.js
│
└── plan.md
```

---

## ⚙️ Backend Tasks (Python / FastAPI)

### 1. Setup Server

* Install dependencies:

  * fastapi
  * uvicorn
* Create `main.py`
* Add WebSocket endpoint `/ws`

---

### 2. Connection Manager

**File:** `connection_manager.py`

Responsibilities:

* Track active WebSocket connections
* Assign players to games
* Handle disconnects

---

### 3. Game Manager

**File:** `game_manager.py`

Responsibilities:

* Create games
* Store game state in memory
* Handle:

  * Player join
  * Ship placement
  * Shooting
  * Turn switching
  * Win detection

Game structure:

```python
Game = {
    "id": str,
    "players": [player1, player2],
    "boards": {
        player1: [...],
        player2: [...]
    },
    "turn": player_id,
    "phase": "lobby | placement | playing | finished"
}
```

---

### 4. WebSocket Protocol

#### Client → Server

```json
{ "type": "create_game", "name": "Alice", "opponent_name": "Bob" }
{ "type": "join_game", "invite_code": "abcd1234" }
{ "type": "place_ships", "ships": [...] }
{ "type": "shoot", "x": 3, "y": 5 }
```

#### Server → Client

```json
{ "type": "invite_created", "invite_code": "abcd1234", "invite_url": "/?invite=abcd1234" }
{ "type": "match_found" }
{ "type": "start_placement" }
{ "type": "game_start" }
{ "type": "your_turn" }
{ "type": "shot_result", "x": 3, "y": 5, "result": "hit|miss" }
{ "type": "game_over", "winner": "player_id" }
```

---

### 5. Validation Rules

* Ensure correct turn
* Prevent duplicate shots
* Validate ship placement:

  * Inside grid
  * No overlap
* Never expose opponent ship positions

---

### 6. Run Server

```
uvicorn app.main:app --host 0.0.0.0 --port 8000
```

---

## 🎮 Frontend Tasks (Vue)

### 1. Setup Project

* Create Vue 3 app with Vite
* Install dependencies:

  * pinia (optional)

---

### 2. WebSocket Service

**File:** `services/websocket.js`

Responsibilities:

* Connect to backend
* Send messages
* Handle incoming events

---

### 3. Game Store

**File:** `store/game.js`

State:

* playerId
* gameId
* phase
* boards
* turn

---

### 4. Components

#### Lobby.vue

* Player + opponent name inputs
* Create invite link button
* Waiting state while invite is shared

#### Board.vue

* 10x10 grid
* Handles clicks

#### Cell.vue

* Displays:

  * empty
  * ship
  * hit
  * miss

#### Game.vue

* Main game screen
* Shows:

  * Your board
  * Opponent board

---

### 5. Game Flow

1. Host opens app and enters both player names
2. Host creates an invite link
3. Opponent opens the invite link to join
4. Ship placement phase
5. Game starts
6. Turn-based shooting
7. Game ends

---

## 🔄 State Synchronization

* Server is the **single source of truth**
* Client only renders state
* All actions go through server

---

## 🍓 Raspberry Pi Deployment

### Setup

* Install Python 3.10+
* Install Node (for frontend build)

### Backend

```
cd backend
pip install -r requirements.txt
./run.sh
```

### Frontend

```
cd frontend
npm install
npm run build
```

Serve frontend via:

* nginx OR
* simple static server

---

## 🌍 Networking

### Local Network

* Connect via:

  ```
  ws://<raspberry-pi-ip>:8000/ws
  ```

### Internet (optional)

* Port forward router OR
* Use tunnel (ngrok / Cloudflare)

---

## 🔐 Security

* Do not trust client input
* Validate all actions server-side
* Hide opponent ships

---

## 🚀 Milestones

### MVP

* [ ] WebSocket connection works
* [ ] Invite creation + join flow works
* [ ] Ship placement works
* [ ] Shooting works
* [ ] Win condition works

### Polish

* [ ] UI improvements
* [ ] Animations
* [ ] Rematch button

### Optional Features

* [ ] Player names
* [ ] Score tracking
* [ ] AI opponent

---

## 🧠 Notes for Copilot

* Prefer simple, readable code over abstraction
* Keep game state in memory (no DB needed)
* Use Python dictionaries for state
* Use Vue reactive state (no over-engineering)
* Focus on working MVP first

---

## ✅ Definition of Done

* Two players can:

  * Connect
  * Join via invite link
  * Place ships
  * Play full game
  * See winner

* Runs on Raspberry Pi without crashes

* Works in browser on same network

---
