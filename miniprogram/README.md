# 泰语拼读练习 · 微信小程序

原生小程序工程（WXML/WXSS/JS），规则引擎与发音清单都从 `web/` 同步，**不手抄两份数据**。

## 目录

```
miniprogram/
  app.js/json/wxss      全局：云开发初始化、底部三个 tab
  core/                 由 tools/sync-miniprogram.mjs 生成（rules.js / audio-manifest.js / tutorial-*）
  utils/audio.js        发音播放：包内 20 条试听 → 云存储离线发音包
  pages/practice/       练习（随机拼读 + 声调 + 词表 + 发音）
  pages/tutorial/       教学（占位，下一个里程碑）
  pages/dict/           词汇（占位，下一个里程碑）
  assets/audio-demo/    包内试听音频（前 20 条，约 170KB）
```

## 第一次跑起来（5 步）

1. **导入项目**：微信开发者工具 → 导入项目 → 目录选 `miniprogram/`；
   把 `project.config.json` 里的 `"appid": "touristappid"` 换成你自己的 AppID。
2. **开云开发**：工具栏「云开发」→ 创建环境（有免费额度）→ 把环境 ID 填到 `miniprogram/app.js` 的 `cloudEnv`。
3. **打发音包**（本机终端）：
   ```bash
   node tools/pack-audio.mjs        # 生成 dist/miniprogram-audio.zip（5,393 条 / 约 29MB）
   ```
4. **上传发音包**：开发者工具 → 云开发 → 存储 → 上传 `dist/miniprogram-audio.zip` →
   复制它的 **fileID**（形如 `cloud://xxx.yyy-xxx/audio.zip`）填进 `miniprogram/core/audio-cloud.js` 的 `packFileID`。
5. **编译预览**：练习页点「随机组合」「播放发音」；
   前 20 条直接用包内音频出声，其余第一次会下载发音包（约 29MB，一次性），之后全部本地播放。

> 只想先看界面、不想配云存储：跳过 2-4 步也能编译，包内那 20 条能出声，其余会提示「发音包还没配置」。

## 改完 web/ 之后同步

```bash
node tools/sync-miniprogram.mjs    # 规则引擎 / 教学数据 / 发音清单 → miniprogram/core/
```

## 还没做的（按优先级）

1. 教学页：把 `core/tutorial-data.js` 的四张表（44 辅音 / 32 元音 / 尾辅音 / 声调）渲染出来 + 搜索；
2. 词汇页：5,393 条带发音的词表浏览 + 中文查词（词库 2.3MB 走云存储按需拉）；
3. 固定模式（自己点字母拼）与「常用词」档的完整对齐；
4. 单词本 / 练习记录（需要先把“作答”入口做出来，才有数据可统计）；
5. 提交审核前：ICP 备案、类目（工具 > 信息查询）、AI 合成音频标识、数据来源署名。
