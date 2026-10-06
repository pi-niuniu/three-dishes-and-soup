import json

with open('docs/badlulu_full_catalog.json', 'r', encoding='utf-8') as f:
    dishes = json.load(f)

# Define explicit rules for all 182 dishes:

# 1. Definite Exclusions (33 dishes)
EXCLUDE_RULES = {
    # Niche/Hard to buy
    '徽州古法红烧臭鳜鱼': '发酵臭鳜鱼属特定徽州食材，普通菜场难买',
    '白味噌烤秋刀鱼': '秋刀鱼家庭极少采买烹饪，冷冻品腥味重',
    '菲律宾阿多波酸香卤鸡 (Adobo)': '菲律宾阿多波专用风味配比非中式家常口味',
    '滇味双瓜解暑小炒 (苦瓜炒冬瓜)': '白玉苦瓜为特定品种苦瓜，不易普遍采买',
    '蒜香爆炒鲜鹿茸菌': '鲜鹿茸菌属特色小众野生食用菌，菜场罕见',
    '冰草小番茄和风沙拉': '冰草保鲜期极短，普通菜场不易购买',
    '甘冽清润雪梨凉拌苦瓜': '采用白玉苦瓜，配雪梨偏甜苦结合小众吃法',
    '云南茉莉花炒土鸡蛋': '食用鲜茉莉花季节性极强且极难买到',
    '马来风味香辣炒豆腐': '参巴酱等东南亚特定调料不易普及',
    '韩式香辣酱汁拌素肉': '脱水大豆素肉非日常餐桌常见天然原料',
    '云南思茅甜笋炖鸡汤': '云南思茅鲜甜笋为云南特定产地食材，全国难买',
    '贵州凯里酸汤鱼火锅': '贵州红酸汤及木姜子油非全国日常家庭常备调料',
    '老北京冬日滋补羊蝎子火锅': '羊蝎子需剔骨砍块深度焯水除腥慢煨，工序繁琐且原料不易买',
    '日式浓汤牛杂暖锅 (昨日的美食复刻)': '生牛肠/生牛杂家庭处理除腥除油极度繁琐且不易买到干净生鲜原料',
    
    # Too hard / deep-frying / heavy dough kneading
    '不炒糖色的辣卤红油肘子': '大猪肘慢卤耗时2-3小时，油脂过大非快手菜',
    '港式经典避风塘炒蟹': '活蟹改刀裹生粉大锅宽油深炸，家庭做费油油烟大',
    '香辣干锅鱼籽鱼泡': '鲜鱼籽鱼泡清洗破膜去腥繁琐，烹饪火候易爆裂',
    '日式金黄厚炸猪排': '需裹三层粉（面粉/蛋液/面包糠）宽油深炸，家庭不便',
    '绝味香辣鸭架煲': '需专门采购或利用整只烤鸭架，工序繁多',
    '香辣吮指鸡骨棒': '鸡骨棒肉少骨硬，处理需专门香料且不如下饭家常肉菜',
    '韩式泡菜猪皮卷': '猪皮去毛去脂慢煮卷扎，工序极其繁重',
    '晶莹弹润老北京水晶皮冻': '猪皮刮油、切丝、慢熬、冷藏成冻耗时数小时',
    '日式唐扬酥脆炸鸡块': '传统唐扬需宽油两次复炸，家庭厨房油烟油耗大',
    '小森林之干炸卷心菜': '整片卷心菜深油干炸，家庭做吸油过多不健康且难控温',
    '椒盐香酥炸平菇': '裹面糊大火宽油油炸，容易吸油变软，家庭操作门槛高',
    '日式外脆里嫩现炸嫩豆腐': '嫩豆腐极易碎，裹粉油炸技术难度高且需宽油',
    '皮薄大馅鲜美羊肉萝卜馅饼': '和面、醒面、剁馅、包饼、烙饼，属于重度面点',
    '春季限定皮薄馅香韭菜苔馅饼': '擀皮包烙重度面食工序，不适合一日三餐快手烹制',
    '香脆金黄家常韭菜盒子': '烫面、擀皮、包花边、平底锅慢煎，费时费力',
    '清甜多汁西葫芦鸡蛋水饺': '包饺子工序门槛极高，家庭日常单餐耗时过长',
    '东北手工酸菜猪肉粉条大包': '发酵面团、调馅、包大包子、上屉蒸制，耗时1.5小时以上',
    '皮薄金黄家常煎饼果子': '调制杂粮面糊、炸薄脆、摊饼裹酱，需专用摊饼工具',
    '日式香煎黄金脆皮沙丁鱼排': '沙丁鱼柳需剔刺裹面包糠半煎炸，家庭菜场难买且易碎'
}

# 2. Categorization logic for remaining dishes:
# Common seasonal vegetables and daily meat/protein:
VERY_COMMON_INGREDIENTS = [
    '土豆', '茄子', '西红柿', '番茄', '黄瓜', '菠菜', '油菜', '青菜', '大白菜', 
    '娃娃菜', '包菜', '西葫芦', '洋葱', '蒜苔', '香芹', '西芹', '韭菜', 
    '荷兰豆', '春笋', '丝瓜', '冬瓜', '南瓜', '藕', '金针菇', '香菇', '口蘑',
    '木耳', '豆腐', '千张', '腐竹', '青椒', '红椒', '彩椒', '生菜', '豆角', 
    '豇豆', '绿豆芽', '红苋菜', '奶白菜', '佛手瓜', '苦瓜', '白萝卜', '胡萝卜',
    '蚕豆', '红薯', '板栗',
    '鸡腿', '鸡胸', '鸡块', '鸡肉', '三黄鸡', '五花肉', '里脊', '肉末', '肉丝', 
    '猪小排', '排骨', '牛腩', '牛里脊', '牛肉', '肥牛', '鲜虾', '基围虾', 
    '虾仁', '花蛤', '鲈鱼', '鲫鱼', '黑鱼', '鸡蛋', '咸肉', '腊肉', '腊肠'
]

# Regional/specialty ingredients that are accessible in mainstream supermarkets (Hema/Dingdong) but distinct:
SPECIALTY_TAGS = [
    '紫苏', '沙姜', '黄贡椒', '烟笋', '榄角', '糟卤', '外婆菜', '味噌', '酸菜', 
    '酸豆角', '菜脯', '咸蛋黄', '金平', '泰式', '地中海', '和风', '金枪鱼', 
    '鸡肝', '鸡心', '鸡翅尖', '羊肉', '香茅草'
]

for d in dishes:
    name = d['name']
    ing = d['ingredients']
    
    if name in EXCLUDE_RULES:
        d['rec_level'] = '🚫 建议剔除'
        d['rec_reason'] = EXCLUDE_RULES[name]
        d['ingredient_rating'] = '🔴 偏门难买' if ('难买' in d['rec_reason'] or '罕见' in d['rec_reason'] or '特定' in d['rec_reason']) else '🟡 普通易购'
        d['difficulty_rating'] = '🔴 繁琐费时/油炸/面点' if ('炸' in d['rec_reason'] or '面点' in d['rec_reason'] or '饼' in d['rec_reason'] or '包' in d['rec_reason'] or '耗时' in d['rec_reason']) else '🟡 家常适中'
    else:
        # Check if specialty
        has_specialty = any(s in name or s in ing for s in SPECIALTY_TAGS)
        
        # Check if quick and standard home cooking
        if not has_specialty:
            d['rec_level'] = '🌟 极力推荐'
            d['rec_reason'] = '常见时令食材，菜场超市极易买到，做法亲民快手，国民家常下饭'
            d['ingredient_rating'] = '🟢 极易买到 (全网标配)'
            d['difficulty_rating'] = '🟢 快手易做 (10-25分钟)' if ('拌' in name or '炒' in name or '蒸' in name or '汤' in name or '炒饭' in name or '炒面' in name) else '🟡 家常适中 (25-35分钟)'
        else:
            d['rec_level'] = '💡 特色备选'
            d['rec_reason'] = '食材主流生鲜超市可购，具备独特地域或风味特色，适宜丰富餐桌换口味'
            d['ingredient_rating'] = '🟡 较为常见 (生鲜超市有售)'
            d['difficulty_rating'] = '🟡 家常适中 (20-35分钟)'

from collections import Counter
counts = Counter([d['rec_level'] for d in dishes])
print("Final Categorization Breakdown:")
for k, v in counts.items():
    print(f"  {k}: {v} 道")

with open('docs/badlulu_full_catalog_rated.json', 'w', encoding='utf-8') as f:
    json.dump(dishes, f, ensure_ascii=False, indent=2)

print("\nSaved docs/badlulu_full_catalog_rated.json")
