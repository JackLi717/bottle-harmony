# Google Play 测试前检查

检查日期：2026 年 10 月 8 日（墨尔本）。本次核查当前代码、最终签名 Android 包、隔离模拟器、测试记录、Google 官方要求和 Play Console 可见页面。已创建 Water Sort - No Ads 应用草稿，保存英文商店材料与内容声明，上传当前 AAB 并保存 Alpha 封闭测试发布草稿；没有提交 Google 应用审核或发行。

后续产品决定：[首期无广告、推荐与 Premium 规则](gameplay-ideas.md#首期无广告推荐与-premium-规则)已确认，尚未接入当前应用。接入在线推荐结算及内购后，需要重新构建并核查网络配置、隐私政策、数据安全、内购声明与商店文字，不能沿用现有“无联网／内购”结果作为新包结论。

当前题库：项目资源及本次重新构建的签名包均采用 `mainline-1000-v5` 山峰编排，分布及独立复核见[结果评价](level-selection-evaluation.md)。已用该 AAB 生成的 APK 重新完成前三关实际通关、提示、撤销、重开、进程恢复与重玩隔离检查，并重新截取六张商店截图；模拟器检查不代替真机验收。

## Play Console 与账号

用户确认是 2023 年 11 月 13 日后创建的个人开发者账号。实际 Chrome 页面已能打开账号首页和 Platon Sudoku 仪表盘；未观察到访问被封禁的报错，先前打不开的具体原因没有足够证据确定。

账号首页仅列出 Platon Sudoku（com.platongames.sudoku），状态为封闭测试，当前仪表盘显示至少 12 人已连续加入 4 天，发布权限申请按钮仍禁用。这不是 Bottle Harmony 的测试记录，不能替它完成测试条件。

通知中心有 10 月 7 日同名应用删除恢复期已过的提醒，但当前数独应用仪表盘仍可访问，正在累计测试天数。未核实删除通知对应的应用 ID，不能断定正在测试的应用被删除，也不能断定它一定只是旧同名应用。

新应用 Early Access 对应开放测试。此类账号须先完成该应用至少 12 名测试者连续加入 14 天的封闭测试，再申请并获批发布权限，之后才可开放测试。计时满足不保证自动获批；获批权限也不等于正式发行。依据：[个人账号测试要求](https://support.google.com/googleplay/android-developer/answer/14151465?hl=en)、[测试轨道](https://support.google.com/googleplay/android-developer/answer/9845334?hl=en)。

## 已补齐

| 项目 | 当前结果 |
| --- | --- |
| 发布身份 | 用户确认 Platon Games、Bottle Harmony、com.bottleharmony.app、admin@readytradie.com；全可选国家/地区，儿童及成年人 |
| 上传签名 | 已生成独立 RSA 4096 位上传密钥，仅存于 Git 忽略的 builds/signing/；签名脚本不覆盖已有密钥，需安全备份 |
| 发布构建 | 版本 0.1.0、versionCode 1、最低 API 24、目标 API 36；最终签名 AAB 与其生成的 APK 已完成版本、证书、权限和静态检查；Google 接受 AAB 上传，Console 显示 Releases are signed by Google Play，自动保护默认启用 |
| 正式界面 | 公开构建关闭内部预览/难度调试入口；开发时可显式启用，不改变游戏逻辑和存档 |
| Android 权限 | 公开构建删除网络、存储、悬浮窗、麦克风和广告 ID 权限；最终 Manifest 仅有音频设置、振动、唤醒锁及应用私有接收器权限；无开发界面 Activity |
| 系统备份 | 公开 Android 构建关闭 allowBackup；应用与政策均明确本机存档及卸载删除，无云恢复 |
| 原创图标 | 使用本项目玻璃轮廓制作启动图标、Android 适配图标和 512×512 商店图标；商店宣传横图 1024×500，素材见 store/google-play/ |
| 商店文案 | 已准备中英文名称、短说明、完整说明和版本说明；依据实际 1000 主线、50 副关卡、十五款容器及提示券行为 |
| 隐私材料 | 应用内英文政策已接入设置，可离线阅读；网页与应用共用政策源；用户确认 Cloudflare 授权后，英文页已部署到数独现有静态站点，正式域名及 www 均公开访问通过 |
| Console 声明 | 已保存隐私政策、无广告、免登录、无广告 ID、非政府/健康/金融应用、6 岁以上目标受众及不收集/共享数据；儿童合规与 IARC 条款经用户确认；IARC 已完成 |
| 实际截图 | 已从最终签名包截取六张 1080×1920、24 位 PNG 的真实首页、游戏、容器和选关界面；见 store/google-play/screenshots/en-US/ |
| 模拟器试玩 | 当前 v5 包已复测前三关通关、提示与提示券、撤销、重开、进程关闭后恢复、经典瓶与水杯选择及重玩隔离；以 builds/play/runtime-16kb.json 的当前产物绑定记录为准，不将先前包的十五款完整遍历计入新包复测 |
| 测试组织 | 已写封闭测试方案，覆盖参与天数、真实反馈、恢复/提示/重玩/音效/容器和儿童及老年人可用性 |

网页已上线地址：https://readytradie.com/bottle-harmony/privacy.html。该网站既有项目是 `/Users/lixiaohu/work/hard-sudoku-pro/site` 的 Cloudflare Pages `platon-games-site`；两个游戏只共用静态网站托管，应用代码和构建各自独立。数独政策与 app-ads.txt 保持原样。2026 年 10 月 8 日通过 Cloudflare Pages 部署 `a1dd538e`，只新增一份英文政策；数独线上 9 月 30 日政策保持原样，本地 10 月 4 日数独改动未随此次上线。正式网页、www、数独政策、主页、样式及 app-ads.txt 均返回 200 且内容核对通过（网页的 `.html` 路径由 Pages 标准 308 重定向至无后缀路径）。部署证据在 builds/play/website-deployment.json，正式页面截图在 builds/play/privacy-live.jpg。

## 验证证据

Node 24 的 TypeScript 与 ESLint 已通过。当前整套测试 137/137 通过（Node 24、并发 2，日志 builds/play-current-checks.log）。本次签名包 Hermes 资源含 mainline-1000-v5 标识，不含旧 v4 标识；1000 关，D1/D2/D3/D4 实际计数 8/315/510/167。完整目录 SHA-256 与独立复算、来源重建记录一致，为 04e540f8bb21914a1b7dcfff4d29c085aee3cc1fc042e8b7478e3de29fca1795。源映射中 73 个项目 JS/TS 源文件与构建输入一致；JSON 不在源映射内，目录与 Hermes 标识另行核查。本次没有重复计算已经完成的整套离线难度模型。

最终 AAB SHA-256：`cbc29b5b19c9a58d9e8806f172320e514639d35fc818bd13046d65d343c0dfa1`。对应 AAB 生成 APK SHA-256：`f3d2aabf184339cef3eb5c6a9aaa947592c142265dc71e97a8844aec99ae3f7a`。

签名 AAB 已构建成功；构建脚本通过 Expo 配置插件持续表达签名、NDK 28 和权限设置，不依赖手改生成的 native 目录。最终包 Manifest、证书、版本和 SHA-256 记录在 builds/play/。模拟器实测记录为 builds/play/runtime-16kb.json，最终 crash.log 与 app-errors.log 均为空。首次模拟器开机曾出现 System UI 等待对话框，恢复后完成测试；不归因于应用崩溃，也不把此环境作为真机性能证据。旧 builds/bottle-harmony-demo.apk 是 10 月 7 日、0.0.1 的 debug 签名包，不能用于上传。

官方 npm 审计在兼容的 uuid 修复后为 18 项 high、0 项 moderate、0 项 critical；根源是上游 braces 和 node-forge，当前兼容工具链尚无可用修复。Hermes 打包源列表未包含这些模块，以及 xcode、npm uuid、expo-dev-launcher 和 expo-dev-menu 的 JS。工具链问题仍保留记录，不把运行包不包含解释为 npm 审计全部通过，也不采用把 Expo 强制降级的 audit fix --force。

用户选择仅做本地 Expo 检查。本地版本映射匹配；Doctor 的可执行本地检查通过，远端 schema 未验证，React Native Directory 已禁用。不能把网络检查无法运行当作版本兼容已通过。

16 KB 检查：已升级源构建 NDK 28 和链接参数。最终 AAB 请求 16 KB ZIP 对齐，APK zipalign 检查通过，18 个 ARM64 库 LOAD 对齐通过。仍有 11 个 RELRO 末端公式警告，末端向 16 KB 取整的填充区均无可写分配节；报告保留 strictRelroChecklistPassed=false，未修改预编译 ELF 或移除 RELRO 保护。最终 AAB 生成的 APK 已在 API 36、实际 16384 字节页的独立系统中离线启动和游玩，bionic.linker.16kb.app_compat.enabled=false、pm.16kb.app_compat.disabled=true，未使用兼容回退。[Android 官方检查](https://developer.android.com/guide/practices/page-sizes)与[Android linker 实现](https://android.googlesource.com/platform/bionic/+/refs/heads/main/linker/linker_phdr.cpp)与实际运行证据一起保留；模拟器覆盖启动及核心游玩，不覆盖所有原生路径，Google Play 最终上传校验及真实设备兼容性仍待完成。

## 发起测试前仍待完成

| 项目 | 剩余动作 |
| --- | --- |
| 真实设备 | 最终包仍需小屏/低端手机、声音、持续游玩及本机存档恢复验收；模拟器不代替手机性能与体验结论 |
| 用户审阅 | 审阅 store/google-play/README.md 中的图标、横图、政策、商店文字及六张真实截图，然后确定提交封闭测试；正式发行仍由用户决定 |
| 密钥备份 | 将 builds/signing/ 中的上传密钥与密码备份到用户控制的安全位置，不能提交 Git 或上传到商店资料 |
| Console 操作 | 本应用已创建，11 项基础设置已完成，Alpha 测试地区为全部 178 个可选地区，当前 AAB 与中英文版本说明已保存；中文商店文案、AI 宣传素材声明、测试者名单与 PC 分发范围选择仍在完成，以 builds/play/console-progress.json 为准；应用审核与测试发行等待用户审阅决定 |
| 测试者 | 为 Bottle Harmony 邀请至少 12 名真实测试者，连续加入 14 天并实际试玩，保留问题和修复记录；数独测试不替代本应用 |

包名首次上传后固定；目标 API 36 按当前 Google 新应用要求准备。[创建应用与签名](https://support.google.com/googleplay/android-developer/answer/9859152?hl=en)、[目标 API](https://support.google.com/googleplay/android-developer/answer/11926878?hl=en)。截图与图标规范见[商店素材](https://support.google.com/googleplay/android-developer/answer/9866151?hl=en)。封闭测试也需 Data safety 和公开政策，见[数据安全](https://support.google.com/googleplay/android-developer/answer/10787469?hl=en)与[用户数据政策](https://support.google.com/googleplay/android-developer/answer/10144311?hl=en)。儿童目标年龄需按实际产品设计填写，内容评级低不等于适合每个年龄段。[目标年龄](https://support.google.com/googleplay/android-developer/answer/9867159?hl=en)。

现有手机的 debug 签名与上传/Play 签名不同，不能直接覆盖；不要为了复测卸载旧安装、丢失进度。本任务的隔离模拟器用于检查新签名产物。当前未发起 Google 应用审核或测试发行。

IARC 按实际内容披露了 Champagne Flute 与 Faceted Martini 的偶发酒精名称提及，没有饮酒或鼓励饮酒。实际结果：美国 Everyone（Alcohol reference）、欧洲 PEGI 3、澳大利亚 General、巴西 All ages、德国 All ages、韩国 15+、台湾 Parental guidance 15、沙特 12，其余及俄罗斯 3+。目标受众 6 岁以上并不改变当地分级限制。

用户选定标题 Water Sort - No Ads；Console 对标题及英语短说明中的宣传关键词给出提示，英语短说明可能不符合商店推荐要求。保留用户选择用于审阅，不能把成功保存视为 Google 已接受审核。

封闭发布预览没有显示阻止错误，显示两项警告：未配置测试者、未上传反混淆文件。当前 Gradle 的 android.enableMinifyInReleaseBuilds 未设置，默认 false，没有启用 R8/ProGuard 混淆，因此没有对应 mapping 文件；没有为了消除建议警告改动构建行为。发布汇总显示 15 项尚未提交的变更，包含 Alpha 版本、地区、反馈邮箱、英文商店页及声明；快速检查仍在运行，尚未将其视为通过。

Console 自动启用了 Google Play Games on PC 及 Android XR；本次只有移动版模拟器验收。关闭 PC 的尝试因缺少具体分发变更授权被自动审批拦截，已取消操作并询问用户，当前保持默认。AI 宣传素材标签提交同样被自动审批要求明确授权；两项标签及中文文案等待用户确认后保存，不把未保存操作计为完成。
