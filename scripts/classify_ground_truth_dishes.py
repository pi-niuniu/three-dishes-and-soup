import json
import re

with open('scratch/unique_single_dishes.json', 'r', encoding='utf-8') as f:
    dishes = json.load(f)

# Keywords for categorization
CAT_RULES = [
    ('staple_sauce', ['面', '饭', '粉', '粥', '饺', '馄饨', '饼', '包子', '卷', '酱', '意面', '乌冬', '年糕', '河粉', '泡饭', '汤圆', '疙瘩汤', '拌面', '炒饭', '焖饭', '煲仔饭', '拉皮', '凉皮']),
    ('soup', ['汤', '锅', '煲', '羹', '羊蝎子', '腌笃鲜']),
    ('egg', ['蛋', '玉子烧', '北非蛋', '欧姆蛋', '摊蛋']),
    ('tofu', ['豆腐', '豆花', '腐竹', '千张', '百叶', '豆干', '香干', '豆皮']),
    ('vegetable', [
        '藕', '笋', '茄子', '土豆', '青椒', '红椒', '洋葱', '菠菜', '油菜', '大白菜', '白菜', 
        '娃娃菜', '包菜', '卷心菜', '西葫芦', '黄瓜', '冬瓜', '苦瓜', '丝瓜', '南瓜', '佛手瓜',
        '豆角', '豇豆', '四季豆', '荷兰豆', '豌豆', '毛豆', '蚕豆', '绿豆芽', '豆芽',
        '木耳', '香菇', '口蘑', '金针菇', '平菇', '蘑菇', '菌', '菜心', '芥蓝', '空心菜',
        '苋菜', '生菜', '莴笋', '芹菜', '蒜苔', '西芹', '番茄', '西红柿', '圣女果',
        '心里美', '萝卜', '秋葵', '折耳根', '香椿', '草头', '水芹', '荠菜', '红薯', '板栗',
        '山药', '山药豆', '苦菊', '冰草', '沙拉', '泡菜', '小菜', '凉拌'
    ]),
    ('main_meat', [
        '牛排', '牛腩', '牛肋', '牛肉', '牛骨', '排骨', '小排', '五花肉', '红烧肉', '肘子',
        '三黄鸡', '整鸡', '炖鸡', '小鸡', '土鸡', '公煲', '卤鸡', '鸭', '鹅', '羊肉',
        '大虾', '基围虾', '罗氏虾', '鲈鱼', '大黄鱼', '黄鱼', '带鱼', '鱼头', '三文鱼',
        '臭鳜鱼', '梭子蟹', '青蟹', '花蟹', '避风塘', '炒蟹', '生蚝', '扇贝'
    ]),
    ('secondary_meat', [
        '肉丝', '肉末', '肉片', '肉丁', '猪肉', '里脊', '五花', '鸡胸', '鸡腿', '鸡翅',
        '鸡爪', '鸡肝', '鸡心', '鸡架', '鸭血', '鸭肠', '猪肝', '猪心', '肥肠', '牛杂',
        '午餐肉', '腊肉', '腊肠', '培根', '火腿', '肉丸', '虾仁', '小河虾', '花蛤',
        '蛤蜊', '鱿鱼', '墨鱼', '小海鲜', '钵钵鸡', '咕咾肉', '炸鸡', '炸猪排', '皮冻'
    ])
]

# Exclusion rules (Niche / Hard / Heavy oil / Heavy dough)
NICHE_KW = [
    '臭鳜鱼', '秋刀鱼', '阿多波', '菲律宾', '参巴', '脱水大豆', '白玉苦瓜', '芭蕉花', 
    '木姜子油', '折耳根', '冰草', '鹿茸菌', '茉莉花', '金雀花', '思茅甜笋', '牛杂', 
    '牛肠', '沙丁鱼', '羊蝎子', '海胆', '鱼籽', '鱼泡', '生猪皮', '熟猪皮'
]

HARD_KW = [
    '避风塘炒蟹', '大包', '水饺', '馅饼', '韭菜盒子', '煎饼果子', '包子',
    '厚炸猪排', '唐扬酥脆炸鸡块', '椒盐香酥炸平菇', '干炸卷心菜', '现炸嫩豆腐',
    '炸猪排', '炸鸡块', '炸平菇', '干炸', '现炸', '天妇罗', '炸金枪鱼',
    '辣卤红油肘子', '水晶皮冻', '绝味香辣鸭架煲', '香辣吮指鸡骨棒', '泡菜猪皮卷',
    '火腿油条', '生煎', '手抓饼', '千层饼'
]

COMMON_INGREDIENTS = [
    '土豆', '茄子', '西红柿', '番茄', '黄瓜', '菠菜', '油菜', '青菜', '大白菜', 
    '娃娃菜', '包菜', '卷心菜', '西葫芦', '洋葱', '蒜苔', '香芹', '西芹', '韭菜', 
    '荷兰豆', '春笋', '丝瓜', '冬瓜', '南瓜', '藕', '金针菇', '香菇', '口蘑',
    '木耳', '豆腐', '千张', '百叶', '腐竹', '青椒', '红椒', '彩椒', '生菜', '豆角', 
    '豇豆', '绿豆芽', '红苋菜', '奶白菜', '佛手瓜', '白萝卜', '胡萝卜',
    '蚕豆', '红薯', '板栗', '山药', '山药豆',
    '鸡腿', '鸡胸', '鸡块', '鸡肉', '三黄鸡', '五花肉', '里脊', '肉末', '肉丝', '肉片',
    '猪小排', '排骨', '牛腩', '牛里脊', '牛肉', '肥牛', '鲜虾', '虾仁', '花蛤', 
    '蛤蜊', '鲈鱼', '鱼片', '鸡蛋', '咸肉', '腊肉', '腊肠', '午餐肉', '培根'
]

results = []

for d in dishes:
    title = d['title']
    pid = d['photo_id']
    
    # 1. Determine category
    assigned_cat = 'secondary_meat' # default
    # Special overrides:
    if any(k in title for k in ['煲仔饭', '炒饭', '焖饭', '菜饭', '意面', '面', '粉', '粥', '饼', '水饺', '饺', '炸酱']):
        assigned_cat = 'staple_sauce'
    elif any(k in title for k in ['锅', '汤', '羹', '煲']) and '煲仔饭' not in title and '公煲' not in title and '生鸡煲' not in title:
        assigned_cat = 'soup'
    elif any(k in title for k in ['蛋', '玉子烧', '北非蛋']):
        assigned_cat = 'egg'
    elif any(k in title for k in ['豆腐', '豆花', '腐竹', '千张', '百叶']):
        assigned_cat = 'tofu'
    elif any(k in title for k in ['鸡公煲', '牛骨', '排骨', '小排', '红烧肉', '整鸡', '炖牛肉', '红烩牛肉', '牛肋', '鱼头', '炖鸡', '烤鸡腿', '烤鱼', '臭鳜鱼']):
        assigned_cat = 'main_meat'
    else:
        # Check against rules
        matched = False
        for cat_name, kw_list in CAT_RULES:
            if any(k in title for k in kw_list):
                assigned_cat = cat_name
                matched = True
                break
        if not matched:
            assigned_cat = 'vegetable' if ('炒' in title or '拌' in title) else 'secondary_meat'
            
    # Category name
    cat_names = {
        'main_meat': '主荤大菜',
        'secondary_meat': '下饭副荤',
        'vegetable': '时令鲜蔬',
        'egg': '蛋类快手',
        'tofu': '豆制品',
        'soup': '养生汤品暖锅',
        'staple_sauce': '特色主食拌酱'
    }
    
    # 2. Evaluation against user criteria
    is_niche = any(k in title for k in NICHE_KW)
    is_hard = any(k in title for k in HARD_KW)
    
    if is_niche or is_hard:
        rec_level = '🚫 建议剔除'
        reasons = []
        if is_niche:
            reasons.append('食材冷门小众/生鲜超市难买')
        if is_hard:
            reasons.append('工序繁琐/大锅油炸或重度面点')
        reason = '；'.join(reasons)
        ing_rating = '🔴 偏门难买' if is_niche else '🟡 常见易购'
        diff_rating = '🔴 繁琐费时/油炸/面点' if is_hard else '🟡 家常适中'
    else:
        is_common = any(k in title for k in COMMON_INGREDIENTS)
        if is_common:
            rec_level = '🌟 极力推荐'
            reason = '时令蔬菜/常见家常原料，超市菜场标配，快手好做'
            ing_rating = '🟢 极易买到'
            diff_rating = '🟢 快手易做 (10-25m)' if ('拌' in title or '炒' in title or '蒸' in title or '汤' in title) else '🟡 家常适中 (25-35m)'
        else:
            rec_level = '💡 特色备选'
            reason = '食材主流超市可购，风味具有特色，适合调剂口味'
            ing_rating = '🟡 较为常见'
            diff_rating = '🟡 家常适中 (20-30m)'
            
    results.append({
        'name': title,
        'photo_id': pid,
        'category': assigned_cat,
        'category_name': cat_names[assigned_cat],
        'rec_level': rec_level,
        'rec_reason': reason,
        'ingredient_rating': ing_rating,
        'difficulty_rating': diff_rating,
        'photo_url': d['url'],
        'img_l': d['img_l'],
        'local_path': f"/Users/zhuangxiji/Desktop/一日三餐/docs/badlulu_dishes_groundtruth/{assigned_cat}/{assigned_cat}_{pid}_{title}.jpg",
        'relative_path': f"docs/badlulu_dishes_groundtruth/{assigned_cat}/{assigned_cat}_{pid}_{title}.jpg"
    })

print(f"Total processed ground-truth dishes: {len(results)}")
from collections import Counter
print("Breakdown by recommendation tier:")
print(Counter([r['rec_level'] for r in results]))
print("\nBreakdown by category:")
print(Counter([r['category'] for r in results]))

with open('scratch/ground_truth_catalog_rated.json', 'w', encoding='utf-8') as f:
    json.dump(results, f, ensure_ascii=False, indent=2)

print("\nSaved scratch/ground_truth_catalog_rated.json")
