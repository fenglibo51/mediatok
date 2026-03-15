# 📱 Media-Tok 
> **让你的竖屏短剧，像 TikTok 一样丝滑翻动。**

Media-Tok 是一款专为竖屏短剧设计的沉浸式、短视频风格的媒体库前端。它将你 NAS 里的竖屏短剧，转化为 TikTok 式的竖屏滑动体验，彻底抛开各家媒体库繁琐的横竖屏转换。

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

### Docker Compose 部署 (强烈推荐)

为了保证 App 内的 OTA 热更新功能正常运行（涉及解压覆盖权限与数据持久化），强烈推荐使用 `docker-compose` 部署。

1. 在服务器上新建一个目录，并创建 `compose.yaml` 文件：

```yaml
version: '3.8'

services:
  mediatok:
    image: fenglibo51/mediatok:latest
    container_name: mediatok
    restart: unless-stopped
    user: "0:0" # 开启最高权限，确保后端管家能顺利解压覆盖热更补丁
    environment:
      - TZ=Asia/Shanghai # 锁定本地时区，确保日志时间准确
    ports:
      - "8090:8090" # 左侧为宿主机访问端口，可按需修改
    volumes:
      - ./data/dist:/app/dist # 挂载前端数据卷，保证重启容器后热更界面不丢失



在文件同级目录下执行启动命令：

Bash
docker compose up -d

启动完成后，在手机浏览器中访问 http://你的IP:8090，并点击**“添加到主屏幕”**以获得无系统状态栏的最完美沉浸式体验！

🤝 鸣谢
特别感谢 @migumigu 提供的开发思路。

由 fenglibo51 倾力打造。