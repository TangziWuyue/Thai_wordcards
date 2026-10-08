/**
 * 固定模式音节音频（soundKey / soundFile）的回归测试。
 *
 * 3.4.0 起随机模式只抽真词，规则拼出来的音节只有固定模式会碰到：
 * 一个辅音 + 一个元音（没有辅音簇、没有尾音），声调按 toneOptions(strict) 过滤。
 * 这里钉三件事：
 *   ① 同一个「声音」（IPA + 实读调 + 长短）只有一个 key、不同声音不撞 key；
 *   ② 声音总数不悄悄变——变了说明清单要重新生成（数字和 app.js 的 SYLLABLE_COUNT、
 *      web/audio-tools/export-syllables.mjs 的产物一起改）；
 *   ③ 每一条声音在 web/audio/syl/v1/ 里真的有文件：漏生成 / 漏提交就让测试红。
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
globalThis.window = globalThis;
require('./rules.js');
const R = globalThis.ThaiRules;

/** 穷举固定模式 UI 可达的 parts（和 export-syllables.mjs、app.js 的 syllableFile() 同一套口径） */
function fixedParts() {
  const out = [];
  const tones = R.TONES.map((t) => t.id);
  const push = (parts) => {
    if (R.check(parts).length) return;
    const opt = R.toneOptions(parts, true).find((t) => t.id === parts.tone);
    if (!opt || !opt.allowed) return;
    out.push(parts);
  };
  for (const c of R.CONSONANTS) {
    for (const vid of R.SELECTABLE_VOWEL_IDS) {
      for (const tone of tones) {
        push({ onset: c.ch, cluster: null, vowelId: vid, tone, final: null });
      }
    }
  }
  // 只选元音时：ฤ ฤๅ ฦ ฦๅ 自己当声母，不加 อ 载体
  for (const vid of R.SELECTABLE_VOWEL_IDS) {
    const vowel = R.VOWELS.find((v) => v.id === vid);
    if (!vowel.canBeOnset) continue;
    for (const tone of tones) {
      push({ onset: null, cluster: null, vowelId: vid, tone, final: null });
    }
  }
  return out;
}

// 「声音」的独立定义：IPA + 实读调 + 长短（复合元音的 IPA 按课本习惯不标长音，
// 但长短是真实听觉差别：อัว ≠ อัวะ、เอีย ≠ เอียะ、เอือ ≠ เอือะ）
const soundOf = (parts) => {
  const v = R.VOWELS.find((x) => x.id === parts.vowelId) || {};
  return `${R.romanize(parts, 'ipa')}|${R.spokenTone(parts) || 0}|${v.short ? 'S' : 'L'}`;
};
const PARTS = fixedParts();

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
  // 2,132 = 固定模式全组合去重后的声音数（借用真词音频 677 + 合成 1,455）。
  // 改了 rules.js 的音节构成 / 元音表就会变，要重跑 export-syllables.mjs + 生成，
  // 并把 app.js 的 SYLLABLE_COUNT 一起改掉。
  assert.equal(keyToSound.size, 2132, `声音数量变了：${keyToSound.size}（原来 2,132，改动请同步文档）`);
});

test('音节 key：文件路径带 schema 版本、可直接推导，而且每条都真的有文件', () => {
  const parts = { onset: 'ค', cluster: null, vowelId: 'aa', tone: 'tho', final: null };
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
  // 钉一个已知 key：哈希算法或 IPA 数据一变，这里就红（播放会 404）
  assert.equal(
    R.soundFile({ onset: 'ก', cluster: null, vowelId: 'o_long', tone: 'none', final: null }),
    'syl/v1/f0776865b203.mp3',
  );
  // 每一条声音都要有音频文件（真实目录，不用软链接）
  const missing = [];
  for (const key of new Set(PARTS.map((p) => R.soundKey(p)))) {
    if (!existsSync(new URL(`./audio/syl/v1/${key}.mp3`, import.meta.url))) missing.push(key);
  }
  assert.deepEqual(missing, [], `这些声音没有音频文件（重跑 audio-tools 的音节流程）：${missing.slice(0, 8).join(' ')}`);
});

test('音节 key：同音写法必须合并', () => {
  const same = (a, b, msg) => assert.equal(R.soundKey(a), R.soundKey(b), msg);
  const base = { cluster: null, vowelId: 'aa', tone: 'none', final: null };
  same({ ...base, onset: 'ฎ' }, { ...base, onset: 'ด' }, 'ฎ 与 ด 同音');
  same({ ...base, onset: 'ฏ' }, { ...base, onset: 'ต' }, 'ฏ 与 ต 同音');
  same({ ...base, onset: 'ศ' }, { ...base, onset: 'ส' }, 'ศ 与 ส 同音');
  same({ ...base, onset: 'ษ' }, { ...base, onset: 'ส' }, 'ษ 与 ส 同音');
  same({ ...base, onset: 'ฃ' }, { ...base, onset: 'ข' }, '废弃的 ฃ 与 ข 同音');
  // 中辅音 + 死音节：不写符号（第 2 调）和写 ่（第 2 调）读出来一模一样
  same(
    { onset: 'ก', cluster: null, vowelId: 'a', tone: 'none', final: null },
    { onset: 'ก', cluster: null, vowelId: 'a', tone: 'ek', final: null },
    'กะ 与 ก่ะ 同音（都读第 2 调）',
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
