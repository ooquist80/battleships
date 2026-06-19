from __future__ import annotations

import asyncio
import uuid
from typing import Any, Iterable

from fastapi import WebSocket


class ConnectionManager:
    def __init__(self) -> None:
        self._connections: dict[str, WebSocket] = {}
        self._lock = asyncio.Lock()

    async def connect(self, websocket: WebSocket) -> str:
        await websocket.accept()
        player_id = uuid.uuid4().hex
        async with self._lock:
            self._connections[player_id] = websocket
        return player_id

    async def disconnect(self, player_id: str) -> None:
        async with self._lock:
            self._connections.pop(player_id, None)

    async def is_connected(self, player_id: str) -> bool:
        async with self._lock:
            return player_id in self._connections

    async def send(self, player_id: str, payload: dict[str, Any]) -> bool:
        async with self._lock:
            websocket = self._connections.get(player_id)

        if websocket is None:
            return False

        try:
            await websocket.send_json(payload)
            return True
        except Exception:
            await self.disconnect(player_id)
            return False

    async def broadcast(self, player_ids: Iterable[str], payload: dict[str, Any]) -> None:
        await asyncio.gather(*(self.send(player_id, payload) for player_id in player_ids))
