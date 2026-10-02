/**
 * Claude 终审提出的 3 项细节安全加固专项自动化测试
 * 
 * 1. upsertMeal: doc().set() 剔除冗余 _id，confirmedByName 优先从 family.members 取核验昵称
 * 2. familyManage: createFamily 退出旧家庭失败中断防跨两家，joinFamily 5次防刷限频防暴力枚举，doc().set() 剔除冗余 _id
 * 3. historyService: 离线队列明确拒绝错误直接出队并标记为 failed，网络故障保持 pending，FIFO 队列防并发丢失
 */

import assert from 'assert/strict';
import fs from 'fs';
import path from 'path';

console.log('===============================================================');
console.log('🔒 启动 Claude 终审 3 项细节安全加固专项自动化审计测试');
console.log('===============================================================\n');

// 模拟原生小程序环境
const storage = new Map();
global.wx = {
  getStorageSync: (key) => storage.get(key) || null,
  setStorageSync: (key, val) => storage.set(key, JSON.parse(JSON.stringify(val))),
  removeStorageSync: (key) => storage.delete(key),
  clearStorageSync: () => storage.clear(),
  onNetworkStatusChange: () => {},
  showLoading: () => {},
  hideLoading: () => {},
  showToast: () => {}
};

process.env.NODE_ENV = 'test';

const { cloudService } = await import('../miniprogram/services/cloudService.js');
const { familyService } = await import('../miniprogram/services/familyService.js');
const { historyService } = await import('../miniprogram/services/historyService.js');
const upsertMealModule = await import('../cloudfunctions/upsertMeal/index.js');
const familyManageModule = await import('../cloudfunctions/familyManage/index.js');
const wxServerSdk = await import('wx-server-sdk');

// -------------------------------------------------------------
// 【加固项 1】upsertMeal 服务端核验昵称优先 & 剔除 _id 字段
// -------------------------------------------------------------
console.log('【加固项 1】验证 upsertMeal 服务端昵称防伪造与 set() 数据结构');

// 1.1 验证 cloudfunctions/upsertMeal/index.js 源码中 doc().set() 没有冗余 _id
const upsertSource = fs.readFileSync(path.resolve('cloudfunctions/upsertMeal/index.js'), 'utf-8');
assert(!upsertSource.includes('_id: docId'), 'doc().set() data 中严禁包含冗余 _id: docId');
assert(upsertSource.includes('verifiedMember'), '必须包含 verifiedMember 服务端已核验昵称检索');
console.log('✅ upsertMeal/index.js 源码剔除 _id: docId 并增加 verifiedMember 校验核验通过！');

// 1.2 运行时端到端验证：服务端 family.members 真实昵称优先覆盖客户端恶意传入的 nickName
cloudService.setForceMock(true);
const mockDb = cloudService.getMockDb();
mockDb.clearAll();

// 房主创建家庭，真实昵称为 "正版大厨爸爸"
const famRes = mockDb.handleFamilyManage({
  action: 'createFamily',
  name: '安全实验家庭',
  nickName: '正版大厨爸爸',
  mockOpenid: 'openid_real_dad'
});
assert(famRes.success, '创建实验家庭成功');
const familyId = famRes.family.id;

// 模拟客户端恶意篡改 confirmedByName 为 "黑客盗版昵称"
const upsertRes = mockDb.handleUpsertMeal({
  action: 'upsertMeal',
  familyId,
  date: '2026-10-15',
  mockOpenid: 'openid_real_dad',
  meal: {
    mealId: 'm_safe_test_01',
    mealType: '午餐',
    mode: 'routine_2_1',
    confirmedByName: '黑客盗版昵称',
    dishes: [{ name: '清蒸大闸蟹', category: 'seafood' }]
  }
});

assert(upsertRes.success, 'upsertMeal 成功');
assert.equal(
  upsertRes.meal.confirmedByName,
  '正版大厨爸爸',
  'confirmedByName 必须优先采用服务端 family.members 中已核验的昵称，绝不可被客户端篡改'
);

// 1.3 直接针对实际云函数 index.js 执行真实调用测试
if (typeof wxServerSdk.default?.resetMemoryStore === 'function') {
  wxServerSdk.default.resetMemoryStore();
}
// 先在真实的云函数数据库中创建家庭
const realCreateRes = await familyManageModule.default.main({
  action: 'createFamily',
  name: '真实云函数实验家庭',
  nickName: '真实大厨妈妈',
  mockOpenid: 'openid_real_mom'
}, {});
assert(realCreateRes.success, '真实云函数创建家庭应成功');
const realFamId = realCreateRes.family._id;

// 尝试用恶意冒充昵称调用真实云函数 upsertMeal
const realUpsertRes = await upsertMealModule.default.main({
  action: 'upsertMeal',
  familyId: realFamId,
  date: '2026-10-15',
  mockOpenid: 'openid_real_mom',
  meal: {
    mealId: 'm_real_cf_01',
    mealType: '晚餐',
    confirmedByName: '恶意冒充者'
  }
}, {});

assert(realUpsertRes.success, '真实云函数 upsertMeal 执行成功');
assert.equal(
  realUpsertRes.meal.confirmedByName,
  '真实大厨妈妈',
  '真实云函数中 confirmedByName 必须成功被服务端家庭成员真实昵称所覆盖防伪造！'
);
console.log('✅ confirmedByName 优先从 family.members 读取已核验昵称防伪造验证通过（Mock + 真实云函数双重验证）！\n');

// -------------------------------------------------------------
// 【加固项 2】familyManage 退出旧家庭失败中断 & 邀请码 5 次防刷限频
// -------------------------------------------------------------
console.log('【加固项 2】验证 familyManage 退出旧家庭失败中断与防刷限频');

// 2.1 源码审查：createFamily 退出旧家庭失败抛错中断，且无冗余 _id
const familyManageSource = fs.readFileSync(path.resolve('cloudfunctions/familyManage/index.js'), 'utf-8');
assert(familyManageSource.includes('退出原有家庭失败，中断创建新家庭'), '退出旧家庭失败必须抛错中断以防一人跨两家');
assert(familyManageSource.includes('checkJoinRateLimit'), '必须在加入家庭时调用 checkJoinRateLimit 防暴力枚举');
assert(familyManageSource.includes('recordJoinFailure'), '必须记录口令失败尝试 recordJoinFailure');
assert(!familyManageSource.includes('_id: `user_${openid}`'), 'familyManage 中 users.doc().set() 严禁包含冗余 _id 字段');
console.log('✅ familyManage 源码中退出旧家庭失败中断、防刷限频与 _id 剔除逻辑核验通过！');

// 2.2 防刷限频计数验证：连续 5 次错误邀请码后锁定 (测试真实云函数)
const realAttackerOpenid = 'openid_real_attacker';
for (let i = 1; i <= 5; i++) {
  const tryRes = await familyManageModule.default.main({
    action: 'joinFamily',
    inviteCode: '000000',
    mockOpenid: realAttackerOpenid
  }, {});
  assert.equal(tryRes.success, false);
  assert(tryRes.error.includes('未找到') || tryRes.error.includes('口令'), '前5次返回口令错误');
}

// 第 6 次尝试（即使给正确口令也必须被安全锁定拒绝！）
const realLockedRes = await familyManageModule.default.main({
  action: 'joinFamily',
  inviteCode: realCreateRes.family.inviteCode,
  mockOpenid: realAttackerOpenid
}, {});
assert.equal(realLockedRes.success, false, '真实云函数中尝试 5 次失败后必须触发防刷锁定拦截');
assert(
  realLockedRes.error.includes('防暴力枚举') || realLockedRes.error.includes('安全锁定'),
  `应返回防刷限频提示: ${realLockedRes.error}`
);
console.log(`✅ 攻击者尝试 5 次后触发拦截 -> "${realLockedRes.error}"`);

// 验证全新用户（无用户档案 null）创建家庭顺利通过，杜绝 TypeError
const brandNewOpenid = 'openid_brand_new_user';
const newFamRes = await familyManageModule.default.main({
  action: 'createFamily',
  name: '崭新家庭',
  nickName: '崭新房主',
  mockOpenid: brandNewOpenid
}, {});
assert(newFamRes.success, '全新用户初次创建家庭必须成功无报错');
console.log('✅ 全新用户初次创建家庭无 null 异常且顺利通过！\n');

// -------------------------------------------------------------
// 【加固项 3】historyService 离线待同步队列业务明确拒绝出队并标记 failed
// -------------------------------------------------------------
console.log('【加固项 3】验证 historyService 离线队列对业务明确拒绝与网络异常的区分处理');

// 设置当前用户在家庭中
familyService.setMockCurrentUser('openid_dad', '爸爸');
await familyService.createFamily('离线队列测试家庭');
const activeFam = familyService.getCurrentFamily();

// 场景 A: 网络异常 (如 request:fail timeout or offline) -> 保持 pending，不从队列剔除
cloudService.setForceMock(false);
global.wx.cloud = {
  callFunction: async () => {
    throw new Error('request:fail timeout or offline');
  }
};
cloudService.resetAvailability();

historyService.clearHistory();
const dishA = { id: 'd_off_1', name: '离线排骨', category: 'meat' };
historyService.recordMeal('routine_2_1', [dishA], '2026-10-18', 'm_net_fail', '午餐');

// 触发队列刷新
await historyService.flushPendingQueue();
const currentHistoryNet = historyService.getHistory();
const netRecord = currentHistoryNet.find(r => r.mealId === 'hist_m_net_fail' || r.menuId === 'm_net_fail');
assert(netRecord, '记录必须存在');
assert.equal(netRecord.syncStatus, 'pending', '网络异常时必须保持 pending 状态以供下次重试');
console.log('✅ 瞬时网络异常: 记录保持 pending 状态，保留在离线队列中等待重试');

// 场景 B: 服务端业务明确拒绝 (如 越权操作：您不属于该家庭空间) -> 标记 failed 并直接出队，杜绝死循环
global.wx.cloud = {
  callFunction: async () => {
    return {
      result: {
        success: false,
        error: '越权操作：您不属于该家庭空间'
      }
    };
  }
};

historyService.clearHistory();
const dishB = { id: 'd_off_2', name: '越权偷渡菜', category: 'meat' };
historyService.recordMeal('routine_2_1', [dishB], '2026-10-18', 'm_unauth_fail', '晚餐');

// 触发队列刷新
await historyService.flushPendingQueue();
const currentHistoryRejection = historyService.getHistory();
const rejectedRecord = currentHistoryRejection.find(r => r.mealId === 'hist_m_unauth_fail' || r.menuId === 'm_unauth_fail');
assert(rejectedRecord, '记录必须存在');
assert.equal(rejectedRecord.syncStatus, 'failed', '服务端业务明确拒绝错误必须直接标记为 failed');

// 再次刷新队列，确认已出队，不会再次调用云函数死循环重试
let callCount = 0;
global.wx.cloud = {
  callFunction: async () => {
    callCount++;
    return { result: { success: false, error: '越权操作：您不属于该家庭空间' } };
  }
};
await historyService.flushPendingQueue();
assert.equal(callCount, 0, '已出队的 failed 记录绝不可继续发起重试！彻底杜绝死循环');
console.log('✅ 业务明确拒绝: 记录直接标记为 failed 并已从离线队列完全出队，彻底杜绝死循环重试！');

// 场景 C: 扩展拒绝识别（如家庭不存在、防刷锁定等）同样出队标记 failed
global.wx.cloud = {
  callFunction: async () => {
    return {
      result: {
        success: false,
        error: '邀请口令尝试失败次数过多，已被安全锁定，请 15 分钟后再试（防暴力枚举）'
      }
    };
  }
};
historyService.clearHistory();
const dishC = { id: 'd_off_3', name: '锁定菜', category: 'meat' };
historyService.recordMeal('routine_2_1', [dishC], '2026-10-18', 'm_locked_fail', '午餐');
await historyService.flushPendingQueue();
const lockedHistory = historyService.getHistory();
const lockedRec = lockedHistory.find(r => r.mealId === 'hist_m_locked_fail' || r.menuId === 'm_locked_fail');
assert(lockedRec, '记录存在');
assert.equal(lockedRec.syncStatus, 'failed', '安全锁定类业务拒绝同样标记为 failed 并出队');
console.log('✅ 扩展业务拒绝类别（安全锁定/家庭不存在）均能精准识别并标记 failed！\n');

console.log('===============================================================');
console.log('🎉 恭喜！Claude 终审 3 项细节安全加固专项测试 100% 成功通过！');
console.log('===============================================================\n');
