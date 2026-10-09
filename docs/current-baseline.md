# 当前实现基线

更新日期：2026 年 10 月 10 日。本文只汇总当前源码及资产，具体规则各有唯一责任文档。应用版本来自 package.json／app.json：**0.1.5，Android 手机／平板 versionCode 9**。应用品牌 Bottle Harmony，Google Play 标题 Water Sort - No Ads，包名 com.bottleharmony.app，开发者 Platon Games。

**Google Play 封闭测试已于 2026 年 10 月 10 日（墨尔本）正式开始。** 用户确认测试人员已招募足够，最新 0.1.5（9）已发布到封闭测试轨道。当前状态依据本次用户确认，具体产物与历史 Console 证据由[发布记录](release-readiness.md)维护；本次未重新查询 Console。

## 已实现：公开构建

| 范围 | 当前行为 | 责任文档／主要源码 |
| --- | --- | --- |
| 经典主线 | 固定 1000 题，按序解锁、不跳关；已完成题独立重玩；前三题教学 | [游玩流程](play-flow.md)、src/game/mainline.ts |
| 凝固副关 | 每二十道主线后一道，共 50 道；免费融化，撤销不 refreeze、重来 refreeze；末题后不生成 1001 | [游玩流程](play-flow.md)、solidSide.ts、solidRules.ts |
| 倒水与帮助 | 四份容量、最大连续同色倒水；免费撤销／重来；新主线／副关每题首次成功一步提示免费，后续每次一券；首次主线完成普通 +1、十关 +2，上限五券；重玩提示免费、不发券 | [游玩流程](play-flow.md)、rules.ts、session.ts |
| 可选备用瓶 | 仅 4／65／68／193／364／463／485 关，免费启用本题原有第二空瓶，撤销／重来不收回 | [制作配方](production-plan.md)、optionalReserve.ts |
| 颜色记忆 | 固定百题、持续黑色万能块、免费查看／提示／撤销／重来；外观整理完成自动揭晓；答错后仅完整验证可解才开放显色继续；独立进度与统计 | [记忆玩法](memory-mode-plan.md)、memory.ts、memorySolver.ts |
| 本地保存与统计 | 只读内容 SQLite＋可写玩家 SQLite；恢复当前尝试、有界撤销、偏好和钱包；有界明细、长期摘要与只读报告 | [统计与存储](gameplay-statistics-plan.md)、src/storage/ |
| 在线使用分析 | 手机／平板原生 Firebase／GA4，首次默认开启、无公开开关或询问弹窗；Production／Test 独立；Web／TV 不上传 | [统计与存储](gameplay-statistics-plan.md)、src/analytics/ |
| 首页与教学 | 经典排序／颜色记忆两个入口；Levels 在经典棋盘；首次教学为独立完整手指示范，可开始／重播，不记玩家进度 | [游玩流程](play-flow.md)、HomeScreen.tsx、Tutorial.tsx |
| 设置与外观 | 音效、辅助符号、语言、隐私；21 语种默认跟随系统／英语回退，手选存 SQLite；十五款玻璃免费选择并记住；无完成效果选择 | [游玩流程](play-flow.md)、MainlineMenu.tsx、src/i18n/、vesselDesigns.ts |
| 画面与声音 | 1900 ms 倒水、腔体裁切涟漪、局部轮廓、完成柔光／瓶塞或光晕；D1–D4 为 2–5 朵礼花；六录音家族十八段水声与礼花共用开关 | [画面与声音](pour-presentation-design.md)、src/art/ |
| 卡住恢复 | 倒水回位后底部轻量反馈，免费恢复与关闭；无弹窗链、无每步全搜索；提示预算不足为未知 | [游玩流程](play-flow.md)、stalledNoticePolicy.ts |
| 布局与输入 | 4–12 瓶、两排、每排最多六个，同窗口统一大瓶；手机全宽、允许移动美术横向越界裁切；平板、浏览器键鼠触控与 TV 遥控适配 | [设备支持](device-support.md)、boardLayout.ts、boardNavigation.ts |

游戏逻辑、完成与奖励先提交，动画／音频只表现结果。后台、撤销、重来和窗口变化按现行流程取消表现，恢复真实状态。SQLite 新基线不导入旧开发 JSON／AsyncStorage，闭测开始后，后续启动与更新必须保留现有玩家进度、钱包、偏好、身份与统计，不能再次清零。

## 已实现：内部与离线能力

公开配置默认关闭内部工具，只有显式内部构建开放。内部主线／副关任意预览、开发浏览、C 对照样本和完整诊断不解锁、不发券、不覆盖待解主线；预览不持久化。

[调色内部试验](mixing-mode.md)已实现 mixing-six-v1／mixing-pairs-v1：六题、两份调色杯、自由目标、自动收集、花朵／彩虹成果和独立 SQLite 恢复。公开构建无入口；尚未形成公开题库或确定公开编排。

经典制作工具已实现来源重建、完整回放、精确结构去重、旧规划证据、human-decision-v1 代理和 classic-features-v1 标签。记忆离线 memory-bridge-decision-v1 双轴评级与二十题校准选取也已实现，但校准包没有接入手机或替换百题顺序；真人校准仍待进行。

## 当前内容资产

| 资产 | 当前状态与所有权 |
| --- | --- |
| 主线 | mainline-1000-v5／thousand-mountain-v1，D1／D2／D3／D4 为 8／315／510／167；见[制作配方](production-plan.md) |
| 副关 | solid-side-50，凝固／融化双状态路线；见[生成与验证](generation.md) |
| 记忆 | memory-100-v2／memory-black-v1，100 固定底题、777 隐藏份；见[记忆玩法](memory-mode-plan.md) |
| 运行内容库 | assets/levels/content.sqlite，1150 道；SHA-256 06863e76f853042dfe230dafbf9b4a9a38b154c128550c585969eac4c0bad52e，与 contentManifest.ts 一致 |

JSON 是离线输入和回归证据，手机按需读取 SQLite，不现场出题或完整评级。内部调色六题定义在 mixingCatalog.ts，不包含在上述 1150 道内容库计数中。当前难度等级是制作代理，不能称为玩家实测。

## 规划与设想的边界

[机关解谜规划](color-unlock-plan.md)已纳入底部钥匙分组展开、颜色盖布解锁，当前仅规划，精确规则尚待冻结，未实现或生产正式题库。[商业规则与创意](gameplay-ideas.md)区分已确认未实施的推荐／Premium／记忆扩展／有序配方，以及四区域、18／24 瓶、扩色和其他候选；这些均不属于当前交付。

当前无商业关卡门槛、推荐结算、内购、账号、云存档、广告、生命或倒计时。源码具备某项能力不等于所有平台已安装或验收；设备与性能证据只见[设备支持](device-support.md)，商店、隐私声明与产物只见[发布记录](release-readiness.md)。持续真机性能、低端设备、水声听感、母语校对和外部玩家校准仍需完成。
