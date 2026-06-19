from __future__ import annotations

from app.models import Coordinate
from app.schemas import ShipPlacementInput

BOARD_SIZE = 10
EXPECTED_FLEET_LENGTHS: tuple[int, ...] = (5, 4, 3, 3, 2)


def in_bounds(x: int, y: int, board_size: int = BOARD_SIZE) -> bool:
    return 0 <= x < board_size and 0 <= y < board_size


def ship_cells(ship: ShipPlacementInput) -> list[Coordinate]:
    cells: list[Coordinate] = []
    for offset in range(ship.length):
        x = ship.x + (offset if ship.orientation == "horizontal" else 0)
        y = ship.y + (offset if ship.orientation == "vertical" else 0)
        cells.append((x, y))
    return cells


def validate_fleet_composition(ships: list[ShipPlacementInput]) -> None:
    expected_ship_count = len(EXPECTED_FLEET_LENGTHS)
    if len(ships) != expected_ship_count:
        raise ValueError(f"Invalid fleet size. Expected {expected_ship_count} ships.")

    expected_lengths = sorted(EXPECTED_FLEET_LENGTHS)
    submitted_lengths = sorted(ship.length for ship in ships)
    if submitted_lengths != expected_lengths:
        raise ValueError(
            "Invalid fleet composition. Expected ship lengths [5, 4, 3, 3, 2]."
        )


def validate_and_expand_ships(
    ships: list[ShipPlacementInput],
    board_size: int = BOARD_SIZE,
) -> tuple[list[set[Coordinate]], set[Coordinate]]:
    validate_fleet_composition(ships)

    expanded_ships: list[set[Coordinate]] = []
    occupied_cells: set[Coordinate] = set()

    for ship in ships:
        cells = ship_cells(ship)

        for x, y in cells:
            if not in_bounds(x, y, board_size=board_size):
                raise ValueError("Ship placement is out of bounds.")

        ship_cell_set = set(cells)
        if len(ship_cell_set) != ship.length:
            raise ValueError("Ship placement is invalid.")

        if occupied_cells.intersection(ship_cell_set):
            raise ValueError("Ship placement overlaps another ship.")

        occupied_cells.update(ship_cell_set)
        expanded_ships.append(ship_cell_set)

    return expanded_ships, occupied_cells
