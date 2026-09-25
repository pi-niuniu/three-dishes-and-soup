import { historyService } from '../../services/historyService.js';
import { dataProvider } from '../../services/dataProvider.js';
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
          thumbUrl: found?.thumbUrl || '/assets/dishes/default_dish.webp',
          dishEmoji: found?.dishEmoji || '🍲'
        };
      })
    }));
    this.setData({ records: enrichedList });
  }
});
