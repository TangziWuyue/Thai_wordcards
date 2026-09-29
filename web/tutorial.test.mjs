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
