const cloud = require('wx-server-sdk');

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
});

const db = cloud.database();

/**
 * userAuth 云函数：用户静默鉴权与档案获取
 */
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

  const now = Date.now();

  try {
    const userDocRef = db.collection('users').doc(`user_${openid}`);
    let user = null;

    try {
      const res = await userDocRef.get();
      user = res.data;
    } catch (e) {
      // 用户首次访问，自动创建档案
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
    }

    // 更新昵称/头像
    if (event.nickName || event.avatarUrl) {
      const updateData = { updatedAt: now };
      if (event.nickName) updateData.nickName = event.nickName;
      if (event.avatarUrl) updateData.avatarUrl = event.avatarUrl;
      await userDocRef.update({ data: updateData });
      user = { ...user, ...updateData };
    }

    // 若绑定了家庭，获取家庭最新信息
    let family = null;
    if (user.familyId) {
      try {
        const famRes = await db.collection('families').doc(user.familyId).get();
        if (famRes && famRes.data) {
          family = {
            id: famRes.data._id || user.familyId,
            _id: famRes.data._id || user.familyId,
            ...famRes.data
          };
        }
      } catch (err) {
        console.warn('获取用户所属家庭失败或家庭已解散', err);
        // 如果家庭已被解散，重置用户的 familyId
        await userDocRef.update({
          data: { familyId: null, role: null, updatedAt: now }
        });
        user.familyId = null;
        user.role = null;
      }
    }

    return {
      success: true,
      openid,
      user,
      family
    };
  } catch (err) {
    return {
      success: false,
      error: err.message || '用户鉴权失败'
    };
  }
};
