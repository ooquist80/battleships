<script setup>
import { computed, reactive, ref } from 'vue';
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
  placementShips: {
    type: Array,
    default: null,
  },
});

const emit = defineEmits(['cell-select', 'ship-move']);

const gridRef = ref(null);

const drag = reactive({
  active: false,
  shipIndex: null,
  startX: null,
  startY: null,
  offsetX: 0,
  offsetY: 0,
  overX: null,
  overY: null,
  moved: false,
});
let dragStartedWithSelection = false;
let dragStartPxX = 0;
let dragStartPxY = 0;

function getCellFromPoint(e) {
  const el = document.elementFromPoint(e.clientX, e.clientY);
  let node = el;
  while (node) {
    if (node.dataset?.x !== undefined && node.dataset?.y !== undefined) {
      return { x: Number(node.dataset.x), y: Number(node.dataset.y) };
    }
    node = node.parentElement;
  }
  return null;
}

function onPointerDown(e) {
  if (!props.placementShips || !props.interactive) return;
  const cell = getCellFromPoint(e);
  if (!cell) return;
  const boardCell = props.board[cell.y]?.[cell.x];
  if (boardCell?.shipIndex == null) return; // empty cell — let Cell's click handle it

  e.preventDefault();
  const ship = props.placementShips[boardCell.shipIndex];
  const alreadySelected = props.selectedShipIndex === boardCell.shipIndex;
  dragStartedWithSelection = alreadySelected;
  if (!alreadySelected) {
    emit('cell-select', { x: cell.x, y: cell.y }); // select the ship immediately
  }
  drag.active = true;
  drag.shipIndex = boardCell.shipIndex;
  drag.startX = cell.x;
  drag.startY = cell.y;
  drag.offsetX = ship ? cell.x - ship.x : 0;
  drag.offsetY = ship ? cell.y - ship.y : 0;
  drag.overX = cell.x;
  drag.overY = cell.y;
  drag.moved = false;
  dragStartPxX = e.clientX;
  dragStartPxY = e.clientY;
  gridRef.value?.setPointerCapture(e.pointerId);
}

function onPointerMove(e) {
  if (!drag.active) return;
  if (Math.abs(e.clientX - dragStartPxX) > 6 || Math.abs(e.clientY - dragStartPxY) > 6) {
    drag.moved = true;
  }
  const cell = getCellFromPoint(e);
  if (cell) {
    drag.overX = cell.x;
    drag.overY = cell.y;
  }
}

function onPointerUp() {
  if (!drag.active) return;
  const anchorX = drag.overX - drag.offsetX;
  const anchorY = drag.overY - drag.offsetY;
  const movedToNewCell = anchorX !== drag.startX - drag.offsetX || anchorY !== drag.startY - drag.offsetY;
  if (drag.moved && movedToNewCell && isGhostValid.value) {
    emit('ship-move', { shipIndex: drag.shipIndex, x: anchorX, y: anchorY });
  } else if (!drag.moved || !movedToNewCell) {
    if (dragStartedWithSelection) {
      emit('cell-select', { x: drag.startX, y: drag.startY }); // rotate
    }
    // else: was just selected on pointerdown, nothing more
  }
  drag.active = false;
  drag.shipIndex = null;
  drag.startX = null;
  drag.startY = null;
  drag.overX = null;
  drag.overY = null;
  drag.moved = false;
}

function onPointerCancel() {
  drag.active = false;
  drag.shipIndex = null;
  drag.startX = null;
  drag.startY = null;
  drag.overX = null;
  drag.overY = null;
  drag.moved = false;
}

const ghostCells = computed(() => {
  if (!drag.active || drag.overX === null || drag.shipIndex === null) return new Set();
  const ship = props.placementShips?.[drag.shipIndex];
  if (!ship) return new Set();
  const horizontal = ship.orientation === 'horizontal';
  const size = boardSize.value;
  const anchorX = drag.overX - drag.offsetX;
  const anchorY = drag.overY - drag.offsetY;
  const cells = new Set();
  for (let i = 0; i < ship.length; i++) {
    const gx = anchorX + (horizontal ? i : 0);
    const gy = anchorY + (horizontal ? 0 : i);
    if (gx >= 0 && gx < size && gy >= 0 && gy < size) cells.add(`${gx},${gy}`);
  }
  return cells;
});

const isGhostValid = computed(() => {
  if (!drag.active || drag.shipIndex === null) return false;
  const ship = props.placementShips?.[drag.shipIndex];
  if (!ship) return false;
  const horizontal = ship.orientation === 'horizontal';
  const size = boardSize.value;
  const anchorX = drag.overX - drag.offsetX;
  const anchorY = drag.overY - drag.offsetY;
  if (anchorX < 0 || anchorY < 0) return false;
  if (horizontal && anchorX + ship.length > size) return false;
  if (!horizontal && anchorY + ship.length > size) return false;
  for (let i = 0; i < ship.length; i++) {
    const gx = anchorX + (horizontal ? i : 0);
    const gy = anchorY + (horizontal ? 0 : i);
    const boardCell = props.board[gy]?.[gx];
    if (boardCell?.shipIndex !== null && boardCell?.shipIndex !== undefined && boardCell.shipIndex !== drag.shipIndex) {
      return false;
    }
  }
  return true;
});

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
    ? 'ui-card flex w-full flex-col gap-2 p-1.5 sm:p-2.5'
    : 'ui-card flex w-full flex-col gap-3 p-3 sm:p-4',
);

const boardFrameClasses = computed(() =>
  props.compact
    ? 'mx-auto w-fit rounded-xl border border-slate-700/80 bg-[#111827] p-1 shadow-[inset_0_1px_0_rgba(255,255,255,0.07)] sm:p-1.5'
    : 'mx-auto w-fit rounded-2xl border border-slate-700/80 bg-[#111827] p-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.07)] sm:p-3',
);

const boardGapClasses = computed(() => (props.compact ? 'gap-px sm:gap-0.5' : 'gap-0.5'));
const axisLabelRowClasses = computed(() =>
  props.compact ? 'mb-1 hidden items-center gap-0.5 pl-4 sm:flex' : 'mb-1 hidden items-center gap-0.5 pl-5 sm:flex',
);
const rowLabelClasses = computed(() =>
  props.compact
    ? 'hidden w-4 text-center text-[9px] font-semibold text-slate-400 sm:block'
    : 'hidden w-5 text-center text-[10px] font-semibold text-slate-400 sm:block',
);

const columnLabelClass = computed(() =>
  props.compact
    ? 'inline-flex w-3.5 justify-center text-[9px] font-semibold text-slate-400 sm:w-5 sm:text-[10px]'
    : 'inline-flex w-3.5 justify-center text-[9px] font-semibold text-slate-400 sm:w-5 sm:text-[10px] md:w-8',
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
            :class="columnLabelClass"
          >
            {{ label }}
          </span>
        </div>

        <div
          ref="gridRef"
          class="flex flex-col"
          :class="boardGapClasses"
          :style="props.placementShips ? 'touch-action: none' : ''"
          role="grid"
          @pointerdown="onPointerDown"
          @pointermove="onPointerMove"
          @pointerup="onPointerUp"
          @pointercancel="onPointerCancel"
        >
          <div v-for="(row, y) in board" :key="`row-${y}`" class="flex items-center" :class="boardGapClasses">
            <span :class="rowLabelClasses">
              {{ rowLabels[y] }}
            </span>
            <Cell
              v-for="(cell, x) in row"
              :key="`cell-${x}-${y}`"
              :data-x="x"
              :data-y="y"
              :cell="cell"
              :compact="props.compact"
              :reveal-ships="revealShips"
              :interactive="interactive"
              :disabled="isDisabled(cell, x, y)"
              :selected="props.selectedShipIndex !== null && cell.shipIndex === props.selectedShipIndex"
              :is-last-shot="props.lastShot !== null && x === props.lastShot.x && y === props.lastShot.y"
              :is-ghost="ghostCells.has(`${x},${y}`)"
              :ghost-valid="isGhostValid"
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
            :class="columnLabelClass"
          >
            {{ label }}
          </span>
        </div>
      </div>
    </div>
  </section>
</template>
