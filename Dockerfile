# 使用极其轻量的 Node 18 Alpine 镜像作为基础
FROM node:18-alpine

# 设置容器内的工作目录
WORKDIR /app

# 💥 极其关键：给这台“Linux 虚拟机”安装下载和解压工具，否则没法热更
RUN apk add --no-cache curl unzip

# 先拷贝依赖清单，利用 Docker 缓存加速打包
COPY package*.json ./

# 只安装生产环境必需的后端依赖 (express 等)
RUN npm install --production

# 把后端的 server.js 和前端打包好的 dist 文件夹放进容器
COPY server.js ./
COPY dist ./dist

# 暴露给外界的管家端口
EXPOSE 8090

# 启动咱们的 Node.js 管家！
CMD ["npm", "start"]