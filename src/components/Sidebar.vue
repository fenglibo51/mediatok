<script setup>
import { ref, onMounted, watch, computed } from 'vue'

const props = defineProps({
  isOpen: Boolean,
  servers: Object,
  activeServerId: String,
  settings: Object,
  selectedLibs: Array,
  availableLibraries: Array
})

const emit = defineEmits([
  'close', 
  'update-server-status', 
  'update-libraries', 
  'change-active-server'
])

// ==================== 🚀 核心逻辑：智能化热更新管理 ====================
const updateState = ref('idle') // idle, checking, updating, success, latest
const checkUpdate = async () => {
  // 如果正在检查、正在更新或已经是最新，直接拦截，防止重复点击
  if (updateState.value !== 'idle') return
  
  updateState.value = 'checking'
  
  try {
    const res = await fetch('/api/check-update')
    const data = await res.json()
    
    // 只有后端明确返回 hasUpdate: true 才会执行拉取
    if (data.hasUpdate) {
      updateState.value = 'updating'
      const updateRes = await fetch('/api/perform-update', { method: 'POST' })
      const updateData = await updateRes.json()
      
      if (updateData.success) {
        updateState.value = 'success'
        // 击碎 PWA 缓存
        if ('serviceWorker' in navigator) {
          const reg = await navigator.serviceWorker.getRegistration()
          if (reg && reg.waiting) reg.waiting.postMessage({ type: 'SKIP_WAITING' })
        }
        // 给用户 1.5 秒看到“部署完成”，然后刷新
        setTimeout(() => { window.location.reload(true) }, 1500)
      } else {
        updateState.value = 'idle'
        alert('后端解压失败，请检查 NAS 磁盘空间或权限')
      }
    } else {
      // 后端返回 hasUpdate: false，进入“已是最新”状态
      updateState.value = 'latest'
      // 3秒后恢复，让按钮重新变回可点击的“检查更新”
      setTimeout(() => { updateState.value = 'idle' }, 3000)
    }
  } catch (e) { 
    console.error('更新接口联络中断:', e)
    updateState.value = 'idle' 
  }
}

// ==================== 🛠️ 核心逻辑：服务器与库管理 ====================
const currentDrawer = ref('main')
const testState = ref('idle')
const tempSetupServerId = ref('')
const cacheSize = ref('计算中...')
const cacheState = ref('idle')

watch(() => props.isOpen, (val) => { if (!val) setTimeout(() => { currentDrawer.value = 'main' }, 300) })

const getStatusColor = (s) => {
  if (s === 'connected') return 'bg-emerald-500 shadow-[0_0_6px_rgba(16,185,129,0.8)]'
  if (s === 'error') return 'bg-red-500 shadow-[0_0_6px_rgba(239,68,68,0.8)]'
  return 'bg-white shadow-[0_0_6px_rgba(255,255,255,0.6)]'
}

const goToServerSetup = (id) => { tempSetupServerId.value = id; testState.value = 'idle'; currentDrawer.value = 'server-setup' }

const testConnection = async () => {
  const sid = tempSetupServerId.value
  const server = props.servers[sid]
  if (!server.ip || !server.token) { testState.value = 'error'; server.status = 'error'; return }
  testState.value = 'testing'
  const baseUrl = server.ip.replace(/\/$/, '')
  try {
    let libs = []
    if (sid === 'plex') {
      const res = await fetch(`${baseUrl}/library/sections?X-Plex-Token=${server.token}`, { headers: { 'Accept': 'application/json' } })
      const data = await res.json()
      libs = (data.MediaContainer?.Directory || []).filter(d => d.type === 'movie' || d.type === 'show').map(l => ({ id: l.key, name: l.title, type: l.type }))
    } else {
      const res = await fetch(`${baseUrl}/Library/VirtualFolders?api_key=${server.token}`, { headers: { 'Accept': 'application/json' } })
      const data = await res.json()
      libs = data.map(l => ({ id: l.ItemId, name: l.Name, type: l.CollectionType === 'movies' ? 'movie' : 'show' }))
    }
    const other = props.selectedLibs.filter(l => l.serverId !== sid)
    const current = props.selectedLibs.filter(l => l.serverId === sid && libs.some(lx => lx.id === l.libId))
    emit('update-libraries', { available: libs, selected: [...other, ...current] })
    testState.value = 'success'; server.status = 'connected'
  } catch (err) { testState.value = 'error'; server.status = 'error' }
}

const toggleLib = (lib) => {
  const sid = tempSetupServerId.value
  const newSelected = [...props.selectedLibs]
  const idx = newSelected.findIndex(l => l.serverId === sid && l.libId === lib.id)
  if (idx > -1) newSelected.splice(idx, 1)
  else newSelected.push({ serverId: sid, libId: lib.id, name: lib.name })
  emit('update-libraries', { available: props.availableLibraries, selected: newSelected })
}

const hasSelectedLibsForCurrentServer = computed(() => props.selectedLibs.some(l => l.serverId === tempSetupServerId.value))

const saveServerSetup = () => {
  props.servers[tempSetupServerId.value].status = 'connected'
  emit('change-active-server', tempSetupServerId.value)
  currentDrawer.value = 'servers'
}

const calculateCacheSize = async () => {
  if ('storage' in navigator && 'estimate' in navigator.storage) {
    const est = await navigator.storage.estimate()
    cacheSize.value = `${(est.usage / (1024 * 1024)).toFixed(2)} MB`
  } else cacheSize.value = '不支持'
}

const clearCache = async () => {
  if (cacheState.value !== 'idle' || cacheSize.value === '0.00 MB') return
  cacheState.value = 'clearing'
  const names = await caches.keys()
  await Promise.all(names.map(n => caches.delete(n)))
  await calculateCacheSize()
  cacheState.value = 'cleared'
  setTimeout(() => { cacheState.value = 'idle' }, 2000)
}

onMounted(calculateCacheSize)
</script>

<template>
  <div class="relative z-50">
    <transition enter-active-class="transition-opacity duration-300" enter-from-class="opacity-0" enter-to-class="opacity-100" leave-active-class="transition-opacity duration-300" leave-from-class="opacity-100" leave-to-class="opacity-0">
      <div v-if="isOpen" @click="$emit('close')" class="fixed inset-0 bg-black/70 backdrop-blur-sm z-40"></div>
    </transition>

    <div class="fixed top-[calc(env(safe-area-inset-top,0px)+1rem)] bottom-4 left-4 z-50 w-[80%] bg-zinc-900/95 backdrop-blur-2xl rounded-[2.5rem] border border-zinc-700/50 shadow-2xl transition-transform duration-300 ease-out flex flex-col overflow-hidden" :class="isOpen ? 'translate-x-0' : '-translate-x-[110%]'">
      
      <div v-if="currentDrawer === 'main'" class="flex flex-col h-full animate-[fadeIn_0.2s_ease-out]">
        <div class="p-8 border-b border-zinc-700/30 flex flex-col items-center">
          <div class="w-12 h-12 rounded-2xl bg-gradient-to-br from-emerald-400 to-cyan-500 flex items-center justify-center shadow-lg mb-3">
            <span class="text-zinc-950 font-black text-xl tracking-tighter">MT</span>
          </div>
          <h1 class="text-2xl font-black text-white tracking-widest">MEDIA-TOK</h1>
        </div>
        <div class="flex-1 p-6 space-y-4">
          <button @click="currentDrawer = 'servers'" class="w-full p-5 bg-zinc-800/50 rounded-2xl border border-zinc-700/50 flex items-center justify-between group active:scale-95 transition outline-none">
            <div class="flex items-center gap-4">
              <div class="w-10 h-10 bg-emerald-500/10 rounded-xl flex items-center justify-center text-emerald-400">
                <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4"></path></svg>
              </div>
              <span class="font-bold text-zinc-200">库源切换</span>
            </div>
            <svg class="w-5 h-5 text-zinc-600 group-hover:text-emerald-400 transition" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"></path></svg>
          </button>
        </div>
        <div class="p-6 border-t border-zinc-700/30 flex gap-4">
          <button @click="currentDrawer = 'settings'" class="flex-1 py-4 bg-zinc-800 rounded-2xl font-bold text-zinc-300 flex items-center justify-center gap-2 active:scale-95 transition outline-none">
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"></path></svg>
            设置中心
          </button>
          <button @click="currentDrawer = 'about'" class="w-14 h-14 bg-zinc-800 rounded-2xl flex items-center justify-center text-zinc-300 active:scale-95 transition outline-none">
            <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
          </button>
        </div>
      </div>

      <div v-if="currentDrawer === 'servers'" class="flex flex-col h-full animate-[fadeIn_0.2s_ease-out]">
        <div class="p-6 border-b border-zinc-700/30 flex items-center relative">
          <button @click="currentDrawer = 'main'" class="absolute left-6 text-zinc-400 hover:text-white"><svg class="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"></path></svg></button>
          <h2 class="text-xl font-bold text-white w-full text-center">选择平台</h2>
        </div>
        <div class="flex-1 p-6 space-y-4">
          <button v-for="s in servers" :key="s.id" @click="goToServerSetup(s.id)" class="w-full p-6 rounded-[2rem] flex items-center justify-between border transition outline-none" :class="activeServerId === s.id ? 'bg-emerald-500/10 border-emerald-500 text-emerald-400' : 'bg-zinc-800/40 border-zinc-700 text-zinc-400'">
            <span class="text-lg font-black tracking-widest uppercase">{{ s.name }}</span>
            <span class="w-2.5 h-2.5 rounded-full" :class="getStatusColor(s.status)"></span>
          </button>
        </div>
      </div>

      <div v-if="currentDrawer === 'server-setup'" class="flex flex-col h-full animate-[fadeIn_0.2s_ease-out]">
        <div class="p-6 border-b border-zinc-700/30 flex items-center relative">
          <button @click="currentDrawer = 'servers'" class="absolute left-6 text-zinc-400"><svg class="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"></path></svg></button>
          <h2 class="text-xl font-bold text-white w-full text-center">连接配置</h2>
        </div>
        <div class="flex-1 p-8 space-y-6">
          <input v-model="servers[tempSetupServerId].ip" type="text" placeholder="服务器地址 (IP/域名)" class="w-full bg-zinc-800 text-white p-5 rounded-2xl border border-zinc-700 focus:border-emerald-500 outline-none text-center">
          <input v-model="servers[tempSetupServerId].token" type="text" placeholder="Token / API Key" class="w-full bg-zinc-800 text-white p-5 rounded-2xl border border-zinc-700 focus:border-emerald-500 outline-none text-center">
          <div v-if="testState === 'success'" class="space-y-3 py-4">
            <p class="text-xs font-black text-emerald-400 text-center uppercase tracking-widest">请选择库源</p>
            <div class="flex flex-wrap justify-center gap-3">
              <button v-for="lib in availableLibraries" :key="lib.id" @click="toggleLib(lib)" class="px-5 py-2.5 rounded-xl text-xs font-black border transition outline-none" :class="selectedLibs.some(l => l.serverId === tempSetupServerId && l.libId === lib.id) ? 'bg-emerald-500 border-emerald-500 text-zinc-950' : 'bg-zinc-800 border-zinc-700 text-zinc-500'">{{ lib.name }}</button>
            </div>
          </div>
          <button @click="testState === 'success' ? saveServerSetup() : testConnection()" class="w-full py-5 rounded-2xl font-black text-lg transition shadow-xl outline-none" :class="testState === 'success' ? (hasSelectedLibsForCurrentServer ? 'bg-emerald-500 text-zinc-950' : 'bg-zinc-800 text-zinc-600') : 'bg-zinc-200 text-zinc-900'">
            {{ testState === 'idle' ? '开始连接' : testState === 'testing' ? '握手中...' : testState === 'success' ? (hasSelectedLibsForCurrentServer ? '保存并设为默认' : '请至少勾选一个库') : '重试' }}
          </button>
        </div>
      </div>

      <div v-if="currentDrawer === 'settings'" class="flex flex-col h-full animate-[fadeIn_0.2s_ease-out]">
        <div class="p-6 border-b border-zinc-700/30 flex items-center relative">
          <button @click="currentDrawer = 'main'" class="absolute left-6 text-zinc-400"><svg class="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"></path></svg></button>
          <h2 class="text-xl font-bold text-white w-full text-center">播放参数</h2>
        </div>
        <div class="flex-1 p-6 space-y-6">
          <div @click="clearCache" class="p-6 bg-zinc-800/40 rounded-3xl border border-zinc-700/30 flex justify-between items-center cursor-pointer active:scale-95 transition">
            <div><p class="font-bold text-zinc-200">深度清除缓存</p><p class="text-[10px] text-zinc-500 uppercase tracking-widest">Free storage space</p></div>
            <span class="font-black text-emerald-400">{{ cacheState === 'idle' ? cacheSize : 'CLEANING...' }}</span>
          </div>
          <div class="p-6 bg-zinc-800/40 rounded-3xl border border-zinc-700/30 flex justify-between items-center">
            <span class="font-bold text-zinc-200">无限循环播放</span>
            <button @click="settings.infinitePlay = !settings.infinitePlay" class="w-14 h-7 rounded-full transition relative outline-none" :class="settings.infinitePlay ? 'bg-emerald-500' : 'bg-zinc-600'"><div class="w-5 h-5 bg-white rounded-full absolute top-1 transition-transform" :class="settings.infinitePlay ? 'translate-x-8' : 'translate-x-1'"></div></button>
          </div>
          <div class="p-6 bg-zinc-800/40 rounded-3xl border border-zinc-700/30 flex justify-between items-center">
            <span class="font-bold text-zinc-200">入场默认静音</span>
            <button @click="settings.muteDefault = !settings.muteDefault" class="w-14 h-7 rounded-full transition relative outline-none" :class="settings.muteDefault ? 'bg-emerald-500' : 'bg-zinc-600'"><div class="w-5 h-5 bg-white rounded-full absolute top-1 transition-transform" :class="settings.muteDefault ? 'translate-x-8' : 'translate-x-1'"></div></button>
          </div>
        </div>
      </div>

      <div v-if="currentDrawer === 'about'" class="flex flex-col h-full animate-[fadeIn_0.2s_ease-out]">
        <div class="p-6 border-b border-zinc-700/30 flex items-center relative">
          <button @click="currentDrawer = 'main'" class="absolute left-6 text-zinc-400"><svg class="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"></path></svg></button>
          <h2 class="text-xl font-bold text-white w-full text-center">项目档案</h2>
        </div>
        
        <div class="flex-1 p-6 space-y-6 overflow-y-auto no-scrollbar text-center">
          <div class="bg-zinc-800/40 rounded-[2.5rem] p-8 border border-zinc-700/30 flex flex-col items-center">
            <div class="w-20 h-20 rounded-3xl bg-gradient-to-br from-emerald-400 to-cyan-500 flex items-center justify-center shadow-2xl mb-6">
              <span class="text-zinc-950 font-black text-4xl tracking-tighter">MT</span>
            </div>
            <h1 class="text-3xl font-black text-white mb-1">MEDIA-TOK</h1>
            <p class="text-emerald-400 font-black text-xs tracking-[0.2em] mb-6 uppercase">Version 1.0.1 (Alpha)</p>
            
            <div class="flex flex-wrap justify-center gap-2 mb-8">
              <span class="px-2.5 py-1 bg-sky-500/10 text-[9px] font-black text-sky-400 rounded-md border border-sky-500/20 uppercase tracking-widest">VUE 3</span>
              <span class="px-2.5 py-1 bg-sky-500/10 text-[9px] font-black text-sky-400 rounded-md border border-sky-500/20 uppercase tracking-widest">TAILWIND</span>
              <span class="px-2.5 py-1 bg-sky-500/10 text-[9px] font-black text-sky-400 rounded-md border border-sky-500/20 uppercase tracking-widest">PWA</span>
              <span class="px-2.5 py-1 bg-emerald-500/10 text-[9px] font-black text-emerald-400 rounded-md border border-emerald-500/20 uppercase tracking-widest">@fenglibo51</span>
            </div>

            <a href="https://github.com/fenglibo51/mediatok" target="_blank" class="flex items-center gap-3 px-6 py-3 bg-zinc-900 rounded-2xl border border-zinc-700/50 hover:bg-zinc-800 transition group outline-none">
              <svg class="w-5 h-5 text-zinc-400 group-hover:text-white" fill="currentColor" viewBox="0 0 24 24"><path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12"/></svg>
              <span class="text-xs font-black text-zinc-400 group-hover:text-white uppercase tracking-widest">View Source Code</span>
            </a>
          </div>

          <button @click="checkUpdate" 
            class="w-full py-5 rounded-3xl font-black text-sm transition-all border shadow-lg outline-none" 
            :class="{
              'bg-zinc-800 border-zinc-700 text-zinc-300 active:scale-95': updateState === 'idle',
              'bg-sky-600/20 border-sky-500 text-sky-400 cursor-wait': updateState === 'checking',
              'bg-amber-500 border-amber-400 text-zinc-950': updateState === 'updating',
              'bg-emerald-500 border-emerald-400 text-zinc-950': updateState === 'success',
              'bg-zinc-800/50 border-zinc-800 text-zinc-500 cursor-not-allowed': updateState === 'latest'
            }">
            {{ 
              updateState === 'idle' ? '检查并拉取补丁' : 
              updateState === 'checking' ? '正在匹配版本...' : 
              updateState === 'updating' ? '拉取补丁中...' : 
              updateState === 'success' ? '更新部署完成！' : '已经是最新版本' 
            }}
          </button>

          <div class="pt-8 text-center">
             <div class="inline-flex items-center gap-3 px-4 py-2 bg-zinc-800/20 rounded-full border border-zinc-700/30">
               <span class="text-[10px] text-zinc-600 font-black uppercase tracking-[0.2em]">Special Thanks</span>
               <span class="text-[10px] text-emerald-500 font-black uppercase tracking-widest">@migumigu</span>
             </div>
             <p class="mt-8 text-[9px] text-zinc-700 font-black tracking-[0.5em] uppercase opacity-30">MEDIA-TOK BY FENGLIBO51</p>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>