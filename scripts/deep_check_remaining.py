import json

with open('scratch/ground_truth_catalog_sweet_audited.json', 'r', encoding='utf-8') as f:
    dishes = json.load(f)

retained = [d for d in dishes if d['rec_level'] != '🚫 建议剔除']

print(f"Total retained dishes: {len(retained)}")

POTENTIAL_SWEET = [
    '栗', '薯', '南瓜', '照烧', '话梅', '糖', '甜', '蜜', '奶', '芝士', '果', '醋', '沙拉', '沙茶'
]

flagged = []
for d in retained:
    name = d['name']
    for kw in POTENTIAL_SWEET:
        if kw in name:
            flagged.append((kw, d))
            break

print(f"\nDishes with potential sweet keywords among retained ({len(flagged)}):")
for kw, d in flagged:
    print(f"- [{kw}] [{d['category']}] {d['name']}")

