#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
自动扫描所有 brain 目录中由 generate_image 生成的高清菜品摄影图，
统一进行中心正方形裁剪 (LANCZOS) 并转换为 240x240 WebP (85% 质量)，
同步覆盖更新至 miniprogram/assets/dishes/{dish_id}.webp。
"""

import os
import glob
import re
from PIL import Image

PROJECT_ROOT = os.path.abspath(os.path.dirname(os.path.dirname(__file__)))
ASSET_DIR = os.path.join(PROJECT_ROOT, "miniprogram", "assets", "dishes")
BRAIN_BASE = os.path.expanduser("~/.gemini/antigravity/brain"

def sync_photos():
    print(f"🔍 扫描 Brain 资产目录中的菜品生成图...")
    pattern = os.path.join(BRAIN_BASE, "*", "dish_*.jpg")
    found_files = glob.glob(pattern)
    
    # 按照 dish_xxx 归类，并取最新的一个
    dish_map = {}
    for f in found_files:
        filename = os.path.basename(f)
        match = re.search(r"(dish_\d{3})", filename)
        if match:
            did = match.group(1)
            mtime = os.path.getmtime(f)
            if did not in dish_map or mtime > dish_map[did]["mtime"]:
                dish_map[did] = {"path": f, "mtime": mtime, "filename": filename}
        elif "dish_shanyaomuer" in filename:
            did = "dish_017"
            mtime = os.path.getmtime(f)
            if did not in dish_map or mtime > dish_map[did]["mtime"]:
                dish_map[did] = {"path": f, "mtime": mtime, "filename": filename}

    print(f"📊 累计找到 {len(dish_map)} 道菜品的专属高精度生成图:")
    updated_count = 0
    for did in sorted(dish_map.keys()):
        info = dish_map[did]
        src_path = info["path"]
        target_path = os.path.join(ASSET_DIR, f"{did}.webp")
        
        try:
            im = Image.open(src_path).convert("RGB")
            w, h = im.size
            min_dim = min(w, h)
            left = (w - min_dim) // 2
            top = (h - min_dim) // 2
            im_cropped = im.crop((left, top, left + min_dim, top + min_dim))
            im_resized = im_cropped.resize((240, 240), Image.Resampling.LANCZOS)
            im_resized.save(target_path, "WEBP", quality=85, method=6)
            size_kb = os.path.getsize(target_path) / 1024
            print(f"  ✅ [{did}] 成功更新: {info['filename']} -> {size_kb:.1f} KB")
            updated_count += 1
        except Exception as e:
            print(f"  ❌ [{did}] 处理失败: {e}")

    print(f"\n🎉 资产同步完成！共更新 {updated_count} 张高品质美食摄影图。")

if __name__ == "__main__":
    sync_photos()
