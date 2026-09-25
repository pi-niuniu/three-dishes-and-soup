import { defaultDishes } from '../data/dishesData.js';
import { defaultIngredients } from '../data/ingredientsData.js';
/**
 * 数据提供层服务 (DataProvider)
 * 职责：统一管理菜品库、时令库的加载，初期为本地静态加载，后续平滑扩充云数据库同步
 */
class DataProvider {
    constructor() {
        this.dishes = [];
        this.ingredients = [];
        this.initialized = false;
        this.init();
    }
    init() {
        if (this.initialized)
            return;
        this.dishes = defaultDishes;
        this.ingredients = defaultIngredients;
        this.initialized = true;
    }
    /**
     * 获取所有启用的菜品
     */
    getAllDishes() {
        return this.dishes.filter(d => d.enabled);
    }
    /**
     * 根据 ID 查找菜品
     */
    getDishById(id) {
        return this.dishes.find(d => d.id === id);
    }
    /**
     * 获取当前月份的最佳时令食材
     */
    getSeasonalIngredients(month) {
        return this.ingredients.filter(ing => ing.bestMonths.includes(month));
    }
    /**
     * 获取所有时令食材列表
     */
    getAllIngredients() {
        return this.ingredients;
    }
}
export const dataProvider = new DataProvider();
