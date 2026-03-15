import express from 'express';
import { exec } from 'child_process';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import https from 'https'; // 使用原生模块，无需安装 axios

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const port = 8090;

// 1. 静态资源托管
app.use(express.static(path.join(__dirname, 'dist')));

/**
 * 辅助函数：从 GitHub 获取最新版本号
 */
const getLatestTag = () => {
    return new Promise((resolve, reject) => {
        const options = {
            hostname: 'api.github.com',
            path: '/repos/fenglibo51/mediatok/releases/latest',
            method: 'GET',
            headers: { 'User-Agent': 'MediaTok-Server' } // GitHub API 必须包含 User-Agent
        };

        https.get(options, (res) => {
            let data = '';
            res.on('data', (chunk) => data += chunk);
            res.on('end', () => {
                try {
                    const json = JSON.parse(data);
                    resolve(json.tag_name || '0.0.0');
                } catch (e) { reject(e); }
            });
        }).on('error', (e) => reject(e));
    });
};

/**
 * 辅助函数：读取本地 dist 目录下的版本号
 */
const getLocalVersion = () => {
    try {
        const versionPath = path.join(__dirname, 'dist', 'version.json');
        if (fs.existsSync(versionPath)) {
            const data = JSON.parse(fs.readFileSync(versionPath, 'utf8'));
            return data.version || '0.0.0';
        }
    } catch (e) {
        console.error('读取本地版本文件失败:', e.message);
    }
    return '0.0.0';
};

// 2. 智能化检查更新接口
app.get('/api/check-update', async (req, res) => {
    try {
        const localVer = getLocalVersion();
        const latestTag = await getLatestTag();
        
        // 处理版本号前面的 'v'，比如 v1.0.1 变成 1.0.1
        const latestVer = latestTag.replace(/^v/, '');

        console.log(`🔍 版本检查: 本地[${localVer}] vs 云端[${latestVer}]`);

        if (latestVer !== localVer) {
            res.json({ 
                hasUpdate: true, 
                latest: latestVer,
                current: localVer,
                message: `发现新版本 v${latestVer}！`
            });
        } else {
            res.json({ 
                hasUpdate: false,
                message: "已经是最新版本" 
            });
        }
    } catch (e) {
        console.error('检查更新出错:', e.message);
        res.status(500).json({ hasUpdate: false, msg: "无法连接到 GitHub" });
    }
});

// 3. 执行热更新接口
app.post('/api/perform-update', (req, res) => {
    console.log('🤖 收到更新指令，开始下载补丁...');
    
    const zipUrl = "https://github.com/fenglibo51/mediatok/releases/latest/download/dist.zip"; 
    
    // 逻辑：下载 -> 解压覆盖 -> 删除。建议确保 Docker 镜像里有 curl 和 unzip
    const updateCmd = `curl -L "${zipUrl}" -o update.zip && unzip -o update.zip -d . && rm update.zip`;

    exec(updateCmd, (err, stdout, stderr) => {
        if (err) {
            console.error(`❌ 更新失败: ${err.message}`);
            return res.status(500).json({ success: false, msg: err.message });
        }
        console.log('✅ 补丁覆盖完毕！本地 version.json 已同步。');
        res.json({ success: true, msg: "更新部署完成！" });
    });
});

app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

app.listen(port, () => {
    console.log(`🚀 Media-Tok 后端管家已在 ${port} 端口启动！`);
});