# 设备支持与验收

更新日期：2026 年 10 月 10 日。本文只记录当前适配、仍有参考价值的设备／功能证据和未解决限制，不按修复次数追加流水。源码总览见[基线](current-baseline.md)，精确提交产物和 Console 状态见[发布记录](release-readiness.md)。以下证据来自已有本地记录，本次文档核对没有重新安装或操作设备。

## 当前布局、输入与构建

4–12 瓶两排、每排最多六瓶，同窗口统一大瓶、十五款等比容器、手机全宽，移动瓶允许横向越界裁切。手机竖屏；iPad 支持旋转／窗口变化，Android 最小宽度达到 600 dp 时解除竖屏限制。宽度至少 600 且大于高度 1.15 倍使用侧栏；TV 固定侧栏、至少 5% 安全区、字号 1.4 倍。

浏览器支持鼠标、触控、Tab、方向键、Enter／空格；Escape 先取消源瓶再回首页，弹层打开时停用棋盘键盘。TV 有原生方向焦点、金色框与首选焦点；Apple TV Menu 在棋盘／弹层返回，首页遵循系统离开。动画期间 busy gate 拒绝重复动作；窗口／后台变化取消表现并保留已提交逻辑。

浏览器最低布局宽 320，竖向至少按高 520、侧栏按高 400 布局，矮窗可滚动。产品没有 18／24 瓶布局；该候选与[机关解谜规划](color-unlock-plan.md)分开。

最低构建声明 iOS／tvOS 16.4、Android API 24，target API 36，最低系统性能尚未验收。依赖采用 Expo SDK 57 兼容核心和 react-native-tvos@0.86.3-0；.npmrc 的 legacy-peer-deps=true 处理 TV 分支后缀的 peer semver。TV 插件仅在 TV 构建启用。

~~~sh
npm ci
npm run web:export
npm run web:serve
npm run ios
npm run android
npm run prebuild:tv
npm run ios:tv
npm run android:tv
~~~

网页 dist/ 必须通过带 COOP／COEP 隔离响应头和 WASM 资源的 HTTP(S) 服务提供；web:serve 用于本地验收。游戏网页未部署公网；政策页面已部署不代表游戏部署。网页存档属于当前浏览器／来源，不能跨域或跨设备恢复。

TV 命令在忽略的 builds/tv/ 复制构建快照并生成原生工程，不创建 Git worktree、不清根目录手机工程。手机与 TV Android 共享依赖的 Gradle 输出，需依次构建。TV、Web 在线分析关闭；原生 Analytics 开发默认 Test，商店 Production，详情见[统计专题](gameplay-statistics-plan.md)。Apple TV SQLite 位于系统缓存，重启恢复不保证系统清理缓存后仍可恢复。

## 当前真机交付

| 设备 | 最近已确认交付／操作 | 尚未确认 |
| --- | --- | --- |
| iPhone 12 Pro Max／iOS 17.4.1 | 0.1.4（1）开发签名 Release 教学体验包，验签、覆盖安装、解锁启动与进程核对通过；内部工具关闭，不依赖 Metro | 旧体验包含绕过 SQLite 确认的强制重播缺陷；修复包已构建验签，但本次覆盖安装因设备连接后立即断开失败，手机仍为旧包；未读回该包玩家库、未独立验收实际手指教学／持续性能；没有安装 0.1.5 统计版 |
| T517D／Android 15 | 最近成功安装 0.1.2（6）开发签名 Release 提示修复包；第 24 题换空瓶、偏离路线、两步真实异色黑块搭桥、连续 17 次提示完成、撤销及冷启恢复通过；经典第 2 关、外观保留，内部工具关闭 | 随后 0.1.4（8）教学体验包覆盖失败 INSTALL_FAILED_UPDATE_INCOMPATIBLE，USB 断开；该旧体验包也含强制教学重播，已停止作为待装包；无私有 SQLite 读回、完整持续性能或 0.1.5 收件验收 |

旧教学体验包证据：builds/phone-tutorial/。Android 旧 APK SHA-256 为 81856aceaad34872c7acf71de0a6ffdc466e838f8f299b2d124c6cc14398dc01；原 APK 证书对照相同但 PackageManager 拒绝原因未解决，后续安装前核对，不能卸载或清数据绕过。

iPhone 教学修复产物与验签记录在 builds/tutorial-persistence/；仍为原开发签名 0.1.4（1），JS SHA-256 为 98e49a66b7d1cb05658b96ff91380c344b6f23c8d79250440e68df370d0ff971。修复只移除经典／记忆 UI 初始化的强制重播覆盖，恢复读取各自 SQLite 确认；主线源码原本已读取确认。真实 React hook＋SQLite 回归复现旧副本失败，修复副本及当前主线通过；连续冷启、独立确认与原进度／身份／偏好保留均通过桌面回归，相关 28 项测试、TypeScript、ESLint 通过。设备连接故障使安装和真机读回尚未完成；没有卸载、清库或改写手机玩家数据。

T517D 已成功安装的提示修复 APK SHA-256 为 81e8135b982abbfaa78328db359dc29af72f66eea64d128ae873f86c6108fcb9，逐步份额核对、构建与冷启证据在 builds/memory-hint-fix/。它晚于旧 0.1.2 Alpha 包，同版本号不等于相同代码或签名产物。

## 按能力归纳的有效证据

| 能力／平台 | 已验证范围 | 证据位置与边界 |
| --- | --- | --- |
| SQLite 新基线 | 全 1050 经典题读回；Chrome 倒水／撤销／提示／奖励／刷新；iPhone 17 Pro 与 Apple TV 模拟器实际操作、强杀恢复及数据库完整性／外键读回；Android 手机模拟器新库恢复；Android TV 构建／首页启动 | builds/sqlite-acceptance/acceptance.md；Android TV 遥控操作后的恢复待验，不套用旧包证据 |
| 记忆百题与真机数据保留 | iPhone 黑色百题安装后读回内容库哈希、100 题和四张 memory_black_* 表，主线／钱包／安装身份保留；用户实际更改容器有对应事件 | builds/black-memory/；这份旧包读回不代表后续每个安装都做过数据库一致性核验 |
| 记忆规则与首页 | Chrome／内置浏览器检查黑块、查看、答错恢复、自动揭晓、完成后撤销、刷新、首页导航及二十一语种菜单 | builds/ui-simplification/、builds/home-navigation/；当前规则自动揭晓，不沿用旧手动揭晓描述 |
| 手指教学 | Chrome 360×800／800×360；API 36／16 KB 模拟器经典完整示范；独立模拟器记忆观察／准备／七步整理／揭色／礼花、重播／取消／提前开始／冷启确认 | builds/animated-tutorial/；私有示范未改变玩家第一题或钱包；非真机流畅度 |
| 0.1.6 正式派生包升级恢复 | 独立 API 34 模拟器中原上传签名 0.1.5（9）→ 0.1.6（10）覆盖升级及二次冷启；八张关键表、经典／记忆教学确认、棋盘／撤销、钱包、偏好、安装身份、已有统计保留；完整性／外键读回通过 | builds/release-0.1.6/；使用离线生成的测试存档，保留原关闭分析偏好；实际上传 AAB 派生 APK；只验启动与恢复，未操作真机或逐场景画面，也不是 16 KB 运行／Production 收件验收 |
| 0.1.4 正式派生包 | 真实 16384 字节页、关闭并读回两项兼容回退；经典教学、0/5 钱包／原局面、教学偏好与冷启恢复，公开无开发入口 | builds/release-0.1.4/；记忆完整示范来自同源码功能包，不声称该覆盖安装重播了已确认教学 |
| 0.1.3 正式派生包 | 16 KB 模拟器七步记忆提示、中文解释／描金、自动揭色与冷启恢复 | builds/release-0.1.3/；同源码 T517D 提示验收另见上表 |
| 调色内部六题 | Chromium 英／中／阿拉伯三种尺寸完整六题、错配退回／整步撤销／刷新恢复；内部 Release 曾覆盖安装双机并启动 | builds/mixing-trial/；公开无入口，完整真机六题、听感与持续性能未验，不等于当前公开包有调色入口 |
| 手机／平板布局 | 7／10 英寸 Android API 34 模拟器横竖屏、倒水与旋转；iPad Pro 11 M5／iOS 26.5 模拟器十二瓶、倒水中旋转与撤销 | builds/device-compatibility/；对应旧 0.1.1 包，不代替 0.1.5 或真机平板验收 |
| TV 输入 | Android TV API 34 模拟器开始、首关倒水／撤销；Apple TV 4K／tvOS 26.5 模拟器十二瓶、焦点、停滞与 Menu；SQLite 新基线 Apple TV 恢复另见首行 | builds/device-compatibility/、builds/sqlite-acceptance/；非 TV 商店发行或实际观看距离验收 |
| 浏览器／语言／静止布局 | Chrome 键鼠倒水、奖励与恢复；11 窗口、十五容器、德语长文／阿拉伯 RTL；1485 组静止轮廓／点击区检查；新增八语种的 48 个页面状态 | builds/device-compatibility/、builds/languages-21/；最小静止间隙约 4.72，不含光晕／移动美术；非母语校对或 Safari／Firefox 验收 |

十四张平台原图、哈希和场景重拍文件在 builds/release-0.1.1/screenshots/；按要求本地保存，不进 Git 或新上传。准备的展示场景不作自然通关证据。

## 真机表现与性能边界

T517D 已实测并改进按需 SVG 挂载、整页记忆切换与整瓶揭色交接；当前实现的几何、取消和计时契约由[画面与声音](pour-presentation-design.md)及[记忆玩法](memory-mode-plan.md)维护。

- 初始挂载对照五瓶视图 449 → 187，布局至提交约 275 → 135 ms；十二瓶创建仍有约 500–550 ms 长帧。见 builds/android-render-performance/。
- 记忆入口三次录像标题与首瓶液体同帧出现，验证本机该五瓶局面不再标题先出；不表示总输入延迟下降。见 builds/memory-entry-presentation/。
- 第 16 题同路线揭色窗口最终 P99 约 550 ms、最长约 756 ms，未再观察彩色分块、显色闪回或瓶塞重播；撤销及冷启恢复已完成本题通过。仍有短时长帧，不能宣称持续流畅。见 builds/memory-reveal-performance/。
- 用户曾确认 iPhone 相关体验流畅，这是主观反馈，不是量化长期性能。隐藏内部选题的清单筛选已避免同步全库布局扫描；桌面前后计时留在 builds/navigation-performance/，不作为手机性能。
- 模拟器检查过音频选择、静音／后台和迟到取消；真实水声同步延迟、听感、扬声器／耳机与疲劳感尚未全面验收。

这些是既有小样本，不能跨设备、版本或玩法直接推广。

## 0.1.5 在线统计的原生证据

默认开启源码通过该批次 240 项回归、TypeScript、ESLint，Test Android arm64 Release 在全新 API 36／16 KB 模拟器首次启动：Google HTTP 204、GA4 DebugView 显示 bh_app_ready／first_open／session_start；业务参数 app_version=0.1.5、metrics_version=product-metrics-v1、build_environment=test。SQLite 主文件与 WAL 只读复制完整性 ok，analytics=true、environment=test、待发 0、应用会话 1。

Production 上传证书／R8 候选 APK 在独立模拟器运行，真实 16384 字节页，两项兼容回退关闭并读回，安装前阻断应用 UID 的 IPv4／IPv6 出站。SDK 本地接受 bh_app_ready，SQLite 完整性 ok、采集 true、环境 production、待发 0、会话 1；不宣称 Production 云端收件。运行包哈希 cb1c48db41b6492d940bb13b8f24021f9f1a64de5cc0c2e497906c85e93b25c8；约 70 秒首帧及 am start 超时属于高负载模拟器记录，不作手机性能。所捕获致命异常属于系统 Digital Wellbeing，未观察到本应用致命异常。专用模拟器验收后删除，避免合成 SDK 缓存后续上传。

最终 13+ 包另补隐私文字及年龄范围，签名、Production 配置、网络与广告／敏感权限、16 KB LOAD／ZIP 静态检查通过；未将最终包另装真实手机。上述候选运行不冒充最终哈希包逐场景验收。iOS Analytics 只有此前 Test 原生编译／静态默认关闭、IDFV 禁用证据，未重新验收默认开启版本的原生运行。

所有证据在 builds/release-0.1.5/，旧 SDK 编译日志在 builds/analytics/。这只证明启动链路，不覆盖全部 27 事件、断网重连／后台／强杀／内部停用或真实手机，完整指标口径见[统计专题](gameplay-statistics-plan.md)。

## 待验与安装边界

1. Android 重连后排查教学体验包覆盖拒绝；任何安装前核对设备当前签名、版本与目标包哈希，不卸载或清理玩家数据。
2. 用明确的实际包检查前 40 关、高峰 → 副关 → 缓冲、重玩隔离、奖励／扣券幂等、记忆查看／搭桥／答错恢复、完整教学和偏好冷启。
3. 真实手机逐场景核对在线事件、参数、网络失败／重试、既有停用选择及保存恢复；Test／Production 分开，不把 SDK 接受当云端确认。
4. 低端 Android／iPhone Release 持续 10–15 分钟，测帧时间、温度／耗电、提示切片／内存和保存；先测 TypeScript／Hermes，再决定是否评估 C++。
5. 最低系统、最大字号、小屏、21 语种母语与字体、平板真机、TV 真机观看距离、Safari／Firefox 和 Windows Google Play Games 尚待验收。Android TV 新基线实际遥控恢复另验。
6. 外部测试任务与反馈见[测试安排](play-testing-plan.md)。Apple／TV 商店与游戏网页公网部署各自评审，不能由适配或构建成功推定发布。
