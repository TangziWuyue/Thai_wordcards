/**
 * 音节音频 key 的回归测试（soundKey / soundFile）。
 *
 * 这个 key 决定「随机拼出来的音节放哪条音频」，所以两条都必须成立：
 *   ① 同一个「声音」（IPA + 实读调）只能有一个 key —— 不能重复生成；
 *   ② 不同的「声音」不能撞 key —— 否则会播成另一个音。
 * 另外钉住几个同音/近音的典型例子（ฎ=ด、ศ/ษ/ส、ทร=ซ、o_short≠o_short_open…）。
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
globalThis.window = globalThis;
require('./rules.js');
const R = globalThis.ThaiRules;

/** 穷举 UI 可达的 parts（和 combinations.test.mjs 同一套口径） */
function allParts() {
  const out = [];
  const onsets = R.CONSONANTS.filter((c) => !c.obsolete).map((c) => c.ch);
  const vowels = R.SELECTABLE_VOWEL_IDS.concat(['o_implied']);
  const finals = [null, ...Object.keys(R.FINALS)];
  const tones = ['none', 'ek', 'tho', 'tri', 'chattawa'];
  for (const onset of onsets) {
    const clusters = [null, ...R.CLUSTERS.filter(([a]) => a === onset).map(([, b]) => b)];
    for (const cluster of clusters) {
      for (const vowelId of vowels) {
        for (const tone of tones) {
          for (const final of finals) {
            const parts = { onset, cluster, vowelId, tone, final };
            if (R.check(parts).length) continue;
            out.push(parts);
          }
        }
      }
    }
  }
  return out;
}

// 「声音」的独立定义：IPA + 实读调 + 长短（复合元音的 IPA 按课本习惯不标长音，
// 但长短是真实听觉差别：อัว ≠ อัวะ、เอีย ≠ เอียะ、เอือ ≠ เอือะ）
const soundOf = (parts) => {
  const v = R.VOWELS.find((x) => x.id === parts.vowelId) || {};
  return `${R.romanize(parts, 'ipa')}|${R.spokenTone(parts)}|${v.short ? 'S' : 'L'}`;
};
const PARTS = allParts();

test('音节 key：一个声音只有一个 key，不同声音不撞 key', () => {
  const keyToSound = new Map();
  const soundToKey = new Map();
  for (const parts of PARTS) {
    const key = R.soundKey(parts);
    assert.ok(key, `拿不到 key：${JSON.stringify(parts)}`);
    const sound = soundOf(parts);
    const seen = keyToSound.get(key);
    assert.ok(seen === undefined || seen === sound,
      `不同声音撞了 key ${key}：${seen} vs ${sound}（${JSON.stringify(parts)}）`);
    keyToSound.set(key, sound);
    const seenKey = soundToKey.get(sound);
    assert.ok(seenKey === undefined || seenKey === key,
      `同一个声音出现了两个 key：${sound} → ${seenKey} / ${key}`);
    soundToKey.set(sound, key);
  }
  assert.equal(keyToSound.size, soundToKey.size, 'key 数与声音数不一致');
  // 23,786 = 23,473 个「IPA + 实读调」的声音，再把 อัว/อัวะ、เอีย/เอียะ、เอือ/เอือะ
  // 这几组「IPA 不标长音但长短确实不同」的拆开后的数量。
  assert.equal(keyToSound.size, 23786, `声音数量变了：${keyToSound.size}（原来 23,786，改动请同步文档）`);
});

test('音节 key：文件路径带 schema 版本、可直接推导', () => {
  const parts = { onset: 'ค', cluster: null, vowelId: 'aa', tone: 'tho', final: 'ง' };
  const file = R.soundFile(parts);   // 低辅音 + 活音节 + 写 อ้ → 读第 4 调
  assert.match(file, /^syl\/v1\/[0-9a-f]{12}\.mp3$/);
  assert.equal(R.soundFile(parts), file, '同一个 parts 两次算出的文件名必须一致');
  // 同音不同写法 → 同一个文件
  assert.equal(
    R.soundFile({ onset: 'ฎ', cluster: null, vowelId: 'aa', tone: 'none', final: null }),
    R.soundFile({ onset: 'ด', cluster: null, vowelId: 'aa', tone: 'none', final: null }),
  );
  // 不同音 → 不同文件
  assert.notEqual(
    R.soundFile({ onset: 'ก', cluster: null, vowelId: 'a', tone: 'none', final: null }),
    R.soundFile({ onset: 'ก', cluster: null, vowelId: 'aa', tone: 'none', final: null }),
  );
});

test('音节 key：同音写法必须合并', () => {
  const same = (a, b, msg) => assert.equal(R.soundKey(a), R.soundKey(b), msg);
  const base = { cluster: null, vowelId: 'aa', tone: 'none', final: null };
  same({ ...base, onset: 'ฎ' }, { ...base, onset: 'ด' }, 'ฎ 与 ด 同音');
  same({ ...base, onset: 'ฏ' }, { ...base, onset: 'ต' }, 'ฏ 与 ต 同音');
  same({ ...base, onset: 'ศ' }, { ...base, onset: 'ส' }, 'ศ 与 ส 同音');
  same({ ...base, onset: 'ษ' }, { ...base, onset: 'ส' }, 'ษ 与 ส 同音');
  same({ ...base, onset: 'ฃ' }, { ...base, onset: 'ข' }, '废弃的 ฃ 与 ข 同音');
  same({ ...base, onset: 'ท', cluster: 'ร' }, { ...base, onset: 'ซ' }, 'ทร 与 ซ 同音');
  same({ ...base, onset: 'จ', cluster: 'ร' }, { ...base, onset: 'จ' }, 'จร 的 ร 不发音');
  same(
    { onset: 'ก', cluster: null, vowelId: 'e_closed', tone: 'none', final: 'น' },
    { onset: 'ก', cluster: null, vowelId: 'oe', tone: 'none', final: 'น' },
    'เ-ิ 与 เออ 同音',
  );
});

test('音节 key：近音不能合并（长度、口形不同）', () => {
  const base = { cluster: null, tone: 'none', final: null };
  const diff = (a, b, msg) => assert.notEqual(R.soundKey({ ...base, ...a }), R.soundKey({ ...base, ...b }), msg);
  diff({ onset: 'ก', vowelId: 'o_short' }, { onset: 'ก', vowelId: 'o' }, 'โอะ(短) 与 โอ(长)');
  diff({ onset: 'ก', vowelId: 'o_short' }, { onset: 'ก', vowelId: 'o_short_open' }, 'โอะ(o) 与 เอาะ(ɔ)');
  diff({ onset: 'ก', vowelId: 'o_long' }, { onset: 'ก', vowelId: 'o_short_open' }, 'ออ(ɔː) 与 เอาะ(ɔ)');
  diff({ onset: 'ก', vowelId: 'a' }, { onset: 'ก', vowelId: 'aa' }, 'อะ(短) 与 อา(长)');
  diff({ onset: 'ก', vowelId: 'e_short' }, { onset: 'ก', vowelId: 'e' }, 'เอะ(短) 与 เอ(长)');
  // 同一个音、不同的调必须分开
  diff({ onset: 'ก', vowelId: 'aa', tone: 'none' }, { onset: 'ก', vowelId: 'aa', tone: 'ek' }, '不同声调');
});
