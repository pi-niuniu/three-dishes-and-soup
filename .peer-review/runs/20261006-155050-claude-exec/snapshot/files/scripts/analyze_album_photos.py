import json
import re

with open('/Users/zhuangxiji/.gemini/antigravity/brain/4c8007a6-ea3f-4f12-afa3-4c88a0d31825/scratch/lutai_photos.json') as f:
    photos = json.load(f)

print(f"Total entries: {len(photos)}")

# Filter out drinks and desserts
DESSERT_DRINK_KW = [
    '蛋糕', '戚风', '司康', '玛德琳', '布丁', '冰粉', '松饼', '蛋挞', '饼干', '甜点',
    '奶茶', '拿铁', '咖啡', '苏打', '莫吉托', '热红酒', '果汁', '冰饮', '茶', '冰棒',
    '雪糕', '冰淇淋', '雪贝', '气泡水', '慕斯', '生酪', '巴斯克', '马卡龙', '提拉米苏'
]

savory_photos = []
seen_ids = set()

for p in photos:
    title = p.get('title', '').strip()
    img_m = p.get('img', '')
    url = p.get('url', '')
    
    # Extract photo ID
    m = re.search(r'p?(\d{10})', img_m) or re.search(r'photo/(\d{10})', url)
    if not m:
        continue
    pid = m.group(1)
    if pid in seen_ids:
        continue
    seen_ids.add(pid)
    
    # Check if dessert or drink
    if any(k in title for k in DESSERT_DRINK_KW):
        continue
    if not title or title == '无标题' or '露台' in title and len(title) < 4:
        continue
        
    savory_photos.append({
        'photo_id': pid,
        'title': title,
        'url': url,
        'img_l': f"https://img3.doubanio.com/view/photo/l/public/p{pid}.jpg"
    })

print(f"Total unique savory photos: {len(savory_photos)}")
for i, p in enumerate(savory_photos[:30]):
    print(f"{i+1}. [{p['photo_id']}] {p['title']}")
