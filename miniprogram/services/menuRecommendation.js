function formatLocalDate(d) {
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}
function normalizeProduce(p) {
    if (p === '西红柿' || p === '番茄')
        return '番茄';
    if (p === '藕' || p === '莲藕')
        return '莲藕';
    if (p === '黑木耳' || p === '木耳')
        return '木耳';
    if (p === '圆茄子' || p === '茄子')
        return '茄子';
    if (p === '散花菜' || p === '花菜' || p === '有机花菜')
        return '花菜';
    if (p === '老豆腐' || p === '嫩豆腐' || p === '豆腐')
        return '豆腐';
    if (p === '白萝卜' || p === '萝卜')
        return '白萝卜';
    if (p === '毛豆米' || p === '毛豆')
        return '毛豆';
    if (p === '包菜' || p === '卷心菜')
        return '包菜';
    if (p === '青菜心' || p === '菜心')
        return '青菜心';
    if (p === '铁棍山药' || p === '山药')
        return '山药';
    return p;
}
function getProduceKeys(dish) {
    const produceList = [
        '丝瓜', '番茄', '西红柿', '冬瓜', '南瓜尖', '卷心菜', '包菜', '四季豆', '圆茄子', '茄子', '土豆',
        '嫩豆腐', '老豆腐', '豆腐', '毛豆米', '毛豆', '白玉菇', '白萝卜', '萝卜', '空心菜', '茼蒿', '莲藕', '藕',
        '莴笋', '菜心', '青菜心', '蒜苔', '西兰花', '散花菜', '花菜', '豆芽',
        '豌豆尖', '山药', '黄瓜', '木耳', '黑木耳', '香菇', '板栗'
    ];
    const found = new Set();
    for (const p of produceList) {
        if (dish.name?.includes(p) || dish.mainIngredient?.includes(p)) {
            found.add(normalizeProduce(p));
        }
    }
    for (const ing of (dish.ingredients || [])) {
        if (ing.isMain || ing.amount >= 80) {
            for (const p of produceList) {
                if (ing.name?.includes(p)) {
                    found.add(normalizeProduce(p));
                }
            }
        }
    }
    return Array.from(found);
}
export class MenuRecommendationEngine {
    generateMenu(params) {
        const { mode, currentMonth, preferences, history, allDishes, lockedSlots, portionScale = 1.8, targetDateDay = 'tomorrow' } = params;
        let eligibleDishes = this.filterDishes(allDishes, preferences);
        if (mode === 'three_stir_fries') {
            const stirFriesOnly = eligibleDishes.filter(d => d.cookingMethod === 'stir_fry' || d.cookingMethod === 'clear_fry');
            if (stirFriesOnly.length >= 8) {
                eligibleDishes = stirFriesOnly;
            }
        }
        // 动态去重保护：如果历史记录过多，自适应放宽历史惩罚强度
        const historyRelaxRate = history.length >= 10 ? 0.5 : 1.0;
        const scoredDishes = eligibleDishes.map(dish => ({
            dish,
            score: this.scoreDish(dish, currentMonth, preferences, history, mode, historyRelaxRate)
        }));
        scoredDishes.sort((a, b) => b.score - a.score);
        const targetRoles = this.getTargetRolesByMode(mode);
        const slots = [];
        const usedMainIngredients = {};
        const usedCookingMethods = [];
        const usedProduces = new Set();
        // 优先保留已锁定的槽位
        for (let i = 0; i < targetRoles.length; i++) {
            const existingLocked = lockedSlots?.find(s => s.slotIndex === i && s.isLocked);
            if (existingLocked) {
                slots[i] = existingLocked;
                const mainIng = existingLocked.dish.mainIngredient;
                usedMainIngredients[mainIng] = (usedMainIngredients[mainIng] || 0) + 1;
                usedCookingMethods.push(existingLocked.dish.cookingMethod);
                getProduceKeys(existingLocked.dish).forEach(pk => usedProduces.add(pk));
            }
        }
        // 为未锁定槽位挑选最佳匹配菜品
        for (let i = 0; i < targetRoles.length; i++) {
            if (slots[i])
                continue;
            const role = targetRoles[i];
            const selectedDish = this.pickBestDishForRole(role, scoredDishes, slots.filter(Boolean).map(s => s.dish.id), usedMainIngredients, usedCookingMethods, usedProduces, mode === 'three_stir_fries');
            if (selectedDish) {
                slots[i] = {
                    slotIndex: i,
                    role,
                    dish: selectedDish,
                    isLocked: false
                };
                const mainIng = selectedDish.mainIngredient;
                usedMainIngredients[mainIng] = (usedMainIngredients[mainIng] || 0) + 1;
                usedCookingMethods.push(selectedDish.cookingMethod);
                getProduceKeys(selectedDish).forEach(pk => usedProduces.add(pk));
            }
            else {
                const fallback = eligibleDishes.find(d => this.isCategoryMatchingRole(d.category, role) &&
                    !slots.filter(Boolean).some(s => s.dish.id === d.id)) || allDishes.find(d => this.isCategoryMatchingRole(d.category, role) &&
                    !slots.filter(Boolean).some(s => s.dish.id === d.id)) || eligibleDishes.find(d => !slots.filter(Boolean).some(s => s.dish.id === d.id)) || allDishes[0];
                if (fallback) {
                    slots[i] = { slotIndex: i, role, dish: fallback, isLocked: false };
                    const mainIng = fallback.mainIngredient;
                    usedMainIngredients[mainIng] = (usedMainIngredients[mainIng] || 0) + 1;
                    usedCookingMethods.push(fallback.cookingMethod);
                    getProduceKeys(fallback).forEach(pk => usedProduces.add(pk));
                }
            }
        }
        const cleanSlots = slots.filter((s) => Boolean(s && s.dish)).map((s, idx) => ({
            ...s,
            slotIndex: idx
        }));
        const totalTime = this.calculateEstimatedTotalTime(cleanSlots.map(s => s.dish));
        const targetDateObj = new Date();
        if (targetDateDay === 'tomorrow') {
            targetDateObj.setDate(targetDateObj.getDate() + 1);
        }
        const m = targetDateObj.getMonth() + 1;
        const d = targetDateObj.getDate();
        const dateStr = formatLocalDate(targetDateObj);
        const dayLabel = targetDateDay === 'tomorrow' ? '明天' : '今天';
        const targetDateText = `${dayLabel} (${m}月${d}日)`;
        return {
            id: `menu_${Date.now()}`,
            mode,
            date: dateStr,
            targetDateDay,
            targetDateText,
            month: currentMonth,
            slots: cleanSlots,
            portionScale,
            portionLabel: portionScale >= 1.5 ? '两人午晚两餐（分量充足宽裕）' : '两人一餐适量',
            totalTimeMinutes: totalTime,
            createdAt: Date.now()
        };
    }
    replaceDish(slotIndex, currentMenu, currentMonth, preferences, history, allDishes) {
        const targetSlot = currentMenu.slots.find(s => s.slotIndex === slotIndex);
        if (!targetSlot)
            return currentMenu;
        let eligibleDishes = this.filterDishes(allDishes, preferences);
        if (currentMenu.mode === 'three_stir_fries') {
            const stirFriesOnly = eligibleDishes.filter(d => d.cookingMethod === 'stir_fry' || d.cookingMethod === 'clear_fry');
            if (stirFriesOnly.length >= 5) {
                eligibleDishes = stirFriesOnly;
            }
        }
        const scoredDishes = eligibleDishes.map(dish => ({
            dish,
            score: this.scoreDish(dish, currentMonth, preferences, history, currentMenu.mode)
        }));
        scoredDishes.sort((a, b) => b.score - a.score);
        const otherDishes = currentMenu.slots
            .filter(s => s.slotIndex !== slotIndex)
            .map(s => s.dish);
        const usedMainIngredients = {};
        const usedCookingMethods = [];
        const usedProduces = new Set();
        for (const d of otherDishes) {
            usedMainIngredients[d.mainIngredient] = (usedMainIngredients[d.mainIngredient] || 0) + 1;
            usedCookingMethods.push(d.cookingMethod);
            getProduceKeys(d).forEach(pk => usedProduces.add(pk));
        }
        // 防乒乓循环：累计当前槽位已替换排除过的菜品列表
        const prevExcluded = targetSlot.excludedDishIds || [];
        let excludedIds = [targetSlot.dish.id, ...prevExcluded, ...otherDishes.map(d => d.id)];
        let newDish = this.pickBestDishForRole(targetSlot.role, scoredDishes, excludedIds, usedMainIngredients, usedCookingMethods, usedProduces, currentMenu.mode === 'three_stir_fries');
        // 如果所有候选菜都被轮换完了，重置当前槽位的排除历史从头循环
        if (!newDish) {
            excludedIds = [targetSlot.dish.id, ...otherDishes.map(d => d.id)];
            newDish = this.pickBestDishForRole(targetSlot.role, scoredDishes, excludedIds, usedMainIngredients, usedCookingMethods, usedProduces, currentMenu.mode === 'three_stir_fries');
        }
        if (!newDish) {
            return currentMenu;
        }
        const updatedExcluded = [...new Set([...prevExcluded, targetSlot.dish.id])];
        const updatedSlots = currentMenu.slots.map(s => {
            if (s.slotIndex === slotIndex) {
                return {
                    ...s,
                    dish: newDish,
                    isLocked: false,
                    excludedDishIds: updatedExcluded
                };
            }
            return s;
        });
        return {
            ...currentMenu,
            slots: updatedSlots,
            totalTimeMinutes: this.calculateEstimatedTotalTime(updatedSlots.map(s => s.dish))
        };
    }
    manualSetSlotDish(slotIndex, dish, currentMenu) {
        const updatedSlots = currentMenu.slots.map(s => {
            if (s.slotIndex === slotIndex) {
                return {
                    ...s,
                    dish,
                    isLocked: true
                };
            }
            return s;
        });
        return {
            ...currentMenu,
            slots: updatedSlots,
            totalTimeMinutes: this.calculateEstimatedTotalTime(updatedSlots.map(s => s.dish))
        };
    }
    getTargetRolesByMode(mode) {
        switch (mode) {
            case 'hearty_3_1':
                return ['main_meat', 'secondary_meat', 'vegetable', 'soup'];
            case 'routine_2_1':
                return ['main_meat', 'vegetable', 'soup'];
            case 'three_dishes':
                return ['main_meat', 'secondary_meat', 'vegetable'];
            case 'three_stir_fries':
                return ['main_meat', 'secondary_meat', 'vegetable'];
            default:
                return ['main_meat', 'secondary_meat', 'vegetable', 'soup'];
        }
    }
    filterDishes(dishes, preferences) {
        return dishes.filter(dish => {
            if (!dish.enabled)
                return false;
            if (preferences.blockedDishIds?.includes(dish.id))
                return false;
            if (dish.spicyLevel > preferences.spicyLevel)
                return false;
            if (preferences.dislikedIngredients?.length > 0) {
                const containsDisliked = (dish.ingredients || []).some(ing => preferences.dislikedIngredients.some(disliked => {
                    if (disliked === '鱼/海鲜' || disliked === '海鲜' || disliked === '虾/海鲜') {
                        return ing.name.includes('虾') || ing.name.includes('鱼') || dish.mainIngredient?.includes('虾') || dish.mainIngredient?.includes('鱼');
                    }
                    if (disliked === '牛肉') {
                        return ing.name.includes('牛') || dish.mainIngredient?.includes('牛');
                    }
                    if (disliked === '鸡肉') {
                        return ing.name.includes('鸡') || dish.mainIngredient?.includes('鸡');
                    }
                    if (disliked === '内脏') {
                        return ing.name.includes('肠') || ing.name.includes('肝') || ing.name.includes('肚') || ing.name.includes('腰') || ing.name.includes('心');
                    }
                    return ing.name.includes(disliked) || disliked.includes(ing.name) || (dish.mainIngredient && dish.mainIngredient.includes(disliked));
                }));
                if (containsDisliked)
                    return false;
            }
            return true;
        });
    }
    scoreDish(dish, currentMonth, preferences, history, mode, relaxRate = 1.0) {
        const seasonScore = this.calculateSeasonScore(dish, currentMonth);
        const prefScore = this.calculatePreferenceScore(dish, preferences);
        // 动态保底：如果历史记录已很满，对惩罚做平滑补偿
        const rawPenalty = this.calculateHistoryPenalty(dish.id, history);
        const historyPenalty = 1.0 - (1.0 - rawPenalty) * relaxRate;
        const favoriteBoost = preferences.favoriteDishIds?.includes(dish.id) ? 1.2 : 1.0;
        const difficultyScore = dish.difficulty === 1 ? 1.1 : (dish.difficulty === 2 ? 1.0 : 0.9);
        const jitter = 0.95 + Math.random() * 0.1;
        let stirFriesBoost = 1.0;
        if (mode === 'three_stir_fries' && (dish.cookingMethod === 'stir_fry' || dish.cookingMethod === 'clear_fry')) {
            stirFriesBoost = 1.3;
        }
        const baseScore = (seasonScore * 0.30) +
            (prefScore * 0.20) +
            (historyPenalty * 0.25) +
            (difficultyScore * 0.10) +
            (dish.tags.includes('大厨拿手') ? 0.15 : 0.05);
        return baseScore * favoriteBoost * stirFriesBoost * jitter;
    }
    calculateSeasonScore(dish, currentMonth) {
        if (dish.bestMonths.includes(currentMonth))
            return 1.0;
        if (dish.availableMonths.includes(currentMonth))
            return 0.7;
        return 0.3;
    }
    calculatePreferenceScore(dish, preferences) {
        let score = 0.7;
        if (dish.spicyLevel === preferences.spicyLevel)
            score += 0.2;
        return Math.min(score, 1.0);
    }
    calculateHistoryPenalty(dishId, history) {
        if (!history || history.length === 0)
            return 1.0;
        const now = Date.now();
        let minDaysAgo = 999;
        for (const record of history) {
            if (record.dishIds.includes(dishId)) {
                const daysAgo = Math.floor((now - record.timestamp) / (1000 * 60 * 60 * 24));
                if (daysAgo < minDaysAgo) {
                    minDaysAgo = daysAgo;
                }
            }
        }
        if (minDaysAgo <= 3)
            return 0.1;
        if (minDaysAgo <= 7)
            return 0.4;
        if (minDaysAgo <= 14)
            return 0.7;
        return 1.0;
    }
    isCategoryMatchingRole(category, role) {
        switch (role) {
            case 'main_meat':
                return category === 'main_meat';
            case 'secondary_meat':
                return category === 'secondary_meat' || category === 'egg' || category === 'tofu';
            case 'egg_or_tofu':
                return category === 'egg' || category === 'tofu';
            case 'vegetable':
                return category === 'vegetable';
            case 'soup':
                return category === 'soup';
            default:
                return false;
        }
    }
    pickBestDishForRole(role, scoredDishes, excludedDishIds, usedMainIngredients, usedCookingMethods, usedProduces, forceStirFry = false) {
        const validCandidates = [];
        for (const item of scoredDishes) {
            const { dish } = item;
            if (excludedDishIds.includes(dish.id))
                continue;
            if (!this.isCategoryMatchingRole(dish.category, role))
                continue;
            if (forceStirFry && (dish.cookingMethod !== 'stir_fry' && dish.cookingMethod !== 'clear_fry')) {
                continue;
            }
            // 肉类主料最多 2 道
            const currentCount = usedMainIngredients[dish.mainIngredient] || 0;
            if (currentCount >= 2)
                continue;
            // 生鲜果蔬/豆制品同桌严禁重样 (杜绝丝瓜炒蛋 + 丝瓜汤、番茄炒蛋 + 番茄汤、土豆牛肉 + 土豆丝等撞菜)
            const pks = getProduceKeys(dish);
            if (pks.some(pk => usedProduces.has(pk)))
                continue;
            validCandidates.push(item);
        }
        if (validCandidates.length === 0) {
            // 兜底放宽蔬果限制
            const fallback = scoredDishes.find(item => !excludedDishIds.includes(item.dish.id) &&
                this.isCategoryMatchingRole(item.dish.category, role));
            return fallback?.dish;
        }
        // 采用加权随机抽样（分数 3 次幂放大优质菜品概率，同时赋予充沛多样性）
        const weights = validCandidates.map(c => Math.max(0.01, Math.pow(c.score, 3)));
        const totalWeight = weights.reduce((sum, w) => sum + w, 0);
        let rand = Math.random() * totalWeight;
        for (let i = 0; i < validCandidates.length; i++) {
            rand -= weights[i];
            if (rand <= 0) {
                return validCandidates[i].dish;
            }
        }
        return validCandidates[0].dish;
    }
    calculateEstimatedTotalTime(dishes) {
        if (dishes.length === 0)
            return 0;
        const maxTime = Math.max(...dishes.map(d => d.cookingTimeMinutes));
        return maxTime + (dishes.length - 1) * 5;
    }
}
export const menuRecommendationEngine = new MenuRecommendationEngine();
