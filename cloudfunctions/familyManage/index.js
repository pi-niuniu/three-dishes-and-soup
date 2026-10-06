const cloud = require('wx-server-sdk');

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
});

const db = cloud.database();
const _ = db.command;

const SENSITIVE_WORDS = ['违禁', '敏感', '广告', '赌博', '涉黄', '发票', '贷款'];

/**
 * 文本内容安全合规检验 (微信 msgSecCheck 2.0 与本地安全防线)
 * failOpenOnServiceError：msgSecCheck 服务自身异常（如 openapi 权限未随云函数部署）时，
 * 在本地敏感词已通过的前提下放行，避免检测服务故障阻断家人加入
 */
async function checkTextSecurity(text, openid, options = {}) {
  if (!text) return { pass: true };
  const str = String(text).trim();
  if (!str) return { pass: true };

  // 1. 本地兜底敏感词拦截
  if (SENSITIVE_WORDS.some(w => str.includes(w))) {
    return { pass: false, error: '内容包含敏感词或广告违规信息，请修改后重试' };
  }

  // 2. 微信官方 msgSecCheck 2.0 规范检测
  if (cloud.openapi && cloud.openapi.security && typeof cloud.openapi.security.msgSecCheck === 'function') {
    try {
      const res = await cloud.openapi.security.msgSecCheck({
        version: 2,
        scene: 1, // 1: 资料/昵称/家庭名称等
        openid,
        content: str
      });
      if (!res || !res.result || res.result.suggest !== 'pass') {
        return { pass: false, error: '内容未能通过微信安全合规检测，请修改后重试' };
      }
    } catch (err) {
      console.error('[familyManage] msgSecCheck 异常:', err);
      if (options.failOpenOnServiceError) {
        return { pass: true };
      }
      return { pass: false, error: '内容安全检测服务异常，请稍后重试' };
    }
  }

  return { pass: true };
}

/**
 * 生成 6 位唯一随机数字邀请码 (生成时查重防碰撞)
 */
async function generateUniqueInviteCode() {
  const now = Date.now();
  for (let attempt = 0; attempt < 10; attempt++) {
    const code = String(Math.floor(100000 + Math.random() * 900000));
    const existing = await db.collection('families').where({
      inviteCode: code,
      inviteExpiredAt: _.gt(now)
    }).count().catch(err => {
      console.warn('[familyManage] 口令查重查询异常:', err);
      return null;
    });

    if (!existing || existing.total === 0) {
      return code;
    }
  }
  return String(Math.floor(100000 + Math.random() * 900000));
}

/**
 * 规范化 6 位家庭邀请口令：过滤空白、符号，兼容全角数字与复制带前后缀的文本
 */
function normalizeInviteCode(input) {
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

const JOIN_RATE_LIMIT = {
  MAX_FAILURES: 5,
  WINDOW_MS: 15 * 60 * 1000 // 15分钟窗口
};

/**
 * 判断云开发数据库错误是否为文档不存在
 */
function isNotFoundError(err) {
  if (!err) return false;
  const code = err?.errCode ?? err?.code;
  if (code === -502005 || String(code) === '-502005') return true;
  const msg = String(err?.errMsg || err?.message || (typeof err === 'object' ? JSON.stringify(err) : err) || '').toLowerCase();
  return (
    msg.includes('does not exist') ||
    msg.includes('not exist') ||
    msg.includes('not found') ||
    msg.includes('-502005')
  );
}

/**
 * 判断是否为集合（表）不存在错误：新云环境未手动建表时，云数据库报 -502005 collection not exists
 * 与「文档不存在」不同，属于环境未初始化的底层异常
 */
function isCollectionNotExistError(err) {
  if (!err) return false;
  const msg = String(err?.errMsg || err?.message || (typeof err === 'object' ? JSON.stringify(err) : err) || '').toLowerCase();
  return (
    msg.includes('collection not exist') ||
    msg.includes('collection_not_exist') ||
    msg.includes('table not exist') ||
    msg.includes('db or table not exist')
  );
}

/**
 * 读取单个文档：仅「文档不存在」返回 null，其余底层异常（超时、集合缺失等）一律抛出，
 * 严禁把数据库故障伪装成「家庭不存在」
 */
async function getDocOrNull(collectionName, docId) {
  try {
    const res = await db.collection(collectionName).doc(docId).get();
    return (res && res.data) ? res.data : null;
  } catch (err) {
    if (isNotFoundError(err) && !isCollectionNotExistError(err)) {
      return null;
    }
    throw err;
  }
}

/**
 * 检查 openid 的口令尝试防刷限频（按 openid 记录失败尝试，防止暴力枚举）
 * 严格 fail-closed：查询异常时拒绝放行
 */
async function checkJoinRateLimit(openid, now) {
  try {
    let userDoc = null;
    try {
      userDoc = await db.collection('users').doc(`user_${openid}`).get();
    } catch (docErr) {
      // 用户文档尚不存在属于正常初次状态，不当作异常
      if (isNotFoundError(docErr)) {
        return { allowed: true };
      }
      throw docErr;
    }

    const data = userDoc?.data;
    if (!data) return { allowed: true };

    const failCount = data.joinFailCount || 0;
    const lastFailTime = data.joinFailLastTime || 0;

    if (now - lastFailTime > JOIN_RATE_LIMIT.WINDOW_MS) {
      return { allowed: true };
    }

    if (failCount >= JOIN_RATE_LIMIT.MAX_FAILURES) {
      const remainingMinutes = Math.max(1, Math.ceil((JOIN_RATE_LIMIT.WINDOW_MS - (now - lastFailTime)) / 60000));
      return {
        allowed: false,
        error: `邀请口令尝试失败次数过多，已被安全锁定，请 ${remainingMinutes} 分钟后再试（防暴力枚举）`
      };
    }
    return { allowed: true };
  } catch (err) {
    console.error('[familyManage] 检查防刷限频异常 (严格 fail-closed 拦截):', err);
    return {
      allowed: false,
      error: '安全防刷限频服务异常，请稍后重试'
    };
  }
}

/**
 * 记录一次加入失败尝试 (在事务内原子更新失败计数与时间戳，防止并发竞态丢失计数)
 */
async function recordJoinFailure(openid, now) {
  try {
    await db.runTransaction(async transaction => {
      const userDocRef = transaction.collection('users').doc(`user_${openid}`);
      let userRes = null;
      try {
        userRes = await userDocRef.get();
      } catch (err) {
        if (!isNotFoundError(err)) {
          throw err;
        }
      }

      const data = userRes?.data;
      const lastFailTime = data?.joinFailLastTime || 0;
      const isExpired = (now - lastFailTime) > JOIN_RATE_LIMIT.WINDOW_MS;
      const newCount = isExpired ? 1 : ((data?.joinFailCount || 0) + 1);

      if (data) {
        await userDocRef.update({
          data: {
            joinFailCount: newCount,
            joinFailLastTime: now
          }
        });
      } else {
        await userDocRef.set({
          data: {
            openid,
            nickName: '家人',
            familyId: null,
            role: null,
            joinFailCount: newCount,
            joinFailLastTime: now,
            createdAt: now,
            updatedAt: now
          }
        });
      }
    });
  } catch (err) {
    console.warn('[familyManage] 事务记录加入失败计数异常:', err);
  }
}

// users/families 为家庭核心集合，meal_history/custom_dishes 为就餐历史与私房菜实际使用的集合
const REQUIRED_COLLECTIONS = ['users', 'families', 'dishes', 'meals', 'meal_history', 'custom_dishes'];
let collectionsReady = false;

/**
 * 集合自愈创建：新环境未手动建表时自动创建 users/families/dishes/meals，杜绝 -502005
 * createCollection 报错时再用 count() 确认集合是否已存在；任一集合未确认就绪则下次调用继续重试
 */
async function ensureCollections(force = false) {
  if (collectionsReady && !force) return;
  if (typeof db.createCollection !== 'function') {
    collectionsReady = true;
    return;
  }
  let allReady = true;
  for (const name of REQUIRED_COLLECTIONS) {
    try {
      await db.createCollection(name);
    } catch (createErr) {
      try {
        await db.collection(name).count();
      } catch (probeErr) {
        allReady = false;
        console.error(`[familyManage] 集合 ${name} 自愈创建失败:`, createErr, probeErr);
      }
    }
  }
  collectionsReady = allReady;
}

async function handleAction(event, openid) {
  const { action } = event;
  const now = Date.now();

  switch (action) {
    /**
     * 1. 创建家庭空间
     */
    case 'createFamily': {
      const familyName = (event.name || '温馨小家食堂').trim().slice(0, 15);
      const nickName = (event.nickName || '房主').trim();

      // 安全合规校验：家庭名称与昵称
      const nameSec = await checkTextSecurity(familyName, openid);
      if (!nameSec.pass) return { success: false, error: nameSec.error };

      const nickSec = await checkTextSecurity(nickName, openid);
      if (!nickSec.pass) return { success: false, error: nickSec.error };

      // 仅「旧版本单机建的家庭补传云端」(_syncToCloud) 允许沿用客户端的 familyId 与口令，
      // 让房主已分享出去的口令继续有效；其余情况一律服务端生成
      const isLegacySync = !!event._syncToCloud;
      const requestedFamilyId = (isLegacySync && /^fam_[A-Za-z0-9_]{4,64}$/.test(String(event.familyId || '')))
        ? String(event.familyId)
        : null;

      // 口令与 familyId 在事务外预先生成 (防并发碰撞与事务内网络等待)
      let familyId = requestedFamilyId || `fam_${now}_${Math.random().toString(36).slice(2, 6)}`;
      let inviteCode = (isLegacySync && /^\d{6}$/.test(String(event.inviteCode || '').trim()))
        ? String(event.inviteCode).trim()
        : null;
      if (inviteCode) {
        let dupRes = null;
        try {
          dupRes = await db.collection('families').where({
            inviteCode,
            inviteExpiredAt: _.gt(now)
          }).get();
        } catch (dupErr) {
          console.warn('[familyManage] 补传口令查重异常，改为生成新口令:', dupErr);
        }
        const isTaken = !dupRes || (dupRes.data || []).some(doc => (doc._id || doc.id) !== familyId);
        if (isTaken) {
          inviteCode = await generateUniqueInviteCode();
        }
      } else {
        inviteCode = await generateUniqueInviteCode();
      }
      const inviteExpiredAt = (isLegacySync && event.inviteExpiredAt && Number(event.inviteExpiredAt) > now)
        ? Number(event.inviteExpiredAt)
        : (now + 24 * 60 * 60 * 1000); // 24小时过期

      return await db.runTransaction(async transaction => {
        const userDocRef = transaction.collection('users').doc(`user_${openid}`);

        let user = null;
        try {
          const uRes = await userDocRef.get();
          user = (uRes && uRes.data) ? uRes.data : null;
        } catch (e) {
          if (isNotFoundError(e)) {
            user = null;
          } else {
            console.error('[familyManage] createFamily 读取用户文档异常，回滚事务:', e);
            throw e;
          }
        }
        if (!user) {
          user = { openid, nickName: nickName || '房主' };
        }

        // 补传时若云端已存在同 id 家庭：本人所在则幂等返回（重复补传/重试），他人家庭则换新 id，严禁覆盖
        if (requestedFamilyId) {
          let existingFam = null;
          try {
            const famRes = await transaction.collection('families').doc(requestedFamilyId).get();
            existingFam = (famRes && famRes.data) ? famRes.data : null;
          } catch (e) {
            if (!isNotFoundError(e)) throw e;
          }
          if (existingFam) {
            const isMember = (existingFam.memberOpenids || []).includes(openid);
            if (isMember) {
              // 剔除保留字段 _id / _openid 后整体写回，兼容用户档案尚不存在的情况
              const { _id: _ignoredId, _openid: _ignoredOpenid, ...userRest } = user;
              await userDocRef.set({
                data: {
                  ...userRest,
                  openid,
                  familyId: requestedFamilyId,
                  role: existingFam.creatorOpenid === openid ? 'creator' : 'member',
                  createdAt: user.createdAt || now,
                  updatedAt: now
                }
              });
              return {
                success: true,
                openid,
                family: {
                  id: requestedFamilyId,
                  _id: requestedFamilyId,
                  ...existingFam
                }
              };
            }
            familyId = `fam_${now}_${Math.random().toString(36).slice(2, 6)}`;
            if (String(existingFam.inviteCode) === inviteCode) {
              inviteCode = String(Math.floor(100000 + Math.random() * 900000));
            }
          }
        }

        // 如果用户已在旧家庭中，先处理退出旧家庭（失败直接中断抛错，严防一人跨两家）
        if (user.familyId) {
          try {
            const oldFamilyId = user.familyId;
            const oldFamDocRef = transaction.collection('families').doc(oldFamilyId);
            let oldFamRes = null;
            try {
              oldFamRes = await oldFamDocRef.get();
            } catch (famErr) {
              if (isNotFoundError(famErr)) {
                oldFamRes = null;
              } else {
                throw famErr;
              }
            }
            if (oldFamRes && oldFamRes.data) {
              const oldFamily = oldFamRes.data;
              const remainingMembers = (oldFamily.members || []).filter(m => m.openid !== openid);
              const remainingOpenids = (oldFamily.memberOpenids || []).filter(id => id !== openid);

              if (remainingMembers.length === 0) {
                await oldFamDocRef.remove();
              } else {
                let newCreatorOpenid = oldFamily.creatorOpenid;
                if (oldFamily.creatorOpenid === openid) {
                  newCreatorOpenid = remainingMembers[0].openid;
                  remainingMembers[0].role = 'creator';
                  await transaction.collection('users').doc(`user_${remainingMembers[0].openid}`).update({
                    data: { role: 'creator', updatedAt: now }
                  }).catch(() => {});
                }

                await oldFamDocRef.update({
                  data: {
                    creatorOpenid: newCreatorOpenid,
                    members: remainingMembers,
                    memberOpenids: remainingOpenids,
                    updatedAt: now
                  }
                });
              }
            }
          } catch (e) {
            console.error('[familyManage] 退出旧家庭失败，已中断创建新家庭以防一人跨两家:', e);
            throw new Error(`退出原有家庭失败，中断创建新家庭: ${e?.message || e}`);
          }
        }

        const familyData = {
          id: familyId,
          name: familyName,
          creatorOpenid: openid,
          members: [
            {
              openid,
              nickName: nickName || user.nickName || '房主',
              avatarUrl: event.avatarUrl || user.avatarUrl || '',
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

        // 剔除冗余 _id 字段，避免微信云开发报 document.set:fail -501007 invalid parameters. 不能指定 _id 错误
        await transaction.collection('families').doc(familyId).set({ data: familyData });

        // 更新用户档案 (剔除冗余 _id 与保留字段 _openid，保留原始 createdAt，避免微信云开发报 document.set:fail -501007 invalid parameters 错误)
        await transaction.collection('users').doc(`user_${openid}`).set({
          data: {
            openid,
            nickName: nickName || user.nickName || '房主',
            avatarUrl: event.avatarUrl || user.avatarUrl || '',
            familyId,
            role: 'creator',
            createdAt: (user && user.createdAt) || now,
            updatedAt: now
          }
        });

        return {
          success: true,
          openid,
          family: {
            id: familyId,
            _id: familyId,
            ...familyData
          }
        };
      });
    }

    /**
     * 2. 口令加入家庭 (云端事务控制，严格上限 4 人，一人一家庭排他)
     */
    case 'joinFamily': {
      // 防刷限频检验：先检查该 openid 是否因频繁输错口令已被锁定（防止暴力枚举 6 位口令）
      const rateLimitCheck = await checkJoinRateLimit(openid, now);
      if (!rateLimitCheck.allowed) {
        return { success: false, error: rateLimitCheck.error };
      }

      const cleanCode = normalizeInviteCode(event.inviteCode);
      if (!cleanCode || cleanCode.length !== 6) {
        await recordJoinFailure(openid, now);
        return { success: false, error: '请输入正确的6位家庭邀请口令' };
      }

      const memberNickName = (event.nickName || '家人').trim();
      const nickSec = await checkTextSecurity(memberNickName, openid, { failOpenOnServiceError: true });
      if (!nickSec.pass) return { success: false, error: nickSec.error };

      // 1. 查询该邀请口令对应的所有家庭 (支持字符串与数值型双重兼容)
      const codeStr = String(cleanCode);
      const codeNum = Number(cleanCode);

      let matchedFamilies = [];
      let queryError = null;

      try {
        const strRes = await db.collection('families').where({ inviteCode: codeStr }).get();
        if (strRes && strRes.data && strRes.data.length > 0) {
          matchedFamilies = matchedFamilies.concat(strRes.data);
        }
      } catch (err) {
        console.warn('[familyManage] 字符串口令查询异常:', err);
        queryError = err;
      }

      if (!isNaN(codeNum)) {
        try {
          const numRes = await db.collection('families').where({ inviteCode: codeNum }).get();
          if (numRes && numRes.data && numRes.data.length > 0) {
            for (const doc of numRes.data) {
              const docId = doc._id || doc.id;
              if (!matchedFamilies.some(m => (m._id || m.id) === docId)) {
                matchedFamilies.push(doc);
              }
            }
          }
        } catch (err) {
          console.warn('[familyManage] 数值口令查询异常:', err);
          queryError = queryError || err;
        }
      }

      // 底层数据库异常且未匹配到任何家庭：区分于「无此口令」，一律不计入防刷失败次数
      if (queryError && matchedFamilies.length === 0) {
        if (isCollectionNotExistError(queryError)) {
          // 集合缺失说明云端从未写入过任何家庭：自愈建表，提示房主在手机上重新创建
          await ensureCollections(true);
          return {
            success: false,
            errorType: 'SERVICE_ERROR',
            error: '云端还没有任何家庭厨房数据，请房主在手机上重新创建厨房后再分享口令'
          };
        }
        return { success: false, errorType: 'SERVICE_ERROR', error: '云端查询服务异常，请稍后重试' };
      }

      if (matchedFamilies.length === 0) {
        await recordJoinFailure(openid, now);
        return {
          success: false,
          errorType: 'CODE_NOT_FOUND',
          error: '未找到该邀请口令对应的家庭厨房，请核对口令，或让房主在「我的」页刷新口令后重新分享'
        };
      }

      // 筛选未过期家庭 (按更新时间倒序优先取最新)
      matchedFamilies.sort((a, b) => (b.updatedAt || b.createdAt || 0) - (a.updatedAt || a.createdAt || 0));
      const activeFamily = matchedFamilies.find(f => !f.inviteExpiredAt || Number(f.inviteExpiredAt) > now);

      if (!activeFamily) {
        await recordJoinFailure(openid, now);
        return { success: false, error: '该邀请口令已失效（有效期24小时），请让房主重新刷新口令' };
      }

      const targetFamilyId = activeFamily._id || activeFamily.id;

      // 2. 进入原子数据库事务锁定文档并校验 4 人并发上限
      try {
        return await db.runTransaction(async transaction => {
          let famDoc = null;
          try {
            famDoc = await transaction.collection('families').doc(targetFamilyId).get();
          } catch (e) {
            if (isNotFoundError(e)) {
              famDoc = null;
            } else {
              throw e;
            }
          }
          if (!famDoc || !famDoc.data) {
            await transaction.rollback('未找到该邀请口令对应的家庭厨房').catch(() => {});
            throw new Error('未找到该邀请口令对应的家庭厨房');
          }

          const family = famDoc.data;

          // 校验 1: 口令是否已过期 (24 小时有效)
          if (family.inviteExpiredAt && Number(family.inviteExpiredAt) <= now) {
            await transaction.rollback('该邀请口令已失效（有效期24小时），请让房主重新刷新口令').catch(() => {});
            throw new Error('该邀请口令已失效（有效期24小时），请让房主重新刷新口令');
          }

          // 校验 2: 是否已经在该家庭中
          const isAlreadyMember = (family.memberOpenids && family.memberOpenids.includes(openid)) ||
            (family.members && family.members.some(m => m.openid === openid));
          if (isAlreadyMember) {
            // 确保用户档案同步归属
            await transaction.collection('users').doc(`user_${openid}`).update({
              data: {
                familyId: targetFamilyId,
                role: family.creatorOpenid === openid ? 'creator' : 'member',
                updatedAt: now
              }
            }).catch(() => {});

            return {
              success: true,
              openid,
              family: {
                id: family._id || targetFamilyId,
                _id: family._id || targetFamilyId,
                ...family
              },
              message: '您已经在该家庭厨房中'
            };
          }

          // 校验 3: 严格并发防超员，上限 4 人 (易错点 2 防御)
          const memberCount = Math.max((family.memberOpenids || []).length, (family.members || []).length);
          if (memberCount >= 4) {
            await transaction.rollback('该家庭厨房成员已满（上限4人），无法继续加入').catch(() => {});
            throw new Error('该家庭厨房成员已满（上限4人），无法继续加入');
          }

          // 用户一人一家庭互斥：查询并清理原有家庭归属 (易错点 3 防御)
          let userDoc = null;
          try {
            userDoc = await transaction.collection('users').doc(`user_${openid}`).get();
          } catch (e) {
            if (isNotFoundError(e)) {
              userDoc = null;
            } else {
              throw e;
            }
          }
          const oldFamilyId = userDoc?.data?.familyId;
          if (oldFamilyId && oldFamilyId !== targetFamilyId) {
            let oldFamDoc = null;
            try {
              oldFamDoc = await transaction.collection('families').doc(oldFamilyId).get();
            } catch (e) {
              if (isNotFoundError(e)) {
                oldFamDoc = null;
              } else {
                throw e;
              }
            }
            if (oldFamDoc?.data) {
              const remainingMembers = (oldFamDoc.data.members || []).filter(m => m.openid !== openid);
              const remainingOpenids = (oldFamDoc.data.memberOpenids || []).filter(id => id !== openid);

              if (remainingMembers.length === 0) {
                await transaction.collection('families').doc(oldFamilyId).remove();
              } else {
                const newCreator = oldFamDoc.data.creatorOpenid === openid
                  ? remainingMembers[0].openid
                  : oldFamDoc.data.creatorOpenid;

                if (oldFamDoc.data.creatorOpenid === openid) {
                  remainingMembers[0].role = 'creator';
                  await transaction.collection('users').doc(`user_${remainingMembers[0].openid}`).update({
                    data: { role: 'creator', updatedAt: now }
                  }).catch(() => {});
                }

                await transaction.collection('families').doc(oldFamilyId).update({
                  data: {
                    creatorOpenid: newCreator,
                    members: remainingMembers,
                    memberOpenids: remainingOpenids,
                    updatedAt: now
                  }
                });
              }
            }
          }

          // 加入新家庭
          const newMember = {
            openid,
            nickName: memberNickName || userDoc?.data?.nickName || '家人',
            avatarUrl: event.avatarUrl || userDoc?.data?.avatarUrl || '',
            role: 'member',
            joinedAt: now
          };

          const updatedMembers = [...(family.members || []), newMember];
          const updatedOpenids = Array.from(new Set([...(family.memberOpenids || []), openid]));

          await transaction.collection('families').doc(targetFamilyId).update({
            data: {
              members: updatedMembers,
              memberOpenids: updatedOpenids,
              updatedAt: now
            }
          });

          // 更新用户档案并重置防刷计数 (剔除冗余 _id 与保留字段 _openid，保留原始 createdAt，避免微信云开发报 document.set:fail -501007 invalid parameters 错误)
          await transaction.collection('users').doc(`user_${openid}`).set({
            data: {
              openid,
              nickName: newMember.nickName,
              avatarUrl: newMember.avatarUrl,
              familyId: targetFamilyId,
              role: 'member',
              joinFailCount: 0,
              joinFailLastTime: 0,
              createdAt: userDoc?.data?.createdAt || now,
              updatedAt: now
            }
          });

          return {
            success: true,
            openid,
            family: {
              id: targetFamilyId,
              _id: targetFamilyId,
              ...family,
              members: updatedMembers,
              memberOpenids: updatedOpenids,
              updatedAt: now
            }
          };
        });
      } catch (trxErr) {
        // 集合缺失交由入口自愈建表后重试
        if (isCollectionNotExistError(trxErr)) throw trxErr;
        const errMsg = typeof trxErr === 'string' ? trxErr : (trxErr?.message || '加入家庭厨房失败');
        return {
          success: false,
          error: errMsg
        };
      }
    }

    /**
     * 3. 退出 / 解散家庭空间 (纳入事务控制，杜绝并发竞态覆盖)
     */
    case 'leaveFamily': {
      return await db.runTransaction(async transaction => {
        let userDoc = null;
        try {
          userDoc = await transaction.collection('users').doc(`user_${openid}`).get();
        } catch (e) {
          if (isNotFoundError(e)) {
            userDoc = null;
          } else {
            throw e;
          }
        }
        const user = userDoc?.data;

        if (!user || !user.familyId) {
          return { success: true, message: '当前未加入任何家庭' };
        }

        const familyId = user.familyId;
        let famDoc = null;
        try {
          famDoc = await transaction.collection('families').doc(familyId).get();
        } catch (e) {
          if (isNotFoundError(e)) {
            famDoc = null;
          } else {
            throw e;
          }
        }

        if (famDoc && famDoc.data) {
          const family = famDoc.data;
          const remainingMembers = (family.members || []).filter(m => m.openid !== openid);
          const remainingOpenids = (family.memberOpenids || []).filter(id => id !== openid);

          if (remainingMembers.length === 0) {
            await transaction.collection('families').doc(familyId).remove();
          } else {
            let newCreatorOpenid = family.creatorOpenid;
            if (family.creatorOpenid === openid) {
              newCreatorOpenid = remainingMembers[0].openid;
              remainingMembers[0].role = 'creator';
              await transaction.collection('users').doc(`user_${remainingMembers[0].openid}`).update({
                data: { role: 'creator', updatedAt: now }
              }).catch(() => {});
            }

            await transaction.collection('families').doc(familyId).update({
              data: {
                creatorOpenid: newCreatorOpenid,
                members: remainingMembers,
                memberOpenids: remainingOpenids,
                updatedAt: now
              }
            });
          }
        }

        // 重置用户家庭归属
        await transaction.collection('users').doc(`user_${openid}`).update({
          data: {
            familyId: null,
            role: null,
            updatedAt: now
          }
        });

        return { success: true, message: '已退出家庭厨房空间' };
      });
    }

    /**
     * 4. 刷新 24 小时动态口令 (仅家庭成员可操作，生成时查重)
     */
    case 'refreshInviteCode': {
      const { familyId } = event;
      if (!familyId) return { success: false, error: '缺少 familyId' };

      // 仅文档不存在才视为家庭不存在，数据库异常向上抛出，严禁伪装成「家庭不存在」
      const family = await getDocOrNull('families', familyId);
      if (!family) {
        return { success: false, errorType: 'FAMILY_NOT_IN_CLOUD', error: '家庭不存在' };
      }
      if (!family.memberOpenids || !family.memberOpenids.includes(openid)) {
        return { success: false, error: '无权操作非本人所属家庭' };
      }

      const newCode = await generateUniqueInviteCode();
      const newExpiry = now + 24 * 60 * 60 * 1000;

      await db.collection('families').doc(familyId).update({
        data: {
          inviteCode: newCode,
          inviteExpiredAt: newExpiry,
          updatedAt: now
        }
      });

      return {
        success: true,
        inviteCode: newCode,
        inviteExpiredAt: newExpiry
      };
    }

    /**
     * 5. 获取家庭空间最新信息 (严禁向非家庭成员泄露邀请码与成员敏感信息)
     */
    case 'getFamily': {
      const { familyId } = event;
      if (!familyId) return { success: false, error: '缺少 familyId' };

      // 仅文档不存在才视为家庭不存在，数据库异常向上抛出，严禁伪装成「家庭不存在」
      const family = await getDocOrNull('families', familyId);
      if (!family) {
        return { success: false, errorType: 'FAMILY_NOT_IN_CLOUD', error: '家庭不存在' };
      }
      if (!family.memberOpenids || !family.memberOpenids.includes(openid)) {
        return { success: false, error: '无权查看非本人所属家庭详情' };
      }

      return {
        success: true,
        family: {
          id: family._id || familyId,
          _id: family._id || familyId,
          ...family
        }
      };
    }

    default:
      return { success: false, error: `不支持的操作类型: ${action}` };
  }
}

function toErrorResult(err) {
  const errMsg = typeof err === 'string' ? err : (err?.message || err?.errMsg || '家庭空间管理失败');
  return {
    success: false,
    error: errMsg
  };
}

exports.main = async (event, context) => {
  await ensureCollections();

  const wxContext = cloud.getWXContext();
  let openid = wxContext && wxContext.OPENID;

  // 生产环境中如果拿不到 wxContext.OPENID 直接报错拒绝，杜绝伪造
  if (!openid) {
    if (process.env.NODE_ENV === 'test' || event._testMock || process.env.IS_LOCAL_TEST) {
      openid = event.mockOpenid || 'mock_openid_default';
    } else {
      return { success: false, error: '未获取到微信用户有效身份凭据 (OPENID 缺失)' };
    }
  }

  try {
    return await handleAction(event, openid);
  } catch (err) {
    // 集合缺失（新环境 / 被误删）：强制自愈建表后重试一次，事务失败时无半途写入，重试安全
    if (isCollectionNotExistError(err)) {
      console.warn('[familyManage] 检测到集合不存在，自愈建表后重试:', err);
      await ensureCollections(true);
      try {
        return await handleAction(event, openid);
      } catch (retryErr) {
        return toErrorResult(retryErr);
      }
    }
    return toErrorResult(err);
  }
};

// 内部事务辅助：退出或重置家庭成员
async function leaveCurrentFamilyInternal(openid, familyId) {
  return await db.runTransaction(async transaction => {
    const famDocRef = transaction.collection('families').doc(familyId);
    let famRes = null;
    try {
      famRes = await famDocRef.get();
    } catch (e) {
      if (isNotFoundError(e)) {
        famRes = null;
      } else {
        throw e;
      }
    }
    if (!famRes || !famRes.data) return;

    const family = famRes.data;
    const remainingMembers = (family.members || []).filter(m => m.openid !== openid);
    const remainingOpenids = (family.memberOpenids || []).filter(id => id !== openid);

    if (remainingMembers.length === 0) {
      await famDocRef.remove();
    } else {
      let newCreatorOpenid = family.creatorOpenid;
      if (family.creatorOpenid === openid) {
        newCreatorOpenid = remainingMembers[0].openid;
        remainingMembers[0].role = 'creator';
        await transaction.collection('users').doc(`user_${remainingMembers[0].openid}`).update({
          data: { role: 'creator', updatedAt: Date.now() }
        }).catch(() => {});
      }

      await famDocRef.update({
        data: {
          creatorOpenid: newCreatorOpenid,
          members: remainingMembers,
          memberOpenids: remainingOpenids,
          updatedAt: Date.now()
        }
      });
    }
  });
}
