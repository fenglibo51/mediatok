<script setup>
import { ref, onMounted, watch, computed } from 'vue' // 🌟 别忘了引 computed

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

// ==================== 🌟 热更新状态管理 (接入全栈后端版) ====================
const updateState = ref('idle')
const checkUpdate = async () => {
  if (updateState.value !== 'idle' && updateState.value !== 'latest') return
  updateState.value = 'checking'

  try {
    // 1. 询问 Node.js 后端管家是否有新版本
    const res = await fetch('/api/check-update')
    const data = await res.json()

    if (data.hasUpdate) {
      updateState.value = 'updating'
      
      // 2. 💥 命令后端执行自杀式下载覆盖操作
      const updateRes = await fetch('/api/perform-update', { method: 'POST' })
      const updateData = await updateRes.json()

      if (updateData.success) {
        updateState.value = 'success'
        
        // 3. 后端更新完了！现在击碎手机 PWA 缓存
        if ('serviceWorker' in navigator) {
          const registration = await navigator.serviceWorker.getRegistration()
          if (registration && registration.waiting) {
            registration.waiting.postMessage({ type: 'SKIP_WAITING' })
          }
        }
        
        // 给用户 1.5 秒时间欣赏“更新部署完成！”的绿色提示，然后强制刷新脱胎换骨
        setTimeout(() => {
          window.location.reload(true)
        }, 1500)
        
      } else {
         console.error('更新失败:', updateData.msg)
         updateState.value = 'idle'
         alert('拉取更新失败，请检查 NAS 网络或后端日志。')
      }
    } else {
      // 当前已是最新
      updateState.value = 'latest'
      setTimeout(() => { updateState.value = 'idle' }, 3000)
    }
  } catch (e) {
    console.error('请求更新接口彻底失联:', e)
    updateState.value = 'idle'
  }
}
// ==================== 🌟 热更新逻辑结束 ====================

// 侧边栏内部专属状态
const currentDrawer = ref('main')

// 🌟 魔法：监听侧边栏开关状态，关闭时自动重置回主菜单
watch(() => props.isOpen, (newVal) => {
  if (!newVal) {
    setTimeout(() => {
      currentDrawer.value = 'main'
    }, 300)
  }
})

const testState = ref('idle')
const tempSetupServerId = ref('')
const cacheSize = ref('计算中...')
const cacheState = ref('idle')

// 状态灯颜色
const getStatusColor = (status) => {
  if (status === 'connected') return 'bg-emerald-500 shadow-[0_0_6px_rgba(16,185,129,0.8)]'
  if (status === 'error') return 'bg-red-500 shadow-[0_0_6px_rgba(239,68,68,0.8)]'
  return 'bg-white shadow-[0_0_6px_rgba(255,255,255,0.6)]'
}

const goToServerSetup = (id) => { tempSetupServerId.value = id; testState.value = 'idle'; currentDrawer.value = 'server-setup' }

// ==================== 🌟 核心逻辑改造区 开始 ====================

// 连通测试逻辑 (改造点：绝不误伤其他服务器的配置)
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
      if (!res.ok) throw new Error()
      const data = await res.json()
      libs = (data.MediaContainer?.Directory || []).filter(d => d.type === 'movie' || d.type === 'show').map(l => ({ id: l.key, name: l.title, type: l.type }))
    } 
    else if (sid === 'emby' || sid === 'jellyfin') {
      const res = await fetch(`${baseUrl}/Library/VirtualFolders?api_key=${server.token}`, { headers: { 'Accept': 'application/json' } })
      if (!res.ok) throw new Error()
      const data = await res.json()
      libs = data.map(l => ({ id: l.ItemId, name: l.Name, type: l.CollectionType === 'movies' ? 'movie' : 'show' }))
    }

    const validIds = libs.map(l => l.id)
    
    // 🌟 神奇魔法 1：过滤时，保留其他服务器的配置，只清洗当前测试服务器的“已失效库”
    const otherServerLibs = props.selectedLibs.filter(l => l.serverId !== sid)
    const currentServerValidLibs = props.selectedLibs.filter(l => l.serverId === sid && validIds.includes(l.libId))
    const newSelected = [...otherServerLibs, ...currentServerValidLibs]
    
    emit('update-libraries', { available: libs, selected: newSelected })
    
    testState.value = 'success'; server.status = 'connected'
  } catch (err) { 
    testState.value = 'error'; server.status = 'error' 
  }
}

// 切换库的勾选状态 (改造点：打上“身份标签”)
const toggleLib = (lib) => {
  const sid = tempSetupServerId.value
  const newSelected = [...props.selectedLibs]
  
  // 找找看有没有同时匹配“服务器ID”和“库ID”的家伙
  const index = newSelected.findIndex(l => l.serverId === sid && l.libId === lib.id)
  
  if (index > -1) { 
    newSelected.splice(index, 1) // 找到了就取消勾选
  } else { 
    // 🌟 神奇魔法 2：没找到就添加，并且狠狠地给它打上复合标签！
    newSelected.push({ serverId: sid, libId: lib.id, name: lib.name }) 
  }
  emit('update-libraries', { available: props.availableLibraries, selected: newSelected })
}

// 检查当前测试的服务器，有没有被勾选任何媒体库
const hasSelectedLibsForCurrentServer = computed(() => {
  return props.selectedLibs.some(l => l.serverId === tempSetupServerId.value)
})

// ==================== 🌟 核心逻辑改造区 结束 ====================

const saveServerSetup = () => {
  const sid = tempSetupServerId.value
  props.servers[sid].status = 'connected' 
  emit('change-active-server', sid)
  currentDrawer.value = 'servers'; testState.value = 'idle'
}

// 缓存清理逻辑
const calculateCacheSize = async () => {
  if ('storage' in navigator && 'estimate' in navigator.storage) {
    try { const estimate = await navigator.storage.estimate(); cacheSize.value = `${(estimate.usage / (1024 * 1024)).toFixed(2)} MB` } catch (e) { cacheSize.value = '0 MB' }
  } else { cacheSize.value = '不支持测算' }
}

const clearCache = async () => {
  if (cacheState.value !== 'idle' || cacheSize.value === '0.00 MB') return
  cacheState.value = 'clearing'
  try {
    if ('caches' in window) { const cacheNames = await caches.keys(); await Promise.all(cacheNames.map(name => caches.delete(name))) }
    await calculateCacheSize(); cacheState.value = 'cleared'; setTimeout(() => { cacheState.value = 'idle' }, 2000)
  } catch (e) { cacheState.value = 'idle' }
}

onMounted(() => { calculateCacheSize() })
</script>

<template>
  <div class="relative z-50">
    <transition enter-active-class="transition-opacity duration-300" enter-from-class="opacity-0" enter-to-class="opacity-100" leave-active-class="transition-opacity duration-300" leave-from-class="opacity-100" leave-to-class="opacity-0">
      <div v-if="isOpen" @click="$emit('close')" class="fixed inset-0 bg-black/70 backdrop-blur-sm z-40"></div>
    </transition>

    <div class="fixed top-[calc(env(safe-area-inset-top,0px)+1rem)] bottom-4 left-4 z-50 w-[75%] bg-zinc-900/90 backdrop-blur-xl rounded-3xl border border-zinc-700/50 shadow-2xl transition-transform duration-300 ease-out flex flex-col overflow-hidden select-none" :class="isOpen ? 'translate-x-0' : '-translate-x-[120%]'">
      
      <div v-if="currentDrawer === 'main'" class="flex flex-col h-full w-full animate-[fadeIn_0.2s_ease-out]">
        <div class="p-6 pb-4 border-b border-zinc-700/50 flex justify-center items-center gap-3">
          <div class="w-8 h-8 rounded-lg bg-gradient-to-br from-emerald-400 to-cyan-500 flex items-center justify-center shadow-[0_0_12px_rgba(52,211,153,0.4)]"><span class="text-zinc-950 font-black text-sm tracking-tighter">MT</span></div>
          <h1 class="text-2xl font-black tracking-wider text-transparent bg-clip-text bg-gradient-to-r from-gray-100 to-gray-400 drop-shadow-sm">Media-Tok</h1>
        </div>
        <div class="flex-1 p-4 space-y-4 overflow-y-auto">
          <button @click="currentDrawer = 'servers'" class="w-full p-4 rounded-2xl bg-zinc-800/60 hover:bg-zinc-700/60 active:bg-zinc-700/80 transition flex items-center justify-center group relative outline-none">
            <div class="relative flex items-center">
              <svg class="w-5 h-5 text-emerald-400 absolute right-full mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4m0 5c0 2.21-3.582 4-8 4s-8-1.79-8-4"></path></svg>
              <span class="text-base font-medium text-gray-200">媒体库切换</span>
            </div>
            <svg class="w-4 h-4 text-zinc-500 absolute right-4 group-hover:text-emerald-400 transition" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"></path></svg>
          </button>
        </div>
        <div class="p-5 border-t border-zinc-700/50 flex justify-between items-center bg-zinc-800/30">
          <button @click="currentDrawer = 'settings'" class="px-5 py-3 rounded-2xl bg-zinc-800 hover:bg-zinc-700 active:scale-95 transition flex items-center gap-2.5 shadow-sm outline-none">
            <svg class="w-5 h-5 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"></path><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"></path></svg><span class="text-sm font-bold text-gray-200">设置</span>
          </button>
          <button @click="currentDrawer = 'about'" class="p-3 rounded-full bg-zinc-800 hover:bg-zinc-700 active:scale-95 transition flex items-center justify-center shadow-sm outline-none">
            <svg class="w-6 h-6 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
          </button>
        </div>
      </div>

      <div v-if="currentDrawer === 'servers'" class="flex flex-col h-full w-full animate-[fadeIn_0.2s_ease-out]">
        <div class="p-4 border-b border-zinc-700/50 flex items-center relative">
          <button @click="currentDrawer = 'main'" class="absolute left-4 p-2 -ml-2 text-zinc-400 hover:text-white transition active:scale-90 outline-none"><svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"></path></svg></button>
          <h2 class="text-lg font-bold text-gray-200 flex-1 text-center">选择服务器平台</h2>
        </div>
        <div class="flex-1 p-4 space-y-4 overflow-y-auto">
          <button v-for="server in servers" :key="server.id" @click="goToServerSetup(server.id)" class="w-full p-4 rounded-2xl transition flex items-center justify-center relative outline-none" :class="activeServerId === server.id ? 'bg-emerald-500/10 border border-emerald-500/50 hover:bg-emerald-500/20' : 'bg-zinc-800/60 hover:bg-zinc-700/60 active:bg-zinc-700/80'">
            <div class="relative flex items-center justify-center w-36">
              <svg v-if="server.id === 'plex'" class="absolute left-0 w-4 h-4 text-amber-500" viewBox="0 0 24 24" fill="currentColor"><path d="M11.643 0H4.305L10.27 12l-5.965 12h7.338L17.608 12 11.643 0z"/></svg>
              <svg v-if="server.id === 'emby'" class="absolute left-0 w-4 h-4 text-green-500" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 14.5v-9l6 4.5-6 4.5z"/></svg>
              <svg v-if="server.id === 'jellyfin'" class="absolute left-0 w-4 h-4 text-purple-500" viewBox="0 0 24 24" fill="currentColor"><path d="M22.04 11.65l-5.26-5.26a1.5 1.5 0 0 0-2.12 0l-2.12 2.12a1.5 1.5 0 0 0 0 2.12l3.14 3.14-3.14 3.14a1.5 1.5 0 0 0 0 2.12l2.12 2.12a1.5 1.5 0 0 0 2.12 0l5.26-5.26a1.5 1.5 0 0 0 0-2.13zM6.48 16.59L3.34 13.45a1.5 1.5 0 0 1 0-2.12L6.48 8.19a1.5 1.5 0 0 1 2.12 0l2.12 2.12a1.5 1.5 0 0 1 0 2.12L7.58 15.53l3.14 3.14a1.5 1.5 0 0 1 0 2.12l-2.12 2.12a1.5 1.5 0 0 1-2.12 0z"/></svg>
              <span class="text-base font-bold tracking-wide" :class="activeServerId === server.id ? 'text-emerald-400' : 'text-gray-200'">{{ server.name }}</span>
              <span class="absolute right-0 w-2 h-2 rounded-full" :class="getStatusColor(server.status)"></span>
            </div>
            <svg class="w-4 h-4 text-zinc-600 absolute right-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"></path></svg>
          </button>
        </div>
      </div>

      <div v-if="currentDrawer === 'server-setup'" class="flex flex-col h-full w-full animate-[fadeIn_0.2s_ease-out]">
        <div class="p-4 border-b border-zinc-700/50 flex items-center relative">
          <button @click="currentDrawer = 'servers'; testState = 'idle'" class="absolute left-4 p-2 -ml-2 text-zinc-400 hover:text-white transition active:scale-90 outline-none"><svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"></path></svg></button>
          <h2 class="text-lg font-bold text-gray-200 flex-1 text-center">{{ servers[tempSetupServerId].name }} 配置</h2>
        </div>
        <div class="flex-1 p-6 overflow-y-auto flex flex-col items-center">
          <div class="w-full space-y-5">
            <div class="relative"><p class="text-sm font-medium text-zinc-300 text-center mb-2">IP 地址或域名</p><input v-model="servers[tempSetupServerId].ip" type="text" :placeholder="tempSetupServerId === 'plex' ? '例如: http://192.168.1.10:32400' : '例如: http://192.168.1.10:8096'" class="w-full bg-zinc-800/80 text-white placeholder-zinc-600 text-center px-4 py-3.5 rounded-xl border border-zinc-700 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition" :disabled="testState === 'success'"></div>
            <div class="relative"><p class="text-sm font-medium text-zinc-300 text-center mb-2">API Key / Token</p><input v-model="servers[tempSetupServerId].token" type="text" placeholder="输入密钥" class="w-full bg-zinc-800/80 text-white placeholder-zinc-600 text-center px-4 py-3.5 rounded-xl border border-zinc-700 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition" :disabled="testState === 'success'"></div>
          </div>
          <div v-if="testState === 'success'" class="w-full mt-6 p-5 bg-zinc-800/40 rounded-2xl border border-zinc-700/50 shadow-inner animate-[fadeIn_0.3s_ease-out]">
            <div class="flex items-center justify-center gap-2 text-emerald-400 mb-4"><svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M5 13l4 4L19 7"></path></svg><span class="text-sm font-bold">连通成功！请选择媒体库</span></div>
            <div class="flex flex-wrap justify-center gap-3">
              <button v-for="lib in availableLibraries" :key="lib.id" @click="toggleLib(lib)" class="px-4 py-2 rounded-xl text-xs font-bold transition-all duration-200 border outline-none" :class="selectedLibs.some(l => l.serverId === tempSetupServerId && l.libId === lib.id) ? 'bg-emerald-500/20 border-emerald-500 text-emerald-400 shadow-[0_0_10px_rgba(16,185,129,0.2)]' : 'bg-zinc-800 border-zinc-700 text-zinc-400 hover:border-zinc-500'">{{ lib.name }}</button>
            </div>
          </div>
          
          <button @click="testState === 'success' ? saveServerSetup() : testConnection()" :disabled="testState === 'testing' || (testState === 'success' && !hasSelectedLibsForCurrentServer)" class="w-full mt-8 py-3.5 rounded-xl font-bold transition-all duration-300 flex justify-center items-center gap-2 outline-none" :class="{'bg-zinc-700 text-white hover:bg-zinc-600 active:scale-95': testState === 'idle', 'bg-cyan-600 text-white animate-pulse cursor-wait': testState === 'testing', 'bg-emerald-500 text-white active:scale-95 shadow-[0_0_15px_rgba(16,185,129,0.4)]': testState === 'success' && hasSelectedLibsForCurrentServer, 'bg-zinc-800 text-zinc-500 cursor-not-allowed border border-zinc-700': testState === 'success' && !hasSelectedLibsForCurrentServer, 'bg-red-500 text-white active:scale-95': testState === 'error'}">
            <svg v-if="testState === 'idle'" class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z"></path></svg>
            <svg v-if="testState === 'testing'" class="w-5 h-5 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path></svg>
            <svg v-if="testState === 'error'" class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
            <span>{{ testState === 'idle' ? '连通测试' : testState === 'testing' ? '正在握手...' : testState === 'success' && !hasSelectedLibsForCurrentServer ? '请勾选媒体库' : testState === 'success' && hasSelectedLibsForCurrentServer ? '设为默认服务器并保存' : '检查下设置' }}</span>
          </button>
        </div>
      </div>

      <div v-if="currentDrawer === 'settings'" class="flex flex-col h-full w-full animate-[fadeIn_0.2s_ease-out]">
        <div class="p-4 border-b border-zinc-700/50 flex items-center relative">
          <button @click="currentDrawer = 'main'" class="absolute left-4 p-2 -ml-2 text-zinc-400 hover:text-white transition active:scale-90 outline-none"><svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"></path></svg></button>
          <h2 class="text-lg font-bold text-gray-200 flex-1 text-center">播放设置</h2>
        </div>
        <div class="flex-1 p-4 space-y-6 overflow-y-auto">
          <div @click="clearCache" class="flex items-center justify-between p-4 bg-zinc-800/40 hover:bg-zinc-700/40 active:scale-[0.98] transition cursor-pointer rounded-2xl">
            <div class="flex items-center gap-3"><svg class="w-5 h-5 text-rose-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg><div><p class="text-base font-medium text-gray-200">清除缓存</p><p class="text-xs text-zinc-500">释放海报与应用数据空间</p></div></div>
            <div class="flex items-center gap-2"><span v-if="cacheState === 'idle'" class="text-sm font-medium text-emerald-400">{{ cacheSize }}</span><svg v-if="cacheState === 'clearing'" class="w-5 h-5 text-rose-400 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path></svg><svg v-if="cacheState === 'cleared'" class="w-5 h-5 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path></svg></div>
          </div>
          <div class="flex items-center justify-between p-4 bg-zinc-800/40 rounded-2xl">
            <div class="flex items-center gap-3"><svg class="w-5 h-5 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path></svg><div><p class="text-base font-medium text-gray-200">无限播放</p><p class="text-xs text-zinc-500">播完自动滑入下一集</p></div></div>
            <button @click="settings.infinitePlay = !settings.infinitePlay" class="w-12 h-6 rounded-full transition-colors duration-300 relative outline-none" :class="settings.infinitePlay ? 'bg-emerald-500' : 'bg-zinc-600'"><div class="w-4 h-4 bg-white rounded-full absolute top-1 transition-transform duration-300" :class="settings.infinitePlay ? 'translate-x-7' : 'translate-x-1'"></div></button>
          </div>
          <div class="flex items-center justify-between p-4 bg-zinc-800/40 rounded-2xl">
            <div class="flex items-center gap-3"><svg class="w-5 h-5 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z"></path><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2"></path></svg><div><p class="text-base font-medium text-gray-200">默认静音</p><p class="text-xs text-zinc-500">点按音量键后解除</p></div></div>
            <button @click="settings.muteDefault = !settings.muteDefault" class="w-12 h-6 rounded-full transition-colors duration-300 relative outline-none" :class="settings.muteDefault ? 'bg-emerald-500' : 'bg-zinc-600'"><div class="w-4 h-4 bg-white rounded-full absolute top-1 transition-transform duration-300" :class="settings.muteDefault ? 'translate-x-7' : 'translate-x-1'"></div></button>
          </div>
        </div>
      </div>

      <div v-if="currentDrawer === 'about'" class="flex flex-col h-full w-full animate-[fadeIn_0.2s_ease-out]">
        <div class="p-4 flex items-center relative border-b border-zinc-700/50">
          <button @click="currentDrawer = 'main'" class="absolute left-4 p-2 -ml-2 text-zinc-400 hover:text-white transition active:scale-90 outline-none"><svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"></path></svg></button>
          <h2 class="text-lg font-bold text-gray-200 flex-1 text-center">关于</h2>
        </div>
        
        <div class="flex-1 p-5 space-y-5 overflow-y-auto no-scrollbar">
          
          <div class="bg-zinc-800/40 rounded-3xl p-6 border border-zinc-700/30 flex flex-col items-center text-center">
            <div class="w-16 h-16 rounded-2xl bg-gradient-to-br from-emerald-400 to-cyan-500 flex items-center justify-center shadow-[0_0_20px_rgba(52,211,153,0.2)] mb-4">
              <span class="text-zinc-950 font-black text-3xl tracking-tighter">MT</span>
            </div>
            <h1 class="text-2xl font-black tracking-wide text-white mb-1">Media-Tok</h1>
            <p class="text-emerald-400 text-sm font-bold mb-4">版本 1.0.0 (Alpha)</p>
            
            <div class="flex flex-wrap justify-center gap-1.5 mt-1">
              <span class="px-2 py-0.5 bg-sky-500/10 text-[10px] font-bold rounded border border-sky-500/20 text-sky-400/90 uppercase">Vue 3</span>
              <span class="px-2 py-0.5 bg-sky-500/10 text-[10px] font-bold rounded border border-sky-500/20 text-sky-400/90 uppercase">Tailwind</span>
              <span class="px-2 py-0.5 bg-sky-500/10 text-[10px] font-bold rounded border border-sky-500/20 text-sky-400/90 uppercase">Vite</span>
              <span class="px-2 py-0.5 bg-sky-500/10 text-[10px] font-bold rounded border border-sky-500/20 text-sky-400/90 uppercase">Pwa</span>
              <span class="px-2 py-0.5 bg-sky-500/10 text-[10px] font-bold rounded border border-sky-500/20 text-sky-400/90 uppercase">Docker</span>
              <span class="px-2 py-0.5 bg-sky-500/10 text-[10px] font-bold rounded border border-sky-500/20 text-sky-400/90 uppercase">@migumigu</span>
            </div>
          </div>

          <div class="py-1">
            <button @click="checkUpdate" 
              class="w-full py-4 rounded-2xl font-bold transition-all duration-300 flex justify-center items-center gap-3 outline-none border shadow-sm select-none"
              :class="{
                'bg-zinc-800/80 border-zinc-700 text-gray-200 hover:bg-zinc-700 active:scale-[0.98]': updateState === 'idle',
                'bg-zinc-800/40 border-blue-500/50 text-blue-400 cursor-wait': updateState === 'checking',
                'bg-zinc-800/40 border-amber-500/50 text-amber-400': updateState === 'updating',
                'bg-emerald-500/20 border-emerald-500 text-emerald-400': updateState === 'success',
                'bg-zinc-800/50 border-zinc-800 text-zinc-500': updateState === 'latest'
              }">
              
              <svg v-if="updateState === 'idle'" class="w-5 h-5 opacity-70" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"></path></svg>
              <svg v-if="updateState === 'checking' || updateState === 'updating'" class="w-5 h-5 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path></svg>
              <svg v-if="updateState === 'success'" class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path></svg>
              
              <span class="tracking-wide text-sm font-bold">
                {{ updateState === 'idle' ? '检查并拉取热更补丁' : 
                   updateState === 'checking' ? '正在校验版本...' : 
                   updateState === 'updating' ? '正在拉取热更补丁...' : 
                   updateState === 'success' ? '更新部署完成！' : '当前已是最新版本' }}
              </span>
            </button>
          </div>

          <div class="bg-zinc-800/20 rounded-3xl p-5 border border-zinc-700/20">
            <h3 class="text-[10px] font-black text-zinc-500 mb-5 ml-1 tracking-[0.2em] uppercase">核心特性 / Features</h3>
            <div class="space-y-4">
              <div class="flex items-center gap-4 px-1">
                <div class="w-8 h-8 rounded-full bg-zinc-800 flex items-center justify-center text-lg">📱</div>
                <span class="text-[13px] font-medium text-zinc-300">TikTok 式沉浸竖屏滑动体验</span>
              </div>
              <div class="flex items-center gap-4 px-1">
                <div class="w-8 h-8 rounded-full bg-zinc-800 flex items-center justify-center text-lg">👽</div>
                <span class="text-[13px] font-medium text-zinc-300">暗黑极客风与全域安全区适配</span>
              </div>
              <div class="flex items-center gap-4 px-1">
                <div class="w-8 h-8 rounded-full bg-zinc-800 flex items-center justify-center text-lg">⚡️</div>
                <span class="text-[13px] font-medium text-zinc-300">进阶手势与无级倍速引擎</span>
              </div>
              <div class="flex items-center gap-4 px-1">
                <div class="w-8 h-8 rounded-full bg-zinc-800 flex items-center justify-center text-lg">🎛️</div>
                <span class="text-[13px] font-medium text-zinc-300">HLS 智能自适应串流解码</span>
              </div>
              <div class="flex items-center gap-4 px-1">
                <div class="w-8 h-8 rounded-full bg-zinc-800 flex items-center justify-center text-lg">🔄</div>
                <span class="text-[13px] font-medium text-zinc-300">多端引擎对接 (Plex/Emby/Jellyfin)</span>
              </div>
            </div>
          </div>
          
          <div class="py-4 text-center">
             <p class="text-[9px] text-zinc-600 font-bold tracking-[0.3em] uppercase opacity-50">Media-Tok Project</p>
          </div>
        </div>
      </div>
      
    </div>
  </div>
</template>