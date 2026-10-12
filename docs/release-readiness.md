# 当前发布与测试状态

更新日期：2026 年 10 月 12 日（墨尔本）。**Google Play 封闭测试已于 10 月 10 日正式开始；0.1.6（10）已向选定测试者开放，0.1.7（11）更新已提交 Alpha 审核。** 起算日与招募情况来自用户确认，版本状态来自本次实际 Console 观察。本文是发布状态、产物与声明的唯一记录；[基线](current-baseline.md)描述源码，[设备支持](device-support.md)描述实际运行证据。

## 当前闭测更新

10 月 12 日 15:51 左右已发送 `0.1.7 (11) - saving and analytics`，Console 显示 **Changes in review**，唯一变更为 Alpha 的 Start full rollout。自动快速检查仍在运行，成功后进入审核；不能据此认定已获批或测试者已收到新版。Managed publishing off，沿用既有测试群、178 个国家／地区和 100% Alpha rollout。证据 `builds/release-0.1.7/changes-in-review.png`、`console-submission.json`。

本次修复 App 分类维度的发送编码、操作事件缺失的辅助组合，以及小数活动时间戳导致玩家保存事务回滚的问题；不清库、不回填历史。商店包也包含 main 此前已验收的共享排序内核／原格式适配、既有 schema 1→2 增量和 Android 静音／振动模式的媒体音效修复。公开经典千关、50 副关、记忆百题和规则保持；机关体验、调色及其他内部入口仍关闭，推荐、Premium 与内购未实施。

送审前实际观察 0.1.6（10）为 Available to selected testers，Released on 10 Oct 11:31；证据 `builds/release-0.1.7/previous-alpha-available.png`。它仍是本次已确认可用的闭测版本；新更新送审不等于公开生产发行。

## 最终已上传产物

| 位置 | SHA-256 |
| --- | --- |
| builds/play/bottle-harmony-0.1.7-11.aab | 3b55847769a8b444908f55ad23714fcff0a4fff8d432220ccded1bbbdcab3329 |
| builds/play/bottle-harmony-0.1.7-11.apk | 17ae556926519272f49119b11001f08a1d99e6835fd9b91b2dbddb531705a103 |
| builds/play/bottle-harmony-0.1.7-11-mapping.txt | df59ee23e2f328968405351bc50168f543755f307ebc11b8a9b195654c6fcbcc |

运行源码提交为 main 的 `199a5f5`。255 个输入指纹和最终核对在 `builds/release-0.1.7/`；构建期间其他任务只向 package.json 增加离线主题命令，排除 scripts 后配置与运行源码一致。题库 SQLite 与 0.1.6 精确相同。APK 从实际上传的 AAB 派生。

`npm run android:store` 使用原上传证书、APP_VARIANT=store、内部工具关闭、Production 分析环境、双 ABI Release 与 R8。最终 AAB／派生 APK 的签名、版本、Production 配置、权限、16 KB LOAD／ZIP 对齐检查通过；AAB 内 proguard.map 与保存映射一致，Console 已附加 ReTrace 映射与原生符号。清单不可调试，最低 API 24、目标 API 36，系统备份关闭。Production Android 客户端为 `1:947509375072:android:ff971b2ee151ed379b9305`；静态分析／广告默认值为 false，启动按 SQLite 偏好配置。

20 个 ARM64 原生库仍有 13 项 RELRO 末端取整警告，填充区无可写分配节，strictRelroChecklistPassed=false；未改预编译 ELF 或弱化 RELRO。构建仍有上游 play-services-auth-21.5.0 的 R8 stack-map 警告；成功构建不表示这些问题已消除。

## 验证覆盖

统计修复通过 **447 项自动回归、TypeScript 与 ESLint**；随后只提升发布版本，未再改运行代码。独立 API 34 模拟器 Test Release 的 Firebase DebugView 实际收到 `level_1`／`level_2`、`first_clear=yes`、`day_0`，无提示／一次提示的完成与操作辅助组合一致。首次有效日落盘、两关首通、2/5 券、五步撤销、偏好、身份与统计冷启动读回通过；范围及精确 Test 包见[设备支持](device-support.md)。Test 收件不代表 Production 全事件验收或旧报表回填。

发布前另用 0.1.6 验收所留的合成 schema 1 存档，由 0.1.7 仓库离线打开并执行原有 schema 1→2 增量：八张关键表内容、棋盘与撤销、经典／记忆教学、钱包、偏好、安装身份和已有统计保留，关闭分析偏好保持，SQLite 完整性与外键通过。证据 `builds/release-0.1.7/upgrade-verification.json`；这是仓库升级检查，非最终 Production APK 的原生原地升级。未操作真实玩家手机或数据库，未卸载、清数据或重置偏好。

本次最终 Production 包完成构建和静态检查，未重新做真机、16 KB 原生运行、长时间性能或 Production 云端全场景验收。已有 0.1.6 精确 AAB 派生包的原生升级／二次冷启证据仍仅属于该产物；Test、桌面和商店审核互不替代。设备与性能缺口由[设备支持](device-support.md)维护。本次未重新运行远端 Expo Doctor、React Native Directory 或 npm 审计。

## 身份、素材与声明

- 发布主体 Platon Games，包名 com.bottleharmony.app，支持邮箱 admin@readytradie.com，Google Play 标题 Water Sort - No Ads；原广告免费图标和现有商店素材保持。标题宣传关键词的既有 Console 提示未在本次重新核验。
- 目标受众已改为 **13 岁及以上**，Console 保存 13–15、16–17、18+；没有年龄验证。旧 6+ 方向不再作为当前测试招募或声明依据。
- Data safety 已保存大致位置、应用交互、诊断、设备或其他标识四类：采集并向 Google 共享、非临时、必需、仅分析，传输加密、无账号、不声明远程删除。未使用未核实的服务提供商例外，也未独立审计 GA 账号共享设置。具体采集契约由[统计专题](gameplay-statistics-plan.md)维护。
- IARC 已按 Champagne Flute／Faceted Martini 的偶发酒精名称披露，无饮酒玩法。现有结果为美国 Everyone（Alcohol reference）、欧洲 PEGI 3、澳大利亚 General、巴西／德国 All ages、韩国 15+、台湾 Parental guidance 15、沙特 12、其余及俄罗斯 3+。地区分级与目标受众分别遵守。
- [英文隐私政策](https://readytradie.com/bottle-harmony/privacy.html)与应用内政策已同步默认分析、Google 处理、SDK 标识、队列、13+ 和卸载边界。10 月 10 日已部署既有 Cloudflare Pages 项目 platon-games-site，部署地址 https://7075a566.platon-games-site.pages.dev；两政策域名 200 且与源码一致，共享站点原有文件保持完整。证据 builds/release-0.1.5/website-deployment.json。
- 十四张真实平台原图、哈希与场景重拍信息在 builds/release-0.1.1/screenshots/。按用户要求只留本地、未进 Git 或新上传；现行商店沿用此前批准的四张手机截图。准备场景不冒充自然通关。
- 上传密钥和密码只在 Git 忽略的 builds/signing/，须由用户安全备份，不提交或上传为素材。不同签名覆盖失败不得通过卸载玩家应用解决。

## 外部测试与发行边界

Alpha 已绑定独立 Google 测试群，加入入口及进行中的任务见[测试安排](play-testing-plan.md)。用户确认已招募足够测试人员，正式起算日为 **2026 年 10 月 10 日（墨尔本）**。精确人数、每位测试者的连续资格及平台认可的时长仍按本应用 Console 记录核对；本次没有联系测试者或核对实际反馈；Production 收件核查范围见[统计专题](gameplay-statistics-plan.md)。

闭测已经开始，旧的“没有玩家时可重建开发基线”授权不再适用。后续更新必须保留现有 SQLite 进度、钱包、偏好、身份与统计；保存失败不得清库或覆盖为新进度。

此前按该个人账号情况核查的准备要求为本应用至少 12 名真实测试者连续加入封闭测试 14 天并实际试玩，再申请正式发布权限；数独记录不能替代，达到天数不自动获批。10 月 12 日仪表盘显示 12 名测试者连续加入两天，申请生产权限仍不可用；该观察不是每位测试者实际试玩或未来资格的证明。参考[Google 官方要求](https://support.google.com/googleplay/android-developer/answer/14151465?hl=en)。用户选择完成封闭测试后申请正式发行，不另做 Early Access。

当前发布范围为 Google 手机／平板 Alpha 封闭测试，尚未确认公开生产发行。Apple 商店、TV 商店与游戏网页公网部署均未确认发布；公开隐私页面部署不等于游戏网页部署。13+ 与 Required 申报不证明所有地区免同意或完整合规，Apple privacy 尚未提交。真实设备、持续体验与性能缺口由[设备支持](device-support.md)统一维护。
