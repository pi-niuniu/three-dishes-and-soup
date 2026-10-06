import json

with open('scratch/ground_truth_catalog_rated.json', 'r', encoding='utf-8') as f:
    dishes = json.load(f)

# Criteria for SWEET (> 3分甜 / 甜口菜 / 甜点甜汤 / 甜味主食):
# 1. Obvious desserts, sweet drinks, sweet pastries:
SWEET_DESSERT_KW = [
    '冰激凌', '思慕雪', '龟苓膏', '银耳羹', '糖水', '仙豆糕', '可丽饼', '年糕', 
    '红豆饼', '麻花', '糖饼', '冰粉', '甜品', '蛋糕', '布丁', '奶茶', '甜汤',
    '小芋圆', '蜜豆'
]

# 2. Savory dishes with prominent sweetness (> 3分甜 / 糖醋 / 蜜汁 / 甜口为主):
SWEET_SAVORY_KW = [
    '咕咾肉', '糖醋', '蜜汁', '拔丝', '糖南瓜', '烤地瓜', '烤栗子', 
    '肉桂奶香烤南瓜红薯', '南瓜玉米粥', '南瓜奶油意面', '玉子烧',
    '南瓜沙拉', '椰青卤肉', '叉烧'
]

for d in dishes:
    name = d['name']
    prev_rec = d['rec_level']
    prev_reason = d['rec_reason']
    
    is_dessert = any(k in name for k in SWEET_DESSERT_KW)
    is_sweet_savory = any(k in name for k in SWEET_SAVORY_KW)
    
    is_sweet = is_dessert or is_sweet_savory
    
    # Assess sweetness description
    if is_dessert:
        sweetness_desc = "🔴 偏甜/甜品甜汤 (> 5分甜)"
        sweet_reason = "属于甜品/甜汤/甜点点心，非咸鲜家常正餐"
    elif is_sweet_savory:
        sweetness_desc = "🔴 过于偏甜 (> 3分甜)"
        sweet_reason = "调味重糖/酸甜/蜜汁/南瓜红薯甜味过浓，超过三分甜标准"
    else:
        sweetness_desc = "🟢 咸鲜清爽/微辣 (≤ 1-2分甜微回甘)"
        sweet_reason = ""
        
    d['sweetness_rating'] = sweetness_desc
    d['is_sweet_excluded'] = is_sweet
    
    # Update recommendation tier:
    # If previously 🚫 建议剔除, keep 🚫 建议剔除
    # If now sweet, mark 🚫 建议剔除 (偏甜剔除)
    if '建议剔除' in prev_rec:
        d['rec_level'] = '🚫 建议剔除'
        d['exclude_category'] = '原建议剔除 (偏门难买/大油炸/重面点)'
    elif is_sweet:
        d['rec_level'] = '🚫 建议剔除'
        d['rec_reason'] = sweet_reason
        d['exclude_category'] = '口味过甜剔除 (超过三分甜/甜点甜食)'
    else:
        d['exclude_category'] = '正常保留'

from collections import Counter
print("Sweetness check summary:")
print("Rec level distribution:")
print(Counter([d['rec_level'] for d in dishes]))
print("\nExclude category breakdown:")
print(Counter([d['exclude_category'] for d in dishes]))

sweet_excluded = [d for d in dishes if d['exclude_category'] == '口味过甜剔除 (超过三分甜/甜点甜食)']
print(f"\nDishes excluded due to sweetness ({len(sweet_excluded)}):")
for i, d in enumerate(sweet_excluded):
    print(f"{i+1}. [{d['category']}] {d['name']} -> {d['rec_reason']}")

with open('scratch/ground_truth_catalog_sweet_audited.json', 'w', encoding='utf-8') as f:
    json.dump(dishes, f, ensure_ascii=False, indent=2)

print("\nSaved scratch/ground_truth_catalog_sweet_audited.json")
