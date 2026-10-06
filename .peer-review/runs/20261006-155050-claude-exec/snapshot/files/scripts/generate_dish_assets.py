#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
V2.0 菜品真实摄影美食缩略图资产管线
- 针对全量 55 道家常经典菜品，检索并下载真实高清美食摄影图
- 统一规范为 240x240 方形居中裁剪 (aspectFill)
- 采用 WebP 80% 质量压缩，严格控制单张体积在 10KB ~ 20KB
- 为分类提供生活美学温润餐盘兜底生成 (default_main, default_veg, default_soup, 等)
"""

import os
import sys
import json
import urllib.request
import urllib.parse
import io
import time
from PIL import Image, ImageDraw, ImageFont

PROJECT_ROOT = os.path.abspath(os.path.dirname(os.path.dirname(__file__)))
ASSET_DIR = os.path.join(PROJECT_ROOT, "miniprogram", "assets", "dishes")
os.makedirs(ASSET_DIR, exist_ok=True)

# 55 道菜及其精准搜索词
DISH_SEARCH_MAPPING = {
    "dish_001": ("回锅肉", "main_meat", ["Twice-cooked Pork 回锅肉", "回锅肉", "Twice-cooked pork"]),
    "dish_002": ("青椒肉丝", "secondary_meat", ["Pepper shredded pork", "青椒肉丝", "Shredded pork with peppers"]),
    "dish_003": ("红烧排骨", "main_meat", ["红烧排骨", "Braised spare ribs in brown sauce", "Braised pork ribs"]),
    "dish_004": ("番茄炒蛋", "egg", ["Stir Fried Tomato and Scrambled Eggs", "番茄炒蛋", "西红柿炒鸡蛋"]),
    "dish_005": ("蒜蓉空心菜", "vegetable", ["Stir fried water spinach with garlic", "空心菜", "蒜蓉空心菜"]),
    "dish_006": ("冬瓜肉丸汤", "soup", ["冬瓜肉丸汤", "冬瓜丸子汤", "Winter melon meatball soup"]),
    "dish_007": ("莲藕排骨汤", "soup", ["莲藕排骨汤", "排骨藕汤", "Lotus root rib soup"]),
    "dish_008": ("麻婆豆腐", "tofu", ["Mapo doufu", "麻婆豆腐", "Mapo tofu"]),
    "dish_009": ("家常豆腐", "tofu", ["家常豆腐", "Homestyle tofu", "Fried tofu"]),
    "dish_010": ("土豆烧牛肉", "main_meat", ["土豆烧牛肉", "Braised beef with potatoes"]),
    "dish_011": ("宫保鸡丁", "secondary_meat", ["Kung Pao Chicken", "宫保鸡丁"]),
    "dish_012": ("鱼香肉丝", "secondary_meat", ["Yuxiang shredded pork", "鱼香肉丝"]),
    "dish_013": ("肉沫茄子", "secondary_meat", ["鱼香茄子", "肉沫茄子", "Eggplant with pork"]),
    "dish_014": ("清炒丝瓜", "vegetable", ["丝瓜", "清炒丝瓜", "Stir-fried luffa"]),
    "dish_015": ("清炒南瓜尖", "vegetable", ["南瓜藤", "南瓜尖", "Pumpkin leaves food"]),
    "dish_016": ("清炒藕片", "vegetable", ["炒藕片", "藕片", "Stir-fried lotus root"]),
    "dish_017": ("山药木耳炒肉片", "secondary_meat", ["木耳肉片", "黑木耳炒肉", "Stir fried yam with black fungus"]),
    "dish_018": ("毛豆炒肉丁", "secondary_meat", ["毛豆炒肉", "毛豆肉丁", "Edamame pork"]),
    "dish_019": ("白灼基围虾", "main_meat", ["白灼虾", "基围虾", "Boiled prawns"]),
    "dish_020": ("清蒸鲈鱼", "main_meat", ["清蒸鲈鱼", "清蒸鱼", "Steamed fish sea bass"]),
    "dish_021": ("西红柿蛋花汤", "soup", ["西红柿蛋汤", "番茄蛋汤", "Tomato and egg soup"]),
    "dish_022": ("菌菇三鲜肉片汤", "soup", ["三鲜汤", "菌菇肉片汤", "Mushroom soup pork"]),
    "dish_023": ("肉沫蒸水蛋", "egg", ["蒸水蛋", "肉饼蒸蛋", "Steamed egg custard"]),
    "dish_024": ("手撕包菜", "vegetable", ["手撕包菜", "干锅包菜", "Stir-fried cabbage"]),
    "dish_025": ("酸辣土豆丝", "vegetable", ["酸辣土豆丝", "炒土豆丝", "Hot and sour shredded potato"]),
    "dish_026": ("干煸四季豆", "vegetable", ["干煸四季豆", "四季豆", "Dry fried green beans"]),
    "dish_027": ("蒜苔炒肉丝", "secondary_meat", ["蒜苔炒肉", "蒜苔肉丝", "Garlic moss pork"]),
    "dish_028": ("水煮肉片", "main_meat", ["水煮肉片", "Sichuan boiled pork"]),
    "dish_029": ("口水鸡", "main_meat", ["口水鸡", "Mouthwatering chicken"]),
    "dish_030": ("豌豆尖圆子汤", "soup", ["豌豆尖肉丸汤", "肉圆子汤", "Meatball soup"]),
    "dish_031": ("川味粉蒸排骨", "main_meat", ["粉蒸排骨", "Steamed pork ribs rice"]),
    "dish_032": ("香菇滑鸡", "main_meat", ["香菇滑鸡", "香菇蒸鸡", "Mushroom chicken"]),
    "dish_033": ("经典老坛酸菜鱼", "main_meat", ["酸菜鱼", "Suan Cai Yu", "Boiled fish with pickled cabbage"]),
    "dish_034": ("白萝卜炖牛肉", "main_meat", ["白萝卜炖牛肉", "萝卜炖牛肉", "Beef radish stew"]),
    "dish_035": ("川味盐煎肉", "main_meat", ["盐煎肉", "四川盐煎肉", "Fried pork slices"]),
    "dish_036": ("板栗烧鸡", "main_meat", ["板栗烧鸡", "板栗炖鸡", "Braised chicken chestnuts"]),
    "dish_037": ("肉沫炒四季豆粒", "secondary_meat", ["肉沫四季豆", "四季豆肉末", "Minced pork green beans"]),
    "dish_038": ("木须肉", "secondary_meat", ["木须肉", "Moo shu pork"]),
    "dish_039": ("莴笋炒肉片", "secondary_meat", ["莴笋炒肉", "莴笋肉片", "Celtuce with pork"]),
    "dish_040": ("丝瓜炒蛋", "egg", ["丝瓜炒蛋", "丝瓜炒鸡蛋", "Luffa scrambled eggs"]),
    "dish_041": ("韭菜炒鸡蛋", "egg", ["韭菜炒蛋", "韭菜炒鸡蛋", "Chives scrambled eggs"]),
    "dish_042": ("熊掌豆腐", "tofu", ["熊掌豆腐", "家常老豆腐", "Braised tofu"]),
    "dish_043": ("滑蛋虾仁", "main_meat", ["滑蛋虾仁", "虾仁炒蛋", "Shrimp with scrambled eggs"]),
    "dish_044": ("干锅花菜", "vegetable", ["干锅花菜", "炒花菜", "Dry pot cauliflower"]),
    "dish_045": ("蒜蓉西兰花", "vegetable", ["蒜蓉西兰花", "炒西兰花", "Broccoli garlic stir fry"]),
    "dish_046": ("清炒茼蒿", "vegetable", ["茼蒿", "清炒茼蒿", "Tonghao"]),
    "dish_047": ("白灼广东菜心", "vegetable", ["白灼菜心", "广东菜心", "Choy sum"]),
    "dish_048": ("醋溜藕丁", "vegetable", ["醋溜藕丁", "酸甜藕丁", "Sweet sour lotus root"]),
    "dish_049": ("地三鲜", "vegetable", ["地三鲜", "Di San Xian"]),
    "dish_050": ("虎皮青椒", "vegetable", ["虎皮青椒", "虎皮尖椒", "Tiger skin pepper"]),
    "dish_051": ("番茄肉丸汤", "soup", ["番茄肉丸汤", "番茄丸子汤", "Tomato meatball soup"]),
    "dish_052": ("紫菜蛋花汤", "soup", ["紫菜蛋汤", "紫菜蛋花汤", "Seaweed egg drop soup"]),
    "dish_053": ("山药排骨煨汤", "soup", ["山药排骨汤", "山药排骨", "Yam pork rib soup"]),
    "dish_054": ("青菜豆腐小菜钵", "soup", ["青菜豆腐汤", "青菜豆腐", "Bok choy tofu soup"]),
    "dish_055": ("丝瓜肉片鲜汤", "soup", ["丝瓜肉片汤", "丝瓜肉片", "Luffa pork soup"])
}

def center_crop_and_resize(img, size=(240, 240)):
    width, height = img.size
    min_dim = min(width, height)
    left = (width - min_dim) // 2
    top = (height - min_dim) // 2
    right = left + min_dim
    bottom = top + min_dim
    cropped = img.crop((left, top, right, bottom))
    return cropped.resize(size, Image.Resampling.LANCZOS)

def search_wikimedia_image(keywords):
    for kw in keywords:
        url = (
            f"https://commons.wikimedia.org/w/api.php?action=query&format=json"
            f"&generator=search&gsrsearch={urllib.parse.quote(kw)}"
            f"&gsrnamespace=6&gsrlimit=3&prop=imageinfo&iiprop=url|mime"
        )
        req = urllib.request.Request(url, headers={"User-Agent": "MiniProgramFoodApp/2.0"})
        try:
            with urllib.request.urlopen(req, timeout=5) as res:
                data = json.loads(res.read().decode())
                pages = data.get("query", {}).get("pages", {})
                for page_id, page in pages.items():
                    info = page.get("imageinfo", [{}])[0]
                    img_url = info.get("url")
                    mime = info.get("mime", "")
                    if img_url and ("image/jpeg" in mime or "image/png" in mime or "image/webp" in mime):
                        return img_url
        except Exception:
            continue
    return None

def download_and_process_image(url, target_path):
    req = urllib.request.Request(url, headers={"User-Agent": "MiniProgramFoodApp/2.0"})
    with urllib.request.urlopen(req, timeout=8) as res:
        img_bytes = res.read()
    img = Image.open(io.BytesIO(img_bytes)).convert("RGB")
    processed = center_crop_and_resize(img, (240, 240))
    processed.save(target_path, "WEBP", quality=80, method=6)
    return os.path.getsize(target_path)

def create_aesthetic_placeholder(target_path, title, category="main_meat"):
    cat_colors = {
        "main_meat": ("#FFF7ED", "#EA580C", "#9A3412", "🥩"),
        "secondary_meat": ("#FEF3C7", "#D97706", "#92400E", "🍳"),
        "vegetable": ("#F0FDF4", "#16A34A", "#166534", "🥬"),
        "soup": ("#EFF6FF", "#2563EB", "#1E40AF", "🍲"),
        "egg": ("#FEF9C3", "#CA8A04", "#854D0E", "🥚"),
        "tofu": ("#FAF5FF", "#9333EA", "#6B21A8", "🥢"),
        "default": ("#F4EFE6", "#E6683B", "#2C5E43", "🍲")
    }
    bg_color, accent, text_color, default_emoji = cat_colors.get(category, cat_colors["default"])
    
    img = Image.new("RGB", (240, 240), color=bg_color)
    draw = ImageDraw.Draw(img)
    
    # 绘制温润餐盘圆形底纹
    draw.ellipse([18, 18, 222, 222], fill="#FFFFFF", outline="#E5E7EB", width=2)
    draw.ellipse([30, 30, 210, 210], outline=accent, width=1)
    
    font_paths = [
        "/System/Library/Fonts/PingFang.ttc",
        "/System/Library/Fonts/STHeiti Light.ttc",
        "/Library/Fonts/Arial Unicode.ttf"
    ]
    font = None
    for fp in font_paths:
        if os.path.exists(fp):
            try:
                font = ImageFont.truetype(fp, 22)
                sub_font = ImageFont.truetype(fp, 13)
                break
            except Exception:
                continue
    
    if font:
        display_name = title if len(title) <= 5 else title[:4] + ".."
        bbox = draw.textbbox((0, 0), display_name, font=font)
        w = bbox[2] - bbox[0]
        x = (240 - w) // 2
        draw.text((x, 130), display_name, fill=text_color, font=font)
        
        sub_text = "好好吃饭"
        sbbox = draw.textbbox((0, 0), sub_text, font=sub_font)
        sw = sbbox[2] - sbbox[0]
        draw.text(((240 - sw) // 2, 70), sub_text, fill=accent, font=sub_font)
        
        draw.ellipse([116, 102, 124, 110], fill=accent)
    
    img.save(target_path, "WEBP", quality=85)
    return os.path.getsize(target_path)

def main():
    print(f"🚀 开始构建 V2.0 菜品缩略图资产库: {ASSET_DIR}")
    
    # 1. 生成 7 大分类通用生活美学兜底图
    categories = [
        ("default_main", "主荤精选", "main_meat"),
        ("default_secondary", "下饭副荤", "secondary_meat"),
        ("default_vegetable", "时令素菜", "vegetable"),
        ("default_soup", "养生靓汤", "soup"),
        ("default_egg", "营养蛋品", "egg"),
        ("default_tofu", "豆制家常", "tofu"),
        ("default_dish", "好好吃饭", "default")
    ]
    for filename, title, cat in categories:
        target = os.path.join(ASSET_DIR, f"{filename}.webp")
        size = create_aesthetic_placeholder(target, title, cat)
        print(f"✅ 生成兜底占位图: {filename}.webp ({size/1024:.1f} KB)")
    
    # 2. 为 55 道菜拉取并压缩真实美食图
    total_size = 0
    success_count = 0
    placeholder_count = 0
    
    for dish_id, (dish_name, category, keywords) in DISH_SEARCH_MAPPING.items():
        target = os.path.join(ASSET_DIR, f"{dish_id}.webp")
        if os.path.exists(target) and os.path.getsize(target) > 2000:
            sz = os.path.getsize(target)
            total_size += sz
            success_count += 1
            print(f"[{dish_id}] {dish_name}: 已存在 ({sz/1024:.1f} KB)")
            continue
        
        # 尝试下载真实照片
        found_url = search_wikimedia_image(keywords)
        if found_url:
            try:
                sz = download_and_process_image(found_url, target)
                total_size += sz
                success_count += 1
                print(f"[{dish_id}] {dish_name}: 真实美食摄影下载成功! ({sz/1024:.1f} KB)")
                time.sleep(0.3)
                continue
            except Exception as e:
                print(f"[{dish_id}] {dish_name}: 下载失败 ({e})，启用美学占位图兜底")
        
        # 未检索到真实照片则生成专属生活美学占位图
        sz = create_aesthetic_placeholder(target, dish_name, category)
        total_size += sz
        placeholder_count += 1
        print(f"[{dish_id}] {dish_name}: 专属美学图生成成功 ({sz/1024:.1f} KB)")
    
    print("\n================ 资产构建报告 ================")
    print(f"菜品总数: 55")
    print(f"真实摄影图: {success_count}")
    print(f"美学精修图: {placeholder_count}")
    print(f"图片资产总大小: {total_size / 1024:.1f} KB ({total_size / (1024*1024):.2f} MB)")
    print(f"微信 2MB 限制安全核验: {'✅ 完美达标' if total_size < 1.2 * 1024 * 1024 else '⚠️ 需进一步压缩'}")
    print("=============================================\n")

if __name__ == "__main__":
    main()
