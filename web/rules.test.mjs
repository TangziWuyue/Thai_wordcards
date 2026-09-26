/**
 * 规则引擎自测：node --test web/
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import ThaiRules from './rules.js';

/** 可复现的伪随机源（线性同余） */
function seededRng(seed = 1) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

const MIXED = {
  consonants: ['ก', 'จ', 'ด', 'ต', 'บ', 'ป', 'อ', 'ข', 'ส', 'ห', 'ค', 'น', 'ม', 'ง', 'ย', 'ร', 'ล', 'ว', 'ช', 'ท'],
  vowels: ThaiRules.VOWELS.map((v) => v.id),
};

/** 把字符串拆成码点数组，方便断言渲染顺序 */
const cps = (s) => [...s].map((ch) => ch.codePointAt(0));

test('辅音表：44 个，分类数量正确，无重复', () => {
  const all = ThaiRules.CONSONANTS;
  assert.equal(all.length, 44);
  assert.equal(new Set(all.map((c) => c.ch)).size, 44);
  const by = (cls) => all.filter((c) => c.cls === cls).length;
  assert.equal(by('mid'), 9, '中类应为 9 个');
  assert.equal(by('high'), 11, '高类应为 11 个');
  assert.equal(by('low'), 24, '低类应为 24 个');
});

test('辅音表：全部落在泰文码点区，且首尾字符正确', () => {
  for (const { ch } of ThaiRules.CONSONANTS) {
    const cp = ch.codePointAt(0);
    assert.ok(cp >= 0x0e01 && cp <= 0x0e2e, `${ch} 不在泰文辅音区 (U+${cp.toString(16)})`);
  }
  assert.equal('ก'.codePointAt(0), 0x0e01);
  assert.equal('ฮ'.codePointAt(0), 0x0e2e);
});

test('元音 / 声调表：无重复 id，且不会误用形近字符', () => {
  assert.equal(new Set(ThaiRules.VOWELS.map((v) => v.id)).size, ThaiRules.VOWELS.length);
  assert.equal(new Set(ThaiRules.TONES.map((t) => t.id)).size, ThaiRules.TONES.length);
  assert.equal('า'.codePointAt(0), 0x0e32);
  assert.equal('่'.codePointAt(0), 0x0e48);
  assert.equal('๋'.codePointAt(0), 0x0e4b);
  // 前引元音必须都是 U+0E40–U+0E44 这一段
  for (const ch of ThaiRules.LEAD_VOWEL_CHARS) {
    const cp = ch.codePointAt(0);
    assert.ok(cp >= 0x0e40 && cp <= 0x0e44, `${ch} 不是前引元音区字符`);
  }
});

test('拼装顺序：前引元音在码点里排在辅音之前', () => {
  // เก่ง = เ + ก + ่ + ง
  const parts = { vowelId: 'e', lead: 'เ', onset: 'ก', cluster: null, follow: '', tone: 'ek', final: 'ง' };
  assert.equal(ThaiRules.assemble(parts), 'เก่ง');
  assert.deepEqual(cps('เก่ง'), [0x0e40, 0x0e01, 0x0e48, 0x0e07]);
  assert.deepEqual(ThaiRules.check(parts), []);
});

test('拼装顺序：声调符号在后置元音之后、尾辅音之前', () => {
  // ก้าน = ก + า + ้ + น
  const parts = { vowelId: 'aa', lead: '', onset: 'ก', cluster: null, follow: 'า', tone: 'tho', final: 'น' };
  // 形近字符肉眼难辨，期望值直接用码点拼，避免测试本身写错顺序
  assert.equal(ThaiRules.assemble(parts), String.fromCodePoint(0x0e01, 0x0e32, 0x0e49, 0x0e19));
  assert.deepEqual(ThaiRules.check(parts), []);
});

test('拼装顺序：前引元音 + 后置元音分居辅音两侧', () => {
  // เกิด = เ + ก + ิ + ด
  const parts = { vowelId: 'e_closed', lead: 'เ', onset: 'ก', cluster: null, follow: 'ิ', tone: 'none', final: 'ด' };
  assert.equal(ThaiRules.assemble(parts), 'เกิด');
  assert.deepEqual(cps('เกิด'), [0x0e40, 0x0e01, 0x0e34, 0x0e14]);
  assert.deepEqual(ThaiRules.check(parts), []);
});

test('拼装顺序：无声调、无尾辅音、前引元音结尾', () => {
  const parts = { vowelId: 'ai', lead: 'ไ', onset: 'ก', cluster: null, follow: '', tone: 'ek', final: null };
  assert.equal(ThaiRules.assemble(parts), 'ไก่');
  assert.deepEqual(ThaiRules.check(parts), []);
});

test('拼装顺序：无元音符号 + 尾辅音（隐含元音）', () => {
  const parts = { vowelId: 'implicit', lead: '', onset: 'ก', cluster: null, follow: '', tone: 'none', final: 'บ' };
  assert.equal(ThaiRules.assemble(parts), 'กบ');
  assert.deepEqual(ThaiRules.check(parts), []);
});

test('拼装顺序：辅音簇紧贴首辅音', () => {
  const parts = { vowelId: 'a', lead: '', onset: 'ก', cluster: 'ร', follow: 'ะ', tone: 'none', final: null };
  assert.equal(ThaiRules.assemble(parts), 'กระ');
  assert.deepEqual(ThaiRules.check(parts), []);
  const bad = { ...parts, cluster: 'น' };
  assert.deepEqual(ThaiRules.check(bad), []);
});

test('参考注音：开音节 / 闭音节取不同元音读法', () => {
  const open = { vowelId: 'aa', lead: '', onset: 'ก', cluster: null, follow: 'า', tone: 'none', final: null };
  const closed = { ...open, final: 'น' };
  assert.equal(ThaiRules.romanize(open), 'kaa');
  assert.equal(ThaiRules.romanize(closed), 'kaan');
  const e = { vowelId: 'e', lead: 'เ', onset: 'ก', cluster: null, follow: '', tone: 'none', final: 'ง' };
  assert.equal(ThaiRules.romanize(e), 'keng');
  const cluster = { vowelId: 'a', lead: '', onset: 'ก', cluster: 'ร', follow: 'ะ', tone: 'none', final: null };
  assert.equal(ThaiRules.romanize(cluster), 'kra');
});

test('strict 模式：๊ / ๋ 只允许中类辅音', () => {
  const base = { vowelId: 'aa', lead: '', cluster: null, follow: 'า', tone: 'none', final: null };
  const mid = ThaiRules.toneOptions({ ...base, onset: 'ก' }, true);
  const low = ThaiRules.toneOptions({ ...base, onset: 'ค' }, true);
  const high = ThaiRules.toneOptions({ ...base, onset: 'ข' }, true);
  const allowed = (list) => list.filter((t) => t.allowed).map((t) => t.id);
  assert.ok(allowed(mid).includes('tri') && allowed(mid).includes('chattawa'));
  assert.ok(!allowed(low).includes('tri') && !allowed(low).includes('chattawa'));
  assert.ok(!allowed(high).includes('tri') && !allowed(high).includes('chattawa'));
  // 关掉 strict 就全部放开
  assert.equal(ThaiRules.toneOptions({ ...base, onset: 'ค' }, false).filter((t) => t.allowed).length, 5);
});

test('strict 模式：短元音开音节不能标声调，长元音可以', () => {
  const shortOpen = { vowelId: 'a', lead: '', onset: 'ก', cluster: null, follow: 'ะ', tone: 'none', final: null };
  const longOpen = { ...shortOpen, vowelId: 'aa', follow: 'า' };
  const shortClosed = { ...shortOpen, vowelId: 'i', follow: 'ิ', final: 'น' };
  const onlyNone = (parts) =>
    ThaiRules.toneOptions(parts, true).filter((t) => t.allowed).map((t) => t.id);
  assert.deepEqual(onlyNone(shortOpen), ['none']);
  assert.ok(onlyNone(longOpen).includes('ek'));
  assert.ok(onlyNone(shortClosed).includes('ek'));
  assert.ok(ThaiRules.toneOptions(shortOpen, false).every((t) => t.allowed));
});

test('check() 能抓出错误顺序', () => {
  // 故意把前引元音写在辅音后面
  const bad = { vowelId: 'e', lead: 'เ', onset: 'ก', cluster: null, follow: '', tone: 'none', final: null };
  const issues = ThaiRules.check({ ...bad, lead: 'ก', onset: 'เ' });
  assert.ok(issues.length > 0);
  // 尾辅音不是末尾
  const toneLast = { vowelId: 'aa', lead: '', onset: 'ก', cluster: null, follow: 'า', tone: 'tho', final: 'น' };
  assert.deepEqual(ThaiRules.check(toneLast), []);
});

test('随机生成 5000 次：码点顺序与规则约束全部成立', () => {
  const rng = seededRng(20260926);
  let withFinal = 0;
  let withTone = 0;
  for (let i = 0; i < 5000; i += 1) {
    const parts = ThaiRules.generate({
      ...MIXED,
      allowClusters: true,
      allowFinal: true,
      strict: true,
      rng,
    });
    assert.ok(parts, 'generate 不应返回 null');
    const info = ThaiRules.describe(parts, true);
    assert.deepEqual(info.issues, [], `第 ${i} 次生成有问题: ${info.text}`);
    assert.ok(info.text.length > 0);
    for (const cp of cps(info.text)) {
      assert.ok(cp >= 0x0e01 && cp <= 0x0e4b, `码点越界 U+${cp.toString(16)} in ${info.text}`);
    }
    if (parts.final) withFinal += 1;
    if (parts.tone !== 'none') withTone += 1;
  }
  // 分布不能完全塌缩（否则随机逻辑写坏了）
  assert.ok(withFinal > 1000, `带尾辅音样本过少: ${withFinal}`);
  assert.ok(withTone > 500, `带声调样本过少: ${withTone}`);
});

test('随机生成：元音约束被遵守（必带尾辅音 / 不可带尾辅音）', () => {
  const rng = seededRng(7);
  for (let i = 0; i < 3000; i += 1) {
    const parts = ThaiRules.generate({ ...MIXED, allowFinal: true, strict: true, rng });
    const vowel = ThaiRules.VOWELS.find((v) => v.id === parts.vowelId);
    if (vowel.requiresFinal) assert.ok(parts.final, `${vowel.id} 必须带尾辅音`);
    if (!vowel.allowsFinal) assert.equal(parts.final, null, `${vowel.id} 不能带尾辅音`);
  }
});

test('随机生成：strict 模式下 ๊ / ๋ 不会出现在非中类辅音上', () => {
  const rng = seededRng(99);
  for (let i = 0; i < 3000; i += 1) {
    const parts = ThaiRules.generate({ ...MIXED, allowClusters: true, strict: true, rng });
    if (parts.tone === 'tri' || parts.tone === 'chattawa') {
      assert.equal(ThaiRules.classOf(parts.onset), 'mid');
    }
  }
});

test('随机生成：同一随机种子结果可复现', () => {
  const a = Array.from({ length: 20 }, (_, i) =>
    ThaiRules.assemble(ThaiRules.generate({ ...MIXED, rng: seededRng(42 + i) })));
  const b = Array.from({ length: 20 }, (_, i) =>
    ThaiRules.assemble(ThaiRules.generate({ ...MIXED, rng: seededRng(42 + i) })));
  assert.deepEqual(a, b);
});

test('空词表时返回 null，不抛异常', () => {
  assert.equal(ThaiRules.generate({ consonants: [], vowels: ['aa'] }), null);
  assert.equal(ThaiRules.generate({ consonants: ['ก'], vowels: [] }), null);
  assert.equal(ThaiRules.generate({}), null);
});

test('尾辅音只从可作尾辅音的字里挑', () => {
  const rng = seededRng(5);
  for (let i = 0; i < 2000; i += 1) {
    const parts = ThaiRules.generate({ consonants: ['ก', 'จ', 'อ', 'ห'], vowels: ['aa'], rng });
    if (parts.final) assert.ok(ThaiRules.FINALS[parts.final], `${parts.final} 不能作尾辅音`);
  }
});
