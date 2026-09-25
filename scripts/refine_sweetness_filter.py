import json

with open('scratch/ground_truth_catalog_sweet_audited.json', 'r', encoding='utf-8') as f:
    dishes = json.load(f)

# Comprehensive list of sweet/dessert items to exclude:
EXCLUDE_SWEET_ITEMS = [
    # Drinks / Desserts / Snacks
    '草莓奶啤', '火龙果小餐包', '毛豆麻薯', '薯条', '炸甜椒圈', '格雷伯爵冰激凌',
    '夏威夷思慕雪', '龟苓膏', '银耳羹', '消食解腻的山楂糖水', '超快手仙豆糕',
    '香蕉奶油可丽饼', '香蕉酸奶可丽饼', '金枪鱼沙拉可丽饼', '海苔烤年糕', '黄豆粉年糕',
    '香甜松软的红豆饼有一点点糊香', '红糖小麻花&椒盐小麻花', '“不看住老陈，油渣糖饼就要没了！”',
    '蜜豆奇亚籽龟苓膏小芋圆', '椰汁龟苓膏',
    
    # Overly sweet savory dishes (> 3分甜)
    '糖南瓜', '烤地瓜', '烤栗子', '栗子烧肉', '板栗焖鸭架', '菠萝咕咾肉',
    '越式椰青卤肉', '叉烧煲仔饭', '昨日的美食第7集中的 玉子烧', '玉子烧',
    '南瓜沙拉', '南瓜奶油意面', '奶香奶香的南瓜玉米粥',
    '温暖香甜的肉桂奶香烤南瓜红薯，朋友吃了赞不绝口',
    '照烧鸡腿饭', '蒜香扑鼻的照烧鸡肉串'
]

sweet_excluded_count = 0

for d in dishes:
    name = d['name']
    prev_rec = d['rec_level']
    
    is_sweet = any(item in name for item in EXCLUDE_SWEET_ITEMS)
    
    if is_sweet:
        d['rec_level'] = '🚫 建议剔除'
        d['sweetness_rating'] = '🔴 偏甜/超三分甜 (> 3分甜)'
        d['rec_reason'] = '口味过于偏甜（超过三分甜）或属于甜点/甜饮/甜食小吃，非家常咸鲜主菜'
        d['exclude_category'] = '口味过甜剔除 (超过三分甜/甜食甜饮)'
        sweet_excluded_count += 1
    elif '建议剔除' in prev_rec:
        d['rec_level'] = '🚫 建议剔除'
        d['sweetness_rating'] = '🟢 咸鲜清爽/微辣 (≤ 1-2分甜)'
        # keep original reason
    else:
        d['sweetness_rating'] = '🟢 咸鲜清爽/微辣 (≤ 1-2分甜微回甘)'
        d['exclude_category'] = '正常保留'

from collections import Counter
print("=== Refined Statistics ===")
print("Total dishes:", len(dishes))
print("Recommendation tiers:")
for k, v in Counter([d['rec_level'] for d in dishes]).items():
    print(f"  {k}: {v} 道")

print("\nExclusion breakdown:")
for k, v in Counter([d.get('exclude_category', '正常保留') for d in dishes]).items():
    print(f"  {k}: {v} 道")

retained_dishes = [d for d in dishes if d['rec_level'] != '🚫 建议剔除']
print(f"\nTotal Retained Candidate Pool (Savory & Home-style): {len(retained_dishes)} 道")
print("Retained by tier:")
print(Counter([d['rec_level'] for d in retained_dishes]))
print("Retained by category:")
print(Counter([d['category'] for d in retained_dishes]))

with open('scratch/ground_truth_catalog_sweet_audited.json', 'w', encoding='utf-8') as f:
    json.dump(dishes, f, ensure_ascii=False, indent=2)

print("\nSaved scratch/ground_truth_catalog_sweet_audited.json")
