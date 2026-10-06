import { cloudService } from './cloudService.js';
import type { FamilySpace, UserProfile } from '../types/family.js';

const STORAGE_KEY_USER = 'current_user_profile';
const STORAGE_KEY_FAMILY = 'current_family_space';

type FamilyChangeListener = (family: FamilySpace | null) => void;

/**
 * 规范化 6 位家庭邀请口令：过滤空白、符号，兼容全角数字与复制带前后缀的文本
 */
export function cleanInviteCode(input: any): string {
  if (!input) return '';
  let str = String(input).trim();
  // 全角数字转换为半角 (０-９ -> 0-9)
  str = str.replace(/[\uFF10-\uFF19]/g, ch => String.fromCharCode(ch.charCodeAt(0) - 0xFEE0));
  // 提取纯数字
  const digits = str.replace(/\D/g, '');
  if (digits.length === 6) return digits;
  if (digits.length > 6) {
    const match = str.match(/\b\d{6}\b/) || str.match(/\d{6}/);
    if (match) return match[0];
  }
  return digits.slice(0, 6);
}

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
  // 创建/加入/退出等写操作序号，用于丢弃写操作期间发出的过期鉴权响应
  private mutationSeq = 0;
  private authSeq = 0;
  private cloudSyncError: string | null = null;

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
   * 云端补传失败时的提示（房主界面展示，避免口令只存在本机却毫无感知）
   */
  public getCloudSyncError(): string | null {
    return this.cloudSyncError;
  }

  private getFamilyId(family: FamilySpace | null): string | null {
    if (!family) return null;
    return family.id || (family as any)._id || null;
  }

  /**
   * 旧版本降级模式下只建在本机的家庭：房主本人创建、只有房主一人、从未被云端确认过
   */
  private isLegacyLocalOnlyFamily(family: FamilySpace | null, prevRole: string | null, openid: string): boolean {
    if (!family || family.syncedToCloud) return false;
    const isCreator = prevRole === 'creator' ||
      [openid, 'wx_user_default', 'mock_openid_default'].includes(family.creatorOpenid);
    return isCreator && (family.memberOpenids || []).length <= 1;
  }

  /**
   * 静默登录与鉴权同步
   */
  public async syncUserAuth(): Promise<UserProfile> {
    const authSeq = ++this.authSeq;
    const mutationSeqAtStart = this.mutationSeq;

    const res = await cloudService.callFunction('userAuth', {
      mockOpenid: this.currentUser.openid,
      nickName: this.currentUser.nickName,
      avatarUrl: this.currentUser.avatarUrl
    });

    // 请求期间发生过创建/加入/退出，或已有更新的鉴权请求：丢弃这次过期响应，防止把刚加入的家庭清掉
    if (authSeq !== this.authSeq || mutationSeqAtStart !== this.mutationSeq) {
      return this.currentUser;
    }
    if (!res.success || !res.user) {
      return this.currentUser;
    }

    const openid = res.openid || this.currentUser.openid;
    const prevRole = this.currentUser.role;
    const prevFamily = this.currentFamily;
    const fromCloud = !res.isLocalFallback;

    this.currentUser = {
      openid,
      nickName: res.user.nickName || this.currentUser.nickName,
      avatarUrl: res.user.avatarUrl || '',
      familyId: res.user.familyId || null,
      role: res.user.role || (res.family ? (res.family.creatorOpenid === openid ? 'creator' : 'member') : null),
      createdAt: res.user.createdAt || Date.now(),
      updatedAt: res.user.updatedAt || Date.now()
    };

    if (res.family) {
      this.currentFamily = fromCloud ? { ...res.family, syncedToCloud: true } : res.family;
      this.cloudSyncError = null;
    } else if (this.currentUser.familyId) {
      // 云端仍有归属但本次未拉到家庭详情（瞬时异常）：保留本地缓存
      if (prevFamily && this.getFamilyId(prevFamily) === this.currentUser.familyId) {
        this.currentFamily = prevFamily;
        this.currentUser.role = this.currentUser.role || prevRole;
      } else {
        this.currentFamily = null;
      }
    } else if (fromCloud && this.isLegacyLocalOnlyFamily(prevFamily, prevRole, openid)) {
      // 云端没有该家庭，但本机有旧版本降级模式创建的家庭：补传云端，确保家人凭口令可加入
      this.currentFamily = prevFamily;
      this.currentUser.familyId = this.getFamilyId(prevFamily);
      this.currentUser.role = 'creator';
      this.persist();
      await this.pushLocalFamilyToCloud(prevFamily as FamilySpace);
      return this.currentUser;
    } else {
      this.currentFamily = null;
      this.cloudSyncError = null;
    }
    this.persist();

    return this.currentUser;
  }

  /**
   * 将本机家庭补传到云端（沿用原 familyId 与口令，云端口令冲突时会换新口令）
   */
  private async pushLocalFamilyToCloud(family: FamilySpace): Promise<boolean> {
    const mutationSeqAtStart = this.mutationSeq;
    const res = await cloudService.callFunction('familyManage', {
      action: 'createFamily',
      _syncToCloud: true,
      mockOpenid: this.currentUser.openid,
      familyId: this.getFamilyId(family),
      name: family.name,
      inviteCode: family.inviteCode,
      inviteExpiredAt: family.inviteExpiredAt,
      nickName: this.currentUser.nickName,
      avatarUrl: this.currentUser.avatarUrl
    });

    if (mutationSeqAtStart !== this.mutationSeq) return false;

    if (res.success && res.family && !res.isLocalFallback) {
      const openid = res.openid || this.currentUser.openid;
      this.currentFamily = { ...res.family, syncedToCloud: true };
      this.currentUser.openid = openid;
      this.currentUser.familyId = this.getFamilyId(res.family);
      this.currentUser.role = res.family.creatorOpenid === openid ? 'creator' : 'member';
      this.cloudSyncError = null;
      this.persist();
      return true;
    }

    this.cloudSyncError = `口令未同步到云端，家人暂时无法加入（${res.error || '云端未响应'}）`;
    this.persist();
    return false;
  }

  /**
   * 手动重试把当前家庭同步到云端
   */
  public async retryCloudSync(): Promise<{ success: boolean; error?: string }> {
    if (!this.currentFamily) {
      return { success: false, error: '尚未加入家庭' };
    }
    const ok = await this.pushLocalFamilyToCloud(this.currentFamily);
    return ok ? { success: true } : { success: false, error: this.cloudSyncError || '同步失败' };
  }

  /**
   * 1. 创建家庭空间
   */
  public async createFamily(name = '温馨小家食堂', nickName?: string): Promise<{ success: boolean; family?: FamilySpace; error?: string }> {
    const callerNick = nickName || this.currentUser.nickName || '房主';
    this.mutationSeq++;
    const res = await cloudService.callFunction('familyManage', {
      action: 'createFamily',
      mockOpenid: this.currentUser.openid,
      name,
      nickName: callerNick,
      avatarUrl: this.currentUser.avatarUrl
    });
    this.mutationSeq++;

    if (res.success && res.family) {
      this.currentFamily = res.isLocalFallback ? res.family : { ...res.family, syncedToCloud: true };
      if (res.openid) {
        this.currentUser.openid = res.openid;
      }
      this.currentUser.familyId = this.getFamilyId(res.family);
      this.currentUser.role = 'creator';
      this.currentUser.nickName = callerNick;
      this.cloudSyncError = null;
      this.persist();
      return { success: true, family: this.currentFamily };
    }

    return { success: false, error: res.error || '创建家庭空间失败' };
  }

  /**
   * 2. 口令加入家庭 (云端事务，上限 4 人，一人一家庭互斥)
   */
  public async joinFamily(inviteCode: string | number, nickName?: string): Promise<{ success: boolean; family?: FamilySpace; error?: string }> {
    const code = cleanInviteCode(inviteCode);
    if (!code || code.length !== 6) {
      return { success: false, error: '请输入正确的6位数字邀请码' };
    }

    const callerNick = nickName || this.currentUser.nickName || '家人';
    this.mutationSeq++;
    const res = await cloudService.callFunction('familyManage', {
      action: 'joinFamily',
      mockOpenid: this.currentUser.openid,
      inviteCode: code,
      nickName: callerNick,
      avatarUrl: this.currentUser.avatarUrl
    });
    this.mutationSeq++;

    if (res.success && res.family) {
      const openid = res.openid || this.currentUser.openid;
      this.currentFamily = res.isLocalFallback ? res.family : { ...res.family, syncedToCloud: true };
      this.currentUser.openid = openid;
      this.currentUser.familyId = this.getFamilyId(res.family);
      this.currentUser.role = res.family.creatorOpenid === openid ? 'creator' : 'member';
      this.currentUser.nickName = callerNick;
      this.cloudSyncError = null;
      this.persist();
      return { success: true, family: this.currentFamily };
    }

    return { success: false, error: res.error || '加入家庭空间失败' };
  }

  /**
   * 3. 退出 / 解散家庭
   */
  public async leaveFamily(): Promise<{ success: boolean; error?: string }> {
    this.mutationSeq++;
    const res = await cloudService.callFunction('familyManage', {
      action: 'leaveFamily',
      mockOpenid: this.currentUser.openid
    });
    this.mutationSeq++;

    if (res.success) {
      this.currentUser.familyId = null;
      this.currentUser.role = null;
      this.currentFamily = null;
      this.cloudSyncError = null;
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

    // 云端查无此家庭：说明家庭只存在本机，标记待同步并提示房主
    if (res.errorType === 'FAMILY_NOT_IN_CLOUD' && !res.isLocalFallback) {
      this.currentFamily.syncedToCloud = false;
      this.cloudSyncError = '云端未找到该家庭，口令无法使用，请点击重新同步到云端';
      this.persist();
      return { success: false, error: this.cloudSyncError };
    }

    return { success: false, error: res.error || '刷新邀请码失败' };
  }
}

export const familyService = new FamilyService();
