import { shoppingListService } from '../../../services/shoppingListService.js';
import { dataProvider } from '../../../services/dataProvider.js';
import { preferenceService } from '../../../services/preferenceService.js';
import { historyService } from '../../../services/historyService.js';
import { menuRecommendationEngine } from '../../../services/menuRecommendation.js';
Page({
    data: {
        activeView: 'cook',
        menu: {},
        dishes: [],
        shoppingList: [],
        cookNotes: '',
        shoppingNotes: '',
        quickCookNotes: ['少放盐', '少放油', '微辣即可', '肉煸干一点', '排骨汤多煲会儿'],
        quickShoppingNotes: ['家里有葱姜蒜不买', '青菜要嫩叶', '番茄挑沙瓤软的', '肉买后腿肉'],
    },
    onLoad() {
        const app = getApp();
        let menu = app.globalData.currentMenu;
        if (!menu) {
            try {
                menu = wx.getStorageSync('active_table_menu');
            }
            catch (e) { }
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
            app.globalData.currentMenu = menu;
            try {
                wx.setStorageSync('active_table_menu', menu);
            }
            catch (e) { }
        }
        const dishes = (menu.slots || []).filter(s => s && s.dish).map(s => s.dish);
        const shoppingList = shoppingListService.generateShoppingList(dishes, menu.portionScale || 1.8);
        this.setData({
            menu,
            dishes,
            shoppingList,
            cookNotes: menu.cookNotes || '',
            shoppingNotes: menu.shoppingNotes || '',
        });
    },
    switchView(e) {
        const view = e.currentTarget.dataset.view;
        this.setData({ activeView: view });
    },
    handleCookNotesInput(e) {
        const text = e.detail.value;
        this.setData({ cookNotes: text });
        this.saveNotesToMenu();
    },
    appendCookNote(e) {
        const text = e.currentTarget.dataset.text;
        let current = this.data.cookNotes.trim();
        if (current.includes(text)) {
            wx.showToast({ title: '已添加过该叮嘱', icon: 'none' });
            return;
        }
        if (current) {
            current = `${current}，${text}`;
        }
        else {
            current = text;
        }
        this.setData({ cookNotes: current });
        this.saveNotesToMenu();
        wx.showToast({ title: `已添加：${text}`, icon: 'none' });
    },
    handleShoppingNotesInput(e) {
        const text = e.detail.value;
        this.setData({ shoppingNotes: text });
        this.saveNotesToMenu();
    },
    appendShoppingNote(e) {
        const text = e.currentTarget.dataset.text;
        let current = this.data.shoppingNotes.trim();
        if (current.includes(text)) {
            wx.showToast({ title: '已添加过该交代', icon: 'none' });
            return;
        }
        if (current) {
            current = `${current}，${text}`;
        }
        else {
            current = text;
        }
        this.setData({ shoppingNotes: current });
        this.saveNotesToMenu();
        wx.showToast({ title: `已添加：${text}`, icon: 'none' });
    },
    toggleItemCheck(e) {
        const idx = e.currentTarget.dataset.index;
        const list = this.data.shoppingList;
        list[idx].checked = !list[idx].checked;
        this.setData({ shoppingList: list });
        try {
            if (typeof wx !== 'undefined' && wx.vibrateShort) {
                wx.vibrateShort({ type: 'light' });
            }
        }
        catch (err) { }
    },
    saveNotesToMenu() {
        const { menu, cookNotes, shoppingNotes } = this.data;
        if (!menu || !menu.slots || menu.slots.length === 0)
            return;
        const updatedMenu = {
            ...menu,
            cookNotes,
            shoppingNotes
        };
        this.setData({ menu: updatedMenu });
        const app = getApp();
        app.globalData.currentMenu = updatedMenu;
        try {
            wx.setStorageSync('active_table_menu', updatedMenu);
        }
        catch (e) { }
    },
    onShareAppMessage() {
        this.saveNotesToMenu();
        const { menu } = this.data;
        const dayLabel = menu.targetDateText || '明天';
        const compactData = shoppingListService.serializeMenuForShare(menu);
        return {
            title: `👨‍🍳 大厨好！这是【${dayLabel}】的做饭与买菜清单`,
            path: `/pages/cook/view/index?data=${compactData}`,
        };
    },
    handleCopyTextForCook() {
        this.saveNotesToMenu();
        const { menu, dishes } = this.data;
        if (!menu || dishes.length === 0)
            return;
        const copyText = shoppingListService.generateTextForCook(menu, dishes);
        wx.setClipboardData({
            data: copyText,
            success: () => {
                wx.showModal({
                    title: '复制成功！',
                    content: '已包含给大厨的做饭叮嘱与买菜特别交代，可直接粘贴发给大厨啦！',
                    showCancel: false,
                    confirmText: '好的',
                    confirmColor: '#2C5E43'
                });
            }
        });
    }
});
