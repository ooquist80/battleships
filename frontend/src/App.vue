<script setup>
import { computed, onBeforeUnmount, onMounted } from 'vue';
import Lobby from './components/Lobby.vue';
import Game from './components/Game.vue';
import { useGameStore } from './store/game';

const game = useGameStore();
const state = game.state;

const showLobby = computed(() => !['placement', 'playing', 'finished'].includes(state.phase));

const connectionText = computed(() => {
  if (state.connected) {
    return 'Connected';
  }

  return state.connecting ? 'Connecting...' : 'Disconnected';
});

onMounted(() => {
  game.init();
});

onBeforeUnmount(() => {
  game.destroy();
});
</script>

<template>
  <main class="min-h-screen px-2 py-3 sm:px-4 sm:py-5 lg:px-6">
    <div class="ui-shell overflow-hidden">
      <header class="ui-topbar">
        <div class="flex items-center gap-3">
          <span class="text-lg">⚓</span>
          <h1 class="ui-brand">
            BATTLE<span class="ui-brand-accent">SHIPS</span>
          </h1>
        </div>

        <div class="flex flex-wrap items-center justify-end gap-2">
          <span v-if="showLobby" class="ui-meta-chip" :class="state.connected ? 'text-emerald-700' : 'text-rose-700'">
            {{ connectionText }}
          </span>
          <button
            v-if="!state.connected"
            type="button"
            class="ui-soft-button !w-auto !rounded-full !px-3 !py-1.5 !text-xs"
            @click="game.connect"
          >
            Reconnect
          </button>
          <span
            class="inline-flex h-10 w-10 items-center justify-center rounded-full border border-indigo-200 bg-gradient-to-br from-indigo-100 to-violet-200 text-lg"
            aria-hidden="true"
          >
            🚢
          </span>
        </div>
      </header>

      <p v-if="state.lastError" class="mx-3 mt-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-medium text-rose-700 sm:mx-6">
        {{ state.lastError }}
      </p>

      <div class="p-3 sm:p-5 lg:p-6">
        <Lobby
          v-if="showLobby"
          :connected="state.connected"
          :waiting="state.waitingForMatch"
          :creating-game="state.creatingGame"
          :joining-invite="state.joiningInvite"
          :joined-from-invite="state.joinedFromInvite"
          :player-name="state.lobbyPlayerName"
          :opponent-name="state.lobbyOpponentName"
          :invite-code="state.inviteCode"
          :invite-link="state.inviteLink"
          @update:player-name="game.setLobbyPlayerName"
          @update:opponent-name="game.setLobbyOpponentName"
          @create-game="game.createGame"
        />
        <Game v-else />

        <section v-if="showLobby && state.recentEvents.length > 0" class="ui-card mt-4 p-4">
          <h2 class="text-base font-semibold text-slate-900">Recent events</h2>
          <ul class="mt-3 space-y-2 text-sm text-slate-700">
            <li
              v-for="event in state.recentEvents.slice(0, 8)"
              :key="event.id"
              class="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2"
            >
              {{ event.text }}
            </li>
          </ul>
        </section>
      </div>
    </div>
  </main>
</template>
