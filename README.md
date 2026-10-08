# Bottle Harmony

倒水排序游戏。目标覆盖 iOS／Android 手机和平板、PC 浏览器、Android TV 和 Apple TV；各平台的实际验证状态见[跨设备支持](docs/device-support.md)。

## 当前范围

当前游戏已接入固定 1000 关、逐关解锁与已通关重玩。每二十关形成爬坡、主峰和明显回落，第十关还有次峰；最多十二瓶、十一色，统一四层容量。当前 v5 主线四档实际数量为轻松 8、标准 315、思考 510、挑战 167；模型分不等于玩家验证的难度。全部关卡来源重建、完整求解回放、结构去重和独立评级重算通过。

保留用户已认可的原创玻璃瓶、背景、点击倒水与动画。撤销、重来免费；每个新主线关卡有一次免费的一步提示，额外提示使用首次通关获得的提示券；主线与重玩局面分别保存在本机。菜单提供虚拟化选关、继续主线和可保存的辅助符号开关。首三关为两至三色教学，其余题使用四至十一色；50 道次峰和 50 道主峰各自逐渐升高，普通题允许回落。颜色数不能代替思考难度。

应用启动读取精简可玩关卡包，完整来源与策略证据只在内部调试时延迟读取。公开测试构建关闭内部入口。开发时用 npm run start:internal 显式启用 C 对照题、原始体验和大棋盘内部预览；预览不解锁主线。商店构建始终关闭内部工具。算法档位与分数是指定策略下的模型排序，仍需实际试玩校准。

本轮 v5 千题已安装到 iPhone 12 Pro Max 并成功启动，连续试玩待用户验证；设备记录见[设备说明](docs/device-testing.md)。持续游玩和移动端求解、渲染、存储的定量测量不能由桌面测试替代。当前仍为发布前准备阶段。已实现十五种可自由选择的容器、50 道额外谜题、倒水录音与礼花音效，以及本地声音偏好。原创图标和商店文案已制作，待用户审阅；真机复测与 Console 申报进度见发布清单。每日题、机关、账号、生命、计时、付款和广告均未接入。

使用 Expo Development Build 开发。依赖版本以 package.json 和 package-lock.json 为准；React Native 版本跟随 Expo SDK 的兼容配置。

## 产品与竞品讨论

- [可玩性与趣味性创意库](docs/gameplay-ideas.md)：150 条待评估创意、复杂度初判、优先研究候选与逐条评估方法，供择机选择性实施。
- [千关重新筛选与节奏评价](docs/level-selection-evaluation.md)：新旧难度曲线、峰谷分布、题型变化、独立复核与试玩限制。
- [经典关卡特征算法与题型分布建议](docs/level-feature-design.md)：已实现的内部标签、现有千关分布、覆盖软目标与后续筛选构造顺序。
- [竞品功能记录](docs/competitor-functional-review.md)：截图与操作确认的规则、活动、商业化和待确认项，附原始截图索引。
- [游戏模式讨论稿](docs/game-mode-design.md)：第一期候选范围、关卡设计方法、原创机制，以及已有的好友协助、共享棋盘和时间奖励讨论。新增功能仍需讨论确认。
- [连续游玩与本地进度](docs/play-flow.md)：1000 关主线、逐关解锁、独立重玩与存储边界。
- [千关主线与算法难度标准](docs/production-plan.md)：八级模型、固定分、1000 个制作位置、逐关解锁及正式界面的分阶段交付。
- [纯玩版系统方案](docs/system-design.md)：完整架构、四档难度与松紧节奏、后续实施顺序。
- [生产性能基准](docs/production-benchmark.md)：固定 88 个大局面、BFS/A* 对照、策略评级预算及第八级实题证据。
- [通用关卡核心](docs/level-core.md)：已实现的数据格式、会话、分段求解接口、测试及桌面性能基准，含 C++ 后端的评估条件。
- [关卡生成与内容验证](docs/generation.md)：可复现生成、预算与拒绝策略、内容池格式、制作命令及下一阶段的难度校准。
- [多瓶试玩与难度校准](docs/difficulty-calibration.md)：八道对照题、试玩记录方式、评级方向及关卡/进度保存的现状。

原始截图和后续游戏参考资料保存在[本地素材目录](docs/references/README.md)。该目录及素材索引已加入 Git 忽略规则，仅在本机保存，不随仓库上传。

## 美术与真机测试

- [瓶子设计稿](assets/art/bottle-study.svg)：空瓶、混色、选中、完成和倾斜状态。
- [玻璃瓶透明素材](assets/art/bottle-glass.svg)：可复用矢量素材。
- [发布前下一步](docs/release-readiness.md)：当前能力、真机复测、发布配置和材料的剩余项。
- [跨设备支持与检查](docs/device-support.md)：当前十二瓶适配、浏览器／TV 构建、实际证据和待完成的设备验收。
- [未来多瓶布局约定](docs/adaptive-layout-design.md)：已确认的固定比例和间距方向，十八／二十四瓶自动布局延期实施。
- [设备测试说明](docs/device-testing.md)：安卓 APK 与 iPhone 安装、检查项目和兼容范围。

绘图组件与设计稿使用相同的瓶子轮廓、液体几何和配色。`npm run art` 可重新生成 SVG 设计稿；PNG 是便于查看的预览图，不是游戏运行时依赖。

## 环境

- Node.js 24 LTS（项目提供 .nvmrc），npm。
- iOS 本地构建需要 macOS、Xcode 和 CocoaPods。
- Android 本地构建需要 Android Studio、Android SDK 和兼容的 JDK。

## 开发

```sh
cd /Users/lixiaohu/work/bottle-harmony
nvm use
npm ci
```

首次运行时编译并安装 Development Build：

```sh
npm run ios
# 或
npm run android
```

上述命令会生成对应原生工程、构建并启动开发服务。仅修改 TypeScript 后可使用：

```sh
npm start
```

加入原生依赖或修改应用配置后，需要重新生成原生工程并构建。原生目录由 Expo 配置生成，不在其中保留手工修改。
用户已确认应用名称 Bottle Harmony、包名 com.bottleharmony.app、开发者 Platon Games 和支持邮箱 admin@readytradie.com。图标已由项目原创玻璃轮廓制作。

## 检查

```sh
npm run typecheck
npm run lint
npm test
npm run benchmark:solver
npm run mainline:verify
npx expo install --check
npx expo-doctor
```

## 文件

- App.tsx：应用入口与安全区域。
- src/ui/DemoScreen.tsx：演示交互与自适应排版。
- src/ui/MainlineMenu.tsx：千关虚拟选关；PlayMenu.tsx 保留教学；LevelPicker.tsx 保留内部对照；boardLayout.ts 提供四至十二瓶布局。
- src/art/：瓶子、液体、水流与背景绘制。
- src/game/：独立模型、规则、会话、通用求解器、编码解码与演示局面。
- scripts/difficulty.ts：离线评级与重新计算核查；默认输出到被忽略的 builds/difficulty-report.json。
- assets/levels/calibration-difficulty.json：当前八道样题及原始体验的报告，绑定实际布局；手机只读取结果。
- src/ui/DifficultyDebug.tsx：每题初始难度的调试详情。
- scripts/levels.ts：生成并完整验证内容池，或核查已有内容文件。
- assets/levels/calibration.json：随内测应用打包的八道校准题；src/game/calibration.ts 保存题号与试排分组。
- index.ts：应用入口。
- app.json：应用名称、平台标识和原生配置。
- tsconfig.json：严格 TypeScript 配置。
- eslint.config.js：Expo ESLint 配置。

## 后续开发方向

多瓶试玩和离线暂定评级已接入，下一步对照试玩反馈检查策略分辨力，再校准同档分数、扩充经过验证的内容池和松紧节奏。生成样本默认保存在被 Git 忽略的 builds/；只有明确选择、重新验证并标注的校准题进入内测包，正式发布前仍需人工审核。生成与验证命令见[工具说明](docs/generation.md)。

规则引擎与求解器保持独立的 TypeScript 模块。当前使用 react-native-svg 绘图、Reanimated 驱动动画。倒水根据剩余体积逐渐倾斜，使用同一瓶口坐标连接外部水流与目标瓶内液面。目标瓶始终保持原位，源瓶可以利用标题区域已有的空间，也允许越过水平屏幕边缘并被裁切；不为运动中的瓶子缩小棋盘。角度在接受操作时预计算，逐帧绘制只插值，避免增加低端手机负担。

每个瓶子始终留在同一个绘图组件内，固定点击区域与绘图分离。选中时轻微抬起，倒水从当前高度连续开始；动画时钟在视图收到动作计划后启动。

液体状态在接受合法操作时更新，动画只呈现该操作；退出前台时结束视觉动画并显示已提交的结果。主线与重玩分别保存，展示动画不授予通关进度。

官方资料：[Development Builds](https://docs.expo.dev/develop/development-builds/introduction/)。

## Google Play 准备

发布资料在 store/google-play/，静态英文政策在 store/website/bottle-harmony/privacy.html。英文网页已上线：https://readytradie.com/bottle-harmony/privacy.html（网站自动重定向至无后缀地址）。政策内容与应用内页面使用 src/config/privacy.json 同一来源。重新生成图标、横图和政策可运行 npm run brand:render。

```sh
npm run android:upload-key
npm run android:store
npm run android:apks -- builds/play/bottle-harmony-0.1.0-1.aab
npm run android:inspect -- builds/play/bottle-harmony-0.1.0-1.aab --report builds/play/artifact-report.json
```

商店构建需要 Android NDK 28.2.13676358、SDK 36 和 JDK。构建脚本通过 Expo 配置插件应用发布签名、移除网络及多余权限、关闭系统备份和内部工具。生成的原生目录不可作为持久配置来源。上传密钥及密码仅在 Git 忽略的 builds/signing/ 中，需自行在安全位置备份，不能提交仓库；密钥已有时脚本不会覆盖。AAB 只用于上传，Play App Signing 仍需在 Console 配置。现有 debug 签名手机包不能被此签名直接覆盖，避免为测试卸载并丢失旧进度。

发布前实测和材料状态见 [发布清单](docs/release-readiness.md)；新个人账号须先为本应用完成封闭测试，再申请开放测试权限，见 [测试方案](docs/play-testing-plan.md)。

## 依赖维护

官方 npm 审计已获得用户许可；用兼容的 uuid 覆盖修复 xcode 工具链的已知问题。剩余上游问题与最终 Hermes 包的依赖路径应分别核对，当前具体数量及限制见发布清单。不要使用会把 Expo 强制降级的 npm audit fix --force。用户选择仅做本地 Expo 检查，远端 schema 与 React Native Directory 检查尚未验证。
