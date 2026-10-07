# Bottle Harmony

倒水排序游戏，目标平台为 iOS 和 Android。

## 当前范围

当前是单人纯玩内测版：原创玻璃瓶、点击倒水、演示一步、免费撤销和重来。首次提供两色四瓶教学体验，之后可连续游玩首批 80 道已验证关卡，四档各 20 题。右上角“游玩菜单”可选择固定档位、推荐松紧节奏或跳过当前题；过关后“下一题”继续。本档一轮玩完会明确进入重玩循环，尚未在手机上即时生成无限新题。

每题均经过来源重建、结构去重、完整求解回放和策略难度重算。思考、挑战题的每个初始装水瓶至少三色、每色最多两层；游玩中的同色合并不受此限制。当前局面、撤销历史、模式、节奏位置和已完成题目通过 AsyncStorage 保存在本机；重新打开会回放合法动作恢复当前题。菜单仍保留八道 C01–C08 对照样题，人工试排与自动评级分开。底部“调试难度”继续展示初始题的评级证据。

综合分数与权重待后续校准；每日题、解锁机关、合作、账号、生命、时间额度、付费机制和音效未接入。当前是发布前内测基线，题库的真实体验与新增存储仍需设备验证；图标与应用标识未完成发布审阅。

2026 年 10 月 7 日，iPhone 12 Pro Max 的多瓶画面与操作获得用户认可。按初始混排要求调整 C05、C07、C08，保留符合要求的 C06 后，用户复测反馈难度可以、需要短暂思考，并认为 C07 的空间压力最明显。四层规划评价器已离线实现并接入调试显示，权重和分数边界待校准。C07 自动评为 D4；C06 同为 14 步却评为 D1，说明操作量与指定策略下的选择难度不同。原始两色四瓶体验此前也获得低端安卓认可。后续保留 React Native、SVG 绘图与 Reanimated 动画方案；新增内容仍需安卓真机复测，手机求解/生成的量化测量与其他功能另行安排。

使用 Expo Development Build 开发。依赖版本以 package.json 和 package-lock.json 为准；React Native 版本跟随 Expo SDK 的兼容配置。

## 产品与竞品讨论

- [竞品功能记录](docs/competitor-functional-review.md)：截图与操作确认的规则、活动、商业化和待确认项，附原始截图索引。
- [游戏模式讨论稿](docs/game-mode-design.md)：第一期候选范围、关卡设计方法、原创机制，以及已有的好友协助、共享棋盘和时间奖励讨论。新增功能仍需讨论确认。
- [连续游玩与本地进度](docs/play-flow.md)：80 题内容基线、推荐节奏、存储边界和制作命令。
- [纯玩版系统方案](docs/system-design.md)：完整架构、四档难度与松紧节奏、后续实施顺序。
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
npx expo install --check
npx expo-doctor
```

## 文件

- App.tsx：应用入口与安全区域。
- src/ui/DemoScreen.tsx：演示交互与自适应排版。
- src/ui/PlayMenu.tsx：纯玩模式菜单与教学；LevelPicker.tsx 保留对照样题；boardLayout.ts 提供四至七瓶布局。
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
