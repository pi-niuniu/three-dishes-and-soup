#!/usr/bin/env node
import { execSync } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

// 1. 读取 package.json 获取版本号
const pkgPath = path.join(projectRoot, 'package.json');
const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
const version = process.env.npm_config_app_version || pkg.version || '2.03';

// 2. 检查 project.config.json 是否存在
const projectConfigPath = path.join(projectRoot, 'project.config.json');
if (!fs.existsSync(projectConfigPath)) {
  console.error(`❌ 未找到配置文件: ${projectConfigPath}`);
  process.exit(1);
}

// 3. 解析上传描述
const defaultDesc = `发布 V${version} 版本，集成125道精选食谱库与高清出锅视觉资产`;
const desc = process.argv.slice(2).join(' ') || defaultDesc;

// 4. 定位微信开发者工具 CLI
const cliCandidates = [
  '/Applications/wechatwebdevtools.app/Contents/MacOS/cli',
  '/Applications/微信开发者工具.app/Contents/MacOS/cli'
];

let cliPath = cliCandidates.find(p => fs.existsSync(p));
if (!cliPath) {
  try {
    const whichCli = execSync('which cli', { encoding: 'utf-8' }).trim();
    if (whichCli && fs.existsSync(whichCli)) {
      cliPath = whichCli;
    }
  } catch {
    // 忽略
  }
}

if (!cliPath) {
  console.error('❌ 未检测到微信开发者工具 CLI。请确保已安装微信开发者工具并开启「设置 -> 安全设置 -> 服务端口」。');
  console.error('macOS 默认路径: /Applications/wechatwebdevtools.app/Contents/MacOS/cli');
  process.exit(1);
}

console.log(`🚀 准备上传微信小程序开发版本:`);
console.log(`   - 项目根目录: ${projectRoot}`);
console.log(`   - 版本号: ${version}`);
console.log(`   - 描述信息: ${desc}`);
console.log(`   - CLI 路径: ${cliPath}\n`);

const cmd = `"${cliPath}" upload --project "${projectRoot}" -v "${version}" -d "${desc}"`;

try {
  execSync(cmd, { stdio: 'inherit' });
  console.log(`\n🎉 微信小程序 V${version} 代码上传成功！请前往微信公众平台后台 (mp.weixin.qq.com) 提交审核。`);
} catch (error) {
  console.error(`\n❌ 上传失败，退出码: ${error.status || 1}`);
  process.exit(error.status || 1);
}
