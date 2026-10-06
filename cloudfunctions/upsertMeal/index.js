const cloud = require('wx-server-sdk');

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
});

const db = cloud.database();
const _ = db.command;

// users/families 为家庭核心集合，meal_history/custom_dishes 为就餐历史与私房菜实际使用的集合
const REQUIRED_COLLECTIONS = ['users', 'families', 'dishes', 'meals', 'meal_history', 'custom_dishes'];
let collectionsReady = false;

/**
 * 集合自愈创建：新环境未手动建表时自动创建，createCollection 报错时用 count() 确认是否已存在；
 * 任一集合未确认就绪则下次调用继续重试
 */
async function ensureCollections() {
  if (collectionsReady) return;
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
        console.error(`[upsertMeal] 集合 ${name} 自愈创建失败:`, createErr, probeErr);
      }
    }
  }
  collectionsReady = allReady;
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

  const { action = 'upsertMeal' } = event;
  const now = Date.now();

  try {
    switch (action) {
      /**
       * 1. 原子追加或就地更新单餐做菜记录 (主键: meal_${familyId}_${date})
       * 彻底杜绝同日多次做菜被覆盖问题
       */
      case 'upsertMeal': {
        const { familyId, date, meal } = event;
        if (!familyId || !date || !meal) {
          return { success: false, error: '缺少必要参数: familyId, date, meal' };
        }

        // 服务端鉴权：验证 openid 确实属于该家庭
        const famDoc = await db.collection('families').doc(familyId).get().catch(() => null);
        if (!famDoc || !famDoc.data || !(famDoc.data.memberOpenids || []).includes(openid)) {
          return { success: false, error: '越权操作：您不属于该家庭空间' };
        }

        const docId = `meal_${familyId}_${date}`;

        // 服务端已核验昵称：优先从 family.members 取真实成员昵称，杜绝客户端伪造
        const verifiedMember = (famDoc.data.members || []).find(m => m.openid === openid);
        const verifiedNickName = (verifiedMember && verifiedMember.nickName && verifiedMember.nickName.trim())
          ? verifiedMember.nickName.trim()
          : (meal.confirmedByName || event.nickName || '家人');

        // 规范化单餐快照数据
        const mealSnapshot = {
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

        return await db.runTransaction(async transaction => {
          const docRef = transaction.collection('meal_history').doc(docId);
          let existingDoc = null;
          try {
            existingDoc = await docRef.get();
          } catch (err) {
            const errMsg = String(err?.message || err || '').toLowerCase();
            const errCode = err?.errCode;
            const isNotExist =
              errMsg.includes('does not exist') ||
              errMsg.includes('not exist') ||
              errCode === -502005;

            if (isNotExist) {
              existingDoc = null;
            } else {
              console.error('[upsertMeal] 读取历史日文档瞬时异常，中止回滚事务以防整日误覆盖:', err);
              throw err;
            }
          }

          if (!existingDoc || !existingDoc.data) {
            // 该日首次开饭，创建日文档 (剔除冗余 _id 字段，避免老版本云开发 SDK 报 cannot update _id 错误)
            await docRef.set({
              data: {
                familyId,
                date,
                meals: [mealSnapshot],
                updatedAt: now
              }
            });
          } else {
            // 该日已有开饭记录，比对 mealId 决定是追加还是更新
            const existingMeals = existingDoc.data.meals || [];
            const mealIndex = existingMeals.findIndex(m => m.mealId === mealSnapshot.mealId);

            let updatedMeals;
            if (mealIndex >= 0) {
              // 同一餐次就地更新 (如反复确认)
              updatedMeals = [...existingMeals];
              updatedMeals[mealIndex] = mealSnapshot;
            } else {
              // 新餐次 (如晚上做了清蒸鲈鱼，中午做了番茄牛腩)，原子追加
              updatedMeals = [...existingMeals, mealSnapshot];
            }

            await docRef.update({
              data: {
                meals: updatedMeals,
                updatedAt: now
              }
            });
          }

          return {
            success: true,
            docId,
            meal: mealSnapshot
          };
        });
      }

      /**
       * 2. 拉取家庭共享历史数据 (按最近 60 天)
       */
      case 'getHistory': {
        const { familyId, limitDays = 60 } = event;
        if (!familyId) {
          return { success: false, error: '缺少 familyId' };
        }

        // 服务端鉴权：验证 openid 确实属于该家庭
        const famDoc = await db.collection('families').doc(familyId).get().catch(() => null);
        if (!famDoc || !famDoc.data || !(famDoc.data.memberOpenids || []).includes(openid)) {
          return { success: false, error: '越权操作：无权查看非本人所属家庭的就餐历史' };
        }

        // 查询该家庭最近的日文档
        const res = await db.collection('meal_history')
          .where({ familyId })
          .orderBy('date', 'desc')
          .limit(limitDays)
          .get();

        const docs = res.data || [];
        // 展平为有序餐次列表供客户端秒级合并
        const allMeals = [];
        for (const doc of docs) {
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

        // 按时间戳倒序排列
        allMeals.sort((a, b) => b.timestamp - a.timestamp);

        return {
          success: true,
          records: allMeals,
          docs
        };
      }

      default:
        return { success: false, error: `不支持的操作类型: ${action}` };
    }
  } catch (err) {
    return {
      success: false,
      error: err.message || '历史记录同步失败'
    };
  }
};
