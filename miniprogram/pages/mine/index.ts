import { preferenceService } from '../../services/preferenceService.js';
import { historyService } from '../../services/historyService.js';
import { UserPreferences } from '../../types/user.js';
import { MealMode } from '../../types/menu.js';

Page({
  data: {
    preferences: {} as UserPreferences,
    dislikedMap: {} as Record<string, boolean>,
    spicyLevels: [
      { level: 0, label: '不吃辣' },
      { level: 1, label: '微辣' },
      { level: 2, label: '中辣' },
      { level: 3, label: '重辣' }
    ],
    commonAvoids: ['鱼/海鲜', '牛肉', '鸡肉', '韭菜', '香菜', '苦瓜', '生姜', '大蒜', '内脏', '羊肉'],
    availableModes: [
      { key: 'hearty_3_1', name: '3 菜 1 汤' },
      { key: 'routine_2_1', name: '2 菜 1 汤' },
      { key: 'three_dishes', name: '3 个菜' },
      { key: 'three_stir_fries', name: '3 个炒菜' }
    ]
  },

  onShow() {
    this.loadPreferences();
  },

  loadPreferences() {
    const pref = preferenceService.getPreferences();
    const map: Record<string, boolean> = {};
    (pref.dislikedIngredients || []).forEach(item => {
      map[item] = true;
    });

    this.setData({
      preferences: pref,
      dislikedMap: map
    });
  },

  setSpicyLevel(e: any) {
    const level = e.currentTarget.dataset.level as number;
    const updated = preferenceService.savePreferences({ spicyLevel: level as any });
    this.setData({ preferences: updated });
    wx.showToast({ title: '辣度已更新', icon: 'none' });
  },

  toggleAvoid(e: any) {
    const item = e.currentTarget.dataset.item as string;
    const current = this.data.preferences.dislikedIngredients || [];
    let updatedList: string[];

    if (current.includes(item)) {
      updatedList = current.filter(i => i !== item);
    } else {
      updatedList = [...current, item];
    }

    const updated = preferenceService.savePreferences({ dislikedIngredients: updatedList });
    const map: Record<string, boolean> = {};
    updatedList.forEach(k => { map[k] = true; });

    this.setData({
      preferences: updated,
      dislikedMap: map
    });
  },

  setDefaultMode(e: any) {
    const key = e.currentTarget.dataset.key as MealMode;
    const updated = preferenceService.savePreferences({ defaultMode: key });
    this.setData({ preferences: updated });
    wx.showToast({ title: '默认模式已更新', icon: 'none' });
  },

  handleClearHistory() {
    wx.showModal({
      title: '清空就餐历史？',
      content: '清空后算法防重将重新从今天开始计算。',
      confirmColor: '#E6683B',
      success: (res) => {
        if (res.confirm) {
          historyService.clearHistory();
          wx.showToast({ title: '已清空历史', icon: 'none' });
        }
      }
    });
  }
});
