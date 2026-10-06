const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const dishesJsonPath = path.join(root, 'miniprogram/data/dishes.json');
const dishesTsPath = path.join(root, 'miniprogram/data/dishesData.ts');
const dishesJsPath = path.join(root, 'miniprogram/data/dishesData.js');

const ingredientsJsonPath = path.join(root, 'miniprogram/data/ingredients.json');
const ingredientsTsPath = path.join(root, 'miniprogram/data/ingredientsData.ts');
const ingredientsJsPath = path.join(root, 'miniprogram/data/ingredientsData.js');

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
    if (name.includes('虾') || main.includes('虾')) return '🦐';
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
  if (cat === 'staple_sauce') {
    if (name.includes('面') || name.includes('粉')) return '🍜';
    if (name.includes('饭')) return '🍚';
    if (name.includes('饼') || name.includes('三明治')) return '🥪';
    return '🍲';
  }
  return '🍲';
};

// ==================== 1. 处理菜品数据 ====================
const rawDishes = fs.readFileSync(dishesJsonPath, 'utf8');
const dishes = JSON.parse(rawDishes);

const updatedDishes = dishes.map(dish => {
  return {
    ...dish,
    thumbUrl: `/assets/dishes/${dish.id}.webp`,
    dishEmoji: dish.dishEmoji || getEmoji(dish)
  };
});

// 写回 dishes.json
fs.writeFileSync(dishesJsonPath, JSON.stringify(updatedDishes, null, 2), 'utf8');
console.log(`✅ dishes.json 更新完成，共计 ${updatedDishes.length} 道菜品！`);

// 生成 dishesData.ts
const dishesTsContent = `import type { Dish } from '../types/dish.js';\n\nexport const defaultDishes: Dish[] = ${JSON.stringify(updatedDishes, null, 2)};\n`;
fs.writeFileSync(dishesTsPath, dishesTsContent, 'utf8');
console.log('✅ dishesData.ts 更新完成！');

// 生成 dishesData.js (ES Module 格式)
const dishesJsContent = `export const defaultDishes = ${JSON.stringify(updatedDishes, null, 2)};\n`;
fs.writeFileSync(dishesJsPath, dishesJsContent, 'utf8');
console.log('✅ dishesData.js 更新完成！');

// ==================== 2. 处理时令食材数据 ====================
const rawIngredients = fs.readFileSync(ingredientsJsonPath, 'utf8');
const ingredients = JSON.parse(rawIngredients);

// 生成 ingredientsData.ts
const ingredientsTsContent = `import type { SeasonalIngredient } from "../types/ingredient.js";\n\nexport const defaultIngredients: SeasonalIngredient[] = ${JSON.stringify(ingredients, null, 2)};\n`;
fs.writeFileSync(ingredientsTsPath, ingredientsTsContent, 'utf8');
console.log(`✅ ingredientsData.ts 更新完成，共计 ${ingredients.length} 种食材！`);

// 生成 ingredientsData.js (ES Module 格式)
const ingredientsJsContent = `export const defaultIngredients = ${JSON.stringify(ingredients, null, 2)};\n`;
fs.writeFileSync(ingredientsJsPath, ingredientsJsContent, 'utf8');
console.log('✅ ingredientsData.js 更新完成！');
