# 第一版发布与测试状态

更新日期：2026 年 10 月 8 日（墨尔本）。**用户最新确认第一版已完成，正在申请上线，尚未进入玩家测试、没有玩家。** 当前仓库与最近上传的 Google Play 手机／平板版本为 0.1.1（versionCode 5），商店标题 Water Sort - No Ads，轨道为 Alpha 封闭测试；第一版功能清单见[实现基线](current-baseline.md)。

最后一次留存的 Console 观察是本版本已提交首次审核、Publishing overview 显示 **Changes in review** 与 **Your changes are now in review**，版本为 `0.1.1 (5) - multi-platform closed test`。该观察与用户最新确认分开记录；本轮未重新查询 Console，不推断审核已通过、测试已开放或生产权限已获批。此前“已上线测试、已有玩家”的说明以用户此次澄清为准。

Console 页面：[Publishing overview](https://play.google.com/console/u/0/developers/6045945546746635759/app/4974675580183102720/publishing)。提交时的本地记录与截图在 `builds/release-0.1.1/console-progress.json`、`play-first-review.jpg`、`play-first-review-full.jpg`，它们是当时证据，未改写成上线截图。

## 本次产物

| 产物 | 位置 | SHA-256 |
| --- | --- | --- |
| 已上传签名 AAB | `builds/play/bottle-harmony-0.1.1-5.aab` | `58472cf3ab3f851acfc28a302dd26b56bbf64b5ad89f709d0d7e611889b6490d` |
| AAB 生成的签名 APK | `builds/play/bottle-harmony-0.1.1-5.apk` | `5f32e8c220924d85f680607c549a32efb200a72fb08448e4669ef83a1ca09747` |
| R8 混淆映射 | `builds/play/bottle-harmony-0.1.1-5-mapping.txt` | `2bdcf214d6ffd59513b17ef2b161751b9f3b9954d2c8be4e1e1c70843bb1b34c` |

正式构建通过配置插件启用 R8，沿用原生依赖的保留规则；没有额外启用资源压缩。构建脚本保存带版本号的映射文件，检查脚本验证它与 AAB 内 `BUNDLE-METADATA/com.android.tools.build.obfuscation/proguard.map` 完全一致。Google 自动识别了 ReTrace mapping file 和 native debug symbols，原反混淆文件警告已消失。后续版本必须保留各自对应的映射，不能拿本文件解释其他包的堆栈。

最低 Android API 24，目标 API 36。正式界面关闭内部工具；包中包含用户批准的倒水与禁止广告标识图标。上传证书指纹、版本、权限和静态检查见 `builds/release-0.1.1/mobile5-aab-report.json` 与 `mobile5-apk-report.json`。包无网络、存储、悬浮窗、麦克风、广告 ID、定位、摄像头或联系人权限；Android 系统备份关闭。没有广告、账号、内购、联网采集或云存档。

当前内容为已验证的 `mainline-1000-v5` 主线、50 副关卡和十五款自由选择容器。本轮只修改文档，不改变实际关卡、规则、解锁或存档格式。用户已确认下一次实现采用全 SQLite 新基线，关卡库、玩家状态、统计与偏好一并重建，不兼容旧开发存档；见[存储方案](gameplay-statistics-plan.md)。后续产品决定见[无广告、推荐与 Premium 规则](gameplay-ideas.md#后续商业规则无广告推荐与-premium)，尚未接入当前应用；接入联网或内购后须重新核查包、声明与政策。

## 验证

本节为 0.1.1（5）构建提交时的验证记录；本轮文档核对未重做构建或设备操作，最新源码回归见[基线](current-baseline.md)。提交批次 Node 24 的 TypeScript、ESLint 通过，当时游戏自动测试 150／150 通过，日志位于 `builds/release-0.1.1/logs/`。新增 R8 后重新核查了最终 AAB／APK、签名及一致的映射；游戏测试不替代混淆后的原生运行检查。

版本 5 在七英寸 Android API 34 平板完成横竖屏展示、倒水和撤销，并核对实际四层／空瓶到三层／一层再恢复。最终 AAB 生成的版本 5 APK 在 API 36、真实 16384 字节页的独立模拟器中启动；本次运行明确设置并读取 `bionic.linker.16kb.app_compat.enabled=false`、`pm.16kb.app_compat.disabled=true`，第 42 关倒水和撤销实际层数均已验证。运行记录绑定最终产物哈希，见 `builds/release-0.1.1/runtime-r8-16kb.json` 和相应 UI XML。截图场景结束后已恢复原存档并核对哈希。

18 个 ARM64 库 LOAD 对齐通过，AAB 请求 16 KB ZIP 对齐，生成 APK 的 ZIP 对齐检查通过。报告仍保留 11 个 RELRO 末端公式警告，向 16 KB 取整的填充区均无可写分配节，`strictRelroChecklistPassed=false`；没有修改预编译 ELF 或弱化 RELRO。关闭兼容回退的实测覆盖启动与核心倒水／撤销，不覆盖所有原生路径或真实设备性能。

同轮完成 Android 十英寸平板、iPad、Android TV、Apple TV 与 Chrome 正式配置的原生或浏览器展示检查，范围见[设备支持](device-support.md)。十英寸 Android 平板发现并修复了清单竖屏锁定造成的信箱化误判，版本 5 包含该修复。iOS／tvOS 是 Release 模拟器包，未提交 Apple 商店；Android TV 0.1.1（3）独立签名包仍在本地，未开启或提交 Google TV 商店轨道。Google Play Games on PC 在 Console 默认已选入，但 Chrome 结果不作为 Windows Google Play Games 客户端验收。

本次没有重新运行远端 Expo Doctor 或 React Native Directory 检查，遵守用户“仅做本地检查”的选择。此前官方 npm 审计为 18 项 high、0 项 moderate／critical，涉及上游工具链 braces／node-forge；这些模块未出现在已核查的 Hermes 源列表，仍不能称 npm 审计全部通过。没有使用强制降级工具链的 audit fix --force。

## 素材与声明

用户确认 Platon Games、包名 `com.bottleharmony.app`、公开支持邮箱 `admin@readytradie.com`、全部可选国家／地区以及 6 岁以上儿童和成年人。Console 已提交英中商店页、用户选定的 Water Sort - No Ads 标题、无广告、免登录、无广告 ID、不收集／共享数据、非政府／金融／健康应用、目标年龄及 IARC 分级。儿童合规、IARC 条款及创建应用声明均已由用户确认。标题中的宣传关键词此前有 Console 提示；此处保留提交时记录，本轮没有重新核对标题的 Console 结论。

IARC 按实际内容披露 Champagne Flute 与 Faceted Martini 的偶发酒精名称，没有饮酒或鼓励饮酒。结果为美国 Everyone（Alcohol reference）、欧洲 PEGI 3、澳大利亚 General、巴西／德国 All ages、韩国 15+、台湾 Parental guidance 15、沙特 12、其余及俄罗斯 3+。目标受众选择不替代各地区分级限制。

英文隐私政策：https://readytradie.com/bottle-harmony/privacy.html 。应用内政策可离线阅读。网站与数独共用既有 Cloudflare Pages 静态托管，只新增 Bottle Harmony 英文页，两个应用代码和构建独立。部署及公开页面证据保存在 `builds/play/website-deployment.json` 与 `privacy-live.jpg`。

提交批次新选十四张真实原图保存在 Git 忽略目录 `builds/release-0.1.1/screenshots/`；入口 `gallery.html`、索引 `screenshots-manifest.json`、场景 `scene-recipes.json`，保留平台、包版本、尺寸、哈希及重拍脚本。前四张为不同平台／容器的 279／42／673／910 关。预先准备的场景用于展示，不冒充自然通关。根据用户“截图本地保存，不上传到 G 的库”要求，当时未将新截图加入 Git 或上传 Play；该次送审沿用此前批准且已上传的四张手机截图和商店素材。

## 当前测试与后续验证

- 送审时的 Console 记录显示尚未配置名单；用户最新确认尚未进入测试、没有玩家。本轮未重新核对 Console 名单或开放状态，不设定测试起算日，也没有代为联系测试者。
- 账号为 2023 年 11 月 13 日之后创建的个人账号。Bottle Harmony 需至少 12 名真实测试者连续加入本应用封闭测试 14 天并实际试玩，之后申请正式发布权限；数独的测试记录不能替代，达到天数不自动获批。这是此前按账号情况核查的准备要求；实际人数、天数与资格以该应用 Console 为准，本轮未重新核验政策。用户已选择完成封闭测试后申请正式发行，不另做 Early Access。参考：[Google 官方要求](https://support.google.com/googleplay/android-developer/answer/14151465?hl=en)。
- 上传密钥和密码仅存于 Git 忽略的 `builds/signing/`，需备份到用户控制的安全位置，不能提交 Git 或作为商店素材上传。
- 真机持续游玩、低端设备性能、声音听感、最低系统、TV 实际观看距离及其他浏览器引擎仍需补验；本轮模拟器检查不替代这些结果。现有手机的 debug 签名不同；SQLite 新基线按用户授权不继承旧开发数据，本轮文档更新不卸载应用或清理设备数据。
- TV 商店发行、Apple 商店及浏览器公网部署需按各平台单独完成。本次送审为 Google 手机／平板的 Alpha 封闭测试包。
