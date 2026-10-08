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

**辞典全量 27,509 条**（3.1.0 的 5,393 条 + 3.2.0 补齐的 22,116 条）：
- 第一批（`generate.py`）：常用词 ∪ 随机模式能拼出的真词，单音节校正 3,900 条、多音节自然 1,493 条；
- 第二批（`generate-rest.py`）：剩余辞典词。声调来源：IPA 逐音节 8,829 条、**规则切分反解** 11,232 条、phon 反解 69 条、其余 1,990 条自然合成；
- 16 个非词条（`ฃ ฦ ฦๅ ฿ ๅ ๏ ๐ ๒ ๒๐ ๓` …）不生成。

**多音节处理**：按 IPA 的音节数，用「浊音段 + 能量谷」把朗读切成 N 段，再逐段套该音节声调的曲线（`generate-rest.py` 的 `boundaries()`）。

**规则切分反解**（`derive-tones.mjs`）：枚举所有合法 parts 建「拼写 → 实读调」反查表（187,320 种拼写），再用动态规划把整词切成最少个数的可解析音节；同一位置出现两种不同调序列就判为歧义、不硬猜。

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

## 补第二批（剩余辞典词）

```bash
node web/audio-tools/export-rest.mjs      # 导出剩余词（带每音节 IPA 调）
node web/audio-tools/derive-tones.mjs     # 规则切分反解，给没 IPA 的词补调
uv run --with edge-tts --with numpy --with soundfile --with praat-parselmouth \
  python web/audio-tools/generate-rest.py # 合成 + 逐音节校正（可断点续跑；并发 TWC_CONCURRENCY=14）
node web/audio-tools/merge-rest.mjs       # 合并进 web/data/audio.js，并拷贝到 web/audio 与 docs/audio
node web/build-standalone.mjs             # 重新打包（会同步 dist/audio）
```

`.work/` 不入库（原始 mp3 和中间产物，可由脚本重新生成）。

## 音节包（固定模式全组合 + 教学页字母发音，3.4.0 起）

一套音频、两个用途：

| 用在哪 | 内容 | 读法 | 条数 | 文件 |
| --- | --- | --- | --- | --- |
| 固定模式「一个辅音 + 一个元音」的全组合 | 合法音节（要能选声调、五个调分得开） | Premwadee −25% + **声调曲线校正**（规格同上表） | 2,132 | `rules.js` 的 `soundKey` 直接算文件名，零清单 |
| 教学页 44 辅音 + 全部元音（一行一个「听发音」） | 辅音读字母名（กอ）、元音读「อ + 元音」 | 同上（**曾经试过自然合成的字母包，句尾会下滑，用户不要，已撤掉**） | 取其中的 58 条 | 同上 |

两条硬约定：

1. **按「声音」去重**：声母/尾音/调相同的写法共用一条（ฎา = ดา、ฃอ = ขอ、ฎอ = ดอ）；
   能直接借现有真词音频的（同拼写、单音节、实读调一致，677 条）拷过来不重合成。
   拼写变体元音（`ั` `เ-ิ` `เ-็`）在固定模式下拼不完整（卡片提示「换一个元音」），
   **不生成**；教学页里它们按同音写法读（`tutorial-data.js` 的 `VOWEL_SAY`）。
   没有实读调又借不到词音频的（只有 ฦ ฦๅ）：**铺平调曲线**，别让自然合成的句尾下滑。
2. **真目录**（`web/audio/syl/`），不要用软链接；`docs/`、`dist/` 由
   `node web/build-standalone.mjs` 递归同步。

```bash
node web/audio-tools/export-syllables.mjs        # → .work/syl-list.json（2132 条，借词 677）
uv run --with edge-tts --with numpy --with soundfile --with praat-parselmouth \
  python web/audio-tools/generate-syllables.py   # 合成 + 校正（断点续跑）
node web/audio-tools/install-syllables.mjs       # → web/audio/syl/v1/
node web/build-standalone.mjs                    # docs/audio、dist/audio 一起同步
```
