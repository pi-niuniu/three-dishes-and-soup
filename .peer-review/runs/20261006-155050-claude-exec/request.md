# 任务
/claude  你来彻底修复下。

## 目标
彻底修复微信小程序“四季三餐·好好吃饭”家庭厨房功能：解决家人输入邀请码无法加入家庭空间的全部前后端 Bug，确保真机环境下创建家庭、生成口令、查询口令、加入家庭、鉴权同步和防刷限频端到端 100% 稳定互通。

## 需要阅读的文件
1. 上一轮 Claude 审阅诊断报告：
   - `/Users/zhuangxiji/Desktop/CC/一日三餐/.peer-review/runs/20261006-140817-claude-review/response.md`
2. 核心前后端业务代码：
   - `/Users/zhuangxiji/Desktop/CC/一日三餐/cloudfunctions/familyManage/index.js`（家庭管理云函数：createFamily、joinFamily、checkJoinRateLimit 等）
   - `/Users/zhuangxiji/Desktop/CC/一日三餐/cloudfunctions/userAuth/index.js`（用户鉴权云函数：静默建档、更新、拉取家庭）
   - `/Users/zhuangxiji/Desktop/CC/一日三餐/miniprogram/services/cloudService.ts`（云服务封装：isReservedFieldOrParamError、callFunction 等）
   - `/Users/zhuangxiji/Desktop/CC/一日三餐/miniprogram/services/familyService.ts`（家庭业务服务：syncUserAuth、createFamily、joinFamily 等）
   - `/Users/zhuangxiji/Desktop/CC/一日三餐/miniprogram/pages/mine/index.ts`（“我的”页面逻辑：handleJoinFamily、handleCreateFamily 等）
   - `/Users/zhuangxiji/Desktop/CC/一日三餐/miniprogram/pages/mine/index.wxml`（“我的”页面模板）
3. 自动化测试文件：
   - `/Users/zhuangxiji/Desktop/CC/一日三餐/test/join_family_resilience_test.mjs`
   - `/Users/zhuangxiji/Desktop/CC/一日三餐/test/cloud_env_fallback_test.mjs`

## 背景与约束
1. 生产环境云开发环境 ID 为 `cloudbase-d8gsg70x9e12e0074`。
2. 彻底杜绝本地 Mock 假降级导致的数据孤岛（真机生产环境中必须真实读写云数据库，禁止把家庭只保存在房主单机 Storage 里）。
3. 云函数必须确保集合 `families`、`users`、`dishes`、`meals` 存在（自愈创建），不能因新环境未手动建表而抛出 -502005。
4. 口令查询必须区分底层 DB 异常与“无此口令”，底层异常不得对家人计入 5 次防刷失败锁定。
5. 完成修改后，必须运行 `npm run build` 和 `npm test` 保证全部编译与测试 100% 通过。

## 交付要求
1. 修改涉及的代码文件，并列出明确的改动清单与原因。
2. 运行构建与测试，验证改动未破坏任何现有功能。

---

## 回复格式

完成后请按以下结构汇报：

## 完成情况
完成 / 部分完成 / 未完成，一句话说明。

## 改了哪些文件
（每个文件一行：路径｜改了什么）

## 做过的验证
（运行了哪些命令或测试，结果如何；没有验证就写“未验证”）

## 偏离与遗留问题
（和任务说明不一致的地方、没做完的事；没有就写“无”）
