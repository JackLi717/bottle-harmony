# Bottle Harmony

倒水排序游戏，目标平台为 iOS 和 Android。

## 当前范围

当前游戏已接入固定 1000 关、逐关解锁与已通关重玩。每十关从轻松、标准到思考与收尾挑战，再回到轻松；最多十二瓶、十一色，统一四层容量。四档数量为轻松 300、标准 300、思考 305、挑战 95，制作内部细分为八级。全部关卡来源重建、完整求解回放、结构去重和独立评级重算通过。

保留用户已认可的原创玻璃瓶、背景、点击倒水与动画。撤销、重来、一步提示免费；主线与重玩局面分别保存在本机。菜单提供虚拟化选关、继续主线和可保存的辅助符号开关。首三关为两至三色教学，其余普通题主要使用六至十一色的重叠范围；100 道收尾题按实际固定分不下降，不限制阶段颜色范围。

应用启动读取精简可玩关卡包，完整来源与策略证据只在内部调试时延迟读取。当前用户内测包保留 C 对照题、原始体验和大棋盘内部预览；预览不解锁主线。正式入口开关为 app.json 的 extra.internalTools。算法档位与分数是指定策略下的模型排序，仍需实际试玩校准。

本轮已制作千题并接入游戏；设备安装记录见[设备说明](docs/device-testing.md)。持续游玩和移动端求解、渲染、存储的定量测量不能由桌面测试替代。当前仍为发布前内测，原始图标与发布身份/材料未完成审阅。每日题、机关、账号、生命、计时、付款、广告和音效均未接入。

使用 Expo Development Build 开发。依赖版本以 package.json 和 package-lock.json 为准；React Native 版本跟随 Expo SDK 的兼容配置。

## 产品与竞品讨论

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
当前应用标识为 com.bottleharmony.app，发布前确认归属。图标为官方模板占位资源。

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

规则引擎与求解器保持独立的 TypeScript 模块。当前使用 react-native-svg 绘图、Reanimated 驱动动画。倒水根据剩余体积逐渐倾斜，使用同一瓶口坐标连接外部水流与目标瓶内液面。目标瓶始终保持原位，源瓶可以利用标题区域已有的空间，完整边界限制在安全屏幕区域内。角度在接受操作时预计算，逐帧绘制只插值，避免增加低端手机负担。

每个瓶子始终留在同一个绘图组件内，固定点击区域与绘图分离。选中时轻微抬起，倒水从当前高度连续开始；动画时钟在视图收到动作计划后启动。

液体状态在接受合法操作时更新，动画只呈现该操作；退出前台时结束视觉动画并显示已提交的结果。后续再按已确认范围添加持久化和合作。

官方资料：[Development Builds](https://docs.expo.dev/develop/development-builds/introduction/)。

## 依赖维护

安装绘图和动画依赖后，npm audit 报告 26 项上游依赖问题（7 项 moderate、19 项 high）。这些计数包含传递依赖链；未使用会破坏 Expo 兼容版本的强制降级方案。发布前随兼容的上游更新重新检查。
