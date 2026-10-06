import json

with open('scratch/ground_truth_catalog_rated.json', 'r', encoding='utf-8') as f:
    dishes = json.load(f)

SWEET_KW = [
    '糖', '蜜', '甜', '话梅', '咕咾', '拔丝', '南瓜', '红薯', '蜜薯', '地瓜',
    '玉子烧', '厚蛋烧', '菠萝', '栗', '椰青', '照烧', '叉烧', '果仁', '杏仁',
    '桃仁', '桂花', '雪梨', '番茄沙司', '番茄酱', '糖醋'
]

print("Scanning for potentially sweet dishes among all 322 dishes:")
sweet_candidates = []
for d in dishes:
    name = d['name']
    reasons = d.get('rec_reason', '')
    if any(k in name for k in SWEET_KW):
        sweet_candidates.append(d)

print(f"Total potentially sweet dishes found: {len(sweet_candidates)}")
for i, d in enumerate(sweet_candidates):
    print(f"{i+1}. [{d['category']}] {d['name']} (Current level: {d['rec_level']})")
