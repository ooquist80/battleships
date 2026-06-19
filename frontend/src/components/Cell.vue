<script setup>
import { computed } from 'vue';

const props = defineProps({
  cell: {
    type: Object,
    required: true,
  },
  revealShips: {
    type: Boolean,
    default: false,
  },
  interactive: {
    type: Boolean,
    default: false,
  },
  disabled: {
    type: Boolean,
    default: false,
  },
  compact: {
    type: Boolean,
    default: false,
  },
});

const emit = defineEmits(['select']);

const shotState = computed(() => props.cell?.shot ?? null);
const showShip = computed(() => props.revealShips && props.cell?.hasShip && !shotState.value);

const ariaLabel = computed(() => {
  if (shotState.value === 'hit') {
    return 'Hit';
  }

  if (shotState.value === 'miss') {
    return 'Miss';
  }

  if (showShip.value) {
    return 'Ship';
  }

  return 'Empty cell';
});

const buttonClasses = computed(() => [
  props.compact
    ? 'flex h-3.5 w-3.5 items-center justify-center rounded-[3px] border border-slate-700/80 bg-slate-800 p-0 leading-none text-slate-200 transition-colors sm:h-5 sm:w-5 md:h-7 md:w-7 lg:h-8 lg:w-8'
    : 'flex h-6 w-6 items-center justify-center rounded-[4px] border border-slate-700/80 bg-slate-800 p-0 leading-none text-slate-200 transition-colors sm:h-7 sm:w-7 md:h-8 md:w-8',
  props.interactive && !props.disabled
    ? 'cursor-pointer hover:border-indigo-300 hover:bg-slate-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-indigo-300'
    : 'cursor-default',
  shotState.value === 'hit' ? 'border-rose-400/80 bg-rose-950/70' : '',
  shotState.value === 'miss' ? 'bg-slate-700/90' : '',
]);

const markerClasses = computed(() => [
  'inline-flex items-center justify-center rounded-full',
  shotState.value === 'hit'
    ? props.compact
      ? 'h-2.5 w-2.5 bg-rose-500 text-[8px] font-bold text-white shadow-[0_0_10px_rgba(244,63,94,0.7)] sm:h-3 sm:w-3 sm:text-[9px] md:h-4 md:w-4 md:text-[10px]'
      : 'h-4 w-4 bg-rose-500 text-[10px] font-bold text-white shadow-[0_0_14px_rgba(244,63,94,0.7)]'
    : '',
  shotState.value === 'miss'
    ? props.compact
      ? 'h-1.5 w-1.5 bg-slate-300/80 sm:h-2 sm:w-2'
      : 'h-2 w-2 bg-slate-300/80'
    : '',
  !shotState.value && showShip.value
    ? props.compact
      ? 'h-2.5 w-2.5 border border-slate-100/70 bg-slate-100 shadow-[0_0_12px_rgba(226,232,240,0.65)] sm:h-3 sm:w-3 md:h-4 md:w-4'
      : 'h-4 w-4 border border-slate-100/70 bg-slate-100 shadow-[0_0_16px_rgba(226,232,240,0.65)]'
    : '',
  !shotState.value && !showShip.value
    ? props.compact
      ? 'h-1 w-1 bg-slate-600/30 sm:h-1.5 sm:w-1.5'
      : 'h-1.5 w-1.5 bg-slate-600/30'
    : '',
]);

function onSelect() {
  if (props.disabled) {
    return;
  }

  emit('select');
}
</script>

<template>
  <button
    type="button"
    :class="buttonClasses"
    :disabled="disabled"
    :aria-label="ariaLabel"
    @click="onSelect"
  >
    <span :class="markerClasses">
      {{ shotState === 'hit' ? '✕' : '' }}
    </span>
  </button>
</template>
