import json

with open('docs/badlulu_full_catalog_rated.json', 'r', encoding='utf-8') as f:
    dishes = json.load(f)

doc_path = '/Users/zhuangxiji/Desktop/CC/审核/2026-09-25-一日三餐-小红书博主坏露露美食筛选与食谱库规划-实施任务.md'

with open(doc_path, 'r', encoding='utf-8') as f:
    content = f.read()

# Generate new comprehensive review section
lines = []
lines.append("## 十、坏露露美食全量 182 道菜品·图文审核与分级筛选清单 (按用户原则严选)")
lines.append("")
lines.append("> 🎯 **用户最新审核原则 (User Screening Principles)**：")
lines.append("> 1. **时令蔬菜与常见原料优先**：全国菜场、主流生鲜电商（盒马、叮咚、美团等）随处可买，拒绝冷门小众偏门食材；")
lines.append("> 2. **家常易做亲民**：排除大锅宽油深炸、复杂重度面点（包子/水饺/馅饼）、长时间卤煮（肘子/皮冻）等高门槛烹饪；")
lines.append("> 3. **全量附带超清无水印图片链接**：每道菜品均附带本地直连无水印大图链接（`file://`）与线上源图链接，支持双击直接看图审阅。")
lines.append("")
lines.append("### 📊 分级统计总览")
lines.append("- 🌟 **【极力推荐·家庭首选】**：**122 道**（100% 常见时令蔬菜与家常食材，菜场随处可买，快手家常好上手）")
lines.append("- 💡 **【特色备选·风味调剂】**：**27 道**（生鲜超市易得，风味独特如沙姜、紫苏、外婆菜等，适合周末换口味）")
lines.append("- 🚫 **【建议剔除·偏门繁琐】**：**33 道**（偏门野菜、异域调料、大锅深炸、包馅面点，不适合日常一日三餐）")
lines.append("- 🖼️ **可视化看板**：本地全功能交互画廊 [docs/badlulu_dishes_review.html](file:///Users/zhuangxiji/Desktop/一日三餐/docs/badlulu_dishes_review.html)")
lines.append("")

categories = [
    ('main_meat', '一、主荤大菜 (30 道)', '以猪牛鸡鸭大鱼为主的大份量硬菜'),
    ('secondary_meat', '二、下饭副荤 (30 道)', '快手小炒肉、肉末时蔬、家常炒鸡'),
    ('vegetable', '三、时令鲜蔬 (52 道)', '四季蔬菜快炒、少油凉拌、家常素味'),
    ('egg', '四、蛋类快手 (12 道)', '5-15分钟极速高蛋白快手菜'),
    ('tofu', '五、豆制品与豆香 (12 道)', '老豆腐、嫩豆腐、千张百叶与腐竹'),
    ('soup', '六、养生汤品与暖锅 (16 道)', '家常滚汤、砂锅慢煨与滋补暖锅'),
    ('staple_sauce', '七、特色主食与灵魂拌酱 (30 道)', '万能拌面酱、电饭煲焖饭、家常炒面炒饭')
]

for cat_key, cat_title, cat_desc in categories:
    cat_dishes = [d for d in dishes if d['category'] == cat_key]
    lines.append(f"### {cat_title}")
    lines.append(f"*{cat_desc}*")
    lines.append("")
    lines.append("| 序号 | 菜品名称 | 推荐分级 | 食材易得度 | 烹饪难度 | 核心食材 | 无水印图片直连链接 | 筛选审核意见 |")
    lines.append("| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |")
    
    for idx, d in enumerate(cat_dishes):
        name = d['name']
        rec = d['rec_level']
        ing_rate = d['ingredient_rating']
        diff_rate = d['difficulty_rating']
        ing = d['ingredients'].replace('|', '/')
        local_link = f"[🖼️ 本地无水印原图](file://{d['local_path']})"
        remote_link = f"[豆瓣大图]({d['img_url']})"
        reason = d['rec_reason'].replace('|', '/')
        
        lines.append(f"| {idx+1} | **{name}** | {rec} | {ing_rate} | {diff_rate} | {ing} | {local_link} <br/> {remote_link} | {reason} |")
    lines.append("")

new_section_text = "\n".join(lines)

# Replace section 10 onwards or append
if "## 十、坏露露美食全量 182 道菜品" in content:
    idx = content.find("## 十、坏露露美食全量 182 道菜品")
    content = content[:idx] + new_section_text + "\n"
else:
    content = content + "\n\n" + new_section_text + "\n"

with open(doc_path, 'w', encoding='utf-8') as f:
    f.write(content)

print(f"Updated audit document: {doc_path}")
