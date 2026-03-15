import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import tailwindcss from '@tailwindcss/vite' // 🌟 救命恩人 1：Tailwind 样式引擎
import { VitePWA } from 'vite-plugin-pwa'   // 🌟 救命恩人 2：PWA 桌面图标与沉浸体验

export default defineConfig({
  plugins: [
    vue(),
    tailwindcss(), // 🌟 激活样式！(决不能丢)
    
    // 🌟 激活原生全屏体验！(保留你的修改)
    VitePWA({
      // 🛑 不自动注入 Service Worker（彻底干掉导致崩溃的后台静默缓存）
      injectRegister: null, 
      
      // 🛑 把工作盒的缓存规则清空
      workbox: {
        cleanupOutdatedCaches: true
      },

      // 🌟 保留精华：控制桌面图标和全屏沉浸体验
      manifest: {
        name: 'Media-Tok',
        short_name: 'MediaTok',
        description: '沉浸式极客媒体库',
        theme_color: '#0a0a0a',      
        background_color: '#0a0a0a', 
        display: 'standalone',       // 像原生 App 一样全屏，干掉 Safari 地址栏
        start_url: '/',
        icons: [
          {
            src: '/favicon.ico',     
            sizes: '192x192 512x512',
            type: 'image/x-icon'
          }
        ]
      }
    })
  ]
})