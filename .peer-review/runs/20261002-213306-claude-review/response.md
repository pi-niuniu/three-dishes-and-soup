# Claude · 审阅（只读）

- 状态：**完成**
- 模型：未指定（由 Claude Code 自己决定）；实际返回：claude-opus-5-5
- 强度：未指定（由 Claude Code 自己决定）
- 本次用量：读入 141.6 万（缓存 132.4 万） · 写出 1.6 万（思考 9,786） · 37 轮 · 按标价约 $1.32（订阅不另收费，占用订阅额度）
- 登录方式：subscription（authMethod=claude.ai / pro）
- 服务提供方：官方
- 用时：3 分 13 秒
- 运行编号：20261002-213306-claude-review

## 回复

## 总体结论
**修改后可用。** 上一轮 5 项严重问题在代码层面都已修好，但两份新测试都是在测试自写的 Mock 上跑的，真实云函数基本没执行过。至少要在测试云环境用真机多账号跑一遍冒烟测试，才能提审。（本次只读，没有运行 `npm test`。）

## 问题清单
严重｜`test/e2e_family_custom_full_flow_test.mjs:71`、`test/security_hardening_audit_test.mjs:157-291`｜两份测试都打在 Mock（`MockCloudBaseHub` / `LocalCloudMockDatabase`）上，真实云函数只覆盖了"缺 OPENID"这一个分支。事务、`doc.set`、`where+orderBy` 都没在真实云端跑过。"第 5 人并发"其实是串行执行。Mock 的行为也和线上不一致，例如 `cloudService.ts:346` 在家庭不存在时直接放行。｜部署到测试云环境，用 2~5 个真机账号逐项验证：建家庭、加入、两人同时抢第 4 个名额、房主退出、同日两餐、敏感菜名、断网恢复。

一般｜`upsertMeal/index.js:51-55`、`customDish/index.js:128`｜`confirmedByName`、`dishNames`/`dishes`、`creatorName` 原样入库并展示给其他成员，不经过内容审核，可以绕开私房菜审核。｜昵称改从 `family.members` 取（已审核过）；`dishes` 只存 id，名称在服务端回填。另外限制数组长度，`date` 校验为 YYYY-MM-DD。

一般｜`familyManage/index.js:108-114`｜`createFamily` 退出旧家庭失败时只打 warn 就继续建新家庭。用户会同时留在两个家庭里，还能读到旧家庭的历史。｜失败时直接返回错误。

一般｜`familyManage/index.js:164-189`｜邀请码只有 6 位数字，也没有尝试次数限制，上一轮提的"防刷"没有处理，可以靠枚举进入陌生家庭。｜按 openid 限制失败次数，例如每小时 10 次。

一般｜`historyService.ts:250-253`｜越权、参数错误这类永久性失败也留在队列里无限重试，记录会一直停在 pending。｜区分网络错误和业务错误，业务错误直接出队并标记为 failed。

一般｜`familyManage/index.js:143,279`｜`doc().set()` 的 data 里带了 `_id`，部分 SDK 版本会报"不能更新_id"。我在本地 SDK 里没能确认，需要真机验证。｜去掉 data 里的 `_id`。

建议｜各云函数 `event._testMock`｜客户端传的字段能决定是否启用模拟身份。小程序端调用时一定有 OPENID，但如果开启 HTTP 访问或云函数互调，就可以伪造身份。｜只认环境变量，删掉这个字段。

建议｜方案第九节第 5 条｜文档写的是 `_.pull`，代码实际是事务内读-改-写（功能上等价）；测试套件数量文档里一处写 6 个、一处写 7 个。｜统一文档表述。

建议｜提审｜个人主体小程序里有成员互相可见的用户文本，审核时可能被认定为 UGC；`setClipboardData` 需要在隐私指引里声明。｜提审备注写明"仅邀请制家庭内可见，已接入 msgSecCheck"，补充隐私指引。

## 做得好的地方
1. 5 项严重问题在代码层面确实闭环：线上调用失败返回 `success:false`；rollback 之后会 throw；云函数统一用可信 OPENID 校验成员身份；个人私房菜用 `personal_${openid}` 隔离；msgSecCheck 2.0 按 `suggest` 判定，调用异常也拒绝入库。
2. 离线队列绑定了 `targetFamilyId`，跨家庭的记录会被丢弃；退出家庭时会清理本地数据；读历史仍是同步接口，现有页面不受影响。
