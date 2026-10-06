# Claude · 修改执行（可写）

- 状态：**完成**
- 模型：未指定（由 Claude Code 自己决定）；实际返回：claude-opus-5-5
- 强度：未指定（由 Claude Code 自己决定）
- 本次用量：读入 524.2 万（缓存 509.2 万） · 写出 6.1 万（思考 2.2 万） · 64 轮 · 按标价约 $3.44（订阅不另收费，占用订阅额度）
- 登录方式：subscription（authMethod=claude.ai / pro）
- 服务提供方：官方
- 用时：11 分 37 秒
- 运行编号：20261006-155050-claude-exec

## 回复

## 完成情况
完成。在本地代码层面，我把家人输入邀请码加入失败的前后端问题都修好了：真机上创建、加入、刷新口令和鉴权一律真实读写云端，不再偷偷改存到房主手机本地。`npm run build` 和 `npm test` 全部通过。还没有在真机和云开发控制台上验证，云函数也需要重新上传部署才会生效。

## 改了哪些文件
- `miniprogram/services/cloudService.ts`｜`familyManage`、`userAuth` 在真机上只走云端，出错直接把真实原因返回，不再改存本地（这是上一轮诊断的主因）。删掉了判断过宽的 `isReservedFieldOrParamError` 降级、"云端未找到口令就去本地库加入"的逻辑和两段穿透探测。就餐历史、私房菜在云环境不可用（-601034）时仍可切到本地模式。对象型错误统一转成字符串。
- `miniprogram/services/familyService.ts`｜加了请求序号：创建、加入、退出期间返回的旧鉴权结果直接丢弃，不会再把刚加入的家庭清掉。只有满足三个条件的家庭才自动补传云端：之前本机降级建的、从未被云端确认、只有房主一人。补传失败会记录"口令未同步到云端，家人暂时无法加入"，并提供 `retryCloudSync()` 重试。角色按云端的 `creatorOpenid` 推算，不再沿用本地旧角色。刷新口令时如果云端查不到这个家庭，会标记为待同步。
- `miniprogram/types/family.ts`｜新增可选字段 `syncedToCloud`，标记这个家庭是否已被云端确认。
- `miniprogram/pages/mine/index.ts`、`index.wxml`、`index.wxss`｜家庭卡片上新增"口令未同步到云端"提示条和"重新同步"按钮；-601034 的提示不再说"已切换为本地模式"。
- `cloudfunctions/familyManage/index.js`｜
  - 集合自愈：建不成功下次调用会重试；遇到集合不存在会先建表再重试一次。
  - 查口令：数据库异常或集合缺失返回 `SERVICE_ERROR`，不计入 5 次失败锁定；只有确认查不到才算 `CODE_NOT_FOUND` 并计一次失败。
  - `refreshInviteCode` 和 `getFamily` 不再把数据库异常当成"家庭不存在"。
  - 补传建家庭时，只有带 `_syncToCloud` 才能沿用原 familyId 和口令：已经在云端的本人家庭直接原样返回，不重复建；id 撞上别人的家庭就换新 id 和新口令，不会覆盖。
  - 加入时，如果微信内容安全检测服务本身出错（例如 openapi 权限没部署），在本地敏感词检查已通过的前提下放行。
- `cloudfunctions/userAuth/index.js`｜修了一个严重问题：原来读用户档案只要报错（包括超时）就当成新用户，用空档案覆盖，家庭归属会丢；现在只有文档确实不存在才建档。读家庭信息遇到瞬时异常时保留归属并返回 `familyFetchError`。只有家庭确实被解散或本人已被移出才清空归属。角色以云端为准自动校正。集合自愈逻辑同上。
- `cloudfunctions/upsertMeal/index.js`、`cloudfunctions/customDish/index.js`｜加入同样的集合自愈创建。
- `test/cloud_env_fallback_test.mjs`｜旧断言要求"-601034 或 -501007 时降级本地并创建成功"，这正是造成数据孤岛的行为，改为断言"如实失败、本机库没有残留家庭、不切断云端调用"，同时保留就餐历史降级本地的检查。
- `test/join_family_resilience_test.mjs`｜5.2 改成真正的旧版本本机孤岛补传场景，新增 5.3、5.4 和场景 8–13，覆盖：
  - 数据库超时 6 次不计失败次数，恢复后能立即加入
  - 集合缺失时自愈建表
  - 补传不覆盖他人家庭
  - 内容检测服务异常不阻断加入
  - userAuth 遇瞬时异常不覆盖档案
  - 过期鉴权结果不清掉刚加入的家庭
  - 双设备端到端：创建 → 刷新口令 → 加入 → 双方鉴权同步

## 做过的验证
- `npm run build`（tsc）：通过，无报错。
- `npm test`：10 个测试文件全部通过（退出码 0，0 个 AssertionError）。
- 对照验证：把 `userAuth` 临时换回旧代码，场景 11 会失败；恢复修复后通过，说明新测试确实能拦住这个 bug。
- 未验证：真机、云开发控制台和真实云数据库（测试里用的是本地模拟的 `wx-server-sdk`）。

## 偏离与遗留问题
1. **集合名**：代码实际用的是 `meal_history` 和 `custom_dishes`，不是任务里写的 `dishes`、`meals`。自愈时 6 个都建了。
2. **改了现有测试的预期**：`cloud_env_fallback_test` 原来的断言要求降级本地，与约束 2 直接冲突，已改为断言正确行为。
3. **内容安全检测放宽**：加入家庭时，检测服务本身出错会放行（本地敏感词检查仍然生效）；创建家庭仍然严格拦截。如需全部严格拦截，可以撤掉这一项。
4. **需要你手动做的事**：
   - 在微信开发者工具里重新上传 `familyManage`、`userAuth`、`upsertMeal`、`customDish` 四个云函数，选"云端安装依赖"。
   - 到云数据库把之前被误锁的家人 `users/user_<openid>` 的 `joinFailCount` 清零。
   - 建议房主在真机上解散后重新创建，再把新口令发给家人。如果是旧版本本机建的家庭，房主打开"我的"页时会自动补传；补传失败会看到提示条，可以点"重新同步"。
5. 改动尚未提交到 git。

## 改动清单（对比基准：2026-10-06T15:50:51 的快照）

- **修改**（15）：
  - `cloudfunctions/customDish/index.js`
  - `cloudfunctions/familyManage/index.js`
  - `cloudfunctions/upsertMeal/index.js`
  - `cloudfunctions/userAuth/index.js`
  - `miniprogram/pages/mine/index.js`
  - `miniprogram/pages/mine/index.ts`
  - `miniprogram/pages/mine/index.wxml`
  - `miniprogram/pages/mine/index.wxss`
  - `miniprogram/services/cloudService.js`
  - `miniprogram/services/cloudService.ts`
  - `miniprogram/services/familyService.js`
  - `miniprogram/services/familyService.ts`
  - `miniprogram/types/family.ts`
  - `test/cloud_env_fallback_test.mjs`
  - `test/join_family_resilience_test.mjs`
- 未纳入对比的目录：`.git`、`.peer-review`、`node_modules`、`scripts/__pycache__`
