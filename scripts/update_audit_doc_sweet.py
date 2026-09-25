import json

with open('scratch/ground_truth_catalog_sweet_audited.json', 'r', encoding='utf-8') as f:
    dishes = json.load(f)

doc_path = '/Users/zhuangxiji/Desktop/CC/审核/2026-09-25-一日三餐-小红书博主坏露露美食筛选与食谱库规划-实施任务.md'

with open(doc_path, 'r', encoding='utf-8') as f:
    content = f.read()

retained = [d for d in dishes if d['rec_level'] != '🚫 建议剔除']
excluded_sweet = [d for d in dishes if d.get('exclude_category') == '口味过甜剔除 (超过三分甜/甜食甜饮)']
excluded_tech = [d for d in dishes if d.get('exclude_category') == '原建议剔除 (偏门难买/大油炸/重面点)']
recommended = [d for d in retained if d['rec_level'] == '🌟 极力推荐']
alternate = [d for d in retained if d['rec_level'] == '💡 特色备选']

lines = []
lines.append("## 十、坏露露真确相册 322 道菜品·偏甜剔除与咸鲜家常终审清单 (严格执行超三分甜剔除)")
lines.append("")
lines.append("> 🎯 **雇主最新终审原则 (Strict Sweetness & Exclusivity Directives)**：")
lines.append("> 1. **超三分甜全部剔除**：坚决剔除所有过于偏甜口、超过三分甜的菜品（如：拔丝、糖醋、蜜汁、果香浓重、加糖较多的照烧、糖南瓜、烤地瓜红薯、甜味玉子烧、椰青卤肉等）；")
lines.append("> 2. **甜品甜汤甜点彻底清除**：彻底剔除冰激凌、思慕雪、龟苓膏、仙豆膏、银耳羹、山楂糖水、可丽饼、红豆饼、年糕等非正餐甜食；")
lines.append("> 3. **前序建议剔除项彻底剥离**：彻底剥离偏门冷门食材（臭鳜鱼、秋刀鱼、阿多波等）、大锅深炸（炸猪排、炸鸡块等）与重度面点（包子、水饺、馅饼、煎饼果子）；")
lines.append("> 4. **聚焦咸鲜正餐家常**：保留真正适合一日三餐中国家庭的咸鲜、咸香、微辣、酸辣快手菜，甜度严格控制在 1~2 分微回甘以内；")
lines.append("> 5. **全量真图直连**：每道菜品均配备 100% 真实出锅摄影大图，提供本地无水印直连（`file://`）。")
lines.append("")
lines.append("### 📊 终审分类统计总览")
lines.append(f"- 🥗 **【保留入库候选池·咸鲜家常】**：共 **{len(retained)} 道**（全部符合甜度 ≤ 3分甜、食材易得、家常亲民）")
lines.append(f"  - 🌟 **极力推荐 (时令鲜蔬/常见主菜)**：**{len(recommended)} 道**")
lines.append(f"  - 💡 **特色备选 (生鲜易购/风味调剂)**：**{len(alternate)} 道**")
lines.append(f"- 🚫 **【严格剔除不入库清单】**：共 **{len(excluded_sweet) + len(excluded_tech)} 道**")
lines.append(f"  - 🍬 **口味过甜剔除 (>3分甜/甜品甜饮)**：**{len(excluded_sweet)} 道**")
lines.append(f"  - ⚒️ **工序与原料偏门剔除 (油炸/面点/冷门)**：**{len(excluded_tech)} 道**")
lines.append("- 🖼️ **本地全景审查画廊**：[docs/badlulu_dishes_review.html](file:///Users/zhuangxiji/Desktop/一日三餐/docs/badlulu_dishes_review.html)")
lines.append("")

# Table of sweet excluded dishes
lines.append("### 🍬 附表一：口味过甜剔除清单（共 36 道，超过三分甜或甜品甜饮）")
lines.append("| 序号 | 菜品名称 | 品类 | 甜度定级 | 剔除理由 | 真实原图直连 |")
lines.append("| :--- | :--- | :---: | :---: | :--- | :--- |")
for idx, d in enumerate(excluded_sweet):
    local_link = f"[🖼️ 本地原图](file://{d['local_path']})"
    lines.append(f"| {idx+1} | **{d['name']}** | {d['category_name']} | {d['sweetness_rating']} | {d['rec_reason']} | {local_link} |")
lines.append("")

# Table of tech/niche excluded dishes
lines.append("### ⚒️ 附表二：偏门与繁复工序剔除清单（共 26 道，大油炸/重面点/偏门食材）")
lines.append("| 序号 | 菜品名称 | 品类 | 制作难度/原料属性 | 剔除理由 | 真实原图直连 |")
lines.append("| :--- | :--- | :---: | :---: | :--- | :--- |")
for idx, d in enumerate(excluded_tech):
    local_link = f"[🖼️ 本地原图](file://{d['local_path']})"
    lines.append(f"| {idx+1} | **{d['name']}** | {d['category_name']} | {d['difficulty_rating']} / {d['ingredient_rating']} | {d['rec_reason']} | {local_link} |")
lines.append("")

# Retained dishes by category
lines.append("### 🌟 附表三：合格候选菜谱清单（260 道，咸鲜正餐·甜度≤3分甜·时令常见）")
categories = [
    ('main_meat', '一、主荤大菜', '大块肉类、牛腩排骨、鲜鱼整鸡等咸鲜大菜'),
    ('secondary_meat', '二、下饭副荤', '家常小炒肉、肉末时蔬、快手滑炒'),
    ('vegetable', '三、时令鲜蔬', '四季应季蔬菜快炒、少油凉拌、清爽素味'),
    ('egg', '四、蛋类快手', '5-15分钟极速高营养咸鲜炒蛋/蒸蛋'),
    ('tofu', '五、豆制品与豆香', '老豆腐、嫩豆腐、千张与百叶咸香慢煨'),
    ('soup', '六、养生汤品暖锅', '家常滚汤、原汁骨汤与咸香砂锅暖锅'),
    ('staple_sauce', '七、特色主食与灵魂拌酱', '猪油菜饭、咸香拌面炒面、常备咸酱汁')
]

for cat_key, cat_title, cat_desc in categories:
    cat_dishes = [d for d in retained if d['category'] == cat_key]
    lines.append(f"#### {cat_title} (共 {len(cat_dishes)} 道)")
    lines.append(f"*{cat_desc}*")
    lines.append("")
    lines.append("| 序号 | 菜品名称 | 推荐等级 | 甜度标准 | 食材可得度 | 制作难度 | 真实原图直连 | 审核意见 |")
    lines.append("| :--- | :--- | :---: | :---: | :---: | :---: | :--- | :--- |")
    for idx, d in enumerate(cat_dishes):
        local_link = f"[🖼️ 本地无水印原图](file://{d['local_path']})"
        lines.append(f"| {idx+1} | **{d['name']}** | {d['rec_level']} | {d['sweetness_rating']} | {d['ingredient_rating']} | {d['difficulty_rating']} | {local_link} | {d['rec_reason']} |")
    lines.append("")

new_section_text = "\n".join(lines)

if "## 十、" in content:
    idx = content.find("## 十、")
    content = content[:idx] + new_section_text + "\n"
else:
    content = content + "\n\n" + new_section_text + "\n"

with open(doc_path, 'w', encoding='utf-8') as f:
    f.write(content)

print(f"Updated audit document with sweet-audited data: {doc_path}")
