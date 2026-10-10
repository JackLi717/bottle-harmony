# 当前发布与测试状态

更新日期：2026 年 10 月 10 日（墨尔本）。**Google Play 封闭测试已于今天正式开始，测试人员已招募足够；0.1.5（9）已向选定测试者开放，0.1.6（10）已提交 Alpha 封闭测试审核。** 起算日与招募情况来自用户确认，未提供精确人数；版本状态来自本次实际 Console 观察。本文是发布状态、产物与声明的唯一记录；[基线](current-baseline.md)描述源码，[设备支持](device-support.md)描述实际运行证据。

## 当前闭测更新

10 月 10 日 11:08 左右已发送 0.1.6（Android versionCode 10）更新，Console 显示 **Changes in review**，唯一变更为 Alpha 的 `0.1.6 (10) - first-run tutorials`，Start full rollout。观察时自动快速检查仍在运行，完成后进入审核；不能据此认定已获批或测试者已收到新版。Managed publishing off，沿用既有测试群、178 个国家／地区和 100% Alpha rollout。证据 `builds/release-0.1.6/changes-in-review.png`。

本次保留经典／记忆各自的 SQLite 教学确认，并新增真实 hook＋SQLite 回归。用户遇到的重复教学来自旧私有教学体验包强制重播的初始化，修复后从已保存确认恢复。公开构建保留经典千关、50 副关、黑色记忆百题、21 语种、十五款容器与现行分析设置；内部工具和调色入口关闭，推荐、Premium、付费门槛和内购未实施。

送审前实际观察 0.1.5（9）为 Available to selected testers，Released on 10 Oct 04:03；证据 `builds/release-0.1.6/previous-alpha-available.png`。它仍是本次已确认可用的闭测版本；新更新审核不等于公开生产发行。

## 最终已上传产物

| 位置 | SHA-256 |
| --- | --- |
| builds/play/bottle-harmony-0.1.6-10.aab | 85b8a3ae4c75dc92ca3b06f1e0059a388621cc1c3c7cd037dbf0376fc437b6a7 |
| builds/play/bottle-harmony-0.1.6-10.apk | 404504d12544eb6f727b465e1e824d39da2fb5e2eaddf07605b59fbefd119f82 |
| builds/play/bottle-harmony-0.1.6-10-mapping.txt | df59ee23e2f328968405351bc50168f543755f307ebc11b8a9b195654c6fcbcc |

构建源码基于 main 的 cbb3178，144 个运行源码／配置文件指纹在构建期间一致。后续 aff0ac1 只修正回归测试输入类型，未改变运行包。构建、包检查、指纹、映射、升级读回和 Console 证据均在 `builds/release-0.1.6/`；必要前版证据留在对应忽略目录。

`npm run android:store` 使用原上传证书、APP_VARIANT=store、内部工具关闭、Production 分析环境、双 ABI Release 与 R8；APK 由实际上传 AAB 派生。清单不可调试，最低 API 24、目标 API 36，系统备份关闭，包内 proguard.map 与保存的 mapping 哈希一致。Console 已附加 ReTrace 映射与原生符号。

最终 AAB／派生 APK 的签名、版本、Production 配置、网络权限、广告及敏感权限排除、16 KB LOAD／ZIP 对齐检查通过。Production Android 客户端为 1:947509375072:android:ff971b2ee151ed379b9305。静态分析收集和广告相关默认值为 false，启动按 SQLite 偏好配置。无广告 ID、定位、麦克风、摄像头、联系人、存储或悬浮窗权限；网络能力供在线分析使用。

20 个 ARM64 原生库保留 13 项 RELRO 末端取整警告，填充区无可写分配节，strictRelroChecklistPassed=false；未改预编译 ELF 或弱化 RELRO。构建还保留上游 play-services-auth-21.5.0 的 R8 stack-map 警告，成功构建不表示这些工具链问题已消除。

## 验证覆盖

本批次全量 **241 项自动回归、TypeScript 与 ESLint 通过**，包括经典／记忆教学确认、重新挂载与 SQLite 冷恢复。独立 API 34 模拟器使用原上传签名 0.1.5（9）和本次精确 AAB 派生 0.1.6（10）APK，完成覆盖升级与二次冷启：八张关键表、教学确认、棋盘与撤销、钱包、偏好、安装身份和已有统计均保留，完整性与外键读回通过。测试存档由真实仓库接口离线生成，非真实玩家数据；原有关闭分析偏好保持。

本次原生验收限于启动与存储恢复，未操作真实手机或逐场景画面，不是 16 KB 原生运行或 Production 云端收件验收。0.1.5 Test 的 Google HTTP 204／DebugView、Production 候选的 16 KB 启动及更早教学画面证据仍只属于各自所测产物，不能延伸为本次全部路径已通过。私有 iPhone 修复包已构建验签，但设备断连导致安装未完成；未把旧包视为已更新。具体范围与持续性能、声音和低端设备待验项见[设备支持](device-support.md)。本次没有重新运行远端 Expo Doctor、React Native Directory 或 npm 审计。

## 身份、素材与声明

- 发布主体 Platon Games，包名 com.bottleharmony.app，支持邮箱 admin@readytradie.com，Google Play 标题 Water Sort - No Ads；原广告免费图标和现有商店素材保持。标题宣传关键词的既有 Console 提示未在本次重新核验。
- 目标受众已改为 **13 岁及以上**，Console 保存 13–15、16–17、18+；没有年龄验证。旧 6+ 方向不再作为当前测试招募或声明依据。
- Data safety 已保存大致位置、应用交互、诊断、设备或其他标识四类：采集并向 Google 共享、非临时、必需、仅分析，传输加密、无账号、不声明远程删除。未使用未核实的服务提供商例外，也未独立审计 GA 账号共享设置。具体采集契约由[统计专题](gameplay-statistics-plan.md)维护。
- IARC 已按 Champagne Flute／Faceted Martini 的偶发酒精名称披露，无饮酒玩法。现有结果为美国 Everyone（Alcohol reference）、欧洲 PEGI 3、澳大利亚 General、巴西／德国 All ages、韩国 15+、台湾 Parental guidance 15、沙特 12、其余及俄罗斯 3+。地区分级与目标受众分别遵守。
- [英文隐私政策](https://readytradie.com/bottle-harmony/privacy.html)与应用内政策已同步默认分析、Google 处理、SDK 标识、队列、13+ 和卸载边界。10 月 10 日已部署既有 Cloudflare Pages 项目 platon-games-site，部署地址 https://7075a566.platon-games-site.pages.dev；两政策域名 200 且与源码一致，共享站点原有文件保持完整。证据 builds/release-0.1.5/website-deployment.json。
- 十四张真实平台原图、哈希与场景重拍信息在 builds/release-0.1.1/screenshots/。按用户要求只留本地、未进 Git 或新上传；现行商店沿用此前批准的四张手机截图。准备场景不冒充自然通关。
- 上传密钥和密码只在 Git 忽略的 builds/signing/，须由用户安全备份，不提交或上传为素材。不同签名覆盖失败不得通过卸载玩家应用解决。

## 外部测试与发行边界

Alpha 已绑定独立 Google 测试群，加入入口及进行中的任务见[测试安排](play-testing-plan.md)。用户确认已招募足够测试人员，正式起算日为 **2026 年 10 月 10 日（墨尔本）**。精确人数、每位测试者的连续资格及平台认可的时长仍按本应用 Console 记录核对；本次没有联系测试者或核对实际反馈、Production 分析收件。

闭测已经开始，旧的“没有玩家时可重建开发基线”授权不再适用。后续更新必须保留现有 SQLite 进度、钱包、偏好、身份与统计；保存失败不得清库或覆盖为新进度。

此前按该个人账号情况核查的准备要求为本应用至少 12 名真实测试者连续加入封闭测试 14 天并实际试玩，再申请正式发布权限；数独记录不能替代，达到天数不自动获批。本次没有重新核验政策或 Console 资格，连续资格与正式发布申请条件须按本应用 Console 复核。参考[Google 官方要求](https://support.google.com/googleplay/android-developer/answer/14151465?hl=en)。用户选择完成封闭测试后申请正式发行，不另做 Early Access。

当前发布范围为 Google 手机／平板 Alpha 封闭测试，尚未确认公开生产发行。Apple 商店、TV 商店与游戏网页公网部署均未确认发布；公开隐私页面部署不等于游戏网页部署。13+ 与 Required 申报不证明所有地区免同意或完整合规，Apple privacy 尚未提交。真实设备、持续体验与性能缺口由[设备支持](device-support.md)统一维护。
