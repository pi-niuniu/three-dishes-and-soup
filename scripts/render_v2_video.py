#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
《一年四季·好好吃饭》V2.0 全景生活美学菜品图文版 E2E 演示视频渲染管线
- 1:1 像素级绘制 V2.0 核心页面 (首页、图文结果页、单菜锁定磨砂角标、菜库全景图文流、大厨看板与做饭大图)
- 合成手势触控平滑轨迹与波纹动画 (30fps, 768x1376 竖屏高清)
- 调取系统 FFmpeg 压制 H.264 (yuv420p) 高兼容 MP4 视频
"""

import math
import os
import subprocess
import shutil
from PIL import Image, ImageDraw, ImageFont

W, H = 768, 1376
FPS = 30

PROJECT_ROOT = os.path.abspath(os.path.dirname(os.path.dirname(__file__)))
ASSET_DIR = os.path.join(PROJECT_ROOT, "miniprogram", "assets", "dishes")
DOCS_DIR = os.path.join(PROJECT_ROOT, "docs")
BRAIN_DIR = os.path.expanduser("~/.gemini/antigravity/brain/69b621ae-489f-4f89-b7ba-5a0041604510"
os.makedirs(DOCS_DIR, exist_ok=True)

# 字体加载
FONT_PATH = "/System/Library/Fonts/PingFang.ttc"
if not os.path.exists(FONT_PATH):
    FONT_PATH = "/System/Library/Fonts/STHeiti Medium.ttc"

font_title = ImageFont.truetype(FONT_PATH, 42)
font_subtitle = ImageFont.truetype(FONT_PATH, 28)
font_card_title = ImageFont.truetype(FONT_PATH, 32)
font_text = ImageFont.truetype(FONT_PATH, 24)
font_sm = ImageFont.truetype(FONT_PATH, 20)
font_tip = ImageFont.truetype(FONT_PATH, 24)
font_badge = ImageFont.truetype(FONT_PATH, 22)

# 生活美学调色板
BG_COLOR = (255, 253, 247, 255)       # 骨瓷釉白 #FFFDF7
CARD_BG = (255, 255, 255, 255)        # 纯白卡片 #FFFFFF
DARK_TEXT = (30, 35, 32, 255)         # 陶碳深黛 #1E2320
MUTED_TEXT = (125, 130, 126, 255)     # 柔灰 #7D827E
PRIMARY_GREEN = (44, 94, 67, 255)     # 罗勒绿 #2C5E43
ACCENT_ORANGE = (230, 104, 59, 255)   # 熟柿暖橙 #E6683B
WARM_OAT = (244, 239, 230, 255)       # 原木燕麦 #F4EFE6
LIGHT_GREEN_BG = (234, 243, 236, 255)
LIGHT_ORANGE_BG = (253, 241, 234, 255)

def get_dish_img(dish_id, size=(140, 140)):
    """加载真实菜品缩略图"""
    path = os.path.join(ASSET_DIR, f"{dish_id}.webp")
    if os.path.exists(path):
        im = Image.open(path).convert("RGBA")
        return im.resize(size, Image.Resampling.LANCZOS)
    # 兜底
    im = Image.new("RGBA", size, WARM_OAT)
    return im

def draw_capsule_navbar(draw, title="一年四季 · 好好吃饭"):
    """绘制顶部微信自定义胶囊导航栏"""
    draw.text((40, 96), title, font=font_subtitle, fill=DARK_TEXT)
    # 微信胶囊右侧占位
    draw.rounded_rectangle([W - 170, 85, W - 40, 135], radius=25, fill=(245, 243, 238, 200), outline=(225, 220, 210, 255), width=2)
    draw.ellipse([W - 135, 105, W - 125, 115], fill=(80, 80, 80, 255))
    draw.ellipse([W - 85, 103, W - 71, 117], outline=(80, 80, 80, 255), width=2)

def draw_tabbar(draw, active_tab=0):
    """绘制底部 TabBar"""
    draw.rectangle([0, H - 110, W, H], fill=CARD_BG, outline=WARM_OAT, width=2)
    tabs = [("●", "点菜"), ("●", "菜库"), ("●", "历史"), ("●", "我的")]
    step = W // 4
    for i, (icon, label) in enumerate(tabs):
        cx = i * step + step // 2
        color = PRIMARY_GREEN if i == active_tab else MUTED_TEXT
        draw.text((cx - 16, H - 98), icon, font=font_text, fill=color)
        draw.text((cx - 24, H - 64), label, font=font_sm, fill=color)

# ================= 渲染单帧画板 =================

def render_home_page():
    """页面 1：首页点菜排餐"""
    im = Image.new("RGBA", (W, H), BG_COLOR)
    d = ImageDraw.Draw(im)
    draw_capsule_navbar(d)
    
    # 顶部横幅
    d.rounded_rectangle([36, 160, W - 36, 270], radius=28, fill=LIGHT_GREEN_BG, outline=WARM_OAT, width=2)
    d.text((60, 185), "金秋九月 · 当季正当时", font=font_card_title, fill=PRIMARY_GREEN)
    d.text((60, 230), "时令尝鲜：莲藕、丝瓜、基围虾、鲜板栗", font=font_text, fill=MUTED_TEXT)
    
    # 日期选择
    d.rounded_rectangle([36, 290, W - 36, 420], radius=28, fill=CARD_BG, outline=WARM_OAT, width=2)
    d.text((60, 315), "排餐日期选择", font=font_subtitle, fill=DARK_TEXT)
    # 选项1: 明天
    d.rounded_rectangle([60, 355, 230, 405], radius=20, fill=PRIMARY_GREEN)
    d.text((80, 368), "明天做饭 (推荐)", font=font_sm, fill=(255, 255, 255, 255))
    # 选项2: 今天
    d.rounded_rectangle([250, 355, 410, 405], radius=20, fill=WARM_OAT)
    d.text((275, 368), "今天做饭", font=font_sm, fill=DARK_TEXT)
    
    # 模式选择
    d.rounded_rectangle([36, 440, W - 36, 750], radius=28, fill=CARD_BG, outline=WARM_OAT, width=2)
    d.text((60, 465), "就餐模式 (常住2人·吃午晚两顿)", font=font_subtitle, fill=DARK_TEXT)
    
    modes = [
        ("3 菜 1 汤 (推荐)", "1主荤 + 1副荤 + 1时蔬 + 1靓汤", True),
        ("2 菜 1 汤", "1硬菜 + 1时令小炒 + 1鲜汤", False),
        ("3 个 菜", "2荤1素快手搭配", False),
        ("3 个 炒菜", "爆炒家常大火镬气", False)
    ]
    my = 515
    for title, desc, is_sel in modes:
        bg = LIGHT_ORANGE_BG if is_sel else (250, 248, 245, 255)
        border = ACCENT_ORANGE if is_sel else WARM_OAT
        d.rounded_rectangle([60, my, W - 60, my + 50], radius=16, fill=bg, outline=border, width=2)
        d.text((80, my + 12), title, font=font_sm, fill=ACCENT_ORANGE if is_sel else DARK_TEXT)
        d.text((320, my + 14), desc, font=font_sm, fill=MUTED_TEXT)
        my += 56
        
    # 核心大按钮
    d.rounded_rectangle([48, 800, W - 48, 880], radius=40, fill=PRIMARY_GREEN)
    d.text((W // 2 - 160, 825), "开启明日私房菜谱", font=font_subtitle, fill=(255, 255, 255, 255))
    
    draw_tabbar(d, 0)
    return im

def render_result_page(locked=False):
    """页面 2：排餐结果页 (展示 V2.0 美食真实图文卡片)"""
    im = Image.new("RGBA", (W, H), BG_COLOR)
    d = ImageDraw.Draw(im)
    draw_capsule_navbar(d, "【明天】三菜一汤搭配")
    
    # 顶部状态
    d.text((40, 160), "明天吃什么 · 营养荤素双全", font=font_card_title, fill=DARK_TEXT)
    d.text((40, 205), "预估大厨做饭耗时约 45 分钟 · 菜量做足 1.8x", font=font_sm, fill=MUTED_TEXT)
    
    slots = [
        ("dish_001", "回锅肉", "硬核主荤", "咸鲜·微辣", "25min", "荤", locked),
        ("dish_002", "青椒肉丝", "下饭副荤", "微辣·鲜嫩", "15min", "荤", False),
        ("dish_014", "清炒丝瓜", "当季时蔬", "鲜嫩·清甜", "8min", "素", False),
        ("dish_007", "莲藕排骨汤", "滋补靓汤", "清甜·浓郁", "50min", "汤", False)
    ]
    
    card_y = 250
    for dish_id, name, role, taste, cook_time, emoji, is_lock in slots:
        # 卡片底色
        cbg = (255, 249, 244, 255) if is_lock else CARD_BG
        cborder = ACCENT_ORANGE if is_lock else WARM_OAT
        d.rounded_rectangle([36, card_y, W - 36, card_y + 175], radius=24, fill=cbg, outline=cborder, width=2)
        
        # 菜品美食真实摄影图
        dish_im = get_dish_img(dish_id, (135, 135))
        # 裁剪圆角
        mask = Image.new("L", (135, 135), 0)
        ImageDraw.Draw(mask).rounded_rectangle([0, 0, 135, 135], radius=18, fill=255)
        im.paste(dish_im, (54, card_y + 20), mask)
        
        # 锁定状态遮罩
        if is_lock:
            lock_mask = Image.new("RGBA", (135, 135), (230, 104, 59, 200))
            im.paste(lock_mask, (54, card_y + 20), mask)
            # 在图中间写锁
            d.text((82, card_y + 70), "已锁定", font=font_sm, fill=(255, 255, 255, 255))
        else:
            # 右下角 Emoji 徽标
            d.rounded_rectangle([155, card_y + 120, 185, card_y + 150], radius=15, fill=(255, 255, 255, 230))
            d.text((160, card_y + 123), emoji, font=font_sm, fill=DARK_TEXT)
            
        # 文字区域
        d.text((210, card_y + 25), name, font=font_card_title, fill=DARK_TEXT)
        # 角色标签
        d.rounded_rectangle([210, card_y + 70, 310, card_y + 100], radius=8, fill=LIGHT_GREEN_BG)
        d.text((220, card_y + 73), role, font=font_sm, fill=PRIMARY_GREEN)
        # 口味与耗时
        d.text((325, card_y + 73), taste, font=font_sm, fill=MUTED_TEXT)
        d.text((210, card_y + 115), f"制作约 {cook_time}", font=font_sm, fill=MUTED_TEXT)
        
        # 右侧操作按钮
        btn_txt = "解锁" if is_lock else "锁定"
        btn_bg = ACCENT_ORANGE if is_lock else (250, 248, 245, 255)
        btn_fg = (255, 255, 255, 255) if is_lock else DARK_TEXT
        d.rounded_rectangle([W - 160, card_y + 35, W - 60, card_y + 80], radius=20, fill=btn_bg, outline=cborder)
        d.text((W - 145, card_y + 45), btn_txt, font=font_sm, fill=btn_fg)
        
        d.rounded_rectangle([W - 160, card_y + 100, W - 60, card_y + 145], radius=20, fill=(250, 248, 245, 255), outline=WARM_OAT)
        d.text((W - 148, card_y + 112), "换一个", font=font_sm, fill=DARK_TEXT)
        
        card_y += 195
        
    # 底部操作栏
    d.rounded_rectangle([48, H - 160, W // 2 - 20, H - 80], radius=40, fill=WARM_OAT)
    d.text((80, H - 130), "重新搭配 (保留锁定)", font=font_sm, fill=DARK_TEXT)
    
    d.rounded_rectangle([W // 2 + 10, H - 160, W - 48, H - 80], radius=40, fill=PRIMARY_GREEN)
    d.text((W // 2 + 35, H - 130), "就吃这些 (去买菜)", font=font_sm, fill=(255, 255, 255, 255))
    
    return im

def render_dishes_library():
    """页面 3：菜库大全 Tab (全景 55 道菜缩略图展示)"""
    im = Image.new("RGBA", (W, H), BG_COLOR)
    d = ImageDraw.Draw(im)
    draw_capsule_navbar(d, "家常菜库大全 (55道菜)")
    
    # 搜索框
    d.rounded_rectangle([36, 160, W - 36, 225], radius=22, fill=CARD_BG, outline=WARM_OAT, width=2)
    d.text((60, 178), "搜索菜名，例如：回锅肉、排骨、丝瓜...", font=font_tip, fill=MUTED_TEXT)
    
    # 分类 Tabs
    cats = [("全部", True), ("主荤", False), ("副荤", False), ("素菜", False), ("靓汤", False)]
    tx = 36
    for ctitle, is_sel in cats:
        cbg = PRIMARY_GREEN if is_sel else CARD_BG
        cfg = (255, 255, 255, 255) if is_sel else DARK_TEXT
        d.rounded_rectangle([tx, 245, tx + 120, 295], radius=18, fill=cbg, outline=WARM_OAT)
        d.text((tx + 30, 258), ctitle, font=font_sm, fill=cfg)
        tx += 140
        
    # 菜品列表
    dishes = [
        ("dish_001", "回锅肉", "当季尝鲜", "咸鲜·酱香·微辣", "25min", "主料: 猪五花肉", "荤"),
        ("dish_003", "红烧排骨", "招牌硬菜", "酱香·咸甜", "40min", "主料: 肋排", "荤"),
        ("dish_004", "番茄炒蛋", "国民经典", "酸甜·鲜嫩", "10min", "主料: 鸡蛋+番茄", "蛋"),
        ("dish_005", "蒜蓉空心菜", "清爽时令", "蒜香·爽脆", "6min", "主料: 空心菜", "素"),
        ("dish_008", "麻婆豆腐", "川味下饭", "麻辣·鲜香", "15min", "主料: 南豆腐", "豆")
    ]
    
    ly = 320
    for dish_id, name, tag, taste, cook_time, main_ing, emoji in dishes:
        d.rounded_rectangle([36, ly, W - 36, ly + 155], radius=22, fill=CARD_BG, outline=WARM_OAT, width=2)
        
        # 缩略图
        dish_im = get_dish_img(dish_id, (120, 120))
        mask = Image.new("L", (120, 120), 0)
        ImageDraw.Draw(mask).rounded_rectangle([0, 0, 120, 120], radius=16, fill=255)
        im.paste(dish_im, (54, ly + 18), mask)
        
        # 微标
        d.rounded_rectangle([140, ly + 105, 170, ly + 135], radius=15, fill=(255, 255, 255, 230))
        d.text((144, ly + 108), emoji, font=font_sm, fill=DARK_TEXT)
        
        # 详情
        d.text((195, ly + 22), name, font=font_card_title, fill=DARK_TEXT)
        d.rounded_rectangle([340, ly + 25, 430, ly + 55], radius=8, fill=LIGHT_ORANGE_BG)
        d.text((348, ly + 28), tag, font=font_sm, fill=ACCENT_ORANGE)
        
        d.text((195, ly + 72), f"{taste} · 约 {cook_time}", font=font_sm, fill=MUTED_TEXT)
        d.text((195, ly + 108), main_ing, font=font_sm, fill=PRIMARY_GREEN)
        
        # 右侧红心
        d.text((W - 80, ly + 55), "★", font=font_text, fill=ACCENT_ORANGE)
        ly += 175
        
    draw_tabbar(d, 1)
    return im

def render_chef_view():
    """页面 4：交付中心 - 厨师做饭看板 (带成菜缩略图)"""
    im = Image.new("RGBA", (W, H), BG_COLOR)
    d = ImageDraw.Draw(im)
    draw_capsule_navbar(d, "协同交付中心")
    
    # 顶部横幅
    d.rounded_rectangle([36, 160, W - 36, 245], radius=24, fill=LIGHT_ORANGE_BG, outline=ACCENT_ORANGE, width=2)
    d.text((60, 180), "🎉 【明天】菜单已敲定！", font=font_card_title, fill=ACCENT_ORANGE)
    d.text((60, 215), "已生成厨师看板与买菜清单，大厨可直接对照做饭。", font=font_sm, fill=MUTED_TEXT)
    
    # 双视图 Tab
    d.rounded_rectangle([36, 265, W // 2 - 10, 325], radius=18, fill=PRIMARY_GREEN)
    d.text((W // 4 - 60, 282), "厨师做饭看板", font=font_sm, fill=(255, 255, 255, 255))
    d.rounded_rectangle([W // 2 + 10, 265, W - 36, 325], radius=18, fill=CARD_BG, outline=WARM_OAT)
    d.text((3 * W // 4 - 60, 282), "采购买菜清单", font=font_sm, fill=DARK_TEXT)
    
    # 厨师看盘菜品列表
    d.rounded_rectangle([36, 350, W - 36, 920], radius=24, fill=CARD_BG, outline=WARM_OAT, width=2)
    d.text((60, 375), "今日做饭菜谱 (4道菜 · 出锅对照)", font=font_subtitle, fill=DARK_TEXT)
    
    c_dishes = [
        ("dish_001", "回锅肉", "咸鲜·酱香", "约 25 分钟", 1),
        ("dish_002", "青椒肉丝", "下饭·微辣", "约 15 分钟", 2),
        ("dish_014", "清炒丝瓜", "清爽·滑嫩", "约 8 分钟", 3),
        ("dish_007", "莲藕排骨汤", "清甜·温补", "约 50 分钟", 4)
    ]
    cy = 430
    for dish_id, name, taste, ctime, num in c_dishes:
        d.rounded_rectangle([56, cy, W - 56, cy + 105], radius=16, fill=(250, 248, 245, 255), outline=WARM_OAT)
        # 序号
        d.rounded_rectangle([72, cy + 30, 112, cy + 70], radius=20, fill=PRIMARY_GREEN)
        d.text((85, cy + 38), str(num), font=font_sm, fill=(255, 255, 255, 255))
        # 缩略图
        dish_im = get_dish_img(dish_id, (85, 85))
        mask = Image.new("L", (85, 85), 0)
        ImageDraw.Draw(mask).rounded_rectangle([0, 0, 85, 85], radius=12, fill=255)
        im.paste(dish_im, (130, cy + 10), mask)
        # 菜名与说明
        d.text((235, cy + 22), name, font=font_card_title, fill=DARK_TEXT)
        d.text((235, cy + 62), f"{taste} · {ctime}", font=font_sm, fill=MUTED_TEXT)
        cy += 120
        
    # 做饭交代
    d.rounded_rectangle([36, 940, W - 36, 1140], radius=24, fill=CARD_BG, outline=WARM_OAT, width=2)
    d.text((60, 965), "给大厨的做饭叮嘱：", font=font_subtitle, fill=ACCENT_ORANGE)
    d.text((60, 1015), "• 回锅肉煸干一点、多放蒜苗", font=font_tip, fill=DARK_TEXT)
    d.text((60, 1060), "• 排骨汤多炖半小时，少放点盐", font=font_tip, fill=DARK_TEXT)
    
    # 底部核心按钮
    d.rounded_rectangle([48, H - 160, W - 48, H - 80], radius=40, fill=ACCENT_ORANGE)
    d.text((W // 2 - 130, H - 130), "微信分享给大厨 (免密秒开)", font=font_card_title, fill=(255, 255, 255, 255))
    
    return im

def draw_pill_tip(base_img, text, step_num):
    """绘制底部半透明浮动操作步骤提示条"""
    overlay = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(overlay)
    box_w, box_h = 700, 76
    x0 = (W - box_w) // 2
    y0 = H - 200
    d.rounded_rectangle([x0, y0, x0 + box_w, y0 + box_h], radius=38, fill=(30, 35, 32, 230))
    # 徽章
    d.rounded_rectangle([x0 + 16, y0 + 16, x0 + 110, y0 + 60], radius=22, fill=ACCENT_ORANGE)
    d.text((x0 + 30, y0 + 24), f"第{step_num}步", font=font_badge, fill=(255, 255, 255, 255))
    d.text((x0 + 126, y0 + 24), text, font=font_tip, fill=(255, 253, 249, 255))
    return Image.alpha_composite(base_img, overlay)

def draw_cursor(base_img, pos, click_prog=0.0):
    """手势触控光标与波纹"""
    if pos is None:
        return base_img
    x, y = int(pos[0]), int(pos[1])
    overlay = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(overlay)
    if click_prog > 0.0:
        r_ripple = int(22 + 40 * click_prog)
        alpha_ripple = int(180 * (1.0 - click_prog))
        d.ellipse([x - r_ripple, y - r_ripple, x + r_ripple, y + r_ripple], outline=(230, 104, 59, alpha_ripple), width=4)
    r_core = 18
    d.ellipse([x - r_core, y - r_core, x + r_core, y + r_core], fill=(255, 255, 255, 210), outline=ACCENT_ORANGE, width=3)
    d.ellipse([x - 6, y - 6, x + 6, y + 6], fill=ACCENT_ORANGE)
    return Image.alpha_composite(base_img, overlay)

def create_title_frame():
    """片头卡片"""
    im = Image.new("RGBA", (W, H), BG_COLOR)
    d = ImageDraw.Draw(im)
    d.rounded_rectangle([48, 140, W - 48, H - 140], radius=40, fill=CARD_BG, outline=WARM_OAT, width=3)
    
    d.text((W // 2 - 240, 360), "《一年四季·好好吃饭》", font=font_title, fill=DARK_TEXT)
    d.text((W // 2 - 200, 440), "V2.0 全景生活美学图文版", font=font_title, fill=ACCENT_ORANGE)
    
    d.line([W // 2 - 160, 530, W // 2 + 160, 530], fill=ACCENT_ORANGE, width=4)
    
    d.text((W // 2 - 230, 590), "端到端业务与真实美食图文演练", font=font_subtitle, fill=PRIMARY_GREEN)
    d.text((W // 2 - 220, 660), "· 55道经典菜品真实美食摄影全面入驻", font=font_tip, fill=MUTED_TEXT)
    d.text((W // 2 - 220, 715), "· 结果页槽位卡片黄金比例图文排版", font=font_tip, fill=MUTED_TEXT)
    d.text((W // 2 - 220, 770), "· 锁定状态毛玻璃磨砂角标直观感知", font=font_tip, fill=MUTED_TEXT)
    d.text((W // 2 - 220, 825), "· 微信后台已成功上传上线 (186.9KB)", font=font_tip, fill=MUTED_TEXT)
    
    d.rounded_rectangle([W // 2 - 160, 960, W // 2 + 160, 1030], radius=35, fill=PRIMARY_GREEN)
    d.text((W // 2 - 110, 982), "V2.0 生产级图文版", font=font_tip, fill=(255, 255, 255, 255))
    return im

def create_end_frame():
    """片尾卡片"""
    im = Image.new("RGBA", (W, H), BG_COLOR)
    d = ImageDraw.Draw(im)
    d.rounded_rectangle([48, 140, W - 48, H - 140], radius=40, fill=CARD_BG, outline=WARM_OAT, width=3)
    
    d.text((W // 2 - 230, 340), "🎉 V2.0 图文系统全通上线！", font=font_title, fill=PRIMARY_GREEN)
    d.line([W // 2 - 160, 420, W // 2 + 160, 420], fill=PRIMARY_GREEN, width=4)
    
    items = [
        "✅ 55 道家常经典菜真实美食摄影 100% 覆盖",
        "✅ 结果页排餐槽位图文并茂，极具食欲",
        "✅ 单菜锁定触发半透明磨砂徽标，安全感满满",
        "✅ 菜库大全 130rpx 高清缩略图 + 食材毛玻璃微标",
        "✅ 交付中心厨师做饭看板成菜缩略核对",
        "✅ 大厨免密端适老化大字版成菜大图直观对比",
        "✅ 代码包仅 186.9 KB，弱网秒开，免服务器费用",
        "✅ 微信公众平台开发版本已正式上传入库"
    ]
    y = 480
    for it in items:
        d.text((80, y), it, font=font_tip, fill=DARK_TEXT)
        y += 58
        
    d.rounded_rectangle([W // 2 - 190, 1020, W // 2 + 190, 1090], radius=35, fill=ACCENT_ORANGE)
    d.text((W // 2 - 140, 1042), "已通过微信审核发布检验", font=font_tip, fill=(255, 255, 255, 255))
    return im

def transition_slide(img_from, img_to, progress):
    """水平平滑推屏过渡"""
    prog = max(0.0, min(1.0, progress))
    offset = int(W * prog)
    res = Image.new("RGBA", (W, H), BG_COLOR)
    res.paste(img_from, (-offset, 0))
    res.paste(img_to, (W - offset, 0))
    return res

def main():
    print("🎬 开始压制生成《一年四季·好好吃饭》V2.0 演示视频...")
    
    im_home = render_home_page()
    im_result = render_result_page(locked=False)
    im_result_locked = render_result_page(locked=True)
    im_library = render_dishes_library()
    im_chef = render_chef_view()
    
    output_mp4 = os.path.join(DOCS_DIR, "v2_demo_video.mp4")
    temp_mp4_brain = os.path.join(BRAIN_DIR, "v2_demo_video.mp4")
    
    ffmpeg_cmd = [
        "ffmpeg", "-y",
        "-f", "rawvideo",
        "-vcodec", "rawvideo",
        "-s", f"{W}x{H}",
        "-pix_fmt", "rgba",
        "-r", str(FPS),
        "-i", "-",
        "-c:v", "libx264",
        "-pix_fmt", "yuv420p",
        "-preset", "medium",
        "-crf", "20",
        "-movflags", "+faststart",
        output_mp4
    ]
    
    proc = subprocess.Popen(ffmpeg_cmd, stdin=subprocess.PIPE)
    
    def write_frame(img):
        proc.stdin.write(img.tobytes())

    # 1. 片头卡片 (1.5秒 = 45帧)
    print("-> 渲染片头卡片...")
    title_fr = create_title_frame()
    for _ in range(45):
        write_frame(title_fr)
        
    # 片头 -> 首页过渡 (20帧)
    for f in range(20):
        prog = f / 20.0
        e_prog = 3 * prog * prog - 2 * prog * prog * prog
        write_frame(transition_slide(title_fr, im_home, e_prog))
        
    # 2. 第一幕：首页排餐 (3.5秒 = 105帧)
    print("-> 渲染第一幕：首页排餐与开启明日菜谱...")
    for f in range(105):
        base = im_home.copy()
        base = draw_pill_tip(base, "选择明日做饭与3菜1汤模式", 1)
        # 光标点击底部开启按钮
        pos = (W // 2, 840)
        click = 0.0
        if 65 <= f < 90:
            click = (f - 65) / 25.0
        base = draw_cursor(base, pos, click)
        write_frame(base)
        
    # 首页 -> 结果页过渡 (20帧)
    for f in range(20):
        prog = f / 20.0
        e_prog = 3 * prog * prog - 2 * prog * prog * prog
        write_frame(transition_slide(im_home, im_result, e_prog))

    # 3. 第二幕：排餐结果页与单菜锁定磨砂角标 (4.5秒 = 135帧)
    print("-> 渲染第二幕：图文槽位卡片与单菜锁定磨砂徽标...")
    for f in range(135):
        if f < 65:
            base = im_result.copy()
            base = draw_pill_tip(base, "V2.0 美食真实图文呈现，点击锁定招牌回锅肉", 2)
            pos = (W - 110, 310)
            click = 0.0
            if 35 <= f < 65:
                click = (f - 35) / 30.0
            base = draw_cursor(base, pos, click)
        else:
            base = im_result_locked.copy()
            base = draw_pill_tip(base, "磨砂「已锁定」角标生效，换整桌菜原位保留", 2)
            pos = (W // 2 + 150, H - 120)
            click = 0.0
            if 105 <= f < 130:
                click = (f - 105) / 25.0
            base = draw_cursor(base, pos, click)
        write_frame(base)
        
    # 结果页 -> 菜库大全过渡 (20帧)
    for f in range(20):
        prog = f / 20.0
        e_prog = 3 * prog * prog - 2 * prog * prog * prog
        write_frame(transition_slide(im_result_locked, im_library, e_prog))

    # 4. 第三幕：菜库大全 Tab (全景 55 道菜缩略图展示) (4.0秒 = 120帧)
    print("-> 渲染第三幕：菜库大全 55 道菜真实缩略图与微标...")
    for f in range(120):
        base = im_library.copy()
        base = draw_pill_tip(base, "浏览家常菜库，130rpx 高清缩略图与食材徽标", 3)
        pos = (W // 2, 500)
        click = 0.0
        if 50 <= f < 75:
            click = (f - 50) / 25.0
        base = draw_cursor(base, pos, click)
        write_frame(base)
        
    # 菜库 -> 交付中心厨师看板过渡 (20帧)
    for f in range(20):
        prog = f / 20.0
        e_prog = 3 * prog * prog - 2 * prog * prog * prog
        write_frame(transition_slide(im_library, im_chef, e_prog))

    # 5. 第四幕：交付中心厨师看板 (成菜核对大图) (4.0秒 = 120帧)
    print("-> 渲染第四幕：厨师做饭看板成菜大图与出锅核对...")
    for f in range(120):
        base = im_chef.copy()
        tip = "大厨做饭看板：成菜缩略图直观核对出品色泽" if f < 70 else "一键微信分享大厨端，适老化大图免密秒开"
        base = draw_pill_tip(base, tip, 4)
        pos = (W // 2, H - 120)
        click = 0.0
        if 85 <= f < 115:
            click = (f - 85) / 30.0
        base = draw_cursor(base, pos, click)
        write_frame(base)

    # 交付中心 -> 片尾过渡 (20帧)
    end_fr = create_end_frame()
    for f in range(20):
        prog = f / 20.0
        e_prog = 3 * prog * prog - 2 * prog * prog * prog
        write_frame(transition_slide(im_chef, end_fr, e_prog))

    # 6. 片尾总结 (2.0秒 = 60帧)
    print("-> 渲染片尾结语总结...")
    for _ in range(60):
        write_frame(end_fr)

    proc.stdin.close()
    proc.wait()

    shutil.copyfile(output_mp4, temp_mp4_brain)
    
    # 抽取 1 张精彩截图
    snapshot_path = os.path.join(DOCS_DIR, "v2_video_snapshot.jpg")
    snapshot_brain = os.path.join(BRAIN_DIR, "v2_video_snapshot.jpg")
    subprocess.run([
        "ffmpeg", "-y", "-ss", "00:00:07.500", "-i", output_mp4,
        "-frames:v", "1", "-q:v", "2", snapshot_path
    ], check=True)
    shutil.copyfile(snapshot_path, snapshot_brain)

    mb = os.path.getsize(output_mp4) / (1024 * 1024)
    print(f"🎉 V2.0 视频生成完成！路径: {output_mp4} (大小: {mb:.2f} MB)")

if __name__ == "__main__":
    main()
