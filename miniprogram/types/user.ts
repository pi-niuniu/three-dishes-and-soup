import type { MealMode } from './menu.js';
export type { MealMode };

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
 * 吃饭历史记录项
 */
export interface MealHistoryRecord {
  id: string;                      // 记录ID
  menuId?: string;                 // 关联的菜单生成ID
  date: string;                    // 就餐日期 "YYYY-MM-DD"
  timestamp: number;               // 毫秒时间戳
  mode: MealMode;                  // 模式
  dishIds: string[];               // 菜品ID列表
  dishNames: string[];             // 菜品名称快照 (用于直接展示)
}
