import json
import re

with open('/Users/zhuangxiji/.gemini/antigravity/brain/4c8007a6-ea3f-4f12-afa3-4c88a0d31825/scratch/lutai_photos.json') as f:
    photos = json.load(f)

# Exclude obvious non-meal items
EXCLUDE_KW = [
    '蛋糕', '戚风', '司康', '玛德琳', '布丁', '冰粉', '松饼', '蛋挞', '饼干', '甜点',
    '奶茶', '拿铁', '咖啡', '苏打', '莫吉托', '热红酒', '果汁', '冰饮', '茶', '冰棒',
    '雪糕', '冰淇淋', '雪贝', '气泡水', '慕斯', '生酪', '巴斯克', '马卡龙', '提拉米苏',
    '吐司', '贝果', '法棍', '面包', '华夫饼', '大福', '班戟', '舒芙蕾', '欧包', '果酱',
    '可露丽', '磅蛋糕', '派', '挞', '曲奇', '铜锣烧', '团子', '雪媚娘', '焦糖'
]

# Track unique photos and dishes
clean_photos = []
seen_pids = set()

for p in photos:
    title = p.get('title', '').strip()
    img_m = p.get('img', '')
    url = p.get('url', '')
    
    m = re.search(r'p?(\d{10})', img_m) or re.search(r'photo/(\d{10})', url)
    if not m:
        continue
    pid = m.group(1)
    if pid in seen_pids:
        continue
    seen_pids.add(pid)
    
    if any(k in title for k in EXCLUDE_KW):
        continue
    if not title or title == '无标题' or '露台' in title and len(title) < 5:
        continue
        
    # Clean up title
    cleaned = title
    cleaned = re.sub(r'做法见回复.*', '', cleaned)
    cleaned = re.sub(r'。+$', '', cleaned)
    cleaned = re.sub(r'！+$', '', cleaned)
    cleaned = re.sub(r'^[《「【](.*?)[》」】]', r'\1', cleaned)
    cleaned = cleaned.strip()
    
    # If title has line breaks or multi-dish combo, note it
    is_combo = '\n' in cleaned or '、' in cleaned
    
    clean_photos.append({
        'photo_id': pid,
        'raw_title': title,
        'title': cleaned,
        'is_combo': is_combo,
        'url': f"https://www.douban.com/photos/photo/{pid}/",
        'img_l': f"https://img3.doubanio.com/view/photo/l/public/p{pid}.jpg"
    })

print(f"Total valid savory photos: {len(clean_photos)}")
single_photos = [p for p in clean_photos if not p['is_combo']]
combo_photos = [p for p in clean_photos if p['is_combo']]
print(f"Single dish photos: {len(single_photos)}")
print(f"Combo/multi-dish photos: {len(combo_photos)}")

with open('scratch/ground_truth_photos.json', 'w', encoding='utf-8') as f:
    json.dump(clean_photos, f, ensure_ascii=False, indent=2)

