import express from 'express';
import { exec } from 'child_process';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const port = 8090;

// 1. 静态资源托管：完全接管原先 Nginx 的工作，把 dist 文件夹暴露出去
app.use(express.static(path.join(__dirname, 'dist')));

// 2. 获取当前版本信息的接口
app.get('/api/check-update', (req, res) => {
    // 这里未来会接入真实的 GitHub Release API，
    // 现在咱们先写死返回 true 让你测试热更新全流程
    res.json({ 
        hasUpdate: true, 
        message: "发现新版本！",
        downloadUrl: "https://github.com/fenglibo51/media-tok/releases/latest/download/dist.zip" // 咱们下一步去 GitHub 搞这个
    });
});

// 3. 💥 核心：执行自杀式热更新的接口
app.post('/api/perform-update', (req, res) => {
    console.log('🤖 后端管家收到指令，开始拉取热更补丁...');
    
    // 假设前端传来了下载链接，这里为了演示直接写死
    // 逻辑：下载 zip -> 解压并强制覆盖到 dist 目录 -> 删除压缩包
    const zipUrl = "https://github.com/fenglibo51/media-tok/releases/latest/download/dist.zip"; 
    
    // 注意：这里的命令依赖 Linux 容器里的 curl 和 unzip
    const updateCmd = `curl -L "${zipUrl}" -o update.zip && unzip -o update.zip -d ./dist && rm update.zip`;

    exec(updateCmd, (err, stdout, stderr) => {
        if (err) {
            console.error(`更新惨遭失败: ${err.message}`);
            return res.status(500).json({ success: false, msg: err.message });
        }
        console.log('✅ 补丁覆盖完毕！前端随时可以刷新。');
        res.json({ success: true, msg: "更新部署完成！" });
    });
});

// 4. 解决 Vue 路由的历史模式问题 (如果是单页应用，刷新不报 404)
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

app.listen(port, () => {
    console.log(`🚀 Media-Tok 全栈后端管家已在 ${port} 端口启动！`);
});