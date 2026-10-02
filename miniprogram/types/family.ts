import type { MealMode } from './menu.js';
import type { DishCategory } from './dish.js';

/**
 * 家庭成员角色
 */
export type FamilyRole = 'creator' | 'member';

/**
 * 家庭成员信息
 */
export interface FamilyMember {
  openid: string;
  nickName: string;
  avatarUrl?: string;
  role: FamilyRole;
  joinedAt: number;
}

/**
 * 4人家庭空间实体
 */
export interface FamilySpace {
  id: string;                      // 空间ID，如 fam_123456
  name: string;                    // 家庭名称，如 "温馨小家食堂"
  creatorOpenid: string;           // 房主 openid
  members: FamilyMember[];         // 成员列表 (上限 4 人)
  memberOpenids: string[];         // 成员 openid 数组 (快速检索与长度控制 <= 4)
  inviteCode: string;              // 6 位动态邀请码
  inviteExpiredAt: number;         // 邀请码过期时间戳 (24 小时有效)
  createdAt: number;
  updatedAt: number;
}

/**
 * 用户档案
 */
export interface UserProfile {
  openid: string;
  nickName: string;
  avatarUrl?: string;
  familyId?: string | null;        // 当前绑定的家庭ID (一人一家庭单向互斥)
  role?: FamilyRole | null;
  createdAt: number;
  updatedAt: number;
}

/**
 * 单餐做菜快照 (日文档内嵌餐次列表项)
 */
export interface SingleMealItem {
  mealId: string;                  // 餐次唯一ID，如 m_1759401234
  mealType: string;                // 餐次类型标签，如 "午餐" / "晚餐" / "加餐"
  mode: MealMode;                  // 模式 (如 hearty_3_1)
  dishes: Array<{
    id: string;
    name: string;
    category?: DishCategory;
    thumbUrl?: string;
    dishEmoji?: string;
    isCustom?: boolean;
  }>;
  dishIds: string[];               // 菜品ID列表 (供算法避重)
  dishNames: string[];             // 菜名列表 (供展示)
  confirmedBy: string;             // 确认开饭人 openid
  confirmedByName: string;         // 确认开饭人昵称
  timestamp: number;               // 毫秒时间戳
}

/**
 * 日就餐历史文档 (集合: meal_history, 主键: meal_${familyId}_${date})
 */
export interface SharedMealDoc {
  _id: string;                     // 确定性主键: meal_${familyId}_${date}
  familyId: string;
  date: string;                    // 就餐日期: YYYY-MM-DD
  meals: SingleMealItem[];         // 同日多餐餐次数组 (杜绝整日覆盖写)
  updatedAt: number;
}

/**
 * 家庭自选私房菜记录 (集合: custom_dishes, 纯文本安全录入)
 */
export interface CustomDishRecord {
  id: string;                      // 菜品ID: custom_xxx
  familyId: string;                // 关联家庭ID
  creatorOpenid: string;           // 录入人 openid
  creatorName?: string;            // 录入人昵称
  name: string;                    // 菜名 (上限 20 字，经过 msgSecCheck)
  category: DishCategory;          // 菜品分类
  taste: string[];                 // 口味标签
  cookingTimeMinutes: number;      // 制作耗时
  defaultIcon: string;             // 自动绑定的 Emoji 图标
  defaultTheme: string;            // 自动绑定的分类大图主题
  ingredients: string[];           // 食材列表 (如无录入则为空数组)
  enabled: boolean;                // 是否启用
  createdAt: number;
}
