<script setup>
import { computed } from 'vue';
import Cell from './Cell.vue';

const props = defineProps({
  title: {
    type: String,
    default: '',
  },
  board: {
    type: Array,
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
  pendingShot: {
    type: Object,
    default: null,
  },
});

const emit = defineEmits(['cell-select']);

const boardSize = computed(() => {
  if (!Array.isArray(props.board)) {
    return 0;
  }
  return props.board.length;
});

const columnLabels = computed(() =>
  Array.from({ length: boardSize.value }, (_, index) => String.fromCharCode(65 + index)),
);

const rowLabels = computed(() =>
  Array.from({ length: boardSize.value }, (_, index) => boardSize.value - index),
);

function isPendingCell(x, y) {
  return props.pendingShot && props.pendingShot.x === x && props.pendingShot.y === y;
}

function isDisabled(cell, x, y) {
  if (!props.interactive) {
    return true;
  }

  if (isPendingCell(x, y)) {
    return true;
  }

  return Boolean(cell?.shot);
}

function onCellSelect(x, y) {
  emit('cell-select', { x, y });
}
</script>

<template>
  <section class="ui-card flex w-full flex-col gap-3 p-3 sm:p-4">
    <h3 v-if="title" class="text-sm font-semibold uppercase tracking-wide text-slate-500">{{ title }}</h3>

    <div class="overflow-x-auto">
      <div class="mx-auto w-fit rounded-2xl border border-slate-700/80 bg-[#111827] p-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.07)] sm:p-3">
        <div class="mb-1 hidden items-center gap-0.5 pl-5 sm:flex">
          <span
            v-for="label in columnLabels"
            :key="`top-${label}`"
            class="inline-flex w-6 justify-center text-[10px] font-semibold text-slate-400 sm:w-7 md:w-8"
          >
            {{ label }}
          </span>
        </div>

        <div class="flex flex-col gap-0.5" role="grid">
          <div v-for="(row, y) in board" :key="`row-${y}`" class="flex items-center gap-0.5">
            <span class="hidden w-5 text-center text-[10px] font-semibold text-slate-400 sm:block">
              {{ rowLabels[y] }}
            </span>
            <Cell
              v-for="(cell, x) in row"
              :key="`cell-${x}-${y}`"
              :cell="cell"
              :reveal-ships="revealShips"
              :interactive="interactive"
              :disabled="isDisabled(cell, x, y)"
              @select="onCellSelect(x, y)"
            />
            <span class="hidden w-5 text-center text-[10px] font-semibold text-slate-400 sm:block">
              {{ rowLabels[y] }}
            </span>
          </div>
        </div>

        <div class="mt-1 hidden items-center gap-0.5 pl-5 sm:flex">
          <span
            v-for="label in columnLabels"
            :key="`bottom-${label}`"
            class="inline-flex w-6 justify-center text-[10px] font-semibold text-slate-400 sm:w-7 md:w-8"
          >
            {{ label }}
          </span>
        </div>
      </div>
    </div>
  </section>
</template>
