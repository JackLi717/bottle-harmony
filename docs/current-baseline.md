# 第一版实现基线

更新日期：2026 年 10 月 9 日。第一版已完成；最新项目记录更正为正在申请上线、尚未进入玩家测试、没有玩家。应用 **0.1.4**，Android 手机／平板 **versionCode 8**，题库 **mainline-1000-v5**。Google Play 标题 Water Sort - No Ads，应用品牌 Bottle Harmony，包名 `com.bottleharmony.app`，开发者 Platon Games。

10 月 9 日已将 `7dcfb94` 正式配置构建为 0.1.4（8）并上传 Alpha，发送审核后 Console 显示 Changes in review，快速检查仍在运行；内部工具关闭。上一版 0.1.3（7）在本轮 Console 核对时已显示 Available to selected testers；实际玩家加入、测试起算日与生产发行仍未确认。测试群沿用既有绑定，加入入口见[测试安排](play-testing-plan.md)，产物、审核及平台边界见[发布记录](release-readiness.md)。

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
| 设置与语言 | 设置有音效、辅助符号、语言、隐私政策；21 种语言默认跟随系统（本次提交包已包含），可手动选择并用 SQLite 记住；无完成效果入口；减少动态效果跟随系统 | `src/ui/MainlineMenu.tsx`、`src/i18n/`；`tests/i18n.test.ts` |
| 首页与导航 | 经典排序／颜色记忆并列，首页去掉容器操作说明、继续关号与提示券余额；Levels 位于经典棋盘右上角，首页设置只有全局选项 | `HomeScreen.tsx`、`GameHeader.tsx`、`MainlineMenu.tsx`；网页导航验收 |
| 布局与输入 | 4–12 瓶、两排、每排至多 6 个，同窗口统一大瓶；手机全宽；平板横竖屏／宽窗侧栏；浏览器鼠标触摸键盘、TV 遥控焦点 | `src/ui/boardLayout.ts`、`deviceLayout.ts`、`boardNavigation.ts`；[跨设备证据](device-support.md) |
| 内部工具 | 公开配置关闭；显式内部构建保留 C 对照、任意主线／副关预览、诊断及六道调色体验；调色独立保存，不记主线进度 | `app.json`、`src/ui/buildConfig.ts`；`npm run start:internal` |

逻辑动作、完成与奖励先提交，再播放表现；动画和音频结束不授予进度。切后台、调整窗口、撤销或重来按既有流程取消表现，显示实际逻辑局面。倒水美术允许横向越界裁切，不为移动中的瓶子缩小棋盘。


经典与记忆首次教学当前源码改为独立的手指完整通关示范，去掉大段说明，支持直接开始与重播，沿用原有教学偏好且不改变玩家进度；实现与设备验收分别见[游玩流程](play-flow.md)、[记忆专题](memory-mode-plan.md)与[设备记录](device-support.md)。该增量已包含 0.1.4（8）Alpha 更新；提交状态由发布记录维护。

## 内容与后续边界

颜色记忆已按用户确认改为持续隐藏的黑色万能块，百题为 `memory-100-v2`／`memory-black-v1`：顶层及其他深度分散遮色、黑色一次一份、外观整理完成自动揭晓，答错仅在当前局面经完整解法验证后开放继续；揭晓后撤销不回黑，免费查看／提示／重来保留。100 个底题不变，重新选择遮色并完成双路线／来源／SQLite 验证。新规则独立恢复自己的 SQLite 尝试，不迁移旧观察试验，不重置主线、钱包或设置。189 项回归、类型／代码检查及网页导出通过；设备交付和真人待验项见[设备记录](device-support.md)，唯一规则正文见[颜色记忆专题](memory-mode-plan.md)。前次 0.1.2（6）Alpha 更新已包含上述规则、语言持久化和查看统计；全量 218 项回归、TypeScript、ESLint 与正式签名包构建通过，所有 200 条记忆路线均只在最后一步自动揭晓。

记忆完成揭色已修正逐份彩色覆盖后再合并及归位交接闪回，采用预备黑色遮罩同步淡出到整瓶真实液体；第 16 关已在 Android T517D 复现、对照并覆盖安装，撤销与冷启动恢复通过，仍有短时长帧。验证与交付边界见[设备记录](device-support.md)。

记忆一步提示当前源码已修复瓶位置换／空瓶交换匹配，并加入保留黑块搭桥的有界求解、完整回放验证及当前题的短期路线缓存；执行时突出源／目标瓶并短暂解释这一步。该增量自 0.1.3（7）起包含于 Alpha 包，本次 0.1.4（8）保留，不改题库、进度、钱包或离线评级；实际验收由[设备记录](device-support.md)维护，规则由[记忆专题](memory-mode-plan.md)维护。

颜色记忆另已实现离线 `memory-bridge-decision-v1` 双轴评级及二十题变化配方，真正搜索黑块异色搭桥；现有百题 97 题完整评级、三题保持未知。评分与校准包只在电脑制作工具中使用，未替换手机题库或玩家进度，真人校准和后续千题仍待进行，详见[记忆专题](memory-mode-plan.md#黑块搭桥评级与校准试排)。

当前 D1／D2／D3／D4 为 **8／315／510／167**，是结构代理分档而非玩家实测。完整目录保存来源与证据，运行使用通过读回验证的 SQLite 关卡库；内容约束和验收统一见[制作配方](production-plan.md)。内部 C 样本、原始演示和旧 80 题只作对照／工具，不是公开主线。

第一版没有商业关卡门槛、推荐、Premium、内购、账号、云同步、在线统计、广告、生命或倒计时。已确认未实施的[商业规则](gameplay-ideas.md#后续商业规则无广告推荐与-premium)、[四区域方向](gameplay-ideas.md#四个游戏区域题库规模与提示资源讨论方向)各按其状态维护；[全 SQLite 新基线](gameplay-statistics-plan.md)已接入源码；第二版已授权记忆百题试排，实际记忆价值与坡度待真人校准。

## 源码验证与发布差异

首页以玩法组织，经典内部提供 Levels；六道调色体验已接入“设置 → 开发工具 → 调色试验”，公开配置仍不显示。调色使用独立配方／配色、两份调色杯、自由目标、整步撤销、SQLite 恢复及花朵／彩虹成果模板。全部 198 项回归通过，后续界面／异步恢复增量通过类型、代码及相关回归；实际网页和设备证据按[设备记录](device-support.md)维护，内部调色仍未向公开包开放。唯一调色规则正文在[创意与当前试验](gameplay-ideas.md#调色实验室与成果呈现当前内部试验规则)。

此前辅助符号增量 `ab80e1f` 增加倒水中持续显示辅助符号、满杯同色视觉装满后淡出、撤销恢复，详见[游玩流程](play-flow.md#视觉与内部工具)。该增量 **155／155 测试、TypeScript、ESLint 通过**，本地网页检查倒水、完成隐藏和撤销恢复；已随 10 月 9 日记忆表现增量构建并覆盖安装 iPhone，安装、启动与数据保留通过，真机交互仍待用户反馈；已包含前次 0.1.2（6）Alpha 更新，尚未确认审核批准。

当前千关已独立完成来源重建、路线回放、规划／人类代理／标签重算与全局去重；目录 SHA-256 为 `04e540f8bb21914a1b7dcfff4d29c085aee3cc1fc042e8b7478e3de29fca1795`，运行投影严格一致，50 副关双状态验证通过。文档整理不代表重新全库评级或设备验收。真机性能、声音、最低系统及跨平台未验项统一见[设备支持](device-support.md)。

SQLite 新基线已接入当前源码：只读关卡库、玩家会话、统计及全部本地偏好均使用 SQLite，不导入旧开发 JSON／AsyncStorage。当前无玩家，新基线首次启动重新开始，其后必须恢复自身数据；此授权不适用于未来测试或发行后的重置。本轮构建和验收记录位于 `builds/sqlite-acceptance/`，实际已完成范围按记录判定；前次 0.1.2（6）Alpha 更新已包含这次改造。
