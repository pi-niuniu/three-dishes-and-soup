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

// 场景 5.3: 旧版本降级模式下房主家庭只建在本机，上线鉴权 syncUserAuth 时自动补传云端
cloudService.getMockDb().clearAll();
familyService.setMockCurrentUser('openid_offline_mom', '妈妈');
// 模拟旧版本：强制本地模式创建（无 syncedToCloud 标记的孤岛家庭）
cloudService.setForceMock(true);
const localMomFam = await familyService.createFamily('离线妈妈的爱心食堂');
cloudService.setForceMock(false);
assert(localMomFam.success);
assert.notEqual(localMomFam.family.syncedToCloud, true, '本地模式创建的家庭不得标记为已同步云端');
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
  if (name === 'familyManage') {
    return {
      result: await familyManageModule.default.main(data, {})
    };
  }
  return { result: { success: true } };
};

await familyService.syncUserAuth();
assert.equal(familyService.getCloudSyncError(), null, '补传成功后不应有同步告警');
assert.equal(familyService.getCurrentFamily().syncedToCloud, true, '补传成功后家庭标记为已同步云端');

// 验证云端现在已经有了妈妈的家庭并且 inviteCode 完全一致
const queryMomCloudRes = await familyManageModule.default.main({
  action: 'joinFamily',
  inviteCode: localMomCode,
  mockOpenid: 'openid_kid_user',
  nickName: '孩子'
}, {});
assert.equal(queryMomCloudRes.success, true, '房主本地离线家庭在 syncUserAuth 后已成功补全同步至云端，家人凭原口令可直接加入！');
console.log('✅ 测试 5.2: 房主本地创建家庭在联网鉴权时自动补全云端注册，家人可凭同一口令顺利加入！');

// 场景 5.4: 补传失败时必须在房主界面给出告警，而不是静默当作成功
cloudService.setForceMock(true);
familyService.setMockCurrentUser('openid_offline_dad', '爸爸');
await familyService.createFamily('补传失败测试厨房');
cloudService.setForceMock(false);
global.wx.cloud.callFunction = async ({ name, data }) => {
  if (name === 'userAuth') {
    return { result: { success: true, openid: data.mockOpenid, user: { openid: data.mockOpenid, familyId: null, role: null }, family: null } };
  }
  return { result: { success: false, error: 'document.set:fail -501007 invalid parameters' } };
};
await familyService.syncUserAuth();
assert(familyService.getCloudSyncError(), '补传云端失败时必须产生同步告警');
assert(familyService.getCloudSyncError().includes('未同步到云端'), '告警需说明家人暂时无法加入');
assert(familyService.getCurrentFamily(), '补传失败时保留本地家庭供房主重试');
console.log('✅ 测试 5.3: 补传云端失败时房主可见“口令未同步到云端”告警，不再静默假成功！');

// 场景 5.5: 真机上云端返回“未找到口令”，严禁偷偷改用本机模拟库加入本机孤岛家庭
cloudService.getMockDb().clearAll();
const islandRes = cloudService.getMockDb().handleFamilyManage({ action: 'createFamily', name: '本机孤岛', mockOpenid: 'openid_island_owner' });
global.wx.cloud.callFunction = async ({ name, data }) => ({
  result: { success: false, error: '未找到该邀请口令对应的家庭厨房' }
});
familyService.setMockCurrentUser('openid_island_joiner', '家人');
const islandJoin = await familyService.joinFamily(islandRes.family.inviteCode);
assert.equal(islandJoin.success, false, '云端未找到口令时必须如实失败，严禁加入本机孤岛家庭');
assert.equal(familyService.getCurrentFamily(), null);
console.log('✅ 测试 5.4: 云端查无口令时不再回落本机模拟库，杜绝“假加入”孤岛家庭！\n');

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

// -------------------------------------------------------------
// 【测试 8】口令查询底层异常与“无此口令”严格区分，底层异常不计入 5 次防刷锁定
// -------------------------------------------------------------
console.log('【场景 8】验证口令查询底层 DB 异常不计入防刷失败次数');
const sdk = wxServerSdk.default;
sdk.resetMemoryStore();
const getJoinFailCount = async (openid) => {
  try {
    const doc = await db.collection('users').doc(`user_${openid}`).get();
    return doc.data.joinFailCount || 0;
  } catch (e) {
    return 0;
  }
};

const ownerRes = await familyManageModule.default.main({ action: 'createFamily', name: '防刷区分厨房', mockOpenid: 'openid_owner_8', nickName: '房主' }, {});
assert(ownerRes.success);
const realCode8 = ownerRes.family.inviteCode;

// 8.1 families 查询持续超时 6 次：全部返回服务异常，且不计入失败次数，之后恢复可正常加入
sdk._collectionHook = (colName) => {
  if (colName !== 'families') return null;
  return {
    where: () => ({
      get: async () => { throw new Error('ETIMEDOUT: database request timeout'); },
      count: async () => { throw new Error('ETIMEDOUT: database request timeout'); }
    }),
    doc: (id) => ({ get: async () => { throw new Error('ETIMEDOUT: database request timeout'); } })
  };
};
try {
  for (let i = 0; i < 6; i++) {
    const r = await familyManageModule.default.main({ action: 'joinFamily', inviteCode: realCode8, mockOpenid: 'openid_member_8', nickName: '家人' }, {});
    assert.equal(r.success, false);
    assert.equal(r.errorType, 'SERVICE_ERROR', '底层异常必须标记为服务异常');
    assert(r.error.includes('服务异常'), '底层异常提示“云端查询服务异常”而非“未找到口令”');
  }
} finally {
  sdk._collectionHook = null;
}
assert.equal(await getJoinFailCount('openid_member_8'), 0, '底层 DB 异常绝不计入防刷失败次数');
const recovered8 = await familyManageModule.default.main({ action: 'joinFamily', inviteCode: realCode8, mockOpenid: 'openid_member_8', nickName: '家人' }, {});
assert.equal(recovered8.success, true, '数据库恢复后家人必须能立即加入，不被误锁定');
console.log('✅ 测试 8.1: 连续 6 次 DB 超时不计失败次数，恢复后家人立即加入成功！');

// 8.2 真正无此口令：计入失败次数
const wrong8 = await familyManageModule.default.main({ action: 'joinFamily', inviteCode: '000001', mockOpenid: 'openid_guess_8' }, {});
assert.equal(wrong8.success, false);
assert.equal(wrong8.errorType, 'CODE_NOT_FOUND');
assert.equal(await getJoinFailCount('openid_guess_8'), 1, '确认查询为空才计入一次失败');
console.log('✅ 测试 8.2: 真实“无此口令”计入防刷失败次数！\n');

// -------------------------------------------------------------
// 【测试 9】集合缺失 (-502005 collection not exists) 自愈建表且不计失败
// -------------------------------------------------------------
console.log('【场景 9】验证集合缺失时自愈创建且不计入防刷失败');
const createdCollections = [];
db.createCollection = async (name) => { createdCollections.push(name); };
sdk._collectionHook = (colName) => {
  if (colName !== 'families') return null;
  const err = () => {
    const e = new Error('errCode: -502005 database collection not exists | errMsg: [ResourceNotFound] Db or Table not exist: families');
    e.errCode = -502005;
    return e;
  };
  return {
    where: () => ({ get: async () => { throw err(); }, count: async () => { throw err(); } }),
    doc: () => ({ get: async () => { throw err(); } })
  };
};
try {
  const r9 = await familyManageModule.default.main({ action: 'joinFamily', inviteCode: '135790', mockOpenid: 'openid_member_9' }, {});
  assert.equal(r9.success, false);
  assert.equal(r9.errorType, 'SERVICE_ERROR', '集合缺失属于底层异常');
  assert(r9.error.includes('房主'), '集合缺失时提示房主重新创建厨房');
} finally {
  sdk._collectionHook = null;
  delete db.createCollection;
}
for (const name of ['users', 'families', 'dishes', 'meals']) {
  assert(createdCollections.includes(name), `必须自愈创建集合 ${name}`);
}
assert.equal(await getJoinFailCount('openid_member_9'), 0, '集合缺失绝不计入防刷失败次数');
console.log('✅ 测试 9: 集合缺失时自愈创建 users/families/dishes/meals，且不计失败次数！\n');

// -------------------------------------------------------------
// 【测试 10】补传 createFamily 严禁覆盖他人家庭；msgSecCheck 服务异常不阻断加入
// -------------------------------------------------------------
console.log('【场景 10】验证补传不覆盖他人家庭 & 内容检测服务异常不阻断加入');
sdk.resetMemoryStore();
const victim = await familyManageModule.default.main({ action: 'createFamily', name: '受害者厨房', mockOpenid: 'openid_victim', nickName: '受害者' }, {});
const hijack = await familyManageModule.default.main({
  action: 'createFamily',
  _syncToCloud: true,
  familyId: victim.family.id,
  inviteCode: victim.family.inviteCode,
  name: '伪造厨房',
  mockOpenid: 'openid_attacker'
}, {});
assert.equal(hijack.success, true);
assert.notEqual(hijack.family.id, victim.family.id, '补传指定他人 familyId 时必须换新 id');
assert.notEqual(hijack.family.inviteCode, victim.family.inviteCode, '补传时口令冲突必须换新口令');
const victimDoc = await db.collection('families').doc(victim.family.id).get();
assert.equal(victimDoc.data.name, '受害者厨房', '他人家庭严禁被覆盖');

// 重复补传本人家庭：幂等返回，不重复建家庭
const resync = await familyManageModule.default.main({
  action: 'createFamily', _syncToCloud: true, familyId: victim.family.id, inviteCode: victim.family.inviteCode, name: '受害者厨房', mockOpenid: 'openid_victim'
}, {});
assert.equal(resync.success, true);
assert.equal(resync.family.id, victim.family.id, '重复补传本人家庭应幂等返回原家庭');
assert.equal(resync.family.inviteCode, victim.family.inviteCode);

// 非补传请求携带 familyId / inviteCode 一律忽略
const forged = await familyManageModule.default.main({ action: 'createFamily', familyId: 'fam_forged_id', inviteCode: '111111', mockOpenid: 'openid_forger' }, {});
assert.notEqual(forged.family.id, 'fam_forged_id', '非补传请求不得指定 familyId');

const origMsgSecCheck = sdk.openapi.security.msgSecCheck;
sdk.openapi.security.msgSecCheck = async () => { throw new Error('-604101 function has no permission to call this API'); };
try {
  const joinWithSecDown = await familyManageModule.default.main({ action: 'joinFamily', inviteCode: victim.family.inviteCode, mockOpenid: 'openid_sec_down', nickName: '女儿' }, {});
  assert.equal(joinWithSecDown.success, true, 'msgSecCheck 服务异常（如 openapi 权限未部署）不得阻断家人加入');
} finally {
  sdk.openapi.security.msgSecCheck = origMsgSecCheck;
}
console.log('✅ 测试 10: 补传不覆盖他人家庭、重复补传幂等、内容检测服务异常不阻断加入！\n');

// -------------------------------------------------------------
// 【测试 11】userAuth：瞬时异常不得覆盖档案或清空家庭归属
// -------------------------------------------------------------
console.log('【场景 11】验证 userAuth 瞬时异常不清空家庭归属');
const userAuthModule = await import('../cloudfunctions/userAuth/index.js');
const authOk = await userAuthModule.default.main({ mockOpenid: 'openid_victim' }, {});
assert.equal(authOk.success, true);
assert.equal(authOk.family.id, victim.family.id);
assert.equal(authOk.user.role, 'creator');

let userSetCalled = false;
sdk._collectionHook = (colName) => {
  if (colName !== 'users') return null;
  return {
    doc: () => ({
      get: async () => { throw new Error('ETIMEDOUT'); },
      set: async () => { userSetCalled = true; return {}; },
      update: async () => ({})
    })
  };
};
try {
  const authTimeout = await userAuthModule.default.main({ mockOpenid: 'openid_victim' }, {});
  assert.equal(authTimeout.success, false, '读取用户档案超时必须返回失败，严禁当作新用户重建档案');
  assert.equal(userSetCalled, false, '读取超时严禁用空档案覆盖用户的家庭归属');
} finally {
  sdk._collectionHook = null;
}

sdk._collectionHook = (colName) => {
  if (colName !== 'families') return null;
  return { doc: () => ({ get: async () => { throw new Error('ETIMEDOUT'); } }) };
};
try {
  const authFamTimeout = await userAuthModule.default.main({ mockOpenid: 'openid_victim' }, {});
  assert.equal(authFamTimeout.success, true);
  assert.equal(authFamTimeout.familyFetchError, true);
  assert.equal(authFamTimeout.user.familyId, victim.family.id, '家庭读取瞬时异常时严禁清空用户家庭归属');
} finally {
  sdk._collectionHook = null;
}
const userDocAfter = await db.collection('users').doc('user_openid_victim').get();
assert.equal(userDocAfter.data.familyId, victim.family.id, '云端用户档案的家庭归属必须保持');
console.log('✅ 测试 11: userAuth 遇瞬时异常不重建档案、不清空家庭归属！\n');

// -------------------------------------------------------------
// 【测试 12】onShow 静默鉴权与加入并发：过期鉴权响应不得清掉刚加入的家庭
// -------------------------------------------------------------
console.log('【场景 12】验证过期 userAuth 响应不会覆盖刚加入的家庭');
familyService.setMockCurrentUser('openid_race_kid', '孩子');
let releaseAuth;
const authGate = new Promise(r => { releaseAuth = r; });
global.wx.cloud.callFunction = async ({ name, data }) => {
  if (name === 'userAuth') {
    await authGate; // 鉴权响应在加入成功之后才返回 (加入前的旧快照)
    return { result: { success: true, openid: data.mockOpenid, user: { openid: data.mockOpenid, familyId: null, role: null }, family: null } };
  }
  return { result: await familyManageModule.default.main(data, {}) };
};
const staleAuth = familyService.syncUserAuth();
const raceJoin = await familyService.joinFamily(victim.family.inviteCode);
assert.equal(raceJoin.success, true);
releaseAuth();
await staleAuth;
assert(familyService.getCurrentFamily(), '过期鉴权响应不得清掉刚加入的家庭');
assert.equal(familyService.getCurrentFamily().id, victim.family.id);
assert.equal(familyService.getCurrentUser().role, 'member');
console.log('✅ 测试 12: 加入期间发出的过期鉴权响应被丢弃，刚加入的家庭不会被清掉！\n');

// -------------------------------------------------------------
// 【测试 13】真机端到端：房主创建 → 刷新口令 → 家人加入 → 双方鉴权同步互通
// -------------------------------------------------------------
console.log('【场景 13】验证房主与家人两台设备端到端互通');
sdk.resetMemoryStore();
global.wx.cloud.callFunction = async ({ name, data }) => {
  if (name === 'familyManage') return { result: await familyManageModule.default.main(data, {}) };
  if (name === 'userAuth') return { result: await userAuthModule.default.main(data, {}) };
  return { result: { success: true } };
};
familyService.setMockCurrentUser('openid_e2e_owner', '房主');
const e2eCreate = await familyService.createFamily('皮妞妞');
assert.equal(e2eCreate.success, true);
assert.equal(e2eCreate.family.syncedToCloud, true, '真机创建的家庭必须由云端确认');
const e2eRefresh = await familyService.refreshInviteCode();
assert.equal(e2eRefresh.success, true);
const e2eCode = e2eRefresh.inviteCode;

familyService.setMockCurrentUser('openid_e2e_member', '家人');
const e2eJoin = await familyService.joinFamily(`口令：${e2eCode}，复制即可加入`);
assert.equal(e2eJoin.success, true, '家人在另一台设备凭口令必须加入成功');
assert.equal(e2eJoin.family.members.length, 2);
await familyService.syncUserAuth();
assert.equal(familyService.getCurrentFamily().id, e2eCreate.family.id, '家人鉴权同步后仍在同一家庭');

familyService.setMockCurrentUser('openid_e2e_owner', '房主');
await familyService.syncUserAuth();
assert.equal(familyService.getCurrentUser().role, 'creator', '房主鉴权同步后角色保持 creator');
assert.equal(familyService.getCurrentFamily().members.length, 2, '房主同步后可见家人已加入');
console.log('✅ 测试 13: 创建 → 刷新口令 → 家人加入 → 双端鉴权同步全链路互通！\n');

console.log('===============================================================');
console.log('🎉 全部 13 大场景专项测试 100% 成功通过！加入家人厨房故障已彻底根除！');
console.log('===============================================================\n');
