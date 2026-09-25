import { dataProvider } from '../../../services/dataProvider.js';
import { menuRecommendationEngine } from '../../../services/menuRecommendation.js';
import { preferenceService } from '../../../services/preferenceService.js';
import { historyService } from '../../../services/historyService.js';
import { shoppingListService } from '../../../services/shoppingListService.js';
Page({
    data: {
        menu: {},
        modeTitle: '今日菜单',
        roleNames: {
            main_meat: '硬核主荤',
            secondary_meat: '下饭副荤',
            egg_or_tofu: '蛋品豆味',
            vegetable: '当季时蔬',
            soup: '暖胃靓汤'
        },
        showModal: false,
        modalTab: 'library',
        currentSlotIndex: 0,
        candidateDishes: [],
        customInputName: '',
    },
    onLoad() {
        this.loadCurrentMenu();
    },
    loadCurrentMenu() {
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
        }
        const modeTitles = {
            hearty_3_1: '3 菜 1 汤',
            routine_2_1: '2 菜 1 汤',
            three_dishes: '3 个菜',
            three_stir_fries: '3 个炒菜'
        };
        const targetLabel = menu.targetDateText || '明天';
        this.setData({
            menu,
            modeTitle: `【${targetLabel}】${modeTitles[menu.mode] || '家常菜单'}`
        });
    },
    // 微信原生卡片分享配置 (直接分享给做饭大厨)
    onShareAppMessage() {
        const { menu } = this.data;
        const dayLabel = menu.targetDateText || '明天';
        const compactData = shoppingListService.serializeMenuForShare(menu);
        return {
            title: `👨‍🍳 大厨好！这是【${dayLabel}】的做饭菜单与买菜清单`,
            path: `/pages/cook/view/index?data=${compactData}`,
        };
    },
    toggleLock(e) {
        const slotIndex = e.currentTarget.dataset.index;
        const currentMenu = this.data.menu;
        const updatedSlots = currentMenu.slots.map(s => {
            if (s.slotIndex === slotIndex) {
                return { ...s, isLocked: !s.isLocked };
            }
            return s;
        });
        const newMenu = { ...currentMenu, slots: updatedSlots };
        this.updateMenuState(newMenu);
    },
    handleReplaceDish(e) {
        const slotIndex = e.currentTarget.dataset.index;
        const currentMenu = this.data.menu;
        const preferences = preferenceService.getPreferences();
        const history = historyService.getHistory();
        const allDishes = dataProvider.getAllDishes();
        wx.showLoading({ title: '换个新菜中...' });
        const newMenu = menuRecommendationEngine.replaceDish(slotIndex, currentMenu, currentMenu.month, preferences, history, allDishes);
        wx.hideLoading();
        this.updateMenuState(newMenu);
        wx.showToast({ title: '已换一道新菜', icon: 'none' });
    },
    openSelectModal(e) {
        const slotIndex = e.currentTarget.dataset.index;
        const targetSlot = this.data.menu.slots.find(s => s.slotIndex === slotIndex);
        const allDishes = dataProvider.getAllDishes();
        let candidates = allDishes;
        if (targetSlot) {
            if (targetSlot.role === 'vegetable') {
                candidates = allDishes.filter(d => d.category === 'vegetable');
            }
            else if (targetSlot.role === 'soup') {
                candidates = allDishes.filter(d => d.category === 'soup');
            }
            else if (targetSlot.role === 'main_meat') {
                candidates = allDishes.filter(d => d.category === 'main_meat');
            }
            else {
                candidates = allDishes.filter(d => d.category === 'secondary_meat' || d.category === 'egg' || d.category === 'tofu');
            }
        }
        if (this.data.menu.mode === 'three_stir_fries') {
            candidates = candidates.filter(d => d.cookingMethod === 'stir_fry' || d.cookingMethod === 'clear_fry');
        }
        this.setData({
            showModal: true,
            currentSlotIndex: slotIndex,
            modalTab: 'library',
            candidateDishes: candidates,
            customInputName: ''
        });
    },
    closeSelectModal() {
        this.setData({ showModal: false });
    },
    switchModalTab(e) {
        const tab = e.currentTarget.dataset.tab;
        this.setData({ modalTab: tab });
    },
    selectCandidateDish(e) {
        const selectedDish = e.currentTarget.dataset.dish;
        const slotIndex = this.data.currentSlotIndex;
        const newMenu = menuRecommendationEngine.manualSetSlotDish(slotIndex, selectedDish, this.data.menu);
        this.updateMenuState(newMenu);
        this.closeSelectModal();
        wx.showToast({ title: `已换成：${selectedDish.name}`, icon: 'none' });
    },
    handleCustomNameInput(e) {
        this.setData({ customInputName: e.detail.value });
    },
    confirmCustomInput() {
        const name = this.data.customInputName.trim();
        if (!name) {
            wx.showToast({ title: '请输入菜名', icon: 'none' });
            return;
        }
        const slotIndex = this.data.currentSlotIndex;
        const targetSlot = this.data.menu.slots.find(s => s.slotIndex === slotIndex);
        const customDish = {
            id: `custom_${Date.now()}`,
            name,
            category: (targetSlot?.dish?.category || 'secondary_meat'),
            cookingMethod: 'stir_fry',
            taste: ['家常特色'],
            spicyLevel: 1,
            ingredients: [
                { name, amount: 200, unit: 'g', isMain: true },
                { name: '大蒜', amount: 1, unit: '适量' }
            ],
            mainIngredient: name,
            bestMonths: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
            availableMonths: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
            regions: ['川渝', '全国'],
            cookingTimeMinutes: 20,
            difficulty: 1,
            estimatedCostLevel: 2,
            recommendedForTwo: true,
            tags: ['私房自定义'],
            enabled: true,
            thumbUrl: `/assets/dishes/default_${targetSlot?.dish?.category === 'main_meat' ? 'main' : targetSlot?.dish?.category === 'soup' ? 'soup' : targetSlot?.dish?.category === 'vegetable' ? 'vegetable' : 'secondary'}.webp`,
            dishEmoji: '✨'
        };
        const newMenu = menuRecommendationEngine.manualSetSlotDish(slotIndex, customDish, this.data.menu);
        this.updateMenuState(newMenu);
        this.closeSelectModal();
        wx.showToast({ title: `已加入：${name}`, icon: 'none' });
    },
    preventBubble() { },
    handleReroll() {
        // 检查是否所有菜都被锁定了
        const allLocked = this.data.menu.slots.every(s => s.isLocked);
        if (allLocked) {
            wx.showModal({
                title: '所有菜品已锁定',
                content: '当前所有菜品均处于锁定状态。若想换菜，请先点击某道菜卡片上的「🔓解锁」后再重新搭配哦！',
                showCancel: false,
                confirmText: '我知道了',
                confirmColor: '#E6683B'
            });
            return;
        }
        wx.showLoading({ title: '重新挑选未锁定菜品...' });
        const currentMenu = this.data.menu;
        const preferences = preferenceService.getPreferences();
        const history = historyService.getHistory();
        const allDishes = dataProvider.getAllDishes();
        const newMenu = menuRecommendationEngine.generateMenu({
            mode: currentMenu.mode,
            currentMonth: currentMenu.month,
            preferences,
            history,
            allDishes,
            lockedSlots: currentMenu.slots,
            portionScale: currentMenu.portionScale || 1.8,
            targetDateDay: currentMenu.targetDateDay || 'tomorrow'
        });
        wx.hideLoading();
        this.updateMenuState(newMenu);
        wx.showToast({ title: '已重新搭配', icon: 'none' });
    },
    handleConfirmMeal() {
        const { menu } = this.data;
        const dishes = (menu?.slots || []).filter(s => s && s.dish).map(s => s.dish);
        const mode = menu.mode || 'hearty_3_1';
        historyService.recordMeal(mode, dishes, menu.date, menu.id);
        wx.navigateTo({
            url: '/pages/menu/shopping/index'
        });
    },
    updateMenuState(newMenu) {
        this.setData({ menu: newMenu });
        const app = getApp();
        app.globalData.currentMenu = newMenu;
        try {
            wx.setStorageSync('active_table_menu', newMenu);
        }
        catch (e) { }
    }
});
