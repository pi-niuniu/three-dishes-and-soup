#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
将 miniprogram/assets/dishes/ 下的全部 132 张 WebP 图片
转换为 220x220 像素的标准优化 JPEG (.jpg) 文件。
- 保证 iOS / Android 微信全平台 100% 原生支持与快速解码
- 严格控制总大小在 1.1 MB 左右，确保小程序主包体积 < 1.4 MB
"""

import os
import sys
from PIL import Image

PROJECT_ROOT = os.path.abspath(os.path.dirname(os.path.dirname(__file__)))
ASSETS_DIR = os.path.join(PROJECT_ROOT, "miniprogram", "assets", "dishes")

webp_files = sorted([f for f in os.listdir(ASSETS_DIR) if f.endswith(".webp")])
print(f"📊 正在处理 {len(webp_files)} 张菜品及兜底资产...")

total_size_bytes = 0
success_count = 0

for filename in webp_files:
    base_name = os.path.splitext(filename)[0]
    webp_path = os.path.join(ASSETS_DIR, filename)
    jpg_path = os.path.join(ASSETS_DIR, f"{base_name}.jpg")

    try:
        with Image.open(webp_path) as im:
            im = im.convert("RGB")
            # 居中正方形裁剪 (如果不是正方形)
            w, h = im.size
            if w != h:
                min_dim = min(w, h)
                left = (w - min_dim) // 2
                top = (h - min_dim) // 2
                im = im.crop((left, top, left + min_dim, top + min_dim))
            # 缩放到 220x220
            im_resized = im.resize((220, 220), Image.Resampling.LANCZOS)
            # 保存为优化 JPEG (quality=75 兼顾画质与 2MB 主包预算)
            im_resized.save(jpg_path, "JPEG", quality=75, optimize=True)

        size = os.path.getsize(jpg_path)
        total_size_bytes += size
        success_count += 1
    except Exception as e:
        print(f"❌ 转换失败 [{filename}]: {e}")
        sys.exit(1)

print(f"\n🎉 成功转换全部 {success_count} 张 JPEG 图片！")
print(f"📦 全部 132 张 JPG 图片总大小: {total_size_bytes / 1024:.1f} KB ({total_size_bytes / 1024 / 1024:.2f} MB)")
