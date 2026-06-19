from __future__ import annotations

from dataclasses import dataclass, field
from enum import Enum

Coordinate = tuple[int, int]


class GamePhase(str, Enum):
    LOBBY = "lobby"
    PLACEMENT = "placement"
    PLAYING = "playing"
    FINISHED = "finished"


class ShotResult(str, Enum):
    HIT = "hit"
    MISS = "miss"


@dataclass(slots=True)
class ShipState:
    cells: set[Coordinate]
    hits: set[Coordinate] = field(default_factory=set)

    def register_hit(self, cell: Coordinate) -> bool:
        if cell not in self.cells:
            return False
        self.hits.add(cell)
        return True

    @property
    def is_sunk(self) -> bool:
        return self.cells.issubset(self.hits)


@dataclass(slots=True)
class PlayerState:
    player_id: str
    ships: list[ShipState] = field(default_factory=list)
    occupied_cells: set[Coordinate] = field(default_factory=set)
    shots_fired: set[Coordinate] = field(default_factory=set)
    ships_placed: bool = False

    @property
    def all_ships_sunk(self) -> bool:
        return bool(self.ships) and all(ship.is_sunk for ship in self.ships)


@dataclass(slots=True)
class GameState:
    game_id: str
    players: tuple[str, str]
    player_names: dict[str, str] = field(default_factory=dict)
    phase: GamePhase = GamePhase.LOBBY
    player_states: dict[str, PlayerState] = field(default_factory=dict)
    turn_player_id: str | None = None
    winner_id: str | None = None

    def opponent_id(self, player_id: str) -> str | None:
        player_one, player_two = self.players
        if player_id == player_one:
            return player_two
        if player_id == player_two:
            return player_one
        return None


@dataclass(slots=True)
class PlacementOutcome:
    game_id: str
    players: tuple[str, str]
    all_players_ready: bool
    starting_player_id: str | None


@dataclass(slots=True)
class ShotOutcome:
    game_id: str
    players: tuple[str, str]
    shooter_id: str
    target_id: str
    x: int
    y: int
    result: ShotResult
    winner_id: str | None
    next_turn_player_id: str | None


@dataclass(slots=True)
class DisconnectOutcome:
    game_id: str
    disconnected_player_id: str
    opponent_id: str | None
    winner_id: str | None


@dataclass(slots=True)
class PendingInvite:
    invite_code: str
    creator_id: str
    creator_name: str
    opponent_name: str
