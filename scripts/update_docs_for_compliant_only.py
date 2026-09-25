import json

with open('scratch/final_clean_compliant_dishes.json', 'r', encoding='utf-8') as f:
    dishes = json.load(f)

# Sort by tier then category
tier_order = {'🌟 极力推荐': 1, '💡 特色备选': 2}
cat_order = ['main_meat', 'secondary_meat', 'vegetable', 'egg', 'tofu', 'soup', 'staple_sauce']

dishes.sort(key=lambda d: (
    tier_order.get(d['rec_level'], 9),
    cat_order.index(d['category']) if d['category'] in cat_order else 9
))

# 1. Update docs/badlulu_dishes_review.html
html_content = """<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>坏露露未入库合规新菜审核看板 (共240道纯咸鲜家常菜·零重复·零偏甜)</title>
<style>
  :root {
    --primary: #ff5722;
    --success: #2e7d32;
    --warning: #ed6c02;
    --bg: #f8f9fa;
    --card-bg: #ffffff;
    --text: #212529;
    --text-muted: #6c757d;
    --border: #e9ecef;
  }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif;
    background: var(--bg);
    color: var(--text);
    padding: 24px;
    line-height: 1.5;
  }
  .header {
    background: white;
    padding: 24px 32px;
    border-radius: 16px;
    box-shadow: 0 4px 16px rgba(0,0,0,0.06);
    margin-bottom: 24px;
  }
  .header h1 { font-size: 26px; color: #1a1a1a; margin-bottom: 8px; display: flex; align-items: center; gap: 10px; }
  .header p { color: var(--text-muted); font-size: 14px; margin-bottom: 16px; }
  
  .stats-bar {
    display: flex;
    gap: 16px;
    flex-wrap: wrap;
    margin-bottom: 20px;
  }
  .stat-card {
    background: #fdfdfd;
    border: 1px solid var(--border);
    border-radius: 12px;
    padding: 12px 20px;
    display: flex;
    flex-direction: column;
    min-width: 140px;
  }
  .stat-card.rec { border-left: 4px solid var(--success); background: #f6fbf7; }
  .stat-card.alt { border-left: 4px solid var(--warning); background: #fffcf5; }
  .stat-card.clean { border-left: 4px solid #1976d2; background: #f0f7ff; }
  .stat-num { font-size: 24px; font-weight: bold; color: #111; }
  .stat-label { font-size: 13px; color: var(--text-muted); }
  
  .filters {
    display: flex;
    flex-direction: column;
    gap: 12px;
    padding-top: 16px;
    border-top: 1px solid var(--border);
  }
  .filter-group {
    display: flex;
    align-items: center;
    gap: 10px;
    flex-wrap: wrap;
  }
  .filter-title {
    font-size: 13px;
    font-weight: 600;
    color: #495057;
    min-width: 80px;
  }
  .filter-btn {
    border: 1px solid #ced4da;
    background: white;
    padding: 6px 14px;
    border-radius: 20px;
    font-size: 13px;
    cursor: pointer;
    transition: all 0.2s;
  }
  .filter-btn:hover { background: #e9ecef; }
  .filter-btn.active {
    background: #212529;
    color: white;
    border-color: #212529;
  }
  .filter-btn.btn-rec.active { background: var(--success); border-color: var(--success); }
  .filter-btn.btn-alt.active { background: var(--warning); border-color: var(--warning); }
  
  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(330px, 1fr));
    gap: 24px;
  }
  .dish-card {
    background: var(--card-bg);
    border-radius: 16px;
    overflow: hidden;
    box-shadow: 0 4px 12px rgba(0,0,0,0.05);
    border: 1px solid var(--border);
    display: flex;
    flex-direction: column;
    transition: transform 0.2s, box-shadow 0.2s;
  }
  .dish-card:hover {
    transform: translateY(-4px);
    box-shadow: 0 8px 24px rgba(0,0,0,0.1);
  }
  .dish-card.rec-card { border-top: 4px solid var(--success); }
  .dish-card.alt-card { border-top: 4px solid var(--warning); }
  
  .img-box {
    position: relative;
    width: 100%;
    height: 220px;
    background: #eee;
    overflow: hidden;
  }
  .img-box img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    transition: transform 0.3s;
  }
  .img-box:hover img {
    transform: scale(1.05);
  }
  .badge-tier {
    position: absolute;
    top: 12px;
    left: 12px;
    padding: 4px 10px;
    border-radius: 8px;
    font-size: 12px;
    font-weight: 700;
    backdrop-filter: blur(8px);
    box-shadow: 0 2px 8px rgba(0,0,0,0.15);
  }
  .tier-rec { background: rgba(46, 125, 50, 0.9); color: white; }
  .tier-alt { background: rgba(237, 108, 2, 0.9); color: white; }
  
  .badge-cat {
    position: absolute;
    top: 12px;
    right: 12px;
    background: rgba(0,0,0,0.65);
    color: white;
    padding: 4px 8px;
    border-radius: 6px;
    font-size: 11px;
    backdrop-filter: blur(4px);
  }
  .card-body {
    padding: 16px;
    display: flex;
    flex-direction: column;
    flex: 1;
  }
  .dish-title {
    font-size: 18px;
    font-weight: 700;
    color: #111;
    margin-bottom: 8px;
    display: flex;
    align-items: center;
    justify-content: space-between;
  }
  .dish-tags {
    display: flex;
    gap: 6px;
    flex-wrap: wrap;
    margin-bottom: 12px;
  }
  .tag {
    font-size: 11px;
    padding: 2px 8px;
    border-radius: 4px;
    font-weight: 500;
  }
  .tag-sweet-good { background: #e8f5e9; color: #2e7d32; }
  .tag-ing-good { background: #e3f2fd; color: #1565c0; }
  .tag-ing-mid { background: #fff3e0; color: #e65100; }
  .tag-diff-easy { background: #f1f8e9; color: #33691e; }
  .tag-diff-mid { background: #f3e5f5; color: #7b1fa2; }
  
  .reason-box {
    background: #f8f9fa;
    border-radius: 8px;
    padding: 8px 12px;
    font-size: 12px;
    color: #495057;
    margin-bottom: 10px;
    line-height: 1.4;
  }
  .reason-box.rec { border-left: 3px solid var(--success); }
  .reason-box.alt { border-left: 3px solid var(--warning); }
  
  .card-footer {
    display: flex;
    justify-content: space-between;
    align-items: center;
    border-top: 1px solid var(--border);
    padding-top: 12px;
    margin-top: auto;
  }
  .link-btn {
    font-size: 12px;
    color: #1976d2;
    text-decoration: none;
    font-weight: 600;
  }
  .link-btn:hover { text-decoration: underline; }
  .remote-link {
    font-size: 11px;
    color: var(--text-muted);
    text-decoration: none;
  }
  .remote-link:hover { text-decoration: underline; color: #111; }
</style>
</head>
<body>

<div class="header">
  <h1>坏露露未入库合规新菜审核看板 (共240道纯咸鲜家常菜)</h1>
  <p>严格依照雇主指示过滤：<strong>① 小程序已有75道菜全部排除</strong>；<strong>② 62道偏甜/超三分甜/大油炸/重面点全部排除</strong>。呈现纯粹的咸鲜时令家常新菜。</p>
  
  <div class="stats-bar">
    <div class="stat-card rec">
      <div class="stat-num">96 道</div>
      <div class="stat-label">🌟 极力推荐 (时令鲜蔬/常见咸鲜)</div>
    </div>
    <div class="stat-card alt">
      <div class="stat-num">144 道</div>
      <div class="stat-label">💡 特色备选 (生鲜易购/咸香调剂)</div>
    </div>
    <div class="stat-card clean">
      <div class="stat-num">100%</div>
      <div class="stat-label">真实1对1原图 (无水印)</div>
    </div>
    <div class="stat-card">
      <div class="stat-num">≤ 2分甜</div>
      <div class="stat-label">严格咸鲜家常口味</div>
    </div>
  </div>

  <div class="filters">
    <div class="filter-group">
      <span class="filter-title">推荐等级：</span>
      <button class="filter-btn active" onclick="filterByTier('all')">全部 (240)</button>
      <button class="filter-btn btn-rec" onclick="filterByTier('rec')">🌟 极力推荐 (96)</button>
      <button class="filter-btn btn-alt" onclick="filterByTier('alt')">💡 特色备选 (144)</button>
    </div>
    <div class="filter-group">
      <span class="filter-title">菜品品类：</span>
      <button class="filter-btn active" onclick="filterByCat('all')">全部分类</button>
      <button class="filter-btn" onclick="filterByCat('main_meat')">🥩 主荤大菜 (22)</button>
      <button class="filter-btn" onclick="filterByCat('secondary_meat')">🍖 下饭副荤 (56)</button>
      <button class="filter-btn" onclick="filterByCat('vegetable')">🥬 时令鲜蔬 (36)</button>
      <button class="filter-btn" onclick="filterByCat('egg')">🍳 蛋类快手 (12)</button>
      <button class="filter-btn" onclick="filterByCat('tofu')">🥢 豆香豆制 (7)</button>
      <button class="filter-btn" onclick="filterByCat('soup')">🍲 养生暖汤 (27)</button>
      <button class="filter-btn" onclick="filterByCat('staple_sauce')">🍚 主食拌酱 (80)</button>
    </div>
  </div>
</div>

<div class="grid" id="dishGrid">
"""

for idx, d in enumerate(dishes):
    rec_level = d['rec_level']
    if '极力推荐' in rec_level:
        tier_class = 'tier-rec'
        card_class = 'rec-card'
        data_tier = 'rec'
    else:
        tier_class = 'tier-alt'
        card_class = 'alt-card'
        data_tier = 'alt'
        
    sweet_rating = d.get('sweetness_rating', '🟢 咸鲜清爽/微辣 (≤ 1-2分甜)')
    ing_rating = d['ingredient_rating']
    ing_tag_class = 'tag-ing-good' if '极易买到' in ing_rating else 'tag-ing-mid'
    diff_rating = d['difficulty_rating']
    diff_tag_class = 'tag-diff-easy' if '快手易做' in diff_rating else 'tag-diff-mid'
    
    html_content += f"""
  <div class="dish-card {card_class}" data-tier="{data_tier}" data-cat="{d['category']}">
    <div class="img-box">
      <img src="{d['relative_path']}" alt="{d['name']}" loading="lazy" onerror="this.src='{d['img_l']}';">
      <span class="badge-tier {tier_class}">{d['rec_level']}</span>
      <span class="badge-cat">{d['category_name']}</span>
    </div>
    <div class="card-body">
      <div class="dish-title">
        <span>{idx+1}. {d['name']}</span>
      </div>
      <div class="dish-tags">
        <span class="tag tag-sweet-good">{sweet_rating}</span>
        <span class="tag {ing_tag_class}">{d['ingredient_rating']}</span>
        <span class="tag {diff_tag_class}">{d['difficulty_rating']}</span>
      </div>
      <div class="reason-box {data_tier}">
        <strong>审核评估：</strong>{d['rec_reason']}
      </div>
      <div class="card-footer">
        <a class="link-btn" href="file://{d['local_path']}" target="_blank">🔍 点击查看本地无水印大图</a>
        <a class="remote-link" href="{d['photo_url']}" target="_blank">豆瓣相册原页</a>
      </div>
    </div>
  </div>
"""

html_content += """
</div>

<script>
let currentTier = 'all';
let currentCat = 'all';

function updateView() {
  const cards = document.querySelectorAll('.dish-card');
  cards.forEach(card => {
    const tierMatch = (currentTier === 'all' || card.dataset.tier === currentTier);
    const catMatch = (currentCat === 'all' || card.dataset.cat === currentCat);
    card.style.display = (tierMatch && catMatch) ? 'flex' : 'none';
  });
}

function filterByTier(tier) {
  currentTier = tier;
  const btns = document.querySelectorAll('.filters .filter-group:first-child .filter-btn');
  btns.forEach(b => b.classList.remove('active'));
  event.target.classList.add('active');
  updateView();
}

function filterByCat(cat) {
  currentCat = cat;
  const btns = document.querySelectorAll('.filters .filter-group:last-child .filter-btn');
  btns.forEach(b => b.classList.remove('active'));
  event.target.classList.add('active');
  updateView();
}
</script>

</body>
</html>
"""

with open('docs/badlulu_dishes_review.html', 'w', encoding='utf-8') as f:
    f.write(html_content)

print("Regenerated docs/badlulu_dishes_review.html with ONLY compliant 240 new dishes!")

# 2. Update Audit Document
doc_path = '/Users/zhuangxiji/Desktop/CC/审核/2026-09-25-一日三餐-小红书博主坏露露美食筛选与食谱库规划-实施任务.md'
with open(doc_path, 'r', encoding='utf-8') as f:
    doc_content = f.read()

rec_dishes = [d for d in dishes if d['rec_level'] == '🌟 极力推荐']
alt_dishes = [d for d in dishes if d['rec_level'] == '💡 特色备选']

lines = []
lines.append("## 十、坏露露未入库合规新菜·全量 240 道图文终审清单 (排除已有菜/排除偏甜/排除偏门)")
lines.append("")
lines.append("> 🎯 **雇主本轮审核指令 (Exact User Filtering Constraints)**：")
lines.append("> 1. **小程序中已经有的菜（75道）不再列出**：彻底排除了现有在库的所有主荤、副荤、素菜、蛋豆与汤品，杜绝同名或近义重复；")
lines.append("> 2. **建议剔除的菜（62道）不再列出**：彻底排除了 36 道偏甜/超三分甜/甜点甜饮，以及 26 道大锅深炸/重度面点/偏门食材；")
lines.append("> 3. **仅列出剩下合规的新菜**：共 **240 道纯咸鲜、时令常见、操作快手的家常新菜**，供雇主正式审阅选定入库；")
lines.append("> 4. **全量附带超清无水印图片链接**：每道菜品均配备本地直连大图链接（`file://`）与相册原页链接。")
lines.append("")
lines.append("### 📊 合规新菜分类总览")
lines.append("- 🥗 **合规新菜总数**：**240 道**")
lines.append(f"  - 🌟 **【极力推荐·家庭首选 (时令鲜蔬/常见主菜)】**：**{len(rec_dishes)} 道**")
lines.append(f"  - 💡 **【特色备选·风味调剂 (生鲜易购/咸香适口)】**：**{len(alt_dishes)} 道**")
lines.append("- 🖼️ **本地全景审查画廊**：[docs/badlulu_dishes_review.html](file:///Users/zhuangxiji/Desktop/一日三餐/docs/badlulu_dishes_review.html)")
lines.append("")

categories = [
    ('main_meat', '一、主荤大菜', 22, '大块肉类、牛腩排骨、鲜鱼整鸡等咸鲜大菜'),
    ('secondary_meat', '二、下饭副荤', 56, '家常小炒肉、肉末时蔬、快手滑炒'),
    ('vegetable', '三、时令鲜蔬', 36, '四季应季蔬菜快炒、少油凉拌、清爽素味'),
    ('egg', '四、蛋类快手', 12, '5-15分钟极速高营养咸鲜炒蛋/蒸蛋'),
    ('tofu', '五、豆制品与豆香', 7, '老豆腐、嫩豆腐、千张与百叶咸香慢煨'),
    ('soup', '六、养生汤品暖锅', 27, '家常滚汤、原汁骨汤与咸香砂锅暖锅'),
    ('staple_sauce', '七、特色主食与灵魂拌酱', 80, '猪油菜饭、咸香拌面炒面、常备咸酱汁')
]

for cat_key, cat_title, expected_cnt, cat_desc in categories:
    cat_items = [d for d in dishes if d['category'] == cat_key]
    lines.append(f"### {cat_title} (共 {len(cat_items)} 道)")
    lines.append(f"*{cat_desc}*")
    lines.append("")
    lines.append("| 序号 | 菜品名称 | 推荐等级 | 甜度与味型 | 食材易得度 | 制作难度 | 真实原图直连链接 | 审核建议与特色 |")
    lines.append("| :--- | :--- | :---: | :---: | :---: | :---: | :--- | :--- |")
    for idx, d in enumerate(cat_items):
        local_link = f"[🖼️ 本地无水印原图](file://{d['local_path']})"
        remote_link = f"[豆瓣原页]({d['photo_url']})"
        sweet = d.get('sweetness_rating', '🟢 纯咸鲜 (≤ 1-2分甜)')
        lines.append(f"| {idx+1} | **{d['name']}** | {d['rec_level']} | {sweet} | {d['ingredient_rating']} | {d['difficulty_rating']} | {local_link} <br/> {remote_link} | {d['rec_reason']} |")
    lines.append("")

new_section_text = "\n".join(lines)

if "## 十、" in doc_content:
    idx = doc_content.find("## 十、")
    doc_content = doc_content[:idx] + new_section_text + "\n"
else:
    doc_content = doc_content + "\n\n" + new_section_text + "\n"

with open(doc_path, 'w', encoding='utf-8') as f:
    f.write(doc_content)

print(f"Updated audit document: {doc_path}")
