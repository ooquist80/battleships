from __future__ import annotations

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from pydantic import ValidationError

from app.connection_manager import ConnectionManager
from app.game_manager import GameActionError, GameManager
from app.schemas import (
    CreateGameMessage,
    ErrorEvent,
    GameOverEvent,
    GameStartEvent,
    InviteCreatedEvent,
    JoinGameMessage,
    MatchFoundEvent,
    PlaceShipsMessage,
    ShootMessage,
    ShotResultEvent,
    StartPlacementEvent,
    YourTurnEvent,
    parse_client_message,
)

app = FastAPI(title="Battleships Backend MVP", version="0.1.0")
connections = ConnectionManager()
games = GameManager()


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}


async def handle_create_game(player_id: str, message: CreateGameMessage) -> None:
    invite = await games.create_invite(
        creator_id=player_id,
        player_name=message.player_name,
        opponent_name=message.opponent_name,
    )
    await connections.send(
        player_id,
        InviteCreatedEvent(
            invite_code=invite.invite_code,
            invite_url=f"/?invite={invite.invite_code}",
        ).model_dump(),
    )


async def handle_join_game(player_id: str, message: JoinGameMessage) -> None:
    game = await games.join_invite(player_id=player_id, invite_code=message.invite_code)
    player_one_id, player_two_id = game.players
    if not await connections.is_connected(player_one_id):
        await games.handle_disconnect(player_one_id)
        raise GameActionError("Invite is no longer joinable.")

    await connections.send(
        player_one_id,
        MatchFoundEvent(
            game_id=game.game_id,
            player_id=player_one_id,
            opponent_id=player_two_id,
            player_name=game.player_names.get(player_one_id, player_one_id),
            opponent_name=game.player_names.get(player_two_id, player_two_id),
        ).model_dump(),
    )
    await connections.send(
        player_two_id,
        MatchFoundEvent(
            game_id=game.game_id,
            player_id=player_two_id,
            opponent_id=player_one_id,
            player_name=game.player_names.get(player_two_id, player_two_id),
            opponent_name=game.player_names.get(player_one_id, player_one_id),
        ).model_dump(),
    )

    await games.start_placement(game.game_id)
    start_event = StartPlacementEvent(game_id=game.game_id).model_dump()
    await connections.broadcast(game.players, start_event)


async def handle_place_ships(player_id: str, message: PlaceShipsMessage) -> None:
    placement_outcome = await games.place_ships(player_id=player_id, ships=message.ships)
    if not placement_outcome.all_players_ready or not placement_outcome.starting_player_id:
        return

    await connections.broadcast(
        placement_outcome.players,
        GameStartEvent(
            game_id=placement_outcome.game_id,
            starting_player_id=placement_outcome.starting_player_id,
        ).model_dump(),
    )
    await connections.send(
        placement_outcome.starting_player_id,
        YourTurnEvent(game_id=placement_outcome.game_id).model_dump(),
    )


async def handle_shoot(player_id: str, message: ShootMessage) -> None:
    shot_outcome = await games.shoot(player_id=player_id, x=message.x, y=message.y)
    await connections.broadcast(
        shot_outcome.players,
        ShotResultEvent(
            game_id=shot_outcome.game_id,
            shooter_id=shot_outcome.shooter_id,
            x=shot_outcome.x,
            y=shot_outcome.y,
            result=shot_outcome.result.value,
        ).model_dump(),
    )

    if shot_outcome.winner_id is not None:
        await connections.broadcast(
            shot_outcome.players,
            GameOverEvent(
                game_id=shot_outcome.game_id,
                winner=shot_outcome.winner_id,
            ).model_dump(exclude_none=True),
        )
        await games.finish_game(shot_outcome.game_id)
        return

    if shot_outcome.next_turn_player_id is not None:
        await connections.send(
            shot_outcome.next_turn_player_id,
            YourTurnEvent(game_id=shot_outcome.game_id).model_dump(),
        )


@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket) -> None:
    player_id = await connections.connect(websocket)
    await connections.send(player_id, {"type": "connected", "player_id": player_id})

    try:
        while True:
            try:
                payload = await websocket.receive_json()
            except ValueError:
                await connections.send(
                    player_id,
                    ErrorEvent(message="Payload must be valid JSON.").model_dump(),
                )
                continue

            try:
                message = parse_client_message(payload)
            except ValidationError:
                await connections.send(
                    player_id,
                    ErrorEvent(message="Invalid message format.").model_dump(),
                )
                continue

            try:
                if isinstance(message, CreateGameMessage):
                    await handle_create_game(player_id, message)
                elif isinstance(message, JoinGameMessage):
                    await handle_join_game(player_id, message)
                elif isinstance(message, PlaceShipsMessage):
                    await handle_place_ships(player_id, message)
                elif isinstance(message, ShootMessage):
                    await handle_shoot(player_id, message)
            except GameActionError as exc:
                await connections.send(
                    player_id,
                    ErrorEvent(message=str(exc)).model_dump(),
                )
    except WebSocketDisconnect:
        pass
    finally:
        await connections.disconnect(player_id)
        await games.cancel_pending_invite(player_id)
        disconnect_outcome = await games.handle_disconnect(player_id)
        if disconnect_outcome is not None and disconnect_outcome.opponent_id is not None:
            await connections.send(
                disconnect_outcome.opponent_id,
                GameOverEvent(
                    game_id=disconnect_outcome.game_id,
                    winner=disconnect_outcome.winner_id,
                    reason="opponent_disconnected",
                ).model_dump(exclude_none=True),
            )
