import { preferenceService } from '../../services/preferenceService.js';
import { historyService } from '../../services/historyService.js';
import { familyService, cleanInviteCode } from '../../services/familyService.js';
import { dataProvider } from '../../services/dataProvider.js';
import { UserPreferences } from '../../types/user.js';
import { MealMode } from '../../types/menu.js';
import { FamilySpace, UserProfile } from '../../types/family.js';

Page({
  data: {
    version: '2.12',
    preferences: {} as UserPreferences,
    dislikedMap: {} as Record<string, boolean>,
    spicyLevels: [
      { level: 0, label: '不吃辣' },
      { level: 1, label: '微辣' },
      { level: 2, label: '中辣' },
      { level: 3, label: '重辣' }
    ],
    commonAvoids: ['鱼/海鲜', '牛肉', '鸡肉', '韭菜', '香菜', '苦瓜', '生姜', '大蒜', '内脏', '羊肉'],
    availableModes: [
      { key: 'hearty_3_1', name: '3 菜 1 汤' },
      { key: 'routine_2_1', name: '2 菜 1 汤' },
      { key: 'three_dishes', name: '3 个菜' },
      { key: 'three_stir_fries', name: '3 个炒菜' }
    ],

    // 家庭厨房相关状态
    currentUser: {} as UserProfile,
    family: null as FamilySpace | null,
    joinCodeInput: '',
    newFamilyNameInput: '',
    isCreatingFamily: false,
    isJoiningFamily: false,
    familySyncWarning: '',
    isRetryingSync: false
  },
  isSubmittingCreate: false,
  isSubmittingJoin: false,

  onShow() {
    const app = getApp<any>();
    if (app?.globalData?.version) {
      this.setData({ version: app.globalData.version });
    }
    this.loadPreferences();
    this.loadFamilyState();

    // 静默鉴权并同步最新家庭档案
    familyService.syncUserAuth().then(() => {
      this.loadFamilyState();
    }).catch(() => {});
  },

  loadPreferences() {
    const pref = preferenceService.getPreferences();
    const map: Record<string, boolean> = {};
    (pref.dislikedIngredients || []).forEach(item => {
      map[item] = true;
    });

    this.setData({
      preferences: pref,
      dislikedMap: map
    });
  },

  loadFamilyState() {
    familyService.init();
    const user = familyService.getCurrentUser();
    const fam = familyService.getCurrentFamily();
    this.setData({
      currentUser: user,
      family: fam,
      familySyncWarning: fam ? (familyService.getCloudSyncError() || '') : ''
    });
  },

  handleJoinCodeInput(e: any) {
    const raw = e?.detail?.value || '';
    const cleaned = cleanInviteCode(raw);
    this.setData({
      joinCodeInput: cleaned
    });
    return cleaned;
  },

  handleFamilyNameInput(e: any) {
    this.setData({
      newFamilyNameInput: (e?.detail?.value || '').trim()
    });
  },

  formatErrorTip(err?: any): string {
    if (!err) return '操作失败，请重试';
    const errStr = typeof err === 'string'
      ? err
      : String(err?.errMsg || err?.message || (typeof err === 'object' ? JSON.stringify(err) : err) || '');
    if (errStr.includes('-601034') || errStr.includes('Environment not found')) {
      return '云开发环境未就绪，请检查云环境配置后重试';
    }
    if (errStr.includes('cloud.callFunction:fail')) {
      return '服务连接异常，请重试';
    }
    if (
      errStr.includes('-501007') ||
      errStr.includes('document.set:fail') ||
      errStr.includes('document.update:fail') ||
      errStr.includes('invalid parameters') ||
      errStr.includes('不能指定') ||
      errStr.includes('保留字段') ||
      errStr.includes('cannot update _id')
    ) {
      return '数据服务同步异常，请稍后重试';
    }
    return errStr;
  },

  async handleCreateFamily() {
    if (this.isSubmittingCreate || this.data.isCreatingFamily) return;
    this.isSubmittingCreate = true;
    this.setData({ isCreatingFamily: true });

    try {
      const name = this.data.newFamilyNameInput || '温馨小家食堂';
      wx.showLoading({ title: '创建中...' });
      const res = await familyService.createFamily(name);
      wx.hideLoading();

      if (res.success && res.family) {
        this.setData({
          family: res.family,
          currentUser: familyService.getCurrentUser(),
          newFamilyNameInput: ''
        });
        wx.showToast({ title: '家庭厨房创建成功！', icon: 'success' });
        // 同步家庭历史与自选私房菜
        historyService.syncCloudHistory().catch(() => {});
        dataProvider.syncCloudCustomDishes().catch(() => {});
      } else {
        wx.showToast({ title: this.formatErrorTip(res.error), icon: 'none' });
      }
    } finally {
      this.isSubmittingCreate = false;
      this.setData({ isCreatingFamily: false });
    }
  },

  async handleJoinFamily() {
    if (this.isSubmittingJoin || this.data.isJoiningFamily) return;

    const raw = this.data.joinCodeInput;
    const code = cleanInviteCode(raw);
    if (!code || code.length !== 6) {
      wx.showToast({ title: '请输入6位有效数字口令', icon: 'none' });
      return;
    }

    this.isSubmittingJoin = true;
    this.setData({ isJoiningFamily: true });

    try {
      wx.showLoading({ title: '正在加入...' });
      const res = await familyService.joinFamily(code);
      wx.hideLoading();

      if (res.success && res.family) {
        this.setData({
          family: res.family,
          currentUser: familyService.getCurrentUser(),
          joinCodeInput: ''
        });
        wx.showToast({ title: '成功加入家庭厨房！', icon: 'success' });
        // 同步家庭共享历史与自选私房菜
        historyService.syncCloudHistory().catch(() => {});
        dataProvider.syncCloudCustomDishes().catch(() => {});
      } else {
        wx.showToast({ title: this.formatErrorTip(res.error), icon: 'none' });
      }
    } finally {
      this.isSubmittingJoin = false;
      this.setData({ isJoiningFamily: false });
    }
  },

  async handleRetryCloudSync() {
    if (this.data.isRetryingSync) return;
    this.setData({ isRetryingSync: true });
    try {
      wx.showLoading({ title: '同步到云端...' });
      const res = await familyService.retryCloudSync();
      wx.hideLoading();
      this.loadFamilyState();
      if (res.success) {
        wx.showToast({ title: '已同步，家人可凭口令加入', icon: 'none' });
      } else {
        wx.showToast({ title: this.formatErrorTip(res.error), icon: 'none' });
      }
    } finally {
      this.setData({ isRetryingSync: false });
    }
  },

  handleCopyInviteCode() {
    const code = String(this.data.family?.inviteCode || '').trim();
    if (!code) return;
    wx.setClipboardData({
      data: code,
      success: () => {
        wx.showToast({ title: '口令已复制，发给家人即可加入', icon: 'none' });
      }
    });
  },

  async handleRefreshInviteCode() {
    wx.showLoading({ title: '刷新口令...' });
    const res = await familyService.refreshInviteCode();
    wx.hideLoading();
    if (res.success && res.inviteCode) {
      this.setData({ family: familyService.getCurrentFamily() });
      wx.showToast({ title: '已生成新口令（24h有效）', icon: 'none' });
    } else {
      wx.showToast({ title: this.formatErrorTip(res.error || '刷新失败'), icon: 'none' });
    }
  },

  handleLeaveFamily() {
    const isCreator = this.data.currentUser?.role === 'creator';
    wx.showModal({
      title: isCreator ? '解散/退出家庭厨房？' : '退出家庭厨房？',
      content: isCreator 
        ? '退出后若还有其他成员，房主将顺延转交；若无其他成员则空间将自动解散。' 
        : '退出后将无法查看家庭共享做菜历史与自选私房菜，确定退出吗？',
      confirmColor: '#E6683B',
      success: async (res) => {
        if (res.confirm) {
          wx.showLoading({ title: '正在退出...' });
          const leaveRes = await familyService.leaveFamily();
          wx.hideLoading();
          if (leaveRes.success) {
            // 清理本地家庭历史与私房菜，安全恢复单人纯净模式
            historyService.clearHistory();
            dataProvider.clearCustomDishes();
            // 恢复单人 personal_${openid} 隔离桶私房菜
            dataProvider.syncCloudCustomDishes().catch(() => {});
            this.setData({
              family: null,
              currentUser: familyService.getCurrentUser()
            });
            wx.showToast({ title: '已退出家庭厨房', icon: 'none' });
          } else {
            wx.showToast({ title: this.formatErrorTip(leaveRes.error || '退出失败'), icon: 'none' });
          }
        }
      }
    });
  },

  setSpicyLevel(e: any) {
    const level = e.currentTarget.dataset.level as number;
    const updated = preferenceService.savePreferences({ spicyLevel: level as any });
    this.setData({ preferences: updated });
    wx.showToast({ title: '辣度已更新', icon: 'none' });
  },

  toggleAvoid(e: any) {
    const item = e.currentTarget.dataset.item as string;
    const current = this.data.preferences.dislikedIngredients || [];
    let updatedList: string[];

    if (current.includes(item)) {
      updatedList = current.filter(i => i !== item);
    } else {
      updatedList = [...current, item];
    }

    const updated = preferenceService.savePreferences({ dislikedIngredients: updatedList });
    const map: Record<string, boolean> = {};
    updatedList.forEach(k => { map[k] = true; });

    this.setData({
      preferences: updated,
      dislikedMap: map
    });
  },

  setDefaultMode(e: any) {
    const key = e.currentTarget.dataset.key as MealMode;
    const updated = preferenceService.savePreferences({ defaultMode: key });
    this.setData({ preferences: updated });
    wx.showToast({ title: '默认模式已更新', icon: 'none' });
  },

  handleClearHistory() {
    wx.showModal({
      title: '清空就餐历史？',
      content: '清空后算法防重将重新从今天开始计算。',
      confirmColor: '#E6683B',
      success: (res) => {
        if (res.confirm) {
          historyService.clearHistory();
          wx.showToast({ title: '已清空历史', icon: 'none' });
        }
      }
    });
  }
});
