import { computed, reactive, readonly } from 'vue';
import websocketService from '../services/websocket';

export const GRID_SIZE = 10;
export const SHIP_LENGTHS = [5, 4, 3, 3, 2];

const SELF_TURN_TOKEN = '__self_turn__';
const MAX_EVENTS = 16;

function createCell() {
  return {
    hasShip: false,
    shot: null,
    shipIndex: null,
  };
}

function createBoard() {
  return Array.from({ length: GRID_SIZE }, () =>
    Array.from({ length: GRID_SIZE }, () => createCell()),
  );
}

function cloneBoard(board) {
  return board.map((row) => row.map((cell) => ({ ...cell })));
}

function firstDefined(source, keys) {
  for (const key of keys) {
    if (source[key] !== undefined && source[key] !== null) {
      return source[key];
    }
  }

  return null;
}

function toObject(value) {
  return value && typeof value === 'object' ? value : null;
}

function firstDefinedFromObject(source, keys) {
  if (!source || typeof source !== 'object') {
    return null;
  }

  return firstDefined(source, keys);
}

function normalizeBoolean(value) {
  if (typeof value === 'boolean') {
    return value;
  }

  if (typeof value === 'number') {
    return value !== 0;
  }

  if (typeof value !== 'string') {
    return null;
  }

  const normalized = value.trim().toLowerCase();
  if (['true', '1', 'yes', 'y'].includes(normalized)) {
    return true;
  }

  if (['false', '0', 'no', 'n'].includes(normalized)) {
    return false;
  }

  return null;
}

function normalizePlacementOrientation(value) {
  const normalized = String(value ?? '').trim().toLowerCase();
  if (['horizontal', 'h'].includes(normalized)) {
    return 'horizontal';
  }

  if (['vertical', 'v'].includes(normalized)) {
    return 'vertical';
  }

  return null;
}

function normalizePlacementShipsSnapshot(value) {
  if (!Array.isArray(value)) {
    return null;
  }

  return value
    .map((ship) => {
      const source = toObject(ship);
      if (!source) {
        return null;
      }

      const x = Number(firstDefined(source, ['x', 'column', 'col']));
      const y = Number(firstDefined(source, ['y', 'row']));
      const length = Number(firstDefined(source, ['length', 'size']));
      const orientation = normalizePlacementOrientation(
        firstDefined(source, ['orientation', 'direction']),
      );

      if (
        !Number.isInteger(x) ||
        !Number.isInteger(y) ||
        !Number.isInteger(length) ||
        length <= 0 ||
        !orientation
      ) {
        return null;
      }

      return { x, y, length, orientation };
    })
    .filter(Boolean);
}

function createPlacementBoardFromShips(ships) {
  const board = createBoard();
  if (!Array.isArray(ships)) {
    return board;
  }

  ships.forEach((ship, idx) => {
    const length = Number(ship.length);
    if (!Number.isInteger(length) || length <= 0) {
      return;
    }

    const orientation = normalizePlacementOrientation(ship.orientation) ?? 'horizontal';
    const horizontal = orientation === 'horizontal';

    for (let offset = 0; offset < length; offset += 1) {
      const x = Number(ship.x) + (horizontal ? offset : 0);
      const y = Number(ship.y) + (horizontal ? 0 : offset);
      if (!Number.isInteger(x) || !Number.isInteger(y)) {
        continue;
      }

      if (x < 0 || x >= GRID_SIZE || y < 0 || y >= GRID_SIZE) {
        continue;
      }

      board[y][x].hasShip = true;
      board[y][x].shipIndex = idx;
    }
  });

  return board;
}

function normalizeShotResult(value) {
  const normalized = String(value ?? '').toLowerCase();
  if (normalized.includes('hit') || normalized === 'sunk') {
    return 'hit';
  }

  if (normalized.includes('miss')) {
    return 'miss';
  }

  return null;
}

function readServerErrorMessage(message) {
  const value = firstDefined(message, ['message', 'error', 'detail', 'reason']);
  if (value === null) {
    return 'Server reported an error.';
  }

  const text = String(value).trim();
  return text.length > 0 ? text : 'Server reported an error.';
}

function normalizeSnapshotCell(source, revealShips) {
  const cell = createCell();

  if (typeof source === 'string') {
    const normalized = source.toLowerCase();
    if (normalized === 'ship' && revealShips) {
      cell.hasShip = true;
    } else if (normalized === 'hit' || normalized === 'sunk') {
      cell.shot = 'hit';
      if (revealShips) {
        cell.hasShip = true;
      }
    } else if (normalized === 'miss') {
      cell.shot = 'miss';
    }
    return cell;
  }

  if (typeof source === 'boolean') {
    cell.hasShip = revealShips && source;
    return cell;
  }

  if (typeof source === 'number') {
    cell.hasShip = revealShips && source === 1;
    return cell;
  }

  if (!source || typeof source !== 'object') {
    return cell;
  }

  const shot = normalizeShotResult(source.shot ?? source.result ?? source.state);
  if (shot) {
    cell.shot = shot;
  }

  const hasShip = firstDefined(source, ['hasShip', 'has_ship', 'ship']);
  if (hasShip !== null) {
    cell.hasShip = revealShips ? Boolean(hasShip) : false;
  } else if (revealShips && cell.shot === 'hit') {
    cell.hasShip = true;
  }

  return cell;
}

function normalizeBoardSnapshot(snapshot, revealShips) {
  const board = createBoard();
  if (!Array.isArray(snapshot)) {
    return board;
  }

  for (let y = 0; y < GRID_SIZE; y += 1) {
    const row = snapshot[y];
    if (!Array.isArray(row)) {
      continue;
    }

    for (let x = 0; x < GRID_SIZE; x += 1) {
      board[y][x] = normalizeSnapshotCell(row[x], revealShips);
    }
  }

  return board;
}

function normalizeDisplayName(value) {
  const normalized = String(value ?? '').trim();
  return normalized.length > 0 ? normalized : null;
}

function normalizeInviteCode(value) {
  const normalized = String(value ?? '').trim();
  return normalized.length > 0 ? normalized : null;
}

function readConfiguredHostname() {
  const configuredHostname = String(import.meta.env.VITE_APP_HOSTNAME ?? '').trim();
  if (configuredHostname.length === 0) {
    return null;
  }

  try {
    const parsed =
      configuredHostname.includes('://')
        ? new URL(configuredHostname)
        : new URL(`http://${configuredHostname}`);
    return parsed.hostname || null;
  } catch {
    return null;
  }
}

function buildInviteLink(inviteCode) {
  const code = normalizeInviteCode(inviteCode);
  if (!code) {
    return null;
  }

  if (typeof window === 'undefined' || !window.location) {
    return `?invite=${encodeURIComponent(code)}`;
  }

  const inviteUrl = new URL(window.location.href);
  const configuredHostname = readConfiguredHostname();
  if (configuredHostname) {
    inviteUrl.hostname = configuredHostname;
  }
  inviteUrl.searchParams.set('invite', code);
  return inviteUrl.toString();
}

function readInviteCodeFromLocation() {
  if (typeof window === 'undefined' || !window.location?.search) {
    return null;
  }

  const query = new URLSearchParams(window.location.search);
  return normalizeInviteCode(query.get('invite')) ?? normalizeInviteCode(query.get('invite_code'));
}

const state = reactive({
  connected: false,
  connecting: false,
  playerId: null,
  lobbyPlayerName: '',
  lobbyOpponentName: '',
  opponentId: null,
  gameId: null,
  phase: 'lobby',
  waitingForMatch: false,
  creatingGame: false,
  joiningInvite: false,
  joinedFromInvite: false,
  inviteCode: null,
  inviteLink: null,
  pendingCreatePayload: null,
  pendingJoinInviteCode: null,
  urlInviteCode: null,
  winner: null,
  turn: null,
  boards: {
    own: createBoard(),
    opponent: createBoard(),
  },
  placement: {
    board: createBoard(),
    orientation: 'horizontal',
    ships: [],
    nextShipIndex: 0,
    submitted: false,
    selectedShipIndex: null,
  },
  pendingShot: null,
  lastShot: null,
  recentEvents: [],
  lastError: null,
});

const allShipsPlaced = computed(() => state.placement.nextShipIndex >= SHIP_LENGTHS.length);
const nextShipLength = computed(() => SHIP_LENGTHS[state.placement.nextShipIndex] ?? null);
const isMyTurn = computed(() => {
  if (state.phase !== 'playing' || state.winner) {
    return false;
  }

  if (state.turn === SELF_TURN_TOKEN) {
    return true;
  }

  if (state.playerId === null || state.turn === null || state.turn === undefined) {
    return false;
  }

  return String(state.turn) === String(state.playerId);
});

let initialized = false;
let unsubscribeFns = [];

function addEvent(text) {
  state.recentEvents.unshift({
    id: `${Date.now()}-${Math.random()}`,
    text,
  });

  if (state.recentEvents.length > MAX_EVENTS) {
    state.recentEvents.length = MAX_EVENTS;
  }
}

function resetPlacement() {
  state.placement.board = createBoard();
  state.placement.orientation = 'horizontal';
  state.placement.ships = [];
  state.placement.nextShipIndex = 0;
  state.placement.submitted = false;
  state.placement.selectedShipIndex = null;
}

function copyPlacementToOwnBoard() {
  state.boards.own = cloneBoard(state.placement.board);
}

function clearLobbyInviteState() {
  state.waitingForMatch = false;
  state.creatingGame = false;
  state.joiningInvite = false;
  state.joinedFromInvite = false;
  state.inviteCode = null;
  state.inviteLink = null;
  state.pendingCreatePayload = null;
  state.pendingJoinInviteCode = null;
  state.opponentId = null;
}

function resetMatchState() {
  state.gameId = null;
  state.phase = 'lobby';
  state.winner = null;
  state.turn = null;
  state.pendingShot = null;
  state.lastShot = null;
  state.boards.own = createBoard();
  state.boards.opponent = createBoard();
  resetPlacement();
  clearLobbyInviteState();
}

function setLobbyPlayerName(value) {
  state.lobbyPlayerName = String(value ?? '');
}

function setLobbyOpponentName(value) {
  state.lobbyOpponentName = String(value ?? '');
}

function canPlaceShipAt(board, x, y, length, orientation, ignoreShipIndex = -1) {
  const horizontal = orientation === 'horizontal';

  if (horizontal && x + length > GRID_SIZE) {
    return false;
  }

  if (!horizontal && y + length > GRID_SIZE) {
    return false;
  }

  for (let offset = 0; offset < length; offset += 1) {
    const cellX = horizontal ? x + offset : x;
    const cellY = horizontal ? y : y + offset;
    const cell = board[cellY][cellX];
    if (cell.hasShip && cell.shipIndex !== ignoreShipIndex) {
      return false;
    }
  }

  return true;
}

function rebuildPlacementBoard() {
  const board = createBoard();
  state.placement.ships.forEach((ship, idx) => {
    const horizontal = ship.orientation === 'horizontal';
    for (let offset = 0; offset < ship.length; offset += 1) {
      const x = ship.x + (horizontal ? offset : 0);
      const y = ship.y + (horizontal ? 0 : offset);
      if (x >= 0 && x < GRID_SIZE && y >= 0 && y < GRID_SIZE) {
        board[y][x].hasShip = true;
        board[y][x].shipIndex = idx;
      }
    }
  });
  state.placement.board = board;
}

function togglePlacementOrientation() {
  if (state.phase !== 'placement' || state.placement.submitted) {
    return;
  }

  state.placement.orientation =
    state.placement.orientation === 'horizontal' ? 'vertical' : 'horizontal';
}

function resetPlacementBoard() {
  if (state.phase !== 'placement' || state.placement.submitted) {
    return;
  }

  resetPlacement();
}

function placeShip(x, y) {
  if (state.phase !== 'placement' || state.placement.submitted) {
    return;
  }

  const cell = state.placement.board[y]?.[x];
  const selectedIdx = state.placement.selectedShipIndex;

  if (selectedIdx !== null) {
    const ship = state.placement.ships[selectedIdx];

    // Tapping the selected ship rotates it
    if (cell?.shipIndex === selectedIdx) {
      const newOrientation = ship.orientation === 'horizontal' ? 'vertical' : 'horizontal';
      if (!canPlaceShipAt(state.placement.board, ship.x, ship.y, ship.length, newOrientation, selectedIdx)) {
        addEvent('Cannot rotate: not enough space.');
        return;
      }
      state.placement.ships[selectedIdx] = { ...ship, orientation: newOrientation };
      rebuildPlacementBoard();
      return;
    }

    // Tapping a different placed ship selects it
    if (cell?.shipIndex !== null && cell?.shipIndex !== undefined) {
      state.placement.selectedShipIndex = cell.shipIndex;
      return;
    }

    // Tapping an empty cell moves the selected ship there
    if (!canPlaceShipAt(state.placement.board, x, y, ship.length, ship.orientation, selectedIdx)) {
      addEvent('Invalid placement. Ships cannot overlap or go out of bounds.');
      return;
    }
    state.placement.ships[selectedIdx] = { ...ship, x, y };
    state.placement.selectedShipIndex = null;
    rebuildPlacementBoard();
    return;
  }

  // Tapping a placed ship selects it
  if (cell?.hasShip && cell?.shipIndex !== null && cell?.shipIndex !== undefined) {
    state.placement.selectedShipIndex = cell.shipIndex;
    return;
  }

  // Tapping an empty cell places the next ship
  const length = nextShipLength.value;
  if (!length) {
    return;
  }

  if (!canPlaceShipAt(state.placement.board, x, y, length, state.placement.orientation)) {
    addEvent('Invalid placement. Ships cannot overlap or go out of bounds.');
    return;
  }

  state.placement.ships.push({
    x,
    y,
    length,
    orientation: state.placement.orientation,
  });
  state.placement.nextShipIndex += 1;
  rebuildPlacementBoard();

  if (allShipsPlaced.value) {
    addEvent('All ships placed. Submit when ready.');
  }
}

function connect() {
  if (state.connected || state.connecting) {
    return;
  }

  state.connecting = true;
  websocketService.connect();
}

function sendCreateGame(payload) {
  if (!payload) {
    return false;
  }

  const sent = websocketService.send({
    type: 'create_game',
    player_name: payload.playerName,
    opponent_name: payload.opponentName,
  });
  if (!sent) {
    state.lastError = 'Failed to send create_game. WebSocket is not connected.';
    state.waitingForMatch = false;
    state.creatingGame = false;
    addEvent(state.lastError);
    return false;
  }

  state.pendingCreatePayload = null;
  state.joiningInvite = false;
  state.phase = 'lobby';
  state.waitingForMatch = true;
  state.creatingGame = true;
  addEvent('Creating invite link...');
  return true;
}

function sendJoinGame(inviteCode) {
  const code = normalizeInviteCode(inviteCode);
  if (!code) {
    return false;
  }

  const sent = websocketService.send({
    type: 'join_game',
    invite_code: code,
  });

  if (!sent) {
    state.lastError = 'Failed to send join_game. WebSocket is not connected.';
    state.waitingForMatch = false;
    state.joiningInvite = false;
    addEvent(state.lastError);
    return false;
  }

  state.pendingJoinInviteCode = null;
  state.creatingGame = false;
  state.phase = 'lobby';
  state.waitingForMatch = true;
  state.joiningInvite = true;
  addEvent('Joining invite...');
  return true;
}

function flushPendingLobbyActions() {
  if (state.pendingJoinInviteCode) {
    sendJoinGame(state.pendingJoinInviteCode);
    return;
  }

  if (state.pendingCreatePayload) {
    sendCreateGame(state.pendingCreatePayload);
  }
}

function createGame() {
  const playerName = normalizeDisplayName(state.lobbyPlayerName);
  const opponentName = normalizeDisplayName(state.lobbyOpponentName);

  if (!playerName || !opponentName) {
    state.lastError = 'Please enter both player names before creating an invite.';
    addEvent(state.lastError);
    return;
  }

  state.lastError = null;
  resetMatchState();
  state.urlInviteCode = null;
  state.lobbyPlayerName = playerName;
  state.lobbyOpponentName = opponentName;
  state.pendingCreatePayload = { playerName, opponentName };
  state.creatingGame = true;
  state.waitingForMatch = true;

  if (!state.connected) {
    connect();
    addEvent('Connecting to server to create invite...');
    return;
  }

  sendCreateGame(state.pendingCreatePayload);
}

function joinGameByInvite(inviteCode, options = {}) {
  const code = normalizeInviteCode(inviteCode);
  if (!code) {
    if (!options.silent) {
      state.lastError = 'Invite code is missing.';
      addEvent(state.lastError);
    }
    return;
  }

  state.lastError = null;
  if (options.auto) {
    state.urlInviteCode = code;
  }
  resetMatchState();
  state.inviteCode = code;
  state.inviteLink = buildInviteLink(code);
  state.joinedFromInvite = true;
  state.pendingJoinInviteCode = code;
  state.joiningInvite = true;
  state.waitingForMatch = true;

  if (!state.connected) {
    connect();
    addEvent(
      options.auto
        ? 'Invite link detected. Joining game when connection is ready...'
        : 'Connecting to server to join invite...',
    );
    return;
  }

  sendJoinGame(code);
}

function submitShips() {
  if (state.phase !== 'placement' || state.placement.submitted) {
    return;
  }

  if (!allShipsPlaced.value) {
    addEvent('Place every ship before submitting.');
    return;
  }

  const ships = state.placement.ships.map(({ x, y, length, orientation }) => ({
    x,
    y,
    length,
    orientation,
  }));

  const sent = websocketService.send({ type: 'place_ships', ships });
  if (!sent) {
    state.lastError = 'Failed to send place_ships. WebSocket is not connected.';
    addEvent(state.lastError);
    return;
  }

  state.placement.submitted = true;
  copyPlacementToOwnBoard();
  addEvent('Ships submitted. Waiting for game start...');
}

function shoot(x, y) {
  if (state.phase !== 'playing' || !isMyTurn.value || state.pendingShot) {
    return;
  }

  const targetCell = state.boards.opponent[y]?.[x];
  if (!targetCell || targetCell.shot) {
    return;
  }

  const sent = websocketService.send({
    type: 'shoot',
    x,
    y,
  });

  if (!sent) {
    state.lastError = 'Failed to send shoot. WebSocket is not connected.';
    addEvent(state.lastError);
    return;
  }

  state.pendingShot = { x, y };
}

function applyServerMetadata(message) {
  const game = toObject(firstDefined(message, ['game', 'match']));
  const player = toObject(firstDefined(message, ['player', 'self']));
  const opponent = toObject(firstDefined(message, ['opponent', 'enemy']));

  const playerId =
    firstDefined(message, ['playerId', 'player_id']) ??
    firstDefinedFromObject(player, ['id', 'player_id', 'playerId']);
  if (playerId !== null) {
    state.playerId = playerId;
  }

  const gameId =
    firstDefined(message, ['gameId', 'game_id']) ??
    firstDefinedFromObject(game, ['id', 'game_id', 'gameId']);
  if (gameId !== null) {
    state.gameId = gameId;
  }

  const opponentId =
    firstDefined(message, ['opponentId', 'opponent_id']) ??
    firstDefinedFromObject(opponent, ['id', 'opponent_id', 'opponentId']);
  if (opponentId !== null) {
    state.opponentId = opponentId;
  }

  const phase = message.phase ?? firstDefinedFromObject(game, ['phase', 'state']);
  if (typeof phase === 'string') {
    state.phase = phase;
  }

  const turn =
    firstDefined(message, ['turn', 'next_turn']) ??
    firstDefinedFromObject(game, ['turn', 'next_turn', 'turn_player_id', 'turnPlayerId']);
  if (turn !== null) {
    state.turn = turn;
  }

  const winner =
    firstDefined(message, ['winner', 'winner_id']) ??
    firstDefinedFromObject(game, ['winner', 'winner_id', 'winnerId']);
  if (winner !== null) {
    state.winner = winner;
  }
}

function readInviteCodeFromMessage(message) {
  return normalizeInviteCode(firstDefined(message, ['invite_code', 'inviteCode', 'code']));
}

function readInviteLinkFromMessage(message) {
  const inviteLink = firstDefined(message, [
    'invite_link',
    'inviteLink',
    'invite_url',
    'inviteUrl',
    'link',
    'url',
  ]);

  if (inviteLink === null) {
    return null;
  }

  const normalized = String(inviteLink).trim();
  return normalized.length > 0 ? normalized : null;
}

function applyServerParticipantNames(message) {
  const player = toObject(firstDefined(message, ['player', 'self']));
  const opponent = toObject(firstDefined(message, ['opponent', 'enemy']));

  const playerName = normalizeDisplayName(firstDefined(message, ['player_name', 'playerName']));
  if (playerName !== null) {
    state.lobbyPlayerName = playerName;
  }

  const opponentName = normalizeDisplayName(firstDefined(message, ['opponent_name', 'opponentName']));
  if (opponentName !== null) {
    state.lobbyOpponentName = opponentName;
  }

  const nestedPlayerName = normalizeDisplayName(
    firstDefinedFromObject(player, ['name', 'player_name', 'playerName']),
  );
  if (nestedPlayerName !== null) {
    state.lobbyPlayerName = nestedPlayerName;
  }

  const nestedPlayerId = firstDefinedFromObject(player, ['id', 'player_id', 'playerId']);
  if (nestedPlayerId !== null) {
    state.playerId = nestedPlayerId;
  }

  const nestedOpponentName = normalizeDisplayName(
    firstDefinedFromObject(opponent, ['name', 'opponent_name', 'opponentName', 'player_name']),
  );
  if (nestedOpponentName !== null) {
    state.lobbyOpponentName = nestedOpponentName;
  }

  const nestedOpponentId = firstDefinedFromObject(opponent, ['id', 'player_id', 'playerId']);
  if (nestedOpponentId !== null) {
    state.opponentId = nestedOpponentId;
  }

  if (!message.players || typeof message.players !== 'object') {
    return;
  }

  const selfPlayer = firstDefined(message.players, ['self', 'player', 'you']);
  if (selfPlayer && typeof selfPlayer === 'object') {
    const nestedPlayerName = normalizeDisplayName(
      firstDefined(selfPlayer, ['name', 'player_name', 'playerName']),
    );
    if (nestedPlayerName !== null) {
      state.lobbyPlayerName = nestedPlayerName;
    }

    const nestedSelfPlayerId = firstDefined(selfPlayer, ['id', 'player_id', 'playerId']);
    if (nestedSelfPlayerId !== null) {
      state.playerId = nestedSelfPlayerId;
    }
  }

  const opponentPlayer = firstDefined(message.players, ['opponent', 'enemy']);
  if (!opponentPlayer || typeof opponentPlayer !== 'object') {
    return;
  }

  const nestedPlayersOpponentName = normalizeDisplayName(
    firstDefined(opponentPlayer, ['name', 'opponent_name', 'player_name']),
  );
  if (nestedPlayersOpponentName !== null) {
    state.lobbyOpponentName = nestedPlayersOpponentName;
  }

  const nestedPlayersOpponentId = firstDefined(opponentPlayer, ['id', 'player_id', 'playerId']);
  if (nestedPlayersOpponentId !== null) {
    state.opponentId = nestedPlayersOpponentId;
  }
}

function applyServerBoards(message) {
  let ownBoard = null;
  let opponentBoard = null;
  const game = toObject(firstDefined(message, ['game', 'match']));
  const player = toObject(firstDefined(message, ['player', 'self']));
  const opponent = toObject(firstDefined(message, ['opponent', 'enemy']));

  if (message.boards && typeof message.boards === 'object') {
    ownBoard = firstDefined(message.boards, ['own', 'self', 'player', 'own_board']);
    opponentBoard = firstDefined(message.boards, ['opponent', 'enemy', 'opponent_board']);
  }

  const gameBoards = firstDefinedFromObject(game, ['boards', 'board_state', 'boardState']);
  if (gameBoards && typeof gameBoards === 'object') {
    if (ownBoard === null) {
      ownBoard = firstDefined(gameBoards, ['own', 'self', 'player', 'own_board']);
    }

    if (opponentBoard === null) {
      opponentBoard = firstDefined(gameBoards, ['opponent', 'enemy', 'opponent_board']);
    }
  }

  if (ownBoard === null) {
    ownBoard =
      firstDefinedFromObject(player, ['board', 'own_board', 'ownBoard']) ??
      firstDefined(message, ['ownBoard']);
  }

  if (opponentBoard === null) {
    opponentBoard =
      firstDefinedFromObject(opponent, ['board', 'opponent_board', 'opponentBoard']) ??
      firstDefined(message, ['opponentBoard']);
  }

  if (Array.isArray(message.own_board)) {
    ownBoard = message.own_board;
  }

  if (Array.isArray(message.opponent_board)) {
    opponentBoard = message.opponent_board;
  }

  const ownApplied = Array.isArray(ownBoard);
  const opponentApplied = Array.isArray(opponentBoard);

  if (ownApplied) {
    state.boards.own = normalizeBoardSnapshot(ownBoard, true);
  }

  if (opponentApplied) {
    state.boards.opponent = normalizeBoardSnapshot(opponentBoard, false);
  }

  return {
    ownApplied,
    opponentApplied,
  };
}

function resolveShotBoard(message, x, y) {
  const boardHint = String(
    firstDefined(message, ['board', 'target', 'target_board', 'board_name']) ?? '',
  ).toLowerCase();

  if (['opponent', 'enemy'].includes(boardHint)) {
    return 'opponent';
  }

  if (['own', 'self', 'player'].includes(boardHint)) {
    return 'own';
  }

  const shooterId = firstDefined(message, ['shooter', 'shooter_id', 'by', 'player_id']);
  if (shooterId !== null && state.playerId !== null) {
    return String(shooterId) === String(state.playerId) ? 'opponent' : 'own';
  }

  const targetPlayerId = firstDefined(message, ['target_player', 'target_player_id']);
  if (targetPlayerId !== null && state.playerId !== null) {
    return String(targetPlayerId) === String(state.playerId) ? 'own' : 'opponent';
  }

  if (state.pendingShot && state.pendingShot.x === x && state.pendingShot.y === y) {
    return 'opponent';
  }

  return 'own';
}

function applyShotToBoard(boardName, x, y, result) {
  if (!Number.isInteger(x) || !Number.isInteger(y)) {
    return;
  }

  if (x < 0 || x >= GRID_SIZE || y < 0 || y >= GRID_SIZE) {
    return;
  }

  const board = boardName === 'opponent' ? state.boards.opponent : state.boards.own;
  const cell = board[y][x];
  cell.shot = result;

  if (boardName === 'opponent' && result === 'hit') {
    cell.hasShip = true;
  }
}

function handleShotResult(message) {
  const x = Number(message.x);
  const y = Number(message.y);
  const result = normalizeShotResult(message.result) ?? 'miss';

  if (!Number.isInteger(x) || !Number.isInteger(y)) {
    addEvent(`Shot result: ${result}`);
    return;
  }

  const boardName = resolveShotBoard(message, x, y);
  applyShotToBoard(boardName, x, y, result);
  state.lastShot = { x, y, board: boardName };

  const wasPendingShot =
    state.pendingShot && state.pendingShot.x === x && state.pendingShot.y === y;
  if (wasPendingShot) {
    state.pendingShot = null;
  }

  const explicitTurn = firstDefined(message, ['turn', 'next_turn']);
  if (explicitTurn === null && wasPendingShot) {
    state.turn = null;
  }

  const actor = boardName === 'opponent' ? 'You' : 'Opponent';
  addEvent(`${actor} ${result === 'hit' ? 'hit' : 'missed'} at (${x}, ${y}).`);
}

function handleServerError(message) {
  const errorMessage = readServerErrorMessage(message);
  state.lastError = errorMessage;
  addEvent(`Error: ${errorMessage}`);

  state.pendingShot = null;
  state.pendingCreatePayload = null;
  state.pendingJoinInviteCode = null;
  state.creatingGame = false;
  state.joiningInvite = false;

  if (state.phase === 'matched') {
    state.waitingForMatch = false;
    state.phase = 'lobby';
    state.turn = null;
    return;
  }

  if (state.phase === 'lobby') {
    state.waitingForMatch = false;
    return;
  }

  if (state.phase === 'placement') {
    state.waitingForMatch = false;
    if (state.placement.submitted) {
      state.placement.submitted = false;
    }
    return;
  }

  if (state.phase === 'playing') {
    state.waitingForMatch = false;
    return;
  }

  if (state.phase === 'finished') {
    state.waitingForMatch = false;
    state.turn = null;
    return;
  }

  state.waitingForMatch = false;
}

function applyStateSync(message, boardStatus) {
  const game = toObject(firstDefined(message, ['game', 'match']));
  const player = toObject(firstDefined(message, ['player', 'self']));
  const placement = toObject(firstDefined(message, ['placement', 'placement_state', 'placementState']));
  const invite = toObject(firstDefined(message, ['invite']));

  const syncedTurn =
    firstDefined(message, ['turn', 'next_turn']) ??
    firstDefinedFromObject(game, ['turn', 'next_turn', 'turn_player_id', 'turnPlayerId']);
  const syncedWinner =
    firstDefined(message, ['winner', 'winner_id']) ??
    firstDefinedFromObject(game, ['winner', 'winner_id', 'winnerId']);

  state.winner = syncedWinner;
  state.turn = state.phase === 'finished' ? null : syncedTurn;

  const syncedOrientation = normalizePlacementOrientation(
    firstDefinedFromObject(placement, ['orientation']) ??
      firstDefined(message, ['placement_orientation', 'placementOrientation']),
  );
  if (syncedOrientation) {
    state.placement.orientation = syncedOrientation;
  }

  const syncedPlacementSubmitted = normalizeBoolean(
    firstDefined(message, ['placement_submitted', 'placementSubmitted', 'ships_placed', 'shipsPlaced']) ??
      firstDefinedFromObject(placement, [
        'submitted',
        'placement_submitted',
        'placementSubmitted',
        'ships_placed',
        'shipsPlaced',
      ]) ??
      firstDefinedFromObject(player, [
        'placement_submitted',
        'placementSubmitted',
        'ships_placed',
        'shipsPlaced',
        'submitted',
      ]) ??
      firstDefinedFromObject(game, ['placement_submitted', 'placementSubmitted']),
  );
  if (syncedPlacementSubmitted !== null) {
    state.placement.submitted = syncedPlacementSubmitted;
  } else if (state.phase !== 'placement') {
    state.placement.submitted = false;
  }

  const syncedShips = normalizePlacementShipsSnapshot(
    firstDefinedFromObject(placement, ['ships', 'placements']) ??
      firstDefinedFromObject(player, ['placement_ships', 'placementShips', 'ships']) ??
      firstDefined(message, ['placement_ships', 'placementShips']),
  );

  if (syncedShips !== null) {
    state.placement.ships = syncedShips;
    state.placement.nextShipIndex = Math.min(syncedShips.length, SHIP_LENGTHS.length);
  } else if (state.phase === 'placement') {
    state.placement.ships = [];
    state.placement.nextShipIndex = state.placement.submitted ? SHIP_LENGTHS.length : 0;
  } else if (state.phase !== 'placement') {
    state.placement.ships = [];
    state.placement.nextShipIndex = 0;
  }

  const syncedPlacementBoard =
    firstDefinedFromObject(placement, ['board', 'placement_board', 'placementBoard']) ??
    firstDefinedFromObject(player, ['placement_board', 'placementBoard']) ??
    firstDefined(message, ['placement_board', 'placementBoard']);

  if (Array.isArray(syncedPlacementBoard)) {
    state.placement.board = normalizeBoardSnapshot(syncedPlacementBoard, true);
  } else if (state.phase === 'placement' && boardStatus.ownApplied) {
    state.placement.board = cloneBoard(state.boards.own);
  } else if (state.phase === 'placement' && syncedShips !== null) {
    state.placement.board = createPlacementBoardFromShips(syncedShips);
  } else if (state.phase !== 'placement') {
    state.placement.board = createBoard();
  }

  if (state.phase === 'placement' && state.placement.submitted) {
    state.placement.nextShipIndex = SHIP_LENGTHS.length;
  }

  const inviteCodeFromSync =
    readInviteCodeFromMessage(message) ??
    normalizeInviteCode(firstDefinedFromObject(invite, ['code', 'invite_code', 'inviteCode']));
  const inviteLinkFromSync = readInviteLinkFromMessage(message) ?? readInviteLinkFromMessage(invite ?? {});

  if (inviteCodeFromSync !== null) {
    state.inviteCode = inviteCodeFromSync;
  }

  if (inviteLinkFromSync !== null) {
    state.inviteLink = inviteLinkFromSync;
  } else if (inviteCodeFromSync !== null) {
    state.inviteLink = buildInviteLink(inviteCodeFromSync);
  }

  const joinedFromInvite = normalizeBoolean(
    firstDefined(message, ['joined_from_invite', 'joinedFromInvite']) ??
      firstDefinedFromObject(invite, ['joined_from_invite', 'joinedFromInvite']),
  );
  if (joinedFromInvite !== null) {
    state.joinedFromInvite = joinedFromInvite;
  }

  const hasRestorableMatch =
    Boolean(state.gameId) || ['matched', 'placement', 'playing', 'finished'].includes(state.phase);

  if (hasRestorableMatch) {
    state.pendingCreatePayload = null;
    state.pendingJoinInviteCode = null;
    state.creatingGame = false;
    state.joiningInvite = false;
    state.waitingForMatch = state.phase === 'matched' || (state.phase === 'lobby' && Boolean(state.gameId));

    if (['placement', 'playing', 'finished'].includes(state.phase)) {
      state.inviteCode = null;
      state.inviteLink = null;
      state.joinedFromInvite = false;
    }
  } else {
    const hasPendingLobbyAction = Boolean(
      state.pendingCreatePayload ||
        state.pendingJoinInviteCode ||
        state.creatingGame ||
        state.joiningInvite,
    );

    const waitingFromSync = normalizeBoolean(
      firstDefined(message, ['waiting_for_match', 'waitingForMatch']) ??
        firstDefinedFromObject(game, ['waiting_for_match', 'waitingForMatch']),
    );
    if (waitingFromSync !== null) {
      state.waitingForMatch = waitingFromSync || hasPendingLobbyAction;
    } else {
      state.waitingForMatch = Boolean(
        state.inviteCode ||
          state.inviteLink ||
          state.pendingCreatePayload ||
          state.pendingJoinInviteCode ||
          state.creatingGame ||
          state.joiningInvite,
      );
    }

    const creatingFromSync = normalizeBoolean(firstDefined(message, ['creating_game', 'creatingGame']));
    if (creatingFromSync !== null) {
      state.creatingGame = creatingFromSync;
    }

    const joiningFromSync = normalizeBoolean(firstDefined(message, ['joining_invite', 'joiningInvite']));
    if (joiningFromSync !== null) {
      state.joiningInvite = joiningFromSync;
    }
  }

  state.pendingShot = null;
}

function handleServerMessage(message) {
  if (!message || typeof message !== 'object') {
    return;
  }

  if (message.type !== 'error') {
    state.lastError = null;
  }
  applyServerMetadata(message);
  applyServerParticipantNames(message);
  const boardStatus = applyServerBoards(message);

  switch (message.type) {
    case 'connected':
      break;

    case 'state_sync':
      applyStateSync(message, boardStatus);
      addEvent('Session restored from server state.');
      break;

    case 'invite_created': {
      state.pendingCreatePayload = null;
      state.creatingGame = false;
      state.joiningInvite = false;
      state.joinedFromInvite = false;
      state.phase = 'lobby';
      state.waitingForMatch = true;

      const inviteCode = readInviteCodeFromMessage(message);
      const inviteLink = buildInviteLink(inviteCode) ?? readInviteLinkFromMessage(message);

      state.inviteCode = inviteCode;
      state.inviteLink = inviteLink;

      if (!state.inviteCode && inviteLink) {
        try {
          const parsedInviteLink =
            typeof window !== 'undefined'
              ? new URL(inviteLink, window.location.href)
              : new URL(inviteLink);
          state.inviteCode =
            normalizeInviteCode(parsedInviteLink.searchParams.get('invite')) ??
            normalizeInviteCode(parsedInviteLink.searchParams.get('invite_code'));
        } catch {
          state.inviteCode = null;
        }
      }

      addEvent(
        state.inviteLink
          ? 'Invite created. Share the invite link with your opponent.'
          : 'Invite created. Waiting for opponent...',
      );
      break;
    }

    case 'match_found':
      state.pendingCreatePayload = null;
      state.pendingJoinInviteCode = null;
      state.creatingGame = false;
      state.joiningInvite = false;
      state.waitingForMatch = true;
      state.phase = 'matched';
      addEvent(
        state.lobbyOpponentName
          ? `Match found against ${state.lobbyOpponentName}. Waiting for placement phase...`
          : 'Match found. Waiting for placement phase...',
      );
      break;

    case 'start_placement':
      state.waitingForMatch = false;
      state.phase = 'placement';
      state.creatingGame = false;
      state.joiningInvite = false;
      state.pendingCreatePayload = null;
      state.pendingJoinInviteCode = null;
      state.inviteCode = null;
      state.inviteLink = null;
      state.joinedFromInvite = false;
      state.winner = null;
      state.turn = null;
      state.pendingShot = null;
      state.lastShot = null;
      state.boards.own = createBoard();
      state.boards.opponent = createBoard();
      resetPlacement();
      addEvent('Placement started.');
      break;

    case 'game_start':
      state.phase = 'playing';
      state.waitingForMatch = false;
      state.pendingShot = null;
      if (!boardStatus.ownApplied) {
        copyPlacementToOwnBoard();
      }
      addEvent('Game started.');
      break;

    case 'your_turn': {
      state.phase = 'playing';
      state.pendingShot = null;
      const turn = firstDefined(message, ['turn', 'next_turn']);
      state.turn = turn ?? (state.playerId ?? SELF_TURN_TOKEN);
      addEvent('Your turn.');
      break;
    }

    case 'shot_result':
      handleShotResult(message);
      break;

    case 'game_over': {
      state.phase = 'finished';
      state.waitingForMatch = false;
      state.pendingShot = null;
      state.turn = null;
      state.winner = firstDefined(message, ['winner', 'winner_id']);

      const didWin =
        state.winner !== null && state.playerId !== null
          ? String(state.winner) === String(state.playerId)
          : false;
      addEvent(didWin ? 'Game over. You won!' : `Game over. Winner: ${state.winner ?? 'unknown'}.`);
      break;
    }

    case 'error':
      handleServerError(message);
      break;

    default:
      break;
  }
}

function handleOpen() {
  state.connected = true;
  state.connecting = false;
  state.lastError = null;
  addEvent('Connected to server.');
  flushPendingLobbyActions();
}

function handleClose() {
  state.connected = false;
  state.connecting = false;
  state.pendingShot = null;

  const hasRestorableSession =
    Boolean(state.gameId) ||
    ['matched', 'placement', 'playing', 'finished'].includes(state.phase) ||
    Boolean(
      state.inviteCode ||
        state.inviteLink ||
        state.pendingCreatePayload ||
        state.pendingJoinInviteCode ||
        state.creatingGame ||
        state.joiningInvite,
    );

  if (!hasRestorableSession) {
    addEvent('Disconnected from server.');
    return;
  }

  if (state.pendingJoinInviteCode || state.joiningInvite || state.urlInviteCode) {
    const retryInviteCode = state.pendingJoinInviteCode ?? state.urlInviteCode ?? state.inviteCode;
    if (retryInviteCode) {
      state.inviteCode = retryInviteCode;
      state.inviteLink = state.inviteLink ?? buildInviteLink(retryInviteCode);
      state.joinedFromInvite = true;
      state.joiningInvite = true;
      state.waitingForMatch = true;
      state.pendingJoinInviteCode = retryInviteCode;
    }
    addEvent('Disconnected from server. Reconnect to continue joining the invite.');
    return;
  }

  if (state.pendingCreatePayload || state.creatingGame) {
    state.creatingGame = true;
    state.waitingForMatch = true;
    addEvent('Disconnected from server. Reconnect to continue creating the invite.');
    return;
  }

  addEvent('Disconnected from server. Reconnect to restore your session.');
}

function handleError(error) {
  const isServerErrorPayload =
    error &&
    typeof error === 'object' &&
    !('target' in error) &&
    !('currentTarget' in error) &&
    error.type === 'error' &&
    typeof error.message === 'string';

  if (isServerErrorPayload) {
    return;
  }

  const message =
    error instanceof Error && error.message ? `WebSocket error: ${error.message}` : 'WebSocket error.';

  state.lastError = message;
  state.connecting = false;
  addEvent(message);
}

function init() {
  if (initialized) {
    return;
  }

  initialized = true;
  unsubscribeFns = [
    websocketService.on('open', handleOpen),
    websocketService.on('close', handleClose),
    websocketService.on('error', handleError),
    websocketService.on('message', handleServerMessage),
  ];

  if (typeof document !== 'undefined') {
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible' && !state.connected && !state.connecting) {
        connect();
      }
    };
    document.addEventListener('visibilitychange', onVisibilityChange);
    unsubscribeFns.push(() => document.removeEventListener('visibilitychange', onVisibilityChange));
  }

  const inviteCode = readInviteCodeFromLocation();
  if (inviteCode) {
    state.urlInviteCode = inviteCode;
    joinGameByInvite(inviteCode, { auto: true });
    return;
  }

  connect();
}

function destroy() {
  unsubscribeFns.forEach((unsubscribe) => unsubscribe());
  unsubscribeFns = [];
  initialized = false;
  websocketService.close();
}

const store = {
  state: readonly(state),
  init,
  destroy,
  connect,
  setLobbyPlayerName,
  setLobbyOpponentName,
  createGame,
  joinGameByInvite,
  togglePlacementOrientation,
  resetPlacementBoard,
  placeShip,
  submitShips,
  shoot,
  allShipsPlaced,
  nextShipLength,
  isMyTurn,
};

export function useGameStore() {
  return store;
}
