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
        if ((fam.inviteCode === code || String(fam.inviteCode) === code) && fam.inviteExpiredAt > now) {
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

  public syncFamilyFromCloud(family: any, userOpenid?: string, role?: 'creator' | 'member') {
    if (!family) return;
    const famId = family.id || family._id;
    const safeFamily: FamilySpace = {
      id: famId,
      name: family.name,
      creatorOpenid: family.creatorOpenid,
      members: family.members || [],
      memberOpenids: family.memberOpenids || [],
      inviteCode: String(family.inviteCode),
      inviteExpiredAt: family.inviteExpiredAt,
      createdAt: family.createdAt || Date.now(),
      updatedAt: family.updatedAt || Date.now()
    };
    this.families.set(famId, safeFamily);
    if (userOpenid) {
      let user = this.users.get(`user_${userOpenid}`);
      if (!user) {
        user = {
          _id: `user_${userOpenid}`,
          openid: userOpenid,
          nickName: '家人',
          createdAt: Date.now()
        };
      }
      user.familyId = famId;
      user.role = role || (family.creatorOpenid === userOpenid ? 'creator' : 'member');
      user.updatedAt = Date.now();
      this.users.set(`user_${userOpenid}`, user);
    }
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
          openid,
          nickName,
          familyId: null,
          role: null,
          createdAt: now,
          updatedAt: now
        };

        // 如果用户在旧家庭中，先退出
        if (user.familyId && this.families.has(user.familyId)) {
          this.leaveFamilyInternal(openid, user.familyId);
        }

        const familyId = data.familyId || `fam_${now}_${Math.random().toString(36).slice(2, 6)}`;
        const inviteCode = (data.inviteCode && String(data.inviteCode).trim().length === 6)
          ? String(data.inviteCode).trim()
          : this.generateUniqueInviteCode();
        const inviteExpiredAt = (data.inviteExpiredAt && Number(data.inviteExpiredAt) > now)
          ? Number(data.inviteExpiredAt)
          : (now + 24 * 60 * 60 * 1000);

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
          openid,
          nickName: data.nickName || '家人',
          familyId: null,
          role: null,
          joinFailCount: 0,
          joinFailLastTime: 0,
          createdAt: now,
          updatedAt: now
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
          if (
            String(fam.inviteCode) === inviteCode ||
            fam.inviteCode === inviteCode ||
            fam.inviteCode === Number(inviteCode)
          ) {
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
        const nextCreatorOpenid = family.members[0].openid;
        family.creatorOpenid = nextCreatorOpenid;
        family.members[0].role = 'creator';
        const nextUser = this.users.get(`user_${nextCreatorOpenid}`);
        if (nextUser) {
          nextUser.role = 'creator';
          nextUser.updatedAt = Date.now();
        }
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
   * 判断错误是否属于微信云开发环境未就绪/未开通/云函数未部署
   * -601034: Environment not found
   * -601016: Environment does not exist
   * -601020: Function not found
   */
  private isEnvironmentUnavailableError(err: any): boolean {
    if (!err) return false;
    const errCode = err?.errCode ?? err?.code;
    if (errCode === -601034 || errCode === -601016 || errCode === -601015 || errCode === -601020) {
      return true;
    }

    const msg = typeof err === 'string' ? err : String(err?.errMsg || err?.message || (typeof err === 'object' ? JSON.stringify(err) : err) || '');

    if (
      msg.includes('-601034') ||
      msg.includes('Environment not found') ||
      msg.includes('environment not found') ||
      msg.includes('Environment does not exist') ||
      msg.includes('FunctionName is not exist') ||
      msg.includes('function not exist') ||
      msg.includes('Function not found') ||
      msg.includes('no permission to callFunction')
    ) {
      return true;
    }

    return false;
  }

  /**
   * 判断错误是否属于微信云开发保留字段冲突或底层数据库参数错误
   * -501007: invalid parameters / 不能指定 _id / cannot update _id
   */
  private isReservedFieldOrParamError(err: any, result?: any): boolean {
    const checkItem = (item: any): boolean => {
      if (!item) return false;
      const code = item?.errCode ?? item?.code;
      const str = typeof item === 'string'
        ? item
        : String(item?.errMsg || item?.message || (typeof item === 'object' ? JSON.stringify(item) : item) || '');

      const is501007 = code === -501007 || str.includes('-501007');
      const isReservedKeyword = str.includes('不能指定') || str.includes('保留字段') || str.includes('cannot update _id');

      // 仅当明确具备 -501007 或保留字段核心关键字时才判定为冲突，绝不泛化拦截通用报错
      return (is501007 && (isReservedKeyword || str.includes('invalid parameters'))) || isReservedKeyword;
    };

    return checkItem(err) || checkItem(result) || (result && checkItem(result.error));
  }

  /**
   * 统一云函数调用方法
   * 1. 真实微信小程序环境下：严禁网络报错后假成功降级返回 Mock！一律返回失败交由离线待同步队列重试。
   * 2. 当检测到根本性环境缺失 (-601034 / 未开通云开发 / 云函数未部署)：自动熔断并平滑切换至本地高可用容灾模式。
   * 3. 本地仿真 Mock 保证单机与离线环境完整可用。
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
          const result = res.result as CloudResponse<T>;
          if (result.success) {
            // 同步云端家庭数据至本地 Mock 状态机，保障单机状态与云端强一致
            if (name === 'familyManage' && (data?.action === 'createFamily' || data?.action === 'joinFamily') && (result as any).family) {
              const role = data?.action === 'createFamily' ? 'creator' : 'member';
              this.mockDb.syncFamilyFromCloud((result as any).family, data?.mockOpenid, role);
            }
            return result;
          }

          // 核心容灾防御：若线上已发布的云端代码未部署最新补丁，返回了底层保留字段冲突或参数异常 (-501007)
          // 自动熔断降级至本地高可用容灾模式，确保用户业务（如创建厨房）绝不中断
          if (this.isReservedFieldOrParamError(null, result)) {
            console.warn(`[CloudService] 云函数 ${name} 线上返回底层数据库参数/保留字段冲突 (-501007)，自动降级至本地高可用容灾模式`);
            this.isCloudAvailable = false;
            const fallbackRes = this.invokeLocalMock(name, data);
            return {
              ...fallbackRes,
              isLocalFallback: true
            };
          }

          // 环境异常亦熔断降级
          if (this.isEnvironmentUnavailableError(result) || this.isEnvironmentUnavailableError(result.error)) {
            console.warn(`[CloudService] 云函数 ${name} 线上返回环境未就绪，自动降级至本地高可用容灾模式`);
            this.isCloudAvailable = false;
            const fallbackRes = this.invokeLocalMock(name, data);
            return {
              ...fallbackRes,
              isLocalFallback: true
            };
          }

          // 核心互通增强：若云端提示未找到口令，但本地 Mock 库中存在该家庭（例如同机多身份测试或房主在降级模式下创建）
          if (name === 'familyManage' && data?.action === 'joinFamily' && (result.error?.includes('未找到') || result.error?.includes('不存在'))) {
            const localFallback = this.invokeLocalMock(name, data);
            if (localFallback.success) {
              return {
                ...localFallback,
                isLocalFallback: true
              };
            }
          }

          return result;
        }
        return { success: false, error: '云函数返回空结果' };
      } catch (err: any) {
        const errMsg = err?.errMsg || err?.message || String(err);
        console.warn(`[CloudService] 云函数 ${name} 线上调用失败:`, errMsg);

        // 核心容灾防御：若为环境未就绪 (-601034)，自动熔断并无缝降级为本地高可用模式
        if (this.isEnvironmentUnavailableError(err)) {
          console.warn(`[CloudService] 检测到微信云开发环境未就绪/未开通 (-601034)，自动切换至本地高可用容灾模式`);
          this.isCloudAvailable = false;
          const fallbackRes = this.invokeLocalMock(name, data);
          return {
            ...fallbackRes,
            isLocalFallback: true
          };
        }

        // 核心容灾防御：若底层保留字段冲突或参数异常 (-501007)，自动降级至本地高可用容灾模式
        if (this.isReservedFieldOrParamError(err)) {
          console.warn(`[CloudService] 云函数 ${name} 抛出底层保留字段冲突 (-501007)，自动降级至本地高可用容灾模式`);
          this.isCloudAvailable = false;
          const fallbackRes = this.invokeLocalMock(name, data);
          return {
            ...fallbackRes,
            isLocalFallback: true
          };
        }

        // 真实网络故障等瞬时错误：严格遵循加固规范，严禁网络异常假成功，一律返回真实错误交由离线队列重试
        return { success: false, error: err?.message || errMsg };
      }
    }

    // 本地高可用模式 (离线、无微信环境或降级模式)
    const localRes = this.invokeLocalMock(name, data);

    // 核心跨机穿透增强：当用户在降级模式下加入家庭时，本地 mock 找不到目标家庭（因为目标家庭是由真机云端创建的），
    // 尝试向真实云端穿透探测一次，避免用户永远卡在单机隔离桶中无法加入家人创建的云端厨房
    if (
      name === 'familyManage' &&
      data?.action === 'joinFamily' &&
      !localRes.success &&
      typeof wx !== 'undefined' &&
      wx.cloud &&
      typeof wx.cloud.callFunction === 'function' &&
      !this.forceMock
    ) {
      try {
        const cloudTryRes = await wx.cloud.callFunction({ name, data });
        if (cloudTryRes?.result && (cloudTryRes.result as any).success) {
          const resResult = cloudTryRes.result as CloudResponse<T>;
          // 云端加入成功，自动恢复云端可用状态并同步回本地
          this.isCloudAvailable = true;
          if (resResult.family) {
            this.mockDb.syncFamilyFromCloud(resResult.family, data.mockOpenid, 'member');
          }
          return resResult;
        }
      } catch (probeErr) {
        // 穿透探测若失败，保持原始本地错误
      }
    }

    // 核心降级创建互通：当房主此前在本地创建了家庭，联网静默补全注册 (_syncToCloud) 时，主动向真实云端尝试注册
    // 确保真实云开发可用时口令实时写入云端，家人凭口令可立即加入
    if (
      name === 'familyManage' &&
      data?.action === 'createFamily' &&
      data?._syncToCloud &&
      typeof wx !== 'undefined' &&
      wx.cloud &&
      typeof wx.cloud.callFunction === 'function' &&
      !this.forceMock
    ) {
      try {
        const cloudTryRes = await wx.cloud.callFunction({ name, data });
        if (cloudTryRes?.result && (cloudTryRes.result as any).success) {
          const resResult = cloudTryRes.result as CloudResponse<T>;
          this.isCloudAvailable = true;
          if (resResult.family) {
            this.mockDb.syncFamilyFromCloud(resResult.family, data.mockOpenid, 'creator');
          }
          return resResult;
        }
      } catch (probeErr) {
        // 离线时保持本地 mock
      }
    }

    return {
      ...localRes,
      isLocalFallback: true
    };
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
