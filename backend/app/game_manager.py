from __future__ import annotations

import asyncio
import random
import uuid

from app.models import (
    BoardSnapshot,
    DisconnectOutcome,
    GamePhase,
    GameState,
    PendingInvite,
    PlacementOutcome,
    PlayerState,
    ShipState,
    StateSyncSnapshot,
    ShotOutcome,
    ShotResult,
)
from app.schemas import ShipPlacementInput
from app.utils import BOARD_SIZE, in_bounds, validate_and_expand_ships


class GameActionError(ValueError):
    """Raised when a player action cannot be applied."""


class GameManager:
    def __init__(self, board_size: int = BOARD_SIZE) -> None:
        self._board_size = board_size
        self._games: dict[str, GameState] = {}
        self._player_to_game: dict[str, str] = {}
        self._pending_disconnects: dict[str, str] = {}
        self._pending_invites: dict[str, PendingInvite] = {}
        self._creator_to_invite: dict[str, str] = {}
        self._lock = asyncio.Lock()

    async def build_state_sync_snapshot(self, player_id: str) -> StateSyncSnapshot | None:
        async with self._lock:
            game = self._game_for_player_unlocked(player_id)
            if game is None:
                return None

            opponent_id = game.opponent_id(player_id)
            if opponent_id is None:
                return None

            player_state = game.player_states.get(player_id)
            opponent_state = game.player_states.get(opponent_id)
            if player_state is None or opponent_state is None:
                raise RuntimeError("Game state is inconsistent for connected player.")

            return StateSyncSnapshot(
                game_id=game.game_id,
                phase=game.phase,
                player_id=player_id,
                opponent_id=opponent_id,
                player_name=game.player_names.get(player_id, player_id),
                opponent_name=game.player_names.get(opponent_id, opponent_id),
                turn_player_id=game.turn_player_id,
                winner_id=game.winner_id,
                own_board=self._build_own_board_snapshot_unlocked(
                    player_state=player_state,
                    opponent_state=opponent_state,
                ),
                opponent_board=self._build_opponent_board_snapshot_unlocked(
                    player_state=player_state,
                    opponent_state=opponent_state,
                ),
                ships_submitted=player_state.ships_placed,
            )

    async def is_player_in_game(self, player_id: str) -> bool:
        async with self._lock:
            return player_id in self._player_to_game

    async def create_invite(
        self,
        creator_id: str,
        player_name: str,
        opponent_name: str,
    ) -> PendingInvite:
        normalized_player_name = self._normalize_name(player_name, label="Player name")
        normalized_opponent_name = self._normalize_name(
            opponent_name,
            label="Opponent name",
        )

        async with self._lock:
            if creator_id in self._player_to_game:
                raise GameActionError("You are already in a game.")
            if creator_id in self._creator_to_invite:
                raise GameActionError("You already have a pending invite.")

            invite_code = self._generate_invite_code_unlocked()
            invite = PendingInvite(
                invite_code=invite_code,
                creator_id=creator_id,
                creator_name=normalized_player_name,
                opponent_name=normalized_opponent_name,
            )
            self._pending_invites[invite_code] = invite
            self._creator_to_invite[creator_id] = invite_code
            return invite

    async def join_invite(self, player_id: str, invite_code: str) -> GameState:
        normalized_invite_code = self._normalize_invite_code(invite_code)

        async with self._lock:
            if player_id in self._player_to_game:
                raise GameActionError("You are already in a game.")

            invite = self._pending_invites.get(normalized_invite_code)
            if invite is None:
                raise GameActionError("Invite code is invalid or expired.")
            if invite.creator_id == player_id:
                raise GameActionError("You cannot join your own invite.")
            if invite.creator_id in self._player_to_game:
                self._remove_invite_by_code_unlocked(normalized_invite_code)
                raise GameActionError("Invite is no longer joinable.")

            self._remove_invite_by_code_unlocked(normalized_invite_code)
            self._remove_invite_by_creator_unlocked(player_id)
            return self._create_game_unlocked(
                player_one_id=invite.creator_id,
                player_two_id=player_id,
                player_one_name=invite.creator_name,
                player_two_name=invite.opponent_name,
            )

    async def get_pending_invite_for_player(self, player_id: str) -> PendingInvite | None:
        async with self._lock:
            invite_code = self._creator_to_invite.get(player_id)
            if invite_code is None:
                return None
            return self._pending_invites.get(invite_code)

    async def cancel_pending_invite(self, creator_id: str) -> PendingInvite | None:
        async with self._lock:
            return self._remove_invite_by_creator_unlocked(creator_id)

    async def create_game(
        self,
        player_one_id: str,
        player_two_id: str,
        player_one_name: str | None = None,
        player_two_name: str | None = None,
    ) -> GameState:
        async with self._lock:
            return self._create_game_unlocked(
                player_one_id=player_one_id,
                player_two_id=player_two_id,
                player_one_name=player_one_name,
                player_two_name=player_two_name,
            )

    async def start_placement(self, game_id: str) -> None:
        async with self._lock:
            game = self._games.get(game_id)
            if game is None:
                raise GameActionError("Game not found.")
            if game.phase != GamePhase.LOBBY:
                raise GameActionError("Game is not in lobby phase.")
            game.phase = GamePhase.PLACEMENT

    async def place_ships(
        self,
        player_id: str,
        ships: list[ShipPlacementInput],
    ) -> PlacementOutcome:
        async with self._lock:
            game = self._game_for_player_unlocked(player_id)
            if game is None:
                raise GameActionError("You are not in an active game.")
            if game.phase != GamePhase.PLACEMENT:
                raise GameActionError("Ship placement is not available right now.")

            player_state = game.player_states[player_id]
            if player_state.ships_placed:
                raise GameActionError("You have already placed ships for this game.")

            try:
                expanded_ships, occupied_cells = validate_and_expand_ships(
                    ships,
                    board_size=self._board_size,
                )
            except ValueError as exc:
                raise GameActionError(str(exc)) from exc
            player_state.ships = [ShipState(cells=ship_cells) for ship_cells in expanded_ships]
            player_state.occupied_cells = occupied_cells
            player_state.ships_placed = True

            all_players_ready = all(state.ships_placed for state in game.player_states.values())
            starting_player_id: str | None = None
            if all_players_ready:
                game.phase = GamePhase.PLAYING
                game.turn_player_id = random.choice(game.players)
                starting_player_id = game.turn_player_id

            return PlacementOutcome(
                game_id=game.game_id,
                players=game.players,
                all_players_ready=all_players_ready,
                starting_player_id=starting_player_id,
            )

    async def shoot(self, player_id: str, x: int, y: int) -> ShotOutcome:
        async with self._lock:
            game = self._game_for_player_unlocked(player_id)
            if game is None:
                raise GameActionError("You are not in an active game.")
            if game.phase != GamePhase.PLAYING:
                raise GameActionError("Game is not in playing phase.")
            if game.turn_player_id != player_id:
                raise GameActionError("It is not your turn.")
            if not in_bounds(x, y, board_size=self._board_size):
                raise GameActionError("Shot is out of bounds.")

            target_id = game.opponent_id(player_id)
            if target_id is None:
                raise GameActionError("Opponent not found.")

            shooter_state = game.player_states[player_id]
            target_state = game.player_states[target_id]
            shot = (x, y)

            if shot in shooter_state.shots_fired:
                raise GameActionError("You already shot this cell.")

            shooter_state.shots_fired.add(shot)

            result = ShotResult.MISS
            if shot in target_state.occupied_cells:
                result = ShotResult.HIT
                for ship in target_state.ships:
                    if ship.register_hit(shot):
                        break

            winner_id: str | None = None
            next_turn_player_id: str | None = None

            if target_state.all_ships_sunk:
                game.phase = GamePhase.FINISHED
                game.winner_id = player_id
                winner_id = player_id
            else:
                game.turn_player_id = target_id
                next_turn_player_id = target_id

            return ShotOutcome(
                game_id=game.game_id,
                players=game.players,
                shooter_id=player_id,
                target_id=target_id,
                x=x,
                y=y,
                result=result,
                winner_id=winner_id,
                next_turn_player_id=next_turn_player_id,
            )

    async def finish_game(self, game_id: str) -> None:
        async with self._lock:
            game = self._games.get(game_id)
            if game is not None:
                self._remove_game_unlocked(game)

    async def begin_disconnect_grace(self, player_id: str) -> str | None:
        async with self._lock:
            game = self._game_for_player_unlocked(player_id)
            if game is None:
                return None

            disconnect_token = uuid.uuid4().hex
            self._pending_disconnects[player_id] = disconnect_token
            return disconnect_token

    async def cancel_disconnect_grace(self, player_id: str) -> None:
        async with self._lock:
            self._pending_disconnects.pop(player_id, None)

    async def finalize_disconnect_grace(
        self,
        player_id: str,
        disconnect_token: str,
    ) -> DisconnectOutcome | None:
        async with self._lock:
            pending_token = self._pending_disconnects.get(player_id)
            if pending_token != disconnect_token:
                return None

            self._pending_disconnects.pop(player_id, None)
            game = self._game_for_player_unlocked(player_id)
            if game is None:
                return None

            outcome = self._disconnect_outcome_unlocked(game, disconnected_player_id=player_id)
            self._remove_game_unlocked(game)
            return outcome

    async def handle_disconnect(self, player_id: str) -> DisconnectOutcome | None:
        async with self._lock:
            self._pending_disconnects.pop(player_id, None)
            game = self._game_for_player_unlocked(player_id)
            if game is None:
                return None

            outcome = self._disconnect_outcome_unlocked(game, disconnected_player_id=player_id)
            self._remove_game_unlocked(game)
            return outcome

    def _game_for_player_unlocked(self, player_id: str) -> GameState | None:
        game_id = self._player_to_game.get(player_id)
        if game_id is None:
            return None
        return self._games.get(game_id)

    def _create_game_unlocked(
        self,
        player_one_id: str,
        player_two_id: str,
        player_one_name: str | None = None,
        player_two_name: str | None = None,
    ) -> GameState:
        if player_one_id == player_two_id:
            raise GameActionError("A game requires two distinct players.")
        if player_one_id in self._player_to_game or player_two_id in self._player_to_game:
            raise GameActionError("One or more players are already in a game.")

        normalized_player_one_name = self._normalize_optional_name(
            player_one_name,
            fallback=player_one_id,
            label="Player one name",
        )
        normalized_player_two_name = self._normalize_optional_name(
            player_two_name,
            fallback=player_two_id,
            label="Player two name",
        )

        self._remove_invite_by_creator_unlocked(player_one_id)
        self._remove_invite_by_creator_unlocked(player_two_id)

        game_id = uuid.uuid4().hex
        game = GameState(
            game_id=game_id,
            players=(player_one_id, player_two_id),
            player_names={
                player_one_id: normalized_player_one_name,
                player_two_id: normalized_player_two_name,
            },
            phase=GamePhase.LOBBY,
            player_states={
                player_one_id: PlayerState(player_id=player_one_id),
                player_two_id: PlayerState(player_id=player_two_id),
            },
        )
        self._games[game_id] = game
        self._player_to_game[player_one_id] = game_id
        self._player_to_game[player_two_id] = game_id
        return game

    def _generate_invite_code_unlocked(self) -> str:
        while True:
            invite_code = uuid.uuid4().hex[:8]
            if invite_code not in self._pending_invites:
                return invite_code

    def _remove_invite_by_creator_unlocked(self, creator_id: str) -> PendingInvite | None:
        invite_code = self._creator_to_invite.pop(creator_id, None)
        if invite_code is None:
            return None
        invite = self._pending_invites.pop(invite_code, None)
        if invite is not None:
            return invite
        return None

    def _remove_invite_by_code_unlocked(self, invite_code: str) -> PendingInvite | None:
        invite = self._pending_invites.pop(invite_code, None)
        if invite is None:
            return None

        stored_code = self._creator_to_invite.get(invite.creator_id)
        if stored_code == invite_code:
            self._creator_to_invite.pop(invite.creator_id, None)
        return invite

    def _remove_game_unlocked(self, game: GameState) -> None:
        self._games.pop(game.game_id, None)
        for player_id in game.players:
            self._player_to_game.pop(player_id, None)
            self._pending_disconnects.pop(player_id, None)

    def _disconnect_outcome_unlocked(
        self,
        game: GameState,
        *,
        disconnected_player_id: str,
    ) -> DisconnectOutcome:
        opponent_id = game.opponent_id(disconnected_player_id)
        winner_id = game.winner_id
        if game.phase != GamePhase.FINISHED and opponent_id is not None:
            game.phase = GamePhase.FINISHED
            game.winner_id = opponent_id
            winner_id = opponent_id

        return DisconnectOutcome(
            game_id=game.game_id,
            disconnected_player_id=disconnected_player_id,
            opponent_id=opponent_id,
            winner_id=winner_id,
        )

    def _empty_board_snapshot_unlocked(self) -> BoardSnapshot:
        return [[None for _ in range(self._board_size)] for _ in range(self._board_size)]

    def _build_own_board_snapshot_unlocked(
        self,
        *,
        player_state: PlayerState,
        opponent_state: PlayerState,
    ) -> BoardSnapshot:
        board = self._empty_board_snapshot_unlocked()

        for x, y in player_state.occupied_cells:
            if in_bounds(x, y, board_size=self._board_size):
                board[y][x] = "ship"

        for x, y in opponent_state.shots_fired:
            if not in_bounds(x, y, board_size=self._board_size):
                continue
            board[y][x] = "hit" if (x, y) in player_state.occupied_cells else "miss"

        return board

    def _build_opponent_board_snapshot_unlocked(
        self,
        *,
        player_state: PlayerState,
        opponent_state: PlayerState,
    ) -> BoardSnapshot:
        board = self._empty_board_snapshot_unlocked()

        for x, y in player_state.shots_fired:
            if not in_bounds(x, y, board_size=self._board_size):
                continue
            board[y][x] = "hit" if (x, y) in opponent_state.occupied_cells else "miss"

        return board

    @staticmethod
    def _normalize_invite_code(invite_code: str) -> str:
        normalized_invite_code = invite_code.strip().lower()
        if not normalized_invite_code:
            raise GameActionError("Invite code cannot be empty.")
        return normalized_invite_code

    @staticmethod
    def _normalize_name(name: str, label: str) -> str:
        normalized_name = name.strip()
        if not normalized_name:
            raise GameActionError(f"{label} cannot be empty.")
        return normalized_name

    @classmethod
    def _normalize_optional_name(
        cls,
        name: str | None,
        *,
        fallback: str,
        label: str,
    ) -> str:
        if name is None:
            return fallback
        return cls._normalize_name(name, label=label)
