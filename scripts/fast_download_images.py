import json
import os
import urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed

with open('scratch/ground_truth_catalog_rated.json', 'r', encoding='utf-8') as f:
    dishes = json.load(f)

headers = {
    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Referer': 'https://www.douban.com/'
}

to_download = []
for d in dishes:
    path = d['local_path']
    if not os.path.exists(path) or os.path.getsize(path) < 10000:
        to_download.append(d)

print(f"Total to download: {len(to_download)}")

def download_one(d):
    path = d['local_path']
    pid = d['photo_id']
    os.makedirs(os.path.dirname(path), exist_ok=True)
    urls = [
        f"https://img3.doubanio.com/view/photo/l/public/p{pid}.jpg",
        f"https://img1.doubanio.com/view/photo/l/public/p{pid}.jpg",
        f"https://img9.doubanio.com/view/photo/l/public/p{pid}.jpg",
        f"https://img3.doubanio.com/view/photo/m/public/p{pid}.jpg"
    ]
    for url in urls:
        req = urllib.request.Request(url, headers=headers)
        try:
            with urllib.request.urlopen(req, timeout=8) as resp:
                data = resp.read()
                if len(data) > 5000:
                    with open(path, 'wb') as f:
                        f.write(data)
                    return True
        except Exception:
            continue
    return False

success = 0
failed = 0
with ThreadPoolExecutor(max_workers=10) as executor:
    futures = {executor.submit(download_one, d): d for d in to_download}
    for f in as_completed(futures):
        if f.result():
            success += 1
        else:
            failed += 1

print(f"Fast download completed! Success: {success}, Failed: {failed}")
