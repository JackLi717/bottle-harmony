# 第一版发布与测试状态

更新日期：2026 年 10 月 9 日（墨尔本）。**用户最新确认尚未进入玩家测试、没有玩家。** 当前仓库与本次 Google Play Alpha 上传版本为 **0.1.3（versionCode 7）**，商店标题 Water Sort - No Ads；功能摘要见[实现基线](current-baseline.md)。

本次先提交并推送 main，再从应用源码提交 `f90e961` 构建正式上传签名包。Alpha 新版本名为 `0.1.3 (7) - memory hint improvements`，修复换用另一空瓶或偏离参考解后的记忆提示，保留真正黑块搭桥，并显示源／目标高亮与简短解释。原记忆百题、整瓶揭色、21 语种和 SQLite 保存保留；开发工具与内部调色关闭。英中版本说明均已填写，未变更测试群、国家、商店截图或生产轨道。

已点击 **Send changes for review**；[Publishing overview](https://play.google.com/console/u/0/developers/6045945546746635759/app/4974675580183102720/publishing) 显示 **Changes in review**，对应本次唯一 Alpha 更新。Google 快速检查仍在运行，页面说明成功后送交审核；不据此声称检查全部通过、审核批准、公开发行或玩家测试已开始。提交截图、构建与测试记录在忽略的 `builds/release-0.1.3/`。

本轮创建新版本前，Alpha 页面明确显示上一版 0.1.2（6）为 **Available to selected testers**；这是其实际可用状态观察，不代表玩家已加入或开始测试。上一批提交及产物证据仍在 `builds/release-0.1.2/`。Alpha 沿用已绑定独立 Google 测试群，加入方式由[测试安排](play-testing-plan.md#测试群与加入入口)维护，没有邀请或联系测试者。0.1.1 首次提交和测试群变更的必要证据分别保留在 `builds/release-0.1.1/` 与 `builds/test-group/`。

## 本次产物

| 产物 | 位置 | SHA-256 |
| --- | --- | --- |
| 已上传签名 AAB | `builds/play/bottle-harmony-0.1.3-7.aab` | `5325b5219eaf56981fd12153bedcdac2c947ca2ce0ea2660fc76a8d081bb1851` |
| AAB 生成的签名 APK | `builds/play/bottle-harmony-0.1.3-7.apk` | `83be5bc68703311efc071589afa7e7dc0e118e752fab5e1dd99ca3a69491192c` |
| R8 混淆映射 | `builds/play/bottle-harmony-0.1.3-7-mapping.txt` | `08b84ac8b67fae187a648d641e1c44c8698f5843275888e7639c059b90d93528` |

`npm run android:store` 使用 `APP_VARIANT=store`、`EXPO_PUBLIC_INTERNAL_TOOLS=false`、生产模式及原上传证书，生成双 ABI Release AAB，清单不可调试。R8 已启用，映射与包内 `proguard.map` 字节哈希一致；Google 已识别 ReTrace mapping file 与 native debug symbols。映射只能解释对应构建堆栈。最低 API 24、目标 API 36，包含已批准无广告图标；实际 AAB 派生 APK 的公开设置无开发工具或调色入口，截图 `public-settings.png`。

AAB／APK 签名、版本、权限及静态检查见本轮 `aab-report.json`、`apk-report.json`。无网络、存储、悬浮窗、麦克风、广告 ID、定位、摄像头或联系人权限，Android 系统备份关闭。内容仍为 `mainline-1000-v5`、50 副关、`memory-100-v2`／`memory-black-v1` 百题与十五款免费容器；内容库 SHA-256 `06863e76f853042dfe230dafbf9b4a9a38b154c128550c585969eac4c0bad52e`。没有新增广告、账号、内购、联网采集或云存档；[后续商业规则](gameplay-ideas.md#后续商业规则无广告推荐与-premium)尚未实施。

## 验证

Node 24 的 TypeScript、ESLint 与全部 **224／224** 自动测试通过。构建前记录应用源码指纹，正式包完成后核对完全一致，见 `source.json`、`tests.log`。全 SQLite 新基线不导入旧开发存档；本次覆盖安装只验证自身恢复，不声称旧 JSON 存档迁移。

实际 AAB 派生 APK 在独立 API 36 模拟器以真实 16384 字节页运行，设置并读回 `bionic.linker.16kb.app_compat.enabled=false`、`pm.16kb.app_compat.disabled=true`。公开设置无开发工具，覆盖安装保留简体中文和原记忆会话；重来首题后，连续七次提示逐步核对全部瓶内份额、可见颜色和黑块位置，中文解释与源／目标高亮可见，自动揭晓、继续入口及冷启动相同完成状态恢复通过。未使用内部预览或注入存档。模拟器启动后首次捕获出现 System UI 等待提示，选择等待后完成流程；该系统提示不据此归因于应用。

19 个 ARM64 库 LOAD 对齐、AAB 请求 16 KB ZIP 对齐与 APK ZIP 对齐通过。12 个 RELRO 末端公式警告仍保留，取整填充区无可写分配节，`strictRelroChecklistPassed=false`；未修改预编译 ELF 或弱化 RELRO。关闭兼容回退的实测覆盖上述流程，不能代表全部原生路径或持续性能。

同一提示实现已此前在 T517D 第 24 关完成换空瓶、偏离路线、两步真实异色黑块搭桥、连续 17 次提示完成、撤销与冷启动恢复；这是同源码提示功能的开发证书 Release 证据，见[设备记录](device-support.md)，不替代本次正式签名包的真机验收。本轮未更换连接手机的体验包，没有卸载、清数据或导出私有玩家库；iPhone、TV 和网页未另行交付或发布。

本次未重新运行远端 Expo Doctor、React Native Directory 或 npm 审计，不把既有工具链风险称为已清零。持续游玩、低端性能、声音、最低系统及更广泛设备仍需实测。

## 素材与声明

用户确认 Platon Games、包名 `com.bottleharmony.app`、公开支持邮箱 `admin@readytradie.com`、全部可选国家／地区以及 6 岁以上儿童和成年人。Console 已提交英中商店页、用户选定的 Water Sort - No Ads 标题、无广告、免登录、无广告 ID、不收集／共享数据、非政府／金融／健康应用、目标年龄及 IARC 分级。儿童合规、IARC 条款及创建应用声明均已由用户确认。标题中的宣传关键词此前有 Console 提示；此处保留提交时记录，本轮没有重新核对标题的 Console 结论。

IARC 按实际内容披露 Champagne Flute 与 Faceted Martini 的偶发酒精名称，没有饮酒或鼓励饮酒。结果为美国 Everyone（Alcohol reference）、欧洲 PEGI 3、澳大利亚 General、巴西／德国 All ages、韩国 15+、台湾 Parental guidance 15、沙特 12、其余及俄罗斯 3+。目标受众选择不替代各地区分级限制。

英文隐私政策：https://readytradie.com/bottle-harmony/privacy.html 。应用内政策可离线阅读。网站与数独共用既有 Cloudflare Pages 静态托管，只新增 Bottle Harmony 英文页，两个应用代码和构建独立。本轮应用内与仓库静态政策已补充本地统计及保留期限，尚未重新部署公开政策；本次新商店包已包含应用内更新。此前部署及公开页面证据保存在 `builds/play/website-deployment.json` 与 `privacy-live.jpg`。

提交批次新选十四张真实原图保存在 Git 忽略目录 `builds/release-0.1.1/screenshots/`；入口 `gallery.html`、索引 `screenshots-manifest.json`、场景 `scene-recipes.json`，保留平台、包版本、尺寸、哈希及重拍脚本。前四张为不同平台／容器的 279／42／673／910 关。预先准备的场景用于展示，不冒充自然通关。根据用户“截图本地保存，不上传到 G 的库”要求，当时未将新截图加入 Git 或上传 Play；该次送审沿用此前批准且已上传的四张手机截图和商店素材。

## 当前测试与后续验证

- Alpha 已绑定独立 Google 测试群，0.1.3（7）更新于 10 月 9 日发送审核。用户最新确认尚未进入玩家测试、没有玩家；本次没有代为联系测试者，不设定测试起算日。
- 账号为 2023 年 11 月 13 日之后创建的个人账号。Bottle Harmony 需至少 12 名真实测试者连续加入本应用封闭测试 14 天并实际试玩，之后申请正式发布权限；数独的测试记录不能替代，达到天数不自动获批。这是此前按账号情况核查的准备要求；实际人数、天数与资格以该应用 Console 为准，本轮未重新核验政策。用户已选择完成封闭测试后申请正式发行，不另做 Early Access。参考：[Google 官方要求](https://support.google.com/googleplay/android-developer/answer/14151465?hl=en)。
- 上传密钥和密码仅存于 Git 忽略的 `builds/signing/`，需备份到用户控制的安全位置，不能提交 Git 或作为商店素材上传。
- 真机持续游玩、低端设备性能、声音听感、最低系统、TV 实际观看距离及其他浏览器引擎仍需补验；本轮模拟器检查不替代这些结果。现有手机的开发签名与上传签名不同，本轮未卸载应用或清理设备数据。
- TV 商店发行、Apple 商店及浏览器公网部署需按各平台单独完成。本次送审为 Google 手机／平板的 Alpha 封闭测试包。
