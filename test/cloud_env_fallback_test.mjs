/**
 * 专项测试：验证微信云开发 -601034 / -501007 报错精准识别：家庭类调用如实失败不产生本机孤岛，非家庭调用本地高可用降级
 */

import assert from 'assert/strict';
import fs from 'fs';
import path from 'path';

console.log('===============================================================');
console.log('🧪 启动微信云开发 -601034 报错与本地高可用自动降级专项验证');
console.log('===============================================================\n');

// 1. 验证 app.ts 源码合规性：不再包含前端非法的 DYNAMIC_CURRENT_ENV，且支持 CLOUD_ENV_ID
const appSource = fs.readFileSync(path.resolve('miniprogram/app.ts'), 'utf-8');
assert(!appSource.includes('wx.cloud.DYNAMIC_CURRENT_ENV'), 'app.ts 严禁向前端传入 DYNAMIC_CURRENT_ENV');
assert(appSource.includes('CLOUD_ENV_ID'), 'app.ts 必须导出 CLOUD_ENV_ID 配置项');
console.log('✅ 验证项 1: app.ts 前端云开发初始化合规性核验通过！');

// 2. 模拟微信小程序环境与 Storage
const storage = new Map();
global.wx = {
  getStorageSync: (key) => storage.get(key) || null,
  setStorageSync: (key, val) => storage.set(key, JSON.parse(JSON.stringify(val))),
  removeStorageSync: (key) => storage.delete(key),
  clearStorageSync: () => storage.clear(),
  showLoading: () => {},
  hideLoading: () => {},
  showToast: () => {}
};

process.env.NODE_ENV = 'test';

const { cloudService } = await import('../miniprogram/services/cloudService.js');
const { familyService } = await import('../miniprogram/services/familyService.js');

// 3. 场景 A: 模拟线上真机发生 errCode: -601034 (微信云开发未开通 / 环境不存在)
console.log('\n【场景 A】模拟微信真实报错 errCode: -601034 (截图同款报错)');
let mockCallCount = 0;
global.wx.cloud = {
  callFunction: async ({ name, data }) => {
    mockCallCount++;
    const err = new Error('cloud.callFunction:fail Error: errCode: -601034 | errMsg: Environment not found');
    err.errCode = -601034;
    throw err;
  }
};

cloudService.resetAvailability();
familyService.setMockCurrentUser('openid_test_user', '皮妞妞');

// 执行创建家庭厨房（对应截图上输入“皮妞妞”并点击“创建厨房”）
const createRes = await familyService.createFamily('皮妞妞');

// 验证断言：真机遭遇 -601034 时家庭创建必须如实失败，严禁降级为只存在房主本机的“假家庭”（家人永远查不到口令）
assert.equal(createRes.success, false, '遭遇 -601034 时家庭创建必须如实失败，严禁本机假成功');
assert(/-601034|未就绪/.test(createRes.error), '必须返回云环境未就绪的真实原因');
assert.equal(familyService.getCurrentFamily(), null, '创建失败后本地不得残留家庭');
const islandFamilies = Object.values(storage.get('mock_db_families') || {});
assert(!islandFamilies.some(f => f.name === '皮妞妞'), '本机模拟库严禁写入只存在单机的家庭');

// 家庭类调用不熔断：再次操作仍直连云端（云环境修复后立即恢复）
const secondRes = await familyService.createFamily('温馨小家食堂2');
assert.equal(secondRes.success, false);
assert.equal(mockCallCount, 2, '家庭类云函数不得被熔断到本地，每次都必须真实请求云端');

// 就餐历史等非家庭云函数遭遇 -601034 仍熔断切换本地模式，保障单机可用
const mealRes = await cloudService.callFunction('upsertMeal', { action: 'getHistory', familyId: 'personal_x' });
assert.equal(mealRes.isLocalFallback, true, '非家庭云函数遭遇 -601034 时应降级本地模式');
assert.equal(cloudService.checkCloudAvailability(), false, '非家庭云函数遭遇 -601034 后标记 isCloudAvailable 为 false');

console.log('✅ 验证项 2: -601034 下家庭创建如实失败、不产生本机孤岛家庭；就餐历史仍可降级本地模式！');

// 4. 场景 B: 验证真正的瞬时网络异常 (request:fail timeout) 依然严格保留 pending，不误触发降级
console.log('\n【场景 B】验证瞬时网络波动异常 (request:fail timeout) 严禁误判为环境缺失');
cloudService.resetAvailability();
global.wx.cloud = {
  callFunction: async () => {
    throw new Error('request:fail timeout or offline');
  }
};

assert.equal(cloudService.checkCloudAvailability(), true, '重置后初次检查应恢复为可用');
const netFailRes = await cloudService.callFunction('familyManage', { action: 'probe' });
assert.equal(netFailRes.success, false, '瞬时网络故障必须返回 success: false');
assert(netFailRes.error?.includes('request:fail'), '必须返回真实网络错误信息交由离线重试队列');
assert.equal(cloudService.checkCloudAvailability(), true, '瞬时网络故障绝不破坏云环境可用性标识');

console.log('✅ 验证项 3: 瞬时网络异常与环境缺失精准隔离断言通过！加固防线 100% 稳固！');

// 5. 场景 C: 线上云函数返回 -501007 等数据库错误时，家庭创建必须如实失败，严禁降级到本机造成数据孤岛
const assertNoIslandFamily = (name) => {
  const fams = Object.values(storage.get('mock_db_families') || {});
  assert(!fams.some(f => f.name === name), `本机模拟库严禁写入只存在单机的家庭: ${name}`);
};

console.log('\n【场景 C1】模拟 -501007 字符串报错：家庭创建如实失败');
cloudService.resetAvailability();
global.wx.cloud = {
  callFunction: async ({ name, data }) => {
    return {
      result: {
        success: false,
        error: 'document.set:fail -501007 invalid parameters. 不能指定 _id'
      }
    };
  }
};

const paramFailRes = await familyService.createFamily('皮妞妞C1');
assert.equal(paramFailRes.success, false, '-501007 报错时家庭创建必须如实失败');
assert(paramFailRes.error.includes('-501007'), '必须透传真实错误');
assertNoIslandFamily('皮妞妞C1');
console.log('✅ 验证项 4.1: -501007 字符串报错不再降级本地，家庭创建如实失败！');

console.log('\n【场景 C2】模拟微信 SDK 返回对象类型 { errCode: -501007 }：错误转为可读字符串');
global.wx.cloud = {
  callFunction: async ({ name, data }) => {
    return {
      result: {
        success: false,
        error: { errCode: -501007, errMsg: 'document.set:fail invalid parameters. 不能指定 _id' }
      }
    };
  }
};
const objFailRes = await familyService.createFamily('皮妞妞C2');
assert.equal(objFailRes.success, false, '对象类型 -501007 报错必须如实失败');
assert.equal(typeof objFailRes.error, 'string', '对象型错误必须规范化为字符串');
assertNoIslandFamily('皮妞妞C2');
console.log('✅ 验证项 4.2: 对象类型 -501007 报错如实失败且错误信息规范化！');

console.log('\n【场景 C3】模拟 callFunction 抛出 -501007 异常：如实失败');
global.wx.cloud = {
  callFunction: async ({ name, data }) => {
    const err = new Error('document.set:fail -501007 invalid parameters');
    err.errCode = -501007;
    throw err;
  }
};
const thrownFailRes = await familyService.createFamily('皮妞妞C3');
assert.equal(thrownFailRes.success, false, 'callFunction 抛出 -501007 时必须如实失败');
assertNoIslandFamily('皮妞妞C3');
assert.equal(cloudService.checkCloudAvailability(), true, '家庭类调用失败不得熔断云可用性');
console.log('✅ 验证项 4.3: callFunction 抛出 -501007 时如实失败，不熔断、不产生孤岛！');

console.log('\n【场景 C4】验证 formatErrorTip 对对象型错误与各类边界输入的防崩溃鲁棒性');
// 动态导入编译后的 mine/index.js 验证 formatErrorTip
let registeredMinePage = null;
global.Page = (cfg) => { registeredMinePage = cfg; };
await import('../miniprogram/pages/mine/index.js');
assert(registeredMinePage && registeredMinePage.formatErrorTip, '必须导出 formatErrorTip 方法');

assert.equal(registeredMinePage.formatErrorTip(''), '操作失败，请重试');
assert.equal(registeredMinePage.formatErrorTip(null), '操作失败，请重试');
assert.equal(registeredMinePage.formatErrorTip(undefined), '操作失败，请重试');
assert.equal(registeredMinePage.formatErrorTip('document.set:fail -501007 invalid parameters. 不能指定 _id'), '数据服务同步异常，请稍后重试');
assert.equal(registeredMinePage.formatErrorTip('document.update:fail -501007 invalid parameters. 不能更新保留字段 _openid'), '数据服务同步异常，请稍后重试');
assert.equal(registeredMinePage.formatErrorTip({ errCode: -501007, errMsg: 'document.set:fail' }), '数据服务同步异常，请稍后重试', '对象型错误严禁抛 TypeError');
assert.equal(registeredMinePage.formatErrorTip({ errMsg: 'Environment not found (-601034)' }), '云开发环境未就绪，请检查云环境配置后重试');
assert.equal(registeredMinePage.formatErrorTip('cloud.callFunction:fail timeout'), '服务连接异常，请重试');
console.log('✅ 验证项 4.4: formatErrorTip 针对对象、字符串、null 等所有类型防崩溃鲁棒性验证通过！');

// 6. 场景 D: 验证全项目版本号 100% 强一致性 (全部锁定 V2.12)
console.log('\n【场景 D】验证全项目版本号一致性审计 (锁定 V2.12)');
const pkg = JSON.parse(fs.readFileSync(path.resolve('package.json'), 'utf-8'));
const appJson = JSON.parse(fs.readFileSync(path.resolve('miniprogram/app.json'), 'utf-8'));
const projectConfig = JSON.parse(fs.readFileSync(path.resolve('project.config.json'), 'utf-8'));
const publishGuide = fs.readFileSync(path.resolve('docs/wechat-publish-guide.md'), 'utf-8');

assert.equal(pkg.version, '2.12', 'package.json 版本号必须为 2.12');
assert.equal(appJson.version, '2.12', 'miniprogram/app.json 版本号必须为 2.12');
assert.equal(projectConfig.version, '2.12', 'project.config.json version 必须为 2.12');
assert(projectConfig.projectname.includes('2.12'), 'project.config.json projectname 必须包含 2.12');
assert(appSource.includes("APP_VERSION = '2.12'"), 'app.ts APP_VERSION 必须为 2.12');
assert(!publishGuide.includes('V2.05'), 'wechat-publish-guide.md 严禁残留 V2.05');
assert(!publishGuide.includes('V2.10'), 'wechat-publish-guide.md 严禁残留 V2.10');
assert(publishGuide.includes('2.12'), 'wechat-publish-guide.md 必须包含 2.12');
console.log('✅ 验证项 5: package.json / app.json / project.config.json / app.ts / wechat-publish-guide.md 版本号 2.12 强一致性校验通过！');

console.log('\n===============================================================');
console.log('🎉 专项验证全部 100% 成功通过！截图报错已彻底根治且系统具备极强鲁棒性！');
console.log('===============================================================\n');
