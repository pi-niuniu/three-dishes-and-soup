#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
生成 dish_076.webp ~ dish_125.webp 真实 600x600 WebP 视觉资产
- 从 scratch/final_50_exclusive_dishes.json 读取 50 道菜及其 local_path
- PIL 居中正方形裁切并缩放至 600x600
- 保存为 miniprogram/assets/dishes/dish_{idx}.webp (quality=85)
- 校验文件存在且大小 > 10KB
"""

import os
import sys
import json
from PIL import Image

PROJECT_ROOT = os.path.abspath(os.path.dirname(os.path.dirname(__file__)))
SRC_JSON = os.path.join(PROJECT_ROOT, "scratch", "final_50_exclusive_dishes.json")
ASSET_DIR = os.path.join(PROJECT_ROOT, "miniprogram", "assets", "dishes")

os.makedirs(ASSET_DIR, exist_ok=True)

with open(SRC_JSON, "r", encoding="utf-8") as f:
    dishes = json.load(f)

print(f"📊 正在处理 {len(dishes)} 道精品新菜的视觉资产...")

success_count = 0
for idx, dish in enumerate(dishes, start=76):
    dish_id = f"dish_{idx:03d}"
    name = dish["name"]
    local_path = dish["local_path"]
    target_path = os.path.join(ASSET_DIR, f"{dish_id}.webp")

    if not os.path.exists(local_path):
        print(f"❌ [{dish_id}] {name} 原图不存在: {local_path}")
        sys.exit(1)

    try:
        with Image.open(local_path) as im:
            im = im.convert("RGB")
            w, h = im.size
            min_dim = min(w, h)
            left = (w - min_dim) // 2
            top = (h - min_dim) // 2
            im_cropped = im.crop((left, top, left + min_dim, top + min_dim))
            im_resized = im_cropped.resize((600, 600), Image.Resampling.LANCZOS)
            im_resized.save(target_path, "WEBP", quality=85, method=6)

        size_bytes = os.path.getsize(target_path)
        size_kb = size_bytes / 1024
        if size_bytes < 10240:
            print(f"⚠️ [{dish_id}] {name} 图片过小 ({size_kb:.1f} KB < 10KB)")
            sys.exit(1)

        print(f"  ✅ [{dish_id}] {name} -> 600x600 WebP ({size_kb:.1f} KB)")
        success_count += 1
    except Exception as e:
        print(f"❌ [{dish_id}] {name} 处理异常: {e}")
        sys.exit(1)

print(f"\n🎉 全部 {success_count} 张 WebP 视觉资产生成并通过质检验收！")
