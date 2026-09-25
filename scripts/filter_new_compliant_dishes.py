import json
import re

with open('miniprogram/data/dishes.json') as f:
    existing_dishes = json.load(f)

with open('scratch/ground_truth_catalog_sweet_audited.json') as f:
    all_catalog = json.load(f)

# Existing names and aliases
existing_names = set()
for d in existing_dishes:
    name = d['name']
    existing_names.add(name)
    # clean name for fuzzy
    clean = re.sub(r'\(.*?\)|（.*?）', '', name)
    clean = re.sub(r'独家|不咸不腻·|老广|家常|云南|经典|清炒|蒜蓉', '', clean).strip()
    existing_names.add(clean)

print(f"Total existing dishes in miniprogram: {len(existing_dishes)}")

# Check each dish in catalog
compliant_new_dishes = []
already_exists_dishes = []
excluded_dishes = []

def is_duplicate(name, existing_names):
    if name in existing_names:
        return True
    clean = re.sub(r'\(.*?\)|（.*?）', '', name)
    clean = re.sub(r'独家|不咸不腻·|老广|家常|云南|经典|清炒|蒜蓉', '', clean).strip()
    if clean in existing_names:
        return True
    # direct substring check for specific in-library dishes
    for ex in existing_dishes:
        ex_name = ex['name']
        if ex_name == name:
            return True
        # Specific Badlulu dishes already in library:
        if ('外婆菜炒煎蛋' in name and '外婆菜炒煎蛋' in ex_name) or \
           ('榄角炒豇豆' in name and '榄角炒豇豆' in ex_name) or \
           ('菜脯娃娃菜炒粉丝' in name and '菜脯娃娃菜炒粉丝' in ex_name) or \
           ('鸡刨豆腐' in name and '鸡刨豆腐' in ex_name) or \
           ('紫苏炒黄瓜' in name and '紫苏炒黄瓜' in ex_name) or \
           ('烟笋炒腊肉' in name and '烟笋炒腊肉' in ex_name) or \
           ('孜然鸡肝' in name and '孜然' in ex_name and '鸡肝' in ex_name) or \
           ('牛骨萝卜煲' in name and '牛骨' in ex_name and '萝卜' in ex_name) or \
           ('豆乳白玉锅' in name and '豆乳白玉锅' in ex_name) or \
           ('麻婆豆腐' in name and '麻婆豆腐' in ex_name) or \
           ('番茄炒蛋' in name and '番茄炒蛋' in ex_name) or \
           ('手撕包菜' in name and '手撕包菜' in ex_name):
            return True
    return False

for d in all_catalog:
    name = d['name']
    rec = d['rec_level']
    
    # 1. Check if excluded
    if '建议剔除' in rec:
        excluded_dishes.append(d)
        continue
        
    # 2. Check if already exists in miniprogram
    if is_duplicate(name, existing_names):
        already_exists_dishes.append(d)
        continue
        
    compliant_new_dishes.append(d)

print(f"Total catalog dishes: {len(all_catalog)}")
print(f"Total excluded (偏甜/油炸/面点/偏门): {len(excluded_dishes)}")
print(f"Total already in miniprogram: {len(already_exists_dishes)}")
print(f"Total compliant NEW dishes for user review: {len(compliant_new_dishes)}")

print("\nSample already exists dishes filtered out:")
for d in already_exists_dishes:
    print(f"- [{d['category']}] {d['name']}")

from collections import Counter
print("\nCompliant NEW dishes by category:")
for cat, count in Counter([d['category'] for d in compliant_new_dishes]).items():
    print(f"  {cat}: {count} 道")

print("\nCompliant NEW dishes by tier:")
for tier, count in Counter([d['rec_level'] for d in compliant_new_dishes]).items():
    print(f"  {tier}: {count} 道")

with open('scratch/compliant_new_dishes.json', 'w', encoding='utf-8') as f:
    json.dump(compliant_new_dishes, f, ensure_ascii=False, indent=2)

print("\nSaved scratch/compliant_new_dishes.json")
