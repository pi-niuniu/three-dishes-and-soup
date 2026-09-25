import type { Dish } from './dish.js';

export type MealMode =
  | 'hearty_3_1'
  | 'routine_2_1'
  | 'three_dishes'
  | 'three_stir_fries';

export type SlotRole =
  | 'main_meat'
  | 'secondary_meat'
  | 'egg_or_tofu'
  | 'vegetable'
  | 'soup';

export interface MenuSlot {
  slotIndex: number;
  role: SlotRole;
  dish: Dish;
  isLocked: boolean;
  excludedDishIds?: string[];
}

export interface TableMenu {
  id: string;
  mode: MealMode;
  date: string;
  targetDateDay: 'today' | 'tomorrow';
  targetDateText: string;
  month: number;
  slots: MenuSlot[];
  portionScale: number;
  portionLabel: string;
  totalTimeMinutes: number;
  cookNotes?: string;       // 厨师做饭备注 (如：少盐、肉多煸干、汤多炖会儿)
  shoppingNotes?: string;   // 采购买菜备注 (如：家里有葱姜不用买、番茄挑沙瓤的)
  createdAt: number;
}
