import { preferenceService } from '../../services/preferenceService.js';
import { historyService } from '../../services/historyService.js';
Page({
    data: {
        preferences: {},
        dislikedMap: {},
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
        const map = {};
        (pref.dislikedIngredients || []).forEach(item => {
            map[item] = true;
        });
        this.setData({
            preferences: pref,
            dislikedMap: map
        });
    },
    setSpicyLevel(e) {
        const level = e.currentTarget.dataset.level;
        const updated = preferenceService.savePreferences({ spicyLevel: level });
        this.setData({ preferences: updated });
        wx.showToast({ title: '辣度已更新', icon: 'none' });
    },
    toggleAvoid(e) {
        const item = e.currentTarget.dataset.item;
        const current = this.data.preferences.dislikedIngredients || [];
        let updatedList;
        if (current.includes(item)) {
            updatedList = current.filter(i => i !== item);
        }
        else {
            updatedList = [...current, item];
        }
        const updated = preferenceService.savePreferences({ dislikedIngredients: updatedList });
        const map = {};
        updatedList.forEach(k => { map[k] = true; });
        this.setData({
            preferences: updated,
            dislikedMap: map
        });
    },
    setDefaultMode(e) {
        const key = e.currentTarget.dataset.key;
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
