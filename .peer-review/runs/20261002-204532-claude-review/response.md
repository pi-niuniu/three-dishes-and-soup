# Claude · 审阅（只读）

- 状态：**完成**
- 模型：未指定（由 Claude Code 自己决定）；实际返回：claude-opus-5-5
- 强度：未指定（由 Claude Code 自己决定）
- 本次用量：读入 36.4 万（缓存 30.3 万） · 写出 1.2 万（思考 7,453） · 20 轮 · 按标价约 $0.78（订阅不另收费，占用订阅额度）
- 登录方式：subscription（authMethod=claude.ai / pro）
- 服务提供方：官方
- 用时：2 分 14 秒
- 运行编号：20261002-204532-claude-review

## 回复

## 总体结论
**修改后可用。** 方案的方向是对的：日文档加餐次数组、SWR 本地优先、离线队列绑定家庭，这几处设计都合理。但落地代码在**降级 Mock 假成功、云函数越权、内容审核实际不拦截、事务回滚后代码继续执行**四处有硬伤，现在上线会丢数据、过不了审核。另外 `npm test` 只跑了本地 Mock，4 个云函数一个都没测到，测出的 100% 通过说明不了线上行为。

## 问题清单
严重｜`cloudService.ts:457-463`｜云函数调用失败后自动降级到本地 Mock。离线开饭时 Mock 返回 success，记录被标成 synced 并移出队列，**永远不会上云**；离线建家庭、入家庭、退家庭也只会写进本地的假状态｜Mock 只在没有 `wx.cloud` 或测试环境时启用；线上网络出错一律返回 `{success:false}`，交给队列重试

严重｜`upsertMeal` 全文、`customDish:128`、`familyManage:287`｜服务端不校验调用者是否在 `memberOpenids` 里，任何人拿到 familyId 就能读写别人家的历史和私房菜，`getFamily` 还会把邀请码泄露出去。所有无家庭用户的私房菜都写进同一个 `'personal'` 桶，大家互相可见｜familyId 以服务端 `users.familyId` 为准，不信任客户端传值；个人桶改成 `personal_${openid}`

严重｜`customDish:76-91`｜内容审核实际不拦截：① 没有 `config.json` 声明 openapi 权限，调用必然报错；② 报错只要不是 87014 就被吞掉，照常入库；③ 用的是 1.0 参数，只看 errCode，没看 `result.suggest`｜补 `config.json` 的 `permissions.openapi`；改用 2.0（传 openid、scene、`version:2`），`suggest` 不是 `pass` 就拒绝；调用异常也拒绝入库。家庭名和昵称同样要送检

严重｜`familyManage:114/121/135`｜`await transaction.rollback()` 之后没有 return 或 throw，代码继续往下跑：famDoc 为 null 时直接 TypeError；口令过期或满员时还会对已中止的事务写入，返回给用户的提示也不可控｜改成 `throw new Error(msg)`，在 catch 里统一转成提示文案

严重｜`familyManage:311-343`、`createFamily`｜退出、创建家庭时对 members 整个数组做非事务的读-改-写，和并发的 joinFamily 会互相覆盖：可能把刚加入的人抹掉，而这个人的 `users.familyId` 仍指向该家庭｜放进 `runTransaction`，或改用 `_.pull`

一般｜`familyManage:102`｜邀请码有四个问题：① 不保证唯一；② 查询没带过期条件，`data[0]` 随便取一条；③ 没有尝试次数限制，"防刷"并未实现；④ 明文存储（方案写的是散列）｜生成时查重；查询加上 `inviteExpiredAt:_.gt(now)`；按 openid 限频

一般｜`test/family_sharing_custom_dishes_test.mjs`｜测试只打到同步执行的 Mock，没有真实并发，"第 5 人并发被拦截"这个结论不成立｜针对云函数写 `Promise.all` 并发用例，并补真机多账号验收

一般｜方案第六、七章｜方案里写了 `_.push`、`dismissFamily`、安全规则和数组长度约束、邀请码散列，代码里都没有，但文档标成"✅已完成"｜修正文档，或者把这些补上

一般｜`historyService.ts`、`dataProvider.ts:238`｜退出家庭后，本地仍留着旧家庭的历史和私房菜，`getHistory` 会混在一起；跨家庭被丢弃的队列项，对应的本地记录永远停在 pending｜退出时按 familyId 清理或归档，并重置同步状态

一般｜`historyService.ts:190`｜没有监听网络恢复，只有打开历史页时才会同步；排餐时用来避重的历史可能是旧的｜加 `wx.onNetworkStatusChange`，并在 onShow 时节流同步

一般｜各云函数 `event.mockOpenid`｜拿不到 OPENID 时会退回到客户端传入的身份，存在伪造风险｜线上去掉这个兜底，OPENID 为空直接拒绝

一般｜`upsertMeal:23-41`｜date、timestamp、dishes 都没做格式和长度校验，meals 数组也没有上限｜加入参校验和上限

建议｜`dataProvider.ts:84`｜私房菜食材为空、`mainIngredient` 直接取菜名，导致忌口、过敏过滤和主料避重对它不起作用｜录入时可选填主料，忌口再按菜名关键字兜底

建议｜`app.ts:18`｜`wx.cloud.init` 没指定 env｜显式写上 env

## 做得好的地方
1. `getHistory` 保持同步 API，加上 subscribe 通知页面刷新，对现有页面没有破坏；离线队列显式绑定 `targetFamilyId`，能防止记录写进别的家庭。
2. 私房菜在 `hydrateCustomDish` 里统一补齐字段，空食材就留空、不编造，`calculateHistoryPenalty` 也能容忍格式异常的记录。
