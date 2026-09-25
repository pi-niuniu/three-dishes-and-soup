/**
 * 微信小程序全量页面原生运行时模拟质检 (Pages Runtime Test)
 * 验证 4 个主 Tab + 3 个核心业务子页面在 JS 运行时环境下 0 报错、0 白屏
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
  navigateTo: () => {}
};

const appInstance = {
  globalData: {
    currentMenu: null,
    version: '2.03'
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

console.log('====== 开始微信小程序 7 大核心页面原生 JS 运行时全量质检 ======\n');

// 测试 App.js
currentPageName = 'app';
await import('../miniprogram/app.js');
console.log('✅ app.js 成功执行 onLaunch，无异常');

// 辅助页面创建函数
function instantiatePage(name) {
  const definition = registeredPages[name];
  assert(definition, `页面 ${name} 必须成功调用 Page() 注册`);
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

// 1. Tab 1: pages/index/index (点菜)
currentPageName = 'pages/index/index';
await import('../miniprogram/pages/index/index.js');
const indexPage = instantiatePage('pages/index/index');
indexPage.onLoad();
indexPage.onShow();
console.log(`✅ Tab 1 [点菜] (pages/index) 渲染成功: 季节=${indexPage.data.seasonName}, 时令食材数=${indexPage.data.seasonalIngredients.length}`);
assert(indexPage.data.seasonalIngredients.length > 0, '时令食材列表不应为空');
assert(indexPage.data.tomorrowText.length > 0, '明日日期文案不应为空');

// 触发生成菜单
indexPage.handleGenerateMenu();
assert(appInstance.globalData.currentMenu, '生成菜单后全局 globalData 必须有 currentMenu');
const generatedMenu = appInstance.globalData.currentMenu;
console.log(`✅ Tab 1 [点菜] 成功生成菜单: ${generatedMenu.slots.map(s => s.dish.name).join(' + ')}`);

// 2. Tab 2: pages/dishes/index (菜库)
currentPageName = 'pages/dishes/index';
await import('../miniprogram/pages/dishes/index.js');
const dishesPage = instantiatePage('pages/dishes/index');
dishesPage.onShow();
console.log(`✅ Tab 2 [菜库] (pages/dishes) 渲染成功: 总菜品数=${dishesPage.data.allDishes.length}, 过滤菜品数=${dishesPage.data.filteredDishes.length}`);
assert.equal(dishesPage.data.allDishes.length, 125, '菜品库应为 125 道菜');
assert.equal(dishesPage.data.filteredDishes.length, 125, '默认全部分类展示菜品应为 125 道');

// V2.0 缩略图与生活美学资产完整性质检
import fs from 'fs';
import path from 'path';
for (const dish of dishesPage.data.allDishes) {
  assert(dish.thumbUrl, `菜品 [${dish.name}] 必须包含 thumbUrl`);
  assert(dish.dishEmoji, `菜品 [${dish.name}] 必须包含 dishEmoji`);
  const localFile = path.resolve('miniprogram', dish.thumbUrl.replace(/^\//, ''));
  assert(fs.existsSync(localFile), `菜品 [${dish.name}] 的缩略图文件必须真实存在: ${localFile}`);
}
console.log(`✅ V2.0 菜库全部 ${dishesPage.data.allDishes.length} 道菜品缩略图本地文件与 Emoji 徽标 100% 校验通过！`);

// 验证 Tab 2 菜库主食分类与模糊搜索
dishesPage.switchCategory({ currentTarget: { dataset: { cat: 'staple_sauce' } } });
assert.equal(dishesPage.data.filteredDishes.length, 14, '主食 Tab 筛选结果必须精确为 14 道菜');
console.log('✅ Tab 2 [菜库] 主食 (staple_sauce) 分类切换质检通过: 14 道特色主食全部正常展示');

dishesPage.switchCategory({ currentTarget: { dataset: { cat: 'all' } } });
dishesPage.handleSearchInput({ detail: { value: '意面' } });
assert(dishesPage.data.filteredDishes.length >= 2, '搜索【意面】应至少匹配 2 道特色意面');
dishesPage.handleSearchInput({ detail: { value: '' } });

// 3. Tab 3: pages/history/index (历史)
currentPageName = 'pages/history/index';
await import('../miniprogram/pages/history/index.js');
const historyPage = instantiatePage('pages/history/index');
historyPage.onShow();
console.log(`✅ Tab 3 [历史] (pages/history) 渲染成功: 历史记录数=${historyPage.data.records.length}`);

// 4. Tab 4: pages/mine/index (我的)
currentPageName = 'pages/mine/index';
await import('../miniprogram/pages/mine/index.js');
const minePage = instantiatePage('pages/mine/index');
minePage.onShow();
console.log(`✅ Tab 4 [我的] (pages/mine) 渲染成功: 当前模式=${minePage.data.preferences.defaultMode}, 辣度=${minePage.data.preferences.spicyLevel}`);
assert(minePage.data.availableModes.length === 4, '可用模式应为 4 种');
assert.equal(minePage.data.version, '2.03', '“我的”页面必须展示 V2.03 版本号');

// 5. 子页面 1: pages/menu/result/index (菜单结果)
currentPageName = 'pages/menu/result/index';
await import('../miniprogram/pages/menu/result/index.js');
const resultPage = instantiatePage('pages/menu/result/index');
resultPage.onLoad();
console.log(`✅ 子页面 1 [菜单结果] (pages/menu/result) 渲染成功: 标题=${resultPage.data.modeTitle}, 槽位数=${resultPage.data.menu.slots.length}`);
assert.equal(resultPage.data.menu.slots.length, 4, '3菜1汤模式应有 4 个槽位');

// 验证自选换菜 Modal 中包含特色主食，且选入后角色正确更新为 staple_sauce
resultPage.openSelectModal({ currentTarget: { dataset: { index: 0 } } });
assert(resultPage.data.candidateDishes.some(d => d.category === 'staple_sauce'), '槽位 0 自选候选菜品必须包含特色主食');
const testStaple = resultPage.data.candidateDishes.find(d => d.id === 'dish_112'); // 砂锅香菇腊肠煲仔饭
resultPage.selectCandidateDish({ currentTarget: { dataset: { dish: testStaple } } });
assert.equal(resultPage.data.menu.slots[0].dish.id, 'dish_112', '自选菜品必须成功放入槽位 0');
assert.equal(resultPage.data.menu.slots[0].role, 'staple_sauce', '换入特色主食后槽位角色必须更新为 staple_sauce');
console.log('✅ 子页面 1 自选换菜链路质检通过: 候选菜品支持特色主食，且角色正确同步为 staple_sauce');

// 6. 子页面 2: pages/menu/shopping/index (交付中心)
currentPageName = 'pages/menu/shopping/index';
await import('../miniprogram/pages/menu/shopping/index.js');
const shoppingPage = instantiatePage('pages/menu/shopping/index');
shoppingPage.onLoad();
console.log(`✅ 子页面 2 [交付中心] (pages/menu/shopping) 渲染成功: 采购买菜食材项数=${shoppingPage.data.shoppingList.length}`);
assert(shoppingPage.data.shoppingList.length > 0, '买菜清单不应为空');
assert(shoppingPage.data.dishes.length === 4, '菜品清单应为 4 道');

// 7. 子页面 3: pages/cook/view/index (大厨免密端)
currentPageName = 'pages/cook/view/index';
await import('../miniprogram/pages/cook/view/index.js');
const cookPage = instantiatePage('pages/cook/view/index');
cookPage.onLoad();
console.log(`✅ 子页面 3 [大厨端] (pages/cook/view) 渲染成功: 大厨端食材项数=${cookPage.data.shoppingList.length}, 菜品数=${cookPage.data.dishes.length}`);
assert(cookPage.data.shoppingList.length > 0, '大厨端食材清单不应为空');
assert(cookPage.data.dishes.length === 4, '大厨端菜品列表不应为空');

// 8. 边界测试：冷启动直达交付中心/大厨端（模拟开发者在模拟器直接切换页面或空存储启动）
console.log('\n--- 验证无前置菜单/冷启动直达二级页面防白屏降级 ---');
appInstance.globalData.currentMenu = null;
storage.clear();

const coldShoppingPage = instantiatePage('pages/menu/shopping/index');
coldShoppingPage.onLoad();
assert(coldShoppingPage.data.menu && coldShoppingPage.data.menu.slots, '冷启动直达交付中心必须自动生成保底菜单');
assert(coldShoppingPage.data.dishes.length > 0, '冷启动直达交付中心菜品列表不应为空');
console.log(`✅ 交付中心冷启动直达测试通过: 自动降级生成保底菜单，菜品数=${coldShoppingPage.data.dishes.length}`);

const coldCookPage = instantiatePage('pages/cook/view/index');
coldCookPage.onLoad({});
assert(coldCookPage.data.menu && coldCookPage.data.menu.slots, '冷启动直达大厨端必须自动生成保底菜单');
assert(coldCookPage.data.dishes.length > 0, '冷启动直达大厨端菜品列表不应为空');
console.log(`✅ 大厨端冷启动直达测试通过: 自动降级生成保底菜单，菜品数=${coldCookPage.data.dishes.length}`);

console.log('\n===============================================================');
console.log('🎉 微信小程序所有 7 大核心页面（4 个主 Tab + 3 个二级页）全部 100% 成功加载渲染，绝无白屏！');
console.log('===============================================================\n');
