<script setup>
import { ref, reactive, onMounted, onUnmounted, nextTick, watch } from 'vue'

const props = defineProps({
  playData: { type: Object, required: true },
  initialEpisode: { type: Number, default: 1 },
  initialTime: { type: Number, default: 0 },
  serverInfo: { type: Object, required: true }, // 包含 ip, token 和平台类型
  settings: { type: Object, required: true }
})

const emit = defineEmits(['close', 'update-history', 'update-last-watched'])

// 内部状态
const currentEpisode = ref(props.initialEpisode)
const isPlaying = ref(true)
const isEnded = ref(false) 
const isPlayerUiVisible = ref(true)
const showPlayFlash = ref(false) 
const showEpDrawer = ref(false)
const currentProgress = ref(0) 
const pendingResumeTime = ref(props.initialTime) 

// 🌟 HLS 实例与 Video 节点管理
const videoRefs = ref({}) 
const hlsInstances = {} 

// 🌟 核心修复 1：动态生成【绝对唯一】的服务器转码请求链接，防止 Plex 转码器冲突
const getTranscodeUrl = (ep) => {
  const server = props.serverInfo
  const baseUrl = server.ip.replace(/\/$/, '')
  const clientId = 'MediaTok-Web-App'
  
  // 生成独一无二的 session ID，这是防止卡死的核心！
  const uniqueSession = `mediatok_${ep.id}_${Date.now()}`

  if (server.id === 'plex') {
    return `${baseUrl}/video/:/transcode/universal/start.m3u8?path=${encodeURIComponent(ep.key)}&mediaIndex=0&partIndex=0&protocol=hls&fastSeek=1&directPlay=0&directStream=1&videoQuality=100&videoResolution=1080&maxVideoBitrate=8000&subtitleSize=100&audioBoost=100&session=${uniqueSession}&X-Plex-Client-Identifier=${clientId}&X-Plex-Platform=Web&X-Plex-Token=${server.token}`
  } else if (server.id === 'emby' || server.id === 'jellyfin') {
    return `${baseUrl}/Videos/${ep.id}/master.m3u8?api_key=${server.token}&DeviceId=${clientId}&MediaSourceId=${ep.id}&VideoCodec=h264&AudioCodec=aac&TranscodingMaxAudioChannels=2&SegmentContainer=ts&MinSegments=1&BreakOnNonKeyFrames=True`
  }
  return ep.directUrl 
}

// 🌟 核心修复 2：极其严格的内存挂载与垃圾回收 + 强制自动播放
const initVideoNode = (el, ep) => {
  if (el) {
    videoRefs.value[ep.index] = el
    if (el.dataset.init === 'true') return 
    el.dataset.init = 'true'

    const streamUrl = getTranscodeUrl(ep)

    if (el.canPlayType('application/vnd.apple.mpegurl')) {
      el.src = streamUrl
      // Safari 自动播放补丁
      el.addEventListener('loadedmetadata', () => {
        if (isPlaying.value) el.play().catch(() => {})
      }, { once: true })
    } else {
      const attachHls = () => {
        if (window.Hls && window.Hls.isSupported()) {
          const hls = new window.Hls({ enableWorker: true, lowLatencyMode: true })
          hls.loadSource(streamUrl)
          hls.attachMedia(el)
          // Chrome/安卓 HLS.js 自动播放补丁
          hls.on(window.Hls.Events.MANIFEST_PARSED, () => {
            if (isPlaying.value) el.play().catch(() => {})
          })
          hlsInstances[ep.index] = hls
        } else {
          el.src = streamUrl 
        }
      }
      if (window.Hls) { attachHls() } else {
        if (!document.getElementById('hls-script')) {
          const s = document.createElement('script')
          s.id = 'hls-script'
          s.src = 'https://cdn.jsdelivr.net/npm/hls.js@1'
          s.onload = attachHls
          document.head.appendChild(s)
        } else {
          const check = setInterval(() => { if (window.Hls) { clearInterval(check); attachHls() } }, 100)
        }
      }
    }
  } else {
    // 节点卸载时，强制清空引用并销毁 HLS 实例，释放 Safari 内存！
    delete videoRefs.value[ep.index]
    if (hlsInstances[ep.index]) {
      hlsInstances[ep.index].destroy()
      delete hlsInstances[ep.index]
    }
  }
}

let uiTimeout = null
let heartbeatTimer = null
let observer = null

// UI 控制
const showPlayerUi = () => {
  isPlayerUiVisible.value = true; clearTimeout(uiTimeout)
  if (isPlaying.value && !showEpDrawer.value && !isEnded.value) { uiTimeout = setTimeout(() => { isPlayerUiVisible.value = false }, 3000) }
}
const togglePlayerUi = () => {
  if (showEpDrawer.value) { showEpDrawer.value = false; showPlayerUi(); return }
  if (isPlayerUiVisible.value) { isPlayerUiVisible.value = false; clearTimeout(uiTimeout) } else { showPlayerUi() }
}

// 手势与倍速控制
const speedState = reactive({ active: false, locked: false, rate: 1.0 })
let pointerStartY = 0; let longPressTimer = null; let clickTimer = null; let isGestureActive = false 

const setVideoSpeed = (rate) => { speedState.rate = rate; const video = videoRefs.value[currentEpisode.value]; if (video) video.playbackRate = rate }

const handlePointerDown = (e) => { 
  isGestureActive = false; pointerStartY = e.clientY; 
  longPressTimer = setTimeout(() => { 
    isGestureActive = true; speedState.active = true; setVideoSpeed(2.0);
    if (navigator.vibrate) navigator.vibrate(50);
  }, 400) 
}
const handlePointerMove = (e) => {
  if (!speedState.active && longPressTimer) { if (Math.abs(e.clientY - pointerStartY) > 10) { clearTimeout(longPressTimer); longPressTimer = null } } 
  else if (speedState.active) { const dy = e.clientY - pointerStartY; if (dy > 60 && !speedState.locked) { speedState.locked = true } else if (dy < -60 && speedState.locked) { speedState.locked = false } }
}
const handlePointerUp = () => { if (longPressTimer) { clearTimeout(longPressTimer); longPressTimer = null }; if (speedState.active && !speedState.locked) { speedState.active = false; setVideoSpeed(1.0) } }

const handlePlayerClick = () => {
  if (isGestureActive) return 
  if (clickTimer) {
    clearTimeout(clickTimer); clickTimer = null; 
    if (isEnded.value) {
      isEnded.value = false; isPlaying.value = true;
      const video = videoRefs.value[currentEpisode.value]
      if (video) { video.currentTime = 0; video.play() }
    } else {
      isPlaying.value = !isPlaying.value
      if (isPlaying.value) { showPlayFlash.value = true; setTimeout(() => { showPlayFlash.value = false }, 500) }
    }
    showPlayerUi() 
  } else { clickTimer = setTimeout(() => { clickTimer = null; togglePlayerUi() }, 250) }
}

// 进度与播放控制
const handleSeek = (e) => {
  const rect = e.currentTarget.getBoundingClientRect()
  let percentage = (e.clientX - rect.left) / rect.width
  if(percentage < 0) percentage = 0; if(percentage > 1) percentage = 1;
  const video = videoRefs.value[currentEpisode.value]
  if (video && video.duration) { video.currentTime = percentage * video.duration; currentProgress.value = percentage * 100 }
  isEnded.value = false; pendingResumeTime.value = 0; showPlayerUi()
}

const scrollToNextEp = () => {
  const container = document.getElementById('video-scroll-container')
  if (container) container.scrollTo({ top: currentEpisode.value * container.clientHeight, behavior: 'smooth' })
}

const handleScroll = (e) => {
  const container = e.target
  const index = Math.round(container.scrollTop / container.clientHeight)
  if (currentEpisode.value !== index + 1) { 
    currentEpisode.value = index + 1; 
    isEnded.value = false;
    pendingResumeTime.value = 0 
  }
}

const handleVideoEnded = () => {
  const isLastEp = currentEpisode.value >= props.playData.episodes.length
  if (props.settings.infinitePlay && !isLastEp) { scrollToNextEp() } else { isPlaying.value = false; isEnded.value = true; showPlayerUi(); sendHeartbeat('stopped') }
}

const clickPlayNext = () => { isEnded.value = false; isPlaying.value = true; scrollToNextEp() }
const clickReplay = () => { isEnded.value = false; isPlaying.value = true; const video = videoRefs.value[currentEpisode.value]; if (video) { video.currentTime = 0; video.play() } }

const startPlaying = (epIndex, resumeTime = 0) => {
  pendingResumeTime.value = resumeTime
  currentEpisode.value = epIndex; isPlaying.value = true; isEnded.value = false
  showPlayerUi() 
  showEpDrawer.value = false
  const container = document.getElementById('video-scroll-container')
  if (container) container.scrollTop = (epIndex - 1) * container.clientHeight
}

// 服务器同步心跳
const sendHeartbeat = (state) => {
  if (pendingResumeTime.value > 0) return 
  const video = videoRefs.value[currentEpisode.value]
  if (!video) return

  const server = props.serverInfo
  const baseUrl = server.ip.replace(/\/$/, '')
  const epData = props.playData.episodes.find(e => e.index === currentEpisode.value)
  if (!epData) return

  emit('update-history', {
    dramaId: props.playData.id,
    episode: currentEpisode.value,
    progress: currentProgress.value,
    currentTime: video.currentTime
  })

  if (server.id === 'plex') {
    const currentTimeMs = Math.floor(video.currentTime * 1000) || 0
    const durationMs = epData.duration || Math.floor(video.duration * 1000) || 0
    fetch(`${baseUrl}/:/timeline?ratingKey=${epData.id}&key=${epData.key}&state=${state}&time=${currentTimeMs}&duration=${durationMs}&X-Plex-Token=${server.token}`, { method: 'GET', headers: { 'Accept': 'application/json' } }).catch(() => {})
  } 
  else if (server.id === 'emby' || server.id === 'jellyfin') {
    const ticks = Math.floor(video.currentTime * 10000000) || 0
    let endpoint = 'Progress'
    if (state === 'stopped') endpoint = 'Stopped'
    else if (state === 'playing' && currentProgress.value === 0) endpoint = 'Playing' 
    
    fetch(`${baseUrl}/Sessions/Playing/${endpoint}?api_key=${server.token}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: JSON.stringify({ ItemId: epData.id, PositionTicks: ticks, IsPaused: state === 'paused' })
    }).catch(() => {})
  }
}

const closePlayer = () => {
  sendHeartbeat('stopped'); clearInterval(heartbeatTimer); clearTimeout(uiTimeout) 
  isPlaying.value = false; isEnded.value = false; pendingResumeTime.value = 0
  speedState.locked = false; speedState.active = false
  
  emit('update-last-watched', {
    id: props.playData.id,
    title: props.playData.title,
    episode: currentEpisode.value,
    poster: props.playData.poster
  })
  emit('close')
}

// 这里去掉了 onTimeUpdate 并在模板里使用内联，更安全
const updateProgress = (video) => { currentProgress.value = (video.currentTime / video.duration) * 100 || 0 }

// 生命周期与监听
onMounted(() => {
  const container = document.getElementById('video-scroll-container')
  if (container) container.scrollTop = (currentEpisode.value - 1) * container.clientHeight

  requestAnimationFrame(() => {
    observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        const epIndex = Number(entry.target.dataset.ep)
        const video = videoRefs.value[epIndex]
        
        if (entry.isIntersecting) {
          currentEpisode.value = epIndex
          nextTick(() => {
            if (isPlaying.value && video && !isEnded.value) {
              const targetTime = pendingResumeTime.value;
              pendingResumeTime.value = 0;

              const attemptPlay = () => {
                if (targetTime > 0) { video.currentTime = targetTime; } 
                else if (video.currentTime > 0 && targetTime === 0) { video.currentTime = 0; }
                video.playbackRate = speedState.rate;
                video.play().catch(e => console.log('浏览器自动播放拦截:', e));
              }
              if (video.readyState >= 1) { attemptPlay() } else { video.addEventListener('loadedmetadata', attemptPlay, { once: true }) }
            }
          })
        } else { 
          if (video) video.pause() 
        }
      })
    }, { root: container, threshold: 0.6 })
    document.querySelectorAll('.video-snap-item').forEach(el => observer.observe(el))
  })

  if (isPlaying.value && !isEnded.value) { sendHeartbeat('playing'); heartbeatTimer = setInterval(() => sendHeartbeat('playing'), 10000) }
})

onUnmounted(() => {
  if (observer) { observer.disconnect(); observer = null }
  Object.values(videoRefs.value).forEach(vid => { if(vid) vid.pause() }); 
  Object.values(hlsInstances).forEach(hls => { if(hls) hls.destroy() }); 
  clearInterval(heartbeatTimer)
})

watch(isPlaying, (newVal) => {
  nextTick(() => {
    const video = videoRefs.value[currentEpisode.value]
    if (video) { 
      if (newVal) { video.play(); sendHeartbeat('playing'); clearInterval(heartbeatTimer); heartbeatTimer = setInterval(() => sendHeartbeat('playing'), 10000) } 
      else { video.pause(); sendHeartbeat('paused'); clearInterval(heartbeatTimer) }
    }
  })
})

watch(currentEpisode, () => { sendHeartbeat(isPlaying.value ? 'playing' : 'paused') })
</script>

<template>
  <div class="absolute inset-0 w-full h-full bg-black z-40 overflow-hidden">
    
    <div 
      id="video-scroll-container"
      class="absolute inset-0 w-full h-full overflow-y-scroll snap-y snap-mandatory no-scrollbar touch-manipulation select-none"
      @scroll="handleScroll"
      @pointerdown="handlePointerDown"
      @pointermove="handlePointerMove"
      @pointerup="handlePointerUp"
      @pointercancel="handlePointerUp"
      @click="handlePlayerClick"
      @contextmenu.prevent
    >
      <div 
        v-for="ep in playData.episodes" 
        :key="ep.id" :data-ep="ep.index"
        class="video-snap-item w-full h-full snap-start snap-always relative flex-shrink-0 bg-[#050505] flex flex-col justify-center items-center overflow-hidden"
      >
        <img :src="ep.epPoster" loading="lazy" class="absolute inset-0 w-full h-full object-cover opacity-50 pointer-events-none" />
        <div class="absolute inset-0 bg-gradient-to-b from-black/40 via-transparent to-black/80 pointer-events-none z-[5]"></div>

        <video 
          v-if="ep.index === currentEpisode"
          :ref="(el) => initVideoNode(el, ep)"
          :muted="settings.muteDefault"
          autoplay
          playsinline webkit-playsinline
          class="w-full h-full object-contain pointer-events-none relative z-10"
          @timeupdate="updateProgress($event.target)"
          @ended="handleVideoEnded()"
        ></video>
      </div>
    </div>

    <transition enter-active-class="transition-all duration-200" enter-from-class="opacity-0 -translate-y-4" enter-to-class="opacity-100 translate-y-0" leave-active-class="transition-all duration-200" leave-from-class="opacity-100 translate-y-0" leave-to-class="opacity-0 -translate-y-4">
      <div v-if="speedState.active || speedState.locked" class="absolute top-[calc(env(safe-area-inset-top,1rem)+4rem)] left-1/2 -translate-x-1/2 px-5 py-2 bg-black/70 backdrop-blur-md rounded-full border border-emerald-500/50 z-[60] flex items-center gap-2 shadow-[0_0_15px_rgba(16,185,129,0.3)] pointer-events-none">
        <span v-if="speedState.locked" class="text-emerald-400 text-sm">🔒</span>
        <span v-else class="text-emerald-400 font-black text-sm tracking-widest">>></span>
        <span class="text-white font-bold text-sm tracking-wider">{{ speedState.locked ? '2X 倍速已锁定' : '2X 极速播放中' }}</span>
      </div>
    </transition>

    <div v-show="(!isPlaying && !isEnded) || showPlayFlash" class="absolute inset-0 m-auto w-20 h-20 bg-black/50 backdrop-blur-md border border-white/10 rounded-full flex items-center justify-center pointer-events-none z-[55] shadow-2xl transition-opacity duration-300" :class="showPlayFlash ? 'opacity-0 scale-125' : 'opacity-100 scale-100'">
      <svg v-if="!isPlaying" class="w-8 h-8 text-white/90 translate-x-[2px]" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
      <svg v-else class="w-8 h-8 text-white/90" fill="currentColor" viewBox="0 0 24 24"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>
    </div>

    <transition enter-active-class="transition-all duration-300 ease-out" enter-from-class="opacity-0 scale-90" enter-to-class="opacity-100 scale-100" leave-active-class="transition-all duration-200" leave-from-class="opacity-100 scale-100" leave-to-class="opacity-0 scale-90">
      <div v-if="isEnded" class="absolute inset-0 m-auto w-28 h-28 z-[55] flex items-center justify-center">
         <div v-if="currentEpisode < playData.episodes.length" @click.stop="clickPlayNext" class="w-24 h-24 bg-black/60 backdrop-blur-xl border border-emerald-500/60 rounded-full flex flex-col items-center justify-center cursor-pointer shadow-[0_0_25px_rgba(16,185,129,0.3)] hover:scale-105 active:scale-95 transition-transform duration-200 group">
            <svg class="w-8 h-8 text-emerald-400 translate-x-[2px] mb-1 group-hover:text-emerald-300" fill="currentColor" viewBox="0 0 24 24"><path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z"/></svg>
            <span class="text-[10px] font-bold text-emerald-400 tracking-widest group-hover:text-emerald-300">下一集</span>
         </div>
         <div v-else @click.stop="clickReplay" class="w-24 h-24 bg-black/60 backdrop-blur-xl border border-white/20 rounded-full flex flex-col items-center justify-center cursor-pointer hover:scale-105 active:scale-95 transition-transform duration-200">
            <svg class="w-7 h-7 text-white/90 mb-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path></svg>
            <span class="text-[10px] font-bold text-white/90 tracking-widest">重播本集</span>
         </div>
      </div>
    </transition>

    <div 
      :class="(isPlayerUiVisible && !showEpDrawer) ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'" 
      class="absolute inset-0 w-full h-full transition-opacity duration-300 z-50 flex flex-col justify-between pointer-events-none select-none"
    >
      <header class="w-full p-4 flex items-center justify-between pt-[env(safe-area-inset-top,1rem)] pointer-events-auto">
        <button @click.stop="closePlayer" class="p-2 text-white hover:text-gray-300 active:scale-90 transition outline-none">
          <svg class="w-8 h-8 drop-shadow-md" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M15 19l-7-7 7-7"></path></svg>
        </button>
        <button @click.stop="showEpDrawer = true" class="px-4 py-1.5 bg-white/10 backdrop-blur-md rounded-full border border-white/20 text-sm font-bold text-white shadow-lg active:scale-95 transition flex items-center gap-1 outline-none">
           <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h7"></path></svg> 选集
        </button>
      </header>

      <div class="w-full relative pointer-events-auto">
        <div class="w-full px-4 flex items-end justify-between pb-[calc(env(safe-area-inset-bottom,0px)+3.5rem)]">
          <div class="flex flex-col gap-2 w-full pr-4">
            <h2 class="text-xl font-black text-white drop-shadow-lg">{{ playData.title }}</h2>
            <div class="flex items-center gap-2">
              <span class="px-2 py-0.5 bg-emerald-500 rounded text-xs font-bold text-white shadow-sm">第 {{ currentEpisode }} 集</span>
              <span class="text-xs text-gray-300">/ 共 {{ playData.episodes.length }} 集</span>
            </div>
            <p class="text-sm text-gray-200 line-clamp-2 drop-shadow-md leading-relaxed mt-1">
              {{ playData.episodes.find(e => e.index === currentEpisode)?.title || '正在播放...' }}
            </p>
          </div>
        </div>

        <div class="absolute bottom-[calc(env(safe-area-inset-bottom,0px)+1.5rem)] left-3 right-3 h-1 bg-white/30 rounded-full cursor-pointer py-2 -my-2" @click.stop="handleSeek">
          <div class="h-1 bg-transparent w-full relative rounded-full top-1/2 -translate-y-1/2 overflow-hidden pointer-events-none">
            <div class="h-full bg-emerald-500 absolute left-0 top-0 transition-all duration-100" :style="`width: ${currentProgress}%`"></div>
          </div>
          <div class="absolute top-1/2 -translate-y-1/2 w-3 h-3 bg-white rounded-full shadow-[0_0_5px_rgba(0,0,0,0.5)] transition-all duration-100 pointer-events-none" :style="`left: calc(${currentProgress}% - 6px)`"></div>
        </div>
      </div>
    </div>

    <transition enter-active-class="transition-transform duration-300 ease-out" enter-from-class="translate-x-full" enter-to-class="translate-x-0" leave-active-class="transition-transform duration-300 ease-in" leave-from-class="translate-x-0" leave-to-class="translate-x-full">
      <div v-if="showEpDrawer" class="absolute top-0 right-0 bottom-0 w-3/5 bg-zinc-900/95 backdrop-blur-2xl border-l border-zinc-700/50 z-[60] flex flex-col shadow-[-10px_0_30px_rgba(0,0,0,0.5)] pt-[env(safe-area-inset-top,1rem)] pb-[env(safe-area-inset-bottom,1rem)]">
         <div class="p-4 flex items-center justify-between border-b border-white/10">
           <span class="font-bold text-white text-sm">选集 ({{ playData.episodes.length }})</span>
           <button @click="showEpDrawer = false" class="p-1 text-zinc-400 hover:text-white active:scale-90"><svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path></svg></button>
         </div>
         <div class="flex-1 overflow-y-auto p-3 grid grid-cols-4 gap-2 no-scrollbar content-start">
           <button 
             v-for="ep in playData.episodes" :key="ep.id"
             @click="startPlaying(ep.index, 0)"
             class="aspect-square rounded flex items-center justify-center text-xs font-medium active:scale-90 transition"
             :class="ep.index === currentEpisode ? 'bg-emerald-500/20 border border-emerald-500 text-emerald-400' : 'bg-zinc-800 border border-transparent text-zinc-300 hover:bg-zinc-700'"
           >
             {{ ep.index }}
           </button>
         </div>
      </div>
    </transition>

    <transition enter-active-class="transition-opacity duration-300" leave-active-class="transition-opacity duration-300" enter-from-class="opacity-0" leave-to-class="opacity-0">
      <div v-if="showEpDrawer" @click="showEpDrawer = false; showPlayerUi()" class="absolute inset-0 bg-black/60 z-[55]"></div>
    </transition>
  </div>
</template>