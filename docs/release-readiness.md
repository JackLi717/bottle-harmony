# 当前发布与测试状态

更新日期：2026 年 10 月 10 日（墨尔本）。**Google Play 封闭测试已于今天正式开始，测试人员已招募足够，最新 0.1.5（Android versionCode 9）已发布到 Alpha 封闭测试轨道。** 当前状态依据用户本次明确确认；未提供精确人数，本次没有重新查询 Console。本文是发布状态、产物与声明的唯一记录；[基线](current-baseline.md)描述源码，[设备支持](device-support.md)描述实际运行证据。

## 当前闭测发布

10 月 10 日 03:39 已点击 Send changes for review，Console 显示 Changes in review、3 changes sent for review：Alpha 更新、目标 13+、Data safety。版本名为 0.1.5 (9) - gameplay analytics，英中说明已保存，Alpha 100% rollout，既有测试群与 178 个国家／地区保持不变。这是发布前的送审观察，截图 builds/release-0.1.5/changes-in-review.png 仅保留为历史证据；当前已按用户确认更新为闭测发布，不能继续把 Changes in review 作为当前状态。

该版包含手机／平板默认开启的 Firebase／GA4 使用分析，保留经典千关、50 副关、黑色记忆百题、独立手指教学、21 语种和十五款容器。公开内部工具与调色入口关闭；推荐、Premium、付费门槛和内购未实施。

上一版 0.1.4（8）在创建本次版本前已观察为 Available to selected testers，Released on 9 Oct 22:00，证据 previous-alpha-available.png；该记录仅证明前版可用；本轮测试正式开始以用户 10 月 10 日确认为准。0.1.3（7）的可用证据保留在 builds/release-0.1.4/，不再重复维护逐版送审过程。

## 最终已上传产物

| 位置 | SHA-256 |
| --- | --- |
| builds/play/bottle-harmony-0.1.5-9.aab | 2cef29a0839628889508f0cbab6499d998325234fe824e2f1b4c8b82d18a71ec |
| builds/play/bottle-harmony-0.1.5-9.apk | 55e20719f6ae63f6fd40aea97abb479f826ee631d1c80031d976978c2b6c9d6e |
| builds/play/bottle-harmony-0.1.5-9-mapping.txt | df59ee23e2f328968405351bc50168f543755f307ebc11b8a9b195654c6fcbcc |

基于 main 的 85da849 加构建时工作区增量生成，150 个源码／配置文件指纹在构建期间一致，不用旧提交 SHA 代表全部源码。构建、包检查、指纹、映射和 Console 证据在 builds/release-0.1.5/。历史批次必要证据仍在各 builds/release-0.1.x/；本次不改产物、不重新构建或上传。

npm run android:store 使用原上传证书、APP_VARIANT=store、内部工具关闭、Production 分析环境、双 ABI Release 与 R8。清单不可调试，最低 API 24、目标 API 36，系统备份关闭，包内 proguard.map 与保存的 mapping 哈希一致。映射只能解释对应产物的堆栈。

最终 AAB／派生 APK 签名、版本、Production 配置、网络权限、广告及敏感权限排除、16 KB LOAD／ZIP 对齐检查通过。包内 Production Android 客户端为 1:947509375072:android:ff971b2ee151ed379b9305。静态分析收集和广告相关默认值为 false，启动按 SQLite 偏好配置。无广告 ID、定位、麦克风、摄像头、联系人、存储或悬浮窗权限；网络能力供在线分析使用。旧离线包的“无网络／无采集”声明不适用于该版。

20 个 ARM64 原生库保留 13 项 RELRO 末端取整警告，填充区无可写分配节，strictRelroChecklistPassed=false；未改预编译 ELF 或弱化 RELRO。构建还保留上游 play-services-auth-21.5.0 的 R8 stack-map 警告。成功构建不表示这些工具链问题已消除。

## 验证覆盖

该发布批次全量 240 项自动回归、TypeScript 与 ESLint 通过。Test Android Release 在独立 API 36／16 KB 模拟器的启动事件已获 Google HTTP 204，GA4 DebugView 实际显示收件；SQLite 读回通过。Test 收件不能当作 Production 玩家数据。

同版、同上传证书的 Production 候选在关闭 16 KB 兼容回退且阻断应用网络的独立模拟器完成启动与 SQLite 读回，SDK 本地接受事件。其 APK 哈希为 cb1c48db41b6492d940bb13b8f24021f9f1a64de5cc0c2e497906c85e93b25c8；最终包另补隐私文字与 13+ 范围，不能把候选运行冒充最终哈希包的逐场景验收。精确运行范围见[设备支持](device-support.md)。

此前实际 0.1.4（8）AAB 派生包的经典教学、原局面保护、确认偏好与冷启恢复，以及同源码记忆完整教学证据仍有效于各自所测产物；不自动延伸到 0.1.5 所有原生路径。本地工程验收尚无 0.1.5 最终包另装真实手机的记录；商店闭测发布不替代持续性能、完整事件、声音与低端设备验收。本次没有重新运行远端 Expo Doctor、React Native Directory 或 npm 审计。

## 身份、素材与声明

- 发布主体 Platon Games，包名 com.bottleharmony.app，支持邮箱 admin@readytradie.com，Google Play 标题 Water Sort - No Ads；原广告免费图标和现有商店素材保持。标题宣传关键词的既有 Console 提示未在本次重新核验。
- 目标受众已改为 **13 岁及以上**，Console 保存 13–15、16–17、18+；没有年龄验证。旧 6+ 方向不再作为当前测试招募或声明依据。
- Data safety 已保存大致位置、应用交互、诊断、设备或其他标识四类：采集并向 Google 共享、非临时、必需、仅分析，传输加密、无账号、不声明远程删除。未使用未核实的服务提供商例外，也未独立审计 GA 账号共享设置。具体采集契约由[统计专题](gameplay-statistics-plan.md)维护。
- IARC 已按 Champagne Flute／Faceted Martini 的偶发酒精名称披露，无饮酒玩法。现有结果为美国 Everyone（Alcohol reference）、欧洲 PEGI 3、澳大利亚 General、巴西／德国 All ages、韩国 15+、台湾 Parental guidance 15、沙特 12、其余及俄罗斯 3+。地区分级与目标受众分别遵守。
- [英文隐私政策](https://readytradie.com/bottle-harmony/privacy.html)与应用内政策已同步默认分析、Google 处理、SDK 标识、队列、13+ 和卸载边界。10 月 10 日已部署既有 Cloudflare Pages 项目 platon-games-site，部署地址 https://7075a566.platon-games-site.pages.dev；两政策域名 200 且与源码一致，共享站点原有文件保持完整。证据 website-deployment.json。
- 十四张真实平台原图、哈希与场景重拍信息在 builds/release-0.1.1/screenshots/。按用户要求只留本地、未进 Git 或新上传；现行商店沿用此前批准的四张手机截图。准备场景不冒充自然通关。
- 上传密钥和密码只在 Git 忽略的 builds/signing/，须由用户安全备份，不提交或上传为素材。不同签名覆盖失败不得通过卸载玩家应用解决。

## 外部测试与发行边界

Alpha 已绑定独立 Google 测试群，加入入口及进行中的任务见[测试安排](play-testing-plan.md)。用户确认已招募足够测试人员，正式起算日为 **2026 年 10 月 10 日（墨尔本）**。精确人数、每位测试者的连续资格及平台认可的时长仍按本应用 Console 记录核对；本次没有联系测试者或核对实际反馈、Production 分析收件。

闭测已经开始，旧的“没有玩家时可重建开发基线”授权不再适用。后续更新必须保留现有 SQLite 进度、钱包、偏好、身份与统计；保存失败不得清库或覆盖为新进度。

此前按该个人账号情况核查的准备要求为本应用至少 12 名真实测试者连续加入封闭测试 14 天并实际试玩，再申请正式发布权限；数独记录不能替代，达到天数不自动获批。本次没有重新核验政策或 Console 资格，连续资格与正式发布申请条件须按本应用 Console 复核。参考[Google 官方要求](https://support.google.com/googleplay/android-developer/answer/14151465?hl=en)。用户选择完成封闭测试后申请正式发行，不另做 Early Access。

当前发布范围为 Google 手机／平板 Alpha 封闭测试，尚未确认公开生产发行。Apple 商店、TV 商店与游戏网页公网部署均未确认发布；公开隐私页面部署不等于游戏网页部署。13+ 与 Required 申报不证明所有地区免同意或完整合规，Apple privacy 尚未提交。真实设备、持续体验与性能缺口由[设备支持](device-support.md)统一维护。
