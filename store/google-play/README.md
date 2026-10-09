# Bottle Harmony Google Play 材料

更新日期：2026 年 10 月 10 日。用户最新确认：测试人员已招募足够，Google Play 封闭测试从今天正式开始，最新版本已发布到封闭测试轨道。当前手机／平板上传版本为 **0.1.5（versionCode 9）**，Alpha 封闭测试；应用内品牌 Bottle Harmony，商店标题 **Water Sort - No Ads**。完整发布状态、产物哈希和证据边界见[发布记录](../../docs/release-readiness.md)。本轮 0.1.5（9）已上传正式签名包和英中版本说明，已发布到封闭测试轨道，公开配置关闭开发工具，沿用既有商店图文与测试群。

本次版本名 `0.1.5 (9) - gameplay analytics`，当前闭测发布状态依据用户本次确认，本次未重新查询 Console；此前 Changes in review 截图仅作历史送审证据，统一见发布记录。闭测发布与公开生产发行分别记录，尚未确认公开生产发行。用户批准的无广告图标保留在本次包中。

| 材料 | 文件 | 当前基线 |
| --- | --- | --- |
| 应用图标 | `icon-512.png` | 已批准的倒水玻璃＋镂空禁止广告标识；已用于商店材料及 0.1.1 包 |
| 宣传横图 | `feature-1024x500.png` | 1024×500、24 位 PNG；沿用首次提交材料，未在本轮改图或送审 |
| 英中商店文案 | `listing.json` | 标题、短说明和完整介绍；对应千关、50 副关、15 容器及现行提示规则 |
| 完整介绍预览 | `description-en-US.txt`、`description-zh-CN.txt` | 从 `listing.json` 导出 |
| 版本说明 | `release-notes.txt` | 0.1.5（9）本地／Google 分析说明，已填入 Console |
| 内容／数据声明 | `declarations.json` | 0.1.5（9）实际数据声明；13+、四类采集／共享、必需且仅分析用途，已保存到 Console；无广告／内购／账号 |
| 手机截图 | `screenshots/en-US/` | 沿用已批准并上传的四张；拍摄来源为 0.1.0（1）包的 v5 题库，未伪称在 0.1.1 重拍 |

四张手机截图依次为 279 关郁金香杯、42 关月光瓶、673 关十二瓶棱镜、910 关冰晶杯与辅助符号。均为真实发布 UI，在隔离模拟器用正式解码器验证的临时场景拍摄，原存档按哈希恢复；不是自然通关或进度功能验收。原图、场景、尺寸和哈希见[截图基线](screenshots/README.md)。新选十四张跨平台原图按用户要求只留在本地 `builds/release-0.1.1/screenshots/`，未加入 Git 或上传 Play。

当前签名 AAB 为 `builds/play/bottle-harmony-0.1.5-9.aab`，SHA-256 `2cef29a0839628889508f0cbab6499d998325234fe824e2f1b4c8b82d18a71ec`；对应 APK 及 R8 mapping 见发布记录。截图证据中的旧 AAB 哈希仍是拍摄来源，不替换成新包哈希。上传签名密钥和密码仅在被忽略的 `builds/signing/`，需要安全备份，不提交仓库或随商店材料上传。

政策源为 `src/config/privacy.json`，应用内离线可读；网站文件 `store/website/bottle-harmony/privacy.html` 对应[公开英文政策](https://readytradie.com/bottle-harmony/privacy.html)。当前 0.1.5（9）已加入默认开启 Firebase 分析和网络权限，应用内与公开网站政策、13+ 受众和 Console Data safety 已同步；上一版 0.1.4（8）的无网络权限声明只属于旧产物。闭测与未来正式版统一使用 Production，具体指标和待验事项见[统计专题](../../docs/gameplay-statistics-plan.md)。

Android TV、Apple 和浏览器均已有对应构建／适配证据，但不据此认定已完成平台发行，见[设备支持](../../docs/device-support.md)。正式发行前的测试与资格待确认事项见[封闭测试安排](../../docs/play-testing-plan.md)；用户已选择本应用封闭测试后申请正式发行，不另做 Early Access。
