export class ShoppingListService {
    generateShoppingList(dishes, portionScale = 1.8) {
        const ingredientMap = {};
        const pantryNames = ['大蒜', '生姜', '香葱', '蒜苗', '大葱'];
        for (const dish of dishes) {
            if (!dish || !dish.ingredients)
                continue;
            for (const item of dish.ingredients) {
                const canonicalName = this.normalizeIngredientName(item.name);
                // 对常见佐料使用纯食材名作为聚合 key，避免 "大蒜 15g" 与 "大蒜 适量" 拆裂为两项
                const key = pantryNames.includes(canonicalName) ? canonicalName : `${canonicalName}_${item.unit}`;
                if (!ingredientMap[key]) {
                    ingredientMap[key] = {
                        name: canonicalName,
                        totalAmount: 0,
                        unit: item.unit,
                        displayAmount: '',
                        sourceDishes: [],
                        checked: false
                    };
                }
                const scaled = this.scaleIngredientAmount(item.amount, item.unit, portionScale);
                ingredientMap[key].totalAmount += scaled;
                if (!ingredientMap[key].sourceDishes.includes(dish.name)) {
                    ingredientMap[key].sourceDishes.push(dish.name);
                }
            }
        }
        const result = Object.values(ingredientMap);
        for (const item of result) {
            // 菜市场口语化优先处理
            if (['空心菜', '生菜', '油麦菜', '菠菜', '茼蒿', '南瓜尖', '豌豆尖', '上海青', '小白菜', '油菜'].includes(item.name)) {
                const bunches = Math.max(1, Math.round(item.totalAmount / 500));
                item.displayAmount = bunches === 1 ? '1 把 (约 1 斤)' : `${bunches} 把 (约 ${bunches} 斤)`;
            }
            else if (item.name.includes('豆腐')) {
                const boxes = Math.max(1, Math.round(item.totalAmount / 400));
                item.displayAmount = boxes === 1 ? '1 盒 (或 1 块)' : `${boxes} 盒 (或 ${boxes} 块)`;
            }
            else if (item.name === '大蒜' || item.name === '蒜瓣') {
                item.displayAmount = '1 头 (适量)';
            }
            else if (item.name === '生姜') {
                item.displayAmount = '1 块 (适量)';
            }
            else if (item.name === '香葱' || item.name === '小葱') {
                item.displayAmount = '1 小把';
            }
            else if (item.name === '蒜苗' || item.name === '大葱') {
                item.displayAmount = '1 小捆 (或 2 根)';
            }
            else if (item.unit === 'g') {
                const roundedG = Math.ceil(item.totalAmount / 50) * 50;
                item.displayAmount = this.formatGramsToJinLiang(roundedG);
            }
            else if (['个', '根', '条', '块', '盒', '袋', '只'].includes(item.unit)) {
                const roundedCount = Math.ceil(item.totalAmount);
                item.displayAmount = `${roundedCount} ${item.unit}`;
            }
            else if (item.unit === '适量' || item.unit === '少许') {
                item.displayAmount = '适量';
            }
            else {
                item.displayAmount = `${Math.ceil(item.totalAmount)} ${item.unit}`;
            }
        }
        return result;
    }
    /**
     * 将克数转换为菜市场口语化斤两（如“1斤2两”、“9两”、“半斤”、“1斤半”）
     */
    formatGramsToJinLiang(roundedG) {
        if (roundedG <= 0)
            return '适量';
        if (roundedG < 50)
            return `约 ${roundedG}g`;
        let jin = Math.floor(roundedG / 500);
        const remG = roundedG % 500;
        let liang = Math.round(remG / 50);
        // 进位处理：如果余数四舍五入到 10 两，直接向前进 1 斤，杜绝“10两”非口语化表述
        if (liang === 10) {
            jin += 1;
            liang = 0;
        }
        let jinLiangStr = '';
        if (jin === 0) {
            if (liang === 5) {
                jinLiangStr = '半斤';
            }
            else {
                jinLiangStr = `${liang} 两`;
            }
        }
        else {
            if (liang === 0) {
                jinLiangStr = `${jin} 斤`;
            }
            else if (liang === 5) {
                jinLiangStr = `${jin} 斤半`;
            }
            else {
                jinLiangStr = `${jin} 斤 ${liang} 两`;
            }
        }
        return `${jinLiangStr} (约 ${roundedG}g)`;
    }
    /**
     * 生成给做饭大厨的微信复制文本模板 (带做饭叮嘱与买菜特别交代)
     */
    generateTextForCook(menu, dishes) {
        const dayLabel = menu.targetDateText || menu.date;
        const dishListText = dishes
            .map((d, idx) => `${idx + 1}. ${d.name} (${d.taste?.slice(0, 2).join('·') || '家常'})`)
            .join('\n');
        const shoppingList = this.generateShoppingList(dishes, menu.portionScale || 1.8);
        const isPantry = (name) => ['葱', '姜', '蒜', '油', '酱', '醋', '料酒', '花椒', '干辣椒'].some(k => name.includes(k));
        const mainItems = shoppingList.filter(i => !isPantry(i.name));
        const pantryItems = shoppingList.filter(i => isPantry(i.name));
        const shoppingText = [...mainItems, ...pantryItems]
            .map(i => `• ${i.name}: ${i.displayAmount}`)
            .join('\n');
        let cookNotesText = '';
        if (menu.cookNotes && menu.cookNotes.trim()) {
            cookNotesText = `\n📝 给大厨的做饭叮嘱：${menu.cookNotes.trim()}`;
        }
        let shoppingNotesText = '';
        if (menu.shoppingNotes && menu.shoppingNotes.trim()) {
            shoppingNotesText = `\n📝 给大厨的买菜特别交代：${menu.shoppingNotes.trim()}`;
        }
        return `大厨好！这是【${dayLabel}】做饭菜单（两人吃午晚两顿，菜量充足）：

🍳 今日做饭：
${dishListText}${cookNotesText}

------------------
🛒 买菜清单：
${shoppingText}${shoppingNotesText}

💡 提示：绿叶青菜建议中午吃完，肉菜晚上热热吃依然很香！
辛苦大厨啦~`;
    }
    /**
     * 紧凑序列化菜单，将庞大的 TableMenu 压缩为 <800 字符的 URL 安全字符串，彻底规避微信 path 长度超限
     */
    serializeMenuForShare(menu) {
        const payload = {
            id: menu.id,
            m: menu.mode,
            d: menu.targetDateText || '明天',
            dt: menu.date,
            s: menu.portionScale || 1.8,
            dishes: (menu.slots || []).map(s => {
                const d = s.dish;
                if (d.id && !d.id.startsWith('custom_')) {
                    return { id: d.id, name: d.name };
                }
                return {
                    name: d.name,
                    cat: d.category,
                    taste: d.taste?.slice(0, 2),
                    time: d.cookingTimeMinutes,
                    custom: true
                };
            })
        };
        if (menu.cookNotes && menu.cookNotes.trim()) {
            payload.cn = menu.cookNotes.trim();
        }
        if (menu.shoppingNotes && menu.shoppingNotes.trim()) {
            payload.sn = menu.shoppingNotes.trim();
        }
        return encodeURIComponent(JSON.stringify(payload));
    }
    /**
     * 解码并还原分享菜单，支持紧凑格式与旧版全量格式向下兼容
     */
    deserializeSharedMenu(encodedData, allDishes) {
        if (!encodedData)
            return null;
        try {
            const decoded = decodeURIComponent(encodedData);
            const parsed = JSON.parse(decoded);
            // 紧凑格式还原
            if (parsed.dishes && Array.isArray(parsed.dishes)) {
                const dishMap = new Map(allDishes.map(d => [d.id, d]));
                const reconstructedSlots = parsed.dishes.map((item, idx) => {
                    let dish;
                    if (item.id && dishMap.has(item.id)) {
                        dish = dishMap.get(item.id);
                    }
                    else {
                        // 自定义菜或未知菜品保底构造
                        dish = {
                            id: item.id || `custom_${Date.now()}_${idx}`,
                            name: item.name,
                            category: item.cat || 'secondary_meat',
                            cookingMethod: 'stir_fry',
                            taste: item.taste || ['家常特色'],
                            spicyLevel: 1,
                            ingredients: [
                                { name: item.name, amount: 200, unit: 'g', isMain: true },
                                { name: '大蒜', amount: 1, unit: '适量' }
                            ],
                            mainIngredient: item.name,
                            bestMonths: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
                            availableMonths: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
                            regions: ['川渝', '全国'],
                            cookingTimeMinutes: item.time || 20,
                            difficulty: 1,
                            estimatedCostLevel: 2,
                            recommendedForTwo: true,
                            tags: ['私房特色'],
                            enabled: true
                        };
                    }
                    return {
                        slotIndex: idx,
                        role: dish?.category || 'secondary_meat',
                        dish: dish,
                        isLocked: false
                    };
                });
                return {
                    id: parsed.id || `menu_${Date.now()}`,
                    mode: parsed.m || 'hearty_3_1',
                    date: parsed.dt || new Date().toISOString().slice(0, 10),
                    targetDateDay: parsed.d?.includes('今天') ? 'today' : 'tomorrow',
                    targetDateText: parsed.d || '明天',
                    month: new Date().getMonth() + 1,
                    slots: reconstructedSlots,
                    portionScale: parsed.s || 1.8,
                    portionLabel: (parsed.s || 1.8) >= 1.5 ? '两人午晚两餐（分量充足宽裕）' : '两人一餐适量',
                    totalTimeMinutes: reconstructedSlots.reduce((max, s) => Math.max(max, s.dish.cookingTimeMinutes || 20), 20) + (reconstructedSlots.length - 1) * 5,
                    cookNotes: parsed.cn || '',
                    shoppingNotes: parsed.sn || '',
                    createdAt: Date.now()
                };
            }
            // 旧版全量格式直接兼容
            if (parsed.slots && Array.isArray(parsed.slots)) {
                return parsed;
            }
            return null;
        }
        catch (e) {
            console.error('反序列化分享菜单失败:', e);
            return null;
        }
    }
    scaleIngredientAmount(amount, unit, scale) {
        if (unit === '适量' || unit === '少许')
            return amount;
        return amount * scale;
    }
    normalizeIngredientName(rawName) {
        if (['猪里脊', '五花肉', '五花肉片', '猪瘦肉', '后腿肉', '猪肉片', '猪里脊肉片', '猪肉馅'].includes(rawName))
            return '猪肉';
        if (['肋排', '排骨'].includes(rawName))
            return '排骨';
        if (['牛腩', '牛肉馅'].includes(rawName))
            return '牛肉';
        if (['鲜活鲈鱼', '鲈鱼', '草鱼', '黑鱼片'].includes(rawName))
            return '鲜鱼';
        if (['基围虾', '鲜虾', '大虾', '鲜虾仁'].includes(rawName))
            return '鲜虾';
        if (['鸡胸肉', '鸡腿肉', '琵琶腿', '土鸡块'].includes(rawName))
            return '鸡肉';
        if (['大蒜', '蒜瓣', '蒜末', '蒜粒'].includes(rawName))
            return '大蒜';
        if (['生姜', '姜片', '姜丝'].includes(rawName))
            return '生姜';
        if (['小葱', '香葱', '葱花'].includes(rawName))
            return '香葱';
        if (['青蒜苗', '蒜苗'].includes(rawName))
            return '蒜苗';
        if (['黑木耳', '木耳'].includes(rawName))
            return '木耳';
        if (['散花菜', '有机花菜'].includes(rawName))
            return '花菜';
        if (['圆茄子', '茄子'].includes(rawName))
            return '茄子';
        if (['薄皮青椒', '青椒'].includes(rawName))
            return '青椒';
        if (['去壳板栗', '板栗'].includes(rawName))
            return '板栗';
        if (['免洗紫菜', '紫菜'].includes(rawName))
            return '紫菜';
        if (['铁棍山药', '山药'].includes(rawName))
            return '山药';
        return rawName;
    }
}
export const shoppingListService = new ShoppingListService();
