<script setup>
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import Board from './Board.vue';
import FleetStatus from './FleetStatus.vue';
import { SHIP_LENGTHS, useGameStore } from '../store/game';

const game = useGameStore();
const state = game.state;

const nextShipLength = game.nextShipLength;
const nextFleetIndex = game.nextFleetIndex;
const allShipsPlaced = game.allShipsPlaced;
const isMyTurn = game.isMyTurn;

const placementShips = computed(() =>
  SHIP_LENGTHS.map((length, index) => ({
    key: `${length}-${index}`,
    index,
    length,
    name: SHIP_NAMES[index] ?? `Ship ${length}`,
    placed: state.placement.ships[index] !== null,
    current: index === nextFleetIndex.value,
    pendingSelected: index === state.placement.pendingShipIndex,
    boardSelected: index === state.placement.selectedShipIndex,
  })),
);

const turnText = computed(() => {
  if (state.phase !== 'playing' || state.winner) {
    return '';
  }

  return isMyTurn.value ? 'Your turn' : 'Opponent turn';
});

const winnerText = computed(() => {
  if (!state.winner) {
    return 'Game over';
  }

  if (state.playerId !== null && String(state.winner) === String(state.playerId)) {
    return `${state.lobbyPlayerName || 'You'} won!`;
  }

  return `${state.lobbyOpponentName || 'Opponent'} won!`;
});

const SHIP_NAMES = ['Carrier', 'Battleship', 'Submarine', 'Destroyer', 'Patrol Boat'];
const TOTAL_FLEET_CELLS = SHIP_LENGTHS.reduce((s, l) => s + l, 0);

const ownFleetStatus = computed(() => {
  if (!state.ownFleet?.length) return null;
  return state.ownFleet.map((ship, idx) => {
    const horizontal = ship.orientation === 'horizontal';
    const cells = Array.from({ length: ship.length }, (_, i) => {
      const x = ship.x + (horizontal ? i : 0);
      const y = ship.y + (horizontal ? 0 : i);
      return { hit: state.boards.own[y]?.[x]?.shot === 'hit' };
    });
    const hitCount = cells.filter((c) => c.hit).length;
    return {
      name: SHIP_NAMES[idx] ?? `Ship ${ship.length}`,
      cells,
      hitCount,
      sunk: hitCount === ship.length,
    };
  });
});

const opponentFleetStatus = computed(() => {
  const sunkLengths = [...state.opponentSunkShips];
  return SHIP_LENGTHS.map((length, idx) => {
    const sunkIdx = sunkLengths.indexOf(length);
    const sunk = sunkIdx !== -1;
    if (sunk) sunkLengths.splice(sunkIdx, 1);
    const cells = Array.from({ length }, () => ({ hit: sunk }));
    return { name: SHIP_NAMES[idx] ?? `Ship ${length}`, cells, hitCount: sunk ? length : 0, sunk };
  });
});

const connectionText = computed(() => {
  if (state.connected) return 'Connected';
  return state.connecting ? 'Connecting...' : 'Disconnected';
});

const controlButtonClass = 'ui-soft-button';
const submitButtonClass = 'ui-primary-button';


const shortGameId = computed(() => {
  if (state.gameId === null) {
    return '---';
  }
  return String(state.gameId);
});

const statusHeadline = computed(() => {
  if (state.phase === 'placement') {
    return 'DEPLOY YOUR FLEET';
  }
  if (state.phase === 'finished') {
    return 'GAME FINISHED';
  }
  return isMyTurn.value ? 'YOUR MOVE' : 'OPPONENT MOVE';
});

const statusSupportText = computed(() => {
  if (state.phase === 'placement') {
    return nextShipLength.value
      ? `Place ship length ${nextShipLength.value}`
      : 'All ships placed. Submit your setup.';
  }
  if (state.pendingShot) {
    return 'Waiting for shot result...';
  }
  if (state.phase === 'finished') {
    return winnerText.value;
  }
  return turnText.value || 'In progress';
});

const playerStateText = computed(() => {
  if (state.phase === 'placement') {
    return state.placement.submitted ? 'Formation locked' : 'Deploying ships';
  }
  if (state.phase === 'finished') {
    return winnerText.value;
  }
  return isMyTurn.value ? 'Your move' : 'Waiting';
});

const opponentStateText = computed(() => {
  if (state.phase === 'placement') {
    return 'Awaiting opponent setup';
  }
  if (state.phase === 'finished') {
    return 'Match complete';
  }
  return isMyTurn.value ? 'Opponent waiting' : 'Opponent move';
});

function formatEventTime(rawId) {
  const stamp = Number(String(rawId).split('-')[0]);
  if (!Number.isInteger(stamp)) {
    return '--:--:--';
  }
  return new Date(stamp).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

const eventCards = computed(() =>
  state.recentEvents.slice(0, 7).map((event) => ({
    ...event,
    time: formatEventTime(event.id),
  })),
);

const activeMobileBoard = ref('opponent');

let shotSwitchTimer = null;
let turnSwitchTimer = null;

onBeforeUnmount(() => {
  clearTimeout(shotSwitchTimer);
  clearTimeout(turnSwitchTimer);
});

watch(
  () => state.lastShot,
  (shot) => {
    if (!shot) return;
    clearTimeout(shotSwitchTimer);
    shotSwitchTimer = setTimeout(() => setActiveMobileBoard(shot.board), 800);
  },
);

watch(isMyTurn, (nowMyTurn) => {
  if (!nowMyTurn) return;
  clearTimeout(turnSwitchTimer);
  turnSwitchTimer = setTimeout(() => setActiveMobileBoard('opponent'), 1800);
});

function onPlacementCellSelect({ x, y }) {
  game.placeShip(x, y);
}

function onShipMove({ shipIndex, x, y }) {
  game.moveShip(shipIndex, x, y);
}

function onShotSelect({ x, y }) {
  game.shoot(x, y);
}

function setActiveMobileBoard(boardName) {
  if (boardName === 'own' || boardName === 'opponent') {
    activeMobileBoard.value = boardName;
  }
}
</script>

<template>
  <section class="grid gap-4 xl:grid-cols-[280px_minmax(0,1fr)_320px]">
    <aside class="order-2 space-y-4 xl:order-1">
      <div class="hidden ui-card space-y-4 p-4 sm:block">
      <p class="ui-card-title">Players</p>
      <article class="rounded-xl border border-slate-200 bg-slate-50 p-3">
        <p class="text-xs font-semibold uppercase tracking-wide text-indigo-500">You</p>
        <p class="mt-1 text-base font-bold text-slate-900">{{ state.lobbyPlayerName || 'Player' }}</p>
        <p class="mt-2 text-sm text-slate-600">{{ playerStateText }}</p>
      </article>
      <article class="rounded-xl border border-slate-200 bg-slate-50 p-3">
        <p class="text-xs font-semibold uppercase tracking-wide text-violet-500">Opponent</p>
        <p class="mt-1 text-base font-bold text-slate-900">{{ state.lobbyOpponentName || 'Opponent' }}</p>
        <p class="mt-2 text-sm text-slate-600">{{ opponentStateText }}</p>
      </article>
      </div>

      <div class="ui-card space-y-3 p-4">
      <p class="ui-card-title">Actions</p>

      <template v-if="state.phase === 'placement'">
        <button
          type="button"
          :class="controlButtonClass"
          :disabled="state.placement.submitted"
          @click="game.resetPlacementBoard"
        >
          Reset placement
        </button>

        <button
          type="button"
          :class="submitButtonClass"
          :disabled="!allShipsPlaced || state.placement.submitted"
          @click="game.submitShips"
        >
          {{ state.placement.submitted ? 'Submitted' : 'Submit ships' }}
        </button>
      </template>
      <template v-else>
        <button type="button" class="ui-secondary-button" disabled>
          {{ turnText || 'In progress' }}
        </button>
        <button type="button" class="ui-primary-button" disabled>
          {{ state.pendingShot ? 'Resolving shot...' : 'Waiting action' }}
        </button>
      </template>
      </div>

      <div class="ui-card p-4">
      <p class="ui-card-title mb-2">Type of game</p>
      <label class="flex items-center gap-2 text-sm text-slate-700">
        <input checked disabled type="checkbox" class="accent-violet-500" />
        According to the rules
      </label>
      </div>
    </aside>

    <section class="order-1 flex flex-col gap-2 sm:gap-4 xl:order-2">
      <!-- Mobile player names bar -->
      <div class="ui-card flex items-center justify-around px-3 py-1.5 sm:hidden">
        <div class="text-center">
          <p class="text-sm font-bold text-slate-900">{{ state.lobbyPlayerName || 'You' }}</p>
          <p class="text-[10px] text-slate-500">{{ playerStateText }}</p>
        </div>
        <span class="text-xs font-semibold text-slate-400">vs</span>
        <div class="text-center">
          <p class="text-sm font-bold text-slate-900">{{ state.lobbyOpponentName || 'Opponent' }}</p>
          <p class="text-[10px] text-slate-500">{{ opponentStateText }}</p>
        </div>
      </div>

      <div class="order-1 rounded-2xl bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 px-4 py-2 text-white shadow-[0_22px_45px_-30px_rgba(15,23,42,0.9)] sm:px-5 sm:py-4">
      <p class="hidden text-[11px] font-semibold uppercase tracking-[0.2em] text-indigo-200 sm:block">Game status</p>
      <h2 class="text-base font-semibold tracking-wide sm:mt-0.5 sm:text-xl">{{ statusHeadline }}</h2>
      <p class="text-xs text-slate-300 sm:text-sm">{{ statusSupportText }}</p>
      </div>

      <div class="order-2 space-y-4">
      <template v-if="state.phase === 'placement'">
      <Board
        title="Deployment board"
        :board="state.placement.board"
        :reveal-ships="true"
        :interactive="!state.placement.submitted"
        :selected-ship-index="state.placement.selectedShipIndex"
        :placement-ships="state.placement.ships"
        @cell-select="onPlacementCellSelect"
        @ship-move="onShipMove"
      />

      <ul class="ui-card divide-y divide-slate-100 overflow-hidden p-0">
        <li
          v-for="ship in placementShips"
          :key="ship.key"
          :class="[
            'flex cursor-pointer items-center gap-3 px-3 py-2 transition-colors select-none',
            ship.placed && !ship.boardSelected ? 'opacity-40 hover:opacity-70' : '',
            ship.pendingSelected ? 'bg-indigo-100/80 ring-1 ring-inset ring-indigo-300' : ship.current && !ship.placed ? 'bg-indigo-50/60' : '',
            ship.boardSelected ? 'bg-indigo-50/60' : '',
            state.placement.submitted ? 'cursor-default' : '',
          ]"
          @click="game.selectShipFromPanel(ship.index)"
        >
          <div class="flex gap-px">
            <span
              v-for="i in ship.length"
              :key="i"
              :class="[
                'h-4 w-4 rounded-[3px] border',
                ship.placed
                  ? 'border-emerald-300/80 bg-emerald-400/60'
                  : ship.pendingSelected
                    ? 'border-indigo-400/90 bg-indigo-500/70'
                    : ship.current
                      ? 'border-indigo-300/80 bg-indigo-400/60'
                      : 'border-slate-500/50 bg-slate-600/30',
              ]"
            />
          </div>
          <span :class="['flex-1 text-xs font-semibold', ship.placed && !ship.boardSelected ? 'text-slate-400' : ship.pendingSelected ? 'text-indigo-700' : ship.current ? 'text-indigo-600' : 'text-slate-500']">
            {{ ship.name }}
          </span>
          <span v-if="ship.placed" class="text-[10px] font-bold text-emerald-500">✓</span>
          <span v-else-if="ship.pendingSelected" class="text-[10px] font-semibold text-indigo-500">selected</span>
          <span v-else-if="ship.current" class="text-[10px] font-semibold text-indigo-400">next</span>
        </li>
      </ul>
      </template>
      <template v-else>
      <div class="mb-2 flex items-center gap-2 sm:hidden">
        <button
          type="button"
          class="flex-1 rounded-lg border px-3 py-1.5 text-sm font-semibold transition"
          :class="
            activeMobileBoard === 'own'
              ? 'border-indigo-300 bg-indigo-50 text-indigo-700'
              : 'border-slate-200 bg-white text-slate-600'
          "
          @click="setActiveMobileBoard('own')"
        >
          Your board
        </button>
        <button
          type="button"
          class="flex-1 rounded-lg border px-3 py-1.5 text-sm font-semibold transition"
          :class="
            activeMobileBoard === 'opponent'
              ? 'border-indigo-300 bg-indigo-50 text-indigo-700'
              : 'border-slate-200 bg-white text-slate-600'
          "
          @click="setActiveMobileBoard('opponent')"
        >
          Opponent board
        </button>
      </div>

      <div class="sm:hidden">
        <Board
          v-if="activeMobileBoard === 'own'"
          title="Your board"
          :board="state.boards.own"
          :reveal-ships="true"
          :last-shot="state.lastShot?.board === 'own' ? state.lastShot : null"
        />
        <Board
          v-else
          title="Opponent board"
          :board="state.boards.opponent"
          :interactive="isMyTurn && state.phase === 'playing' && !state.pendingShot"
          :pending-shot="state.pendingShot"
          :last-shot="state.lastShot?.board === 'opponent' ? state.lastShot : null"
          @cell-select="onShotSelect"
        />
      </div>

      <!-- Mobile fleet status -->
      <div class="sm:hidden">
        <FleetStatus
          v-if="activeMobileBoard === 'own' && ownFleetStatus"
          label="Your fleet"
          :ships="ownFleetStatus"
        />
        <FleetStatus
          v-else-if="activeMobileBoard === 'opponent'"
          label="Opponent fleet"
          :ships="opponentFleetStatus"
        />
      </div>

      <div class="hidden grid-cols-2 gap-2 sm:grid sm:gap-3 lg:gap-4">
        <Board
          title="Your board"
          :board="state.boards.own"
          :reveal-ships="true"
          :compact="true"
          :last-shot="state.lastShot?.board === 'own' ? state.lastShot : null"
        />
        <Board
          title="Opponent board"
          :board="state.boards.opponent"
          :compact="true"
          :interactive="isMyTurn && state.phase === 'playing' && !state.pendingShot"
          :pending-shot="state.pendingShot"
          :last-shot="state.lastShot?.board === 'opponent' ? state.lastShot : null"
          @cell-select="onShotSelect"
        />
      </div>

      <!-- Desktop fleet status row -->
      <div class="hidden grid-cols-2 gap-2 sm:grid sm:gap-3 lg:gap-4">
        <FleetStatus v-if="ownFleetStatus" label="Your fleet" :ships="ownFleetStatus" />
        <div v-else class="ui-card p-3" />
        <FleetStatus label="Opponent fleet" :ships="opponentFleetStatus" />
      </div>

      <p v-if="state.phase === 'finished'" class="ui-card px-4 py-3 text-base font-bold text-slate-900">
        {{ winnerText }}
      </p>
      </template>
      </div>

      <!-- Mobile bottom strip: game ID + connection status -->
      <div class="order-3 flex items-center justify-between rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-xs sm:hidden">
        <span :class="state.connected ? 'text-emerald-600' : 'text-rose-600'" class="font-semibold">
          {{ connectionText }}
        </span>
        <span class="text-slate-500">Game {{ shortGameId }}</span>
      </div>
    </section>

    <aside class="order-3 hidden space-y-4 xl:block">
      <div class="ui-card p-4">
      <div class="flex items-center justify-between gap-3">
        <p class="ui-card-title">Match activity</p>
        <span class="rounded-full bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-600">
          {{ eventCards.length }} events
        </span>
      </div>
      <p class="mt-2 text-sm text-slate-600">Live game feed derived from server events.</p>
      </div>

      <div class="space-y-3">
      <article
        v-for="event in eventCards"
        :key="event.id"
        class="ui-card p-4"
      >
        <div class="flex items-center justify-between gap-3">
          <p class="text-sm font-semibold text-slate-900">{{ event.text }}</p>
          <span class="text-xs font-medium text-slate-500">{{ event.time }}</span>
        </div>
      </article>
      <article v-if="eventCards.length === 0" class="ui-card p-4 text-sm text-slate-600">
        Match events will appear here once gameplay starts.
      </article>
      </div>
    </aside>
  </section>
</template>
