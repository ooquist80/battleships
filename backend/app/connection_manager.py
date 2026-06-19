from __future__ import annotations

import asyncio
import uuid
from dataclasses import dataclass
from typing import Any, Iterable

from fastapi import WebSocket, WebSocketDisconnect


@dataclass(slots=True, frozen=True)
class ConnectionContext:
    player_id: str
    session_id: str
    connection_id: str
    resumed: bool


@dataclass(slots=True)
class _PlayerConnection:
    websocket: WebSocket
    connection_id: str


class ConnectionManager:
    def __init__(self) -> None:
        self._connections: dict[str, _PlayerConnection] = {}
        self._session_to_player: dict[str, str] = {}
        self._lock = asyncio.Lock()

    async def connect(self, websocket: WebSocket, session_id: str | None = None) -> ConnectionContext:
        await websocket.accept()
        normalized_session_id = self._normalize_session_id(session_id)
        replaced_connection: _PlayerConnection | None = None

        async with self._lock:
            resumed = False
            if normalized_session_id is None:
                player_id = uuid.uuid4().hex
                normalized_session_id = uuid.uuid4().hex
                self._session_to_player[normalized_session_id] = player_id
            else:
                existing_player_id = self._session_to_player.get(normalized_session_id)
                if existing_player_id is None:
                    player_id = uuid.uuid4().hex
                    self._session_to_player[normalized_session_id] = player_id
                else:
                    player_id = existing_player_id
                    resumed = True

            connection_id = uuid.uuid4().hex
            replaced_connection = self._connections.get(player_id)
            self._connections[player_id] = _PlayerConnection(
                websocket=websocket,
                connection_id=connection_id,
            )

        if replaced_connection is not None:
            await self._close_replaced_connection(replaced_connection.websocket)

        return ConnectionContext(
            player_id=player_id,
            session_id=normalized_session_id,
            connection_id=connection_id,
            resumed=resumed,
        )

    async def disconnect(self, player_id: str, *, connection_id: str | None = None) -> bool:
        async with self._lock:
            connection = self._connections.get(player_id)
            if connection is None:
                return False
            if connection_id is not None and connection.connection_id != connection_id:
                return False
            self._connections.pop(player_id, None)
            return True

    async def is_connected(self, player_id: str) -> bool:
        async with self._lock:
            return player_id in self._connections

    async def send(self, player_id: str, payload: dict[str, Any]) -> bool:
        async with self._lock:
            connection = self._connections.get(player_id)

        if connection is None:
            return False

        try:
            await connection.websocket.send_json(payload)
            return True
        except (RuntimeError, WebSocketDisconnect):
            await self.disconnect(player_id, connection_id=connection.connection_id)
            return False

    async def broadcast(self, player_ids: Iterable[str], payload: dict[str, Any]) -> None:
        await asyncio.gather(*(self.send(player_id, payload) for player_id in player_ids))

    @staticmethod
    def _normalize_session_id(session_id: str | None) -> str | None:
        if session_id is None:
            return None
        normalized_session_id = session_id.strip()
        if not normalized_session_id:
            return None
        return normalized_session_id

    @staticmethod
    async def _close_replaced_connection(websocket: WebSocket) -> None:
        try:
            await websocket.close(code=1000, reason="Replaced by newer connection.")
        except (RuntimeError, WebSocketDisconnect):
            return
