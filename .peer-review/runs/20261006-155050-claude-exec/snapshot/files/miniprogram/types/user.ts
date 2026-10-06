import type { MealMode } from './menu.js';
import type { DishCategory } from './dish.js';
export type { MealMode };
export * from './family.js';

/**
 * 用户饮食偏好设置
 */
export interface UserPreferences {
  peopleCount: number;             // 用餐人数，默认 2
  defaultMode: MealMode;           // 默认模式: routine_2_1 或 hearty_3_1
  spicyLevel: 0 | 1 | 2 | 3;       // 最大可接受辣度 (0-不辣, 1-微辣, 2-中辣, 3-重辣)
  dislikedIngredients: string[];   // 忌口/不吃食材，如 ["香菜", "内脏", "羊肉", "苦瓜"]
  favoriteDishIds: string[];       // 收藏菜品ID列表
  blockedDishIds: string[];        // 黑名单/永不推荐菜品ID列表
  region: string;                  // 默认地区，默认 "川渝"
}

/**
 * 吃饭历史记录项 (兼容旧版同时支持同日多餐与家庭共享)
 */
export interface MealHistoryRecord {
  id: string;                      // 记录ID
  menuId?: string;                 // 关联的菜单生成ID
  mealId?: string;                 // 餐次唯一ID
  date: string;                    // 就餐日期 "YYYY-MM-DD"
  timestamp: number;               // 毫秒时间戳
  mode: MealMode;                  // 模式
  dishIds: string[];               // 菜品ID列表
  dishNames: string[];             // 菜品名称快照 (用于直接展示)
  mealType?: string;               // 餐次标签，如 "午餐", "晚餐", "加餐"
  confirmedBy?: string;            // 确认人 openid
  confirmedByName?: string;        // 确认人昵称
  familyId?: string;               // 关联家庭ID
  syncStatus?: 'synced' | 'pending' | 'failed'; // 同步状态
  dishes?: Array<{
    id?: string;
    name: string;
    category?: DishCategory;
    thumbUrl?: string;
    dishEmoji?: string;
    isCustom?: boolean;
  }>;
}

