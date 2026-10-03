# Claude · 审阅（只读）

- 状态：**完成**
- 模型：未指定（由 Claude Code 自己决定）；实际返回：claude-opus-5-5
- 强度：未指定（由 Claude Code 自己决定）
- 本次用量：读入 26 万（缓存 22.2 万） · 写出 6,456（思考 2,572） · 18 轮 · 按标价约 $0.48（订阅不另收费，占用订阅额度）
- 登录方式：subscription（authMethod=claude.ai / pro）
- 服务提供方：官方
- 用时：1 分 17 秒
- 运行编号：20261003-070436-claude-review

## 回复

## 总体结论
**修改后可用**：Codex 的 9 项都确实存在，但第 3 项被高估了（真实 SDK 下基本不会触发），第 1 项触发概率低。真正卡发布的是“同一 menuId 午晚餐覆盖”和“创建家庭非原子”两项，修完再发布。

## 问题清单
严重｜`miniprogram/services/historyService.ts:126`、`:161`｜属实，定级合理。`menu.id` 会随 `active_table_menu` 保留，换菜（`replaceDish`）也不改 id。午餐确认后，晚上回到结果页再确认，`mealId` 一样，本地按 menuId 去重，云端 `findIndex` 也会把午餐覆盖掉。这直接破坏了“同日多餐 0 覆盖”这条核心承诺｜改成 `mealId = hist_${menuId}_${targetDate}_${resolvedMealType}`；第 161 行的 menuId 去重条件加上 `r.mealType === resolvedMealType`

严重｜`cloudfunctions/familyManage/index.js:188-233`｜属实，定级合理。退出旧家、`add`、`users.set` 分三步提交。连点两次“创建”就会产生两个家庭，`memberOpenids` 里都有自己，被弃的那个家庭的口令 24 小时内仍能用。如果退出成功但 `add` 失败，`user.familyId` 会指向一个已不包含自己的家庭｜仿照 joinFamily：口令在事务外先生成好，事务内读 user，处理旧家，再 `transaction.collection('families').doc(id).set` 并写 users；前端按钮同时加防重复点击

一般｜`cloudfunctions/upsertMeal/index.js:67`｜属实，但被高估。CloudBase 事务里 get 不存在的文档会抛错，所以这个 catch 本身是需要的；问题在于它没区分错误类型，读取的瞬时异常会落到 `set` 整日覆盖。要求读失败而写成功，真实环境概率低，但一旦发生就会丢数据｜只在错误信息含 “not exist”/“does not exist” 时走新建，其他错误直接 `throw` 让事务失败。改动很小，发布前顺手修

一般｜`cloudfunctions/customDish/index.js:88`；familyManage 第 26 行同理｜从“严重”降为一般。真实 wx-server-sdk 的 `cloud.openapi` 是动态代理，typeof 判断永远成立；两个 `config.json` 都已声明 `security.msgSecCheck`，调用异常时会走第 99 行的 catch 拒绝写入。跳过检测只会在 Mock 环境出现｜去掉能力探测，直接调用，失败一律拒绝；Mock 改为显式注入审核结果

一般｜`miniprogram/services/dataProvider.ts:223`，相关 `:174`｜属实。单人模式不拉云端，换机或清缓存后私房菜丢失；本地还存的是 `'personal'`，和服务端的 `personal_${openid}` 不一致｜无家庭时也调用 `getDishes`（服务端会自动映射到个人桶），本地归属统一用服务端返回的 `familyId`

一般｜`miniprogram/services/historyService.ts:84`、`:362`｜属实。退出或换家后，如果同步失败，页面仍显示旧家庭的记录，并参与避重计算｜`getHistory` 先按当前 familyId（个人模式为空）过滤；`await` 返回后先确认家庭没变，再 `saveHistory`

一般｜`cloudfunctions/familyManage/index.js:73-139`｜属实。并发请求时都读到旧计数，限频会被大幅绕过；异常时直接放行（fail-open）｜计数改用 `_.inc(1)` 原子更新；`checkJoinRateLimit` 出异常时拒绝请求

一般｜`test/e2e_family_custom_full_flow_test.mjs:487`、`:552-554`｜属实。夹具 fallback 的菜品 ID 不存在，而惩罚按 `dish.id` 匹配；排餐本身是加权随机加扰动（jitter），断言“绝不出现”必然偶发失败｜用真实 ID，并断言 `getDishById` 不为空；固定随机种子，或把断言改成“惩罚分低于阈值”

建议｜`node_modules/wx-server-sdk/index.js:120`｜属实。Mock 事务没有锁也没有回滚，测不出并发问题｜在真实云开发测试环境补两项冒烟：连点创建家庭的并发测试、审核拒绝的路径

**发布建议**：两项严重问题必须先修。upsertMeal 读取异常和限频这两项改动小，建议一起修。修完后在真实云环境复验同日多餐和并发创建家庭。其余问题可以下个版本再处理。

## 做得好的地方（最多 2 条）
- joinFamily、leaveFamily 已经整体纳入事务，审核接口异常时会拒绝写入，修复可以直接照这个写法来。
- 离线队列带上了 `targetFamilyId`/`authorOpenid`，并会丢弃跨家庭的记录，防串门的思路是对的。
