const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const dishesJsonPath = path.join(root, 'miniprogram/data/dishes.json');
const dishesTsPath = path.join(root, 'miniprogram/data/dishesData.ts');
const dishesJsPath = path.join(root, 'miniprogram/data/dishesData.js');

const getEmoji = (dish) => {
  const cat = dish.category;
  const name = dish.name || '';
  const main = dish.mainIngredient || '';
  if (cat === 'main_meat') {
    if (name.includes('虾') || main.includes('虾')) return '🦐';
    if (name.includes('鱼') || main.includes('鱼')) return '🐟';
    if (name.includes('鸡') || main.includes('鸡')) return '🍗';
    if (name.includes('牛') || main.includes('牛')) return '🥩';
    return '🥩';
  }
  if (cat === 'secondary_meat') {
    if (name.includes('蛋')) return '🍳';
    return '🥓';
  }
  if (cat === 'egg') return '🥚';
  if (cat === 'tofu') return '🥢';
  if (cat === 'vegetable') {
    if (name.includes('西兰花')) return '🥦';
    if (name.includes('菇') || name.includes('木耳')) return '🍄';
    if (name.includes('青椒') || name.includes('尖椒')) return '🫑';
    if (name.includes('土豆')) return '🥔';
    if (name.includes('茄子')) return '🍆';
    return '🥬';
  }
  if (cat === 'soup') return '🍲';
  return '🍲';
};

const raw = fs.readFileSync(dishesJsonPath, 'utf8');
const dishes = JSON.parse(raw);

const updatedDishes = dishes.map(dish => {
  return {
    ...dish,
    thumbUrl: `/assets/dishes/${dish.id}.webp`,
    dishEmoji: getEmoji(dish)
  };
});

// 1. 写回 dishes.json
fs.writeFileSync(dishesJsonPath, JSON.stringify(updatedDishes, null, 2), 'utf8');
console.log('✅ dishes.json 更新完成，包含 thumbUrl 与 dishEmoji！');

// 2. 生成 dishesData.ts
const tsContent = `import type { Dish } from '../types/dish.js';\n\nexport const defaultDishes: Dish[] = ${JSON.stringify(updatedDishes, null, 2)};\n`;
fs.writeFileSync(dishesTsPath, tsContent, 'utf8');
console.log('✅ dishesData.ts 更新完成！');

// 3. 生成 dishesData.js
const jsContent = `"use strict";\nObject.defineProperty(exports, "__esModule", { value: true });\nexports.defaultDishes = void 0;\nexports.defaultDishes = ${JSON.stringify(updatedDishes, null, 2)};\n`;
fs.writeFileSync(dishesJsPath, jsContent, 'utf8');
console.log('✅ dishesData.js 更新完成！');
