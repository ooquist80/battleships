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
  compact: {
    type: Boolean,
    default: false,
  },
  selectedShipIndex: {
    type: Number,
    default: null,
  },
  lastShot: {
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

const boardCardClasses = computed(() =>
  props.compact
    ? 'ui-card flex w-full flex-col gap-2 p-1.5 sm:p-2.5 md:gap-3 md:p-4'
    : 'ui-card flex w-full flex-col gap-3 p-3 sm:p-4',
);

const boardFrameClasses = computed(() =>
  props.compact
    ? 'mx-auto w-fit rounded-xl border border-slate-700/80 bg-[#111827] p-1 shadow-[inset_0_1px_0_rgba(255,255,255,0.07)] sm:p-1.5 md:rounded-2xl md:p-3'
    : 'mx-auto w-fit rounded-2xl border border-slate-700/80 bg-[#111827] p-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.07)] sm:p-3',
);

const boardGapClasses = computed(() => (props.compact ? 'gap-px sm:gap-0.5' : 'gap-0.5'));
const axisLabelRowClasses = computed(() =>
  props.compact ? 'mb-1 hidden items-center gap-px pl-4 md:flex' : 'mb-1 hidden items-center gap-0.5 pl-5 sm:flex',
);
const rowLabelClasses = computed(() =>
  props.compact
    ? 'hidden w-4 text-center text-[9px] font-semibold text-slate-400 md:block'
    : 'hidden w-5 text-center text-[10px] font-semibold text-slate-400 sm:block',
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
  <section :class="boardCardClasses">
    <h3 v-if="title" class="text-sm font-semibold uppercase tracking-wide text-slate-500">{{ title }}</h3>

    <div class="overflow-x-auto">
      <div :class="boardFrameClasses">
        <div :class="axisLabelRowClasses">
          <span
            v-for="label in columnLabels"
            :key="`top-${label}`"
            class="inline-flex w-3.5 justify-center text-[9px] font-semibold text-slate-400 sm:w-5 sm:text-[10px] md:w-8"
          >
            {{ label }}
          </span>
        </div>

        <div class="flex flex-col" :class="boardGapClasses" role="grid">
          <div v-for="(row, y) in board" :key="`row-${y}`" class="flex items-center" :class="boardGapClasses">
            <span :class="rowLabelClasses">
              {{ rowLabels[y] }}
            </span>
            <Cell
              v-for="(cell, x) in row"
              :key="`cell-${x}-${y}`"
              :cell="cell"
              :compact="props.compact"
              :reveal-ships="revealShips"
              :interactive="interactive"
              :disabled="isDisabled(cell, x, y)"
              :selected="props.selectedShipIndex !== null && cell.shipIndex === props.selectedShipIndex"
              :is-last-shot="props.lastShot !== null && x === props.lastShot.x && y === props.lastShot.y"
              @select="onCellSelect(x, y)"
            />
            <span :class="rowLabelClasses">
              {{ rowLabels[y] }}
            </span>
          </div>
        </div>

        <div class="mt-1" :class="axisLabelRowClasses">
          <span
            v-for="label in columnLabels"
            :key="`bottom-${label}`"
            class="inline-flex w-3.5 justify-center text-[9px] font-semibold text-slate-400 sm:w-5 sm:text-[10px] md:w-8"
          >
            {{ label }}
          </span>
        </div>
      </div>
    </div>
  </section>
</template>
