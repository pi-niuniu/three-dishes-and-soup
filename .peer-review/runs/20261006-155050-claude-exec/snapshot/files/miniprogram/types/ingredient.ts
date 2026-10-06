/**
 * 食材分类
 */
export type IngredientCategory =
  | 'leaf'      // 绿叶菜
  | 'melon'     // 瓜果类
  | 'root'      // 根茎类
  | 'fungus'    // 菌菇类
  | 'bean'      // 豆类及豆制品
  | 'meat'      // 肉禽
  | 'aquatic'   // 水产
  | 'seasoning' // 调味辅料
  | 'staple';   // 主食粮谷

/**
 * 时令食材定义
 */
export interface SeasonalIngredient {
  id: string;
  name: string;                    // 食材名，如 "莲藕"
  category: IngredientCategory;
  bestMonths: number[];            // 最佳品尝月 (1-12)
  availableMonths: number[];       // 供应月份
  regions: string[];               // ["川渝", "全国"]
  seasonWeight: number;            // 时令推荐系数 (1.0 ~ 1.5)
  aliases?: string[];              // 别名或细分类 (如 ["藕带", "脆藕"])
  description?: string;            // 时令特色寄语 (如 "秋季莲藕脆甜粉糯，润燥生津")
}
