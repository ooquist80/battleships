from __future__ import annotations

from typing import Annotated, Literal, Union

from pydantic import BaseModel, ConfigDict, Field, TypeAdapter


class ShipPlacementInput(BaseModel):
    model_config = ConfigDict(extra="forbid")

    x: int = Field(ge=0)
    y: int = Field(ge=0)
    length: int = Field(gt=0)
    orientation: Literal["horizontal", "vertical"]


class CreateGameMessage(BaseModel):
    model_config = ConfigDict(extra="forbid")

    type: Literal["create_game"]
    player_name: str
    opponent_name: str


class JoinGameMessage(BaseModel):
    model_config = ConfigDict(extra="forbid")

    type: Literal["join_game"]
    invite_code: str


class PlaceShipsMessage(BaseModel):
    model_config = ConfigDict(extra="forbid")

    type: Literal["place_ships"]
    ships: list[ShipPlacementInput]


class ShootMessage(BaseModel):
    model_config = ConfigDict(extra="forbid")

    type: Literal["shoot"]
    x: int
    y: int


ClientMessage = Annotated[
    Union[CreateGameMessage, JoinGameMessage, PlaceShipsMessage, ShootMessage],
    Field(discriminator="type"),
]
CLIENT_MESSAGE_ADAPTER = TypeAdapter(ClientMessage)


def parse_client_message(payload: object) -> ClientMessage:
    return CLIENT_MESSAGE_ADAPTER.validate_python(payload)


class MatchFoundEvent(BaseModel):
    model_config = ConfigDict(extra="forbid")

    type: Literal["match_found"] = "match_found"
    game_id: str
    player_id: str
    opponent_id: str
    player_name: str
    opponent_name: str


class InviteCreatedEvent(BaseModel):
    model_config = ConfigDict(extra="forbid")

    type: Literal["invite_created"] = "invite_created"
    invite_code: str
    invite_url: str


class StartPlacementEvent(BaseModel):
    model_config = ConfigDict(extra="forbid")

    type: Literal["start_placement"] = "start_placement"
    game_id: str


class GameStartEvent(BaseModel):
    model_config = ConfigDict(extra="forbid")

    type: Literal["game_start"] = "game_start"
    game_id: str
    starting_player_id: str


class YourTurnEvent(BaseModel):
    model_config = ConfigDict(extra="forbid")

    type: Literal["your_turn"] = "your_turn"
    game_id: str


class ShotResultEvent(BaseModel):
    model_config = ConfigDict(extra="forbid")

    type: Literal["shot_result"] = "shot_result"
    game_id: str
    shooter_id: str
    x: int
    y: int
    result: Literal["hit", "miss"]
    sunk_ship_length: int | None = None


class GameOverEvent(BaseModel):
    model_config = ConfigDict(extra="forbid")

    type: Literal["game_over"] = "game_over"
    game_id: str
    winner: str | None = None
    reason: str | None = None


class ErrorEvent(BaseModel):
    model_config = ConfigDict(extra="forbid")

    type: Literal["error"] = "error"
    message: str


SnapshotCell = Literal["ship", "hit", "miss"] | None


class ConnectedEvent(BaseModel):
    model_config = ConfigDict(extra="forbid")

    type: Literal["connected"] = "connected"
    player_id: str
    session_id: str
    resumed: bool = False


class StateSyncEvent(BaseModel):
    model_config = ConfigDict(extra="forbid")

    type: Literal["state_sync"] = "state_sync"
    game_id: str
    phase: Literal["lobby", "placement", "playing", "finished"]
    player_id: str
    opponent_id: str
    player_name: str
    opponent_name: str
    turn: str | None = None
    winner: str | None = None
    own_board: list[list[SnapshotCell]]
    opponent_board: list[list[SnapshotCell]]
    ships_submitted: bool
