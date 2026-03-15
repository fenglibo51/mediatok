<script setup>
defineProps({
  // 接收从父组件传来的短剧列表
  dramas: { type: Array, required: true },
  // 接收播放历史（用于显示底部绿色进度条）
  watchHistory: { type: Object, default: () => ({}) },
  // 接收加载状态（点击时转圈圈）
  isLoadingDetails: { type: Boolean, default: false },
  // 当前正在加载的短剧 ID
  currentPlayId: { type: [String, Number], default: null }
})

defineEmits(['click-drama'])
</script>

<template>
  <div class="grid grid-cols-2 gap-x-4 gap-y-6">
    <div 
      v-for="drama in dramas" 
      :key="drama.id" 
      @click="$emit('click-drama', drama)" 
      class="flex flex-col gap-2 cursor-pointer group relative"
    >
      <div class="relative w-full aspect-[3/4] rounded-xl overflow-hidden shadow-lg border border-zinc-800/50 active:scale-[0.97] transition-transform duration-200 select-none bg-zinc-900">
        <img v-if="drama.poster" :src="drama.poster" @error="drama.poster = ''" loading="lazy" class="absolute inset-0 w-full h-full object-cover pointer-events-none" />
        <div v-else class="absolute inset-0 flex items-center justify-center text-zinc-700 font-black text-4xl">MT</div>
        
        <div class="absolute top-2 right-2 px-2 py-1 bg-black/60 backdrop-blur-md rounded-md border border-white/10 flex items-center justify-center z-10">
          <span class="text-[10px] font-bold text-gray-200 leading-none">共 {{ drama.episodesCount }} 集</span>
        </div>
        
        <div v-if="watchHistory[drama.id]" class="absolute bottom-0 left-0 w-full h-[3px] bg-zinc-800/80 z-20">
          <div class="h-full bg-emerald-500" :style="`width: ${ ((watchHistory[drama.id].episode - 1) + (watchHistory[drama.id].progress / 100)) / drama.episodesCount * 100 }%`"></div>
        </div>
      </div>
      
      <h3 class="text-sm font-bold text-gray-200 truncate px-1 select-none">{{ drama.title }}</h3>
      
      <div v-if="isLoadingDetails && currentPlayId === drama.id" class="absolute inset-0 bg-black/40 rounded-xl flex items-center justify-center">
         <svg class="w-8 h-8 text-emerald-500 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path></svg>
      </div>
    </div>
  </div>
</template>