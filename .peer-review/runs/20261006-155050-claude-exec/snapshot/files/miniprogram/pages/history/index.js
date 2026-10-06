import { historyService } from '../../services/historyService.js';
import { dataProvider } from '../../services/dataProvider.js';
import { imageService } from '../../services/imageService.js';
import { familyService } from '../../services/familyService.js';
Page({
    data: {
        records: [],
        modeNames: {
            hearty_3_1: '3菜1汤',
            routine_2_1: '2菜1汤',
            three_dishes: '3个菜',
            three_stir_fries: '3个炒菜'
        },
        hasFamily: false,
        syncStatusText: '30 天就餐足迹'
    },
    _unsubscribe: null,
    onShow() {
        this.checkFamilyStatus();
        this.loadHistory();
        // 订阅历史变化 (SWR 后台增量拉取完成后自动重绘)
        if (!this._unsubscribe) {
            this._unsubscribe = historyService.subscribe(() => {
                this.loadHistory();
            });
        }
        // 后台静默发起云端增量同步 (0ms 离线秒开，后台异步拉取)
        historyService.syncCloudHistory().then(() => {
            this.loadHistory();
        }).catch(() => { });
    },
    onHide() {
        if (this._unsubscribe) {
            this._unsubscribe();
            this._unsubscribe = null;
        }
    },
    onUnload() {
        if (this._unsubscribe) {
            this._unsubscribe();
            this._unsubscribe = null;
        }
    },
    checkFamilyStatus() {
        familyService.init();
        const fam = familyService.getCurrentFamily();
        const hasFamily = Boolean(fam);
        this.setData({
            hasFamily,
            syncStatusText: hasFamily ? '☁️ 全家共享就餐足迹' : '📅 30 天就餐足迹'
        });
    },
    loadHistory() {
        const list = historyService.getHistory();
        const allDishes = dataProvider.getAllDishes();
        const dishMap = new Map(allDishes.map(d => [d.name, d]));
        const enrichedList = list.map(record => {
            // 优先从已保存的 dishes 结构还原，没有则回溯查表
            const dishes = (record.dishes && record.dishes.length > 0)
                ? record.dishes.map(d => {
                    const found = dishMap.get(d.name);
                    return {
                        name: d.name,
                        category: d.category || found?.category,
                        thumbUrl: d.thumbUrl || found?.thumbUrl || imageService.getDefaultImage(d.category || found?.category),
                        dishEmoji: d.dishEmoji || found?.dishEmoji || '🍲'
                    };
                })
                : (record.dishNames || []).map(name => {
                    const found = dishMap.get(name);
                    return {
                        name,
                        category: found?.category,
                        thumbUrl: found?.thumbUrl || imageService.getDefaultImage(found?.category),
                        dishEmoji: found?.dishEmoji || '🍲'
                    };
                });
            return {
                ...record,
                mealTypeLabel: record.mealType || '正餐',
                confirmedByText: record.confirmedByName ? `${record.confirmedByName} 确认开饭` : '',
                dishes
            };
        });
        this.setData({ records: enrichedList });
    },
    handleHistoryImageError(e) {
        const recIndex = e?.currentTarget?.dataset?.recordIndex;
        const dishIndex = e?.currentTarget?.dataset?.dishIndex;
        if (typeof recIndex !== 'number' || typeof dishIndex !== 'number')
            return;
        const dish = this.data.records?.[recIndex]?.dishes?.[dishIndex];
        if (!dish)
            return;
        const nextUrl = imageService.getNextFallbackUrl(dish.thumbUrl, dish.category);
        if (nextUrl !== dish.thumbUrl) {
            const key = `records[${recIndex}].dishes[${dishIndex}].thumbUrl`;
            this.setData({ [key]: nextUrl });
        }
    }
});
