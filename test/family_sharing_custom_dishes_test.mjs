/**
 * 《四季三餐·好好吃饭》4人家庭绑定、共享做菜历史与纯文字私房菜全链路深度自动化测试
 * 覆盖 7 大高危易错点防范与 5 大核心实施里程碑
 */
import assert from 'assert/strict';

// 1. 模拟微信小程序原生环境
const storage = new Map();
let registeredPages = {};

global.wx = {
  getStorageSync: (key) => storage.get(key) || null,
  setStorageSync: (key, val) => storage.set(key, JSON.parse(JSON.stringify(val))),
  removeStorageSync: (key) => storage.delete(key),
  clearStorageSync: () => storage.clear(),
  showLoading: () => {},
  hideLoading: () => {},
  showToast: () => {},
  showModal: ({ success }) => success && success({ confirm: true }),
  vibrateShort: () => {},
  setClipboardData: ({ success }) => success && success({ errMsg: 'setClipboardData:ok' }),
  navigateTo: () => {},
  navigateBack: () => {}
};

const appInstance = {
  globalData: {
    currentMenu: null,
    version: '2.12'
  }
};
global.getApp = () => appInstance;
global.App = (options) => {
  if (options.onLaunch) options.onLaunch();
};

let currentPageName = '';
global.Page = (options) => {
  registeredPages[currentPageName] = options;
};

// 导入核心服务
import { cloudService } from '../miniprogram/services/cloudService.js';
import { familyService } from '../miniprogram/services/familyService.js';
import { historyService } from '../miniprogram/services/historyService.js';
import { dataProvider, hydrateCustomDish } from '../miniprogram/services/dataProvider.js';
import { menuRecommendationEngine } from '../miniprogram/services/menuRecommendation.js';
import { preferenceService } from '../miniprogram/services/preferenceService.js';

console.log('===============================================================');
console.log('🚀 启动《四季三餐》4人家庭绑定、共享历史与纯文字私房菜深度测试');
console.log('===============================================================\n');

// -------------------------------------------------------------
// 【模块一】4人家庭绑定与云端事务控制 (防超4人 / 24h口令 / 一人一家庭)
// -------------------------------------------------------------
console.log('【阶段一】测试 4 人家庭空间事务控制与并发防超员');

// 重置环境
cloudService.getMockDb().clearAll();
storage.clear();

// 1. 房主 User A 创建家庭
familyService.setMockCurrentUser('openid_user_a', '爸爸(大厨)');
const createRes = await familyService.createFamily('温馨四口之家');
assert(createRes.success, '房主创建家庭必须成功');
assert.equal(createRes.family.members.length, 1, '创建后成员数应为 1');
assert.equal(createRes.family.memberOpenids.length, 1);
assert.equal(createRes.family.members[0].role, 'creator');
assert.equal(createRes.family.name, '温馨四口之家');
const inviteCode = createRes.family.inviteCode;
assert(inviteCode && inviteCode.length === 6, '必须生成 6 位数字邀请码');
console.log(`✅ 房主 User A 成功创建家庭【${createRes.family.name}】，动态邀请码: ${inviteCode}`);

// 2. User B 加入
familyService.setMockCurrentUser('openid_user_b', '妈妈');
const joinB = await familyService.joinFamily(inviteCode);
assert(joinB.success, 'User B 加入家庭必须成功');
assert.equal(joinB.family.members.length, 2, '成员数应增至 2 人');

// 3. User C 加入
familyService.setMockCurrentUser('openid_user_c', '大宝');
const joinC = await familyService.joinFamily(inviteCode);
assert(joinC.success, 'User C 加入家庭必须成功');
assert.equal(joinC.family.members.length, 3, '成员数应增至 3 人');

// 4. User D 加入 (满员 4 人)
familyService.setMockCurrentUser('openid_user_d', '二宝');
const joinD = await familyService.joinFamily(inviteCode);
assert(joinD.success, 'User D 加入家庭必须成功');
assert.equal(joinD.family.members.length, 4, '成员数达到上限 4 人');
console.log(`✅ 4 位家庭成员依次顺利绑定: ${joinD.family.members.map(m => m.nickName).join(' + ')}`);

// 5. 易错点 2 防御：User E 尝试加入，必须被严格拦截
familyService.setMockCurrentUser('openid_user_e', '邻居小王');
const joinE = await familyService.joinFamily(inviteCode);
assert.equal(joinE.success, false, '第 5 个人加入必须被云端事务强制拒绝');
assert(joinE.error.includes('上限4人') || joinE.error.includes('成员已满'), `错误提示应明确超员拦截: ${joinE.error}`);
console.log(`✅ 并发防超员防御验证通过：拦截第 5 位加入请求 -> "${joinE.error}"`);

// 6. 易错点 2 & 口令有效期防御：已过期口令不可加入
const currentFam = cloudService.getMockDb().handleFamilyManage({
  action: 'getFamily',
  familyId: joinD.family.id
}).family;
currentFam.inviteExpiredAt = Date.now() - 1000; // 模拟口令过期
const joinExpired = await familyService.joinFamily(inviteCode);
assert.equal(joinExpired.success, false, '已过期口令加入必须失败');
assert(joinExpired.error.includes('失效') || joinExpired.error.includes('过期'), `错误提示应明确口令过期: ${joinExpired.error}`);
console.log(`✅ 24 小时动态口令失效检验通过 -> "${joinExpired.error}"`);

// 恢复有效口令
currentFam.inviteExpiredAt = Date.now() + 24 * 3600 * 1000;

// 7. 易错点 3 防御：一人一家庭互斥测试 (User B 切换到新家庭，旧家庭自动移除)
familyService.setMockCurrentUser('openid_user_b', '妈妈');
const newFamRes = await familyService.createFamily('妈妈的新工作室食堂');
assert(newFamRes.success, 'User B 创建新家庭成功');
assert.equal(familyService.getCurrentFamily().id, newFamRes.family.id);

// 检查原家庭成员列表中是否已自动移除 User B，且房主仍然是爸爸
const oldFamCheck = cloudService.getMockDb().handleFamilyManage({
  action: 'getFamily',
  familyId: joinD.family.id
}).family;
assert(!oldFamCheck.memberOpenids.includes('openid_user_b'), '旧家庭必须已原子移除 User B');
assert.equal(oldFamCheck.members.length, 3, '旧家庭人数应变为 3 人');
assert.equal(oldFamCheck.creatorOpenid, 'openid_user_a', '普通成员离开后原房主 openid 必须完好保持');
console.log('✅ 一人一家庭单向互斥验证通过：切换家庭后旧家庭成员已安全剥离且房主权属保持！\n');


// -------------------------------------------------------------
// 【模块二】共享做菜历史与同日多餐独立同步 (解决覆盖写灾难)
// -------------------------------------------------------------
console.log('【阶段二】测试共享做菜历史与同日多餐独立记录 (易错点 1 & 4 & 6 防御)');

// 切回爸爸(大厨)在原家庭
familyService.setMockCurrentUser('openid_user_a', '爸爸(大厨)');
await familyService.syncUserAuth();
assert.equal(familyService.getCurrentFamily().id, joinD.family.id);

historyService.clearHistory();

// 1. 同日中午开饭 (午餐)
const lunchDishes = [
  dataProvider.getDishById('dish_001') || { id: 'dish_001', name: '番茄炖牛腩', category: 'main_meat' },
  dataProvider.getDishById('dish_010') || { id: 'dish_010', name: '清炒菜心', category: 'vegetable' }
];
const lunchRecord = historyService.recordMeal('routine_2_1', lunchDishes, '2026-10-02', 'menu_lunch_001', '午餐');
assert.equal(lunchRecord.mealType, '午餐');
assert.equal(lunchRecord.date, '2026-10-02');
assert.equal(lunchRecord.confirmedByName, '爸爸(大厨)');

// 验证 SWR 0 延迟秒开读取
const instantLocalHistory = historyService.getHistory();
assert.equal(instantLocalHistory.length, 1, '本地应 0 延迟立即可见该次就餐');
assert.equal(instantLocalHistory[0].mealType, '午餐');

// 2. 同日晚上开饭 (晚餐，不同菜品)
const dinnerDishes = [
  dataProvider.getDishById('dish_002') || { id: 'dish_002', name: '清蒸鲈鱼', category: 'main_meat' },
  dataProvider.getDishById('dish_020') || { id: 'dish_020', name: '蒜蓉空心菜', category: 'vegetable' }
];
const dinnerRecord = historyService.recordMeal('routine_2_1', dinnerDishes, '2026-10-02', 'menu_dinner_002', '晚餐');
assert.equal(dinnerRecord.mealType, '晚餐');

// 3. 易错点 1 核心检验：同日多餐是否全部完好保留，拒绝整日覆盖！
const multiMealHistory = historyService.getHistory();
assert.equal(multiMealHistory.length, 2, '同日午餐与晚餐必须独立保存 2 条，绝不可覆盖丢失！');
const mealTypes = multiMealHistory.map(r => r.mealType);
assert(mealTypes.includes('午餐') && mealTypes.includes('晚餐'), '历史中必须同时存在午餐与晚餐');
console.log(`✅ 同日多餐防覆盖验证通过：${multiMealHistory.map(m => `【${m.date} ${m.mealType}】${m.dishNames.join('+')}`).join(' | ')}`);

// 3.1 深度边界攻防：测试未传 menuId (undefined) 时，同日午餐与晚餐依然独立保留（绝不因 undefined === undefined 触发错误覆盖）
const noMenuLunch = historyService.recordMeal('routine_2_1', lunchDishes, '2026-10-08', undefined, '午餐');
const noMenuDinner = historyService.recordMeal('routine_2_1', dinnerDishes, '2026-10-08', undefined, '晚餐');
const oct8Meals = historyService.getHistory().filter(r => r.date === '2026-10-08');
assert.equal(oct8Meals.length, 2, '缺省 menuId 下同日午餐与晚餐必须独立并存两项，绝不互相覆盖！');
console.log('✅ 缺省 menuId 同日多餐去重防误伤验证通过！');

// 4. 易错点 6 防御：离线写队列跨家庭串门污染防御
// 模拟二宝在断网状态下记录了原家庭一餐，随后退出并加入了另一个家庭
familyService.setMockCurrentUser('openid_user_d', '二宝');
await familyService.syncUserAuth();
// 模拟离线产生待同步记录
const offlineRecord = historyService.recordMeal('routine_2_1', lunchDishes, '2026-10-02', 'menu_offline_001', '加餐');
// 二宝切换到妈妈的工作室家庭
await familyService.joinFamily(newFamRes.family.inviteCode);
assert.equal(familyService.getCurrentFamily().id, newFamRes.family.id);

// 尝试提交离线队列
await historyService.flushPendingQueue();

// 检验妈妈的工作室家庭是否被“串门”污染
const momFamHistory = cloudService.getMockDb().handleUpsertMeal({
  action: 'getHistory',
  familyId: newFamRes.family.id
}).records;
assert.equal(momFamHistory.length, 0, '旧家庭的离线记录严禁跨家庭串门写入新家庭！');

// 验证 syncCloudHistory 在新家庭执行时，绝不把属于旧家庭的本地记录合并污染进新家庭
const momSyncedHistory = await historyService.syncCloudHistory();
assert(!momSyncedHistory.some(r => r.familyId === joinD.family.id), '切换新家庭后增量同步绝不保留旧家庭记录');
console.log('✅ 离线队列与SWR增量同步防跨家庭串门污染双重验证通过！\n');


// -------------------------------------------------------------
// 【模块三】纯文字自选私房菜与数据水合 (易错点 5 & 7 防御)
// -------------------------------------------------------------
console.log('【阶段三】测试纯文字自选私房菜录入、数据水合与推荐引擎避重');

// 1. 测试水合器 hydrateCustomDish 赋予中性默认值，且空食材不虚构克重
const rawDish = {
  name: '奶奶牌红烧土豆',
  category: 'vegetable',
  taste: ['浓油赤酱', '家常'],
  cookingTimeMinutes: 25
  // 注意：未提供 ingredients，模拟用户仅输入菜名
};

const hydrated = hydrateCustomDish(rawDish);
assert.equal(hydrated.name, '奶奶牌红烧土豆');
assert.equal(hydrated.category, 'vegetable');
assert.equal(hydrated.cookingMethod, 'stir_fry', '应赋予中性默认烹饪方式 stir_fry');
assert.equal(hydrated.spicyLevel, 0, '应赋予默认不辣 0');
assert.equal(hydrated.dishEmoji, '🥔', '应根据土豆智能匹配 🥔 图标');
assert.equal(hydrated.thumbUrl, '/assets/dishes/default_vegetable.jpg', '应自动绑定素菜美学大图');
assert(Array.isArray(hydrated.ingredients), '食材必须为数组');
assert.equal(hydrated.ingredients.length, 0, '未录入食材时必须保持空数组 []，严禁虚构 200g');

// 1.1 防御性水合检验：包含 null/undefined 的脏数据清洗
const nullDirtyDish = hydrateCustomDish({
  name: '测试脏食材清洗',
  ingredients: [null, undefined, '鲜生姜', { name: '五花肉', amount: 150, unit: 'g' }]
});
assert.equal(nullDirtyDish.ingredients.length, 2, '脏食材中的 null/undefined 必须安全剔除');
console.log(`✅ 数据水合器 (hydrateCustomDish) 验证通过: 自动匹配 ${hydrated.dishEmoji} 与美学大图，空食材保留 ${hydrated.ingredients.length} 项`);

// 2. 易错点 7 防御：文本敏感词拦截
familyService.setMockCurrentUser('openid_user_a', '爸爸(大厨)');
await familyService.syncUserAuth();

// 2.1 云端直接调用校验
const sensitiveRes = await cloudService.callFunction('customDish', {
  action: 'addDish',
  name: '代开各类发票广告',
  familyId: joinD.family.id
});
assert.equal(sensitiveRes.success, false, '敏感广告词必须被 msgSecCheck 拦截');
assert(sensitiveRes.error.includes('敏感') || sensitiveRes.error.includes('违规'), '应返回敏感内容提示');

// 2.2 数据层 addCustomDish 拦截检验：敏感菜品坚决不准入库
dataProvider.clearCustomDishes();
let didThrowSensitive = false;
try {
  await dataProvider.addCustomDish({
    name: '低息贷款代开广告',
    category: 'vegetable'
  });
} catch (err) {
  didThrowSensitive = true;
  assert(err.message.includes('敏感') || err.message.includes('违规'), `错误信息应包含敏感提示: ${err.message}`);
}
assert(didThrowSensitive, 'dataProvider.addCustomDish 必须拦截敏感内容并拒绝入库');
assert(!dataProvider.getCustomDishes().some(d => d.name.includes('贷款')), '敏感菜品绝不能存入本地缓存');
console.log(`✅ 文本安全审核与本地存储拦截测试双重通过 -> 违规内容绝不入库`);

// 3. 将合法自选私房菜添加至 dataProvider
dataProvider.clearCustomDishes();
const customAdded = await dataProvider.addCustomDish({
  name: '外婆秘制板栗烧肉',
  category: 'main_meat',
  taste: ['酱香浓郁'],
  cookingTimeMinutes: 35
});
assert(dataProvider.getCustomDishes().some(d => d.name === '外婆秘制板栗烧肉'), '私房菜应成功加入自选菜库');
assert(dataProvider.getAllDishes().some(d => d.name === '外婆秘制板栗烧肉'), 'getAllDishes 必须包含自选私房菜');
console.log(`✅ 私房菜【${customAdded.name}】已成功注入数据层，当前可用总菜品: ${dataProvider.getAllDishes().length}`);

// 3.1 验证跨家庭私房菜同步隔离
familyService.setMockCurrentUser('openid_user_b', '妈妈');
await familyService.syncUserAuth();
assert.equal(familyService.getCurrentFamily().id, newFamRes.family.id);
const momDishes = await dataProvider.syncCloudCustomDishes();
assert(!momDishes.some(d => d.name === '外婆秘制板栗烧肉'), '新家庭绝不可同步旧家庭的私房菜');
console.log('✅ 跨家庭自选私房菜隔离验证通过！');

// 切回爸爸(大厨)在原家庭，并恢复原家庭私房菜与历史
familyService.setMockCurrentUser('openid_user_a', '爸爸(大厨)');
await familyService.syncUserAuth();
await dataProvider.syncCloudCustomDishes();
await historyService.syncCloudHistory();

// 4. 易错点 5 防御：自选私房菜直接喂给推荐算法与打分引擎，验证绝无 TypeError 白屏
const pref = preferenceService.getPreferences();
const allDishesWithCustom = dataProvider.getAllDishes();
const currentHistory = historyService.getHistory();

const testMenu = menuRecommendationEngine.generateMenu({
  mode: 'hearty_3_1',
  currentMonth: 9,
  preferences: pref,
  history: currentHistory,
  allDishes: allDishesWithCustom,
  portionScale: 1.8,
  targetDateDay: 'tomorrow'
});

assert(testMenu && testMenu.slots.length === 4, '推荐引擎应稳定产出 4 个槽位');
assert(testMenu.slots.every(s => s && s.dish && s.dish.name), '槽位菜品全部健康有效，绝无 TypeError');
console.log(`✅ 推荐引擎无缝接纳自选私房菜，生成菜单: ${testMenu.slots.map(s => s.dish.name).join(' + ')}`);

// 4.1 深度防御性检验：包含缺失 dishIds 的畸形历史记录绝不抛出 TypeError
const malformedHistory = [
  { id: 'bad_hist_1', date: '2026-10-01', timestamp: Date.now() - 3600000, mode: 'hearty_3_1' } // 无 dishIds
];
const safePenalty = menuRecommendationEngine.calculateHistoryPenalty('dish_001', malformedHistory);
assert.equal(safePenalty, 1.0, '畸形历史记录必须安全平滑降级，绝不抛出异常');
console.log('✅ 推荐算法抗畸形历史记录鲁棒性防御通过！');

// 5. 验证家庭共享历史对排餐避重的穿透惩罚
// 今日午餐吃了 番茄炖牛腩 (dish_001)，晚餐吃了 清蒸鲈鱼 (dish_002)
const penalty001 = menuRecommendationEngine.calculateHistoryPenalty('dish_001', currentHistory);
const penalty002 = menuRecommendationEngine.calculateHistoryPenalty('dish_002', currentHistory);
const penaltyFresh = menuRecommendationEngine.calculateHistoryPenalty('dish_999', currentHistory);

assert(penalty001 <= 0.4, '午餐吃过的菜品应受到严厉避重惩罚');
assert(penalty002 <= 0.4, '晚餐吃过的菜品应受到严厉避重惩罚');
assert.equal(penaltyFresh, 1.0, '未吃过的菜品惩罚因子应为 1.0 (无惩罚)');
console.log(`✅ 共享历史排餐避重穿透生效：今日午餐/晚餐历史均被施加降权避重 (惩罚系数: ${penalty001} / ${penalty002})\n`);


// -------------------------------------------------------------
// 【模块四】全页面运行时仿真 (Mine / History / Dishes / Custom-Add)
// -------------------------------------------------------------
console.log('【阶段四】测试 4 大升级与新增页面的运行时渲染');

function instantiatePage(name) {
  const definition = registeredPages[name];
  assert(definition, `页面 ${name} 必须注册`);
  const page = {
    data: JSON.parse(JSON.stringify(definition.data || {})),
    setData(newData, callback) {
      Object.assign(this.data, newData);
      if (typeof callback === 'function') callback();
    },
    ...definition
  };
  return page;
}

// 1. pages/mine/index
currentPageName = 'pages/mine/index';
await import('../miniprogram/pages/mine/index.js');
const minePage = instantiatePage('pages/mine/index');
minePage.onShow();
assert(minePage.data.currentUser, '我的页面应加载当前用户信息');
assert(minePage.data.family, '我的页面在已加入家庭时应正确渲染 family 数据');
assert.equal(minePage.data.family.members.length, 2, '家庭成员展示数应为 2 人 (原 4 人中妈妈与二宝已迁出)');
console.log(`✅ pages/mine 渲染成功: 当前家庭=${minePage.data.family.name}, 成员=${minePage.data.family.members.length}人`);

// 2. pages/history/index
currentPageName = 'pages/history/index';
await import('../miniprogram/pages/history/index.js');
const historyPage = instantiatePage('pages/history/index');
historyPage.onShow();
assert(historyPage.data.records.length >= 2, '历史页面应展示全部同日多餐记录');
assert(historyPage.data.records.some(r => r.mealTypeLabel === '午餐'), '应包含午餐标签');
assert(historyPage.data.records.some(r => r.mealTypeLabel === '晚餐'), '应包含晚餐标签');
console.log(`✅ pages/history 渲染成功: 展示同日多餐卡片数=${historyPage.data.records.length}, 包含午餐与晚餐`);

// 3. pages/dishes/index (含私房菜分类)
currentPageName = 'pages/dishes/index';
await import('../miniprogram/pages/dishes/index.js');
const dishesPage = instantiatePage('pages/dishes/index');
dishesPage.onShow();
assert(dishesPage.data.categories.some(c => c.key === 'custom'), '分类栏应包含【私房菜】');
dishesPage.switchCategory({ currentTarget: { dataset: { cat: 'custom' } } });
assert(dishesPage.data.filteredDishes.length >= 1, '私房菜 Tab 下应过滤出自选菜品');
assert(dishesPage.data.filteredDishes.some(d => d.name === '外婆秘制板栗烧肉'));
console.log(`✅ pages/dishes 渲染成功: 私房菜 Tab 展示自选菜数=${dishesPage.data.filteredDishes.length}`);

// 4. pages/dishes/custom-add/index (新增纯文字录入页面)
currentPageName = 'pages/dishes/custom-add/index';
await import('../miniprogram/pages/dishes/custom-add/index.js');
const addPage = instantiatePage('pages/dishes/custom-add/index');
addPage.handleNameInput({ detail: { value: '家常冬瓜汆丸子' } });
addPage.selectCategory({ currentTarget: { dataset: { cat: 'soup' } } });
addPage.toggleTaste({ currentTarget: { dataset: { taste: '清淡' } } });
addPage.selectTime({ currentTarget: { dataset: { minutes: 15 } } });
assert.equal(addPage.data.dishName, '家常冬瓜汆丸子');
assert.equal(addPage.data.selectedCategory, 'soup');
await addPage.handleSubmit();
assert(dataProvider.getAllDishes().some(d => d.name === '家常冬瓜汆丸子'), '提交后新菜品应已存入数据层');
console.log('✅ pages/dishes/custom-add 纯文字自选录入与提交全链路质检通过！');

console.log('\n===============================================================');
console.log('🏆 4人家庭绑定、同日多餐共享历史与纯文字私房菜全链路 100% 通过！');
console.log('===============================================================\n');
