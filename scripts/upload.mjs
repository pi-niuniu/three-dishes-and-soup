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
const version = process.env.npm_config_app_version || pkg.version || '2.05';

// 2. 检查 project.config.json 是否存在
const projectConfigPath = path.join(projectRoot, 'project.config.json');
if (!fs.existsSync(projectConfigPath)) {
  console.error(`❌ 未找到配置文件: ${projectConfigPath}`);
  process.exit(1);
}
const projectConfig = JSON.parse(fs.readFileSync(projectConfigPath, 'utf-8'));

// 3. 执行 TypeScript 编译
console.log('🔨 执行 TypeScript 自动化构建 (tsc)...');
try {
  execSync('npm run build', { cwd: projectRoot, stdio: 'inherit' });
  console.log('✅ TypeScript 编译完成！\n');
} catch (e) {
  console.error('❌ TypeScript 编译失败，请先修复类型与语法错误！');
  process.exit(1);
}

// 4. 深度质检验收：全部 125 道菜品出锅摄影与类别默认大图
const dishAssetsDir = path.join(projectRoot, 'miniprogram', 'assets', 'dishes');
let missingAssets = 0;
for (let i = 1; i <= 125; i++) {
  const file = `dish_${String(i).padStart(3, '0')}.jpg`;
  const fullPath = path.join(dishAssetsDir, file);
  if (!fs.existsSync(fullPath) || fs.statSync(fullPath).size === 0) {
    console.error(`❌ 缺失关键菜品视觉资产: ${file}`);
    missingAssets++;
  }
}
const defaultImages = [
  'default_dish.jpg', 'default_egg.jpg', 'default_main.jpg',
  'default_secondary.jpg', 'default_soup.jpg', 'default_tofu.jpg', 'default_vegetable.jpg'
];
for (const d of defaultImages) {
  const fullPath = path.join(dishAssetsDir, d);
  if (!fs.existsSync(fullPath) || fs.statSync(fullPath).size === 0) {
    console.error(`❌ 缺失类别默认兜底大图: ${d}`);
    missingAssets++;
  }
}

if (missingAssets > 0) {
  console.error(`❌ 共有 ${missingAssets} 张图片资产缺失，上传已中止！`);
  process.exit(1);
}
console.log(`✅ 125 道菜品出锅图 + 7 大分类默认大图共 132 张静态资产 100% 校验齐备！`);

// 5. 校验上传包体积预算 (必须严格控制在微信 2048 KB 限制之内)
const miniprogramDir = path.join(projectRoot, 'miniprogram');
let estimatedUploadBytes = 0;
function calculatePackSize(dir) {
  for (const item of fs.readdirSync(dir)) {
    const full = path.join(dir, item);
    const rel = path.relative(miniprogramDir, full);
    const stat = fs.statSync(full);
    if (stat.isDirectory()) {
      calculatePackSize(full);
    } else {
      if (item.endsWith('.webp') || item.endsWith('.ts') || item.endsWith('.map') || item === '.DS_Store') continue;
      if (rel === 'data/dishes.json' || rel === 'data/ingredients.json') continue;
      estimatedUploadBytes += stat.size;
    }
  }
}
calculatePackSize(miniprogramDir);
const estimatedKB = (estimatedUploadBytes / 1024).toFixed(1);
const estimatedMB = (estimatedUploadBytes / 1024 / 1024).toFixed(2);
console.log(`📦 预估微信小程序打包上传体积: ${estimatedKB} KB (${estimatedMB} MB)`);

if (estimatedUploadBytes > 2048 * 1024) {
  console.error(`❌ 打包体积超出微信主包 2048 KB 限制 (${estimatedKB} KB > 2048 KB)，上传已被安全拦截！`);
  process.exit(1);
}
console.log(`✅ 体积预算校验安全通过！裕量: ${(2048 - estimatedUploadBytes / 1024).toFixed(1)} KB。\n`);

// 6. 解析上传描述
const defaultDesc = `发布 V${version} 版本：紧急修复线上云开发 -601034 报错，实现本地高可用无缝容灾降级、底层错误温和化清洗与云环境合规初始化`;
const desc = process.argv.slice(2).join(' ') || defaultDesc;

// 7. 定位微信开发者工具 CLI
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
