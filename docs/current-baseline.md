# 第一版实现基线

更新日期：2026 年 10 月 9 日。第一版已完成；最新项目记录更正为正在申请上线、尚未进入玩家测试、没有玩家。应用 **0.1.1**，Android 手机／平板 **versionCode 5**，题库 **mainline-1000-v5**。Google Play 标题 Water Sort - No Ads，应用品牌 Bottle Harmony，包名 `com.bottleharmony.app`，开发者 Platon Games。

10 月 9 日已创建独立 Google 测试群并保存 Alpha 绑定，配置变更已发送审核；Console 显示 Alpha 为 Active，发布概览显示 Last published on 8 October 2026。实际玩家加入、测试起算日与生产发行仍未确认。加入入口见[测试安排](play-testing-plan.md)，审核与平台边界见[发布记录](release-readiness.md)。

## 已实现能力与代码对应

| 范围 | 第一版实际行为 | 主要实现与验证入口 |
| --- | --- | --- |
| 主线 | 固定 1000 题，按序完成；前三题教学；10 关次峰、20 关主峰；不跳关 | `src/game/mainline.ts`、`productionPlan.ts`；`tests/mainline.test.ts`、`mountainPlan.test.ts` |
| 副关卡 | 每 20 主线题插入一道，共 50 道；目标瓶底层凝固，可免费融化；第 1000 题后的副关完成后结束 | `src/game/solidSide.ts`、`solidRules.ts`、`session.ts`；`tests/solidSide.test.ts` |
| 规则 | 四份等容量，顶部连续同色按目标余量转移；所有非空瓶满且单色即完成 | `src/game/rules.ts`、`session.ts`；`tests/rules.test.ts`、`core.test.ts` |
| 提示与恢复 | 撤销／重来免费；新主线／副关每题首次成功一步提示免费，之后每次一券；首次主线通关普通题 +1、十关挑战 +2，余额上限 5；重玩／内部预览提示免费、不发券 | `src/game/mainline.ts`；`tests/mainline.test.ts` |
| 可选备用瓶 | 仅第 4、65、68、193、364、463、485 关；占据原位置，免费启用；保留动作与撤销历史，重来不收回 | `src/game/optionalReserve.ts`；`tests/optionalReserve.test.ts` |
| 重玩 | 已完成主线与副关可重玩；独立会话，不覆盖正在推进的主线／副关，不授予主线进度 | `src/game/mainline.ts`；`tests/mainline.test.ts`、`sqlite.test.ts` |
| 本地恢复 | 保存主线、副关、重玩动作及撤销历史、完成位置、提示资源与符号；声音／符号／容器统一 SQLite 偏好 | `src/ui/usePlayProgress.ts`、`src/storage/`、`tests/sqlite.test.ts` |
| 卡住反馈 | 无合法移动在倒水回位后显示底部恢复入口；按需提示搜索可证明无解；预算不足只报未知 | `src/ui/stalledNoticePolicy.ts`、`StalledNotice.tsx`；`tests/stalledNotice.test.ts` |
| 美术与容器 | 15 款免费外观，首页滑动／箭头选择并记住；统一棋盘款式；固定明亮 11 色、可选颜色符号；窄口瓶塞、宽口光晕 | `src/art/vesselDesigns.ts`、`palette.ts`、`Bottle.tsx`；`tests/vessels.test.ts` |
| 倒水与完成 | 1900 ms 倒水；杯腔裁切涟漪、局部轮廓、完成色柔光与瓶塞反光；D1–D4 对应 2–5 朵礼花，结束后继续 | `src/art/`、`src/ui/gamePresentation.ts`；表现／礼花测试 |
| 声音 | 6 类、18 段 CC0 实录试听片段，按容器和接水起始水位选择；只随可见水流播放；原创合成礼花声；共用本地声音开关 | `src/art/pourAudio.ts`、`src/ui/PourSound.tsx`；`tests/pourSound.test.ts`；`assets/audio/README.md` |
| 设置与语言 | 设置只有音效、辅助符号、隐私政策；源码 21 种语言跟随系统（提交包仍为 13 种），失败回退英语；无手动语言和完成效果入口；减少动态效果跟随系统 | `src/ui/MainlineMenu.tsx`、`src/i18n/`；`tests/i18n.test.ts` |
| 布局与输入 | 4–12 瓶、两排、每排至多 6 个，同窗口统一大瓶；手机全宽；平板横竖屏／宽窗侧栏；浏览器鼠标触摸键盘、TV 遥控焦点 | `src/ui/boardLayout.ts`、`deviceLayout.ts`、`boardNavigation.ts`；[跨设备证据](device-support.md) |
| 内部工具 | 公开配置关闭；显式内部构建保留 C 对照、任意主线／副关预览和诊断，均不记进度 | `app.json`、`src/ui/buildConfig.ts`；`npm run start:internal` |

逻辑动作、完成与奖励先提交，再播放表现；动画和音频结束不授予进度。切后台、调整窗口、撤销或重来按既有流程取消表现，显示实际逻辑局面。倒水美术允许横向越界裁切，不为移动中的瓶子缩小棋盘。


## 内容与后续边界

记忆玩法已接入 100 道结构互异的试排题 `memory-100-v1`，专门离线程序制作、双路线回放及 SQLite 读回验证；原五题保留稳定 ID 并重新编排，当前尝试不重置。主页独立入口、首次教学、部分遮色与永久揭示、第四个查看／整理按钮、免费辅助及独立恢复均已实现。iPhone 开发签名 Release 已覆盖安装，启动与原 SQLite 数据保留通过，详见[设备记录](device-support.md)；规则与校准边界见[记忆专题](memory-mode-plan.md)。Google Play 此前提交的 0.1.1（5）包尚未替换。

当前 D1／D2／D3／D4 为 **8／315／510／167**，是结构代理分档而非玩家实测。完整目录保存来源与证据，运行使用通过读回验证的 SQLite 关卡库；内容约束和验收统一见[制作配方](production-plan.md)。内部 C 样本、原始演示和旧 80 题只作对照／工具，不是公开主线。

第一版没有商业关卡门槛、推荐、Premium、内购、账号、云同步、在线统计、广告、生命或倒计时。已确认未实施的[商业规则](gameplay-ideas.md#后续商业规则无广告推荐与-premium)、[四区域方向](gameplay-ideas.md#四个游戏区域题库规模与提示资源讨论方向)各按其状态维护；[全 SQLite 新基线](gameplay-statistics-plan.md)已接入源码；第二版已授权记忆百题试排，实际记忆价值与坡度待真人校准。

## 源码验证与发布差异

此前辅助符号增量 `ab80e1f` 增加倒水中持续显示辅助符号、满杯同色视觉装满后淡出、撤销恢复，详见[游玩流程](play-flow.md#视觉与内部工具)。该增量 **155／155 测试、TypeScript、ESLint 通过**，本地网页检查倒水、完成隐藏和撤销恢复；没有重新构建／安装手机或发布，不能归入已提交测试包。

当前千关已独立完成来源重建、路线回放、规划／人类代理／标签重算与全局去重；目录 SHA-256 为 `04e540f8bb21914a1b7dcfff4d29c085aee3cc1fc042e8b7478e3de29fca1795`，运行投影严格一致，50 副关双状态验证通过。文档整理不代表重新全库评级或设备验收。真机性能、声音、最低系统及跨平台未验项统一见[设备支持](device-support.md)。

SQLite 新基线已接入当前源码：只读关卡库、玩家会话、统计及全部本地偏好均使用 SQLite，不导入旧开发 JSON／AsyncStorage。当前无玩家，新基线首次启动重新开始，其后必须恢复自身数据；此授权不适用于未来测试或发行后的重置。本轮构建和验收记录位于 `builds/sqlite-acceptance/`，实际已完成范围按记录判定；此前提交包不包含这次改造。
