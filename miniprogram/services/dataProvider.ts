import type { Dish, DishCategory, CookingMethod, RecipeIngredient } from '../types/dish.js';
import type { SeasonalIngredient } from '../types/ingredient.js';
import { defaultDishes } from '../data/dishesData.js';
import { defaultIngredients } from '../data/ingredientsData.js';
import { imageService } from './imageService.js';
import { familyService } from './familyService.js';
import { cloudService } from './cloudService.js';

const STORAGE_CUSTOM_DISHES_KEY = 'user_custom_dishes_cache';

/**
 * 根据菜品名称和分类智能匹配 Emoji 图标
 */
export function pickEmojiForDish(name: string, category?: string): string {
  if (name.includes('土豆')) return '🥔';
  if (name.includes('番茄') || name.includes('西红柿')) return '🍅';
  if (name.includes('虾')) return '🦐';
  if (name.includes('鱼')) return '🐟';
  if (name.includes('鸡') || name.includes('鸭')) return '🍗';
  if (name.includes('牛') || name.includes('羊') || name.includes('排骨') || name.includes('肉')) return '🥩';
  if (name.includes('蛋')) return '🍳';
  if (name.includes('豆腐')) return '🧊';
  if (name.includes('蘑菇') || name.includes('菌') || name.includes('菇')) return '🍄';
  if (name.includes('茄子')) return '🍆';
  if (name.includes('玉米')) return '🌽';
  if (name.includes('面') || name.includes('粉')) return '🍜';
  if (name.includes('饭')) return '🍚';
  if (name.includes('饺') || name.includes('抄手')) return '🥟';
  if (name.includes('汤')) return '🍲';
  if (name.includes('菜') || name.includes('笋') || name.includes('瓜')) return '🥬';

  switch (category) {
    case 'main_meat': return '🥩';
    case 'secondary_meat': return '🥘';
    case 'egg': return '🍳';
    case 'tofu': return '🧊';
    case 'vegetable': return '🥬';
    case 'soup': return '🍲';
    case 'staple_sauce': return '🍚';
    default: return '🍽️';
  }
}

/**
 * 自选私房菜数据水合器 (hydrateCustomDish)
 * 易错点 5 防御：
 * 1. 缺省字段赋予安全中性默认值，杜绝 recommendation 算法计算 undefined 报错
 * 2. 空食材保留空数组 []，严禁凭空虚构 200g 克重
 * 3. 自动绑定生活美学分类大图与专属 Emoji
 */
export function hydrateCustomDish(raw: Partial<Dish> & { name: string }): Dish {
  const name = String(raw.name || '').trim();
  const category = (raw.category || 'secondary_meat') as DishCategory;
  const thumbUrl = raw.thumbUrl || imageService.getDefaultImage(category);
  const dishEmoji = raw.dishEmoji || pickEmojiForDish(name, category);

  // 食材清洗：空食材保留空数组不虚构，安全注入购物清单与避重算法
  let ingredients: RecipeIngredient[] = [];
  if (Array.isArray(raw.ingredients)) {
    ingredients = raw.ingredients.filter(Boolean).map(ing => {
      if (typeof ing === 'string') {
        return { name: ing, amount: 0, unit: '适量' };
      }
      return {
        name: ing?.name || '',
        amount: typeof ing?.amount === 'number' ? ing.amount : 0,
        unit: ing?.unit || '适量',
        isMain: Boolean(ing?.isMain)
      };
    }).filter(ing => Boolean(ing.name));
  }

  const id = raw.id || `custom_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  const cookingMethod: CookingMethod = raw.cookingMethod || (category === 'soup' ? 'boil_soup' : 'stir_fry');

  return {
    id,
    name,
    category,
    cookingMethod,
    taste: Array.isArray(raw.taste) ? raw.taste : (typeof raw.taste === 'string' ? [raw.taste] : ['家常']),
    spicyLevel: (typeof raw.spicyLevel === 'number' ? raw.spicyLevel : 0) as 0 | 1 | 2 | 3,
    ingredients,
    mainIngredient: raw.mainIngredient || name,
    bestMonths: raw.bestMonths || [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
    availableMonths: raw.availableMonths || [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
    regions: raw.regions || ['全国'],
    cookingTimeMinutes: Number(raw.cookingTimeMinutes) || 20,
    difficulty: (raw.difficulty || 1) as 1 | 2 | 3,
    estimatedCostLevel: (raw.estimatedCostLevel || 1) as 1 | 2 | 3,
    recommendedForTwo: true,
    tags: Array.isArray(raw.tags) ? raw.tags : ['私房菜', '自选菜品'],
    enabled: raw.enabled !== false,
    thumbUrl,
    dishEmoji,
    isCustom: true,
    familyId: raw.familyId,
    creatorOpenid: raw.creatorOpenid
  };
}

/**
 * 数据提供层服务 (DataProvider)
 * 职责：统一管理菜品库（125 道精选菜谱 + 家庭自选私房菜）、时令食材库的加载与双向水合
 */
class DataProvider {
  private dishes: Dish[] = [];
  private customDishes: Dish[] = [];
  private ingredients: SeasonalIngredient[] = [];
  private initialized = false;

  constructor() {
    this.init();
  }

  public init(): void {
    if (this.initialized) return;
    this.dishes = defaultDishes;
    this.ingredients = defaultIngredients;
    this.loadCustomDishesFromStorage();
    this.initialized = true;
  }

  private loadCustomDishesFromStorage(): void {
    try {
      if (typeof wx !== 'undefined' && wx.getStorageSync) {
        const stored = wx.getStorageSync(STORAGE_CUSTOM_DISHES_KEY);
        if (stored && Array.isArray(stored)) {
          this.customDishes = stored.map(d => hydrateCustomDish(d));
        }
      }
    } catch (e) {
      console.warn('读取本地自选私房菜失败', e);
    }
  }

  private saveCustomDishesToStorage(): void {
    try {
      if (typeof wx !== 'undefined' && wx.setStorageSync) {
        wx.setStorageSync(STORAGE_CUSTOM_DISHES_KEY, this.customDishes);
      }
    } catch (e) {
      console.warn('保存本地自选私房菜失败', e);
    }
  }

  /**
   * 获取所有启用的菜品 (125道内置精选 + 已录入的家庭自选私房菜)
   */
  public getAllDishes(): Dish[] {
    return [...this.dishes, ...this.customDishes].filter(d => d.enabled);
  }

  /**
   * 获取家庭自选私房菜列表
   */
  public getCustomDishes(): Dish[] {
    return this.customDishes.filter(d => d.enabled);
  }

  /**
   * 根据 ID 查找菜品
   */
  public getDishById(id: string): Dish | undefined {
    return this.getAllDishes().find(d => d.id === id);
  }

  /**
   * 添加自选私房菜 (纯文本录入，无图片上传，先校验合规，通过后水合入库)
   * 严格遵循易错点 7 防线：敏感内容坚决不准持久化入库
   */
  public async addCustomDish(raw: Partial<Dish> & { name: string }): Promise<Dish> {
    const currentFamily = familyService.getCurrentFamily();
    const currentUser = familyService.getCurrentUser();
    const familyId = currentFamily?.id || (currentFamily as any)?._id || (currentUser.openid ? `personal_${currentUser.openid}` : 'personal');

    // 1. 水合补齐字段
    const hydrated = hydrateCustomDish({
      ...raw,
      familyId,
      creatorOpenid: currentUser.openid
    });

    // 2. 提交云端/安全网关审核 (执行微信 msgSecCheck 文本合规检验)
    const cloudRes = await cloudService.callFunction('customDish', {
      action: 'addDish',
      familyId,
      name: hydrated.name,
      category: hydrated.category,
      taste: hydrated.taste,
      cookingTimeMinutes: hydrated.cookingTimeMinutes,
      ingredients: hydrated.ingredients.map(ing => ing.name),
      mockOpenid: currentUser.openid,
      creatorName: currentUser.nickName
    });

    if (!cloudRes.success) {
      throw new Error(cloudRes.error || '菜品名称包含敏感内容，请修改');
    }

    if (cloudRes.dish?.id) {
      hydrated.id = cloudRes.dish.id;
    }
    if (cloudRes.dish?.familyId) {
      hydrated.familyId = cloudRes.dish.familyId;
    }

    // 3. 校验通过后，存入本地缓存直出 (SWR 0延迟秒开体验)
    const existingIndex = this.customDishes.findIndex(d => d.name === hydrated.name);
    if (existingIndex >= 0) {
      this.customDishes[existingIndex] = hydrated;
    } else {
      this.customDishes.unshift(hydrated);
    }
    this.saveCustomDishesToStorage();

    return hydrated;
  }

  /**
   * 从云端拉取当前家庭或个人空间的自选私房菜并合并
   * 单人模式（无 familyId）也拉取 personal_${openid} 个人桶私房菜
   */
  public async syncCloudCustomDishes(): Promise<Dish[]> {
    const currentFamily = familyService.getCurrentFamily();
    const currentUser = familyService.getCurrentUser();
    const familyId = currentFamily?.id || (currentFamily as any)?._id;
    const effectiveFamilyId = familyId || (currentUser.openid ? `personal_${currentUser.openid}` : 'personal');

    const res = await cloudService.callFunction('customDish', {
      action: 'getDishes',
      familyId: effectiveFamilyId,
      mockOpenid: currentUser.openid
    });

    if (res.success && Array.isArray(res.dishes)) {
      const cloudDishes: Dish[] = res.dishes.map((raw: any) => hydrateCustomDish(raw));
      const map = new Map<string, Dish>();
      // 云端菜品
      for (const d of cloudDishes) {
        map.set(d.name, d);
      }
      // 本地菜品补全 (只补全属于当前有效桶或无家庭归属的私房菜，严防跨家庭串门)
      for (const d of this.customDishes) {
        if (d.familyId && d.familyId !== effectiveFamilyId && d.familyId !== 'personal') {
          continue;
        }
        if (!map.has(d.name)) {
          map.set(d.name, d);
        }
      }
      this.customDishes = Array.from(map.values());
      this.saveCustomDishesToStorage();
    }

    return this.getCustomDishes();
  }

  /**
   * 清空自选私房菜 (用于测试)
   */
  public clearCustomDishes(): void {
    this.customDishes = [];
    this.saveCustomDishesToStorage();
  }

  /**
   * 获取当前月份的最佳时令食材
   */
  public getSeasonalIngredients(month: number): SeasonalIngredient[] {
    return this.ingredients.filter(ing => ing.bestMonths.includes(month));
  }

  /**
   * 获取所有时令食材列表
   */
  public getAllIngredients(): SeasonalIngredient[] {
    return this.ingredients;
  }
}

export const dataProvider = new DataProvider();
