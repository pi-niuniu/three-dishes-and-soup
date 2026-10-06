import json
import re

with open('/Users/zhuangxiji/.gemini/antigravity/brain/4c8007a6-ea3f-4f12-afa3-4c88a0d31825/scratch/lutai_photos.json') as f:
    photos = json.load(f)

# Non-meal filters
EXCLUDE_KW = [
    '蛋糕', '戚风', '司康', '玛德琳', '布丁', '冰粉', '松饼', '蛋挞', '饼干', '甜点',
    '奶茶', '拿铁', '咖啡', '苏打', '莫吉托', '热红酒', '果汁', '冰饮', '茶', '冰棒',
    '雪糕', '冰淇淋', '雪贝', '气泡水', '慕斯', '生酪', '巴斯克', '马卡龙', '提拉米苏',
    '吐司', '贝果', '法棍', '面包', '华夫饼', '大福', '班戟', '舒芙蕾', '欧包'
]

# Track by normalized dish name
dishes_by_name = {}

for p in photos:
    title = p.get('title', '').strip()
    img_m = p.get('img', '')
    url = p.get('url', '')
    
    m = re.search(r'p?(\d{10})', img_m) or re.search(r'photo/(\d{10})', url)
    if not m:
        continue
    pid = m.group(1)
    
    # Exclude non-savory
    if any(k in title for k in EXCLUDE_KW):
        continue
        
    # Clean title
    clean_title = re.sub(r'做法见回复.*', '', title)
    clean_title = re.sub(r'。+$', '', clean_title)
    clean_title = re.sub(r'！+$', '', clean_title)
    clean_title = re.sub(r'^[《「【](.*?)[》」】]', r'\1', clean_title)
    clean_title = clean_title.strip()
    
    if len(clean_title) < 2 or '露台' in clean_title and len(clean_title) < 5:
        continue
        
    # Normalize some duplicate titles
    norm_name = clean_title
    for prefix in ['复刻', '小森林之', '昨日的美食之', '日剧同款']:
        if norm_name.startswith(prefix):
            norm_name = norm_name[len(prefix):]
            
    if norm_name not in dishes_by_name:
        dishes_by_name[norm_name] = {
            'original_title': title,
            'clean_name': clean_title,
            'photo_id': pid,
            'url': f"https://www.douban.com/photos/photo/{pid}/",
            'img_l': f"https://img3.doubanio.com/view/photo/l/public/p{pid}.jpg"
        }

print(f"Total unique real dishes from album: {len(dishes_by_name)}")

for i, (name, d) in enumerate(list(dishes_by_name.items())[:50]):
    print(f"{i+1}. [{d['photo_id']}] {d['clean_name']} (raw: {d['original_title']})")
