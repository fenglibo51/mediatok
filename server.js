import express from 'express';
import { exec } from 'child_process';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import https from 'https';

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
            headers: { 'User-Agent': 'MediaTok-Server' } 
        };

        https.get(options, (res) => {
            let data = '';
            res.on('data', (chunk) => data += chunk);
            res.on('end', () => {
                try {
                    const json = JSON.parse(data);
                    // 打印一下 API 返回的原始数据，方便排查
                    if (!json.tag_name) {
                        console.log('⚠️ GitHub API 未返回 tag_name，可能是频率限制或 Release 设置问题');
                    }
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
        } else {
            console.log('📍 警告：本地 dist/version.json 文件不存在');
        }
    } catch (e) {
        console.error('❌ 读取本地版本文件失败:', e.message);
    }
    return '0.0.0';
};

// 2. 智能化检查更新接口
app.get('/api/check-update', async (req, res) => {
    try {
        const localVer = getLocalVersion();
        const latestTag = await getLatestTag();
        
        // 彻底清理版本号，只留数字和点（去掉 v，去掉空格）
        const latestVer = latestTag.replace(/^v/, '').trim();
        const currentVer = localVer.trim();

        // 🌟 这是抓内鬼的关键日志！在 NAS Docker 控制台看这两行
        console.log('--- 🛡️ 版本对账单 ---');
        console.log(`> 云端最新版本: [${latestVer}]`);
        console.log(`> 本地当前版本: [${currentVer}]`);

        if (latestVer !== currentVer && latestVer !== '0.0.0') {
            console.log('🚩 结论: 发现新版本，通知前端更新');
            res.json({ 
                hasUpdate: true, 
                latest: latestVer,
                current: currentVer,
                message: `发现新版本 v${latestVer}！`
            });
        } else {
            console.log('✅ 结论: 版本一致，无需更新');
            res.json({ 
                hasUpdate: false,
                message: "已经是最新版本" 
            });
        }
        console.log('-------------------');
    } catch (e) {
        console.error('❌ 检查更新过程中崩溃:', e.message);
        res.status(500).json({ hasUpdate: false, msg: "接口故障" });
    }
});

// 3. 执行热更新接口
app.post('/api/perform-update', (req, res) => {
    console.log('🤖 收到强制更新指令，准备覆盖...');
    
    const zipUrl = "https://github.com/fenglibo51/mediatok/releases/latest/download/dist.zip"; 
    
    // 🌟 重点优化：我们解压到当前目录
    // 提示：压缩时请“进入 dist 文件夹全选文件后压缩”，不要在 dist 文件夹外面压缩
    const updateCmd = `curl -L "${zipUrl}" -o update.zip && unzip -o update.zip -d ./dist && rm update.zip`;

    exec(updateCmd, (err, stdout, stderr) => {
        if (err) {
            console.error(`❌ 命令执行失败: ${err.message}`);
            return res.status(500).json({ success: false, msg: err.message });
        }
        console.log('✨ 补丁解压覆盖成功！');
        res.json({ success: true, msg: "更新部署完成！" });
    });
});

app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

app.listen(port, () => {
    console.log(`🚀 Media-Tok 后端管家已在 ${port} 端口启动！`);
});