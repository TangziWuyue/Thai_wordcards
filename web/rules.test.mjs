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

/** mulberry32：分布质量比 LCG 好，用于「占比是否合理」这类断言 */
function rng32(seed = 1) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
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
  const p = parts('o_implied', 'ก', { final: 'บ' });
  assert.equal(ThaiRules.assemble(p), 'กบ');
  assert.deepEqual(ThaiRules.check(p), []);
});

test('拼装顺序：辅音簇紧贴首辅音', () => {
  const p = parts('a', 'ก', { cluster: 'ร' });
  assert.equal(ThaiRules.assemble(p), 'กระ');
  assert.deepEqual(ThaiRules.check(p), []);
});

test('参考注音：与课本「音标」写法一致', () => {
  assert.equal(ThaiRules.romanize(parts('aa', 'ก')), 'ka');           // มา = ma
  assert.equal(ThaiRules.romanize(parts('aa', 'ก', { final: 'น' })), 'kan');
  assert.equal(ThaiRules.romanize(parts('e', 'ก', { final: 'ง' })), 'keng');
  assert.equal(ThaiRules.romanize(parts('a', 'ก', { cluster: 'ร' })), 'kra');
  assert.equal(ThaiRules.romanize(parts('o_short', 'ต')), 'to');      // โตะ = to
  assert.equal(ThaiRules.romanize(parts('am', 'น')), 'nam');          // นำ = nam
  assert.equal(ThaiRules.romanize(parts('ai', 'ท')), 'thai');         // ไท = thai
  assert.equal(ThaiRules.romanize(parts('uea', 'ก')), 'kuae');        // เลือก = luaek
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
  // 拉丁转写：แม่เกย 写 i、แม่เกอว 写 o（ไทย = thai / แมว = maeo）
  assert.equal(ThaiRules.FINALS['ย'].roman, 'i');
  assert.equal(ThaiRules.FINALS['ว'].roman, 'o');
  assert.equal(ThaiRules.FINALS['ย'].ipa, 'j');
  assert.equal(ThaiRules.FINALS['ว'].ipa, 'w');
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

test('超额元音与复合元音短形：ฤ ฦ ออ เอียะ อัวะ', () => {
  const cases = [
    // กฤ = ก + ฤ
    [parts('rue', 'ก'), [0x0e01, 0x0e24]],
    // ฤๅ = ฤ + ๅ
    [parts('ruee', 'ก'), [0x0e01, 0x0e24, 0x0e45]],
    // กฦๅ = ก + ฦ + ๅ
    [parts('luee', 'ก'), [0x0e01, 0x0e26, 0x0e45]],
    // พ่อ = พ + ่ + อ
    [parts('o_long', 'พ', { tone: 'ek' }), [0x0e1e, 0x0e48, 0x0e2d]],
    // ก่อน = ก + ่ + อ + น
    [parts('o_long', 'ก', { tone: 'ek', final: 'น' }), [0x0e01, 0x0e48, 0x0e2d, 0x0e19]],
    // เปียะ = เ + ป + ี + ย + ะ
    [parts('ia_short', 'ป'), [0x0e40, 0x0e1b, 0x0e35, 0x0e22, 0x0e30]],
    // กัวะ = ก + ั + ว + ะ
    [parts('ua_short', 'ก'), [0x0e01, 0x0e31, 0x0e27, 0x0e30]],
  ];
  for (const [p, expected] of cases) {
    assert.deepEqual(cps(ThaiRules.assemble(p)), expected, ThaiRules.assemble(p));
    assert.deepEqual(ThaiRules.check(p), []);
  }
  // ฤ 系列不写声调符号
  const rue = parts('rue', 'ก');
  assert.deepEqual(ThaiRules.toneOptions(rue, true).filter((t) => t.allowed).map((t) => t.id), ['none']);
});

test('元音表：名称 / 英文名 / 音标 / 例词与课本一致', () => {
  const byId = new Map(ThaiRules.VOWELS.map((v) => [v.id, v]));
  const expected = {
    a: ['สระ อะ', 'sara a', 'a', 'ปะ = pa'],
    aa: ['สระ อา', 'sara aa', 'a', 'มา = ma'],
    i: ['สระ อิ', 'sara i', 'i', 'มิ = mi'],
    ii: ['สระ อี', 'sara ii', 'i', 'มีด = mit'],
    ue: ['สระ อึ', 'sara ue', 'ue', 'นึก = nuek'],
    uue: ['สระ อือ', 'sara uee', 'ue', 'หรือ = rue'],
    u: ['สระ อุ', 'sara u', 'u'],
    uu: ['สระ อู', 'sara uu', 'u', 'หรู = ru'],
    e_short: ['สระ เอะ', 'sara eh', 'e', 'เละ = le'],
    e: ['สระ เอ', 'sara e', 'e', 'เลน = len'],
    ae_short: ['สระ แอะ', 'sara aeh', 'ae', 'และ = lae'],
    ae: ['สระ แอ', 'sara ae', 'ae', 'แสง = saeng'],
    o_short: ['สระ โอะ', 'sara oh', 'o', 'โละ = lo'],
    o: ['สระ โอ', 'sara o', 'o', 'โล้ = lo'],
    o_short_open: ['สระ เอาะ', 'sara orh', 'o', 'เลาะ = lo'],
    o_long: ['สระ ออ', 'sara or', 'o', 'ลอม = lom'],
    oe_short: ['สระ เออะ', 'sara oeh', 'oe', 'เลอะ = loe'],
    oe: ['สระ เออ', 'sara oe', 'oe', 'เธอ = thoe'],
    ua_short: ['สระ อัวะ', 'sara uah', 'ua', 'ผัวะ = phua'],
    ua: ['สระ อัว', 'sara ua', 'ua', 'มัว = mua'],
    ia_short: ['สระ เอียะ', 'sara iah', 'ia', 'เผียะ = phia'],
    ia: ['สระ เอีย', 'sara ia', 'ia', 'เลียน = lian'],
    uea: ['สระ เอือ', 'sara uea', 'uae', 'เลือก = luaek'],
    rue: ['สระ รึ', 'sara rue', 'rue', 'ฤดู = ruedu'],
    ruee: ['สระ รือ', 'sara ruee', 'rue', 'ฤษี = ruesi'],
    lue: ['สระ ลึ', 'sara lue', 'lue'],
    luee: ['สระ ลือ', 'sara luee', 'lue'],
    am: ['สระ อำ', 'sara am', 'am', 'รำ = ram'],
    ai_mai: ['สระ ใอ', 'sara ai mai muan', 'ai', 'ใย = yai'],
    ai: ['สระ ไอ', 'sara ai mai malai', 'ai', 'ไทย = thai'],
    ao: ['สระ เอา', 'sara ao', 'ao', 'เมา = mao'],
  };
  assert.equal(Object.keys(expected).length, 31, '课本 32 行里 เอือะ 的例词栏是 ---');
  for (const [id, [name, en, roman, example]] of Object.entries(expected)) {
    const v = byId.get(id);
    assert.ok(v, `缺少元音 ${id}`);
    assert.equal(v.name, name, `${id} 名称`);
    assert.equal(v.en, en, `${id} 英文名`);
    assert.equal(v.roman, roman, `${id} 音标`);
    if (example) assert.equal(v.example, example, `${id} 例词`);
  }
  // 每个元音都要有名称与音标，例词格式统一
  for (const v of ThaiRules.VOWELS) {
    if (v.internal) continue; // 「无元音」这类内部项不参与词表展示
    assert.ok(v.name && v.en && v.roman, `${v.id} 字段不全`);
    if (v.example) assert.match(v.example, /^.+ = .+$/u, `${v.id} 例词格式`);
  }
});

test('元音充当声母：ฤ ฤๅ ฦ ฦๅ 可以自己成音节', () => {
  for (const [id, text] of [['rue', 'ฤ'], ['ruee', 'ฤๅ'], ['lue', 'ฦ'], ['luee', 'ฦๅ']]) {
    const p = parts(id, null);
    assert.equal(ThaiRules.assemble(p), text);
    assert.deepEqual(ThaiRules.check(p), [], `${id} 自检`);
    assert.equal(ThaiRules.describe(p).onsetLabel, '元音充当声母');
  }
  // 没开启这个模式时，没有辅音就生成不出来
  assert.equal(ThaiRules.generate({ consonants: [], vowels: ['rue', 'aa'], rng: seededRng(1) }), null);
  // 开启后，即使一个辅音都没勾，也能生成 ฤ 类音节
  const rng = seededRng(3);
  let sawVowelOnset = false;
  for (let i = 0; i < 200; i += 1) {
    const p = ThaiRules.generate({
      consonants: [], vowels: ['rue', 'ruee', 'lue', 'luee'], allowVowelOnset: true, rng,
    });
    assert.ok(p, '应该能生成');
    assert.equal(p.onset, null);
    assert.ok(['ฤ', 'ฤๅ', 'ฦ', 'ฦๅ'].includes(ThaiRules.assemble(p)));
    sawVowelOnset = true;
  }
  assert.ok(sawVowelOnset);
  // 关掉模式后仍然只用辅音当声母
  for (let i = 0; i < 200; i += 1) {
    const p = ThaiRules.generate({
      consonants: ['ก', 'ม'], vowels: ['rue', 'aa'], allowVowelOnset: false, rng,
    });
    assert.ok(p.onset, '关闭模式时必须有辅音声母');
  }
});

test('完整词表：非废弃辅音 42 个，元音按教科书 32 รูป 分组', () => {
  assert.equal(ThaiRules.CONSONANTS.filter((c) => !c.obsolete).length, 42);
  assert.equal(ThaiRules.CONSONANTS.filter((c) => c.obsolete).map((c) => c.ch).join(''), 'ฃฅ');
  const count = (g) => ThaiRules.VOWELS.filter((v) => v.group === g).length;
  assert.equal(count('single'), 18, 'สระเดี่ยว 单元音应为 18');
  assert.equal(count('compound'), 6, 'สระประสม 复合元音应为 6');
  assert.equal(count('extra'), 8, 'สระเกิน 超额元音应为 8');
  assert.equal(count('single') + count('compound') + count('extra'), 32, '合计应为教科书 32 รูป');
  assert.equal(count('variant'), 4, '另有 4 个拼写变体');
  // 内部项「无元音」：不在任何分组里、也不出现在词表（固定模式关闭拼写规则时用）
  const internal = ThaiRules.VOWELS.filter((v) => v.internal);
  assert.equal(internal.length, 1);
  assert.equal(internal[0].id, 'none');
  assert.equal(internal[0].lead + internal[0].follow + internal[0].tail, '');
  // 每个元音的段必须落在合法字符集内
  const legal = new Set([
    'เ', 'แ', 'โ', 'ใ', 'ไ', 'ะ', 'า', 'ิ', 'ี', 'ึ', 'ื', 'ุ', 'ู',
    'ั', '็', 'ำ', 'อ', 'ย', 'ว', 'ฤ', 'ฦ', 'ๅ',
  ]);
  for (const v of ThaiRules.VOWELS) {
    for (const part of [v.lead, v.follow, v.tail]) {
      for (const ch of part || '') {
        if (!legal.has(ch)) assert.fail(`${v.id} 的段「${part}」含预期外字符 ${ch}`);
      }
    }
    assert.ok(v.name, `${v.id} 缺少教科书名称`);
  }
});

// ── 复合声母与两套音标 ────────────────────────────────────────────────

test('อักษรนำ：前引的 ห 不发音，只把后面那个辅音变高类', () => {
  const cases = [
    // หมา = ห + ม + า
    [parts('aa', 'ห', { cluster: 'ม' }), [0x0e2b, 0x0e21, 0x0e32], 'ma', 'maː'],
    // หรู = ห + ร + ู
    [parts('uu', 'ห', { cluster: 'ร' }), [0x0e2b, 0x0e23, 0x0e39], 'ru', 'ruː'],
    // หนู = ห + น + ู
    [parts('uu', 'ห', { cluster: 'น' }), [0x0e2b, 0x0e19, 0x0e39], 'nu', 'nuː'],
    // ใหญ่ = ไ + ห + ญ + ่
    [parts('ai', 'ห', { cluster: 'ญ', tone: 'ek' }), [0x0e44, 0x0e2b, 0x0e0d, 0x0e48], 'yai', 'jaj'],
  ];
  for (const [p, expected, book, ipa] of cases) {
    assert.deepEqual(cps(ThaiRules.assemble(p)), expected, ThaiRules.assemble(p));
    assert.equal(ThaiRules.romanize(p, 'latin'), book);
    assert.equal(ThaiRules.romanize(p, 'ipa'), ipa);
    assert.deepEqual(ThaiRules.check(p), []);
    assert.equal(ThaiRules.describe(p).clusterNote, '前引 ห 不发音');
  }
  // ห 当声母时整个音节算高类，所以 ๊ / ๋ 用不了
  const allowed = ThaiRules
    .toneOptions(parts('aa', 'ห', { cluster: 'ม' }), true)
    .filter((t) => t.allowed)
    .map((t) => t.id);
  assert.ok(!allowed.includes('tri') && !allowed.includes('chattawa'));
  // 真簇不该被误判成前引
  assert.equal(ThaiRules.isLeadingH('ก', 'ร'), false);
  assert.equal(ThaiRules.isLeadingH('ห', 'ก'), false);
});

test('อักษรควบไม่แท้：จริง / ทราย / ศรี 的读音与写法', () => {
  // จริง = จ + ร + ิ + ง（ร 不发音）
  const jing = parts('i', 'จ', { cluster: 'ร', final: 'ง' });
  assert.equal(ThaiRules.assemble(jing), 'จริง');
  assert.equal(ThaiRules.romanize(jing, 'latin'), 'jing');
  assert.equal(ThaiRules.romanize(jing, 'ipa'), 'tɕiŋ');
  assert.equal(ThaiRules.describe(jing).clusterNote, 'ร 不发音');

  // ทราย = ท + ร + า + ย（整体读 s，尾 ย 不重复写）
  const saai = parts('aa', 'ท', { cluster: 'ร', final: 'ย' });
  assert.equal(ThaiRules.assemble(saai), 'ทราย');
  assert.equal(ThaiRules.romanize(saai, 'latin'), 'sai');
  assert.equal(ThaiRules.romanize(saai, 'ipa'), 'saːj');
  assert.equal(ThaiRules.describe(saai).clusterNote, 'ทร 整体读 s');

  // ศรี = ศ + ร + ี（ร 不发音）
  const sii = parts('ii', 'ศ', { cluster: 'ร' });
  assert.equal(ThaiRules.assemble(sii), 'ศรี');
  assert.equal(ThaiRules.romanize(sii, 'latin'), 'si');
  assert.equal(ThaiRules.romanize(sii, 'ipa'), 'siː');

  for (const p of [jing, saai, sii]) assert.deepEqual(ThaiRules.check(p), []);
});

test('真辅音簇：ปลา / ความ / กร 都按两个字读', () => {
  assert.equal(ThaiRules.romanize(parts('aa', 'ป', { cluster: 'ล' }), 'latin'), 'pla');
  assert.equal(ThaiRules.romanize(parts('aa', 'ค', { cluster: 'ว', final: 'ม' }), 'latin'), 'khwam');
  assert.equal(ThaiRules.romanize(parts('i', 'ก', { cluster: 'ร', final: 'ง' }), 'latin'), 'kring');
  // ย 作尾辅音时课本写 i，所以 สาย = sai 而不是 say
  assert.equal(ThaiRules.romanize(parts('aa', 'ส', { final: 'ย' }), 'latin'), 'sai');
  // 元音本身就以这个音结尾时，尾辅音不重复写
  assert.equal(ThaiRules.romanize(parts('ai', 'ท', { final: 'ย' }), 'latin'), 'thai');
});

test('两套注音：罗马注音与国际音标都要对得上', () => {
  const cases = [
    ['aa', 'ก', {}, 'ka', 'kaː'],
    ['aa', 'ก', { final: 'น' }, 'kan', 'kaːn'],
    ['ii', 'ม', { final: 'ด' }, 'mit', 'miːt'],
    ['ue', 'น', { final: 'ก' }, 'nuek', 'nɯk'],
    ['e', 'ล', { final: 'น' }, 'len', 'leːn'],
    ['ae', 'ส', { final: 'ง' }, 'saeng', 'sɛːŋ'],
    ['o', 'ล', { tone: 'tho' }, 'lo', 'loː'],
    ['oe', 'ธ', {}, 'thoe', 'tʰɤː'],
    ['am', 'ร', {}, 'ram', 'ram'],
    ['ai', 'ก', { tone: 'ek' }, 'kai', 'kaj'],
    ['ao', 'ม', {}, 'mao', 'maw'],
  ];
  for (const [vowelId, onset, extra, latin, ipa] of cases) {
    const p = parts(vowelId, onset, extra);
    assert.equal(ThaiRules.romanize(p, 'latin'), latin, `${vowelId} 罗马注音`);
    assert.equal(ThaiRules.romanize(p, 'ipa'), ipa, `${vowelId} 国际音标`);
  }
  // 不传参数时默认走罗马注音
  assert.equal(ThaiRules.romanize(parts('aa', 'ก')), 'ka');
  // 每个元音都要有 IPA 字段，每个尾辅音也要有
  for (const v of ThaiRules.VOWELS) {
    if (v.internal) continue;
    assert.ok(v.ipa, `${v.id} 缺 IPA`);
  }
  for (const ch of Object.keys(ThaiRules.FINALS)) {
    assert.ok(ThaiRules.FINALS[ch].ipa, `${ch} 缺 IPA`);
  }
  // 两套注音不能完全一样（否则说明数据没填好）
  const differs = ThaiRules.VOWELS.filter((v) => v.ipa !== v.roman);
  assert.ok(differs.length >= 10, `IPA 与罗马注音应有明显差别，实际只有 ${differs.length} 个不同`);
});

test('辅音表：44 个字母都有传统例词与中文释义', () => {
  assert.equal(ThaiRules.CONSONANTS.length, 44);
  for (const c of ThaiRules.CONSONANTS) {
    assert.ok(c.example, `${c.ch} 缺传统例词`);
    assert.ok(c.gloss, `${c.ch} 缺中文释义`);
  }
  const byCh = new Map(ThaiRules.CONSONANTS.map((c) => [c.ch, c]));
  const spot = {
    ก: ['ไก่', '鸡'], ข: ['ไข่', '蛋'], ง: ['งู', '蛇'], ญ: ['หญิง', '女人'],
    ร: ['เรือ', '船'], ฮ: ['นกฮูก', '猫头鹰'], ฬ: ['จุฬา', '风筝'],
  };
  for (const [ch, [word, gloss]] of Object.entries(spot)) {
    assert.equal(byCh.get(ch).example, word, `${ch} 例词`);
    assert.equal(byCh.get(ch).gloss, gloss, `${ch} 释义`);
  }
  // 辅音的国际音标（给悬浮卡片用）
  assert.equal(ThaiRules.consonantIPA('ก'), 'k');
  assert.equal(ThaiRules.consonantIPA('ข'), 'kʰ');
  assert.equal(ThaiRules.consonantIPA('จ'), 'tɕ');
  assert.equal(ThaiRules.consonantIPA('อ'), 'ʔ');
  assert.equal(ThaiRules.consonantIPA('ง'), 'ŋ');
});

// ── 分布类回归（曾经出过 bug：元音当声母把结果吃光）─────────────────

test('元音充当声母：占比稳定，不会挤掉其它结果', () => {
  const vowels = ThaiRules.VOWELS.map((v) => v.id);
  const onsetsOnly = ['ก'];
  const fullSet = ThaiRules.CONSONANTS.filter((c) => !c.obsolete).map((c) => c.ch);
  for (const consonants of [onsetsOnly, fullSet]) {
    const rng = rng32(20260926);
    const n = 400;
    let vowelOnset = 0;
    const perVowel = new Map();
    for (let i = 0; i < n; i += 1) {
      const p = ThaiRules.generate({
        consonants, vowels, allowClusters: true, allowVowelOnset: true, rng,
      });
      assert.ok(p, '应该能生成');
      if (!p.onset) vowelOnset += 1;
      perVowel.set(p.vowelId, (perVowel.get(p.vowelId) || 0) + 1);
    }
    assert.ok(vowelOnset > 0, '应该能生成元音当声母的音节');
    assert.ok(vowelOnset < n * 0.25, `元音当声母占比过高：${vowelOnset}/${n}`);
    const max = Math.max(...perVowel.values());
    assert.ok(max < n * 0.2, `单个元音占比过高：${max}/${n}`);
  }
});

test('元音分布不塌缩：全词表跑 400 次，各元音都能出现', () => {
  const rng = rng32(7);
  const consonants = ThaiRules.CONSONANTS.filter((c) => !c.obsolete).map((c) => c.ch);
  // 只算词表里能勾选的元音（internal 的「无元音」只给固定模式内部用）
  const vowels = ThaiRules.VOWELS.filter((v) => !v.internal).map((v) => v.id);
  const perVowel = new Map();
  const n = 400;
  for (let i = 0; i < n; i += 1) {
    const p = ThaiRules.generate({
      consonants, vowels, allowClusters: true, allowFinal: true, allowVowelOnset: false, rng,
    });
    perVowel.set(p.vowelId, (perVowel.get(p.vowelId) || 0) + 1);
  }
  const missing = vowels.filter((id) => !perVowel.has(id));
  assert.deepEqual(missing, [], `这些元音一次都没生成：${missing.join(',')}`);
  // 允许有 ั 这类「必带尾辅音」的元音出现少一些，但不该有明显一家独大
  const max = Math.max(...perVowel.values());
  assert.ok(max < n * 0.15, `单个元音占比过高：${max}/${n}`);
});

test('随机组合不会用到「无元音」这个内部项', () => {
  const rng = rng32(3);
  const consonants = ['ก', 'ม', 'อ'];
  const vowels = ['aa', 'i', 'ua', 'none']; // 故意把内部项塞进词表
  for (let i = 0; i < 300; i += 1) {
    const p = ThaiRules.generate({ consonants, vowels, rng });
    assert.ok(p, '应该能生成');
    assert.notEqual(p.vowelId, 'none', '「无元音」不该出现在随机结果里');
    assert.ok(ThaiRules.assemble(p).length > 0);
  }
  // 只给内部项时，生成不出东西也算正常（词表里没有真正可用的元音）
  assert.equal(ThaiRules.generate({ consonants, vowels: ['none'], rng }), null);
});

test('辅音与尾辅音分布：都来自勾选的词表，且都有覆盖', () => {
  const rng = rng32(99);
  const consonants = ThaiRules.CONSONANTS.filter((c) => !c.obsolete).map((c) => c.ch);
  const onsetSeen = new Set();
  const finalSeen = new Set();
  const n = 600;
  for (let i = 0; i < n; i += 1) {
    const p = ThaiRules.generate({ consonants, vowels: ['aa', 'i', 'ua'], allowFinal: true, rng });
    onsetSeen.add(p.onset);
    if (p.final) finalSeen.add(p.final);
  }
  assert.ok(onsetSeen.size >= 30, `声母覆盖过少：${onsetSeen.size}`);
  assert.ok(finalSeen.size >= 15, `尾辅音覆盖过少：${finalSeen.size}`);
});
