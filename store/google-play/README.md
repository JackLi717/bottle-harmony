# Bottle Harmony Google Play 材料

此目录是本地商店素材基线。英语和中文游戏介绍、四张重新筛选的手机截图均已保存为Play Console草稿，并经重新加载核对；尚未提交本轮素材审核或发行。当前v5 AAB仍保留在Alpha封闭测试发布草稿。用户已选定第四种图形化无广告设计作为正式图标，本地图标已更新；当前已上传AAB仍是旧图标，需在下一次原生构建中更新。新图标由内置ImageGen生成，来源和提示词见 assets/brand/icon-prompts.json。横图的来源声明仍待此前请求的确认，详细进度见 builds/play/console-progress.json。

用户选定的商店标题草稿为 **Water Sort - No Ads**（19 个字符）。Console 实际提示名称不应使用价格或宣传关键词，并提示以 No ads 开头的英文短说明可能不满足商店推荐要求；成功保存不等于审核接受。规则见 [Google Play 元数据政策](https://support.google.com/googleplay/android-developer/answer/9898842?hl=en)。应用内品牌、包名及现有构建仍为 Bottle Harmony。

| 材料 | 文件 | 状态 |
| --- | --- | --- |
| 应用图标 | icon-512.png | 用户已确认第4种：倒水玻璃＋镂空禁止广告标识；512×512 PNG，已上传Console并保存，重新打开核对通过，尚未送审 |
| 宣传横图 | feature-1024x500.png | 1024×500、24 位 PNG，待用户审阅 |
| 商店文案 | listing.json | 英语和简体中文；名称、短说明、完整说明 |
| 完整介绍预览 | description-en-US.txt、description-zh-CN.txt | 从 listing.json 导出，便于审阅 |
| 版本说明 | release-notes.txt | 0.1.0 测试版本 |
| Console 声明 | declarations.json | 内容声明、6 岁以上受众和官方 IARC 分级已保存；地区分级不同，见文件 |
| 手机截图 | screenshots/en-US/ | 四张1080×1920、24位PNG，真实v5发布包UI；分散关卡、不同容器 |

截图按产品橱窗的展示目的重新筛选为四张：郁金香杯（279关）、月光瓶（42关）、十二瓶棱镜棋盘（673关）、辅助辨色冰晶杯（910关）。全部来自已上传v5发布包的真实手机UI，在独立模拟器内使用经正式存档解码器校验的临时截图测试场景；完成后原测试数据库已按SHA-256原样恢复。没有修改游戏代码或截图RGB像素。此截图测试存档不作为自然通关或进度功能验收证据。

原尺寸图片、排序预览、场景参数、SHA-256和后续重拍对比流程均在 [screenshots/README.md](screenshots/README.md)。这是一份本地可持续更新的素材基线；PC、平板和TV交付由其他开发人员负责，实际交付验证后再拍相应平台素材。

最终签名 AAB：builds/play/bottle-harmony-0.1.0-1.aab，SHA-256 为 cbc29b5b19c9a58d9e8806f172320e514639d35fc818bd13046d65d343c0dfa1。对应 APK 由这个 AAB 生成，用于隔离模拟器验证；并非 Google Play 增强、重新签名及分包后交付的安装包。上传签名密钥和密码仅在被忽略的 builds/signing/ 中，需要安全备份，不得随商店资料上传。

仅英文的政策源是 src/config/privacy.json，应用内可离线阅读。网站文件是 store/website/bottle-harmony/privacy.html，已上线 URL 为 https://readytradie.com/bottle-harmony/privacy.html；部署核对记录见 docs/release-readiness.md。

账号要求、真实设备复测、已知工具链审计问题、16 KB 警告及 Console 剩余操作，以 docs/release-readiness.md 为准。先完成本应用自己的封闭测试，再申请正式发布权限；本次不另做开放/Early Access测试；数独的参与天数不计入 Bottle Harmony。
