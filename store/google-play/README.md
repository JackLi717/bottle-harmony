# Bottle Harmony Google Play 材料

此目录为提交准备材料。Play Console 已创建本应用并保存英文介绍、原创图标、横图与六张截图；当前 v5 AAB 已上传并保存为 Alpha 封闭测试发布草稿，尚未提交应用审核或发行。中文介绍及宣传素材 AI 来源声明仍待完成，进度见 builds/play/console-progress.json。

用户选定的商店标题草稿为 **Water Sort - No Ads**（19 个字符）。Console 实际提示名称不应使用价格或宣传关键词，并提示以 No ads 开头的英文短说明可能不满足商店推荐要求；成功保存不等于审核接受。规则见 [Google Play 元数据政策](https://support.google.com/googleplay/android-developer/answer/9898842?hl=en)。应用内品牌、包名及现有构建仍为 Bottle Harmony。

| 材料 | 文件 | 状态 |
| --- | --- | --- |
| 应用图标 | icon-512.png | 原创玻璃轮廓，512×512 PNG，待用户审阅 |
| 宣传横图 | feature-1024x500.png | 1024×500、24 位 PNG，待用户审阅 |
| 商店文案 | listing.json | 英语和简体中文；名称、短说明、完整说明 |
| 完整介绍预览 | description-en-US.txt、description-zh-CN.txt | 从 listing.json 导出，便于审阅 |
| 版本说明 | release-notes.txt | 0.1.0 测试版本 |
| Console 声明 | declarations.json | 内容声明、6 岁以上受众和官方 IARC 分级已保存；地区分级不同，见文件 |
| 手机截图 | screenshots/en-US/ | 六张 1080×1920、24 位 PNG，实际最终签名包界面 |

截图由官方 adb 从专用 BottleHarmony_Play_16KB 模拟器中的当前 v5 AAB 生成 APK 获取，没有改画面、加宣传字、解锁隐藏关卡或改存档。仅移除全不透明的 alpha 通道以输出 24 位 PNG，RGB 像素逐一核对未变。原始截图保存在 Git 忽略的 builds/play/screenshots-raw/；尺寸和 SHA-256 在 screenshots/manifest.json。当前上传顺序为首页、选关、首关、第四关、颜色符号、玻璃选择；下表为本地文件编号。

| 顺序 | 文件 | 说明 |
| --- | --- | --- |
| 1 | screenshots/en-US/01-home.png | 初始首页与经典玻璃容器 |
| 2 | screenshots/en-US/02-level-one.png | 首关教学棋盘，免费提示、撤销和重开 |
| 3 | screenshots/en-US/03-level-four.png | 正常通关前三关后进入第四关，六色两排棋盘 |
| 4 | screenshots/en-US/04-glass-choice.png | 可自由选择的水杯容器，十五款之一 |
| 5 | screenshots/en-US/05-color-symbols.png | 同一主线棋盘的水杯样式和辅助颜色符号 |
| 6 | screenshots/en-US/06-levels.png | 1000 关顺序解锁与已完成关卡重玩 |

最终签名 AAB：builds/play/bottle-harmony-0.1.0-1.aab，SHA-256 为 cbc29b5b19c9a58d9e8806f172320e514639d35fc818bd13046d65d343c0dfa1。对应 APK 由这个 AAB 生成，用于隔离模拟器验证；并非 Google Play 增强、重新签名及分包后交付的安装包。上传签名密钥和密码仅在被忽略的 builds/signing/ 中，需要安全备份，不得随商店资料上传。

仅英文的政策源是 src/config/privacy.json，应用内可离线阅读。网站文件是 store/website/bottle-harmony/privacy.html，已上线 URL 为 https://readytradie.com/bottle-harmony/privacy.html；部署核对记录见 docs/release-readiness.md。

账号要求、真实设备复测、已知工具链审计问题、16 KB 警告及 Console 剩余操作，以 docs/release-readiness.md 为准。先准备本应用自己的封闭测试，再申请开放测试；数独的参与天数不计入 Bottle Harmony。
