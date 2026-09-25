import { shoppingListService, MergedIngredientItem } from '../../../services/shoppingListService.js';
import { dataProvider } from '../../../services/dataProvider.js';
import { menuRecommendationEngine } from '../../../services/menuRecommendation.js';
import { preferenceService } from '../../../services/preferenceService.js';
import { historyService } from '../../../services/historyService.js';
import { TableMenu } from '../../../types/menu.js';

Page({
  data: {
    currentTab: 'shopping' as 'shopping' | 'cook',
    menu: {} as TableMenu,
    dishes: [] as any[],
    shoppingList: [] as MergedIngredientItem[],
    checkedCount: 0,
  },

  onLoad(options: any) {
    let menu: TableMenu | null = null;

    if (options && options.data) {
      const allDishes = dataProvider.getAllDishes();
      menu = shoppingListService.deserializeSharedMenu(options.data, allDishes);
    }

    if (!menu) {
      const app = getApp();
      menu = app.globalData.currentMenu as TableMenu;
      if (!menu) {
        try {
          menu = wx.getStorageSync('active_table_menu');
        } catch (e) {}
      }
    }

    if (!menu || !menu.slots || menu.slots.length === 0) {
      const preferences = preferenceService.getPreferences();
      const history = historyService.getHistory();
      const allDishes = dataProvider.getAllDishes();
      menu = menuRecommendationEngine.generateMenu({
        mode: 'hearty_3_1',
        currentMonth: new Date().getMonth() + 1,
        preferences,
        history,
        allDishes,
        portionScale: 1.8,
        targetDateDay: 'tomorrow'
      });
      const app = getApp();
      app.globalData.currentMenu = menu;
      try {
        wx.setStorageSync('active_table_menu', menu);
      } catch (e) {}
    }

    const safeSlots = (menu.slots || []).filter(s => s && s.dish);
    const roleMap: Record<string, string> = {
      main_meat: '硬核主荤',
      secondary_meat: '下饭副荤',
      egg_or_tofu: '蛋品豆味',
      vegetable: '当季时蔬',
      soup: '暖胃靓汤'
    };

    const dishes = safeSlots.map(s => ({
      name: s.dish.name,
      taste: s.dish.taste?.slice(0, 2).join('·') || '家常',
      roleName: roleMap[s.role] || '特色菜',
      cookingTimeMinutes: s.dish.cookingTimeMinutes || 20,
      thumbUrl: s.dish.thumbUrl || '/assets/dishes/default_dish.webp',
      dishEmoji: s.dish.dishEmoji || '🍲'
    }));

    const list = shoppingListService.generateShoppingList(
      safeSlots.map(s => s.dish),
      menu.portionScale || 1.8
    );

      // 从本地恢复大厨打勾记录 (防锁屏或切后台数据丢失)
      try {
        const savedChecked = wx.getStorageSync(`cook_checked_${menu.id}`);
        if (Array.isArray(savedChecked)) {
          const checkedSet = new Set(savedChecked);
          list.forEach(item => {
            if (checkedSet.has(item.name)) {
              item.checked = true;
            }
          });
        }
      } catch (e) {}

      const checkedCount = list.filter(item => item.checked).length;

      this.setData({
        menu,
        dishes,
        shoppingList: list,
        checkedCount
      });
  },

  switchTab(e: any) {
    const tab = e.currentTarget.dataset.tab as 'shopping' | 'cook';
    this.setData({ currentTab: tab });
  },

  // 菜场买菜打勾：附带轻微清脆物理触感震动与持久化
  toggleItemCheck(e: any) {
    const idx = e.currentTarget.dataset.index as number;
    const list = this.data.shoppingList;
    list[idx].checked = !list[idx].checked;
    const checkedCount = list.filter(item => item.checked).length;
    this.setData({ 
      shoppingList: list,
      checkedCount
    });

    // 持久化已勾选菜品列表
    try {
      const checkedNames = list.filter(item => item.checked).map(i => i.name);
      if (this.data.menu.id) {
        wx.setStorageSync(`cook_checked_${this.data.menu.id}`, checkedNames);
      }
    } catch (e) {}

    // 触发微信轻微触觉反馈
    try {
      if (typeof wx !== 'undefined' && wx.vibrateShort) {
        wx.vibrateShort({ type: 'light' });
      }
    } catch (err) {}
  },

  handleBottomButtonClick() {
    if (this.data.checkedCount === this.data.shoppingList.length && this.data.shoppingList.length > 0) {
      this.setData({ currentTab: 'cook' });
      wx.showToast({
        title: '食材买齐，开工！',
        icon: 'success'
      });
    } else {
      this.handleCopyText();
    }
  },

  handleCopyText() {
    const { menu } = this.data;
    if (!menu || !menu.slots) return;

    const dishes = menu.slots.map(s => s.dish);
    const text = shoppingListService.generateTextForCook(menu, dishes);

    wx.setClipboardData({
      data: text,
      success: () => {
        wx.showToast({
          title: '已复制文本清单',
          icon: 'success'
        });
      }
    });
  },

  // 大厨转发给助手或再次分享
  onShareAppMessage() {
    const { menu } = this.data;
    const dayLabel = menu.targetDateText || '明天';
    const compactData = shoppingListService.serializeMenuForShare(menu);

    return {
      title: `👨‍🍳 大厨做饭与买菜清单【${dayLabel}】`,
      path: `/pages/cook/view/index?data=${compactData}`,
    };
  }
});
