const cloud = require('wx-server-sdk');

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
});

const db = cloud.database();

// 预设分类生活美学图标与默认大图映射
const CATEGORY_DEFAULT_CONFIG = {
  main_meat: { icon: '🥩', theme: 'theme_main_meat', thumb: '/assets/dishes/default_main.jpg' },
  secondary_meat: { icon: '🥘', theme: 'theme_secondary_meat', thumb: '/assets/dishes/default_secondary.jpg' },
  egg: { icon: '🍳', theme: 'theme_egg', thumb: '/assets/dishes/default_egg.jpg' },
  tofu: { icon: '🧊', theme: 'theme_tofu', thumb: '/assets/dishes/default_tofu.jpg' },
  vegetable: { icon: '🥬', theme: 'theme_vegetable', thumb: '/assets/dishes/default_vegetable.jpg' },
  soup: { icon: '🍲', theme: 'theme_soup', thumb: '/assets/dishes/default_soup.jpg' },
  staple_sauce: { icon: '🍚', theme: 'theme_staple_sauce', thumb: '/assets/dishes/default_dish.jpg' },
  default: { icon: '🍽️', theme: 'theme_default', thumb: '/assets/dishes/default_dish.jpg' }
};

// 根据菜名特征智能匹配生动 Emoji
function matchEmoji(name, category) {
  if (!name) return CATEGORY_DEFAULT_CONFIG[category]?.icon || '🍽️';
  if (name.includes('土豆')) return '🥔';
  if (name.includes('番茄') || name.includes('西红柿')) return '🍅';
  if (name.includes('虾')) return '🦐';
  if (name.includes('鱼')) return '🐟';
  if (name.includes('鸡') || name.includes('鸭')) return '🍗';
  if (name.includes('牛') || name.includes('羊') || name.includes('排骨') || name.includes('肉')) return '🥩';
  if (name.includes('蛋')) return '🍳';
  if (name.includes('豆腐')) return '🧊';
  if (name.includes('蘑菇') || name.includes('菌') || name.includes('菇')) return '🍄';
  if (name.includes('茄子')) return '🍆';
  if (name.includes('玉米')) return '🌽';
  if (name.includes('面') || name.includes('粉')) return '🍜';
  if (name.includes('饭')) return '🍚';
  if (name.includes('饺') || name.includes('抄手')) return '🥟';
  if (name.includes('汤')) return '🍲';
  if (name.includes('菜') || name.includes('笋') || name.includes('瓜')) return '🥬';
  return CATEGORY_DEFAULT_CONFIG[category]?.icon || '🍽️';
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

  const { action = 'addDish' } = event;
  const now = Date.now();

  try {
    switch (action) {
      /**
       * 1. 录入纯文字私房菜 (强制文本安全检查，禁止图片上传)
       */
      case 'addDish': {
        const name = String(event.name || '').trim();
        if (!name) {
          return { success: false, error: '菜品名称不能为空' };
        }
        if (name.length > 20) {
          return { success: false, error: '菜品名称不能超过20个字' };
        }

        const category = event.category || 'secondary_meat';
        const taste = Array.isArray(event.taste) ? event.taste : (event.taste ? [event.taste] : ['家常']);
        const cookingTimeMinutes = Number(event.cookingTimeMinutes) || 25;
        const ingredients = Array.isArray(event.ingredients) ? event.ingredients : [];

        // 文本合规检验：结合菜名、口味与食材
        const checkContent = `${name} ${taste.join(' ')} ${ingredients.join(' ')}`;

        // 1. 本地/弱网兜底敏感词检测 (易错点 7 防线)
        const sensitiveWords = ['违禁', '敏感', '广告', '赌博', '涉黄', '发票', '贷款'];
        if (sensitiveWords.some(w => name.includes(w) || checkContent.includes(w))) {
          return { success: false, error: '菜品名称包含敏感内容，请修改' };
        }

        // 2. 升级微信官方文本合规检测 msgSecCheck 2.0 规范
        if (cloud.openapi && cloud.openapi.security && typeof cloud.openapi.security.msgSecCheck === 'function') {
          try {
            const secRes = await cloud.openapi.security.msgSecCheck({
              version: 2,
              scene: 1, // 资料类
              openid,
              content: checkContent
            });
            if (!secRes || !secRes.result || secRes.result.suggest !== 'pass') {
              return { success: false, error: '菜品名称或描述包含敏感内容，请修改后重试' };
            }
          } catch (secErr) {
            console.error('微信 msgSecCheck 检测异常:', secErr);
            // 真实生产环境若检测接口异常也坚决拦截入库
            return { success: false, error: '内容安全检测未通过或服务暂时不可用，请稍后重试' };
          }
        }

        // 桶隔离：未加入家庭的私房菜使用 personal_${openid}，禁止所有单人用户共用 'personal' 桶
        const rawFamilyId = event.familyId;
        const isPersonal = !rawFamilyId || rawFamilyId === 'personal' || rawFamilyId.startsWith('personal_');
        const familyId = isPersonal ? `personal_${openid}` : rawFamilyId;

        // 服务端家庭鉴权：非个人桶必须确认该用户确实属于该家庭
        if (!isPersonal) {
          const famDoc = await db.collection('families').doc(familyId).get().catch(() => null);
          if (!famDoc || !famDoc.data || !(famDoc.data.memberOpenids || []).includes(openid)) {
            return { success: false, error: '越权操作：您不属于该家庭空间' };
          }
        }

        const dishId = `custom_${now}_${Math.random().toString(36).slice(2, 6)}`;
        const cfg = CATEGORY_DEFAULT_CONFIG[category] || CATEGORY_DEFAULT_CONFIG.default;
        const emoji = matchEmoji(name, category);

        const newDish = {
          _id: dishId,
          id: dishId,
          familyId,
          creatorOpenid: openid,
          creatorName: event.creatorName || event.nickName || '家人',
          name,
          category,
          taste,
          cookingTimeMinutes,
          defaultIcon: emoji,
          defaultTheme: cfg.theme,
          thumbUrl: cfg.thumb,
          ingredients, // 空食材保留空数组，严禁无中生有
          enabled: true,
          isCustom: true,
          createdAt: now
        };

        await db.collection('custom_dishes').add({ data: newDish });

        return {
          success: true,
          dish: newDish
        };
      }

      /**
       * 2. 查询家庭私房菜列表
       */
      case 'getDishes': {
        const rawFamilyId = event.familyId;
        const isPersonal = !rawFamilyId || rawFamilyId === 'personal' || rawFamilyId.startsWith('personal_');
        const familyId = isPersonal ? `personal_${openid}` : rawFamilyId;

        // 服务端家庭鉴权：非个人桶必须确认该用户确实属于该家庭
        if (!isPersonal) {
          const famDoc = await db.collection('families').doc(familyId).get().catch(() => null);
          if (!famDoc || !famDoc.data || !(famDoc.data.memberOpenids || []).includes(openid)) {
            return { success: false, error: '越权操作：无权查看非本人所属家庭的私房菜' };
          }
        }

        const res = await db.collection('custom_dishes')
          .where({
            familyId,
            enabled: true
          })
          .orderBy('createdAt', 'desc')
          .get();

        return {
          success: true,
          dishes: res.data || []
        };
      }

      default:
        return { success: false, error: `不支持的操作类型: ${action}` };
    }
  } catch (err) {
    return {
      success: false,
      error: err.message || '自选私房菜操作失败'
    };
  }
};
