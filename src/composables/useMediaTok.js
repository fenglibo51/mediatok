import { ref, reactive, watch } from 'vue'

export function useMediaTok() {
  // ==================== 1. 本地存储读取初始化 ====================
  const loadData = () => {
    const data = JSON.parse(localStorage.getItem('mediaTokData')) || {}
    return {
      servers: data.servers || {
        plex: { id: 'plex', name: 'Plex', status: 'unconfigured', ip: '', token: '' },
        emby: { id: 'emby', name: 'Emby', status: 'unconfigured', ip: '', token: '' },
        jellyfin: { id: 'jellyfin', name: 'Jellyfin', status: 'unconfigured', ip: '', token: '' }
      },
      activeServerId: data.activeServerId || 'plex', 
      // 🌟 这里的 activeLibrary 现在存的是整个对象：{ serverId: 'plex', libId: '123', name: '电影' }
      activeLibrary: data.activeLibrary || null, 
      selectedLibs: data.selectedLibs || [],
      availableLibraries: data.availableLibraries || [], 
      lastWatched: data.lastWatched || null,
      watchHistory: data.watchHistory || {},
      settings: data.settings || { infinitePlay: true, muteDefault: true },
      favorites: data.favorites || []
    }
  }

  const localData = loadData()
  const servers = reactive(localData.servers)
  const activeServerId = ref(localData.activeServerId)
  const selectedLibs = ref(localData.selectedLibs)
  const availableLibraries = ref(localData.availableLibraries)
  const lastWatched = ref(localData.lastWatched)
  const watchHistory = ref(localData.watchHistory)
  const settings = reactive(localData.settings)
  const favorites = ref(localData.favorites)

  const activeLibrary = ref(localData.activeLibrary || (selectedLibs.value.length > 0 ? selectedLibs.value[0] : null))

  // ==================== 2. 自动保存记忆 ====================
  watch([servers, activeServerId, activeLibrary, selectedLibs, availableLibraries, lastWatched, watchHistory, settings, favorites], () => {
    localStorage.setItem('mediaTokData', JSON.stringify({
      servers, activeServerId: activeServerId.value, activeLibrary: activeLibrary.value, selectedLibs: selectedLibs.value, availableLibraries: availableLibraries.value, 
      lastWatched: lastWatched.value, watchHistory: watchHistory.value, settings, favorites: favorites.value
    }))
  }, { deep: true })

  // ==================== 3. 核心运行状态 ====================
  const dramas = ref([])
  const isFetchingDramas = ref(false) 
  const isLoadingDetails = ref(false) 
  const currentPlayData = ref(null)
  
  // 🌟 getLibName 已经光荣退休，被移除了！

  // ==================== 4. 核心请求引擎：获取瀑布流 (🌟智能标签版🌟) ====================
  // 参数从单纯的 libraryId 变成了完整的 libObj 身份标签对象
  const fetchLibraryContent = async (libObj) => {
    if (!libObj || !libObj.libId) return
    
    // 🌟 核心魔法：直接从标签里读取服务器 ID，并悄悄把全局服务器线路切过去！
    const sid = libObj.serverId
    activeServerId.value = sid
    
    const server = servers[sid]
    if (server.status !== 'connected' || !server.ip || !server.token) return

    isFetchingDramas.value = true; dramas.value = [] 
    const baseUrl = server.ip.replace(/\/$/, '')
    
    try {
      let items = []
      if (sid === 'plex') {
        // 🌟 使用 libObj.libId 发起请求
        const res = await fetch(`${baseUrl}/library/sections/${libObj.libId}/all?X-Plex-Token=${server.token}`, { headers: { 'Accept': 'application/json' } })
        const data = await res.json(); items = data.MediaContainer?.Metadata || []
        dramas.value = items.map(item => {
          const media = item.Media?.[0] || {}
          return {
            id: item.ratingKey, title: item.title, episodesCount: item.leafCount || 1, poster: item.thumb ? `${baseUrl}${item.thumb}?X-Plex-Token=${server.token}` : '',            
            year: item.year || '', summary: item.summary || '暂无简介', resolution: media.videoResolution ? (media.videoResolution.toUpperCase() + (media.videoResolution==='4k'?'':'P')) : '1080P', codec: media.videoCodec ? media.videoCodec.toUpperCase() : 'H.264', genres: item.Genre ? item.Genre.map(g => g.tag).slice(0, 2) : [], type: item.type
          }
        })
      } 
      else if (sid === 'emby' || sid === 'jellyfin') {
        // 🌟 使用 libObj.libId 发起请求
        const res = await fetch(`${baseUrl}/Items?ParentId=${libObj.libId}&Recursive=true&IncludeItemTypes=Series,Movie&Fields=Overview,ProductionYear,Genres,MediaSources&api_key=${server.token}`, { headers: { 'Accept': 'application/json' } })
        const data = await res.json(); items = data.Items || []
        dramas.value = items.map(item => {
          return {
            id: item.Id, title: item.Name, episodesCount: item.ChildCount || (item.Type === 'Movie' ? 1 : 10), poster: item.ImageTags?.Primary ? `${baseUrl}/Items/${item.Id}/Images/Primary?api_key=${server.token}` : '',            
            year: item.ProductionYear || '', summary: item.Overview || '暂无简介', resolution: '1080P', codec: 'H.264', genres: item.Genres ? item.Genres.slice(0, 2) : [], type: item.Type.toLowerCase()
          }
        })
      }
    } catch (err) { console.error('数据拉取失败:', err) } finally { isFetchingDramas.value = false }
  }

  // 🌟 监听选中的库对象变化即可，去掉了容易引发 Bug 的 activeServerId 监听
  watch(activeLibrary, (newLibObj) => { fetchLibraryContent(newLibObj) }, { immediate: true })

  // ==================== 5. 核心请求引擎：获取剧集详情 ====================
  const fetchDramaDetails = async (drama) => {
    const sid = activeServerId.value
    const server = servers[sid]; const baseUrl = server.ip.replace(/\/$/, '')
    isLoadingDetails.value = true
    if (watchHistory.value[drama.id]) watchHistory.value[drama.id].needsResume = true

    try {
      let realEpisodes = []
      if (sid === 'plex') {
        if (drama.type === 'movie') {
          const res = await fetch(`${baseUrl}/library/metadata/${drama.id}?X-Plex-Token=${server.token}`, { headers: { 'Accept': 'application/json' } })
          const data = await res.json(); const item = data.MediaContainer?.Metadata?.[0] || {}
          const part = item.Media?.[0]?.Part?.[0] || {}
          realEpisodes = [{ id: item.ratingKey, key: item.key, index: 1, title: item.title, duration: part.duration || 0, directUrl: part.key ? `${baseUrl}${part.key}?X-Plex-Token=${server.token}` : '', epPoster: item.thumb ? `${baseUrl}${item.thumb}?X-Plex-Token=${server.token}` : drama.poster }]
        } else {
          const res = await fetch(`${baseUrl}/library/metadata/${drama.id}/allLeaves?X-Plex-Token=${server.token}`, { headers: { 'Accept': 'application/json' } })
          const data = await res.json(); const leaves = data.MediaContainer?.Metadata || []
          realEpisodes = leaves.map((leaf, i) => {
            const part = leaf.Media?.[0]?.Part?.[0] || {}
            return { id: leaf.ratingKey, key: leaf.key, index: i + 1, title: leaf.title, duration: part.duration || 0, directUrl: part.key ? `${baseUrl}${part.key}?X-Plex-Token=${server.token}` : '', epPoster: leaf.thumb ? `${baseUrl}${leaf.thumb}?X-Plex-Token=${server.token}` : drama.poster }
          })
        }
      }
      else if (sid === 'emby' || sid === 'jellyfin') {
        if (drama.type === 'movie') {
          realEpisodes = [{ id: drama.id, key: drama.id, index: 1, title: drama.title, duration: 0, directUrl: `${baseUrl}/Videos/${drama.id}/stream.mp4?Static=true&api_key=${server.token}`, epPoster: drama.poster }]
        } else {
          const res = await fetch(`${baseUrl}/Shows/${drama.id}/Episodes?Fields=MediaSources&api_key=${server.token}`, { headers: { 'Accept': 'application/json' } })
          const data = await res.json(); const leaves = data.Items || []
          realEpisodes = leaves.map((leaf, i) => {
            return { id: leaf.Id, key: leaf.Id, index: i + 1, title: leaf.Name, duration: leaf.RunTimeTicks ? leaf.RunTimeTicks / 10000 : 0, directUrl: `${baseUrl}/Videos/${leaf.Id}/stream.mp4?Static=true&api_key=${server.token}`, epPoster: leaf.ImageTags?.Primary ? `${baseUrl}/Items/${leaf.Id}/Images/Primary?api_key=${server.token}` : drama.poster }
          })
        }
      }
      currentPlayData.value = { ...drama, episodes: realEpisodes }
      return true
    } catch(e) { 
      console.error(e)
      return false
    } finally { 
      isLoadingDetails.value = false 
    }
  }

  return {
    servers, activeServerId, selectedLibs, availableLibraries, lastWatched, watchHistory, settings, favorites,
    dramas, isFetchingDramas, isLoadingDetails, currentPlayData, activeLibrary,
    // 🌟 getLibName 移除，其他原封不动
    fetchLibraryContent, fetchDramaDetails
  }
}