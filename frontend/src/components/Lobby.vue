<script setup>
import { computed, ref } from 'vue';

const props = defineProps({
  connected: {
    type: Boolean,
    default: false,
  },
  waiting: {
    type: Boolean,
    default: false,
  },
  creatingGame: {
    type: Boolean,
    default: false,
  },
  joiningInvite: {
    type: Boolean,
    default: false,
  },
  joinedFromInvite: {
    type: Boolean,
    default: false,
  },
  playerName: {
    type: String,
    default: '',
  },
  opponentName: {
    type: String,
    default: '',
  },
  inviteCode: {
    type: String,
    default: null,
  },
  inviteLink: {
    type: String,
    default: null,
  },
});

const emit = defineEmits(['update:player-name', 'update:opponent-name', 'create-game']);
const copied = ref(false);

const playerNameModel = computed({
  get: () => props.playerName,
  set: (value) => emit('update:player-name', value),
});

const opponentNameModel = computed({
  get: () => props.opponentName,
  set: (value) => emit('update:opponent-name', value),
});

const canCreateGame = computed(() => {
  const hasNames =
    playerNameModel.value.trim().length > 0 && opponentNameModel.value.trim().length > 0;
  return hasNames && !props.creatingGame && !props.joiningInvite && !props.waiting;
});

const statusText = computed(() => {
  if (props.creatingGame) {
    return 'Creating invite link...';
  }

  if (props.joiningInvite) {
    return 'Joining invite...';
  }

  if (props.waiting && props.inviteLink) {
    return 'Invite ready. Share the link and wait for your opponent.';
  }

  if (props.waiting && props.joinedFromInvite) {
    return 'Invite accepted. Waiting for match setup...';
  }

  if (!props.connected) {
    return 'Disconnected. Create/join will continue when reconnected.';
  }

  return 'Create a private game invite.';
});

async function copyInviteLink() {
  if (!props.inviteLink || typeof navigator === 'undefined' || !navigator.clipboard?.writeText) {
    return;
  }

  try {
    await navigator.clipboard.writeText(props.inviteLink);
    copied.value = true;
    window.setTimeout(() => {
      copied.value = false;
    }, 1600);
  } catch {
    copied.value = false;
  }
}
</script>

<template>
  <section class="ui-card flex flex-col gap-4 p-5 sm:p-6">
    <div class="space-y-1">
      <p class="ui-card-title">Lobby</p>
      <h2 class="text-2xl font-semibold tracking-tight text-slate-900">Create invite game</h2>
    </div>

    <p class="text-sm text-slate-600">{{ statusText }}</p>

    <div class="grid gap-3 sm:grid-cols-2">
      <label class="space-y-1 text-sm text-slate-700">
        <span class="font-medium">Your name</span>
        <input
          v-model="playerNameModel"
          type="text"
          autocomplete="name"
          placeholder="Captain"
          class="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
          :disabled="creatingGame || joiningInvite || waiting"
        />
      </label>

      <label class="space-y-1 text-sm text-slate-700">
        <span class="font-medium">Opponent name</span>
        <input
          v-model="opponentNameModel"
          type="text"
          autocomplete="off"
          placeholder="Admiral"
          class="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
          :disabled="creatingGame || joiningInvite || waiting"
        />
      </label>
    </div>

    <button type="button" class="ui-primary-button sm:max-w-xs" :disabled="!canCreateGame" @click="$emit('create-game')">
      {{ creatingGame ? 'Creating...' : 'Create invite link' }}
    </button>

    <div v-if="inviteLink" class="space-y-3 rounded-xl border border-indigo-200 bg-indigo-50/70 p-3">
      <p class="text-xs font-semibold uppercase tracking-wide text-indigo-700">Invite link</p>
      <a :href="inviteLink" class="block break-all text-sm font-medium text-indigo-700 underline decoration-indigo-300 underline-offset-2">
        {{ inviteLink }}
      </a>
      <div class="flex flex-wrap items-center gap-2">
        <span v-if="inviteCode" class="rounded-full bg-white px-2 py-1 text-xs font-semibold text-indigo-700">
          Code: {{ inviteCode }}
        </span>
        <button
          type="button"
          class="ui-soft-button !w-auto !px-3 !py-1.5 !text-xs"
          @click="copyInviteLink"
        >
          {{ copied ? 'Copied' : 'Copy link' }}
        </button>
      </div>
    </div>

    <p
      v-else-if="inviteCode && joinedFromInvite"
      class="rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-2 text-sm text-indigo-700"
    >
      Joining invite code: <span class="font-semibold">{{ inviteCode }}</span>
    </p>

    <p v-if="!connected" class="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
      Waiting for WebSocket connection...
    </p>
  </section>
</template>
