# 泰语组合练习 · Bug 排查报告（beta4）

**排查对象**：`/Users/b3r1in/Projects/Thai_wordcards/web/` 源码，以及 `docs/` `dist/` 的打包产物
**排查日期**：2026-09-29 ~ 2026-09-30
**版本**：README 声称 beta4 / `WHATS_NEW.version = 'beta4'`，但仓库最新标签仍是 `beta3`（见 D-1）
**上一份报告**：`bug排查报告.md`（beta3，13 条缺陷 + 复验 3 条，均已修复）

## 结论摘要

| 项 | 结果 |
| --- | --- |
| 现有自测 | `node --test web/` **69 项全过**（README 写 66、AGENTS.md 写 61，都不对） |
| 上一轮 13 + 3 条缺陷 | **全部确认已修复**，无回归（逐条实测，见「已确认修复」一节） |
| 产物同步性 | `docs/index.html` `docs/tutorial.html` 与 `web/` 源码**逐行一致**；`dist/` 与 `docs/` 仅差时间戳毫秒（3 字符），内容相同。**线上版同样受本报告所有缺陷影响** |
| 新发现缺陷 | **13 条**：P1 × 2、P2 × 6、发版流程与文档 × 5 |
| 本次改动 | **无**。全程只读排查，未修改任何项目文件 |

**两条 P1 都是「教错读音」**——与上一轮 P0（`สระ อา` 码点顺序）同一性质：这是个泰语拼读练习工具，卡片和教学页给出的读音信息错了，学员学到的就是错的。两条都**不在现有 69 项测试的覆盖范围内**。

---

## 验证方法

不靠代码推理下结论，每条缺陷都用可复现探针实测。判据优先用**项目自带辞典的 27522 条真实泰语词**（第三方语料，独立于 `rules.js`），避免重蹈上一轮「测试断言把错误结果当期望值」的覆辙。

| 层次 | 手段 | 规模 |
| --- | --- | --- |
| 规则引擎 | 穷举 44 辅音 × 37 元音 × 5 声调 × 38 尾辅音 × 4 辅音簇 × 2 档 | **123 万组合** |
| 码点顺序 | 以辞典真实词的字序分布为判据交叉验证 | 全库 27522 条 |
| 声调规则 | 辞典维基词典 IPA 的五度标记反查 `spokenTone()` | **7210 个可比对合法单音节真词** |
| 健壮性 | 畸形 parts fuzz（`undefined/null/{}/[]/NaN/-1/emoji/HTML`） | **210 万次调用** |
| 界面层 | jsdom 加载页面，派发真实 `click`/`keydown`/`input`/`pointerdown` 事件 | 固定模式 44×35 穷举、随机连点 500/3000 次、15 种脏 localStorage |
| 拆法歧义 | 穷举 UI 可达 parts，按 `assemble()` 产出字符串分组查冲突 | **18.7 万个字符串，520 组冲突** |

环境：Node v26.9.0，jsdom（装在 `/tmp/twtest/`，**未写入项目依赖**）。jsdom 缺 `matchMedia` / `scrollIntoView` / `getClientRects` / `IntersectionObserver`，harness 里做了补齐；凡结论依赖这些 API 的，都在报告里注明是补齐后测的。

---

# P1 缺陷（用户可见的读音错误）

## A-1. `e_closed`（สระ เออ / เ-ิ）长短音标错，837 种组合的声调算错

**位置**：`web/rules.js:197-200`

```js
{ id: 'e_closed', group: 'variant', name: 'สระ เออ (เ-ิ)', en: 'sara oe (closed)', roman: 'oe',
  example: 'เกิด = koet', lead: 'เ', follow: 'ิ', tail: '',
  short: true, allowsFinal: true, requiresFinal: true,      // ← short 应为 false
  note: '闭音节里的 สระ เออ' },
```

`เ-ิ` 是 **สระ เออ 的闭音节写法**，跟开音节的 `oe`（`เธอ = thoe`）是**同一个元音**。但数据表里：

| 元音 id | 名称 | `short` | `ipa` |
| --- | --- | --- | --- |
| `oe` | สระ เออ（开音节） | **false**（长音） | `ɤː` |
| `e_closed` | สระ เออ (เ-ิ)（闭音节） | **true**（短音） | `ɤ` |

**同一个元音，开音节标长音、闭音节标短音，自相矛盾。**

### 判据一：辞典 IPA 全是长音

穷举「低类辅音 + `e_closed` + 塞音尾 + 不写声调符号」的辞典真词，**6/6 的 IPA 都带 `ː`（长音），且都读第 3 调**：

| 词 | 辞典 IPA | IPA 读 | 规则算 | |
| --- | --- | --- | --- | --- |
| เงิบ | `/ŋɤːp̚˥˩/` | 3 | **4** | ★✗ |
| เชิด | `/t͡ɕʰɤːt̚˥˩/` | 3 | **4** | ★✗ |
| เนิบ | `/nɤːp̚˥˩/` | 3 | **4** | ★✗ |
| เพิก | `/pʰɤːk̚˥˩/` | 3 | **4** | ★✗ |
| เลิก | `/lɤːk̚˥˩/` | 3 | **4** | ★✗ |
| เลิศ | `/lɤːt̚˥˩/` | 3 | **4** | ★✗ |

加辅音簇再多 2 个：`เพลิด` `/pʰlɤːt̚˥˩/`（พล 簇）、`เทริด` `/sɤːt̚˥˩/`（ทร 簇），同样全错。穷举「低类辅音 + `e_closed` + 塞音尾 + 不写符号」的辞典真词共 **8 个，8 个全错、0 个算对**，且**均非常用词**。**这 8 个词的 `check()` 全部返回 `[]`，`e_closed` 又是唯一拆法**（穷举确认，没有别的 parts 能拼出同一个串），所以没有任何路径能算对。

对照组正常：`e_closed` + **响音尾**（活音节）的 10 个真词（`เงิน เชิญ เชิง เทิน เนิน เพิง เมิน เยิน เริง เริม`）全部 ✓——因为活音节时 `live=true`，不读 `short` 字段。**这也说明改 `short` 不会伤到这批词。**

### 判据二：规则表本身自洽，所以现有测试查不出来

`TONE_RULES`（`web/tutorial-data.js:139-176`）的低类死音节那一格用的是 `sample: { vowelId: 'aa', final: 'ก' }`，`aa` 是长音，算出第 3 调，与表上写的 `n: 3` 一致 → 测试通过。**规则表的样本里没有任何一个 `e_closed`**，所以「声调规则表每格都对得上」这条测试（`tutorial.test.mjs:60`）恒成立，掩盖了数据表的错。

这是与上一轮 P0-2 同一类问题：**判据取自实现自己认可的数据**。

### 影响面

| 项 | 数量 |
| --- | --- |
| 算错声调的组合（低类 + `e_closed` + 塞音尾 + 不写符号） | **837 种**（无簇 648 + 带簇 189） |
| 其中辞典真词 | 8 个（`เงิบ เชิด เนิบ เพิก เลิก เลิศ เพลิด เทริด`），**均非常用词** |
| 默认档随机命中率 | **0.591%**（30 万次随机中 1772 次） |
| 全库声调一致率 | 98.09%（7254/7395）→ 修复后 **98.40%**（7277/7395），净 **+23 一致、−23 不一致** |

### 教学页把错误知识点直接摆出来（这条比声调更严重）

`web/tutorial.js:157` 渲染元音表时用 `v.short` 打标签：

```js
if (group.id !== 'extra') meta.push(tag(v.short ? '短音' : '长音'));
```

实测教学页「拼写变体」那一组里，`เ-ิ` 那行显示的是：

```
สระ เออ (เ-ิ)   oe   [短音]   [必须有尾音]   sara oe (closed)
```

**教学页是 beta4 新增的核心功能，用户会照着它学长短音。** AGENTS.md 第 62 行专门强调「泰语靠长短音区别词义：只差拖不拖长就是两个词」，而这里把一个长元音标成了短音。同一页面上 `เธอ`（สระ เออ）标「长音」、`เกิด`（同一个元音的闭音节写法）标「短音」，学员看到两行自相矛盾。

`web/tutorial-data.js:98` 的发音讲解也只写了写法、没提长短：

```js
e_closed: '闭音节里的 เออ。后面跟尾辅音时写成 เ-ิ（如 เกิด）。',
```

### 复现

```bash
cd /Users/b3r1in/Projects/Thai_wordcards && node -e "
globalThis.window=globalThis;
require('./web/data/dict.js'); require('./web/dict.js');
const R=require('./web/rules.js'); const D=globalThis.ThaiDict;
D.loadWords().then(()=>{
  const by=new Map(globalThis.ThaiDictData.words.map(w=>[w[0],w]));
  const e=R.VOWELS.find(v=>v.id==='e_closed'), oe=R.VOWELS.find(v=>v.id==='oe');
  console.log('e_closed.short =',e.short,' ipa =',e.ipa);
  console.log('oe.short       =',oe.short,' ipa =',oe.ipa,'  ← 同一个元音 เออ');
  for(const w of ['เงิบ','เชิด','เนิบ','เพิก','เลิก','เลิศ','เพลิด','เทริด']){
    const en=by.get(w);
    // 反查这个词的唯一拆法
    for(const o of R.CONSONANTS.map(c=>c.ch))for(const f of Object.keys(R.FINALS))for(const c of [null,...R.CLUSTERS.map(p=>p[1])]){
      const p={onset:o,vowelId:'e_closed',tone:'none',final:f,cluster:c};
      if(R.assemble(p)!==w||R.check(p).length)continue;
      console.log(' ',w,en[7],'IPA读'+R.toneFromIPA(en[7]),'规则读'+R.spokenTone(p),
        R.toneFromIPA(en[7])===R.spokenTone(p)?'✓':'★✗');
    }
  }
});"
```

### 修复方向

两处要一起改，否则 IPA 注音仍按短音写：

```js
// rules.js:197-200
{ id: 'e_closed', ..., short: false, ... }

// rules.js:319  VOWEL_IPA
a_short: 'a', e_closed: 'ɤː', e_taikhu: 'e', o_implied: 'o',
//                    ↑ 与 oe 保持一致（ɤː）
```

改完必须确认 `tutorial.js:157` 的标签自动变成「长音」（它读 `v.short`，不用改代码），以及 `tutorial-data.js:98` 的讲解要不要补一句长短音说明。

⚠️ **AGENTS.md:66 明确写了「元音数据带课本字段：`short`（长/短音）。改这些字段前先对一遍课本，测试里有逐条比对。」** `web/rules.test.mjs:368-380` 有一张元音字段对照表，但**它没有收录 `e_closed`**（只列了 `e_short / ae_short / o_short / o_short_open / oe_short / ua_short / ia_short`）。改之前请先对一遍《基础泰语（1）》的元音表确认 `เ-ิ` 归长音——我给的判据是辞典 IPA，课本口径需要你核对。**如果课本确实把 `เ-ิ` 归在短音栏，那这条要改的是「声调规则」而不是 `short` 字段**（即：`e_closed` 虽然课本归短音，但声调上按长音走），这点必须由你定夺，不要照我的 IPA 判据直接改。

### 建议补的回归测试

判据用辞典 IPA，不要用 `spokenTone()` 自己的输出：

```js
// 新增：e_closed 的长短音要有外部判据
test('e_closed（เ-ิ）与 oe（เออ）是同一个元音，长短音标记必须一致', async () => {
  const e_closed = R.VOWELS.find((v) => v.id === 'e_closed');
  const oe = R.VOWELS.find((v) => v.id === 'oe');
  assert.equal(e_closed.short, oe.short, '同一个元音 เออ 的两种写法，长短音不能一个长一个短');
});

// 新增：以辞典 IPA 为判据，覆盖全部低类死音节组合（不只 aa 一个样本）
test('低类辅音 + 死音节 + 不写符号：真词的声调必须与辞典 IPA 一致', async () => {
  const failures = [];
  for (const onset of R.CONSONANTS.filter((c) => c.cls === 'low').map((c) => c.ch)) {
    for (const v of R.VOWELS.filter((x) => !x.internal)) {
      for (const final of Object.keys(R.FINALS).filter((f) => !R.FINALS[f].sonorant)) {
        const parts = { onset, vowelId: v.id, tone: 'none', final, cluster: null };
        if (R.check(parts).length) continue;
        const entry = byWord.get(R.assemble(parts));
        if (!entry || !entry[7]) continue;
        const fromIPA = R.toneFromIPA(entry[7]);
        const fromRule = R.spokenTone(parts);
        if (fromIPA !== null && fromRule !== null && fromIPA !== fromRule) {
          failures.push(`${R.assemble(parts)} ipa=${entry[7]} IPA=${fromIPA} 规则=${fromRule}`);
        }
      }
    }
  }
  // 借词例外（บอส แอป เคส …）另建白名单，其余必须为空
  assert.deepEqual(failures.filter((f) => !LOANWORD_WHITELIST.test(f)), []);
});
```

---

## A-2. `ั + ว` 尾与 `สระ อัว` 撞成同一字符串，6 个常用词的注音有约 1/3 概率出错

**位置**：`web/rules.js:193-196`（`a_short`）与 `web/rules.js:150-152`（`ua`）

```js
// a_short：ไม้หันอากาศ，requiresFinal
{ id: 'a_short', ..., lead: '', follow: 'ั', tail: '', requiresFinal: true },

// ua：สระ อัว，带尾辅音时省掉 follow（ั）
{ id: 'ua', ..., lead: '', follow: 'ั', tail: 'ว', dropFollowWithFinal: true },
```

`ua` 不带尾辅音时拼出 `X + ั + ว`；`a_short` 带 `ว` 尾时也拼出 `X + ั + ว`。**两种完全不同的 parts，产出同一个泰文字符串，但注音不同**：

| 词 | 拆法 A（正确） | 注音 A | 拆法 B（错误） | 注音 B | 辞典注音 | 辞典 IPA |
| --- | --- | --- | --- | --- | --- | --- |
| วัว | `ว / ua / 无尾` | `wua` | `ว / a_short / ว尾` | **`wao`** | `wuua` | `/wua̯˧/` |
| ตัว | `ต / ua / 无尾` | `tua` | `ต / a_short / ว尾` | **`tao`** | `dtuua` | `/tua̯˧/` |
| ตั๋ว | `ต / ua / ๋` | `tua` | `ต / a_short / ๋ / ว尾` | **`tao`** | `dtǔua` | `/tua̯˩˩˦/` |
| รั้ว | `ร / ua / ้` | `rua` | `ร / a_short / ้ / ว尾` | **`rao`** | `rúua` | `/rua̯˦˥/` |
| ถั่ว | `ถ / ua / ่` | `thua` | `ถ / a_short / ่ / ว尾` | **`thao`** | `tùua` | `/tʰua̯˨˩/` |
| กลัว | `กล / ua / 无尾` | `klua` | `กล / a_short / ว尾` | **`klao`** | `gluua` | `/klua̯˧/` |

拆法 B 错在：`ว` 被当成**尾辅音**（读 `o`，แม่เกอว），但在 `ัว` 里它是**元音的一部分**，不单独发音。

### 泰语事实：`ั + ว` 这个序列不可能是「ไม้หันอากาศ + ว 尾」

AGENTS.md:169 已经写了这条规则：

> `ัว` 带尾辅音时会省掉 `ั`（`ตัว` → `สวย`、`ช่วง`），由元音表上的 `dropFollowWithFinal` 控制。

也就是说 `สระ อัว` + 尾辅音时写成 `ส + ว + ย`（`สวย`），**`ั` 会消失**。所以泰语里凡是写成 `Xัw` 的，`ว` 必然是 `สระ อัว` 的组成部分，**不可能是尾辅音**。`a_short + ว尾` 这个组合在泰语里根本不存在，但引擎允许它，还让它跟 `ua` 撞车。

### 实测频率：常用词档 1/3 概率出错

「常用词」档 3000 次随机（只勾 `ว ต ร ถ` + `ua a_short aa i ii`，逼高频命中）：

```
ตัว   → /tao/   × 172      ตัว   → /tua/   × 334
ตั๋ว  → /tao/   ×  82      ตั๋ว  → /tua/   × 163
ถั่ว  → /thao/  × 134      ถั่ว  → /thua/  × 266
รั้ว  → /rao/   × 132      รั้ว  → /rua/   × 268
วัว   → /wao/   × 278      วัว   → /wua/   × 557
```

**每个词都是约 1/3 概率给出错误注音。** 这是「常用词」档——README:9 承诺「随机出来的每一个都是词表里真实存在的词」，用户开着这一档就是为了练真词，结果三分之一的概率把 `วัว`（牛）标成 `wao`。

### 卡片三行自相矛盾

实测 `วัว` 抽到错误拆法时，卡片长这样：

```
วัว
/wao/ · 罗马注音，不含声调            ← 错
真词 牛 常用                          ← 辞典按正确字形查到了，释义是对的
声母 ว（低辅音）元音 ไม้หันอากาศ（短音）尾音 ว  声调 不写 → 读第1调   ← 拆解也是错的
```

**注音行说 `wao`、分解行说「元音是 ไม้หันอากาศ + 尾音 ว」，真词行却标「真词 牛 常用」并给出辞典释义。** 三行摆在一起自相矛盾：辞典能查到说明字形对，但引擎对它的分析是错的。用户会困惑「到底读 wua 还是 wao」。

对照组正常：固定模式选 `ต` + `สระ อัว` → 卡片 `ตัว`、注音 `/tua/`、分解「元音 อัว（长音）」，**完全正确**。所以固定模式不受影响，只有随机模式会踩到。

### 影响面

| 项 | 数量 |
| --- | --- |
| UI 可达（strict 档）的字符串总数 | **187690** 种 |
| 其中「同一字符串有多种拆法」 | 520 种 |
| 注音/声调冲突的 | **520 种全部冲突** |
| 冲突串里的辞典真词 | **86 种**，其中**常用词 15 种** |
| 默认档（不开辅音簇、不开无元音符号）就有冲突的 | **150 种** |
| 默认档随机命中冲突串的频率 | **1.51%**（20 万次中 3021 次） |
| 默认档随机拼出 `ั+ว` 形态且是真词的 | 53/300000 次，涉及 21 个真词 |

除上面 6 个常用词外，受影响的真词还包括（均非常用）：
`หัว(hǔua) ผัว(pǔua) ชั่ว(chûua) ทั่ว(tûua) ขั้ว(kûua) รั่ว(rûua) มัว(muua) นัว งัว ยั่ว คั่ว ฮั้ว บัว จั่ว กลั้ว อั๊ว อั่ว ปั่ว บั่ว กัว ขัว`

开启「允许辅音簇」后 `กลัว` 也进入冲突集（`กล/ua` vs `กล/a_short/ว`）；开启「允许无元音符号的闭音节」后再多 148 组冲突（`กวด` `กวน` `ขวด` `ขวบ` 这类 `ua` vs `o_implied + cluster ว` 的撞车，注音 `kuat` vs `khwot`）。

### 复现

```bash
cd /Users/b3r1in/Projects/Thai_wordcards && node -e "
globalThis.window=globalThis;
require('./web/data/dict.js'); require('./web/dict.js');
const R=require('./web/rules.js'); const D=globalThis.ThaiDict;
D.loadWords().then(()=>{
  const by=new Map(globalThis.ThaiDictData.words.map(w=>[w[0],w]));
  for(const w of ['วัว','ตัว','ตั๋ว','รั้ว','ถั่ว','กลัว']){
    const cs=[...w]; const tc=cs.find(c=>/[่-๋]/.test(c));
    const tone=tc?R.TONES.find(t=>t.mark===tc).id:'none';
    const A={onset:cs[0],vowelId:'ua',tone,final:null,cluster:w==='กลัว'?'ล':null};
    const B={onset:cs[0],vowelId:'a_short',tone,final:'ว',cluster:w==='กลัว'?'ล':null};
    console.log(w.padEnd(6),'辞典='+by.get(w)[1].padEnd(8),
      ' อัว拆法='+R.assemble(A)+'→'+R.romanize(A).padEnd(6),
      ' ไม้หันอากาศ+ว拆法='+R.assemble(B)+'→'+R.romanize(B).padEnd(6),
      ' 同串='+(R.assemble(A)===R.assemble(B)),
      ' check(A)='+JSON.stringify(R.check(A)),' check(B)='+JSON.stringify(R.check(B)));
  }
});"
```

输出会显示两种拆法产出**完全相同的字符串**，且 `check()` 对两者都返回 `[]`。

### 修复方向

根因是 `a_short` 不该允许 `ว` 作尾辅音。两种改法，我倾向前者：

**改法一（推荐，改数据 + 自检）**：给元音加一个「禁用尾辅音」字段，在 `check()` 里拦掉。

```js
// rules.js:193-196  a_short 定义里加一条
{ id: 'a_short', ..., requiresFinal: true, bannedFinals: ['ว'],
  note: '闭音节里的 สระ อะ；ว 不能作它的尾辅音——ั+ว 这个写法泰语里读作 สระ อัว' },

// rules.js:672-676  check() 的 final 分支里加
if (parts.final) {
  if (!FINALS[parts.final]) issues.push(`辅音 ${parts.final} 不能作尾辅音`);
  if (vowel && !vowel.allowsFinal) issues.push('该元音不能带尾辅音');
  if (vowel && (vowel.bannedFinals || []).includes(parts.final)) {
    issues.push(`${vowel.name} 不能接尾辅音 ${parts.final}（这个写法是 สระ อัว）`);
  }
  if (roles[chars.length - 1] !== 'final') issues.push('尾辅音不在末尾');
}
```

`generate()` 里挑 final 的地方（`rules.js:759-762`）也要同步过滤，否则 strict 档会生成出 `check()` 报错的组合：

```js
let final = null;
if (vowel.allowsFinal && finalCandidates.length) {
  const usable = finalCandidates.filter((f) => !(vowel.bannedFinals || []).includes(f));
  if (usable.length && (vowel.requiresFinal || rng() < 0.5)) final = pick(usable, rng);
}
```

⚠️ `a_short` 是 `requiresFinal: true`，如果 `usable` 被过滤空了会拼不出音节——但 `ว` 只是 37 个尾辅音里的 1 个，`usable` 还剩 36 个，不会空。**这条要在测试里断言**（`a_short` 在任意辅音词表下都必须能生成）。

**改法二（改渲染，不改引擎）**：`app.js` 渲染时如果发现某个字符串有多种拆法、且当前 parts 的注音与辞典注音对不上，就换成对得上的那种。缺点是治标不治本，引擎层面仍有歧义，将来搬到后端照样出问题。

### 建议补的回归测试

判据是「**同一个字符串不该有两种注音**」，这条与实现无关，纯自洽性检查：

```js
// 新增：assemble() 必须是单射（在 UI 可达范围内）
test('UI 可达的 parts 里，同一个泰文字符串不该有多种注音', () => {
  const byText = new Map();
  for (const onset of R.CONSONANTS.map((c) => c.ch)) {
    for (const vid of R.SELECTABLE_VOWEL_IDS) {
      for (const tone of R.TONES.map((t) => t.id)) {
        for (const final of [...Object.keys(R.FINALS), null]) {
          const parts = { onset, vowelId: vid, tone, final, cluster: null };
          const opt = R.toneOptions(parts, true).find((t) => t.id === tone);
          if (opt && !opt.allowed) continue;
          if (R.check(parts).length) continue;
          const text = R.assemble(parts);
          if (!byText.has(text)) byText.set(text, new Set());
          byText.get(text).add(R.romanize(parts, 'latin'));
        }
      }
    }
  }
  const conflicts = [...byText.entries()].filter(([, s]) => s.size > 1);
  assert.deepEqual(conflicts.map(([t, s]) => `${t}:{${[...s].join('|')}}`), []);
});

// 新增：常用词的注音必须与辞典注音的元音部分对得上（拿真实词做判据）
test('常用词 วัว ตัว ตั๋ว รั้ว ถั่ว กลัว 的注音不能是 wao/tao/rao/thao/klao', () => {
  for (const [word, bad] of [['วัว','wao'],['ตัว','tao'],['ตั๋ว','tao'],
                             ['รั้ว','rao'],['ถั่ว','thao'],['กลัว','klao']]) {
    // 反查所有能拼出这个词的合法 parts，注音都不能是错的那个
    for (const parts of allPartsProducing(word)) {
      assert.notEqual(R.romanize(parts, 'latin'), bad, `${word} 被注音成 ${bad}`);
    }
  }
});
```

---

# P2 缺陷（健壮性、无障碍、一致性）

## B-1. `check()` 对非字符串字段抛 TypeError（上一轮只修了 `romanize()`，漏了这一路）

**位置**：`web/rules.js:631`

```js
for (const [role, text] of pieces) {
  for (const ch of text) {        // ← text 可能是 -1 / {} / true / []
```

`layout()`（`rules.js:472-484`）里 `onset / cluster / final` 直接取 `parts` 的值，没有类型兜底：

```js
onset: parts.onset || '',       // -1 是 truthy，原样传下去
cluster: parts.cluster || '',   // {} 是 truthy
final: parts.final || '',       // true 是 truthy
```

字符串拼接时 `-1` 变成 `"-1"`、`{}` 变成 `"[object Object]"`（`assemble()` 不崩，产出 `"<b>-1ช"` 这种垃圾串），但 `check()` 的 `for...of` 遇到非字符串就抛。

**实测**：

| 字段 | 传入 | `assemble()` | `check()` | `describe()` |
| --- | --- | --- | --- | --- |
| `onset` | `-1` / `{}` / `true` | ok（产出垃圾串） | **THROW** `text is not iterable` | **THROW** |
| `final` | `-1` / `{}` / `true` | ok | **THROW** | **THROW** |
| `cluster` | `-1` / `{}` / `true` | ok | **THROW** | **THROW** |
| `vowelId` / `tone` | 任意垃圾 | ok | ok | ok |

30 万次畸形 parts fuzz（**210 万次函数调用**）中 **89510 次（4.3%）** 抛异常。

**关键不自洽**：与上一轮报告的第 12 条同一个病根。`check()` 在 `rules.js:673` 专门有一条分支处理非法尾辅音：

```js
if (!FINALS[parts.final]) issues.push(`辅音 ${parts.final} 不能作尾辅音`);
```

说明引擎**设计上预期** `final` 可能是非法值并友好报告；上一轮已经把 `romanize()`（`rules.js:535`、`:545`）和 `describe()` 的兜底补齐了，**`check()` 自己的这一路漏了**。同一种输入，`romanize()` 现在能兜住，`check()` 会崩。

**当前 UI 不可达**（`generate()` 只从白名单里取值，实测 20 万次随机产出非法字段 0 次），但 AGENTS.md:186 写了「以后若搬到后端，接口不变，前端改成 fetch 即可」——后端复用或将来加「手动输入尾辅音」时会直接崩。

**修复方向**：`layout()` 里统一做字符串化兜底，与 `vowel ? ... : ''` 保持一致：

```js
function layout(parts) {
  const vowel = VOWEL_MAP.get(parts.vowelId) || {};
  const str = (x) => (typeof x === 'string' ? x : '');
  const follow = vowel.dropFollowWithFinal && parts.final ? '' : (vowel.follow || '');
  return {
    lead: vowel.lead || '',
    onset: str(parts.onset),
    cluster: str(parts.cluster),
    follow,
    tone: toneMark(parts.tone),
    tail: vowel.tail || '',
    final: str(parts.final),
  };
}
```

改完 `check({onset: -1, ...})` 应该报「首辅音不是辅音」，而不是抛异常。

---

## B-2. `generate()` 对非法 `rng` 抛异常

**位置**：`web/rules.js:685-687`

```js
function pick(list, rng) {
  return list[Math.min(list.length - 1, Math.floor(rng() * list.length))];
}
```

`Math.floor(NaN * n)` → `NaN`；`Math.min(len-1, NaN)` → `NaN`；`list[NaN]` → `undefined`。上一轮报告说「`pick()` 里的 `Math.min(list.length - 1, ...)` 保护生效」——那只挡住了 `rng()` 返回 `[0,1]` 区间外的**数值**，挡不住 `NaN` 和非数值。

**实测**：

| `rng` 返回 | 结果 |
| --- | --- |
| `0` | `ฤ` ✓ |
| `1` / `0.9999999999` / `1.5` | `เฮ็ฬ` ✓ |
| `1e-12` | `ฤ` ✓ |
| `-0.5` | **THROW** `Cannot read properties of undefined (reading 'allowsFinal')` |
| `NaN` | **THROW** 同上 |
| `undefined` | **THROW** 同上 |
| `'x'` | **THROW** 同上 |

抛出点在 `rules.js:760`（`vowel.allowsFinal`）与 `rules.js:741`（`pick(vowelOnsetVowels, rng).id`）。

**当前 UI 不可达**（`app.js` 从不传 `rng`，用默认 `Math.random`），但 `rng` 是 `generate()` 的公开参数、专门为了「便于测试」而留的（`rules.js:703` 的 JSDoc）。测试里传个坏 rng 就会崩。

**修复方向**：`pick()` 里对下标做数值兜底：

```js
function pick(list, rng) {
  const n = Number(rng());
  const i = Number.isFinite(n) ? Math.floor(Math.max(0, Math.min(1, n)) * list.length) : 0;
  return list[Math.min(list.length - 1, i)] ?? list[0];
}
```

---

## B-3. `check()` 不校验辅音簇本身是否合法

**位置**：`web/rules.js:678-680`

```js
if (parts.cluster) {
  if (at('cluster') !== at('onset') + 1) issues.push('辅音簇不相邻');
}
```

只查「位置相不相邻」，**不查这个组合在不在 `CLUSTERS` 表里**。

**实测**：穷举 44 × 43 个辅音两两组合，去掉表里合法的 26 个，剩下 **1866 个非法簇全部被 `check()` 放行**：

```
กจ → กจา  注音=kja   check()=[]
กฎ → กฎา 注音=kda   check()=[]
กต → กตา  注音=kta   check()=[]
มม → เมม  注音=mme   check()=[]     ← 注音出现重复字母
ญญ → ญญ่าย 注音=yyai check()=[]     ← 同上
```

**当前 UI 不可达**：`generate()`（`rules.js:753`）只从 `CLUSTERS` 表里配对，`fixedParts()` 恒返回 `cluster: null`，两个页面都没有「手动指定辅音簇」的入口。实测默认档随机 20 万次，产出非法簇 **0 次**。

但 `check()` 是引擎的公开自检接口，AGENTS.md:186 说「以后若搬到后端，接口不变」——后端接收用户输入时这条会漏检。而且它已经让 B-1 的 fuzz 和本报告的穷举统计产生了大量噪音（我第一轮就误把 `มม` `ญญ` 当成真 bug，后来加 `uiReachable()` 过滤才排除）。

**修复方向**：

```js
if (parts.cluster) {
  if (at('cluster') !== at('onset') + 1) issues.push('辅音簇不相邻');
  const CLUSTER_SET = new Set(CLUSTERS.map((p) => p.join('')));
  if (!CLUSTER_SET.has(`${parts.onset}${parts.cluster}`)) {
    issues.push(`${parts.onset}${parts.cluster} 不是合法的辅音簇`);
  }
}
```

`CLUSTER_SET` 提到模块级常量，别放在 `check()` 里每次重建。改完 `web/combinations.test.mjs` 的 48 组矩阵要全跑一遍，确认没有把合法组合误判成非法。

---

## B-4. 教学页搜索框 `aria-expanded` 恒为 `false`

**位置**：`web/tutorial.html:34`

```html
<input type="search" id="tutSearch" ... role="combobox" aria-expanded="false"
       aria-controls="tutResults" aria-label="在教学中搜索">
```

`web/tutorial.js` 全文 **0 处**更新 `aria-expanded`（`grep -c 'aria-expanded' web/tutorial.js` → 0）。

**实测**（各状态下读取该属性）：

| 状态 | `#tutResults.hidden` | 结果数 | `aria-expanded` |
| --- | --- | --- | --- |
| 输入前 | `true` | 0 | `false` ✓ |
| 输入 `ก` 后（下拉展开） | **`false`** | 7 | **`false`** ★ |
| Escape 后 | `true` | 7 | `false` ✓ |
| 点清空按钮后 | `true` | 7 | `false` ✓ |
| 点到别处收起后 | `true` | 7 | `false` ✓ |

`role="combobox"` + `aria-controls` + `aria-activedescendant` 这套 ARIA 组合里，`aria-expanded` 是**必需**的状态属性。现在下拉明明展开了 7 个结果，屏幕阅读器仍播报「已折叠」，用户不知道有结果可选。

对照组正常：`aria-activedescendant` 是**正确**更新的（实测按 ↓ 后 `="res1"`，与实际高亮项 `li#res1.active` 一致）——说明作者知道要维护 ARIA 状态，只是漏了这一个。

**修复方向**：在 `renderResults()` 和 `closeResults()` 里同步：

```js
function closeResults() {
  search.list.hidden = true;
  search.active = -1;
  search.input.setAttribute('aria-expanded', 'false');
}
// renderResults() 末尾（search.list.hidden = false 那一行之后）
search.input.setAttribute('aria-expanded', 'true');
// renderResults() 里 !q 提前 return 之前，也要设成 'false'
```

---

## B-5. 教学页尾辅音标签有三套说法，页面上看得见的那套搜不到

**位置**：`web/tutorial.js:185`（页面显示）、`web/tutorial.js:199`（搜索索引）、`web/tutorial.html:86`（正文）

```js
// tutorial.js:185  页面上渲染出来的标签
tag(R.FINALS[chars[0]].sonorant ? '响音尾 · 活音节' : '塞音尾 · 死音节')

// tutorial.js:199  登记进搜索索引的 tags
tags: [R.FINALS[chars[0]].sonorant ? '清尾辅音 · 活音节' : '浊尾辅音 · 死音节'],
```

```html
<!-- tutorial.html:86  正文里的说法 -->
-ng -n -m -y -w 叫<b>清尾辅音</b>（能一直发下去），-k -t -p 叫<b>浊尾辅音</b>（憋一下就断）。
```

**实测搜索**：

| 查询 | 命中 | 档 | 说明 |
| --- | --- | --- | --- |
| `响音尾` | **0 条** | — | ★ 页面上明明写着这个词 |
| `塞音尾` | **0 条** | — | ★ 同上 |
| `清尾辅音` | 5 条 | strict | `-n -ng -m -y -w`，但页面上没有这个词 |
| `浊尾辅音` | 3 条 | strict | `-k -t -p`，同上 |
| `活音节` | 5 条 | strict | ✓ 两套都有这半截 |
| `死音节` | 3 条 | strict | ✓ |

**搜页面上看得见的词 0 命中，搜页面上看不见的词反而命中**——正好反了。AGENTS.md:57-66 花了整整一节讲这套三档严格搜索的设计，`keys1` 明确包含「标签」，结果标签本身跟页面对不上。

另外这套术语本身也值得核一遍：`tutorial-data.js:105` 的注释写「课本把尾辅音分成『清尾辅音』（响音：ง น ม ย ว）和『浊尾辅音』（塞音：ก ด บ）」，但语音学上响音（sonorant）通常是**浊**的、塞音尾在这里是**不除阻的清塞音**。哪个对得上《基础泰语（1）》需要你核课本——AGENTS.md:64 专门叮嘱过发音讲解的口径要对课本。

**修复方向**：三处统一成同一套词。建议页面显示与搜索索引共用一个常量，避免再次跑偏：

```js
// tutorial.js 顶部
const FINAL_TAG = (sonorant) => (sonorant ? '清尾辅音 · 活音节' : '浊尾辅音 · 死音节');
// :185 与 :199 都用它
```

并补一条测试断言「页面上渲染的标签文字」与「登记进索引的 tags」一致（现在 `tutorial.test.mjs:184` 只断言了索引那一侧，所以查不出来）。

---

## B-6. `โหว` 等真词的注音出现重复字母（`hoo`）

**位置**：`web/rules.js:543-548`

```js
let final = '';
if (parts.final) {
  const entry = FINALS[parts.final] || {};
  const sameSound = vowel && entry.ipa && vowel.ipa.endsWith(entry.ipa);
  final = sameSound ? '' : (useIPA ? (entry.ipa || '') : (entry.roman || ''));
}
```

去重靠 `vowel.ipa.endsWith(entry.ipa)`。`โหว` = `ห` + `o`（สระ โอ，`ipa='oː'`）+ `ว` 尾（`FINAL_IPA.w = 'w'`）→ `'oː'.endsWith('w')` 为 `false`，于是两个音都写出来：`hoo`（拉丁）/ `hoːw`（IPA）。而泰语里 `โ-` 元音后接 `ว` 尾时 `ว` 不单独发音。

**实测（UI 可达范围内的真词）**：

| 档位 | 重复注音的不同字符串 | 其中辞典真词 | 常用词 |
| --- | --- | --- | --- |
| 默认（不开簇、不开无元音符号） | 606 | **1**（`โหว`） | 0 |
| 开启辅音簇 | 1002 | 1 | 0 |
| 开启无元音符号 | 756 | **4**（`โหว สว นว วว`） | 0 |
| 全开 | 1244 | 4 | 0 |

| 词 | 引擎注音 | 辞典注音 | 常用 |
| --- | --- | --- | --- |
| `โหว` | `hoo` | （辞典注音为空） | 否 |
| `สว` | `soo` | （空） | 否 |
| `นว` | `noo` | `ná-wá-`（多音节读法） | 否 |
| `วว` | `woo` | （空） | 否 |

**影响面很小**：4 个都是辞典注音为空的边缘词（多为缩写或不成词的形态），**没有常用词受影响**，且需要开启默认关闭的开关才会碰到其中 3 个。

另有 222 个**非真词**组合会显示重复注音（`กิย→kii`、`โกว→koo`、`กรอว→kroo` 这类），按元音分布：`i`=44、`ii`=44、`o`=43、`o_long`=44、`o_implied`=41、`rue/ruee/lue/luee`=6。这些组合泰语里本来就不写（`สระ อิ` / `สระ โอ` 后不接 `ย`/`ว` 尾），属「本不该拼出来」的副产物，跟 A-2 那类撞车是不同性质的问题。

**修复方向**：把去重判据从「IPA 尾音相同」放宽到「元音本身以半元音收尾」：

```js
// o / o_long / o_short / o_short_open 这类以 -o 收尾的元音，接 ว 尾时 ว 不单独发音
const GLIDE_OFF = { w: ['o', 'o_long', 'o_short', 'o_short_open', 'ao', 'ua', 'ua_short'],
                    y: ['i', 'ii', 'ia', 'ia_short', 'ai', 'ai_mai'] };
const sameSound = vowel && entry.ipa
  && (vowel.ipa.endsWith(entry.ipa) || (GLIDE_OFF[parts.final] || []).includes(vowel.id));
```

⚠️ 这条改动会牵动 `romanize()` 的一批输出，**改完必须跑 `web/rules.test.mjs` 里所有注音断言**（`:121` 的 `to`、`:368-380` 的元音字段对照表等），并重新核对 A-2 那批 `ัว` 词的注音没被带坏。如果嫌风险大，**也可以只修 A-2 不修这条**——B-6 只影响 1~4 个辞典注音为空的边缘词，优先级最低。

---

# 发版流程与文档不一致

这几条不影响功能，但 AGENTS.md:190-197 把发版流程写成「缺一不可」，而当前状态是**流程没走完 + 文档数字过期**。上一轮报告最后也提过同类问题（`WHATS_NEW.version` 没升）。

## D-1. README 声称 beta4，但仓库里没有 `beta4` 标签

```
$ git tag -l
beta1  beta2  beta3

$ git for-each-ref refs/tags --format="%(refname:short) → %(objectname:short)"
beta3 → b23b5a2

$ git log -1 --format="%h %s"
9f120f2 教学页搜索框接上辞典（查词），顺带修三处
```

`beta3` 标签指向 `b23b5a2`，而 HEAD 是 `9f120f2`，**中间 15 个提交（整个 beta4 教学页功能）没有标签**。README:3 写「**版本：beta4**」、`app.js:1401` 的 `WHATS_NEW.version = 'beta4'`，但 AGENTS.md:24 仍写「版本标签 `beta3`」。

AGENTS.md:196 的发版流程第 6 步明确要求「打标签（换版本时用 `git tag -f` 挪旧的）」。要么补 `beta4` 标签，要么把 README 的版本号退回去。

`pyproject.toml` 是 `0.3.0b3` —— 按 AGENTS.md:194 的约定「只在打新标签时才动」，所以它跟 `beta4` 对不上是**同一件事的两个侧面**，补标签时一起处理。

## D-2. 测试项数三处不符

| 出处 | 写的 | 实际 |
| --- | --- | --- |
| `README.md:99` | `# 66 项：规则引擎 44 + 选项矩阵 6 + 教学页讲解 7 + 搜索匹配 4 + 拼写顺序等` | **69** |
| `AGENTS.md:19` | `共 61 项（规则引擎 44 + 选项全矩阵 6 + 教学页 7 + 拼写顺序等）` | **69** |

实测 `node --test web/` → `ℹ tests 69 / ℹ pass 69 / ℹ fail 0`。

AGENTS.md 自己写了「改动前先确认当前实现状态（本项目变动较快，以实际代码为准）」，但这两处数字已经落后两轮。建议改成不写具体数字（「跑 `node --test web/` 全过」），免得每加一条测试都要改三个地方。

## D-3. 词库文件大小说法前后矛盾

| 出处 | 写的 |
| --- | --- |
| `README.md:45` | 「词库 1.6MB，平时不加载」 |
| `README.md:147` | 「`web/data/dict.js`（约 1.6MB）」 |
| `AGENTS.md:70` | 「词库 1.6MB 是**按需加载**的」 |
| `AGENTS.md:160` | 「辞典数据文件因此从 1.6MB **涨到 2.2MB**，单文件版也跟着变大」 |

实测 `web/data/dict.js` = **2.21MB**（2314900 字节）。AGENTS.md:160 是对的，前三处没跟着更新。单文件版实测 4.12MB（`dist/泰语组合练习.html` = 4820789 字节）。

## D-4. AGENTS.md:159 的「剩下 35 个全是英语借词」不成立

原文：

> 规则本身拿维基词典的 IPA 反查过：2461 个「引擎能拼出来、且在辞典里有 IPA」的单音节真词里，**2426 个（98.6%）**与规则算出来的一致。剩下 35 个全是英语借词（`บอส`=boss、`บัส`=bus、`แอป`=app、`เคส`=case…），它们一律读第 4 调（ตรี），跟拼写规则无关——这是**词级例外**，不是规则错。

本轮实测（穷举 UI 可达 + strict + 辞典真词 + IPA 只含一个声调组，去重后）：**7210 个可比对词，53 个不一致（98.09%）**。53 个里确实有英语借词，但**不全是**：

| 类别 | 词 | 原因 |
| --- | --- | --- |
| 英语借词（读第 4 调，词级例外，符合原文） | `กราฟ แกรด เก็ต บอส บัส ปราก เอช เอส เอป เอฟ แอป(★常用) คลาส เคส โคช เคียฟ คลับ ชีส เชฟ(★常用) เซฟ ซอส(★常用) เทป นอต พีช เพจ เฟก เฟค เฟส มูส แมส โยบ เฮก เฮช แฮป` | 与拼写规则无关，`app.js:849` 的 `ipaTone` 覆盖会标出来 |
| **A-1 导致（泰语原生词）** | `เงิบ เชิด เนิบ เพิก เลิก เลิศ เพลิด เทริด` | `e_closed.short` 标错，规则算第 4 调、正确第 3 调 |
| **多音节被当成单音节比对** | `ช่ะ อัญ โสณ ไผท` 等 | 我的判据已过滤（只取 IPA 单声调组），残留的是数据本身的边缘情况 |
| **拆法歧义（A-2 相关）** | `ควบ งวด นวด พวก รวด รวบ ลวด ยวบ ชวด ทวด ลวก` | 这些词有多种拆法，其中 `ua` 拆法算对了（IPA=3、规则=3），`o_implied + cluster ว` 拆法算错（规则=4）。**卡片显示哪种取决于随机** |

样本量差异（2461 → 7210）是因为我穷举了辅音簇与全部尾辅音组合，比原验证覆盖面大。**结论**：原文「剩下 35 个全是英语借词」需要修正为「大部分是英语借词，另有 8 个是 `e_closed` 长短音标错导致的原生词错误（见 A-1）」。

## D-5. README 内部对「拼写变体」个数自相矛盾

| 出处 | 写的 |
| --- | --- |
| `README.md:31`（教学页功能表） | 「另列 **4 个**拼写变体」 |
| `README.md:62`（词表勾选） | 「另列 **3 个**拼写变体（`ั` `เ-ิ` `เ-็`）」 |
| `AGENTS.md:162` | 「另有 **4 个**拼写变体（`ั` `เ-ิ` `เ-็` 无元音符号）不入这 32」 |

实测 `rules.js` 里 `group === 'variant'` 的元音 **4 个**：`a_short(ั)`、`e_closed(เ-ิ)`、`e_taikhu(เ-็)`、`o_implied(无元音符号)`。教学页渲染出的变体组也确实是 4 行（`อั เอิ เอ็ 无`）。

README:62 的语境是「练习页词表勾选」，而 `o_implied` 标了 `optionOnly: true`、不出现在词表里（由开关控制），所以那里写 3 个**在词表语境下是对的**——但同一份 README 里两处数字不同、又都没说明区别，读起来像笔误。建议在 README:62 补一句「（第 4 个『无元音符号』不在词表里，由选项开关控制）」。

---

# 已确认修复的项（上一轮报告的 13 + 3 条）

逐条实测，**全部确认已修复，无回归**。列出来是为了让 codex 不要重复排查：

| 上轮编号 | 缺陷 | 本轮复验证据 |
| --- | --- | --- |
| P0-1 | `aa` 声调符号码点顺序 | 穷举 123 万组合，「spacing 元音 → 声调符号」错序 **0 处**；辞典全库同向统计 **3170 : 0**。`ม้า ป้า ค่า ก้าน ง่าย บ้า` 码点全部正确 |
| P0-2 | 两处测试断言把错误码点当期望值 | `rules.test.mjs:86` / `:323` 已改为正确码点；`combinations.test.mjs` 新增了以辞典真实词为判据的断言 |
| P1-3 | 引导跳过卡固定模式 | 5 步引导，**每一步点「跳过」后** `modeBtn.aria-pressed=false`、`randomBtn.disabled=false` |
| P1-4 | `--syl-scale` 残值 | 空词表占位符「—」、「组不出音节」、bareMark 三条路径全部 `scale=1`；固定模式 44×35 穷举 **scale 不符 0 处** |
| P1-5 | `o_implied` 泄漏进固定模式 | 脏 ls 写 `fixedVowelId='o_implied'` / `'none'` 均被白名单挡掉，卡片渲染成 `กอ`（`fixedVowelId` 归 null） |
| P1-6 | 换字体/主题后「常用词」禁用态丢失 | 固定模式下：初始 `disabled=true` → 换字体 `true` → 换主题 `true` |
| P1-7 | 长按吞掉其它字块的点击 | `chip()` 已改为 `btn === longPressBtn && Date.now() - longPressAt < 1000`（`app.js:283`） |
| P1-8 | 提示指向不存在的控件 | 现为「（组合范围切到「任意」即不限）」，指向的三档控件真实存在 |
| P2-9 | 词库缺失时虚假承诺 | 断网时 `rangeHint` = 「词库没加载出来：暂时按普通音节拼，联网后重开本页即可」 |
| P2-10 | 「全不选」刷新后丢失 | `load()` 已改用 `Array.isArray()`（`app.js:165-166`）；实测刷新后辅音 0/44、元音 0/35 正确保留 |
| P2-11 | 脏 `fixedOnset` 渲染乱码 | 已过白名单（`app.js:180-181`）；`'XYZ'` / XSS payload / 超长串全部被挡，卡片退回 `สวัสดี` |
| P2-12 | `romanize()` 抛异常 | `rules.js:535`、`:545` 已加兜底；210 万次 fuzz 中 `romanize` **0 异常**（残留的 89510 次异常全部来自 `check()`，见 B-1） |
| P2-13 | `.tone-hint` 被撑高 | 现为 `height: 4.5em`；穷举三档 × 两模式的最长提示 = **86 字**（固定/strict/`เ-็`），390px 下约 3 行 = 预留 3 行 |
| 新-A | 单文件版首屏误报「词库没加载出来」 | `updateDictHit()` 的 `.then()` 已补 `applyRangeHint()`（`app.js:965`）；实测数据内联 + 记住 `range='common'`，等 1.5s 后 `rangeHint` = 「只从常用词里取…」，**不再误报** |
| 新-C | 假簇路径跳过尾辅音去重 | `rules.js:540-548` 已把去重挪到假簇分支之前；穷举 `ทร / จร / ศร` × 全部元音 × 5 种尾辅音，**重复注音 0 处**（`ทราย = sai`、`จริง = jing`、`ศรี = si` 均正确） |

---

# 排查过但确认不是缺陷的项

记录一下，避免下次重复怀疑（本轮我自己就误报过其中 4 条，都是判据写错）：

- **`docs/` 与 `dist/` 产物内容不同** → **不是缺陷**。归一化文件名后逐字符比对，只差**生成时间戳的毫秒位**（`...46.460Z` vs `...46.513Z`，3 个字符），是同一次打包的两个输出。产物里也**没有残留外部引用**：唯一的非内联 `href` 是两个页面之间的相对跳转（`index.html` ↔ `tutorial.html`，`dist/` 里已正确换成中文名），这是设计如此。`PRACTICE_PAGE` 常量在 `dist/泰语教学.html` 里是 `'泰语组合练习.html'`、在 `docs/tutorial.html` 里是 `'index.html'`，**都正确**——`build-standalone.mjs:97` 用的是 `replaceAll(from, to)` 整串替换，覆盖到了 JS 里的字符串常量。
- **码点顺序错** → **没有**。穷举 123 万组合，「前引元音排在辅音之后」「spacing 元音排在声调符号之前」「声调符号排在上方元音之前」「出现两个声调符号」全部 **0 处**。
- **「出现两个 spacing 元音」22.9 万处** → **我的判据写错了**。`สระ เอาะ`（`o_short_open`）的 `tail` 本来就是 `าะ`（两个 spacing 字符连写），`เกาะ` `เลาะ` 是正确写法，不是错序。
- **「引擎角色序列有 45 种辞典里从未出现」** → **不是缺陷**，绝大部分是 `LCTSC` `LCSSC` 这类**辅音簇 + 尾辅音**的形态，辞典收的是真实词、不会穷举所有形态；引擎的职责是「保证码点顺序合法」，不是「只拼真实存在的词」（AGENTS.md:180 明确写了「引擎**不**判断组合是不是真实存在的泰语词」）。
- **「辞典里 14545 个 2~6 码点的词，引擎拼不出 10243 个（含 500 个常用词）」** → **不是缺陷**，绝大多数是**多音节词**（`กฎหมาย กรกฎาคม กระจก กระเป๋า การบ้าน`），引擎只拼单音节。常用词 2033 个里引擎能拼出 **561 个**，剩下 1472 个中 653 个长度 > 7 码点（多音节）、819 个是 `กระ- / การ- / -์` 这类单音节引擎不建模的形态（AGENTS.md:207-213「没收录的东西」已列明）。**「常用词」档实测命中率 100%**（9 种词表配置各 200 次，全部 200/200，fallback 0 次，最慢一档 200 次共 34ms），拒绝采样工作正常。
- **XSS** → **没有**。练习页 15 种脏/恶意 localStorage（含 `"><img src=x onerror=window.__PWNED__=1>`、`<script>`、`javascript:alert(1)` 写进 `theme`）、教学页搜索框 4 种 payload、`?q=` 与 `?word=` 两个查询串参数，全部实测：`window.__PWNED__` 为 `undefined`、新增 `<img>` / `<script>` 节点 **0 个**、内联事件属性 **0 处**。`?word=<img src=x onerror=alert(1)>` 会被原样当泰文显示（`textContent` 路径），`data-theme` 走白名单过滤。
- **`localStorage` 完全不可用**（`getItem`/`setItem` 都抛异常）→ 页面**不崩溃**：随机、切模式、点辅音全部可用，`save()`/`load()`/`endTour()`/`closeWhatsNew()` 的 try-catch 都生效。教学页 `readPrefs()`/`writePrefs()` 同理，6 种脏值下 `data-font`/`data-theme` 都退回默认、96 行照常渲染。
- **空格 / Enter 快捷键** → **正常**。我第一轮报「空格失效」是误报：测试时 `activeElement` 停在 `<body>` 之外导致 `keydown` 没走到。blur 后实测：body 上按空格换卡片 ✓、连按 5 次 ✓、Enter 触发 `speak()` 1 次 ✓、聚焦在 `<button>` 上按空格**不会**误触发随机（`app.js:1190` 排除了 BUTTON）✓。
- **教学页元音表只有 36 行（不是 37）** → **符合设计**。`rules.js` 的 `VOWELS` 有 37 个，其中 `internal` 组的「（无元音）」不在 `VOWEL_GROUPS` 里，`tutorial.js:147` 遍历 `VOWEL_GROUPS` 渲染，所以内部项不出现在教学页。93 行搜索索引 = 44 辅音 + 36 元音 + 8 尾音 + 5 声调，id `r1…r93` 连续无重复。
- **`toneOptions()` 与 `check()` 的自洽性** → 穷举 44 辅音 × 37 元音 × 5 声调 × 2 档 = **16280 组，0 处不自洽**。strict 档 `generate()` 6 万次产出，`check()` 报问题的 **0 处**。
- **高频点击与性能** → 练习页连点随机 500 次 **97ms**（0.19ms/次）；教学页连续搜索 300 次 **508ms**；引擎 20 万次 `generate+describe` **494ms**；常用词档最坏情况（辅音1+元音1）单次 **<1ms**，无卡顿、无状态竞争。
- **模式切换动画** → 往返 20 次异常 0 处；动画期间（150ms 内）连点 3 次、以及不等动画连点 12 次，结束后 `swapping` / `no-swap-anim` 类都已摘干净、computed `opacity=1`、UI 与 `localStorage.mode` 一致。`setMode()` 的 `clearTimeout + 立即 apply()` 逻辑（`app.js:476-480`）工作正常。
- **声调按钮禁用与原因** → 高辅音音节正确禁用 `๊ ๋`，提示文案指向真实控件；「任意」档 120 次随机，禁用按钮 **0 个**、规则类提示 **0 条**（不自相矛盾）。
- **朗读降级路径** → 有泰语语音时 `speak()` 正常调用（随机 5 次 + 点按钮 1 次 = 6 次）；无泰语语音 / 语音列表为空时 `speak()` **0 次调用**，页脚分别显示「未找到泰语语音，无法发音」与「加载中…」，不静默失败。
- **`?word=` 参数** → 长词（13 码点 `กระเป๋าสตางค์`）`scale=0.308`、超长垃圾串（30 个 `ก`）`scale=0.133`，都不崩、不溢出；辞典未收录的词（`สวัสดีครับ` `กรุงเทพมหานคร`）注音显示 `—`、真词行标「无义」——**这是正确降级**，不是 bug（这两个是多音节词，辞典按整词收录时确实没有对应条目）。`สวัสดี` / `ม้า` 的注音与释义都能正确带出。
- **教学页搜索的严格匹配** → 上一轮返工三次的那套规则**全部正确**：`ด` 只出 `ด`、`ไ` 只出 สระ ไอ（不被 `ไม่`/`ไต่` 带出）、`ต` 只出 `ตอ เต่า`、`k` 不带出 `kh`、`ขวด` 找得到 `ฃ`、`送气` 退到讲解档并说明一句。44 个辅音搜自己**全部命中**，所有有罗马注音的元音按注音搜自己**全部命中**。方向键回绕不越界（按 8 次 ↓ 后 active 落在第 1 项，在 0~5 范围内），`aria-activedescendant` 与实际高亮项一致，回车正好高亮 1 行。
- **`IntersectionObserver` 缺失** → 教学页正常降级（`tutorial.js:342` 有 `if (!('IntersectionObserver' in window)) return;`），目录 5 个链接照常渲染、96 行照常出、报错 0。
- **辞典数据自检** → 27522 条**无重复词头**；词性码全在白名单内（`n v adj adv pron num cls intj fn`）；`search()` 返回的每条都真以查询串开头（6 种前缀 × 20 条，前缀不符 **0 处**）；`nextBatch()` 连抽 400 批覆盖 2033 个常用词、30 批无重复、面板未加载时点「换一批」不崩。`toneFromIPA()` 在全库 13207 条带 IPA 的词上只解析失败 **1 条**（`แฟนอาร์ต` 的 IPA 字段是 `//`，数据本身的空值）。
- **`rng` 返回 `[0,1]` 区间外的数值**（`0` / `1` / `1.5` / `1e-12` / `0.9999999999`）→ `pick()` 的 `Math.min` 保护生效，不越界、不抛异常。**只有 `NaN` 和非数值会崩**（见 B-2）。
- **极端词表** → 10 组极端配置各 400 次，该返回 `null` 的都返回 `null`，界面给出「请先在词表里至少勾选一个辅音和一个元音」而不是崩溃。开关全开（辅音簇 + 尾辅音 + 元音充当声母 + 无元音符号 + 自动朗读）后随机 300 次，报错 **0**。

---

# 修复顺序建议

按「用户能不能感知 + 是不是教错东西」排序：

| 顺序 | 编号 | 一句话理由 |
| --- | --- | --- |
| 1 | **A-2** | 常用词档每 3 次有 1 次把 `วัว ตัว ตั๋ว` 的注音标错，卡片三行自相矛盾；而「常用词」档正是 README 承诺「每个都是真词」的那一档 |
| 2 | **A-1** | 教学页把长元音 `เ-ิ` 标成「短音」，同一页面上跟 `เธอ`（长音）自相矛盾；另有 8 个真词声调算错 |
| 3 | **D-1 / D-2** | 发版流程没走完（beta4 无标签），文档数字三处过期——改完 A-1/A-2 要重新发版，顺手一起处理 |
| 4 | **B-5** | 教学页搜索「页面上看得见的词搜不到」，功能可用但违反它自己的三档设计 |
| 5 | **B-4** | 无障碍属性缺失，一行代码能修 |
| 6 | **B-1 / B-2 / B-3** | 引擎健壮性，当前 UI 不可达，但 AGENTS.md 说要留给后端复用；B-1 与上一轮 P2-12 是同一类问题、上次漏修了一半 |
| 7 | **B-6** | 只影响 1~4 个辞典注音为空的边缘词，且改动会牵动一批注音断言，**可以放到最后或直接不修** |
| 8 | **D-3 / D-4 / D-5** | 纯文档，改起来没风险 |

## A-1 特别提醒

改 `e_closed.short` 之前**先对课本**。AGENTS.md:66 明确写了「元音数据带课本字段：`short`（长/短音）。改这些字段前先对一遍课本，测试里有逐条比对」，AGENTS.md:64 也写了发音讲解的口径要对齐《基础泰语（1）》。我给的判据是**辞典 IPA**（6/6 带 `ː`），这是外部证据、可信度高，但课本怎么归类只有你能核。

两种可能：
- 课本也把 `เ-ิ` 归长音 → 直接改 `short: false` + `VOWEL_IPA.e_closed = 'ɤː'`，本报告的建议成立。
- 课本把 `เ-ิ` 归在短音栏（因为它是「变体写法」） → 那 `short` 字段不该动，要动的是**声调规则**：`spokenTone()`（`rules.js:433-440`）在算音节死活时，对 `e_closed` 特殊处理成长元音。同时教学页 `tutorial.js:157` 的标签要单独处理（不能简单读 `v.short`），否则学员看到的仍是「短音」。

**不管哪种，教学页现在显示「短音」而 `เธอ` 显示「长音」这个自相矛盾必须消除。**

## 改完的发版清单（AGENTS.md:190-197）

1. `node --test web/` 全过 —— 加了新测试后项数会变，**记得同步 README:99 与 AGENTS.md:19**（或直接去掉具体数字，见 D-2）
2. 改过界面文案 → `node web/fonts/build-cjk-subset.mjs`
   - A-1 会让教学页标签从「短音」变「长音」，B-5 会改尾辅音标签文字，B-1/B-3 会新增 `check()` 的问题文案 —— **这几条都引入新汉字，必须重跑**
3. `node web/build-standalone.mjs`（同时写 `dist/` 和 `docs/`，不用手工 `cp`）
4. `index.html` 和 `tutorial.html` 里本地资源的 `?v=` 一起 +1（当前是 `?v=16`，改成 `17`）
   - AGENTS.md:192 记着这个坑：`dict.js` 加了函数没升版本号，页面拿旧文件、`dict.search` 不存在，教学页查词卡在「正在查词库…」
5. 更新 `README.md` 顶部版本号与版本历史；`WHATS_NEW.version`（`app.js:1401`）
   - **A-1 和 A-2 都属于「之前学到的内容是错的」这类修复**，按 AGENTS.md:195 必须升 `WHATS_NEW.version`，否则老用户不会知道要纠正
   - 建议 `items` 写：「修正 `เ-ิ` 的长短音标记（此前标成短音，实际是长音）」+「修正 `ัว` 类常用词（วัว ตัว รั้ว）偶发注音成 `wao/tao/rao` 的问题」
6. 提交 → `git push origin main` → **补 `beta4` 标签**（见 D-1）→ 等 Pages 状态变成 `built`
7. `pyproject.toml` 的版本号按 AGENTS.md:194 只在打新标签时动

## 改 A-2 / B-1 / B-3 后要跑的回归

这三条都动了规则引擎，`web/combinations.test.mjs` 的 **48 组选项矩阵**与固定模式全量会自动覆盖到（AGENTS.md:135 写了「加新开关或新元音后，这个矩阵会自动覆盖到，别绕过它」）。另外务必确认：

- `a_short`（ไม้หันอากาศ）在**任意辅音词表**下仍能生成音节 —— 它 `requiresFinal: true`，B-1 的 `bannedFinals` 过滤不能把它的可用尾辅音清空
- 改 `check()` 后，**固定模式 44 × 35 穷举**仍无空卡片、无脚本报错（本轮实测基线：空卡片 0、scale 不符 0、报错 0）
- 改 `romanize()`（B-6）后，重跑 `rules.test.mjs` 全部注音断言，并确认 A-2 那批 `ัว` 词的注音没被带坏

---

## 附：本轮验证的规模

| 项 | 数量 |
| --- | --- |
| 引擎穷举组合 | 1231200 |
| 辞典交叉验证词条 | 27522（可比对声调的合法单音节真词 7210） |
| 畸形输入 fuzz 调用 | 2100000（异常 89510，全部来自 `check()`） |
| UI 可达字符串去重 | 187690（其中 520 组有多拆法冲突） |
| 界面层随机点击 | 练习页 3000+ 次、教学页搜索 300 次 |
| 固定模式穷举 | 44 辅音 × 35 元音 × 5 声调 × 3 档 × 2 模式 |
| 脏 localStorage 用例 | 练习页 15 种 + 教学页 6 种 + 完全不可用 1 种 |
| 测试脚本 | `/tmp/twtest/` 下 A~L 共 10 个（临时目录，未写入项目依赖） |

> 测试脚本在 `/tmp/twtest/`（`A-rules.mjs` `B-rules2.mjs` `C-precise.mjs` `D-tone.mjs` `E-ui.mjs` `F-ui.mjs` `G-tutorial.mjs` `H-verify.mjs` `I-verify2.mjs` `J-final.mjs` `K-vowel.mjs` `L-ui2.mjs`，以及 jsdom harness `harness.mjs`）。`/tmp` 可能被系统清理；报告里每条缺陷都附了自包含的 `node -e` 复现命令，不依赖这些脚本。
