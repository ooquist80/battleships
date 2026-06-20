<script setup>
defineProps({
  label: {
    type: String,
    default: '',
  },
  ships: {
    type: Array,
    default: () => [],
  },
});
</script>

<template>
  <div class="ui-card p-3">
    <p v-if="label" class="mb-2 text-[10px] font-semibold uppercase tracking-widest text-slate-500">
      {{ label }}
    </p>
    <ul class="space-y-1.5">
      <li
        v-for="(ship, i) in ships"
        :key="i"
        class="flex items-center gap-2"
      >
        <div class="flex gap-px">
          <span
            v-for="(cell, j) in ship.cells"
            :key="j"
            :class="[
              'h-4 w-4 rounded-[3px] border transition-colors',
              ship.sunk
                ? 'border-rose-700/60 bg-rose-900/50'
                : cell.hit
                  ? 'border-rose-400/80 bg-rose-950/70 shadow-[0_0_6px_rgba(244,63,94,0.4)]'
                  : 'border-slate-500/60 bg-slate-700/60',
            ]"
          />
        </div>
        <span
          :class="[
            'text-xs font-medium',
            ship.sunk ? 'text-rose-500/70 line-through' : 'text-slate-400',
          ]"
        >
          {{ ship.name }}
        </span>
        <span
          v-if="ship.sunk"
          class="ml-auto text-[10px] font-bold uppercase tracking-wide text-rose-500/80"
        >
          sunk
        </span>
        <span
          v-else-if="ship.hitCount > 0"
          class="ml-auto text-[10px] font-medium text-slate-500"
        >
          {{ ship.hitCount }}/{{ ship.cells.length }}
        </span>
      </li>
    </ul>
  </div>
</template>
