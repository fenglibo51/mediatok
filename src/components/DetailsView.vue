<script setup>
import { computed } from 'vue'

const props = defineProps({
  playData: { type: Object, required: true },
  watchHistory: { type: Object, default: () => ({}) },
  isFavorited: { type: Boolean, default: false }
})

const emit = defineEmits(['close', 'play', 'toggle-favorite'])

// 智能计算历史播放进度
const historyRecord = computed(() => props.watchHistory[props.playData.id])
const resumeEp = computed(() => historyRecord.value ? historyRecord.value.episode : 1)
const resumeTime = computed(() => historyRecord.value ? historyRecord.value.currentTime : 0)
</script>

<template>
  <div class="absolute inset-0 w-full h-full bg-[#0a0a0a] z-30 overflow-y-auto pb-10 no-scrollbar select-none">
    
    <div class="relative w-full h-64 md:h-72">
       <img :src="playData.poster" class="w-full h-full object-cover opacity-30 blur-xl pointer-events-none" />
       <div class="absolute inset-0 bg-gradient-to-b from-[#0a0a0a]/30 via-transparent to-[#0a0a0a] pointer-events-none"></div>
       
       <button @click="$emit('close')" class="absolute top-[env(safe-area-inset-top,1rem)] left-4 p-2 bg-black/40 backdrop-blur-md rounded-full text-white z-10 active:scale-90 transition outline-none">
         <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M15 19l-7-7 7-7"></path></svg>
       </button>
       
       <div class="absolute bottom-0 left-4 right-4 flex gap-4 items-start">
          <img :src="playData.poster" class="w-28 h-40 object-cover rounded-lg shadow-2xl border border-white/10 shrink-0 pointer-events-none bg-zinc-900" />
          <div class="flex flex-col justify-between h-40 py-1">
             <div>
               <h1 class="text-xl font-black text-white drop-shadow-md leading-tight line-clamp-2">{{ playData.title }}</h1>
               <p class="text-xs text-emerald-400 font-bold mt-1.5">共 {{ playData.episodes.length }} 集</p>
               <p class="text-[10px] text-zinc-400 mt-1 flex gap-2 flex-wrap">
                 <span v-if="playData.year" class="bg-zinc-800 px-1.5 py-0.5 rounded">{{ playData.year }}</span>
                 <span v-for="g in playData.genres" :key="g" class="bg-zinc-800 px-1.5 py-0.5 rounded">{{ g }}</span>
                 <span v-if="!playData.genres || playData.genres.length === 0" class="bg-zinc-800 px-1.5 py-0.5 rounded">本地媒体</span>
               </p>
             </div>
          </div>
       </div>
    </div>

    <div class="px-4 mt-6 flex gap-3">
       <button @click="$emit('play', resumeEp, resumeTime)" class="flex-1 bg-emerald-500 hover:bg-emerald-400 text-white font-bold py-3.5 rounded-xl flex items-center justify-center gap-2 active:scale-95 transition shadow-[0_0_15px_rgba(16,185,129,0.3)] outline-none">
          <svg class="w-5 h-5 fill-current translate-x-[1px]" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
          {{ historyRecord ? `继续播放 第 ${resumeEp} 集` : '播放 第 1 集' }}
       </button>
       <button @click="$emit('toggle-favorite')" class="w-14 h-14 rounded-xl flex items-center justify-center transition outline-none border" :class="isFavorited ? 'bg-rose-500/20 border-rose-500 text-rose-500 shadow-[0_0_15px_rgba(244,63,94,0.3)]' : 'bg-zinc-800/80 text-zinc-400 border-zinc-700/50 hover:text-rose-400 active:scale-95'">
          <svg v-if="isFavorited" class="w-6 h-6 fill-current drop-shadow-md" viewBox="0 0 24 24"><path d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z"></path></svg>
          <svg v-else class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z"></path></svg>
       </button>
    </div>

    <div class="px-4 mt-6">
       <p class="text-sm text-zinc-400 leading-relaxed line-clamp-3">{{ playData.summary }}</p>
    </div>

    <div class="px-4 mt-8">
       <div class="flex justify-between items-end mb-4"><h3 class="text-base font-bold text-white tracking-wide">选集</h3><span class="text-xs text-zinc-500">全 {{ playData.episodes.length }} 集</span></div>
       <div class="grid grid-cols-6 gap-2.5">
          <button 
            v-for="ep in playData.episodes" :key="ep.id" 
            @click="$emit('play', ep.index, 0)"
            class="aspect-square bg-zinc-800/60 hover:bg-zinc-700 rounded-lg flex items-center justify-center text-sm font-medium transition active:scale-90 border outline-none" 
            :class="(historyRecord && ep.index === historyRecord.episode) ? 'border-emerald-500 text-emerald-400 bg-emerald-500/10' : 'border-transparent text-zinc-300'"
          >
             {{ ep.index }}
          </button>
       </div>
    </div>
    
  </div>
</template>