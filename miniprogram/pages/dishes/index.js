import { dataProvider } from '../../services/dataProvider.js';
import { preferenceService } from '../../services/preferenceService.js';
Page({
    data: {
        categories: [
            { key: 'all', label: '全部' },
            { key: 'main_meat', label: '主荤' },
            { key: 'secondary_meat', label: '副荤' },
            { key: 'vegetable', label: '素菜' },
            { key: 'soup', label: '靓汤' }
        ],
        currentCategory: 'all',
        searchKeyword: '',
        allDishes: [],
        filteredDishes: [],
    },
    onShow() {
        this.loadDishes();
    },
    loadDishes() {
        const dishes = dataProvider.getAllDishes();
        const pref = preferenceService.getPreferences();
        const favSet = new Set(pref.favoriteDishIds || []);
        const currentMonth = new Date().getMonth() + 1;
        const list = dishes.map(d => ({
            ...d,
            isFav: favSet.has(d.id),
            isSeasonBest: d.bestMonths.includes(currentMonth)
        }));
        this.setData({ allDishes: list }, () => {
            this.applyFilter();
        });
    },
    switchCategory(e) {
        const cat = e.currentTarget.dataset.cat;
        this.setData({ currentCategory: cat }, () => {
            this.applyFilter();
        });
    },
    handleSearchInput(e) {
        this.setData({ searchKeyword: e.detail.value }, () => {
            this.applyFilter();
        });
    },
    applyFilter() {
        const { allDishes, currentCategory, searchKeyword } = this.data;
        let result = allDishes;
        if (currentCategory !== 'all') {
            if (currentCategory === 'secondary_meat') {
                result = result.filter(d => d.category === 'secondary_meat' || d.category === 'egg' || d.category === 'tofu');
            }
            else {
                result = result.filter(d => d.category === currentCategory);
            }
        }
        if (searchKeyword.trim()) {
            const kw = searchKeyword.trim().toLowerCase();
            result = result.filter(d => d.name.toLowerCase().includes(kw) ||
                d.mainIngredient.toLowerCase().includes(kw));
        }
        this.setData({ filteredDishes: result });
    },
    handleToggleFavorite(e) {
        const dishId = e.currentTarget.dataset.id;
        const isFav = preferenceService.toggleFavorite(dishId);
        const updated = this.data.filteredDishes.map(d => {
            if (d.id === dishId) {
                return { ...d, isFav };
            }
            return d;
        });
        this.setData({ filteredDishes: updated });
        wx.showToast({
            title: isFav ? '已收藏' : '已取消收藏',
            icon: 'none'
        });
    }
});
