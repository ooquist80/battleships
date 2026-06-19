<script setup>
import { computed } from 'vue';
import Board from './Board.vue';
import { SHIP_LENGTHS, useGameStore } from '../store/game';

const game = useGameStore();
const state = game.state;

const nextShipLength = game.nextShipLength;
const allShipsPlaced = game.allShipsPlaced;
const isMyTurn = game.isMyTurn;

const placementShips = computed(() =>
  SHIP_LENGTHS.map((length, index) => ({
    key: `${length}-${index}`,
    length,
    placed: index < state.placement.nextShipIndex,
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
    return 'You won!';
  }

  return `Winner: ${state.winner}`;
});

const controlButtonClass = 'ui-soft-button';
const submitButtonClass = 'ui-primary-button';

const shortPlayerId = computed(() => {
  if (state.playerId === null) {
    return 'Pending';
  }
  const value = String(state.playerId);
  if (value.length <= 10) {
    return value;
  }
  return `${value.slice(0, 6)}...${value.slice(-4)}`;
});

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

function onPlacementCellSelect({ x, y }) {
  game.placeShip(x, y);
}

function onShotSelect({ x, y }) {
  game.shoot(x, y);
}
</script>

<template>
  <section class="grid gap-4 xl:grid-cols-[280px_minmax(0,1fr)_320px]">
    <aside class="order-2 space-y-4 xl:order-1">
      <div class="ui-card space-y-4 p-4">
      <p class="ui-card-title">Players</p>
      <article class="rounded-xl border border-slate-200 bg-slate-50 p-3">
        <p class="text-xs font-semibold uppercase tracking-wide text-indigo-500">Player One</p>
        <p class="mt-1 text-base font-bold text-slate-900">{{ shortPlayerId }}</p>
        <p class="mt-2 text-sm text-slate-600">{{ playerStateText }}</p>
      </article>
      <article class="rounded-xl border border-slate-200 bg-slate-50 p-3">
        <p class="text-xs font-semibold uppercase tracking-wide text-violet-500">Player Two</p>
        <p class="mt-1 text-base font-bold text-slate-900">Opponent</p>
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
          @click="game.togglePlacementOrientation"
        >
          Rotate: {{ state.placement.orientation }}
        </button>

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

    <section class="order-1 space-y-4 xl:order-2">
      <div class="rounded-2xl bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 px-4 py-4 text-white shadow-[0_22px_45px_-30px_rgba(15,23,42,0.9)] sm:px-5">
      <div class="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p class="text-[11px] font-semibold uppercase tracking-[0.2em] text-indigo-200">Game status</p>
          <h2 class="mt-1 text-xl font-semibold tracking-wide">{{ statusHeadline }}</h2>
          <p class="mt-1 text-sm text-slate-300">{{ statusSupportText }}</p>
        </div>
        <div class="rounded-full border border-white/20 px-4 py-2 text-sm font-semibold text-indigo-100">
          Game ID {{ shortGameId }}
        </div>
      </div>
      </div>

      <template v-if="state.phase === 'placement'">
      <Board
        title="Deployment board"
        :board="state.placement.board"
        :reveal-ships="true"
        :interactive="!state.placement.submitted && Boolean(nextShipLength)"
        @cell-select="onPlacementCellSelect"
      />

      <ul class="ui-card flex flex-wrap gap-2 p-3 text-sm">
        <li
          v-for="ship in placementShips"
          :key="ship.key"
          :class="[
            'rounded-lg border px-2.5 py-1',
            ship.placed
              ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
              : 'border-slate-200 bg-slate-50 text-slate-600',
          ]"
        >
          Ship {{ ship.length }} {{ ship.placed ? '✓' : '' }}
        </li>
      </ul>
      </template>
      <template v-else>
      <div class="grid grid-cols-2 gap-2 sm:gap-3 lg:gap-4">
        <Board title="Your board" :board="state.boards.own" :reveal-ships="true" :compact="true" />
        <Board
          title="Opponent board"
          :board="state.boards.opponent"
          :compact="true"
          :interactive="isMyTurn && state.phase === 'playing' && !state.pendingShot"
          :pending-shot="state.pendingShot"
          @cell-select="onShotSelect"
        />
      </div>

      <p v-if="state.phase === 'finished'" class="ui-card px-4 py-3 text-base font-bold text-slate-900">
        {{ winnerText }}
      </p>
      </template>
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
