# Bottle Harmony

倒水排序游戏，目标平台为 iOS 和 Android。

## 当前范围

当前是竖屏内测试玩：原创玻璃瓶、点击倒水、演示一步、免费撤销和重来。保留原始青绿/珊瑚红四瓶体验，新增八道两至五色、四至七瓶的校准题，均经过独立求解与完整回放验证。右上角“选题试玩”可切换，四档保留试排标注，已获得用户对当前题集难度的初步认可。
通用核心支持多色多瓶关卡定义、显式统一容量、不可变会话、分段预算求解与 JSON 编码解码；所有试玩共用同一套规则。内容工具支持带 seed 的四层瓶生成、完整解法回放、基础筛选、结构去重和内容池验证。正式难度评价器、连续游玩、每日题、合作、账号、时间额度、音效和进度保存尚未实现。

2026 年 10 月 7 日，最新 Release 测试包已安装并启动于 iPhone 12 Pro Max；用户反馈测试没有问题，难度也可以，当前多瓶试玩作为已认可的 iPhone 基线。原始两色四瓶体验此前也获得低端安卓认可。后续保留 React Native、SVG 绘图与 Reanimated 动画方案；新增内容仍需安卓真机复测，手机求解/生成的量化测量与其他功能另行安排。

使用 Expo Development Build 开发。依赖版本以 package.json 和 package-lock.json 为准；React Native 版本跟随 Expo SDK 的兼容配置。

## 产品与竞品讨论

- [竞品功能记录](docs/competitor-functional-review.md)：截图与操作确认的规则、活动、商业化和待确认项，附原始截图索引。
- [游戏模式讨论稿](docs/game-mode-design.md)：第一期候选范围、关卡设计方法、原创机制，以及已有的好友协助、共享棋盘和时间奖励讨论。新增功能仍需讨论确认。
- [纯玩版系统方案](docs/system-design.md)：完整架构、四档难度与松紧节奏、后续实施顺序。
- [通用关卡核心](docs/level-core.md)：已实现的数据格式、会话、分段求解接口、测试及桌面性能基准，含 C++ 后端的评估条件。
- [关卡生成与内容验证](docs/generation.md)：可复现生成、预算与拒绝策略、内容池格式、制作命令及下一阶段的难度校准。
- [多瓶试玩与难度校准](docs/difficulty-calibration.md)：八道对照题、试玩记录方式、评级方向及关卡/进度保存的现状。

原始截图和后续游戏参考资料保存在[本地素材目录](docs/references/README.md)。该目录及素材索引已加入 Git 忽略规则，仅在本机保存，不随仓库上传。

## 美术与真机测试

- [瓶子设计稿](assets/art/bottle-study.svg)：空瓶、混色、选中、完成和倾斜状态。
- [玻璃瓶透明素材](assets/art/bottle-glass.svg)：可复用矢量素材。
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
npx expo install --check
npx expo-doctor
```

## 文件

- App.tsx：应用入口与安全区域。
- src/ui/DemoScreen.tsx：演示交互与自适应排版。
- src/ui/LevelPicker.tsx：内测选题入口；boardLayout.ts 提供四至七瓶布局。
- src/art/：瓶子、液体、水流与背景绘制。
- src/game/：独立模型、规则、会话、通用求解器、编码解码与演示局面。
- scripts/levels.ts：生成并完整验证内容池，或核查已有内容文件。
- assets/levels/calibration.json：随内测应用打包的八道校准题；src/game/calibration.ts 保存题号与试排分组。
- index.ts：应用入口。
- app.json：应用名称、平台标识和原生配置。
- tsconfig.json：严格 TypeScript 配置。
- eslint.config.js：Expo ESLint 配置。

## 后续开发方向

多瓶试玩已接入，下一步根据八道对照题的实际体验调整四档，并实现评价器，再形成内容池与松紧节奏。生成样本默认保存在被 Git 忽略的 builds/；只有明确选择、重新验证并标注的校准题进入内测包，正式发布前仍需人工审核。生成与验证命令见[工具说明](docs/generation.md)。

规则引擎与求解器保持独立的 TypeScript 模块。当前使用 react-native-svg 绘图、Reanimated 驱动动画。倒水根据剩余体积逐渐倾斜，使用同一瓶口坐标连接外部水流与目标瓶内液面。目标瓶始终保持原位，源瓶可以利用标题区域已有的空间，完整边界限制在安全屏幕区域内。角度在接受操作时预计算，逐帧绘制只插值，避免增加低端手机负担。

每个瓶子始终留在同一个绘图组件内，固定点击区域与绘图分离。选中时轻微抬起，倒水从当前高度连续开始；动画时钟在视图收到动作计划后启动。

液体状态在接受合法操作时更新，动画只呈现该操作；退出前台时结束视觉动画并显示已提交的结果。后续再按已确认范围添加持久化和合作。

官方资料：[Development Builds](https://docs.expo.dev/develop/development-builds/introduction/)。

## 依赖维护

安装绘图和动画依赖后，npm audit 报告 26 项上游依赖问题（7 项 moderate、19 项 high）。这些计数包含传递依赖链；未使用会破坏 Expo 兼容版本的强制降级方案。发布前随兼容的上游更新重新检查。
