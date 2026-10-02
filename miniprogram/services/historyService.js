import { familyService } from './familyService.js';
import { cloudService } from './cloudService.js';
const STORAGE_KEY = 'meal_history_records';
const QUEUE_STORAGE_KEY = 'pending_meal_sync_queue';
class HistoryService {
    constructor() {
        this.memoryHistory = [];
        this.pendingQueue = [];
        this.listeners = new Set();
        this.isSyncing = false;
        this.syncPromise = null;
        this.restoreFromStorage();
        this.initNetworkListener();
    }
    /**
     * 监听网络状态变化：当连网时自动静默上报离线待同步队列
     */
    initNetworkListener() {
        if (typeof wx !== 'undefined' && typeof wx.onNetworkStatusChange === 'function') {
            wx.onNetworkStatusChange((res) => {
                if (res && res.isConnected) {
                    console.log('[HistoryService] 网络连接已恢复，自动触发待同步离线队列上报...');
                    this.flushPendingQueue().catch(err => {
                        console.warn('[HistoryService] 连网自动上报待同步队列异常:', err);
                    });
                }
            });
        }
    }
    restoreFromStorage() {
        try {
            if (typeof wx !== 'undefined' && wx.getStorageSync) {
                const stored = wx.getStorageSync(STORAGE_KEY);
                if (stored && Array.isArray(stored)) {
                    this.memoryHistory = stored;
                }
                const queued = wx.getStorageSync(QUEUE_STORAGE_KEY);
                if (queued && Array.isArray(queued)) {
                    this.pendingQueue = queued;
                }
            }
        }
        catch (e) {
            console.warn('读取本地历史失败，使用内存降级', e);
        }
    }
    /**
     * 监听历史数据变化 (SWR 后台增量拉取完成后自动触发页面重绘)
     */
    subscribe(listener) {
        this.listeners.add(listener);
        return () => this.listeners.delete(listener);
    }
    notifyListeners() {
        const list = this.getHistory();
        for (const listener of this.listeners) {
            try {
                listener(list);
            }
            catch (err) {
                console.error('历史状态订阅回调异常', err);
            }
        }
    }
    /**
     * 获取最近的就餐历史 (同步直出，0 毫秒秒开，保障离线与页面性能)
     */
    getHistory() {
        try {
            if (typeof wx !== 'undefined' && wx.getStorageSync) {
                const stored = wx.getStorageSync(STORAGE_KEY);
                if (stored && Array.isArray(stored)) {
                    return stored;
                }
            }
        }
        catch (e) {
            console.warn('读取本地历史失败，使用内存降级', e);
        }
        return this.memoryHistory;
    }
    /**
     * 判断餐次类型 (按确认开饭时的自然时间段自适应识别，也可显式指定)
     */
    deduceMealType(dateObj = new Date()) {
        const hour = dateObj.getHours();
        if (hour >= 5 && hour < 10)
            return '早餐';
        if (hour >= 10 && hour < 15)
            return '午餐';
        if (hour >= 15 && hour < 21)
            return '晚餐';
        return '加餐';
    }
    /**
     * 确认开饭：将菜单正式写入就餐历史
     * 支持同日多餐（午餐与晚餐独立记录，拒绝整日覆盖）
     */
    recordMeal(mode, dishes, dateStr, menuId, mealType) {
        const history = this.getHistory();
        const now = new Date();
        const localDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
        const targetDate = dateStr || localDate;
        const resolvedMealType = mealType || this.deduceMealType(now);
        const randSuffix = Math.random().toString(36).slice(2, 6);
        const mealId = menuId ? `hist_${menuId}` : `hist_${now.getTime()}_${randSuffix}`;
        const currentUser = familyService.getCurrentUser();
        const currentFamily = familyService.getCurrentFamily();
        const familyId = currentFamily?.id || currentFamily?._id || undefined;
        const newRecord = {
            id: mealId,
            menuId,
            mealId,
            date: targetDate,
            timestamp: now.getTime(),
            mode,
            mealType: resolvedMealType,
            dishIds: dishes.map(d => d.id),
            dishNames: dishes.map(d => d.name),
            dishes: dishes.map(d => ({
                id: d.id,
                name: d.name,
                category: d.category,
                thumbUrl: d.thumbUrl,
                dishEmoji: d.dishEmoji,
                isCustom: d.isCustom
            })),
            confirmedBy: currentUser.openid,
            confirmedByName: currentUser.nickName || '家人',
            familyId,
            syncStatus: familyId ? 'pending' : 'synced'
        };
        // 智能去重判断：
        // 若同一餐次（同一有效 menuId 或 同一日期且相同餐次标签且相同菜名）已记录过，就地更新防止重复
        // 若同一天是不同餐次（如午餐与晚餐），则独立并存，绝不覆盖！
        const existingIndex = history.findIndex(r => r.id === mealId ||
            (Boolean(menuId) && r.menuId === menuId) ||
            (r.date === targetDate && r.mealType === resolvedMealType && r.dishNames.join(',') === newRecord.dishNames.join(',')));
        let updated;
        if (existingIndex >= 0) {
            updated = [...history];
            updated[existingIndex] = newRecord;
        }
        else {
            updated = [newRecord, ...history].slice(0, 60);
        }
        this.saveHistory(updated);
        // 如果处于家庭空间中，入队离线待同步队列并后台异步提交
        if (familyId) {
            this.enqueuePendingSync({
                targetFamilyId: familyId,
                authorOpenid: currentUser.openid,
                record: newRecord
            });
            // 触发后台静默同步
            this.flushPendingQueue().catch(() => { });
        }
        return newRecord;
    }
    /**
     * 离线写入队列入队 (携带 targetFamilyId 与 authorOpenid 防止串门污染)
     */
    enqueuePendingSync(item) {
        this.pendingQueue.push(item);
        this.savePendingQueue();
    }
    savePendingQueue() {
        try {
            if (typeof wx !== 'undefined' && wx.setStorageSync) {
                wx.setStorageSync(QUEUE_STORAGE_KEY, this.pendingQueue);
            }
        }
        catch (e) { }
    }
    /**
     * 后台排空待同步离线队列 (易错点 6 防御：家庭变更时严防跨家庭串门污染)
     */
    async flushPendingQueue() {
        if (this.syncPromise) {
            return this.syncPromise;
        }
        if (this.pendingQueue.length === 0)
            return;
        this.isSyncing = true;
        this.syncPromise = (async () => {
            try {
                while (this.pendingQueue.length > 0) {
                    const item = this.pendingQueue[0];
                    const currentFamily = familyService.getCurrentFamily();
                    const currentFamilyId = currentFamily?.id || currentFamily?._id;
                    // 关键防御：如果当前明确处于另一不同家庭，判定为跨家庭废弃记录，安全出队丢弃，绝不上报！
                    if (currentFamilyId && currentFamilyId !== item.targetFamilyId) {
                        console.warn(`[HistoryService] 丢弃跨家庭离线记录: 所属 ${item.targetFamilyId}, 当前 ${currentFamilyId}`);
                        this.pendingQueue.shift();
                        this.savePendingQueue();
                        continue;
                    }
                    // 若当前家庭信息尚未加载就绪，暂缓上报，保留在队列中等待家庭就绪
                    if (!currentFamilyId) {
                        break;
                    }
                    const res = await cloudService.callFunction('upsertMeal', {
                        action: 'upsertMeal',
                        familyId: item.targetFamilyId,
                        date: item.record.date,
                        mockOpenid: item.authorOpenid,
                        meal: {
                            mealId: item.record.mealId || item.record.id,
                            mealType: item.record.mealType,
                            mode: item.record.mode,
                            dishes: item.record.dishes,
                            dishIds: item.record.dishIds,
                            dishNames: item.record.dishNames,
                            confirmedByName: item.record.confirmedByName,
                            timestamp: item.record.timestamp
                        }
                    });
                    if (res.success) {
                        // 标记本地记录为已同步并从队列出队
                        this.pendingQueue.shift();
                        this.savePendingQueue();
                        const history = this.getHistory();
                        const target = history.find(r => r.id === item.record.id ||
                            (Boolean(item.record.mealId) && r.mealId === item.record.mealId) ||
                            (Boolean(item.record.menuId) && r.menuId === item.record.menuId));
                        if (target) {
                            target.syncStatus = 'synced';
                            this.saveHistory([...history]);
                            this.notifyListeners();
                        }
                    }
                    else {
                        const errorMsg = res.error || '';
                        const lower = errorMsg.toLowerCase();
                        const isTransientNetwork = lower.includes('request:fail') ||
                            lower.includes('timeout') ||
                            lower.includes('offline') ||
                            lower.includes('network') ||
                            lower.includes('fail connect') ||
                            lower.includes('socket closed') ||
                            lower.includes('econnaborted') ||
                            lower.includes('econnreset') ||
                            lower.includes('etimedout');
                        const isExplicitRejection = lower.includes('越权') ||
                            lower.includes('不属于') ||
                            lower.includes('无权') ||
                            lower.includes('权限') ||
                            lower.includes('缺少') ||
                            lower.includes('参数') ||
                            lower.includes('非法') ||
                            lower.includes('openid') ||
                            lower.includes('身份凭据') ||
                            lower.includes('不支持') ||
                            lower.includes('敏感') ||
                            lower.includes('违规') ||
                            lower.includes('合规') ||
                            lower.includes('家庭不存在') ||
                            lower.includes('不存在') ||
                            lower.includes('未找到') ||
                            lower.includes('已满') ||
                            lower.includes('上限') ||
                            lower.includes('锁定') ||
                            lower.includes('防刷') ||
                            lower.includes('防暴力枚举') ||
                            lower.includes('已失效') ||
                            lower.includes('过期') ||
                            lower.includes('cannot update _id') ||
                            lower.includes('errcode');
                        if (!isTransientNetwork && isExplicitRejection) {
                            // 服务端业务明确拒绝错误（越权、参数非法等）：直接出队并标记为 failed，避免死循环重试
                            console.warn(`[HistoryService] 离线同步记录 ${item.record.id} 遭服务端明确拒绝，已出队并标记为 failed: ${errorMsg}`);
                            this.pendingQueue.shift();
                            this.savePendingQueue();
                            const history = this.getHistory();
                            const target = history.find(r => r.id === item.record.id ||
                                (Boolean(item.record.mealId) && r.mealId === item.record.mealId) ||
                                (Boolean(item.record.menuId) && r.menuId === item.record.menuId));
                            if (target) {
                                target.syncStatus = 'failed';
                                this.saveHistory([...history]);
                                this.notifyListeners();
                            }
                        }
                        else {
                            // 提交失败（网络或瞬时异常），保留在队列头部中断当前轮次等待下次重试
                            break;
                        }
                    }
                }
            }
            finally {
                this.isSyncing = false;
                this.syncPromise = null;
            }
        })();
        return this.syncPromise;
    }
    /**
     * SWR 增量拉取家庭共享历史并合并到本地
     */
    async syncCloudHistory() {
        const currentFamily = familyService.getCurrentFamily();
        const familyId = currentFamily?.id || currentFamily?._id;
        if (!familyId) {
            return this.getHistory();
        }
        // 先刷新离线待上报队列
        await this.flushPendingQueue();
        const currentUser = familyService.getCurrentUser();
        const res = await cloudService.callFunction('upsertMeal', {
            action: 'getHistory',
            familyId,
            mockOpenid: currentUser.openid,
            limitDays: 60
        });
        if (res.success && Array.isArray(res.records)) {
            const cloudRecords = res.records;
            const localRecords = this.getHistory();
            // 双向合并：以餐次 mealId 为唯一标识
            const recordMap = new Map();
            // 先放入云端记录
            for (const cr of cloudRecords) {
                const key = cr.mealId || cr.id;
                recordMap.set(key, { ...cr, syncStatus: 'synced' });
            }
            // 再放入本地未同步或更新的属于当前家庭的记录
            for (const lr of localRecords) {
                // 关键防御：如果该本地记录显式归属于其他家庭，绝不合并到当前家庭！
                if (lr.familyId && lr.familyId !== familyId) {
                    continue;
                }
                const key = lr.mealId || lr.id;
                if (!recordMap.has(key)) {
                    recordMap.set(key, lr);
                }
                else {
                    // 如果本地是 pending，优先以本地为准
                    if (lr.syncStatus === 'pending') {
                        recordMap.set(key, lr);
                    }
                }
            }
            const merged = Array.from(recordMap.values());
            merged.sort((a, b) => b.timestamp - a.timestamp);
            const finalRecords = merged.slice(0, 60);
            this.saveHistory(finalRecords);
            this.notifyListeners();
            return finalRecords;
        }
        return this.getHistory();
    }
    /**
     * 清空或重置历史 (用于测试或用户重置)
     */
    clearHistory() {
        this.pendingQueue = [];
        this.savePendingQueue();
        this.saveHistory([]);
        this.notifyListeners();
    }
    saveHistory(records) {
        this.memoryHistory = records;
        try {
            if (typeof wx !== 'undefined' && wx.setStorageSync) {
                wx.setStorageSync(STORAGE_KEY, records);
            }
        }
        catch (e) {
            console.warn('保存本地历史失败', e);
        }
    }
}
export const historyService = new HistoryService();
