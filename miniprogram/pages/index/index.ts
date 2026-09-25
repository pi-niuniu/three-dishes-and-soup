import { dataProvider } from '../../services/dataProvider.js';
import { menuRecommendationEngine } from '../../services/menuRecommendation.js';
import { preferenceService } from '../../services/preferenceService.js';
import { historyService } from '../../services/historyService.js';
import { MealMode, MenuSlot } from '../../types/menu.js';
import { Dish } from '../../types/dish.js';

interface InspirationDishItem {
  id: string;
  name: string;
  category: string;
  categoryName: string;
  thumbUrl: string;
  cookingTimeMinutes: number;
  tasteText: string;
  dishEmoji: string;
  tag: string;
  rawDish: Dish;
}

const SOLAR_TERMS: Record<number, string> = {
  1: '小寒·大寒 · 暖身温补',
  2: '立春·雨水 · 迎春生发',
  3: '惊蛰·春分 · 鲜嫩时蔬',
  4: '清明·谷雨 · 养肝柔和',
  5: '立夏·小满 · 益气清心',
  6: '芒种·夏至 · 清热生津',
  7: '小暑·大暑 · 清爽少油',
  8: '立秋·处暑 · 祛湿健脾',
  9: '白露·秋分 · 润燥生津',
  10: '寒露·霜降 · 滋阴润肺',
  11: '立冬·小雪 · 蓄力温补',
  12: '大雪·冬至 · 醇香煨汤'
};

const INGREDIENT_EMOJIS: Record<string, string> = {
  '莲藕': '🪷',
  '藕': '🪷',
  '丝瓜': '🥒',
  '板栗': '🌰',
  '冬瓜': '🥣',
  '鲜菌菇': '🍄',
  '白玉菇': '🍄',
  '香菇': '🍄',
  '山药': '🍠',
  '南瓜': '🎃',
  '佛手瓜': '🍈',
  '西葫芦': '🥒',
  '毛豆': '🫛',
  '红苋菜': '🥬',
  '空心菜': '🥬'
};

Page({
  data: {
    currentMonth: 9,
    currentMonthText: '9月',
    seasonName: '秋',
    solarTermText: '秋分 · 润燥生津',
    greetingText: '清晨炊烟 · 今日想吃点什么？',
    seasonalIngredients: [] as any[],
    targetDay: 'tomorrow' as 'today' | 'tomorrow',
    todayText: '',
    todayWeekText: '',
    tomorrowText: '',
    tomorrowWeekText: '',
    currentMode: 'hearty_3_1' as MealMode,
    statusBarHeight: 44,
    navBarHeight: 44,
    inspirationDishes: [] as InspirationDishItem[],
    selectedFlavor: '' as string,
    pinnedDishId: '' as string,
    pinnedInspirationDish: null as Dish | null,
    showDishModal: false,
    previewDish: null as Dish | null
  },

  onLoad() {
    this.initNavBar();
    this.initDatesAndSeason();
    this.initInspirationDishes();
  },

  initNavBar() {
    let statusBarHeight = 44;
    let navBarHeight = 44;
    try {
      if (typeof wx !== 'undefined') {
        const windowInfo = wx.getWindowInfo ? wx.getWindowInfo() : (wx.getSystemInfoSync ? wx.getSystemInfoSync() : null);
        if (windowInfo && windowInfo.statusBarHeight) {
          statusBarHeight = windowInfo.statusBarHeight;
        }
        const menu = wx.getMenuButtonBoundingClientRect ? wx.getMenuButtonBoundingClientRect() : null;
        if (menu && menu.top && menu.height) {
          navBarHeight = (menu.top - statusBarHeight) * 2 + menu.height;
        }
      }
    } catch (e) {
      // 降级使用标准 44px
    }
    this.setData({ statusBarHeight, navBarHeight });
  },

  onShow() {
    const pref = preferenceService.getPreferences();
    if (pref.defaultMode) {
      this.setData({ currentMode: pref.defaultMode });
    }
  },

  initDatesAndSeason() {
    const now = new Date();
    const month = now.getMonth() + 1;
    const todayDate = now.getDate();
    const hour = now.getHours();

    const weekdays = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'];
    const todayWeekText = weekdays[now.getDay()];

    const tmrw = new Date(now);
    tmrw.setDate(tmrw.getDate() + 1);
    const tmrwMonth = tmrw.getMonth() + 1;
    const tmrwDate = tmrw.getDate();
    const tomorrowWeekText = weekdays[tmrw.getDay()];

    let seasonName = '春';
    if ([3, 4, 5].includes(month)) seasonName = '春';
    else if ([6, 7, 8].includes(month)) seasonName = '夏';
    else if ([9, 10, 11].includes(month)) seasonName = '秋';
    else seasonName = '冬';

    let greetingText = '清晨炊烟 · 今日想吃点什么？';
    if (hour >= 11 && hour < 14) {
      greetingText = '正午食光 · 犒劳辛苦的自己';
    } else if (hour >= 14 && hour < 19) {
      greetingText = '暮色炊烟 · 卸下一天疲惫，好好吃饭';
    } else if (hour >= 19 || hour < 5) {
      greetingText = '夜阑人静 · 提前排好明日可口家常菜';
    }

    const seasonal = dataProvider.getSeasonalIngredients(month).slice(0, 6).map(ing => ({
      ...ing,
      emoji: INGREDIENT_EMOJIS[ing.name] || '🌱'
    }));

    this.setData({
      currentMonth: month,
      currentMonthText: `${month}月`,
      seasonName,
      solarTermText: SOLAR_TERMS[month] || '顺时而食 · 滋润养胃',
      greetingText,
      seasonalIngredients: seasonal,
      todayText: `${month}月${todayDate}日`,
      todayWeekText,
      tomorrowText: `${tmrwMonth}月${tmrwDate}日`,
      tomorrowWeekText
    });
  },

  initInspirationDishes() {
    const month = this.data.currentMonth;
    const allDishes = dataProvider.getAllDishes().filter(d => d.enabled !== false);

    // 智能筛选 4 道具有代表性的当季高分特色大图美食 (大荤、小荤、时蔬、汤品各精选)
    const categoryLabels: Record<string, string> = {
      'main_meat': '大荤',
      'secondary_meat': '副荤',
      'vegetable': '时蔬',
      'soup': '滋润靓汤',
      'egg': '家常蛋品',
      'tofu': '豆香'
    };

    const targetCategories = ['main_meat', 'secondary_meat', 'vegetable', 'soup'];
    const candidates: InspirationDishItem[] = [];

    targetCategories.forEach(cat => {
      const match = allDishes.find(d => 
        d.category === cat && 
        d.bestMonths.includes(month) &&
        d.thumbUrl &&
        !candidates.some(c => c.id === d.id)
      ) || allDishes.find(d => 
        d.category === cat && 
        d.thumbUrl &&
        !candidates.some(c => c.id === d.id)
      );

      if (match) {
        candidates.push({
          id: match.id,
          name: match.name,
          category: match.category,
          categoryName: categoryLabels[match.category] || '家常菜',
          thumbUrl: match.thumbUrl || '/assets/dishes/default_dish.webp',
          cookingTimeMinutes: match.cookingTimeMinutes || 20,
          tasteText: (match.taste && match.taste.slice(0, 2).join('·')) || '家常可口',
          dishEmoji: match.dishEmoji || '🍲',
          tag: (match.tags && match.tags[0]) || '当季尝鲜',
          rawDish: match
        });
      }
    });

    this.setData({ inspirationDishes: candidates });
  },

  switchTargetDay(e: any) {
    const day = e.currentTarget.dataset.day as 'today' | 'tomorrow';
    this.setData({ targetDay: day });
  },

  switchMode(e: any) {
    const mode = e.currentTarget.dataset.mode as MealMode;
    this.setData({ currentMode: mode });
  },

  toggleQuickFlavor(e: any) {
    const flavor = e.currentTarget.dataset.flavor;
    const newFlavor = this.data.selectedFlavor === flavor ? '' : flavor;
    this.setData({ selectedFlavor: newFlavor });

    if (newFlavor === 'warm_soup') {
      if (this.data.currentMode === 'three_dishes' || this.data.currentMode === 'three_stir_fries') {
        this.setData({ currentMode: 'hearty_3_1' });
        wx.showToast({ title: '已切换为滋养煲汤模式', icon: 'none' });
      } else {
        wx.showToast({ title: '已优选滋补靓汤', icon: 'none' });
      }
    } else if (newFlavor === 'light_healthy') {
      wx.showToast({ title: '已调为清淡少油', icon: 'none' });
    } else if (newFlavor === 'classic_spicy') {
      wx.showToast({ title: '已调为川渝开胃微辣', icon: 'none' });
    } else if (newFlavor === 'quick_speed') {
      wx.showToast({ title: '已优选快手烹饪菜肴', icon: 'none' });
    }
  },

  openDishPreview(e: any) {
    const dishId = e.currentTarget.dataset.id;
    const item = this.data.inspirationDishes.find(d => d.id === dishId);
    if (item) {
      this.setData({
        previewDish: item.rawDish,
        showDishModal: true
      });
    }
  },

  closeDishModal() {
    this.setData({
      showDishModal: false,
      previewDish: null
    });
  },

  preventBubble() {
    // 阻止模态框内部点击事件冒泡关闭
  },

  togglePinPreviewDish() {
    const dish = this.data.previewDish;
    if (!dish) return;

    if (this.data.pinnedDishId === dish.id) {
      this.setData({
        pinnedDishId: '',
        pinnedInspirationDish: null,
        showDishModal: false
      });
      wx.showToast({ title: '已取消固定', icon: 'none' });
    } else {
      this.setData({
        pinnedDishId: dish.id,
        pinnedInspirationDish: dish,
        showDishModal: false
      });
      wx.showToast({ title: `已指定【${dish.name}】加入排餐`, icon: 'success' });
    }
  },

  handleGenerateMenu() {
    const dayDesc = this.data.targetDay === 'tomorrow' ? '明天' : '今天';
    wx.showLoading({ title: `正在搭配【${dayDesc}】家常菜...` });

    const month = this.data.currentMonth;
    const mode = this.data.currentMode;
    const preferences = preferenceService.getPreferences();
    const history = historyService.getHistory();
    const allDishes = dataProvider.getAllDishes();

    // 响应今日快速调味偏好
    const flavor = this.data.selectedFlavor;
    if (flavor === 'light_healthy') {
      preferences.spicyLevel = 0;
    } else if (flavor === 'classic_spicy') {
      if (preferences.spicyLevel === 0) {
        preferences.spicyLevel = 1;
      }
    }

    // 响应锁定/指定菜品
    const lockedSlots: MenuSlot[] = [];
    if (this.data.pinnedInspirationDish) {
      const pinned = this.data.pinnedInspirationDish;
      let slotRole: any = 'main_meat';
      let slotIdx = 0;

      if (pinned.category === 'main_meat') {
        slotRole = 'main_meat';
        slotIdx = 0;
      } else if (pinned.category === 'soup') {
        slotRole = 'soup';
        slotIdx = mode === 'routine_2_1' ? 2 : 3;
      } else if (pinned.category === 'vegetable') {
        slotRole = 'vegetable';
        slotIdx = mode === 'routine_2_1' ? 1 : 2;
      } else {
        slotRole = 'sub_meat_or_tofu';
        slotIdx = 1;
      }

      lockedSlots.push({
        slotIndex: slotIdx,
        role: slotRole,
        dish: pinned,
        isLocked: true
      });
    }

    const menu = menuRecommendationEngine.generateMenu({
      mode,
      currentMonth: month,
      preferences,
      history,
      allDishes,
      lockedSlots: lockedSlots.length > 0 ? lockedSlots : undefined,
      portionScale: 1.8,
      targetDateDay: this.data.targetDay
    });

    const app = getApp();
    app.globalData.currentMenu = menu;
    try {
      wx.setStorageSync('active_table_menu', menu);
    } catch (e) {}

    wx.hideLoading();

    wx.navigateTo({
      url: '/pages/menu/result/index'
    });
  }
});
