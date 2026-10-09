# Bottle Harmony

倒水排序游戏。当前已实现经典千关、50 道副关、黑色记忆百题、SQLite 保存与使用统计；六题调色仅内部构建开放。版本、内容与商店状态以[当前实现基线](docs/current-baseline.md)为准，Google Play 封闭测试已于 2026 年 10 月 10 日正式开始，见[测试安排](docs/play-testing-plan.md)。

从[第一版基线](docs/current-baseline.md)与[文档索引](docs/README.md)进入现行规则、架构、内容、设备和发布说明。已实现的统计、存储与在线分析见[统计专题](docs/gameplay-statistics-plan.md)；后续决定与候选见[产品规则与创意](docs/gameplay-ideas.md)，经典关卡后续的钥匙／盖布／逐层显色变化见[扩展规划](docs/color-unlock-plan.md)，均按各自状态评审。

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


## 内容与发布工具

正式内容替换必须先完成[生成与验证](docs/generation.md)，当前 SQLite 基线不导入旧开发数据；闭测已经开始，现有玩家进度、统计与偏好必须保留。内部开发用 `npm run start:internal`，公开构建关闭内部入口。手机／平板开发分析环境默认 Test，商店 Production，Web／TV 离线；客户端配置及构建要求见统计专题。下列检查示例使用当前含分析 SDK 的包，实际路径以发布记录为准。

```sh
npm run android:store
npm run android:apks -- builds/play/bottle-harmony-0.1.5-9.aab
npm run android:inspect -- builds/play/bottle-harmony-0.1.5-9.aab --analytics --report builds/play/artifact-report.json
```

构建依赖、签名、产物与声明以[发布记录](docs/release-readiness.md)及[商店材料](store/google-play/README.md)为准。密钥与密码只在忽略目录安全保存，不提交仓库；不同签名覆盖失败时不得卸载玩家应用。跨平台命令见[设备支持](docs/device-support.md)。

`npm run art` 生成矢量设计稿；`npm run brand:render` 生成品牌与政策材料。原生目录由 Expo 配置生成，依赖使用 Expo 兼容版本与 npm 锁文件；不要用 `npm audit fix --force` 降级 Expo。远端 Expo 检查须遵循用户当前仅本地检查的约定。
