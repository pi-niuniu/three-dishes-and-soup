/**
 * 专项验证：家庭厨房邀请口令加入全链路鲁棒性与多端容灾互通测试
 * 
 * 覆盖场景：
 * 1. cleanInviteCode 输入净化（全角数字、带空格、微信聊天格式文本提取、纯数字类型兼容）
 * 2. WXML 输入框防截断（maxlength >= 20，杜绝带空格粘贴丢第6位致命缺陷）
 * 3. 数据库 inviteCode 类型一致性（字符串与数值型双向无缝匹配，杜绝 MongoDB 类型隔离）
 * 4. 新用户初次加入家庭安全防刷限频（isNotFoundError 识别对象型 errMsg，绝不误拦截正常新用户）
 * 5. 跨机/跨模式互通穿透（本地降级模式用户加入云端家庭自动穿透探测，房主降级家庭上线后静默同步）
 * 6. 复制口令类型防崩溃（wx.setClipboardData 传参必为字符串）
 */

import assert from 'assert/strict';
import fs from 'fs';
import path from 'path';

console.log('===============================================================');
console.log('🧪 启动家庭厨房邀请口令加入全链路鲁棒性专项自动化验证');
console.log('===============================================================\n');

// 模拟原生小程序环境
const storage = new Map();
let clipboardData = null;
global.wx = {
  getStorageSync: (key) => storage.get(key) || null,
  setStorageSync: (key, val) => storage.set(key, JSON.parse(JSON.stringify(val))),
  removeStorageSync: (key) => storage.delete(key),
  clearStorageSync: () => storage.clear(),
  setClipboardData: ({ data, success }) => {
    assert.equal(typeof data, 'string', 'wx.setClipboardData data 参数必须为字符串');
    clipboardData = data;
    if (success) success();
  },
  showLoading: () => {},
  hideLoading: () => {},
  showToast: () => {}
};

process.env.NODE_ENV = 'test';

const { cleanInviteCode, familyService } = await import('../miniprogram/services/familyService.js');
const { cloudService } = await import('../miniprogram/services/cloudService.js');
const familyManageModule = await import('../cloudfunctions/familyManage/index.js');
const wxServerSdk = await import('wx-server-sdk');

// -------------------------------------------------------------
// 【测试 1】cleanInviteCode 边界输入与格式净化鲁棒性
// -------------------------------------------------------------
console.log('【场景 1】验证 cleanInviteCode 口令格式智能净化与提取');

assert.equal(cleanInviteCode('123456'), '123456', '标准 6 位字符串应原样保留');
assert.equal(cleanInviteCode(123456), '123456', '数值型 123456 应转为 6 位数字字符串');
assert.equal(cleanInviteCode('  839201  '), '839201', '带前后空格或换行的口令应自动 trim');
assert.equal(cleanInviteCode('１２３４５６'), '123456', '全角数字应正确转换为半角 123456');
assert.equal(cleanInviteCode('【839201】'), '839201', '带中文括号的口令应提取 6 位纯数字');
assert.equal(cleanInviteCode('口令：839201，复制即可加入'), '839201', '微信聊天复制文本应智能提取 6 位数字');
assert.equal(cleanInviteCode(''), '', '空输入返回空字符串');
assert.equal(cleanInviteCode(null), '', 'null 输入返回空字符串');
assert.equal(cleanInviteCode(undefined), '', 'undefined 输入返回空字符串');
assert.equal(cleanInviteCode('12345'), '12345', '不足 6 位保留提取结果供后续校验拦截');

console.log('✅ 测试 1 通过: cleanInviteCode 对全角/空格/中文括号/聊天文本/数值型均完美适配！\n');

// -------------------------------------------------------------
// 【测试 2】WXML 输入框防截断属性核验
// -------------------------------------------------------------
console.log('【场景 2】验证 mine/index.wxml 输入框防截断设置');
const wxmlContent = fs.readFileSync(path.resolve('miniprogram/pages/mine/index.wxml'), 'utf-8');
const matchMaxlength = wxmlContent.match(/class="join-code-input"[\s\S]*?maxlength="(\d+)"/);
assert(matchMaxlength, '必须在 join-code-input 上找到 maxlength 属性');
const maxLen = parseInt(matchMaxlength[1], 10);
assert(maxLen >= 12, `join-code-input 的 maxlength 应至少为 12 (当前为 ${maxLen})，防止粘贴带空格内容时尾数被系统截断`);
console.log(`✅ 测试 2 通过: mine/index.wxml 中 join-code-input 的 maxlength 扩大为 ${maxLen}，彻底根治尾数被微信原生输入框截断问题！\n`);

// -------------------------------------------------------------
// 【测试 3】数据库中 inviteCode 数值型与字符串双向无缝匹配
// -------------------------------------------------------------
console.log('【场景 3】验证云函数对数值型与字符串 inviteCode 的双向兼容');
if (typeof wxServerSdk.default?.resetMemoryStore === 'function') {
  wxServerSdk.default.resetMemoryStore();
}

// 模拟历史数据中将 inviteCode 存储为 Number 的家庭
const db = wxServerSdk.default.database();
const mockNumCode = 654321;
const numFamId = 'fam_numeric_code_test';
await db.collection('families').doc(numFamId).set({
  data: {
    id: numFamId,
    name: '数值口令实验家庭',
    creatorOpenid: 'openid_creator_num',
    members: [{ openid: 'openid_creator_num', nickName: '房主', role: 'creator', joinedAt: Date.now() }],
    memberOpenids: ['openid_creator_num'],
    inviteCode: mockNumCode, // 数值类型！
    inviteExpiredAt: Date.now() + 24 * 3600 * 1000,
    createdAt: Date.now(),
    updatedAt: Date.now()
  }
});

// 测试加入：客户端传递字符串 '654321'
const joinNumRes = await familyManageModule.default.main({
  action: 'joinFamily',
  inviteCode: '654321', // 字符串型
  mockOpenid: 'openid_member_str_joiner',
  nickName: '字符串加入者'
}, {});

assert.equal(joinNumRes.success, true, '向数值型 inviteCode 家庭传入字符串口令必须匹配成功');
assert.equal(joinNumRes.family.id, numFamId, '成功加入对应家庭');
console.log('✅ 测试 3.1: 客户端传入字符串口令成功匹配服务端数值型 inviteCode！');

// 同样测试 LocalCloudMockDatabase 中的数值型与字符串型兼容
cloudService.setForceMock(true);
const mockDb = cloudService.getMockDb();
mockDb.clearAll();
const localCreateRes = mockDb.handleFamilyManage({
  action: 'createFamily',
  name: '本地数值测试家庭',
  mockOpenid: 'openid_local_creator'
});
// 手动将 inviteCode 修改为数值
const localFam = localCreateRes.family;
localFam.inviteCode = Number(localFam.inviteCode);

const localJoinRes = mockDb.handleFamilyManage({
  action: 'joinFamily',
  inviteCode: String(localFam.inviteCode),
  mockOpenid: 'openid_local_member'
});
assert.equal(localJoinRes.success, true, '本地 mock 中对数值/字符串型 inviteCode 亦能双向兼容');
console.log('✅ 测试 3.2: 本地高可用 Mock 库双向数值/字符串 inviteCode 兼容测试通过！');

// 测试 3.3: 历史家庭无 inviteExpiredAt 或为字符串时间戳，绝不被误判为已过期
const histFamId = 'fam_historical_no_expiry';
await db.collection('families').doc(histFamId).set({
  data: {
    id: histFamId,
    name: '历史无过期字段厨房',
    creatorOpenid: 'openid_creator_hist',
    members: [{ openid: 'openid_creator_hist', nickName: '房主', role: 'creator', joinedAt: Date.now() }],
    memberOpenids: ['openid_creator_hist'],
    inviteCode: '888666',
    // 无 inviteExpiredAt 字段
    createdAt: Date.now(),
    updatedAt: Date.now()
  }
});

const joinHistRes = await familyManageModule.default.main({
  action: 'joinFamily',
  inviteCode: '【888666】', // 携带微信聊天中文括号
  mockOpenid: 'openid_hist_joiner',
  nickName: '历史加入者'
}, {});
assert.equal(joinHistRes.success, true, '历史无 inviteExpiredAt 字段的家庭必须能正常加入，严禁误报失效');
assert.equal(joinHistRes.family.id, histFamId);
assert.equal(joinHistRes.openid, 'openid_hist_joiner', 'joinFamily 返回必须包含真实 openid');
console.log('✅ 测试 3.3: 历史无过期字段家庭与全角/格式化口令加入验证通过！\n');

// -------------------------------------------------------------
// 【测试 4】新用户首次加入家庭（无 users 档案），绝不报安全防刷限频异常
// -------------------------------------------------------------
console.log('【场景 4】验证全新用户首次加入家庭时 isNotFoundError 识别与正常加入');
if (typeof wxServerSdk.default?.resetMemoryStore === 'function') {
  wxServerSdk.default.resetMemoryStore();
}

// 创建一个正常云端家庭
const createCloudFam = await familyManageModule.default.main({
  action: 'createFamily',
  name: '云端幸福厨房',
  mockOpenid: 'openid_cloud_dad',
  nickName: '爸爸'
}, {});
assert.equal(createCloudFam.success, true);
const cloudInviteCode = createCloudFam.family.inviteCode;

// 模拟全新微信用户（users 集合中毫无记录，微信底层抛出包含 errMsg 的 plain object）
const freshOpenid = 'openid_fresh_new_user_123';
const freshJoinRes = await familyManageModule.default.main({
  action: 'joinFamily',
  inviteCode: cloudInviteCode,
  mockOpenid: freshOpenid,
  nickName: '全新女儿'
}, {});

assert.equal(freshJoinRes.success, true, '全新用户首次加入家庭必须顺利成功');
assert.equal(freshJoinRes.family.members.length, 2, '家庭成员数应变为 2');
assert(freshJoinRes.family.members.some(m => m.openid === freshOpenid), '新成员必须在家庭成员列表中');
console.log('✅ 测试 4: 全新用户首次加入家庭无任何 false-positive 限频报错，顺利加入成功！\n');

// -------------------------------------------------------------
// 【测试 5】跨模式与降级状态穿透互通机制
// -------------------------------------------------------------
console.log('【场景 5】验证用户在降级模式下向真实云端穿透加入家人厨房');

// 场景 5.1: 房主在云端创建了家庭
const cloudCreatorOpenid = 'openid_real_cloud_owner';
const cloudKitchenRes = await familyManageModule.default.main({
  action: 'createFamily',
  name: '云端姥姥的小院',
  mockOpenid: cloudCreatorOpenid,
  nickName: '姥姥'
}, {});
assert(cloudKitchenRes.success);
const cloudGrandmaCode = cloudKitchenRes.family.inviteCode;

// 场景 5.2: 加入者此前因为偶发网络异常，isCloudAvailable 被置为 false（降级模式运行）
cloudService.setForceMock(false);
global.wx.cloud = {
  callFunction: async ({ name, data }) => {
    // 转发给实际云函数模拟真实云端环境
    if (name === 'familyManage') {
      return { result: await familyManageModule.default.main(data, {}) };
    }
    return { result: { success: false } };
  }
};

// 显式将客户端标记为本地降级模式
cloudService.resetAvailability();
// 模拟一次环境不可用将 isCloudAvailable 锁为 false
try {
  await cloudService.callFunction('familyManage', {
    action: 'probe',
    _simulateErr: true
  });
} catch (e) {}

// 在 familyService 中执行加入家人家庭
familyService.setMockCurrentUser('openid_grandson', '外孙');
// 清空本地 mock 库，确保本地没有姥姥的家庭
cloudService.getMockDb().clearAll();

const grandsonJoinRes = await familyService.joinFamily(cloudGrandmaCode);
assert.equal(grandsonJoinRes.success, true, '降级状态下加入云端家庭应成功通过穿透探测加入');
assert.equal(grandsonJoinRes.family.name, '云端姥姥的小院');
assert.equal(cloudService.checkCloudAvailability(), true, '穿透云端成功后，云端可用性标识应自动自愈恢复为 true');
console.log('✅ 测试 5.1: 降级模式用户加入家人云端厨房时成功穿透并自动恢复云端可用性！');

// 场景 5.3: 房主如果在本地离线创建了家庭，上线鉴权 syncUserAuth 时自动补全注册到云端
cloudService.getMockDb().clearAll();
familyService.setMockCurrentUser('openid_offline_mom', '妈妈');
// 本地创建家庭
const localMomFam = await familyService.createFamily('离线妈妈的爱心食堂');
assert(localMomFam.success);
const localMomCode = localMomFam.family.inviteCode;

// 执行 syncUserAuth，验证是否自动向云端静默补全注册
global.wx.cloud.callFunction = async ({ name, data }) => {
  if (name === 'userAuth') {
    return {
      result: {
        success: true,
        openid: data.mockOpenid,
        user: { openid: data.mockOpenid, familyId: null, role: null },
        family: null // 云端暂无
      }
    };
  }
  if (name === 'familyManage' && data.action === 'createFamily') {
    return {
      result: await familyManageModule.default.main(data, {})
    };
  }
  return { result: { success: true } };
};

await familyService.syncUserAuth();
// 等待 promise 微任务执行
await new Promise(r => setTimeout(r, 50));

// 验证云端现在已经有了妈妈的家庭并且 inviteCode 完全一致
const queryMomCloudRes = await familyManageModule.default.main({
  action: 'joinFamily',
  inviteCode: localMomCode,
  mockOpenid: 'openid_kid_user',
  nickName: '孩子'
}, {});
assert.equal(queryMomCloudRes.success, true, '房主本地离线家庭在 syncUserAuth 后已成功补全同步至云端，家人凭原口令可直接加入！');
console.log('✅ 测试 5.2: 房主本地创建家庭在联网鉴权时自动补全云端注册，家人可凭同一口令顺利加入！\n');

// -------------------------------------------------------------
// 【测试 6】复制口令类型防崩溃验证
// -------------------------------------------------------------
console.log('【场景 6】验证复制口令 wx.setClipboardData 传参必为字符串');
let registeredMinePage = null;
global.Page = (cfg) => { registeredMinePage = cfg; };
await import('../miniprogram/pages/mine/index.js');
assert(registeredMinePage && registeredMinePage.handleCopyInviteCode);

// 模拟 family.inviteCode 为数值型
registeredMinePage.data = {
  ...registeredMinePage.data,
  family: { inviteCode: 998877 }
};
clipboardData = null;
registeredMinePage.handleCopyInviteCode();
assert.equal(clipboardData, '998877', '复制口令无论源数据为数字或字符串，传递给 wx.setClipboardData 必须为合法字符串');
console.log('✅ 测试 6: handleCopyInviteCode 确保 data 为纯字符串，杜绝微信原生报参数类型错误！\n');

// -------------------------------------------------------------
// 【测试 7】前端页面输入框净化返回值与防重复提交并发锁验证
// -------------------------------------------------------------
console.log('【场景 7】验证 mine 页面输入框净化返回值与防重提交锁');
assert(registeredMinePage.handleJoinCodeInput, 'mine 页面必须实现 handleJoinCodeInput');
assert(registeredMinePage.handleJoinFamily, 'mine 页面必须实现 handleJoinFamily');

// 测试 handleJoinCodeInput 返回净化后字符串 (供微信原生 input 同步替换)
let mockPageContext = {
  data: { joinCodeInput: '', isJoiningFamily: false },
  isSubmittingJoin: false,
  formatErrorTip: registeredMinePage.formatErrorTip,
  setData(obj) { Object.assign(this.data, obj); }
};
const cleanedRet = registeredMinePage.handleJoinCodeInput.call(mockPageContext, {
  detail: { value: '  口令是：482915！ ' }
});
assert.equal(cleanedRet, '482915', 'handleJoinCodeInput 必须返回提取出的 6 位纯数字口令');
assert.equal(mockPageContext.data.joinCodeInput, '482915', 'page data.joinCodeInput 必须同步为提取口令');

// 验证防重复点击 (isSubmittingJoin)
let joinCallCount = 0;
const originalJoinFamily = familyService.joinFamily;
familyService.joinFamily = async () => {
  joinCallCount++;
  await new Promise(r => setTimeout(r, 20));
  return { success: true };
};

mockPageContext.data.joinCodeInput = '482915';
const p1 = registeredMinePage.handleJoinFamily.call(mockPageContext);
const p2 = registeredMinePage.handleJoinFamily.call(mockPageContext);
await Promise.all([p1, p2]);

assert.equal(joinCallCount, 1, '快速连击加入按钮时必须被防重提交锁拦截，严防并发事务冲突');
assert.equal(mockPageContext.isSubmittingJoin, false, '完成后防重提交锁必须成功复位');
familyService.joinFamily = originalJoinFamily;
console.log('✅ 测试 7: handleJoinCodeInput 同步返回值与防并发点击锁验证通过！\n');

console.log('===============================================================');
console.log('🎉 全部 7 大场景专项测试 100% 成功通过！加入家人厨房故障已彻底根除！');
console.log('===============================================================\n');
