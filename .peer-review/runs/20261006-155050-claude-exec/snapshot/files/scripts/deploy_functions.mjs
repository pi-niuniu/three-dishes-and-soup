#!/usr/bin/env node
import { execSync } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

// 1. 读取环境配置与版本信息
const appTsPath = path.join(projectRoot, 'miniprogram', 'app.ts');
let envId = 'cloudbase-d8gsg70x9e12e0074';
if (fs.existsSync(appTsPath)) {
  const match = fs.readFileSync(appTsPath, 'utf-8').match(/CLOUD_ENV_ID\s*=\s*['"]([^'"]+)['"]/);
  if (match && match[1]) {
    envId = match[1];
  }
}

const allFunctions = ['familyManage', 'userAuth', 'customDish', 'upsertMeal'];
const cliArgs = process.argv.slice(2).filter(a => !a.startsWith('--'));
const targetFunctions = cliArgs.length > 0 ? cliArgs : allFunctions;

// 校验本地云函数目录完整性
const cloudFunctionRoot = path.join(projectRoot, 'cloudfunctions');
for (const fn of targetFunctions) {
  const fnDir = path.join(cloudFunctionRoot, fn);
  if (!fs.existsSync(fnDir) || !fs.statSync(fnDir).isDirectory()) {
    console.error(`❌ 未找到云函数目录: ${fnDir}`);
    process.exit(1);
  }
}

console.log('🚀 云函数自动化部署与同步检查:');
console.log(`   - 项目根目录: ${projectRoot}`);
console.log(`   - 目标云环境: ${envId}`);
console.log(`   - 待部署云函数: ${targetFunctions.join(', ')}\n`);

// 2. 定位微信开发者工具 CLI
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
  process.exit(1);
}

// 3. 构建部署命令 (--names 置于末尾避免截断后续参数)
const cmd = `"${cliPath}" cloud functions deploy --env "${envId}" --project "${projectRoot}" -r --names ${targetFunctions.join(' ')}`;

// 4. 校验模式 (--dry-run / --check)
if (process.argv.includes('--dry-run') || process.argv.includes('--check')) {
  console.log(`📋 拟执行部署命令:\n   ${cmd}\n`);
  console.log('🏁 校验模式 (--dry-run) 结束：已检测到 CLI 与云函数配置，未执行线上更新。');
  process.exit(0);
}

// 5. 执行云函数部署
console.log('📦 正在通过微信 CLI 部署云函数（云端自动安装依赖）...');
try {
  execSync(cmd, { stdio: 'inherit' });
  console.log('\n🎉 全部云函数部署并同步成功！');
} catch (error) {
  console.error(`\n❌ 云函数部署失败，退出码: ${error.status || 1}`);
  process.exit(error.status || 1);
}
