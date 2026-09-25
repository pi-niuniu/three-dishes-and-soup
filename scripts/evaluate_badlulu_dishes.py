import json
import os

with open('docs/badlulu_full_catalog.json', 'r', encoding='utf-8') as f:
    dishes = json.load(f)

# Rules for evaluating:
# 1. Niche / Hard-to-buy ingredients keywords:
NICHE_KEYWORDS = [
    '金雀花', '茉莉花', '树番茄', '折耳根', '思茅甜笋', '鹿茸菌', '臭鳜鱼', 
    '阿多波', '菲律宾', '参巴', '脱水大豆', '冰草', '白玉苦瓜', '芭蕉花',
    '羊蝎子', '海胆', '秋刀鱼', '红酸汤', '木姜子油'
]

# 2. Too difficult / tedious / deep-frying / heavy baking / dough kneading keywords:
HARD_KEYWORDS = [
    '避风塘炒蟹', '大包', '水饺', '馅饼', '韭菜盒子', '煎饼果子', 
    '现炸嫩豆腐', '厚炸猪排', '唐扬酥脆炸鸡块', '椒盐香酥炸平菇', '干炸卷心菜',
    '不炒糖色的辣卤红油肘子', '水晶皮冻', '韩式泡菜猪皮卷', '绝味香辣鸭架煲',
    '香辣吮指鸡骨棒', '香辣干锅鱼籽鱼泡'
]

# 3. Seasonal & very common vegetables / ingredients keywords:
COMMON_FAVORITES = [
    '土豆', '茄子', '西红柿', '黄瓜', '菠菜', '油菜', '大白菜', '娃娃菜', 
    '西葫芦', '洋葱', '蒜苔', '香芹', '韭菜', '荷兰豆', '春笋', '丝瓜', 
    '冬瓜', '豆腐', '鸡蛋', '鸡腿', '牛腩', '排骨', '里脊', '五花肉', '大虾'
]

for d in dishes:
    name = d['name']
    ing = d['ingredients']
    cat = d['category']
    status = d['status']
    
    # Assess ingredient accessibility
    is_niche = any(k in name or k in ing for k in NICHE_KEYWORDS)
    # Assess cooking difficulty
    is_hard = any(k in name or k in ing for k in HARD_KEYWORDS)
    
    # Detail check:
    # Deep fry or complex dough
    if '炸' in name and ('干炸' in name or '酥炸' in name or '厚炸' in name or '油爆' in name):
        is_hard = True
    if any(k in name for k in ['包子', '水饺', '馅饼', '皮冻', '煎饼果子', '大包']):
        is_hard = True

    # Rating
    if is_niche or is_hard:
        if is_niche and is_hard:
            rec_level = '🚫 剔除'
            reason = '食材偏门难买且制作繁琐'
        elif is_niche:
            rec_level = '🚫 剔除'
            reason = '食材冷门小众/不易买到'
        else:
            rec_level = '🚫 剔除'
            reason = '制作工序繁复/油炸或做面点不便'
    else:
        # Check if it is a common home favorite
        is_common = any(k in name or k in ing for k in COMMON_FAVORITES)
        if is_common:
            rec_level = '🌟 极力推荐'
            reason = '常见时令食材，做法快手家常，国民下饭'
        else:
            rec_level = '💡 特色备选'
            reason = '食材超市易得，风味独特，适宜换口味'

    d['rec_level'] = rec_level
    d['rec_reason'] = reason
    d['ingredient_rating'] = '🔴 偏门难买' if is_niche else ('🟢 常见好买' if is_common else '🟡 普通易购')
    d['difficulty_rating'] = '🔴 繁琐费时/油炸/面点' if is_hard else ('🟢 快手易做(10-20分)' if ('拌' in name or '炒蛋' in name or '快炒' in name or '蒸' in name) else '🟡 家常适中(20-35分)')

# Summary statistics
from collections import Counter
print("Recommendation distribution:")
print(Counter([d['rec_level'] for d in dishes]))

with open('docs/badlulu_full_catalog_rated.json', 'w', encoding='utf-8') as f:
    json.dump(dishes, f, ensure_ascii=False, indent=2)

print("Saved docs/badlulu_full_catalog_rated.json")
