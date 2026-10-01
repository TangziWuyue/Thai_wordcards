# 单词发音生成工具

生成 `web/data/audio.js`（发音清单）与 `docs/audio/*.mp3`（音频文件）。

## 音频规格（3.1.0 定稿，用户验收过）

| 项 | 值 |
| --- | --- |
| 音色 | Azure `th-TH-PremwadeeNeural`（女声，经 edge-tts 调用） |
| 语速 | `-25%` |
| 声调校正 | 只铺「元音核心」（强度 > 75% 峰值），幅度 ×1.25 |
| 校正曲线（相对 170Hz，单位半音） | 第1调 `0→0`；第2调 `-3→-5.8`；第3调 `+6.9→-8.1`；第4调 `+2.5→+6.5`；第5调 `-4.75→+4.4` |
| 声调来源 | 优先辞典 IPA（`toneFromIPA`），没有 IPA 时用规则引擎 `spokenTone()` |
| 后处理 | 裁首尾静音 + 峰值归一（0.89）+ 10ms 淡入淡出 |
| 多音节词 | 自然合成，不做曲线校正（规则引擎只覆盖单音节） |

> 为什么这么定：实测 Azure 原生泰语的平调会被句尾下倾压扁（女声的中/低/高三个平调只差 0.5-0.9 半音）；把 F0 曲线按上表钉死后，五个调在声学上分开（抽样 500 条方向性校验 100%）。

## 范围

**常用词 ∪ 随机模式能拼出的真词 = 5,393 条**（单音节 3,900 条做校正，多音节 1,493 条自然合成）。

## 跑一遍

```bash
# 1. 导出清单（读 web/rules.js + 辞典，写 .work/list.json）
node web/audio-tools/export-list.mjs

# 2. 合成 + 校正 + 后处理 + 清单（需要联网；写 .work/）
uv run --with edge-tts --with numpy --with soundfile --with praat-parselmouth \
  python web/audio-tools/generate.py

# 3. 生成主项目用的清单（写 web/data/audio.js）
node web/audio-tools/make-manifest.mjs

# 4. 音频放进 web/audio（源目录，真实目录不要用软链接）与部署目录 docs/audio
mkdir -p web/audio docs/audio
cp .work/audio/*.mp3 web/audio/
cp .work/audio/*.mp3 docs/audio/

# 5. 重新打包（会内联清单，并把音频同步到 dist/audio）
node web/build-standalone.mjs
```

`.work/` 不入库（原始 mp3 和中间产物，可由脚本重新生成）。
