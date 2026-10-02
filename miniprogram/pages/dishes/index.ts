import { dataProvider } from '../../services/dataProvider.js';
import { preferenceService } from '../../services/preferenceService.js';
import { imageService } from '../../services/imageService.js';
import { familyService } from '../../services/familyService.js';
import { Dish } from '../../types/dish.js';

Page({
  data: {
    categories: [
      { key: 'all', label: '全部' },
      { key: 'main_meat', label: '主荤' },
      { key: 'secondary_meat', label: '副荤' },
      { key: 'vegetable', label: '素菜' },
      { key: 'soup', label: '靓汤' },
      { key: 'staple_sauce', label: '主食' },
      { key: 'custom', label: '私房菜' }
    ],
    currentCategory: 'all',
    searchKeyword: '',
    allDishes: [] as any[],
    filteredDishes: [] as any[],
  },

  onShow() {
    this.loadDishes();
    const fam = familyService.getCurrentFamily();
    if (fam) {
      dataProvider.syncCloudCustomDishes().then(() => {
        this.loadDishes();
      }).catch(() => {});
    }
  },

  loadDishes() {
    const dishes = dataProvider.getAllDishes();
    const pref = preferenceService.getPreferences();
    const favSet = new Set(pref.favoriteDishIds || []);
    const currentMonth = new Date().getMonth() + 1;

    const list = dishes.map(d => ({
      ...d,
      isFav: favSet.has(d.id),
      isSeasonBest: d.bestMonths?.includes(currentMonth) || false
    }));

    this.setData({ allDishes: list }, () => {
      this.applyFilter();
    });
  },

  switchCategory(e: any) {
    const cat = e.currentTarget.dataset.cat;
    this.setData({ currentCategory: cat }, () => {
      this.applyFilter();
    });
  },

  handleSearchInput(e: any) {
    this.setData({ searchKeyword: e.detail.value }, () => {
      this.applyFilter();
    });
  },

  navigateToCustomAdd() {
    wx.navigateTo({
      url: '/pages/dishes/custom-add/index'
    });
  },

  applyFilter() {
    const { allDishes, currentCategory, searchKeyword } = this.data;
    let result = allDishes;

    if (currentCategory !== 'all') {
      if (currentCategory === 'custom') {
        result = result.filter(d => Boolean(d.isCustom));
      } else if (currentCategory === 'secondary_meat') {
        result = result.filter(d => d.category === 'secondary_meat' || d.category === 'egg' || d.category === 'tofu');
      } else {
        result = result.filter(d => d.category === currentCategory);
      }
    }

    if (searchKeyword.trim()) {
      const kw = searchKeyword.trim().toLowerCase();
      result = result.filter(d =>
        d.name.toLowerCase().includes(kw) ||
        (d.mainIngredient && d.mainIngredient.toLowerCase().includes(kw)) ||
        (d.tags && d.tags.some((t: string) => t.toLowerCase().includes(kw))) ||
        (d.taste && d.taste.some((t: string) => t.toLowerCase().includes(kw)))
      );
    }

    this.setData({ filteredDishes: result });
  },

  handleToggleFavorite(e: any) {
    const dishId = e.currentTarget.dataset.id as string;
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
  },

  handleDishImageError(e: any) {
    const id = e?.currentTarget?.dataset?.id;
    const index = e?.currentTarget?.dataset?.index;
    if (!id && typeof index !== 'number') return;
    
    const dish = this.data.filteredDishes.find((d: any) => d.id === id) || this.data.filteredDishes[index];
    if (!dish) return;

    const nextUrl = imageService.getNextFallbackUrl(dish.thumbUrl, dish.category);
    if (nextUrl !== dish.thumbUrl) {
      const updatedFiltered = this.data.filteredDishes.map((d: any) => {
        if (d.id === dish.id) {
          return { ...d, thumbUrl: nextUrl };
        }
        return d;
      });
      const updatedAll = this.data.allDishes.map((d: any) => {
        if (d.id === dish.id) {
          return { ...d, thumbUrl: nextUrl };
        }
        return d;
      });
      this.setData({ filteredDishes: updatedFiltered, allDishes: updatedAll });
    }
  }
});
