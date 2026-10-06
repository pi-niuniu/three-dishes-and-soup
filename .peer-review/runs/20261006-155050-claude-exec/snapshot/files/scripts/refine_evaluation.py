import json

with open('docs/badlulu_full_catalog_rated.json', 'r', encoding='utf-8') as f:
    dishes = json.load(f)

# Refined rules:
for d in dishes:
    name = d['name']
    ing = d['ingredients']
    cat = d['category']
    status = d['status']
    
    # 1. Check if definitely niche / hard to buy:
    niche_reasons = []
    if any(k in name or k in ing for k in ['金雀花', '茉莉花', '树番茄', '思茅甜笋', '鹿茸菌', '臭鳜鱼', '阿多波', '菲律宾', '参巴', '脱水大豆', '白玉苦瓜', '芭蕉花', '木姜子油', '折耳根']):
        niche_reasons.append('原料属于云南/异域小众野菜或特产，普通菜场难买')
    if any(k in name or k in ing for k in ['牛杂', '牛肠']):
        niche_reasons.append('新鲜牛杂生牛肠家庭极难买且清洗除腥过于繁琐')
    if any(k in name or k in ing for k in ['沙丁鱼']):
        niche_reasons.append('新鲜沙丁鱼柳非我国家常菜场常见鱼类')
    if any(k in name or k in ing for k in ['秋刀鱼']):
        niche_reasons.append('秋刀鱼家庭日常极少烹饪，冷冻品腥味重')
    if any(k in name or k in ing for k in ['冰草']):
        niche_reasons.append('冰草属于小众西餐沙拉生菜，常温不易保鲜且难买')
    if any(k in name or k in ing for k in ['熟猪皮', '生猪肉皮']):
        niche_reasons.append('猪皮需耗费大量时间刮毛、去脂、长时间熬煮冷藏')
    if any(k in name or k in ing for k in ['羊蝎子']):
        niche_reasons.append('羊蝎子处理骨渣与炖煮工序重，非家常快手菜')
        
    # 2. Check if definitely too hard / tedious / heavy oil / heavy dough:
    hard_reasons = []
    if any(k in name for k in ['避风塘炒蟹', '大包', '水饺', '馅饼', '韭菜盒子', '煎饼果子']):
        hard_reasons.append('属于重度面点（发面/擀皮/包馅/烙饼）或杀活蟹裹糠油炸，工序门槛过高')
    if any(k in name for k in ['厚炸猪排', '唐扬酥脆炸鸡块', '椒盐香酥炸平菇', '干炸卷心菜', '现炸嫩豆腐']):
        hard_reasons.append('需大锅宽油油炸，家庭日常做油烟大且费油，不便清理')
    if any(k in name for k in ['辣卤红油肘子', '水晶皮冻', '绝味香辣鸭架煲', '香辣吮指鸡骨棒', '香辣干锅鱼籽鱼泡']):
        hard_reasons.append('需耗时数小时慢炖卤制，或处理鱼泡骨棒等繁复工序')
        
    # Combine decision
    if niche_reasons or hard_reasons:
        d['rec_level'] = '🚫 剔除'
        d['rec_reason'] = '；'.join(niche_reasons + hard_reasons)
        d['ingredient_rating'] = '🔴 偏门难买' if niche_reasons else '🟡 普通易购'
        d['difficulty_rating'] = '🔴 繁琐费时/油炸/面点' if hard_reasons else '🟡 家常适中'
    else:
        # Check commonality:
        # High frequency common home ingredients
        common_veg = ['土豆', '茄子', '西红柿', '黄瓜', '菠菜', '油菜', '大白菜', '娃娃菜', '西葫芦', '洋葱', '蒜苔', '香芹', '西芹', '韭菜', '荷兰豆', '春笋', '丝瓜', '冬瓜', '南瓜', '藕', '金针菇', '香菇', '木耳', '豆腐', '干豆腐', '千张', '腐竹', '青椒', '红椒', '生菜', '豆角', '豇豆', '绿豆芽', '红苋菜', '奶白菜', '佛手瓜']
        common_meat = ['鸡腿', '鸡胸', '鸡翅', '五花肉', '里脊', '猪小排', '排骨', '牛腩', '牛里脊', '牛肉', '大虾', '虾仁', '花蛤', '鲈鱼', '鲜鱼片', '鸡蛋', '咸肉', '腊肉', '腊肠']
        
        is_very_common_veg = any(k in name or k in ing for k in common_veg)
        is_very_common_meat = any(k in name or k in ing for k in common_meat)
        
        # Check quick / easy
        is_quick = any(k in name for k in ['炒', '拌', '蒸', '炖豆腐', '焖饭', '快汤', '清汤', '一锅出', '炒面', '炒饭', '凉面'])
        
        if (is_very_common_veg or is_very_common_meat) and is_quick:
            d['rec_level'] = '🌟 极力推荐'
            d['rec_reason'] = '常见时令食材，全网超市菜场易购，做法快手家常好上手'
            d['ingredient_rating'] = '🟢 极易买到'
            d['difficulty_rating'] = '🟢 快手易做(10-20分)' if ('拌' in name or '炒蛋' in name or '蒸' in name or '快炒' in name) else '🟡 家常适中(20-30分)'
        else:
            d['rec_level'] = '💡 特色备选'
            d['rec_reason'] = '食材主流超市可购，风味具有特色，适合周末或换口味烹制'
            d['ingredient_rating'] = '🟡 较为常见'
            d['difficulty_rating'] = '🟡 家常适中(20-35分)'

from collections import Counter
print("Refined Recommendation distribution:")
print(Counter([d['rec_level'] for d in dishes]))

with open('docs/badlulu_full_catalog_rated.json', 'w', encoding='utf-8') as f:
    json.dump(dishes, f, ensure_ascii=False, indent=2)

