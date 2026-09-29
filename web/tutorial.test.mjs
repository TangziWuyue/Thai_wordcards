/**
 * 教学页自测。
 *
 * 教学页最容易出的问题不是代码，是**讲解和数据对不上**：
 * 少写一个字母的讲解、表里写「第 4 调」但其实读第 3 调、声调符号写错。
 * 所以这里逐条比：44 个辅音、32 个元音 + 4 个变体都要有讲解，
 * 声调规则表的每一格都要能跑出它标的那一调。
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const R = require('./rules.js');
const D = require('./tutorial-data.js');
const S = require('./tutorial-search.js');

/** 拼一个用于测试的 parts */
const parts = (vowelId, onset, extra = {}) => ({
  onset, cluster: null, vowelId, tone: 'none', final: null, ...extra,
});

test('教学页：44 个辅音每一个都有发音讲解', () => {
  const missing = R.CONSONANTS.filter((c) => !D.SAY_CONS[c.ch]).map((c) => c.ch);
  assert.deepEqual(missing, [], `这些字母没有讲解：${missing.join(' ')}`);
  // 反过来也别留孤儿：写了讲解但没有这个字母，说明名单抄错了
  const known = new Set(R.CONSONANTS.map((c) => c.ch));
  const extra = Object.keys(D.SAY_CONS).filter((ch) => !known.has(ch));
  assert.deepEqual(extra, []);
  assert.equal(Object.keys(D.SAY_CONS).length, 44);
});

test('教学页：32 个元音 + 4 个变体每一个都有发音讲解', () => {
  // 内部项（none）不上教学页，其余全部要有讲解
  const need = R.VOWELS.filter((v) => !v.internal);
  const missing = need.filter((v) => !D.SAY_VOWEL[v.id]).map((v) => `${v.id}(${v.name})`);
  assert.deepEqual(missing, [], `这些元音没有讲解：${missing.join(', ')}`);
  const known = new Set(need.map((v) => v.id));
  const extra = Object.keys(D.SAY_VOWEL).filter((id) => !known.has(id) && id !== 'none');
  assert.deepEqual(extra, []);
});

test('教学页：8 种尾辅音读音都有讲解，合起来正好是全部尾辅音字母', () => {
  const sounds = Object.keys(R.FINAL_GROUPS);
  assert.deepEqual(sounds, ['k', 't', 'p', 'n', 'ng', 'm', 'y', 'w']);
  for (const sound of sounds) {
    assert.ok(D.SAY_FINAL[sound], `尾音 -${sound} 没有讲解`);
    assert.ok(D.FINAL_EXAMPLES[sound], `尾音 -${sound} 没有例词`);
  }
  // 44 个辅音里，能当尾音的那些应该正好等于 8 组字母的并集
  const inGroups = new Set(sounds.flatMap((s) => R.FINAL_GROUPS[s]));
  const fromTable = new Set(Object.keys(R.FINALS));
  assert.deepEqual([...inGroups].sort(), [...fromTable].sort());
  assert.equal(inGroups.size, 37);
  // 不能当尾音的 7 个字母，正好是差集
  const cannot = R.CONSONANTS.filter((c) => !R.FINALS[c.ch]).map((c) => c.ch);
  assert.equal(cannot.length, 7);
});

test('教学页：声调规则表每一格都跟 spokenTone() 对得上', () => {
  const failures = [];
  // 列的次序跟 TONE_COLS 一一对应：前两列不写符号，后四列是 ่ ้ ๊ ๋
  const COL_TONE = ['none', 'none', 'ek', 'tho', 'tri', 'chattawa'];
  for (const rule of D.TONE_RULES) {
    const onset = D.CLS_PROBE[rule.cls];
    // 类别探针的类别要对得上，不然整张表都在验错东西
    assert.equal(R.classOf(onset), rule.cls, `探针 ${onset} 不是 ${rule.cls} 类`);
    for (const [i, cell] of rule.cells.entries()) {
      for (const item of cell) {
        if (!item.sample) {
          // 空的一格：必须是真的算不出声调（比如高/低类配 ๊ ๋），不能是懒得填
          const probe = parts('aa', onset, { tone: COL_TONE[i] });
          const got = R.spokenTone(probe);
          if (got !== null) failures.push(`${rule.label} · ${D.TONE_COLS[i]}：标着用不了，实际算出第 ${got} 调`);
          continue;
        }
        const got = R.spokenTone(parts(item.sample.vowelId, onset, {
          tone: item.sample.tone || 'none',
          final: item.sample.final || null,
        }));
        if (got !== item.n) {
          failures.push(`${rule.label} · ${D.TONE_COLS[i]}：表上写第 ${item.n} 调，算出来第 ${got} 调`);
        }
      }
    }
  }
  assert.deepEqual(failures, []);
});

test('教学页：五个声调的例词读出来的调，跟表上写的调一致', () => {
  // 手写「例词 → 第几调」，跟上面那张表用同一套规则验，防止换个词就写错
  const CASES = [
    [1, 'มา', parts('aa', 'ม')],
    [2, 'ไก่', parts('ai', 'ก', { tone: 'ek' })],
    [3, 'ต้ม', parts('o_short', 'ต', { tone: 'tho', final: 'ม' })],
    [4, 'ค้า', parts('aa', 'ค', { tone: 'tho' })],
    [5, 'ขา', parts('aa', 'ข')],
  ];
  for (const [n, word, probe] of CASES) {
    assert.equal(R.spokenTone(probe), n, `${word} 应该读第 ${n} 调`);
    const ex = D.TONE_EXAMPLE[n];
    assert.ok(ex && ex.gloss, `第 ${n} 调没有例词`);
  }
});

test('教学页：音节拆解的三个例子拼出来跟页面上写的一样', () => {
  const built = D.ANATOMY.map((spec) => {
    const p = { ...R.fixedParts({ onset: spec.onset, vowelId: spec.vowelId }), ...spec.patch };
    return [R.assemble(p), R.romanize(p)];
  });
  assert.deepEqual(built, [
    ['มา', 'ma'],
    ['ม้า', 'ma'],
    ['นก', 'nok'],
  ]);
  // 拆解里写的「读第几调」也要对
  assert.equal(R.spokenTone({ ...R.fixedParts({ onset: 'ม', vowelId: 'aa' }), tone: 'tho' }), 4);
});

test('教学页：页面上的说明不会指向不存在的控件或数据', () => {
  // 声调表只列 1~5，且都有中文名（页面直接读它渲染）
  for (const n of [1, 2, 3, 4, 5]) {
    assert.ok(R.SPOKEN_TONES[n], `SPOKEN_TONES 里缺第 ${n} 调`);
    assert.ok(D.TONE_HOW[n] && D.TONE_EXAMPLE[n], `第 ${n} 调缺说明或例词`);
  }
  assert.equal(D.TONE_COLS.length, 6, '声调规则表应该是 6 列：不写符号 ×2 + 四个符号');
  // 每个辅音的「名称」是靠「字母 + อ + 例词」拼出来的，例词缺了就会渲染成「กอ 」
  for (const c of R.CONSONANTS) {
    assert.ok(c.example, `${c.ch} 没有传统例词，教学页的名称会空一截`);
  }
});

test('教学页：发音讲解按《基础泰语（1）》的口径，别改回英语类比', () => {
  // 这几条是照课本第 10、36、45、55 页改过来的，改回去就是又跟课本对不上了
  assert.match(D.SAY_CONS['จ'], /汉语拼音 z/, 'จ 课本对标汉语拼音 z，不是 j');
  assert.match(D.SAY_CONS['ฉ'], /汉语拼音 c/, 'ฉ 课本对标汉语拼音 c，不是 q');
  assert.match(D.SAY_VOWEL.ue, /汉语拼音 e/, 'อึ 课本对标汉语拼音 e');
  assert.match(D.SAY_VOWEL.e_short, /没有对应/, 'เอ 系列课本说汉语里没有对应音');
  assert.match(D.SAY_VOWEL.ae_short, /没有对应/, 'แอ 系列同上');
  assert.match(D.SAY_VOWEL.uea, /没有对应/, 'เอือ 课本说汉语里没有对应音');
  // 高辅音的名称是第五声调，低辅音里跟高辅音同音的那些要说明「名称读第一声调」
  for (const ch of ['ข', 'ฉ', 'ถ', 'ผ', 'ฝ', 'ส', 'ห']) {
    assert.match(D.SAY_CONS[ch], /声调/, `${ch} 是高辅音，讲解里要提声调`);
  }
  for (const ch of ['ค', 'ช', 'ท', 'พ', 'ฟ', 'ฮ', 'ฬ']) {
    assert.match(D.SAY_CONS[ch], /第一声调/, `${ch} 要说明名称读第一声调`);
  }
  // 尾辅音改用课本术语：清尾 / 浊尾
  assert.match(D.SAY_FINAL.k, /喉咙/);
  assert.match(D.SAY_FINAL.ng, /鼻/);
});

// ── 搜索：这一块返工过三次，规则写死在这里，改坏了直接红 ──────────────────
/** 用真实数据建一份索引，跟页面上渲染出来的那一份同构 */
function buildIndex() {
  const idx = [];
  const push = (info, section) => idx.push(S.makeEntry(info, section));
  for (const c of R.CONSONANTS) {
    push({
      glyph: c.ch,
      name: `${c.ch}อ ${c.example}`,
      roman: c.roman,
      tags: [R.CLASS_LABEL[c.cls], c.rare ? '借词用字' : '', c.obsolete ? '已废弃' : ''].filter(Boolean),
      extra: `${c.example} ${c.gloss || ''}`,
      text: D.SAY_CONS[c.ch],
    }, '辅音');
  }
  for (const v of R.VOWELS.filter((x) => !x.internal)) {
    const form = `${v.lead || ''}${v.follow || ''}${v.tail || ''}`;
    push({
      glyph: form || '无',
      name: v.name,
      roman: v.roman,
      tags: [v.short ? '短音' : '长音', v.noTone ? '不写声调' : '', v.requiresFinal ? '必须有尾音' : ''].filter(Boolean),
      extra: v.example || '',
      text: D.SAY_VOWEL[v.id] || '',
    }, '元音');
  }
  for (const sound of ['k', 't', 'p', 'n', 'ng', 'm', 'y', 'w']) {
    push({
      glyph: `-${sound}`,
      name: `尾音 -${sound}`,
      roman: `-${sound}`,
      tags: [R.FINALS[R.FINAL_GROUPS[sound][0]].sonorant ? '清尾辅音 · 活音节' : '浊尾辅音 · 死音节'],
      extra: `${R.FINAL_GROUPS[sound].join(' ')} ${D.FINAL_EXAMPLES[sound].word}`,
      text: D.SAY_FINAL[sound],
    }, '尾辅音');
  }
  for (const n of [1, 2, 3, 4, 5]) {
    push({
      glyph: n === 1 ? '—' : `อ${D.TONE_SIGN[n]}`,
      name: `第 ${n} 调 · ${R.SPOKEN_TONES[n].zh}`,
      roman: R.SPOKEN_TONES[n].thai,
      tags: [`第 ${n} 调`],
      extra: `${D.TONE_EXAMPLE[n].word} ${D.TONE_EXAMPLE[n].roman}`,
      text: D.TONE_HOW[n],
    }, '声调');
  }
  return idx;
}

const glyphsOf = (res) => res.list.map((i) => i.glyph);

test('搜索：泰文只认「字形里有这个字」或「整词相等」，不按词里包含算', () => {
  const idx = buildIndex();
  // 判据：出来的每一行，**字形里都真的写着这个字**，而不是「某个词里凑巧有它」
  const onlyIfGlyphHas = (q, extra) => {
    const res = S.findMatches(idx, q);
    const bad = res.list.filter((i) => !i.glyph.includes(q));
    assert.deepEqual(bad.map((i) => `${i.glyph}(${i.name})`), [], `搜 ${q} 不该出这些行`);
    if (extra) assert.deepEqual(glyphsOf(res), extra, `搜 ${q} 的结果`);
  };
  // 用户报的三个：ไ 被 ไม้… 带出来、ต 被 ไต่/ตรี/จัตวา 带出来、ม 被 ไม้/สามัญ 带出来
  onlyIfGlyphHas('ไ', ['ไ']);
  onlyIfGlyphHas('ต', ['ต']);
  onlyIfGlyphHas('ม', ['ม']);
  onlyIfGlyphHas('ฎ', ['ฎ']);
  onlyIfGlyphHas('ฏ', ['ฏ']);
  // ั 除了 ไม้หันอากาศ，还会带出 อัว / อัวะ —— 因为它们的字形（ัว）里真的写着 ั，这个算合理
  const a = S.findMatches(idx, 'ั');
  assert.equal(a.list[0].glyph, 'ั', '字形完全相同的排第一');
});

test('搜索：字母名整词相等仍然能查到', () => {
  const idx = buildIndex();
  assert.deepEqual(glyphsOf(S.findMatches(idx, 'กอ')), ['ก'], '搜 กอ 出 ก');
  assert.deepEqual(glyphsOf(S.findMatches(idx, 'ไม้หันอากาศ')), ['ั'], '搜全名出 ไม้หันอากาศ');
  // 辅音的名称里带着例词（ฃอ ขวด），所以例词也算「名称的一部分」，进第一档
  assert.deepEqual(glyphsOf(S.findMatches(idx, 'ขวด')), ['ฃ'], '搜例词 ขวด 出 ฃ');
  // 元音表的例词只写在「例词」那一栏，所以要退一档才找得到
  const byExample = S.findMatches(idx, 'มา');
  assert.equal(byExample.tier, 'name');
  // มา 既是 สระ อา 的例词，也是第 1 调的例词，两个都该出
  assert.deepEqual(glyphsOf(byExample), ['า', '—'], '搜例词 มา 出 สระ อา 与第 1 调');
});

test('搜索：拉丁注音要整词相等，k 不该带出 kh', () => {
  const idx = buildIndex();
  const k = S.findMatches(idx, 'k');
  assert.ok(k.list.every((i) => i.roman === 'k'), `搜 k 只能出注音正好是 k 的行，实际：${k.list.map((i) => i.roman)}`);
  const kh = S.findMatches(idx, 'kh');
  assert.ok(kh.list.length >= 4 && kh.list.every((i) => i.roman === 'kh'), '搜 kh 出注音为 kh 的那几个');
  // 数字：第 1 调
  assert.deepEqual(glyphsOf(S.findMatches(idx, '1')), ['—'], '搜 1 出第 1 调');
});

test('搜索：中文按包含匹配，找不到才退到「讲解里提到」并标出来', () => {
  const idx = buildIndex();
  const short = S.findMatches(idx, '短音');
  assert.equal(short.tier, 'strict');
  assert.ok(short.list.length >= 8, '短音这一档应该有不少行');
  // 「送气」不在任何行的名称/标签里，只在讲解正文里 → 退到最后一档
  const asp = S.findMatches(idx, '送气');
  assert.equal(asp.tier, 'loose');
  assert.ok(asp.list.length >= 5);
  // 空格分开的词要全部命中
  const both = S.findMatches(idx, '辅音 送气');
  assert.equal(both.tier, 'loose');
  assert.ok(both.list.every((i) => i.section === '辅音'), '「辅音 送气」只应出辅音那一节');
});
