/**
 * 微信云开发服务网关 (CloudService)
 * 职责：
 * 1. 统一封装 wx.cloud.callFunction 调用
 * 2. 真实小程序环境下云函数报错严禁降级返回 Mock 假成功，一律返回失败交由离线队列重试
 * 3. 在无微信环境（Node.js 单测）或强制模拟模式下，提供高保真本地 Mock 状态机仿真
 * 4. 严格保障 4 人上限、24小时邀请码、一人一家庭排他与同日多餐写入
 */

import type { FamilySpace, UserProfile, SingleMealItem, CustomDishRecord } from '../types/family.js';

interface CloudResponse<T = any> {
  success: boolean;
  result?: T;
  error?: string;
  [key: string]: any;
}

class LocalCloudMockDatabase {
  private users = new Map<string, any>();
  private families = new Map<string, any>();
  private mealHistory = new Map<string, any>(); // key: meal_${familyId}_${date}
  private customDishes = new Map<string, any[]>(); // key: familyId -> dish[]
  private sensitiveWords = ['违禁', '敏感', '广告', '赌博', '涉黄', '发票', '贷款'];

  constructor() {
    this.restoreFromStorage();
  }

  private hasSensitiveContent(text: string): boolean {
    if (!text) return false;
    const str = String(text);
    return this.sensitiveWords.some(w => str.includes(w));
  }

  private generateUniqueInviteCode(): string {
    const now = Date.now();
    for (let attempt = 0; attempt < 10; attempt++) {
      const code = String(Math.floor(100000 + Math.random() * 900000));
      let isDuplicate = false;
      for (const fam of this.families.values()) {
        if (fam.inviteCode === code && fam.inviteExpiredAt > now) {
          isDuplicate = true;
          break;
        }
      }
      if (!isDuplicate) return code;
    }
    return String(Math.floor(100000 + Math.random() * 900000));
  }

  private getOpenid(data: any): string {
    if (data?.mockOpenid) return data.mockOpenid;
    try {
      if (typeof wx !== 'undefined' && wx.getStorageSync) {
        const user = wx.getStorageSync('current_user_profile');
        if (user && user.openid) return user.openid;
      }
    } catch (e) {}
    return 'mock_openid_default';
  }

  private restoreFromStorage() {
    try {
      if (typeof wx !== 'undefined' && wx.getStorageSync) {
        const storedUsers = wx.getStorageSync('mock_db_users');
        if (storedUsers) this.users = new Map(Object.entries(storedUsers));

        const storedFamilies = wx.getStorageSync('mock_db_families');
        if (storedFamilies) this.families = new Map(Object.entries(storedFamilies));

        const storedHistory = wx.getStorageSync('mock_db_history');
        if (storedHistory) this.mealHistory = new Map(Object.entries(storedHistory));

        const storedDishes = wx.getStorageSync('mock_db_custom_dishes');
        if (storedDishes) this.customDishes = new Map(Object.entries(storedDishes));
      }
    } catch (e) {}
  }

  private persist() {
    try {
      if (typeof wx !== 'undefined' && wx.setStorageSync) {
        wx.setStorageSync('mock_db_users', Object.fromEntries(this.users));
        wx.setStorageSync('mock_db_families', Object.fromEntries(this.families));
        wx.setStorageSync('mock_db_history', Object.fromEntries(this.mealHistory));
        wx.setStorageSync('mock_db_custom_dishes', Object.fromEntries(this.customDishes));
      }
    } catch (e) {}
  }

  public clearAll() {
    this.users.clear();
    this.families.clear();
    this.mealHistory.clear();
    this.customDishes.clear();
    this.persist();
  }

  public handleUserAuth(data: any): any {
    const openid = this.getOpenid(data);
    const now = Date.now();
    let user = this.users.get(`user_${openid}`);

    if (!user) {
      user = {
        _id: `user_${openid}`,
        _openid: openid,
        nickName: data?.nickName || '家人',
        avatarUrl: data?.avatarUrl || '',
        familyId: null,
        role: null,
        createdAt: now,
        updatedAt: now
      };
      this.users.set(`user_${openid}`, user);
    } else {
      if (data?.nickName) user.nickName = data.nickName;
      if (data?.avatarUrl) user.avatarUrl = data.avatarUrl;
      user.updatedAt = now;
    }

    let family = null;
    if (user.familyId) {
      family = this.families.get(user.familyId) || null;
      if (!family) {
        user.familyId = null;
        user.role = null;
      }
    }

    this.persist();
    return { success: true, openid, user, family };
  }

  public handleFamilyManage(data: any): any {
    const { action } = data;
    const openid = this.getOpenid(data);
    const now = Date.now();

    switch (action) {
      case 'createFamily': {
        const familyName = (data.name || '温馨小家食堂').trim().slice(0, 15);
        const nickName = data.nickName || '房主';

        // 文本合规检验
        if (this.hasSensitiveContent(familyName) || this.hasSensitiveContent(nickName)) {
          return { success: false, error: '家庭名称或昵称包含敏感词，请修改后重试' };
        }

        let user = this.users.get(`user_${openid}`) || {
          _id: `user_${openid}`,
          _openid: openid,
          nickName,
          familyId: null
        };

        // 如果用户在旧家庭中，先退出
        if (user.familyId && this.families.has(user.familyId)) {
          this.leaveFamilyInternal(openid, user.familyId);
        }

        const familyId = `fam_${now}_${Math.random().toString(36).slice(2, 6)}`;
        const inviteCode = this.generateUniqueInviteCode();
        const inviteExpiredAt = now + 24 * 60 * 60 * 1000;

        const newFamily: FamilySpace = {
          id: familyId,
          name: familyName,
          creatorOpenid: openid,
          members: [
            {
              openid,
              nickName: nickName || user.nickName || '房主',
              avatarUrl: data.avatarUrl || user.avatarUrl || '',
              role: 'creator',
              joinedAt: now
            }
          ],
          memberOpenids: [openid],
          inviteCode,
          inviteExpiredAt,
          createdAt: now,
          updatedAt: now
        };

        this.families.set(familyId, newFamily);
        user.familyId = familyId;
        user.role = 'creator';
        user.updatedAt = now;
        this.users.set(`user_${openid}`, user);

        this.persist();
        return { success: true, family: newFamily };
      }

      case 'joinFamily': {
        const WINDOW_MS = 15 * 60 * 1000;
        const MAX_FAILURES = 5;
        let user = this.users.get(`user_${openid}`) || {
          _id: `user_${openid}`,
          _openid: openid,
          nickName: data.nickName || '家人',
          familyId: null,
          joinFailCount: 0,
          joinFailLastTime: 0
        };

        if ((user.joinFailCount || 0) >= MAX_FAILURES && (now - (user.joinFailLastTime || 0)) <= WINDOW_MS) {
          const remainingMinutes = Math.max(1, Math.ceil((WINDOW_MS - (now - (user.joinFailLastTime || 0))) / 60000));
          return {
            success: false,
            error: `口令尝试失败次数过多，已被安全锁定，请 ${remainingMinutes} 分钟后再试（防暴力枚举）`
          };
        }

        const recordMockFailure = () => {
          const isExpired = (now - (user.joinFailLastTime || 0)) > WINDOW_MS;
          user.joinFailCount = isExpired ? 1 : ((user.joinFailCount || 0) + 1);
          user.joinFailLastTime = now;
          this.users.set(`user_${openid}`, user);
          this.persist();
        };

        const inviteCode = String(data.inviteCode || '').trim();
        if (!inviteCode || inviteCode.length !== 6) {
          recordMockFailure();
          return { success: false, error: '请输入正确的6位家庭邀请口令' };
        }

        const nickName = data.nickName || '家人';
        if (this.hasSensitiveContent(nickName)) {
          return { success: false, error: '成员昵称包含敏感词，请修改后重试' };
        }

        let targetFamily: FamilySpace | null = null;
        for (const fam of this.families.values()) {
          if (fam.inviteCode === inviteCode) {
            targetFamily = fam;
            break;
          }
        }

        if (!targetFamily) {
          recordMockFailure();
          return { success: false, error: '未找到该邀请口令对应的家庭厨房' };
        }

        if (now > targetFamily.inviteExpiredAt) {
          recordMockFailure();
          return { success: false, error: '该邀请口令已失效（有效期24小时），请让房主重新刷新口令' };
        }

        if (targetFamily.memberOpenids.includes(openid)) {
          return { success: true, family: targetFamily, message: '您已经在该家庭厨房中' };
        }

        // 严格 4 人限制 (易错点 2 防御)
        if (targetFamily.memberOpenids.length >= 4) {
          return { success: false, error: '该家庭厨房成员已满（上限4人），无法继续加入' };
        }

        // 一人一家庭排他 (易错点 3 防御)
        if (user.familyId && user.familyId !== targetFamily.id && this.families.has(user.familyId)) {
          this.leaveFamilyInternal(openid, user.familyId);
        }

        const newMember = {
          openid,
          nickName: nickName || user.nickName || '家人',
          avatarUrl: data.avatarUrl || user.avatarUrl || '',
          role: 'member' as const,
          joinedAt: now
        };

        targetFamily.members.push(newMember);
        targetFamily.memberOpenids.push(openid);
        targetFamily.updatedAt = now;

        user.familyId = targetFamily.id;
        user.role = 'member';
        user.joinFailCount = 0;
        user.joinFailLastTime = 0;
        user.updatedAt = now;
        this.users.set(`user_${openid}`, user);

        this.persist();
        return { success: true, family: targetFamily };
      }

      case 'leaveFamily': {
        let user = this.users.get(`user_${openid}`);
        if (!user || !user.familyId) {
          return { success: true, message: '当前未加入任何家庭' };
        }
        this.leaveFamilyInternal(openid, user.familyId);
        user.familyId = null;
        user.role = null;
        user.updatedAt = now;
        this.users.set(`user_${openid}`, user);
        this.persist();
        return { success: true, message: '已退出家庭厨房空间' };
      }

      case 'refreshInviteCode': {
        const { familyId } = data;
        const family = this.families.get(familyId);
        if (!family) return { success: false, error: '家庭不存在' };

        if (!family.memberOpenids.includes(openid)) {
          return { success: false, error: '无权操作非本人所属家庭' };
        }

        const newCode = this.generateUniqueInviteCode();
        const newExpiry = now + 24 * 60 * 60 * 1000;
        family.inviteCode = newCode;
        family.inviteExpiredAt = newExpiry;
        family.updatedAt = now;

        this.persist();
        return { success: true, inviteCode: newCode, inviteExpiredAt: newExpiry };
      }

      case 'getFamily': {
        const { familyId } = data;
        const family = this.families.get(familyId);
        if (!family) return { success: false, error: '家庭不存在' };

        // 敏感信息保护：非家庭成员不泄露敏感的邀请码与成员详情
        if (data.mockOpenid && (!family.memberOpenids || !family.memberOpenids.includes(data.mockOpenid))) {
          return { success: false, error: '无权查看非本人所属家庭详情' };
        }

        return { success: true, family };
      }

      default:
        return { success: false, error: `不支持的操作类型: ${action}` };
    }
  }

  private leaveFamilyInternal(openid: string, familyId: string) {
    const family = this.families.get(familyId);
    if (!family) return;
    family.members = family.members.filter(m => m.openid !== openid);
    family.memberOpenids = family.memberOpenids.filter(id => id !== openid);
    if (family.members.length === 0) {
      this.families.delete(familyId);
    } else {
      if (family.creatorOpenid === openid) {
        family.creatorOpenid = family.members[0].openid;
        family.members[0].role = 'creator';
      }
      family.updatedAt = Date.now();
    }
  }

  public handleUpsertMeal(data: any): any {
    const { action = 'upsertMeal' } = data;
    const openid = this.getOpenid(data);
    const now = Date.now();

    switch (action) {
      case 'upsertMeal': {
        const { familyId, date, meal } = data;
        if (!familyId || !date || !meal) {
          return { success: false, error: '缺少参数 familyId/date/meal' };
        }

        // 服务端鉴权：确认该用户确实属于该家庭
        const family = this.families.get(familyId);
        if (family && !family.memberOpenids.includes(openid)) {
          return { success: false, error: '越权操作：您不属于该家庭空间' };
        }

        const docKey = `meal_${familyId}_${date}`;
        let doc = this.mealHistory.get(docKey);

        const verifiedMember = (family?.members || []).find((m: any) => m.openid === openid);
        const verifiedNickName = (verifiedMember && verifiedMember.nickName && verifiedMember.nickName.trim())
          ? verifiedMember.nickName.trim()
          : (meal.confirmedByName || data.nickName || '家人');

        const mealSnapshot: SingleMealItem = {
          mealId: meal.mealId || `m_${now}`,
          mealType: meal.mealType || '午餐',
          mode: meal.mode || 'hearty_3_1',
          dishes: Array.isArray(meal.dishes) ? meal.dishes : [],
          dishIds: Array.isArray(meal.dishIds) ? meal.dishIds : [],
          dishNames: Array.isArray(meal.dishNames) ? meal.dishNames : [],
          confirmedBy: openid,
          confirmedByName: verifiedNickName,
          timestamp: meal.timestamp || now
        };

        if (!doc) {
          doc = {
            _id: docKey,
            familyId,
            date,
            meals: [mealSnapshot],
            updatedAt: now
          };
        } else {
          const meals = doc.meals || [];
          const idx = meals.findIndex((m: any) => m.mealId === mealSnapshot.mealId);
          if (idx >= 0) {
            meals[idx] = mealSnapshot;
          } else {
            meals.push(mealSnapshot);
          }
          doc.meals = meals;
          doc.updatedAt = now;
        }

        this.mealHistory.set(docKey, doc);
        this.persist();
        return { success: true, docId: docKey, meal: mealSnapshot };
      }

      case 'getHistory': {
        const { familyId, limitDays = 60 } = data;
        if (!familyId) return { success: false, error: '缺少 familyId' };

        // 鉴权检查：如果传入了 mockOpenid 或有当前身份，校验是否在家庭中
        if (data.mockOpenid) {
          const family = this.families.get(familyId);
          if (family && !family.memberOpenids.includes(data.mockOpenid)) {
            return { success: false, error: '越权操作：无权查看非本人所属家庭的就餐历史' };
          }
        }

        const allMeals: any[] = [];
        for (const [key, doc] of this.mealHistory.entries()) {
          if (doc.familyId === familyId) {
            for (const m of (doc.meals || [])) {
              allMeals.push({
                id: m.mealId,
                menuId: m.mealId,
                mealId: m.mealId,
                date: doc.date,
                timestamp: m.timestamp,
                mode: m.mode,
                mealType: m.mealType,
                dishIds: m.dishIds,
                dishNames: m.dishNames,
                dishes: m.dishes,
                confirmedBy: m.confirmedBy,
                confirmedByName: m.confirmedByName,
                familyId: doc.familyId,
                syncStatus: 'synced'
              });
            }
          }
        }

        allMeals.sort((a, b) => b.timestamp - a.timestamp);
        return { success: true, records: allMeals.slice(0, limitDays * 3) };
      }

      default:
        return { success: false, error: `不支持的操作类型: ${action}` };
    }
  }

  public handleCustomDish(data: any): any {
    const { action = 'addDish' } = data;
    const openid = this.getOpenid(data);
    const now = Date.now();

    switch (action) {
      case 'addDish': {
        const name = String(data.name || '').trim();
        if (!name) return { success: false, error: '菜品名称不能为空' };
        if (name.length > 20) return { success: false, error: '菜品名称不能超过20个字' };

        // 敏感词检测 (易错点 7 防御)
        const checkText = `${name} ${(data.taste || []).join(' ')} ${(data.ingredients || []).join(' ')}`;
        if (this.hasSensitiveContent(name) || this.hasSensitiveContent(checkText)) {
          return { success: false, error: '菜品名称包含敏感内容，请修改' };
        }

        // 隔离桶：未加入家庭的私房菜使用 personal_${openid}，严禁所有单人用户共用 'personal' 桶
        const isPersonal = !data.familyId || data.familyId === 'personal' || data.familyId.startsWith('personal_');
        const familyId = isPersonal ? `personal_${openid}` : data.familyId;

        // 服务端家庭鉴权
        if (!isPersonal) {
          const family = this.families.get(familyId);
          if (family && !family.memberOpenids.includes(openid)) {
            return { success: false, error: '越权操作：您不属于该家庭空间' };
          }
        }

        const dishId = `custom_${now}_${Math.random().toString(36).slice(2, 6)}`;
        const category = data.category || 'secondary_meat';

        const newDish = {
          _id: dishId,
          id: dishId,
          familyId,
          creatorOpenid: openid,
          creatorName: data.creatorName || data.nickName || '家人',
          name,
          category,
          taste: Array.isArray(data.taste) ? data.taste : ['家常'],
          cookingTimeMinutes: Number(data.cookingTimeMinutes) || 25,
          ingredients: Array.isArray(data.ingredients) ? data.ingredients : [],
          enabled: true,
          isCustom: true,
          createdAt: now
        };

        const list = this.customDishes.get(familyId) || [];
        list.unshift(newDish);
        this.customDishes.set(familyId, list);
        this.persist();

        return { success: true, dish: newDish };
      }

      case 'getDishes': {
        const isPersonal = !data.familyId || data.familyId === 'personal' || data.familyId.startsWith('personal_');
        const familyId = isPersonal ? `personal_${openid}` : data.familyId;

        // 服务端家庭鉴权
        if (!isPersonal && data.mockOpenid) {
          const family = this.families.get(familyId);
          if (family && !family.memberOpenids.includes(data.mockOpenid)) {
            return { success: false, error: '越权操作：无权查看非本人所属家庭的私房菜' };
          }
        }

        const list = this.customDishes.get(familyId) || [];
        return { success: true, dishes: list };
      }

      default:
        return { success: false, error: `不支持的操作类型: ${action}` };
    }
  }
}

export class CloudService {
  private mockDb = new LocalCloudMockDatabase();
  private isCloudAvailable: boolean | null = null;
  private forceMock: boolean = false;

  public getMockDb() {
    return this.mockDb;
  }

  public setForceMock(mock: boolean) {
    this.forceMock = mock;
  }

  public resetAvailability() {
    this.isCloudAvailable = null;
  }

  /**
   * 判断当前微信环境是否真正支持并开通了云开发
   */
  public checkCloudAvailability(): boolean {
    if (this.forceMock) return false;
    if (this.isCloudAvailable !== null) return this.isCloudAvailable;
    if (typeof wx !== 'undefined' && wx.cloud && typeof wx.cloud.callFunction === 'function') {
      this.isCloudAvailable = true;
    } else {
      this.isCloudAvailable = false;
    }
    return this.isCloudAvailable;
  }

  /**
   * 统一云函数调用方法
   * 真实微信小程序环境下：严禁网络报错后假成功降级返回 Mock！一律返回失败交由离线待同步队列重试。
   * 本地仿真 Mock 仅在无微信环境（Node.js 本地单测）或本地强制模拟模式下生效。
   */
  public async callFunction<T = any>(name: string, data: any = {}): Promise<CloudResponse<T>> {
    const hasCloud = this.checkCloudAvailability();

    if (hasCloud) {
      try {
        const res = await wx.cloud.callFunction({
          name,
          data
        });
        if (res && res.result) {
          return res.result as CloudResponse<T>;
        }
        return { success: false, error: '云函数返回空结果' };
      } catch (err: any) {
        const errMsg = err?.errMsg || err?.message || String(err);
        console.warn(`[CloudService] 云函数 ${name} 线上调用失败:`, errMsg);
        // 严格遵循第 1 项要求：严禁降级返回 Mock 的 success！一律返回 { success: false, error: err.message }
        return { success: false, error: err?.message || errMsg };
      }
    }

    // 本地仿真降级处理 (仅在无微信环境下使用)
    return this.invokeLocalMock(name, data);
  }

  /**
   * 本地 Mock 逻辑分发
   */
  private invokeLocalMock(name: string, data: any): CloudResponse<any> {
    switch (name) {
      case 'userAuth':
        return this.mockDb.handleUserAuth(data);
      case 'familyManage':
        return this.mockDb.handleFamilyManage(data);
      case 'upsertMeal':
        return this.mockDb.handleUpsertMeal(data);
      case 'customDish':
        return this.mockDb.handleCustomDish(data);
      default:
        return { success: false, error: `未知云函数: ${name}` };
    }
  }
}

export const cloudService = new CloudService();
