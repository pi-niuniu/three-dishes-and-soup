import { dataProvider } from '../../../services/dataProvider.js';
Page({
    data: {
        dishName: '',
        selectedCategory: 'secondary_meat',
        categoryOptions: [
            { key: 'main_meat', label: '主荤 (硬菜/炖肉)', icon: '🥩' },
            { key: 'secondary_meat', label: '副荤 (家常小炒)', icon: '🥘' },
            { key: 'vegetable', label: '素菜 (时蔬/菌菇)', icon: '🥬' },
            { key: 'soup', label: '靓汤 (养胃暖汤)', icon: '🍲' },
            { key: 'staple_sauce', label: '主食 (面饭炒饭)', icon: '🍚' }
        ],
        selectedTastes: ['家常'],
        tasteOptions: ['家常', '清淡', '咸鲜', '微辣', '酸甜', '浓郁'],
        selectedTime: 25,
        timeOptions: [
            { minutes: 15, label: '15分钟 (快手)' },
            { minutes: 25, label: '25分钟 (适中)' },
            { minutes: 40, label: '40分钟 (慢火)' },
            { minutes: 60, label: '60分钟 (功夫)' }
        ],
        submitting: false
    },
    handleNameInput(e) {
        const val = (e?.detail?.value || '').slice(0, 20);
        this.setData({ dishName: val });
    },
    selectCategory(e) {
        const cat = e?.currentTarget?.dataset?.cat;
        if (cat) {
            this.setData({ selectedCategory: cat });
        }
    },
    toggleTaste(e) {
        const taste = e?.currentTarget?.dataset?.taste;
        if (!taste)
            return;
        let list = [...this.data.selectedTastes];
        if (list.includes(taste)) {
            if (list.length > 1) {
                list = list.filter(t => t !== taste);
            }
        }
        else {
            if (list.length < 3) {
                list.push(taste);
            }
            else {
                wx.showToast({ title: '最多选择3个口味标签', icon: 'none' });
                return;
            }
        }
        this.setData({ selectedTastes: list });
    },
    selectTime(e) {
        const minutes = Number(e?.currentTarget?.dataset?.minutes) || 25;
        this.setData({ selectedTime: minutes });
    },
    async handleSubmit() {
        const name = this.data.dishName.trim();
        if (!name) {
            wx.showToast({ title: '请输入菜品名称', icon: 'none' });
            return;
        }
        if (name.length > 20) {
            wx.showToast({ title: '菜名最多20个字', icon: 'none' });
            return;
        }
        // 前端敏感词初筛 (易错点 7 防御)
        const sensitiveWords = ['违禁', '敏感', '广告', '赌博', '涉黄'];
        if (sensitiveWords.some(w => name.includes(w))) {
            wx.showModal({
                title: '提示',
                content: '菜品名称包含敏感内容，请修改后重试',
                showCancel: false,
                confirmColor: '#E6683B'
            });
            return;
        }
        this.setData({ submitting: true });
        wx.showLoading({ title: '正在录入...' });
        try {
            await dataProvider.addCustomDish({
                name,
                category: this.data.selectedCategory,
                taste: this.data.selectedTastes,
                cookingTimeMinutes: this.data.selectedTime,
                tags: ['自选私房菜', '纯文字录入']
            });
            wx.hideLoading();
            wx.showToast({ title: '添加私房菜成功！', icon: 'success' });
            setTimeout(() => {
                wx.navigateBack();
            }, 1000);
        }
        catch (err) {
            wx.hideLoading();
            this.setData({ submitting: false });
            wx.showToast({ title: err?.message || '添加失败，请重试', icon: 'none' });
        }
    }
});
