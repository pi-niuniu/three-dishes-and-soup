#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
生成全量 55 道菜品的 5 列 x 11 行全景画廊审阅图
- 每一格展示 dish_id、菜名、分类，以及 240x240 WebP 实物缩略图
- 保存至 docs/dishes_review_grid.jpg
"""

import os
import json
from PIL import Image, ImageDraw, ImageFont

PROJECT_ROOT = os.path.abspath(os.path.dirname(os.path.dirname(__file__)))
ASSET_DIR = os.path.join(PROJECT_ROOT, "miniprogram", "assets", "dishes")
DOCS_DIR = os.path.join(PROJECT_ROOT, "docs")
DATA_FILE = os.path.join(PROJECT_ROOT, "miniprogram", "data", "dishes.json")
OUTPUT_PATH = os.path.join(DOCS_DIR, "dishes_review_grid.jpg")
BRAIN_COPY = os.path.expanduser("~/.gemini/antigravity/brain/69b621ae-489f-4f89-b7ba-5a0041604510/dishes_review_grid.jpg"

def generate_grid():
    with open(DATA_FILE, "r", encoding="utf-8") as f:
        dishes = json.load(f)

    cols = 5
    rows = 11
    cell_w, cell_h = 240, 290
    total_w = cols * cell_w
    total_h = rows * cell_h

    grid_img = Image.new("RGB", (total_w, total_h), "#FFFFFF")
    draw = ImageDraw.Draw(grid_img)

    font_path = "/System/Library/Fonts/STHeiti Light.ttc"
    if not os.path.exists(font_path):
        font_path = "/System/Library/Fonts/PingFang.ttc"
    font = ImageFont.truetype(font_path, 18)

    for i, d in enumerate(dishes):
        c = i % cols
        r = i // cols
        x = c * cell_w
        y = r * cell_h

        # 标题栏
        draw.rectangle([x, y, x + cell_w, y + 45], fill="#F4EFE6", outline="#E5E0D5", width=1)
        title_text = f"{d['id']}: {d['name']}"
        draw.text((x + 8, y + 13), title_text, font=font, fill="#1E2320")

        # 菜品缩略图
        img_path = os.path.join(ASSET_DIR, f"{d['id']}.webp")
        if os.path.exists(img_path):
            im = Image.open(img_path).convert("RGB").resize((cell_w, cell_w), Image.Resampling.LANCZOS)
            grid_img.paste(im, (x, y + 45))
        else:
            # 缺失占位
            draw.rectangle([x, y + 45, x + cell_w, y + cell_h], fill="#FFF7ED")
            draw.text((x + 60, y + 150), "图片待更新", font=font, fill="#EA580C")

    grid_img.save(OUTPUT_PATH, "JPEG", quality=92)
    print(f"✅ 全景审阅图生成成功: {OUTPUT_PATH} ({os.path.getsize(OUTPUT_PATH) / 1024:.1f} KB)")
    
    # 拷贝一份到 brain 供 view_file 查看
    try:
        import shutil
        shutil.copy(OUTPUT_PATH, BRAIN_COPY)
    except Exception as e:
        pass

if __name__ == "__main__":
    generate_grid()
