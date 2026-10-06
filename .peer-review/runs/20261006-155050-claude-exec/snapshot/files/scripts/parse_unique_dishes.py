import json
import re

with open('scratch/ground_truth_photos.json', 'r', encoding='utf-8') as f:
    photos = json.load(f)

# Group by normalized title
dishes = {}

for p in photos:
    title = p['title']
    pid = p['photo_id']
    is_combo = p['is_combo']
    
    # Normalize title for grouping
    # e.g. "韭菜苔馅饼" appeared twice
    # "鸡肉丸子豆乳白玉锅" appeared twice
    norm = title
    norm = re.sub(r'\(.*?\)|（.*?）', '', norm).strip()
    
    # If already exists and current is combo, skip combo
    if norm in dishes and is_combo:
        continue
    # If not in dishes or better title
    if norm not in dishes:
        dishes[norm] = p

print(f"Total unique real dishes with 1-to-1 photo: {len(dishes)}")

# Let's inspect some of them
for i, (k, v) in enumerate(list(dishes.items())[:60]):
    print(f"{i+1}. [{v['photo_id']}] {v['title']}")
