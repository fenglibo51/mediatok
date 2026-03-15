# 📱 Media-Tok 
> **让你的私有媒体库，像 TikTok 一样丝滑翻动。**

Media-Tok 是一款专为影迷设计的沉浸式、短视频风格的媒体库前端。它将你 NAS 里的海量电影与剧集，转化为 TikTok 式的竖屏滑动体验，彻底改变你发现好片的方式。

---

## ✨ 核心特性

- 🎬 **沉浸式体验**：完全适配移动端的竖屏滑动逻辑，带你进入沉浸式“刷片”模式。
- 🛸 **三端引擎对接**：深度集成 **Plex**、**Emby** 与 **Jellyfin**，自动同步你的媒体数据。
- ⚡ **工业级热更新**：无需重启 Docker 或手动更新，App 内一键拉取 GitHub 补丁，秒速进化。
- 🛠️ **极客风 UI**：基于 Tailwind CSS 打造的暗黑极客风格，全域安全区适配，视觉细腻。
- 🐳 **自动化部署**：支持 Docker 一键镜像构建，配合 GitHub Actions 实现持续集成。

## 🛠️ 技术栈

- **Frontend**: Vue 3 (Composition API) + Vite
- **Styling**: Tailwind CSS
- **App**: Progressive Web App (PWA)
- **Backend**: Node.js + Express (Dockerized)
- **CI/CD**: GitHub Actions + Docker Hub

## 🚀 快速开始

### Docker 一键部署
```bash
docker run -d \
  --name mediatok \
  -p 3000:3000 \
  -v /your/path/dist:/app/dist \
  fenglibo51/mediatok:latest