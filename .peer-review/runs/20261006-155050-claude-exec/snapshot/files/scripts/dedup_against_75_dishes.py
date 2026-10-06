import json

with open('miniprogram/data/dishes.json') as f:
    existing_dishes = json.load(f)

with open('scratch/compliant_new_dishes.json') as f:
    candidates = json.load(f)

# Explicit duplicate mapping:
# Key: candidate dish title substring or exact
# Value: matched existing dish name
EXACT_OR_SEMANTIC_DUPS = {
    '蒜苔炒肉': '蒜苔炒肉丝 (dish_027)',
    '下粤菜馆子必点的白灼菜心': '白灼广东菜心 (dish_047)',
    '白灼菜心': '白灼广东菜心 (dish_047)',
    '“辣”气冲冠的麻辣菜花': '干锅花菜 (dish_044)',
    '麻辣菜花': '干锅花菜 (dish_044)',
    '马铃薯炖肉': '土豆烧牛肉 (dish_010)',
    '土豆炖牛肉': '土豆烧牛肉 (dish_010)',
    '东北家常土豆软烂炖牛肉': '土豆烧牛肉 (dish_010)',
    '白萝卜慢炖牛肉': '白萝卜炖牛肉 (dish_034)',
    '入口即化的粉蒸排骨': '川味粉蒸排骨 (dish_031)',
    '粉蒸排骨': '川味粉蒸排骨 (dish_031)',
    '口水鸡': '口水鸡 (dish_029)',
    '水煮肉片': '水煮肉片 (dish_028)',
    '干煸四季豆': '干煸四季豆 (dish_026)',
    '酸辣土豆丝': '酸辣土豆丝 (dish_025)',
    '清蒸鲈鱼': '清蒸鲈鱼 (dish_020)',
    '白灼基围虾': '白灼基围虾 (dish_019)',
    '回锅肉': '回锅肉 (dish_001)',
    '青椒肉丝': '青椒肉丝 (dish_002)',
    '红烧排骨': '红烧排骨 (dish_003)',
    '番茄炒蛋': '番茄炒蛋 (dish_004)',
    '冬瓜肉丸汤': '冬瓜肉丸汤 (dish_006)',
    '莲藕排骨汤': '莲藕排骨汤 (dish_007)',
    '家常豆腐': '家常豆腐 (dish_009)',
    '肉沫茄子': '肉沫茄子 (dish_013)',
    '清炒丝瓜': '清炒丝瓜 (dish_014)',
    '清炒南瓜尖': '清炒南瓜尖 (dish_015)',
    '清炒藕片': '清炒藕片 (dish_016)',
    '醋溜藕丁': '醋溜藕丁 (dish_048)',
    '地三鲜': '地三鲜 (dish_049)',
    '虎皮青椒': '虎皮青椒 (dish_050)',
    '丝瓜炒蛋': '丝瓜炒蛋 (dish_040)',
    '韭菜炒鸡蛋': '韭菜炒鸡蛋 (dish_041)',
    '滑蛋虾仁': '滑蛋虾仁 (dish_043)',
    '香菇滑鸡': '香菇滑鸡 (dish_032)',
    '酸菜鱼': '经典老坛酸菜鱼 (dish_033)',
    '包菜': '手撕包菜 (dish_024)'
}

final_compliant = []
filtered_out_dups = []

for c in candidates:
    name = c['name']
    is_dup = False
    dup_reason = ""
    for k, v in EXACT_OR_SEMANTIC_DUPS.items():
        if k == name or (len(k) >= 3 and k in name):
            is_dup = True
            dup_reason = v
            break
            
    if is_dup:
        filtered_out_dups.append((name, dup_reason))
    else:
        final_compliant.append(c)

print(f"Total candidates before: {len(candidates)}")
print(f"Filtered out existing overlaps: {len(filtered_out_dups)}")
print(f"Final clean compliant candidate dishes: {len(final_compliant)}")

for name, reason in filtered_out_dups:
    print(f"  - '{name}' matches {reason}")

from collections import Counter
print("\nFinal clean compliant candidate dishes by tier:")
for t, count in Counter([d['rec_level'] for d in final_compliant]).items():
    print(f"  {t}: {count} 道")

print("\nFinal clean compliant candidate dishes by category:")
for cat, count in Counter([d['category'] for d in final_compliant]).items():
    print(f"  {cat}: {count} 道")

with open('scratch/final_clean_compliant_dishes.json', 'w', encoding='utf-8') as f:
    json.dump(final_compliant, f, ensure_ascii=False, indent=2)

print("\nSaved scratch/final_clean_compliant_dishes.json")
