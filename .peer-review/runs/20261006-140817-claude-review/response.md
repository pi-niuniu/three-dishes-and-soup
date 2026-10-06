# Claude · 审阅（只读）

- 状态：**完成**
- 模型：未指定（由 Claude Code 自己决定）；实际返回：claude-opus-5-5
- 强度：未指定（由 Claude Code 自己决定）
- 本次用量：读入 39.7 万（缓存 34.2 万） · 写出 1.1 万（思考 7,160） · 20 轮 · 按标价约 $0.72（订阅不另收费，占用订阅额度）
- 登录方式：subscription（authMethod=claude.ai / pro）
- 服务提供方：官方
- 用时：2 分 5 秒
- 运行编号：20261006-140817-claude-review

## 回复

## 总体结论
**修改后可用。** 云函数里 `joinFamily` 的事务逻辑基本没问题。根因更可能在客户端的"熔断降级"：云端出错时，客户端悄悄改用只存在本机的模拟数据库。房主的"皮妞妞"和口令 646755 很可能只存在房主自己的设备上，没有写进云数据库，所以家人在另一台手机上怎么输都查不到。

**截图上的关键证据：** 家人截图里输入框仍显示 646755。加入成功时代码会把输入框清空（`miniprogram/pages/mine/index.ts:165-169`），所以这次是云端或本地直接返回了失败，不是"加入成功后界面没刷新"。另外，房主截图看起来是开发者工具模拟器，不是真机，更容易是在本地降级模式下建的家庭。以上是根据代码推断的，还没有查过云数据库和云函数日志。

## 问题清单
严重｜`cloudService.ts:663-685, 715-723, 766-774`｜判断"保留字段冲突"的规则太宽：只要报错里含 `document.set:fail`、`invalid parameters` 或整个结果 `JSON.stringify` 后命中关键词，就当作 -501007 处理。实际上集合不存在（-502005，新环境 `cloudbase-d8gsg…` 常见没建 `families`/`users`）、云函数是旧版本等真实错误也会被误判。误判后整个会话改走本机模拟库，`createFamily` 还会返回假成功，房主看到的口令只存在自己手机上｜判断只认 `errCode === -501007`；`createFamily`/`joinFamily`/`refreshInviteCode` 在真机上一律不降级，直接提示错误。本地模拟库只在单测或 `forceMock` 时用

严重｜`familyService.ts:139-163`｜补传云端的逻辑有两个缺陷：①依赖 `creatorOpenid === 云端 openid` 或 `role==='creator'`，但第 128 行已经先把 role 覆盖成云端的 null；本地建家庭时 openid 可能还是 `wx_user_default`，条件不成立，就不会补传。②就算触发了补传，云端再报错又会掉回本地，`syncRes.success` 依然为 true，房主永远看不出问题｜补传只认真正的云端成功（返回里没有 `isLocalFallback`），失败时在房主界面标出"口令未同步到云端，家人无法加入"

严重｜`familyManage/index.js:388, 394`｜`where().get().catch(() => null)` 把所有数据库异常都吞掉了（集合不存在、超时等），对外统一报"未找到口令"，还会累加失败次数（`recordJoinFailure`）｜只有确认"查询结果为空"才算没找到；其他异常写日志并返回"服务异常"，不计入失败次数

一般｜`familyManage/index.js:108-146, 375/406/415`｜家人用正确口令重试 5 次失败（实际原因是家庭不在云端），就会被锁 15 分钟，之后即使修好了也加不进去｜修复后到云数据库手动清零 `users/user_<openid>` 的 `joinFailCount`；服务异常不应计入失败

一般｜`familyManage/index.js:380-381`、`config.json`｜如果云函数没有带上 `config.json` 的 openapi 权限一起重新部署，`msgSecCheck` 报错会导致加入一律失败（"内容安全检测服务异常"）｜重新上传部署云函数（选"云端安装依赖"），并检查日志

一般｜`familyService.ts:120-165`、`mine/index.ts:41-43`｜`onShow` 里的 `syncUserAuth` 和加入请求是并发的。从微信聊天复制口令再切回来会触发 onShow；如果旧的 `userAuth` 响应（familyId 为空）在加入成功后才返回，会把刚加入的家庭清掉｜加请求序号或时间戳，只采用最新的响应；加入期间跳过同步

建议｜排查步骤｜①云开发控制台 → 数据库：确认有没有 `families` 集合，以及 `inviteCode = "646755"` 的记录；②查 `familyManage`/`userAuth` 云函数日志；③房主设备的存储里查 `mock_db_families` 是否有 646755；④在真机上用 vConsole 看家人点击后返回的 `error` 和 `isLocalFallback`；⑤确认云函数已按最新代码重新部署｜①为空就基本坐实根因：先建好集合，再改掉降级逻辑，然后让房主解散后在真机上重新创建

## 做得好的地方
1. `joinFamily` 用事务做了 4 人上限、一人只能在一个家庭、已是成员时幂等返回，云端核心逻辑是对的。
2. 前后端的口令清洗一致（`cleanInviteCode` / `normalizeInviteCode`），还兼容全角数字和长文本，能排除"口令格式不对"这个原因。
