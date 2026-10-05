const cloud = require('wx-server-sdk');

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
});

const db = cloud.database();
const _ = db.command;

const SENSITIVE_WORDS = ['违禁', '敏感', '广告', '赌博', '涉黄', '发票', '贷款'];

/**
 * 文本内容安全合规检验 (微信 msgSecCheck 2.0 与本地安全防线)
 */
async function checkTextSecurity(text, openid) {
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
    }).count().catch(() => null);

    if (!existing || existing.total === 0) {
      return code;
    }
  }
  return String(Math.floor(100000 + Math.random() * 900000));
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
  const msg = String(err.message || err || '').toLowerCase();
  return (
    msg.includes('does not exist') ||
    msg.includes('not exist') ||
    err.errCode === -502005
  );
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

exports.main = async (event, context) => {
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

  const { action } = event;
  const now = Date.now();

  try {
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

        // 口令与 familyId 在事务外预先生成 (防并发碰撞与事务内网络等待)
        const familyId = `fam_${now}_${Math.random().toString(36).slice(2, 6)}`;
        const inviteCode = await generateUniqueInviteCode();
        const inviteExpiredAt = now + 24 * 60 * 60 * 1000; // 24小时过期

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

        const inviteCode = String(event.inviteCode || '').trim();
        if (!inviteCode || inviteCode.length !== 6) {
          await recordJoinFailure(openid, now);
          return { success: false, error: '请输入正确的6位家庭邀请口令' };
        }

        const memberNickName = (event.nickName || '家人').trim();
        const nickSec = await checkTextSecurity(memberNickName, openid);
        if (!nickSec.pass) return { success: false, error: nickSec.error };

        // 1. 查询有效且未过期的邀请码
        const queryRes = await db.collection('families').where({
          inviteCode,
          inviteExpiredAt: _.gt(now)
        }).get();

        if (!queryRes.data || queryRes.data.length === 0) {
          await recordJoinFailure(openid, now);
          // 区分是过期还是根本不存在
          const anyRes = await db.collection('families').where({ inviteCode }).get().catch(() => null);
          if (anyRes && anyRes.data && anyRes.data.length > 0) {
            return { success: false, error: '该邀请口令已失效（有效期24小时），请让房主重新刷新口令' };
          }
          return { success: false, error: '未找到该邀请口令对应的家庭厨房' };
        }

        const targetFamilyId = queryRes.data[0]._id;

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
            if (now > family.inviteExpiredAt) {
              await transaction.rollback('该邀请口令已失效（有效期24小时），请让房主重新刷新口令').catch(() => {});
              throw new Error('该邀请口令已失效（有效期24小时），请让房主重新刷新口令');
            }

            // 校验 2: 是否已经在该家庭中
            if (family.memberOpenids && family.memberOpenids.includes(openid)) {
              return {
                success: true,
                family: {
                  id: family._id || targetFamilyId,
                  _id: family._id || targetFamilyId,
                  ...family
                },
                message: '您已经在该家庭厨房中'
              };
            }

            // 校验 3: 严格并发防超员，上限 4 人 (易错点 2 防御)
            if ((family.memberOpenids || []).length >= 4) {
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
            const updatedOpenids = [...(family.memberOpenids || []), openid];

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

        const famRes = await db.collection('families').doc(familyId).get().catch(() => null);
        if (!famRes || !famRes.data) return { success: false, error: '家庭不存在' };

        const family = famRes.data;
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

        const famRes = await db.collection('families').doc(familyId).get().catch(() => null);
        if (!famRes || !famRes.data) return { success: false, error: '家庭不存在' };

        const family = famRes.data;
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
  } catch (err) {
    const errMsg = typeof err === 'string' ? err : (err?.message || '家庭空间管理失败');
    return {
      success: false,
      error: errMsg
    };
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
