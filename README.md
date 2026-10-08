# Bottle Harmony

倒水排序游戏。第一版已完成，正在申请上线；应用 0.1.1，Android 手机／平板 versionCode 5，题库 mainline-1000-v5。第二版范围尚未选定。

从[第一版基线](docs/current-baseline.md)与[文档索引](docs/README.md)进入现行规则、架构、内容、设备和发布说明。后续决定与候选统一见[产品规则与创意](docs/gameplay-ideas.md)，已确认的全 SQLite 新基线见[统计存储方案](docs/gameplay-statistics-plan.md)。

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

正式内容替换必须先完成[生成与验证](docs/generation.md)，当前 SQLite 新基线不导入旧开发数据，之后的玩家数据需保护。内部开发用 `npm run start:internal`，公开构建关闭内部入口。

```sh
npm run android:store
npm run android:apks -- builds/play/bottle-harmony-0.1.1-5.aab
npm run android:inspect -- builds/play/bottle-harmony-0.1.1-5.aab --report builds/play/artifact-report.json
```

构建依赖、签名、产物与声明以[发布记录](docs/release-readiness.md)及[商店材料](store/google-play/README.md)为准。密钥与密码只在忽略目录安全保存，不提交仓库；不同签名覆盖失败时不得卸载玩家应用。跨平台命令见[设备支持](docs/device-support.md)。

`npm run art` 生成矢量设计稿；`npm run brand:render` 生成品牌与政策材料。原生目录由 Expo 配置生成，依赖使用 Expo 兼容版本与 npm 锁文件；不要用 `npm audit fix --force` 降级 Expo。远端 Expo 检查须遵循用户当前仅本地检查的约定。
