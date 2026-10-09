# Bottle Harmony Google Play 材料

更新日期：2026 年 10 月 9 日。第一版已完成，正在申请上线，尚未进入玩家测试、没有玩家（用户最新确认）。当前手机／平板上传版本为 **0.1.2（versionCode 6）**，Alpha 封闭测试；应用内品牌 Bottle Harmony，商店标题 **Water Sort - No Ads**。完整发布状态、产物哈希和证据边界见[发布记录](../../docs/release-readiness.md)。本轮已上传正式签名包和英中版本说明并发送审核，公开配置关闭开发工具，沿用既有商店图文与测试群。

本次 Console 显示 Changes in review，条目为 `0.1.2 (6) - memory and reveal update`；观察时快速检查仍在运行。尚未确认审核批准，用户最新确认尚无玩家、玩家测试未开始。用户批准的无广告图标保留在本次包中。

| 材料 | 文件 | 当前基线 |
| --- | --- | --- |
| 应用图标 | `icon-512.png` | 已批准的倒水玻璃＋镂空禁止广告标识；已用于商店材料及 0.1.1 包 |
| 宣传横图 | `feature-1024x500.png` | 1024×500、24 位 PNG；沿用首次提交材料，未在本轮改图或送审 |
| 英中商店文案 | `listing.json` | 标题、短说明和完整介绍；对应千关、50 副关、15 容器及现行提示规则 |
| 完整介绍预览 | `description-en-US.txt`、`description-zh-CN.txt` | 从 `listing.json` 导出 |
| 版本说明 | `release-notes.txt` | 记忆百题、整瓶揭色修复、页面切换与 21 语种，绑定 0.1.2（6） |
| 内容／数据声明 | `declarations.json` | 免费、无广告／内购／账号／联网采集；6 岁以上及地区 IARC 分级；未来商业规则未实施 |
| 手机截图 | `screenshots/en-US/` | 沿用已批准并上传的四张；拍摄来源为 0.1.0（1）包的 v5 题库，未伪称在 0.1.1 重拍 |

四张手机截图依次为 279 关郁金香杯、42 关月光瓶、673 关十二瓶棱镜、910 关冰晶杯与辅助符号。均为真实发布 UI，在隔离模拟器用正式解码器验证的临时场景拍摄，原存档按哈希恢复；不是自然通关或进度功能验收。原图、场景、尺寸和哈希见[截图基线](screenshots/README.md)。新选十四张跨平台原图按用户要求只留在本地 `builds/release-0.1.1/screenshots/`，未加入 Git 或上传 Play。

当前签名 AAB 为 `builds/play/bottle-harmony-0.1.2-6.aab`，SHA-256 `b24e249c69187d9417c20a0f921878a1348fe177611b24df16f8d591790911ba`；对应 APK 及 R8 mapping 见发布记录。截图证据中的旧 AAB 哈希仍是拍摄来源，不替换成新包哈希。上传签名密钥和密码仅在被忽略的 `builds/signing/`，需要安全备份，不提交仓库或随商店材料上传。

政策源为 `src/config/privacy.json`，应用内离线可读；网站文件 `store/website/bottle-harmony/privacy.html` 对应[公开英文政策](https://readytradie.com/bottle-harmony/privacy.html)。公开 Android 包无网络权限，政策与声明描述当前离线包；推荐结算或内购实施后须同步更新，不能提前写成已接入。

Android TV、Apple 和浏览器均已有对应构建／适配证据，但不据此认定已完成平台发行，见[设备支持](../../docs/device-support.md)。正式发行前的测试与资格待确认事项见[封闭测试安排](../../docs/play-testing-plan.md)；用户已选择本应用封闭测试后申请正式发行，不另做 Early Access。
