import assert from 'assert/strict';
import { menuRecommendationEngine } from '../miniprogram/services/menuRecommendation.js';
import { shoppingListService } from '../miniprogram/services/shoppingListService.js';
import { dataProvider } from '../miniprogram/services/dataProvider.js';

dataProvider.init();
const allDishes = dataProvider.getAllDishes();

console.log('====== 《三菜一汤 · 私厨小食堂》全量业务逻辑与防重回归验证 ======\n');
console.log(`✅ 成功加载高频经典家常菜库，当前共计 ${allDishes.length} 道菜！`);

// 1. 验证菜品分类覆盖
const catCounts = {};
allDishes.forEach(d => {
  catCounts[d.category] = (catCounts[d.category] || 0) + 1;
});
console.log('菜品分类统计分布：', catCounts);
assert(allDishes.length >= 50, '菜品库数量应不少于 50 道');
assert(catCounts['main_meat'] >= 10, '主荤菜品应充足');
assert(catCounts['vegetable'] >= 10, '素菜菜品应充足');
assert(catCounts['soup'] >= 8, '靓汤菜品应充足');

// 2. 验证四大就餐场景生成
console.log('\n--- 验证四大就餐场景生成 ---');
const basePref = {
  peopleCount: 2,
  defaultMode: 'hearty_3_1',
  spicyLevel: 1,
  dislikedIngredients: [],
  favoriteDishIds: [],
  blockedDishIds: [],
  region: '川渝'
};

const modesToTest = [
  { mode: 'hearty_3_1', expectedSlots: 4, name: '3菜1汤' },
  { mode: 'routine_2_1', expectedSlots: 3, name: '2菜1汤' },
  { mode: 'three_dishes', expectedSlots: 3, name: '3个菜' },
  { mode: 'three_stir_fries', expectedSlots: 3, name: '3个炒菜' }
];

for (const item of modesToTest) {
  const menu = menuRecommendationEngine.generateMenu({
    mode: item.mode,
    currentMonth: 9,
    preferences: basePref,
    history: [],
    allDishes,
    portionScale: 1.8,
    targetDateDay: 'tomorrow'
  });
  console.log(`场景【${item.name}】生成成功，槽位数: ${menu.slots.length}，耗时: ${menu.totalTimeMinutes}m`);
  assert.equal(menu.slots.length, item.expectedSlots, `${item.name} 槽位数量应为 ${item.expectedSlots}`);
  
  if (item.mode === 'three_stir_fries') {
    menu.slots.forEach(s => {
      assert(
        s.dish.cookingMethod === 'stir_fry' || s.dish.cookingMethod === 'clear_fry',
        `3个炒菜模式下每道菜必须为炒菜类，实际为: ${s.dish.cookingMethod}`
      );
    });
  }
}
console.log('✅ 四大就餐场景全部验证通过！');

// 3. 验证单菜锁定与换整桌保留、单槽位换菜
console.log('\n--- 验证单菜锁定保护与单槽位换菜 ---');
const origMenu = menuRecommendationEngine.generateMenu({
  mode: 'hearty_3_1',
  currentMonth: 9,
  preferences: basePref,
  history: [],
  allDishes,
  portionScale: 1.8,
  targetDateDay: 'tomorrow'
});

const lockedDish = origMenu.slots[0].dish;
origMenu.slots[0].isLocked = true; // 锁定第 1 道菜

const rerolledMenu = menuRecommendationEngine.generateMenu({
  mode: 'hearty_3_1',
  currentMonth: 9,
  preferences: basePref,
  history: [],
  allDishes,
  lockedSlots: origMenu.slots,
  portionScale: 1.8,
  targetDateDay: 'tomorrow'
});

assert.equal(rerolledMenu.slots[0].dish.id, lockedDish.id, '重新搭配后锁定槽位的菜品必须原样保留');
console.log(`✅ 锁定保护校验通过：【${lockedDish.name}】重新搭配后依然成功锁定保留！`);

// 验证单槽位换菜
const replacedMenu = menuRecommendationEngine.replaceDish(
  1,
  rerolledMenu,
  9,
  basePref,
  [],
  allDishes
);
assert.equal(replacedMenu.slots.length, 4, '换菜后槽位数量应保持为 4');
console.log(`✅ 单槽位换菜校验通过，新替换菜品: ${replacedMenu.slots[1].dish.name}`);

// 4. 模拟连续 10 天就餐历史的高压压力测试
console.log('\n--- 模拟连续 10 天就餐记录的高压去重测试 ---');
const heavyHistory = [];
for (let i = 1; i <= 10; i++) {
  heavyHistory.push({
    id: `hist_${i}`,
    date: `2026-09-${14 + i}`,
    timestamp: Date.now() - (11 - i) * 24 * 60 * 60 * 1000,
    mode: 'hearty_3_1',
    dishIds: [allDishes[(i * 4) % allDishes.length].id, allDishes[(i * 4 + 1) % allDishes.length].id, allDishes[(i * 4 + 2) % allDishes.length].id, allDishes[(i * 4 + 3) % allDishes.length].id],
    dishNames: ['测试菜1', '测试菜2', '测试菜3', '测试菜4']
  });
}
console.log(`已模拟注入 10 天就餐记录，累计占用 ${heavyHistory.length * 4} 道菜次。`);

const testMenu = menuRecommendationEngine.generateMenu({
  mode: 'hearty_3_1',
  currentMonth: 9,
  preferences: basePref,
  history: heavyHistory,
  allDishes,
  portionScale: 1.8,
  targetDateDay: 'tomorrow'
});

console.log(`\n高压去重下成功生成菜单：【${testMenu.targetDateText}】共 ${testMenu.slots.length} 道菜：`);
testMenu.slots.forEach((s, idx) => {
  console.log(`  ${idx + 1}. [${s.role}] ${s.dish.name} (烹饪: ${s.dish.cookingMethod}, 耗时: ${s.dish.cookingTimeMinutes}m)`);
});

assert.equal(testMenu.slots.length, 4, '高压去重下动态保底必须确保 4 个槽位完整');
console.log('✅ 动态保底生效，未发生死锁或槽位缺损！');

// 5. 验证食材口语化斤两换算
console.log('\n--- 验证菜市场口语化斤两换算 ---');
assert.equal(shoppingListService.formatGramsToJinLiang(600), '1 斤 2 两 (约 600g)');
assert.equal(shoppingListService.formatGramsToJinLiang(450), '9 两 (约 450g)');
assert.equal(shoppingListService.formatGramsToJinLiang(250), '半斤 (约 250g)');
assert.equal(shoppingListService.formatGramsToJinLiang(500), '1 斤 (约 500g)');
assert.equal(shoppingListService.formatGramsToJinLiang(550), '1 斤 1 两 (约 550g)');
assert.equal(shoppingListService.formatGramsToJinLiang(750), '1 斤半 (约 750g)');
assert.equal(shoppingListService.formatGramsToJinLiang(1000), '2 斤 (约 1000g)');
// 边界用例：杜绝“10两”
assert.equal(shoppingListService.formatGramsToJinLiang(480), '1 斤 (约 480g)', '480g 进位应为 1 斤而非 10 两');
assert.equal(shoppingListService.formatGramsToJinLiang(980), '2 斤 (约 980g)', '980g 进位应为 2 斤');
assert.equal(shoppingListService.formatGramsToJinLiang(0), '适量');
assert.equal(shoppingListService.formatGramsToJinLiang(30), '约 30g');
console.log('✅ 口语化斤两换算算法 (1斤2两, 9两, 半斤, 1斤半及480g防10两边界) 全部匹配！');

// 6. 验证给大厨做饭叮嘱与买菜特别交代微信文本快照
testMenu.cookNotes = '少放盐，排骨汤多炖半小时';
testMenu.shoppingNotes = '家里有姜不用买，番茄买沙瓤熟透的';
const cookText = shoppingListService.generateTextForCook(testMenu, testMenu.slots.map(s => s.dish));

console.log('\n--- 最终大厨微信文本快照 ---');
console.log(cookText);

assert(cookText.includes('大厨好！'), '文案应以“大厨好！”抬头');
assert(cookText.includes('📝 给大厨的做饭叮嘱：少放盐，排骨汤多炖半小时'), '文案应包含做饭叮嘱');
assert(cookText.includes('📝 给大厨的买菜特别交代：家里有姜不用买，番茄买沙瓤熟透的'), '文案应包含买菜特别交代');
assert(cookText.includes('辛苦大厨啦~'), '文案结尾应为“辛苦大厨啦~”');
assert(!cookText.includes('大姐'), '文案中绝不能出现“大姐”，必须全部使用“大厨”');

// 7. 验证搭配多样性 (Re-roll Diversity)
console.log('\n--- 验证多次搭配的多样性 (杜绝每次必出回锅肉) ---');
const sampledMainMeats = [];
for (let i = 0; i < 15; i++) {
  const m = menuRecommendationEngine.generateMenu({
    mode: 'hearty_3_1',
    currentMonth: 9,
    preferences: basePref,
    history: [],
    allDishes,
    portionScale: 1.8,
    targetDateDay: 'tomorrow'
  });
  sampledMainMeats.push(m.slots[0].dish.name);
}
const distinctMainMeats = new Set(sampledMainMeats);
console.log('15 次随机推荐的主荤菜品集合:', Array.from(distinctMainMeats));
assert(distinctMainMeats.size >= 3, `15 次推荐应至少涵盖 3 种不同主荤，实际为 ${distinctMainMeats.size}`);
console.log('✅ 推荐多样性加权抽样生效，主荤分布充沛！');

// 8. 验证单槽位换菜防乒乓回跳 (Anti-Ping-Pong)
console.log('\n--- 验证单槽位连续换菜防乒乓死循环 ---');
let cycleMenu = origMenu;
const replacedSequence = [cycleMenu.slots[0].dish.name];
for (let i = 0; i < 4; i++) {
  cycleMenu = menuRecommendationEngine.replaceDish(0, cycleMenu, 9, basePref, [], allDishes);
  replacedSequence.push(cycleMenu.slots[0].dish.name);
}
console.log('槽位0 连续4次换菜序列:', replacedSequence);
// 连续相邻换出的菜品必须各不相同
for (let i = 1; i < replacedSequence.length; i++) {
  assert.notEqual(replacedSequence[i], replacedSequence[i - 1], '相邻换出的菜品绝不能相同');
}
const uniqueCountIn5 = new Set(replacedSequence).size;
assert(uniqueCountIn5 >= 4, `连续4次换菜应出现至少4道不同菜品，实际为 ${uniqueCountIn5}`);
console.log('✅ 换菜排除记忆队列生效，彻底杜绝回锅肉交替乒乓现象！');

// 9. 验证生鲜蔬果同桌防撞 (Produce Collision Avoidance)
console.log('\n--- 验证同桌生鲜果蔬杜绝撞车 (无丝瓜+丝瓜、番茄+番茄) ---');
for (let i = 0; i < 20; i++) {
  const checkMenu = menuRecommendationEngine.generateMenu({
    mode: 'hearty_3_1',
    currentMonth: 9,
    preferences: basePref,
    history: [],
    allDishes,
    portionScale: 1.8,
    targetDateDay: 'tomorrow'
  });
  const names = checkMenu.slots.map(s => s.dish.name);
  const produceKeywords = ['丝瓜', '番茄', '冬瓜', '土豆', '豆腐', '西兰花', '茄子', '莲藕'];
  for (const kw of produceKeywords) {
    const kwHits = names.filter(n => n.includes(kw));
    assert(kwHits.length <= 1, `同一餐桌中关键词【${kw}】发生撞菜: ${kwHits.join(', ')}`);
  }
}
console.log('✅ 连续20次菜单生成全部通过蔬果防重检验，餐桌搭配层次丰富！');

// 10. 验证紧凑微信分享序列化与反序列化 (Compact Share Payload)
console.log('\n--- 验证紧凑微信分享序列化与反序列化 ---');
const shareUrlData = shoppingListService.serializeMenuForShare(testMenu);
console.log('紧凑分享 URL 参数长度:', shareUrlData.length, '字符 (微信限制 <=2048 字节)');
assert(shareUrlData.length <= 1024, `紧凑序列化后长度应 <=1024，实际为 ${shareUrlData.length}`);

const deserializedMenu = shoppingListService.deserializeSharedMenu(shareUrlData, allDishes);
assert(deserializedMenu !== null, '反序列化菜单不应为空');
assert.equal(deserializedMenu.slots.length, testMenu.slots.length, '反序列化后槽位数应一致');
assert.equal(deserializedMenu.cookNotes, testMenu.cookNotes, '做饭叮嘱应完整还原');
assert.equal(deserializedMenu.shoppingNotes, testMenu.shoppingNotes, '买菜特别交代应完整还原');
// 11. 验证极端偏好/食材稀疏下零 null 槽位与白屏防御
console.log('\n--- 验证极端偏好/食材稀疏下零 null 槽位与白屏防御 ---');
const extremeMenu = menuRecommendationEngine.generateMenu({
  mode: 'hearty_3_1',
  currentMonth: 9,
  preferences: {
    ...basePref,
    dislikedIngredients: ['猪肉', '牛肉', '鸡肉', '鱼', '虾', '蛋', '排骨', '肉']
  },
  history: [],
  allDishes: allDishes.slice(0, 10), // 人为限制只有前 10 道菜
  portionScale: 1.8,
  targetDateDay: 'tomorrow'
});
const serializedExtreme = JSON.parse(JSON.stringify(extremeMenu));
assert(serializedExtreme.slots.length > 0, '槽位不应为空');
assert(!serializedExtreme.slots.some(s => s === null || !s || !s.dish), 'slots 数组中严禁存在 null 或 undefined 槽位！');
// 验证下游结果页与大厨端 map 访问 100% 安全
const safeNames = serializedExtreme.slots.map(s => s.dish.name);
assert.equal(safeNames.length, serializedExtreme.slots.length, '下游页面安全 map 访问必须通过');
console.log('✅ 极端稀疏测试通过：槽位全部有效填充，绝无 null 漏洞引发白屏崩溃！');

console.log('\n====== 全量家常菜库、四大模式、大厨端口语化、防重保底与分享链路全部 100% 通过！ ======');
