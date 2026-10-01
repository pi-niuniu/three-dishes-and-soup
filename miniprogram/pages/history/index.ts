import { historyService } from '../../services/historyService.js';
import { dataProvider } from '../../services/dataProvider.js';
import { imageService } from '../../services/imageService.js';
import { MealHistoryRecord } from '../../types/user.js';

Page({
  data: {
    records: [] as any[],
    modeNames: {
      hearty_3_1: '3菜1汤',
      routine_2_1: '2菜1汤',
      three_dishes: '3个菜',
      three_stir_fries: '3个炒菜'
    } as Record<string, string>,
  },

  onShow() {
    this.loadHistory();
  },

  loadHistory() {
    const list = historyService.getHistory();
    const allDishes = dataProvider.getAllDishes();
    const dishMap = new Map(allDishes.map(d => [d.name, d]));
    
    const enrichedList = list.map(record => ({
      ...record,
      dishes: (record.dishNames || []).map(name => {
        const found = dishMap.get(name);
        return {
          name,
          category: found?.category,
          thumbUrl: found?.thumbUrl || '/assets/dishes/default_dish.jpg',
          dishEmoji: found?.dishEmoji || '🍲'
        };
      })
    }));
    this.setData({ records: enrichedList });
  },

  handleHistoryImageError(e: any) {
    const recIndex = e?.currentTarget?.dataset?.recordIndex;
    const dishIndex = e?.currentTarget?.dataset?.dishIndex;
    if (typeof recIndex !== 'number' || typeof dishIndex !== 'number') return;
    const dish = this.data.records?.[recIndex]?.dishes?.[dishIndex];
    if (!dish) return;
    const nextUrl = imageService.getNextFallbackUrl(dish.thumbUrl, dish.category);
    if (nextUrl !== dish.thumbUrl) {
      const key = `records[${recIndex}].dishes[${dishIndex}].thumbUrl`;
      this.setData({ [key]: nextUrl });
    }
  }
});
