import json

with open('scratch/ground_truth_photos.json', 'r', encoding='utf-8') as f:
    photos = json.load(f)

# Exclude combo photos where title has newlines or multiple dishes listed
single_photos = [p for p in photos if '\n' not in p['title'] and '、' not in p['title']]

print(f"Total single-dish photos: {len(single_photos)}")

# Deduplicate by clean title
seen = set()
unique_dishes = []
for p in single_photos:
    t = p['title'].strip()
    if t not in seen:
        seen.add(t)
        unique_dishes.append(p)

print(f"Total unique single-dish photos: {len(unique_dishes)}")

with open('scratch/unique_single_dishes.json', 'w', encoding='utf-8') as f:
    json.dump(unique_dishes, f, ensure_ascii=False, indent=2)

print("Saved scratch/unique_single_dishes.json")
