import type { MealHistoryRecord, MealMode } from '../types/user.js';
import type { Dish } from '../types/dish.js';

const STORAGE_KEY = 'meal_history_records';

class HistoryService {
  private memoryHistory: MealHistoryRecord[] = [];

  /**
   * 获取最近的就餐历史 (默认 30 天)
   */
  public getHistory(): MealHistoryRecord[] {
    try {
      if (typeof wx !== 'undefined' && wx.getStorageSync) {
        const stored = wx.getStorageSync(STORAGE_KEY);
        if (stored && Array.isArray(stored)) {
          return stored;
        }
      }
    } catch (e) {
      console.warn('读取本地历史失败，使用内存降级', e);
    }
    return this.memoryHistory;
  }

  /**
   * 确认开饭：将菜单正式写入历史记录 (防重门禁)
   */
  public recordMeal(mode: MealMode, dishes: Dish[], dateStr?: string, menuId?: string): MealHistoryRecord {
    const history = this.getHistory();
    const now = new Date();
    const localDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    const targetDate = dateStr || localDate;
    const recordId = menuId ? `hist_${menuId}` : `hist_${Date.now()}`;

    const newRecord: MealHistoryRecord = {
      id: recordId,
      menuId,
      date: targetDate,
      timestamp: Date.now(),
      mode,
      dishIds: dishes.map(d => d.id),
      dishNames: dishes.map(d => d.name)
    };

    // 如果当前菜单已记录过（如反复进出结果页与交付中心），就地更新防止历史列表堆积重复记录
    const existingIndex = history.findIndex(r => r.id === recordId || (r.date === targetDate && r.dishNames.join(',') === newRecord.dishNames.join(',')));
    let updated: MealHistoryRecord[];
    if (existingIndex >= 0) {
      updated = [...history];
      updated[existingIndex] = newRecord;
    } else {
      updated = [newRecord, ...history].slice(0, 60);
    }

    this.saveHistory(updated);
    return newRecord;
  }

  /**
   * 清空或重置历史 (用于测试或用户重置)
   */
  public clearHistory(): void {
    this.saveHistory([]);
  }

  private saveHistory(records: MealHistoryRecord[]): void {
    this.memoryHistory = records;
    try {
      if (typeof wx !== 'undefined' && wx.setStorageSync) {
        wx.setStorageSync(STORAGE_KEY, records);
      }
    } catch (e) {
      console.warn('保存本地历史失败', e);
    }
  }
}

export const historyService = new HistoryService();
