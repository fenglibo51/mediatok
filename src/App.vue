<script setup>
import { ref, reactive, watch, onMounted, computed } from 'vue'
import VideoPlayer from './components/VideoPlayer.vue'
import MediaGrid from './components/MediaGrid.vue'
import Sidebar from './components/Sidebar.vue'
import DetailsView from './components/DetailsView.vue'
import { useMediaTok } from './composables/useMediaTok'

// ==================== 1. 接入独立的数据大脑 ====================
const {
  servers, activeServerId, selectedLibs, availableLibraries, lastWatched, watchHistory, settings, favorites,
  dramas, isFetchingDramas, isLoadingDetails, currentPlayData, activeLibrary,
  fetchDramaDetails, fetchLibraryContent // 🌟 移除了失效的 getLibName
} = useMediaTok()

// ==================== 2. 全局 UI 状态控制 ====================
const isDrawerOpen = ref(false) 
const currentView = ref('home') 
const currentHomeTab = ref('discover') 
const showSplash = ref(true)
const showLibDropdown = ref(false)
const isOffline = ref(!navigator.onLine) // 断网状态

const openDrawer = () => { isDrawerOpen.value = true }

// ==================== 3. 页面数据过滤展示 ====================
const displayedDramas = computed(() => currentHomeTab.value === 'favorites' ? dramas.value.filter(drama => favorites.value.includes(drama.id)) : dramas.value)

const toggleFavorite = () => {
  if (!currentPlayData.value) return
  const id = currentPlayData.value.id; 
  favorites.value.includes(id) ? favorites.value = favorites.value.filter(fid => fid !== id) : favorites.value.push(id)
}
const isFavorited = computed(() => currentPlayData.value ? favorites.value.includes(currentPlayData.value.id) : false)

// ==================== 4. 迷你播放器与网络开屏 ====================
const miniPlayer = reactive({ show: false, progress: 100 })
let miniPlayerTimer = null
const hasShownMiniPlayerThisSession = ref(false)

onMounted(async () => {
  const minSplashTime = new Promise(resolve => setTimeout(resolve, 1800))
  await minSplashTime
  if (!isFetchingDramas.value) { showSplash.value = false } else {
    const unwatch = watch(isFetchingDramas, (val) => { if (!val) { showSplash.value = false; unwatch() } })
  }
  
  if (lastWatched.value && !hasShownMiniPlayerThisSession.value) {
    miniPlayer.show = true; hasShownMiniPlayerThisSession.value = true; miniPlayer.progress = 100
    miniPlayerTimer = setInterval(() => { miniPlayer.progress -= 1; if (miniPlayer.progress <= 0) closeMiniPlayer() }, 50) 
  }

  // 🌟 网络状态实时监控监听器
  window.addEventListener('offline', () => { isOffline.value = true })
  window.addEventListener('online', () => { 
    isOffline.value = false
    if (activeLibrary.value) fetchLibraryContent(activeLibrary.value)
  })
})

const closeMiniPlayer = () => { miniPlayer.show = false; clearInterval(miniPlayerTimer) }

// ==================== 5. 路由调度与播放交互 ====================
const handleDramaClick = async (drama, targetEpIndex = null, resumeTime = 0) => {
  const success = await fetchDramaDetails(drama)
  if (success) {
    currentView.value = 'details' 
    if (targetEpIndex) setTimeout(() => startPlaying(targetEpIndex, resumeTime), 300)
  }
}

const jumpToPlayerFromMini = () => {
  if (!lastWatched.value) return; closeMiniPlayer()
  const drama = dramas.value.find(d => d.id === lastWatched.value.id)
  let resumeTime = 0
  if (drama && watchHistory.value[drama.id] && watchHistory.value[drama.id].episode === lastWatched.value.episode) {
    resumeTime = watchHistory.value[drama.id].currentTime || 0
  }
  if (drama) handleDramaClick(drama, lastWatched.value.episode, resumeTime)
}

// ==================== 6. 搜索过滤引擎 ====================
const searchQuery = ref('')
const searchResults = computed(() => {
  if (!searchQuery.value.trim()) return []
  const query = searchQuery.value.toLowerCase()
  return dramas.value.filter(d => d.title.toLowerCase().includes(query))
})
const openSearch = () => { currentView.value = 'search'; setTimeout(() => document.getElementById('searchInput')?.focus(), 100) }
const closeSearch = () => { currentView.value = 'home'; searchQuery.value = '' }

// ==================== 7. 核心播放控制 ====================
const playerConfig = ref({ episode: 1, resumeTime: 0 })

const startPlaying = (epIndex, resumeTime = 0) => {
  playerConfig.value = { episode: epIndex, resumeTime }
  currentView.value = 'player'
}

const handlePlayerHistory = (data) => {
  watchHistory.value[data.dramaId] = { episode: data.episode, progress: data.progress, currentTime: data.currentTime }
}

const handlePlayerLastWatched = (data) => {
  lastWatched.value = data
}
</script>

<template>
  <div class="h-[100dvh] w-screen bg-[#0a0a0a] text-white overflow-hidden relative font-sans select-none">

    <transition enter-active-class="transition-opacity duration-300" enter-from-class="opacity-0" enter-to-class="opacity-100" leave-active-class="transition-opacity duration-300" leave-from-class="opacity-100" leave-to-class="opacity-0">
      <div v-if="isOffline" class="absolute inset-0 z-[200] flex items-center justify-center bg-black/80 backdrop-blur-md select-none">
        <div class="bg-zinc-900 border border-zinc-700/50 rounded-3xl p-8 flex flex-col items-center shadow-[0_0_50px_rgba(0,0,0,0.5)] w-[80%] max-w-sm text-center">
          <div class="w-16 h-16 bg-rose-500/10 rounded-full flex items-center justify-center mb-5 border border-rose-500/20 shadow-[0_0_15px_rgba(244,63,94,0.2)]">
            <svg class="w-8 h-8 text-rose-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M18.364 5.636a9 9 0 010 12.728m0 0l-2.829-2.829m2.829 2.829L21 21M15.536 8.464a5 5 0 010 7.072m0 0l-2.829-2.829m-4.243 2.829a4.978 4.978 0 01-1.414-2.83m-1.414 5.658a9 9 0 01-2.167-9.238m7.824 2.167a1 1 0 111.414 1.414m-1.414-1.414L3 3m8.293 8.293l1.414 1.414"></path></svg>
          </div>
          <h2 class="text-xl font-black text-white tracking-wide mb-2">网络连接已断开</h2>
          <p class="text-xs text-zinc-400 mb-6 leading-relaxed">请检查您的设备网络设置<br>Media-Tok 将在网络恢复后自动重连</p>
          <button @click="isOffline = false" class="w-full py-3.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-sm font-bold rounded-xl transition active:scale-95 border border-zinc-700 outline-none">我知道了</button>
        </div>
      </div>
    </transition>

    <transition leave-active-class="transition-opacity duration-700 ease-in-out" leave-to-class="opacity-0">
      <div v-if="showSplash" class="absolute inset-0 z-[100] flex items-center justify-center pointer-events-none" style="background-color: #000000;">
        <div class="relative overflow-hidden px-4 py-2">
          <div class="text-7xl font-black tracking-tighter text-transparent bg-clip-text bg-gradient-to-b from-zinc-800 to-zinc-900 drop-shadow-2xl">
            MEDIA<span class="text-zinc-700">TOK</span>
          </div>
          <div class="absolute inset-0 bg-gradient-to-r from-transparent via-emerald-400/80 to-transparent animate-sweep opacity-75" style="mix-blend-mode: overlay;"></div>
        </div>
      </div>
    </transition>

    <div v-show="currentView === 'home'" class="absolute inset-0 w-full h-full">
      <header class="absolute top-0 left-0 w-full p-4 flex items-center justify-between z-50 pt-[calc(env(safe-area-inset-top,0px)+1rem)] bg-gradient-to-b from-[#0a0a0a]/90 to-transparent pointer-events-none">
        <button v-show="!isDrawerOpen" @click="openDrawer" class="p-2 transition-opacity active:scale-95 pointer-events-auto outline-none">
          <svg class="w-8 h-8 text-white drop-shadow-md" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M4 6h16M4 12h16M4 18h16"></path></svg>
        </button>
        
        <div v-show="!isDrawerOpen" class="absolute left-[4.5rem] flex items-center gap-4 text-base font-bold pointer-events-auto select-none">
          <button @click="currentHomeTab = 'discover'" class="transition-colors duration-200 outline-none" :class="currentHomeTab === 'discover' ? 'text-white' : 'text-zinc-500'">发现</button>
          <button @click="currentHomeTab = 'favorites'" class="transition-colors duration-200 outline-none" :class="currentHomeTab === 'favorites' ? 'text-white' : 'text-zinc-500'">收藏</button>
        </div>
        
        <div v-show="!isDrawerOpen" class="relative pointer-events-auto flex items-center gap-2">
          <button @click="openSearch" class="p-2 rounded-full bg-zinc-800/60 backdrop-blur-md border border-zinc-700/50 shadow-lg active:scale-90 transition outline-none text-zinc-300 hover:text-emerald-400">
             <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path></svg>
          </button>
          
          <div class="relative">
            <button @click="showLibDropdown = !showLibDropdown" class="flex items-center gap-1.5 px-3.5 py-1.5 bg-zinc-800/60 backdrop-blur-md border border-zinc-700/50 rounded-full shadow-lg active:scale-95 transition outline-none">
              <span class="text-xs font-bold text-emerald-400 tracking-widest flex items-center">
                <span v-if="activeLibrary" class="text-[10px] px-1 py-0.5 rounded bg-zinc-700/80 text-zinc-300 mr-1.5">{{ activeLibrary.serverId === 'plex' ? 'PX' : (activeLibrary.serverId === 'emby' ? 'EB' : 'JF') }}</span>
                {{ activeLibrary ? activeLibrary.name : '未选库' }}
              </span>
              <svg class="w-3.5 h-3.5 text-zinc-400 transition-transform duration-200" :class="showLibDropdown ? 'rotate-180' : ''" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M19 9l-7 7-7-7"></path></svg>
            </button>
            <transition enter-active-class="transition duration-200 ease-out" enter-from-class="opacity-0 scale-95" enter-to-class="opacity-100 scale-100" leave-active-class="transition duration-100 ease-in" leave-from-class="opacity-100 scale-100" leave-to-class="opacity-0 scale-95">
              <div v-if="showLibDropdown" class="absolute top-full right-0 mt-2 w-max min-w-[8rem] bg-zinc-900/95 backdrop-blur-xl border border-zinc-700 rounded-xl shadow-2xl p-1 z-50 overflow-hidden">
                 <div v-if="selectedLibs.length === 0" class="p-3 text-xs text-zinc-500 text-center whitespace-nowrap">请先在左侧添加库</div>
                 <button v-for="lib in selectedLibs" :key="lib.serverId + '_' + lib.libId" @click="activeLibrary = lib; showLibDropdown = false" class="w-full flex items-center px-3 py-2.5 rounded-lg text-sm font-medium transition outline-none whitespace-nowrap" :class="(activeLibrary && activeLibrary.serverId === lib.serverId && activeLibrary.libId === lib.libId) ? 'bg-emerald-500/20 text-emerald-400' : 'text-zinc-300 hover:bg-zinc-800'">
                   <span class="text-[9px] font-black px-1.5 py-0.5 rounded mr-2" :class="lib.serverId === 'plex' ? 'bg-amber-500/20 text-amber-500' : (lib.serverId === 'emby' ? 'bg-green-500/20 text-green-500' : 'bg-purple-500/20 text-purple-500')">{{ lib.serverId === 'plex' ? 'PX' : (lib.serverId === 'emby' ? 'EB' : 'JF') }}</span>
                   {{ lib.name }}
                 </button>
              </div>
            </transition>
          </div>
        </div>
      </header>

      <main class="h-full w-full pt-[calc(env(safe-area-inset-top,0px)+5rem)] px-4 pb-[calc(env(safe-area-inset-bottom,0px)+6rem)] overflow-y-auto overscroll-y-contain no-scrollbar relative">
        <div v-if="isFetchingDramas" class="absolute inset-0 flex flex-col items-center justify-center opacity-60">
           <svg class="w-10 h-10 text-emerald-500 animate-spin mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path></svg>
        </div>
        <div v-else-if="currentHomeTab === 'favorites' && displayedDramas.length === 0" class="absolute inset-0 flex flex-col items-center justify-center opacity-40">
           <svg class="w-16 h-16 text-zinc-500 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z"></path></svg>
           <p class="text-sm font-bold text-zinc-400 tracking-widest">暂无收藏短剧</p>
        </div>
        <div v-else-if="displayedDramas.length === 0" class="absolute inset-0 flex flex-col items-center justify-center opacity-40">
           <p class="text-sm font-bold text-zinc-400 tracking-widest">该库中暂无内容</p>
        </div>

        <MediaGrid 
           v-else
           :dramas="displayedDramas" 
           :watch-history="watchHistory" 
           :is-loading-details="isLoadingDetails" 
           :current-play-id="currentPlayData?.id" 
           @click-drama="handleDramaClick" 
        />
      </main>

      <transition enter-active-class="transition-all duration-500 cubic-bezier(.34,1.56,.64,1)" enter-from-class="opacity-0 translate-y-12 scale-90" enter-to-class="opacity-100 translate-y-0 scale-100" leave-active-class="transition-all duration-300 ease-in-out" leave-from-class="opacity-100 translate-y-0 scale-100" leave-to-class="opacity-0 translate-y-12 scale-90">
        <div v-if="miniPlayer.show" @click="jumpToPlayerFromMini" class="absolute bottom-[calc(env(safe-area-inset-bottom,0px)+1.5rem)] right-5 w-32 aspect-[3/4] z-20 select-none">
          <div class="w-full h-full relative rounded-xl shadow-2xl border border-zinc-700/60 overflow-hidden cursor-pointer active:scale-95 transition-transform duration-200">
            <img :src="lastWatched?.poster" class="absolute inset-0 w-full h-full object-cover z-0 pointer-events-none" />
            <div class="absolute bottom-0 left-0 w-full h-1/2 bg-gradient-to-t from-black/90 to-transparent z-10 pointer-events-none"></div>
            <div class="absolute inset-0 m-auto w-10 h-10 rounded-full bg-black/30 backdrop-blur-md border border-white/20 text-white flex items-center justify-center shadow-lg z-20 pointer-events-none">
              <svg class="w-5 h-5 translate-x-[2px]" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
            </div>
            <div class="absolute bottom-3 left-0 w-full px-2.5 flex flex-col z-20 pointer-events-none">
              <p class="text-xs font-bold text-white truncate drop-shadow-md">{{ lastWatched?.title }}</p>
              <p class="text-[10px] text-emerald-400 font-medium drop-shadow-md mt-0.5">继续播放 第 {{ lastWatched?.episode }} 集</p>
            </div>
            <div class="absolute bottom-0 left-0 w-full h-1 bg-zinc-800/80 z-20 pointer-events-none">
              <div class="h-full bg-emerald-500 rounded-r-full" :style="`width: ${miniPlayer.progress}%`"></div>
            </div>
          </div>
          <button @click.stop="closeMiniPlayer" class="absolute -top-3 -right-3 w-7 h-7 bg-zinc-800 border border-zinc-600 rounded-full flex items-center justify-center text-zinc-400 hover:text-white active:scale-90 transition shadow-lg z-30 outline-none">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M6 18L18 6M6 6l12 12"></path></svg>
          </button>
        </div>
      </transition>
    </div>

    <transition enter-active-class="transition-transform duration-300 ease-out" enter-from-class="translate-y-full" enter-to-class="translate-y-0" leave-active-class="transition-transform duration-300 ease-in" leave-from-class="translate-y-0" leave-to-class="translate-y-full">
      <div v-if="currentView === 'search'" class="absolute inset-0 w-full h-full bg-[#0a0a0a] z-30 flex flex-col">
        <header class="px-4 pb-4 pt-[calc(env(safe-area-inset-top,0px)+1.5rem)] flex items-center gap-3 border-b border-zinc-800/50 bg-[#0a0a0a] z-50 shadow-md">
          <button @click="closeSearch" class="p-2 -ml-2 text-zinc-400 hover:text-white active:scale-90 transition outline-none">
            <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M15 19l-7-7 7-7"></path></svg>
          </button>
          
          <div class="flex-1 relative flex items-center">
             <input id="searchInput" v-model="searchQuery" type="text" placeholder="搜索短剧..." class="w-full bg-zinc-800/80 text-white placeholder-zinc-500 px-4 py-2.5 rounded-full border border-zinc-700/50 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition text-sm outline-none">
             
             <button v-if="searchQuery" @click="searchQuery = ''" class="absolute right-3 text-zinc-400 hover:text-white p-1 outline-none">
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path></svg>
             </button>
          </div>
        </header>

        <div class="flex-1 overflow-y-auto px-4 pt-6 pb-[calc(env(safe-area-inset-bottom,0px)+5rem)] relative no-scrollbar">
          <div v-if="!searchQuery" class="absolute inset-0 flex flex-col items-center justify-center opacity-40">
             <svg class="w-16 h-16 text-zinc-500 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path></svg>
             <p class="text-sm font-bold text-zinc-400 tracking-widest">输入剧名实时检索当前库</p>
          </div>
          
          <div v-else-if="searchResults.length === 0" class="absolute inset-0 flex flex-col items-center justify-center opacity-40">
             <svg class="w-16 h-16 text-zinc-500 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
             <p class="text-sm font-bold text-zinc-400 tracking-widest">未找到相关短剧</p>
          </div>

          <MediaGrid 
            v-else
            :dramas="searchResults" 
            :watch-history="watchHistory" 
            :is-loading-details="isLoadingDetails" 
            :current-play-id="currentPlayData?.id" 
            @click-drama="handleDramaClick" 
          />
        </div>
      </div>
    </transition>

    <transition enter-active-class="transition-transform duration-300 ease-out" enter-from-class="translate-x-full" enter-to-class="translate-x-0" leave-active-class="transition-transform duration-300 ease-in" leave-from-class="translate-x-0" leave-to-class="translate-x-full">
     <DetailsView 
       v-if="currentView === 'details' && currentPlayData"
       :play-data="currentPlayData"
       :watch-history="watchHistory"
       :is-favorited="isFavorited"
       @close="currentView = 'home'"
       @play="(epIndex, resumeTime) => startPlaying(epIndex, resumeTime)"
       @toggle-favorite="toggleFavorite"
     />
    </transition>

    <transition enter-active-class="transition-transform duration-300 ease-out" enter-from-class="translate-y-full" enter-to-class="translate-y-0" leave-active-class="transition-transform duration-300 ease-in" leave-from-class="translate-y-0" leave-to-class="translate-y-full">
      <VideoPlayer 
        v-if="currentView === 'player' && currentPlayData"
        :play-data="currentPlayData"
        :initial-episode="playerConfig.episode"
        :initial-time="playerConfig.resumeTime"
        :server-info="{ id: activeServerId, ...servers[activeServerId] }"
        :settings="settings"
        @close="currentView = 'details'"
        @update-history="handlePlayerHistory"
        @update-last-watched="handlePlayerLastWatched"
      />
    </transition>

    <Sidebar 
     :is-open="isDrawerOpen"
     :servers="servers"
     :active-server-id="activeServerId"
     :settings="settings"
     :selected-libs="selectedLibs"
     :available-libraries="availableLibraries"
     @close="isDrawerOpen = false"
     @change-active-server="(id) => activeServerId = id"
     @update-libraries="(data) => { availableLibraries = data.available; selectedLibs = data.selected }"
    />
  </div>
</template>

<style>
@keyframes fadeIn { from { opacity: 0; transform: translateY(-10px); } to { opacity: 1; transform: translateY(0); } }
@keyframes sweep { 0% { transform: translateX(-100%); } 100% { transform: translateX(100%); } }
.animate-sweep { animation: sweep 2s cubic-bezier(0.4, 0, 0.2, 1) infinite; }

html, body { overscroll-behavior-y: none; }
.no-scrollbar::-webkit-scrollbar { display: none; }
.no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
</style>