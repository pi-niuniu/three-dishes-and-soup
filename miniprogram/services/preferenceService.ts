import type { UserPreferences } from '../types/user.js';

const PREF_STORAGE_KEY = 'user_diet_preferences';

const DEFAULT_PREFERENCES: UserPreferences = {
  peopleCount: 2,
  defaultMode: 'hearty_3_1',
  spicyLevel: 1, // 默认微辣
  dislikedIngredients: [],
  favoriteDishIds: [],
  blockedDishIds: [],
  region: '川渝'
};

class PreferenceService {
  private memoryPref: UserPreferences = { ...DEFAULT_PREFERENCES };

  public getPreferences(): UserPreferences {
    try {
      if (typeof wx !== 'undefined' && wx.getStorageSync) {
        const stored = wx.getStorageSync(PREF_STORAGE_KEY);
        if (stored) {
          return { ...DEFAULT_PREFERENCES, ...stored };
        }
      }
    } catch (e) {
      console.warn('读取本地偏好失败，使用内存降级', e);
    }
    return this.memoryPref;
  }

  public savePreferences(pref: Partial<UserPreferences>): UserPreferences {
    const current = this.getPreferences();
    const updated = { ...current, ...pref };
    this.memoryPref = updated;
    try {
      if (typeof wx !== 'undefined' && wx.setStorageSync) {
        wx.setStorageSync(PREF_STORAGE_KEY, updated);
      }
    } catch (e) {
      console.warn('保存偏好失败', e);
    }
    return updated;
  }

  public toggleFavorite(dishId: string): boolean {
    const pref = this.getPreferences();
    const favs = new Set(pref.favoriteDishIds || []);
    let isFav = false;
    if (favs.has(dishId)) {
      favs.delete(dishId);
      isFav = false;
    } else {
      favs.add(dishId);
      isFav = true;
    }
    this.savePreferences({ favoriteDishIds: Array.from(favs) });
    return isFav;
  }
}

export const preferenceService = new PreferenceService();
