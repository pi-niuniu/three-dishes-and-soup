import re
import json
import os
import time
import urllib.request

with open('scratch/ground_truth_catalog_rated.json', 'r', encoding='utf-8') as f:
    dishes = json.load(f)

# Directory for ground truth dishes
base_dir = '/Users/zhuangxiji/Desktop/一日三餐/docs/badlulu_dishes_groundtruth'
os.makedirs(base_dir, exist_ok=True)

# Also check existing docs/badlulu_dishes/
existing_images = {}
for root, dirs, files in os.walk('/Users/zhuangxiji/Desktop/一日三餐/docs/badlulu_dishes'):
    for file in files:
        if file.endswith('.jpg'):
            # try to extract pid if any or match
            pass

headers = {
    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Referer': 'https://www.douban.com/'
}

downloaded = 0
skipped = 0
failed = 0

for d in dishes:
    cat = d['category']
    pid = d['photo_id']
    title = re.sub(r'[\s/\\:*?"<>|]', '_', d['name'])
    
    cat_dir = os.path.join(base_dir, cat)
    os.makedirs(cat_dir, exist_ok=True)
    
    file_path = os.path.join(cat_dir, f"{pid}_{title}.jpg")
    d['local_path'] = file_path
    d['relative_path'] = f"docs/badlulu_dishes_groundtruth/{cat}/{pid}_{title}.jpg"
    
    if os.path.exists(file_path) and os.path.getsize(file_path) > 10000:
        skipped += 1
        continue
        
    # Download
    img_url = d['img_l']
    req = urllib.request.Request(img_url, headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=10) as response, open(file_path, 'wb') as out_file:
            data = response.read()
            out_file.write(data)
        downloaded += 1
        if downloaded % 20 == 0:
            print(f"Downloaded {downloaded} images...")
            time.sleep(0.5)
    except Exception as e:
        # try photo m url
        try:
            m_url = f"https://img3.doubanio.com/view/photo/m/public/p{pid}.jpg"
            req_m = urllib.request.Request(m_url, headers=headers)
            with urllib.request.urlopen(req_m, timeout=10) as response, open(file_path, 'wb') as out_file:
                out_file.write(response.read())
            downloaded += 1
        except Exception as e2:
            print(f"Failed to download {pid}: {e2}")
            failed += 1

print(f"Finished! Downloaded: {downloaded}, Skipped (already exists): {skipped}, Failed: {failed}")

with open('scratch/ground_truth_catalog_rated.json', 'w', encoding='utf-8') as f:
    json.dump(dishes, f, ensure_ascii=False, indent=2)

