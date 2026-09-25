import { dataProvider } from '../../services/dataProvider.js';
import { menuRecommendationEngine } from '../../services/menuRecommendation.js';
import { preferenceService } from '../../services/preferenceService.js';
import { historyService } from '../../services/historyService.js';
import { MealMode } from '../../types/menu.js';

Page({
  data: {
    currentMonth: 9,
    currentMonthText: '9月',
    seasonName: '秋',
    seasonalIngredients: [] as any[],
    targetDay: 'tomorrow' as 'today' | 'tomorrow',
    todayText: '',
    tomorrowText: '',
    currentMode: 'hearty_3_1' as MealMode,
    statusBarHeight: 44,
    navBarHeight: 44,
  },

  onLoad() {
    this.initNavBar();
    this.initDatesAndSeason();
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

    const tmrw = new Date(now);
    tmrw.setDate(tmrw.getDate() + 1);
    const tmrwMonth = tmrw.getMonth() + 1;
    const tmrwDate = tmrw.getDate();

    let seasonName = '春';
    if ([3, 4, 5].includes(month)) seasonName = '春';
    else if ([6, 7, 8].includes(month)) seasonName = '夏';
    else if ([9, 10, 11].includes(month)) seasonName = '秋';
    else seasonName = '冬';

    const seasonal = dataProvider.getSeasonalIngredients(month).slice(0, 6);

    this.setData({
      currentMonth: month,
      currentMonthText: `${month}月`,
      seasonName,
      seasonalIngredients: seasonal,
      todayText: `${month}月${todayDate}日`,
      tomorrowText: `${tmrwMonth}月${tmrwDate}日`
    });
  },

  switchTargetDay(e: any) {
    const day = e.currentTarget.dataset.day as 'today' | 'tomorrow';
    this.setData({ targetDay: day });
  },

  switchMode(e: any) {
    const mode = e.currentTarget.dataset.mode as MealMode;
    this.setData({ currentMode: mode });
  },

  handleGenerateMenu() {
    const dayDesc = this.data.targetDay === 'tomorrow' ? '明天' : '今天';
    wx.showLoading({ title: `正在搭配【${dayDesc}】家常菜...` });

    const month = this.data.currentMonth;
    const mode = this.data.currentMode;
    const preferences = preferenceService.getPreferences();
    const history = historyService.getHistory();
    const allDishes = dataProvider.getAllDishes();

    const menu = menuRecommendationEngine.generateMenu({
      mode,
      currentMonth: month,
      preferences,
      history,
      allDishes,
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
