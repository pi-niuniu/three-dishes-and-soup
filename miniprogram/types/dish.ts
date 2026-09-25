/**
 * 菜品分类枚举
 * main_meat: 主荤 (如红烧排骨、水煮牛肉、回锅肉等)
 * secondary_meat: 副荤/小荤 (如青椒肉丝、肉沫茄子、宫保鸡丁等)
 * egg: 蛋类 (如番茄炒蛋、肉沫蒸蛋等)
 * tofu: 豆制品 (如家常豆腐、麻婆豆腐等)
 * vegetable: 素菜 (绿叶菜、瓜类、根茎、菌菇)
 * soup: 汤类 (排骨汤、圆子汤、冬瓜汤、蛋花汤等)
 */
export type DishCategory =
  | 'main_meat'
  | 'secondary_meat'
  | 'egg'
  | 'tofu'
  | 'vegetable'
  | 'soup';

/**
 * 烹饪方式
 */
export type CookingMethod =
  | 'stir_fry'    // 炒 / 爆炒
  | 'clear_fry'   // 清炒
  | 'braise'      // 红烧 / 酱烧
  | 'stew'        // 炖 / 煨
  | 'steam'       // 蒸
  | 'boil_soup';  // 煮汤 / 滚汤

/**
 * 菜品配方食材
 */
export interface RecipeIngredient {
  name: string;        // 食材标准名，如 "猪里脊"
  amount: number;      // 2人份数值，如 200
  unit: string;        // 计量单位，如 "g", "个", "根", "适量"
  isMain?: boolean;    // 是否为核心主料
}

/**
 * 菜品完整数据结构
 */
export interface Dish {
  id: string;                      // 唯一ID
  name: string;                    // 菜名
  category: DishCategory;          // 核心分类
  cookingMethod: CookingMethod;    // 烹饪方式
  taste: string[];                 // 口味标签: ["微辣", "下饭", "咸鲜"]
  spicyLevel: 0 | 1 | 2 | 3;       // 辣度: 0-不辣, 1-微辣, 2-中辣, 3-重辣
  
  ingredients: RecipeIngredient[];  // 配料明细 (两人份标准)
  mainIngredient: string;          // 核心主食材 (用于防一桌重复，如 "猪肉")
  
  bestMonths: number[];            // 最佳月份 (1-12)
  availableMonths: number[];       // 正常上市/适宜月份 (1-12)
  regions: string[];               // 适用地区，如 ["川渝", "全国"]
  
  cookingTimeMinutes: number;      // 烹饪制作耗时 (分钟)
  difficulty: 1 | 2 | 3;           // 难度: 1-快手菜, 2-日常家常, 3-功夫菜
  estimatedCostLevel: 1 | 2 | 3;   // 预算等级: 1-平价经济, 2-家常适中, 3-偏高
  
  recommendedForTwo: boolean;      // 是否适宜两人份
  tags: string[];                  // 特色标签: ["当季推荐", "大厨拿手", "快手菜"]
  enabled: boolean;                // 是否启用

  // V2.0 菜品缩略图与生活美学资产体系
  thumbUrl?: string;               // 本地内置缩略图路径 (例如 /assets/dishes/dish_001.webp)
  imageUrl?: string;               // 远程高清大图 URL (可选)
  dishEmoji?: string;              // 兜底可爱食材/分类微标 (如 🥩, 🥬, 🍲, 🍳)
}
