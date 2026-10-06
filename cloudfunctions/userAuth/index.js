const cloud = require('wx-server-sdk');

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
});

const db = cloud.database();

// users/families 为家庭核心集合，meal_history/custom_dishes 为就餐历史与私房菜实际使用的集合
const REQUIRED_COLLECTIONS = ['users', 'families', 'dishes', 'meals', 'meal_history', 'custom_dishes'];
let collectionsReady = false;

/**
 * 集合自愈创建：新环境未手动建表时自动创建，createCollection 报错时用 count() 确认是否已存在；
 * 任一集合未确认就绪则下次调用继续重试
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
        console.error(`[userAuth] 集合 ${name} 自愈创建失败:`, createErr, probeErr);
      }
    }
  }
  collectionsReady = allReady;
}

function getErrText(err) {
  return String(err?.errMsg || err?.message || (typeof err === 'object' ? JSON.stringify(err) : err) || '').toLowerCase();
}

/**
 * 判断是否为集合（表）不存在错误
 */
function isCollectionNotExistError(err) {
  if (!err) return false;
  const msg = getErrText(err);
  return (
    msg.includes('collection not exist') ||
    msg.includes('collection_not_exist') ||
    msg.includes('table not exist') ||
    msg.includes('db or table not exist')
  );
}

/**
 * 判断是否为文档不存在（集合缺失不算，需要先自愈建表）
 */
function isDocNotFoundError(err) {
  if (!err || isCollectionNotExistError(err)) return false;
  const code = err?.errCode ?? err?.code;
  if (code === -502005 || String(code) === '-502005') return true;
  const msg = getErrText(err);
  return msg.includes('does not exist') || msg.includes('not exist') || msg.includes('not found');
}

async function handleAuth(event, openid) {
  const now = Date.now();
  const userDocRef = db.collection('users').doc(`user_${openid}`);
  let user = null;

  try {
    const res = await userDocRef.get();
    user = res.data;
  } catch (e) {
    // 仅「文档不存在」才视为首次访问建档；超时等异常必须抛出，严禁用空档案覆盖已有家庭归属
    if (!isDocNotFoundError(e)) throw e;
  }

  if (!user) {
    const userData = {
      openid,
      nickName: event.nickName || '家人',
      avatarUrl: event.avatarUrl || '',
      familyId: null,
      role: null,
      createdAt: now,
      updatedAt: now
    };
    await userDocRef.set({ data: userData });
    user = { _id: `user_${openid}`, ...userData };
  } else if (event.nickName || event.avatarUrl) {
    // 更新昵称/头像
    const updateData = { updatedAt: now };
    if (event.nickName) updateData.nickName = event.nickName;
    if (event.avatarUrl) updateData.avatarUrl = event.avatarUrl;
    await userDocRef.update({ data: updateData });
    user = { ...user, ...updateData };
  }

  // 若绑定了家庭，获取家庭最新信息
  let family = null;
  let familyFetchError = false;
  if (user.familyId) {
    let famData = null;
    try {
      const famRes = await db.collection('families').doc(user.familyId).get();
      famData = (famRes && famRes.data) ? famRes.data : null;
    } catch (err) {
      if (!isDocNotFoundError(err)) {
        // 瞬时异常：保留用户的家庭归属，告知客户端本次未能拉取，客户端保留本地缓存
        console.warn('[userAuth] 获取用户所属家庭异常，保留归属不重置:', err);
        familyFetchError = true;
      }
    }

    const isStillMember = famData && (
      (famData.memberOpenids || []).includes(openid) ||
      (famData.members || []).some(m => m.openid === openid)
    );

    if (isStillMember) {
      family = {
        id: famData._id || user.familyId,
        _id: famData._id || user.familyId,
        ...famData
      };
      const expectedRole = famData.creatorOpenid === openid ? 'creator' : 'member';
      if (user.role !== expectedRole) {
        await userDocRef.update({ data: { role: expectedRole, updatedAt: now } }).catch(() => {});
        user = { ...user, role: expectedRole };
      }
    } else if (!familyFetchError) {
      // 家庭已解散或本人已被移出：重置用户的家庭归属
      await userDocRef.update({
        data: { familyId: null, role: null, updatedAt: now }
      });
      user = { ...user, familyId: null, role: null };
    }
  }

  return {
    success: true,
    openid,
    user,
    family,
    familyFetchError
  };
}

/**
 * userAuth 云函数：用户静默鉴权与档案获取
 */
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
    return await handleAuth(event, openid);
  } catch (err) {
    if (isCollectionNotExistError(err)) {
      console.warn('[userAuth] 检测到集合不存在，自愈建表后重试:', err);
      await ensureCollections(true);
      try {
        return await handleAuth(event, openid);
      } catch (retryErr) {
        return { success: false, error: retryErr?.message || '用户鉴权失败' };
      }
    }
    return {
      success: false,
      error: err?.message || '用户鉴权失败'
    };
  }
};
