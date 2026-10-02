import { cloudService } from './cloudService.js';
import type { FamilySpace, UserProfile } from '../types/family.js';

const STORAGE_KEY_USER = 'current_user_profile';
const STORAGE_KEY_FAMILY = 'current_family_space';

type FamilyChangeListener = (family: FamilySpace | null) => void;

class FamilyService {
  private currentUser: UserProfile = {
    openid: 'wx_user_default',
    nickName: '我',
    avatarUrl: '',
    familyId: null,
    role: null,
    createdAt: Date.now(),
    updatedAt: Date.now()
  };

  private currentFamily: FamilySpace | null = null;
  private listeners: Set<FamilyChangeListener> = new Set();
  private initialized = false;

  constructor() {
    this.restoreFromStorage();
  }

  public init(): void {
    if (this.initialized) return;
    this.restoreFromStorage();
    this.initialized = true;
  }

  private restoreFromStorage(): void {
    try {
      if (typeof wx !== 'undefined' && wx.getStorageSync) {
        const storedUser = wx.getStorageSync(STORAGE_KEY_USER);
        if (storedUser) {
          this.currentUser = { ...this.currentUser, ...storedUser };
        }
        const storedFam = wx.getStorageSync(STORAGE_KEY_FAMILY);
        if (storedFam) {
          this.currentFamily = storedFam;
        }
      }
    } catch (e) {
      console.warn('读取本地家庭缓存失败', e);
    }
  }

  private persist(): void {
    try {
      if (typeof wx !== 'undefined' && wx.setStorageSync) {
        wx.setStorageSync(STORAGE_KEY_USER, this.currentUser);
        if (this.currentFamily) {
          wx.setStorageSync(STORAGE_KEY_FAMILY, this.currentFamily);
        } else {
          wx.removeStorageSync(STORAGE_KEY_FAMILY);
        }
      }
    } catch (e) {
      console.warn('持久化本地家庭缓存失败', e);
    }
    this.notifyListeners();
  }

  public subscribe(listener: FamilyChangeListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notifyListeners(): void {
    for (const listener of this.listeners) {
      try {
        listener(this.currentFamily);
      } catch (err) {
        console.error('家庭状态订阅回调异常', err);
      }
    }
  }

  public getCurrentUser(): UserProfile {
    return this.currentUser;
  }

  public getCurrentFamily(): FamilySpace | null {
    return this.currentFamily;
  }

  public setMockCurrentUser(openid: string, nickName: string = '家人'): void {
    this.currentUser.openid = openid;
    this.currentUser.nickName = nickName;
    this.currentUser.familyId = null;
    this.currentUser.role = null;
    this.currentFamily = null;
    this.persist();
  }

  /**
   * 静默登录与鉴权同步
   */
  public async syncUserAuth(): Promise<UserProfile> {
    const res = await cloudService.callFunction('userAuth', {
      mockOpenid: this.currentUser.openid,
      nickName: this.currentUser.nickName,
      avatarUrl: this.currentUser.avatarUrl
    });

    if (res.success && res.user) {
      this.currentUser = {
        openid: res.openid || this.currentUser.openid,
        nickName: res.user.nickName || this.currentUser.nickName,
        avatarUrl: res.user.avatarUrl || '',
        familyId: res.user.familyId || null,
        role: res.user.role || null,
        createdAt: res.user.createdAt || Date.now(),
        updatedAt: res.user.updatedAt || Date.now()
      };
      if (res.family) {
        this.currentFamily = res.family;
      } else if (!this.currentUser.familyId) {
        this.currentFamily = null;
      }
      this.persist();
    }

    return this.currentUser;
  }

  /**
   * 1. 创建家庭空间
   */
  public async createFamily(name = '温馨小家食堂', nickName?: string): Promise<{ success: boolean; family?: FamilySpace; error?: string }> {
    const callerNick = nickName || this.currentUser.nickName || '房主';
    const res = await cloudService.callFunction('familyManage', {
      action: 'createFamily',
      mockOpenid: this.currentUser.openid,
      name,
      nickName: callerNick,
      avatarUrl: this.currentUser.avatarUrl
    });

    if (res.success && res.family) {
      this.currentFamily = res.family;
      this.currentUser.familyId = res.family.id || res.family._id;
      this.currentUser.role = 'creator';
      this.currentUser.nickName = callerNick;
      this.persist();
      return { success: true, family: res.family };
    }

    return { success: false, error: res.error || '创建家庭空间失败' };
  }

  /**
   * 2. 口令加入家庭 (云端事务，上限 4 人，一人一家庭互斥)
   */
  public async joinFamily(inviteCode: string, nickName?: string): Promise<{ success: boolean; family?: FamilySpace; error?: string }> {
    const code = inviteCode.trim();
    if (!code || code.length !== 6) {
      return { success: false, error: '请输入正确的6位数字邀请码' };
    }

    const callerNick = nickName || this.currentUser.nickName || '家人';
    const res = await cloudService.callFunction('familyManage', {
      action: 'joinFamily',
      mockOpenid: this.currentUser.openid,
      inviteCode: code,
      nickName: callerNick,
      avatarUrl: this.currentUser.avatarUrl
    });

    if (res.success && res.family) {
      this.currentFamily = res.family;
      this.currentUser.familyId = res.family.id || res.family._id;
      this.currentUser.role = 'member';
      this.currentUser.nickName = callerNick;
      this.persist();
      return { success: true, family: res.family };
    }

    return { success: false, error: res.error || '加入家庭空间失败' };
  }

  /**
   * 3. 退出 / 解散家庭
   */
  public async leaveFamily(): Promise<{ success: boolean; error?: string }> {
    const res = await cloudService.callFunction('familyManage', {
      action: 'leaveFamily',
      mockOpenid: this.currentUser.openid
    });

    if (res.success) {
      this.currentUser.familyId = null;
      this.currentUser.role = null;
      this.currentFamily = null;
      this.persist();
      return { success: true };
    }

    return { success: false, error: res.error || '退出家庭失败' };
  }

  /**
   * 4. 刷新 24 小时动态口令
   */
  public async refreshInviteCode(): Promise<{ success: boolean; inviteCode?: string; error?: string }> {
    if (!this.currentFamily) {
      return { success: false, error: '尚未加入家庭' };
    }

    const res = await cloudService.callFunction('familyManage', {
      action: 'refreshInviteCode',
      mockOpenid: this.currentUser.openid,
      familyId: this.currentFamily.id || (this.currentFamily as any)._id
    });

    if (res.success && res.inviteCode) {
      this.currentFamily.inviteCode = res.inviteCode;
      this.currentFamily.inviteExpiredAt = res.inviteExpiredAt;
      this.persist();
      return { success: true, inviteCode: res.inviteCode };
    }

    return { success: false, error: res.error || '刷新邀请码失败' };
  }
}

export const familyService = new FamilyService();
