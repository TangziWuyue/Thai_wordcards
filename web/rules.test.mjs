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
  // 全部非废弃辅音 + 全部元音
  consonants: ThaiRules.CONSONANTS.filter((c) => !c.obsolete).map((c) => c.ch),
  vowels: ThaiRules.VOWELS.map((v) => v.id),
};

/** 只给 parts 的关键字段，元音的各段位置由元音表决定 */
function parts(vowelId, onset, extra = {}) {
  return { vowelId, onset, cluster: null, tone: 'none', final: null, ...extra };
}

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
  const p = parts('e', 'ก', { tone: 'ek', final: 'ง' });
  assert.equal(ThaiRules.assemble(p), 'เก่ง');
  assert.deepEqual(cps('เก่ง'), [0x0e40, 0x0e01, 0x0e48, 0x0e07]);
  assert.deepEqual(ThaiRules.check(p), []);
});

test('拼装顺序：声调符号在元音前段之后、尾辅音之前', () => {
  // ก้าน = ก + า + ้ + น
  const p = parts('aa', 'ก', { tone: 'tho', final: 'น' });
  // 形近字符肉眼难辨，期望值直接用码点拼，避免测试本身写错顺序
  assert.equal(ThaiRules.assemble(p), String.fromCodePoint(0x0e01, 0x0e32, 0x0e49, 0x0e19));
  assert.deepEqual(ThaiRules.check(p), []);
});

test('拼装顺序：前引元音 + 后置元音分居辅音两侧', () => {
  // เกิด = เ + ก + ิ + ด
  const p = parts('e_closed', 'ก', { final: 'ด' });
  assert.equal(ThaiRules.assemble(p), 'เกิด');
  assert.deepEqual(cps('เกิด'), [0x0e40, 0x0e01, 0x0e34, 0x0e14]);
  assert.deepEqual(ThaiRules.check(p), []);
});

test('拼装顺序：无声调、无尾辅音、前引元音结尾', () => {
  const p = parts('ai', 'ก', { tone: 'ek' });
  assert.equal(ThaiRules.assemble(p), 'ไก่');
  assert.deepEqual(ThaiRules.check(p), []);
});

test('拼装顺序：无元音符号 + 尾辅音（隐含元音）', () => {
  const p = parts('implicit', 'ก', { final: 'บ' });
  assert.equal(ThaiRules.assemble(p), 'กบ');
  assert.deepEqual(ThaiRules.check(p), []);
});

test('拼装顺序：辅音簇紧贴首辅音', () => {
  const p = parts('a', 'ก', { cluster: 'ร' });
  assert.equal(ThaiRules.assemble(p), 'กระ');
  assert.deepEqual(ThaiRules.check(p), []);
});

test('参考注音：开音节 / 闭音节取不同元音读法', () => {
  const open = parts('aa', 'ก');
  const closed = { ...open, final: 'น' };
  assert.equal(ThaiRules.romanize(open), 'kaa');
  assert.equal(ThaiRules.romanize(closed), 'kaan');
  const e = parts('e', 'ก', { final: 'ง' });
  assert.equal(ThaiRules.romanize(e), 'keng');
  const cluster = parts('a', 'ก', { cluster: 'ร' });
  assert.equal(ThaiRules.romanize(cluster), 'kra');
});

test('strict 模式：๊ / ๋ 只允许中类辅音', () => {
  const mid = ThaiRules.toneOptions(parts('aa', 'ก'), true);
  const low = ThaiRules.toneOptions(parts('aa', 'ค'), true);
  const high = ThaiRules.toneOptions(parts('aa', 'ข'), true);
  const allowed = (list) => list.filter((t) => t.allowed).map((t) => t.id);
  assert.ok(allowed(mid).includes('tri') && allowed(mid).includes('chattawa'));
  assert.ok(!allowed(low).includes('tri') && !allowed(low).includes('chattawa'));
  assert.ok(!allowed(high).includes('tri') && !allowed(high).includes('chattawa'));
  // 关掉 strict 就全部放开
  assert.equal(ThaiRules.toneOptions(parts('aa', 'ค'), false).filter((t) => t.allowed).length, 5);
});

test('strict 模式：็ 类元音不写声调符号，其它元音可以', () => {
  const onlyNone = (p) => ThaiRules.toneOptions(p, true).filter((t) => t.allowed).map((t) => t.id);
  assert.deepEqual(onlyNone(parts('e_taikhu', 'ก', { final: 'ง' })), ['none']);
  assert.ok(onlyNone(parts('a', 'ก')).includes('ek'), 'ะ 能标声调（如 จ๊ะ）');
  assert.ok(onlyNone(parts('i', 'ก', { final: 'น' })).includes('ek'));
  assert.ok(ThaiRules.toneOptions(parts('e_taikhu', 'ก', { final: 'ง' }), false).every((t) => t.allowed));
});

test('check() 能抓出错误顺序', () => {
  // 故意把前引元音写在辅音后面
  const bad = { vowelId: 'e', onset: 'เ', cluster: null, tone: 'none', final: null };
  assert.ok(ThaiRules.check(bad).length > 0);
  // 元音不匹配 parts 时也要报出来
  const mismatched = { vowelId: 'a', onset: 'ก', cluster: null, tone: 'none', final: null };
  assert.deepEqual(ThaiRules.check(mismatched), []);
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
    const p = ThaiRules.generate({ consonants: ['ก', 'จ', 'อ', 'ห'], vowels: ['aa'], rng });
    if (p.final) assert.ok(ThaiRules.FINALS[p.final], `${p.final} 不能作尾辅音`);
  }
});

// ── 元音后段（声调符号写在它前面）─────────────────────────────────────

test('尾辅音表：44 个辅音里只有 ฃ ฅ ผ ฝ ห อ ฮ 不能作尾辅音', () => {
  const cannot = ['ฃ', 'ฅ', 'ผ', 'ฝ', 'ห', 'อ', 'ฮ'];
  for (const { ch } of ThaiRules.CONSONANTS) {
    const canBeFinal = !cannot.includes(ch);
    assert.equal(!!ThaiRules.FINALS[ch], canBeFinal, `${ch} 的尾辅音判定不对`);
  }
  // 读音归类抽查
  assert.equal(ThaiRules.FINALS['ง'].roman, 'ng');
  assert.equal(ThaiRules.FINALS['ร'].roman, 'n');
  assert.equal(ThaiRules.FINALS['ล'].roman, 'n');
  assert.equal(ThaiRules.FINALS['ญ'].roman, 'n');
  assert.equal(ThaiRules.FINALS['จ'].roman, 't');
  assert.equal(ThaiRules.FINALS['ศ'].roman, 't');
  assert.equal(ThaiRules.FINALS['ภ'].roman, 'p');
  assert.equal(ThaiRules.FINALS['ว'].roman, 'w');
  assert.equal(ThaiRules.FINALS['ม'].sonorant, true);
  assert.equal(ThaiRules.FINALS['ก'].sonorant, false);
});

test('元音后段：声调符号写在 ำ / ะ / า / อ 之前', () => {
  // น้ำ = น + ้ + ำ
  assert.equal(ThaiRules.assemble(parts('am', 'น', { tone: 'tho' })), String.fromCodePoint(0x0e19, 0x0e49, 0x0e33));
  assert.deepEqual(ThaiRules.check(parts('am', 'น', { tone: 'tho' })), []);
  // จ๊ะ = จ + ๊ + ะ
  assert.equal(ThaiRules.assemble(parts('a', 'จ', { tone: 'tri' })), String.fromCodePoint(0x0e08, 0x0e4a, 0x0e30));
  // โต๊ะ = โ + ต + ๊ + ะ
  assert.equal(ThaiRules.assemble(parts('o_short', 'ต', { tone: 'tri' })), String.fromCodePoint(0x0e42, 0x0e15, 0x0e4a, 0x0e30));
  // เปล่า = เ + ป + ล + ่ + า
  assert.equal(ThaiRules.assemble(parts('ao', 'ป', { cluster: 'ล', tone: 'ek' })),
    String.fromCodePoint(0x0e40, 0x0e1b, 0x0e25, 0x0e48, 0x0e32));
  // เก้อ = เ + ก + ้ + อ
  assert.equal(ThaiRules.assemble(parts('oe', 'ก', { tone: 'tho' })), String.fromCodePoint(0x0e40, 0x0e01, 0x0e49, 0x0e2d));
  // เก๊ะ = เ + ก + ๊ + ะ
  assert.equal(ThaiRules.assemble(parts('e_short', 'ก', { tone: 'tri' })), String.fromCodePoint(0x0e40, 0x0e01, 0x0e4a, 0x0e30));
});

test('元音后段：ัว 的 ั 在带尾辅音时消失', () => {
  // ตัว = ต + ั + ว
  assert.equal(ThaiRules.assemble(parts('ua', 'ต')), String.fromCodePoint(0x0e15, 0x0e31, 0x0e27));
  // ตั๋ว = ต + ั + ๋ + ว
  assert.equal(ThaiRules.assemble(parts('ua', 'ต', { tone: 'chattawa' })),
    String.fromCodePoint(0x0e15, 0x0e31, 0x0e4b, 0x0e27));
  // สวย = ส + ว + ย（ั 消失）
  assert.equal(ThaiRules.assemble(parts('ua', 'ส', { final: 'ย' })), String.fromCodePoint(0x0e2a, 0x0e27, 0x0e22));
  // ช่วง = ช + ่ + ว + ง
  assert.equal(ThaiRules.assemble(parts('ua', 'ช', { tone: 'ek', final: 'ง' })),
    String.fromCodePoint(0x0e0a, 0x0e48, 0x0e27, 0x0e07));
  for (const p of [parts('ua', 'ต'), parts('ua', 'ส', { final: 'ย' }), parts('ua', 'ช', { tone: 'ek', final: 'ง' })]) {
    assert.deepEqual(ThaiRules.check(p), []);
  }
});

test('元音后段：เ-ีย / เ-ือ 的声调写在元音前段与尾段之间', () => {
  // เสี้ยว = เ + ส + ี + ้ + ย + ว
  assert.equal(ThaiRules.assemble(parts('ia', 'ส', { tone: 'tho', final: 'ว' })),
    String.fromCodePoint(0x0e40, 0x0e2a, 0x0e35, 0x0e49, 0x0e22, 0x0e27));
  // เพื่อน = เ + พ + ื + ่ + อ + น
  assert.equal(ThaiRules.assemble(parts('uea', 'พ', { tone: 'ek', final: 'น' })),
    String.fromCodePoint(0x0e40, 0x0e1e, 0x0e37, 0x0e48, 0x0e2d, 0x0e19));
  // เรียน = เ + ร + ี + ย + น
  assert.equal(ThaiRules.assemble(parts('ia', 'ร', { final: 'น' })),
    String.fromCodePoint(0x0e40, 0x0e23, 0x0e35, 0x0e22, 0x0e19));
  for (const p of [
    parts('ia', 'ส', { tone: 'tho', final: 'ว' }),
    parts('uea', 'พ', { tone: 'ek', final: 'น' }),
    parts('ia', 'ร', { final: 'น' }),
  ]) assert.deepEqual(ThaiRules.check(p), []);
});

test('元音 ั 必须带尾辅音，เ-็ 不写声调符号', () => {
  assert.ok(ThaiRules.VOWELS.find((v) => v.id === 'a_short').requiresFinal);
  // กัน = ก + ั + น
  assert.equal(ThaiRules.assemble(parts('a_short', 'ก', { final: 'น' })), String.fromCodePoint(0x0e01, 0x0e31, 0x0e19));
  // เก็ง = เ + ก + ็ + ง
  assert.equal(ThaiRules.assemble(parts('e_taikhu', 'ก', { final: 'ง' })),
    String.fromCodePoint(0x0e40, 0x0e01, 0x0e47, 0x0e07));
  // ำ / เ-าะ 都不能带尾辅音
  assert.equal(ThaiRules.VOWELS.find((v) => v.id === 'am').allowsFinal, false);
  assert.equal(ThaiRules.assemble(parts('am', 'น')), String.fromCodePoint(0x0e19, 0x0e33));
});

test('常见词抽查：辅音簇 / 前引元音 / 尾辅音组合拼出来是对的', () => {
  const cases = [
    // ครับ = ค + ร + ั + บ
    [parts('a_short', 'ค', { cluster: 'ร', final: 'บ' }), [0x0e04, 0x0e23, 0x0e31, 0x0e1a]],
    // ไทย = ไ + ท + ย
    [parts('ai', 'ท', { final: 'ย' }), [0x0e44, 0x0e17, 0x0e22]],
    // แหม = แ + ห + ม
    [parts('ae', 'ห', { final: 'ม' }), [0x0e41, 0x0e2b, 0x0e21]],
    // เอ๋ = เ + อ + ๋
    [parts('e', 'อ', { tone: 'chattawa' }), [0x0e40, 0x0e2d, 0x0e4b]],
    // ง่าย = ง + า + ่ + ย
    [parts('aa', 'ง', { tone: 'ek', final: 'ย' }), [0x0e07, 0x0e32, 0x0e48, 0x0e22]],
  ];
  for (const [p, expected] of cases) {
    assert.deepEqual(cps(ThaiRules.assemble(p)), expected, ThaiRules.assemble(p));
    assert.deepEqual(ThaiRules.check(p), []);
  }
});

test('完整词表：非废弃辅音 42 个，元音 28 个', () => {
  assert.equal(ThaiRules.CONSONANTS.filter((c) => !c.obsolete).length, 42);
  assert.equal(ThaiRules.CONSONANTS.filter((c) => c.obsolete).map((c) => c.ch).join(''), 'ฃฅ');
  assert.equal(ThaiRules.VOWELS.length, 28);
  // 每个元音的段必须落在合法字符集内
  const legal = new Set([
    ...ThaiRules.LEAD_VOWEL_CHARS,
    ...ThaiRules.FOLLOW_VOWEL_CHARS,
    'ั', '็', 'ำ', 'อ', 'ย', 'ว', 'าะ', 'อะ',
  ]);
  for (const v of ThaiRules.VOWELS) {
    for (const part of [v.lead, v.follow, v.tail]) {
      if (part && !legal.has(part)) assert.fail(`${v.id} 的段「${part}」不在预期字符集里`);
    }
  }
});
