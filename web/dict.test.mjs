/**
 * 辞典抽测：从 27522 条真词里按固定步长抽 500 条，逐条检查
 *
 * 为什么要抽这么多：辞典数据是构建脚本生成的，字段位置（拼写 / 罗马注音 / 中文 /
 * 词性 / 常用 / 英文 / 实际读音 / IPA）一列错位就整片都错，而且只在个别词上才看得出来。
 * 抽 500 条能把「整段时间」和「形近字混进来」这两类问题兜住。
 *
 * 另外测新加的 dict.search()：它是教学页搜索框「查词」用的按前缀查，
 * 必须保证 ① 完全相同的词排第一 ② 返回的每一条都真的以查询串开头。
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

// dict.js / data/dict.js 都是浏览器脚本（往 window 上挂东西），这里先造一个 window
globalThis.window = globalThis;
require('./data/dict.js');
require('./dict.js');
const D = globalThis.ThaiDict;

const SAMPLE_SIZE = 500;

test('辞典抽测：能加载，且抽 500 条每条都字段完整', async () => {
  await D.loadWords();
  const words = globalThis.ThaiDictData.words;
  assert.ok(words.length > 20000, `真词条数异常：${words.length}`);

  // 固定步长抽样，覆盖整个文件而不是只抽开头
  const stride = Math.floor(words.length / SAMPLE_SIZE);
  const sample = [];
  for (let i = 0; i < words.length && sample.length < SAMPLE_SIZE; i += stride) sample.push(words[i]);
  assert.equal(sample.length, SAMPLE_SIZE);

  const problems = [];
  let noGloss = 0;
  const seen = new Set();
  for (const entry of sample) {
    const [word, roman, zh, pos, common, en, phon, ipa] = entry;
    if (!word || typeof word !== 'string') problems.push(`拼写不合法：${JSON.stringify(entry)}`);
    if (seen.has(word)) problems.push(`抽到重复词：${word}`);
    seen.add(word);
    if (word !== word.trim()) problems.push(`拼写首尾有空白：${JSON.stringify(word)}`);
    // 合成长词真的能有 30 个码点（การหลีกเลี่ยงผลประโยชน์ทับซ้อน 这类），只挡明显异常的长串
    if ([...word].length > 40) problems.push(`拼写过长（可能是拼接错误）：${word}`);
    if (common !== 0 && common !== 1) problems.push(`常用标记不是 0/1：${word} → ${common}`);
    if (pos && !/^(n|v|adj|adv|pron|num|cls|intj|fn)$/.test(pos)) problems.push(`词性码不认识：${word} → ${pos}`);
    // 两边都没释义是允许的（界面会标「无释义」，全库 6xx 条），但比例不该很大
    if (!zh && !en) noGloss += 1;
    // 罗马注音里有中文/泰文说明混进来，多半是抓取时串了列
    if (roman && /[\u0E00-\u0E7F\u4e00-\u9fff]/.test(roman)) problems.push(`罗马注音里混进别的字：${word} → ${roman}`);
    // 中文释义里混进泰文，说明取错列了
    if (zh && /[\u0E00-\u0E7F]/.test(zh)) problems.push(`中文释义里混进泰文：${word} → ${zh}`);
    if (ipa && !ipa.startsWith('/')) problems.push(`IPA 格式不对：${word} → ${ipa}`);
    // 第 7 位是泰文的「实际读音拼写」（ไทย → ไท），不是 IPA；个别条目前面带 -（表示构词成分：-วะ-ดี）
    if (phon && !/^[\u0E00-\u0E7F-]/.test(phon)) problems.push(`实际读音格式不对：${word} → ${phon}`);
  }
  assert.ok(noGloss < SAMPLE_SIZE * 0.3, `抽到的样本里 ${noGloss} 条没有释义，比例异常`);
  assert.deepEqual(problems.slice(0, 12), [], `抽测发现 ${problems.length} 处问题`);
});

test('辞典抽测：500 条都能被 lookup 和 isWord 认出来', async () => {
  await D.loadWords();
  const words = globalThis.ThaiDictData.words;
  const stride = Math.floor(words.length / SAMPLE_SIZE);
  const sample = [];
  for (let i = 0; i < words.length && sample.length < SAMPLE_SIZE; i += stride) sample.push(words[i]);

  const bad = [];
  for (const entry of sample) {
    if (D.lookup(entry[0]) !== entry) bad.push(`lookup 拿不到原条目：${entry[0]}`);
    if (D.isWord(entry[0]) !== true) bad.push(`isWord 不认：${entry[0]}`);
    if (D.isCommon(entry[0]) !== !!entry[4]) bad.push(`常用标记对不上：${entry[0]}`);
  }
  assert.deepEqual(bad.slice(0, 12), [], `发现 ${bad.length} 处问题`);
});

test('辞典抽测：查词时完全相同的排第一，返回的每一条都以查询串开头', async () => {
  await D.loadWords();
  const words = globalThis.ThaiDictData.words;
  const stride = Math.floor(words.length / SAMPLE_SIZE);
  const sample = [];
  for (let i = 0; i < words.length && sample.length < SAMPLE_SIZE; i += stride) sample.push(words[i]);

  const bad = [];
  for (const entry of sample) {
    const word = entry[0];
    const exact = D.search(word, 5);
    if (!exact.length || exact[0][0] !== word) bad.push(`查「${word}」第一条不是它自己：${exact.map((e) => e[0]).join(' / ')}`);
    // 取前两个码点当查询串，模拟「打半个词」，返回的必须都真的以它开头
    const prefix = [...word].slice(0, 2).join('');
    for (const hit of D.search(prefix, 8)) {
      if (!hit[0].startsWith(prefix)) bad.push(`查「${prefix}」返回了不以它开头的词：${hit[0]}`);
    }
  }
  assert.deepEqual(bad.slice(0, 12), [], `发现 ${bad.length} 处问题`);

  // 空串 / 只有空格不该返回东西；没加载完时返回空数组而不是抛异常
  assert.deepEqual(D.search(''), []);
  assert.deepEqual(D.search('   '), []);
  assert.deepEqual(D.search(null), []);
});

/** 把一条释义按跟构建脚本一样的规则切成义项 */
const segments = (zh) => String(zh || '')
  .split(/[；;，,、／/（）()【】\[\]]+/)
  .map((s) => s.trim())
  .filter(Boolean);

test('辞典抽测：500 条的中文释义都能反查回它自己，且不返回不相干的词', async () => {
  await D.loadWords();
  const words = globalThis.ThaiDictData.words;
  const stride = Math.floor(words.length / SAMPLE_SIZE);
  const sample = [];
  for (let i = 0; i < words.length && sample.length < SAMPLE_SIZE; i += stride) sample.push(words[i]);

  const missing = [];
  const wrong = [];
  let checked = 0;
  for (const entry of sample) {
    const segs = segments(entry[2]);
    if (!segs.length) continue; // 没有中文释义的（只有英文）跳过
    checked += 1;
    // 用最长的那个义项查（最具体，最不容易被别的词挤掉）
    const seg = segs.slice().sort((a, b) => b.length - a.length)[0];
    const res = D.search(seg, 30);
    if (!res.includes(entry)) missing.push(`${seg} 查不到 ${entry[0]}`);
    for (const hit of res) {
      const ok = segments(hit[2]).some((s) => s === seg || s.includes(seg) || s.startsWith(seg));
      if (!ok) wrong.push(`查「${seg}」返回了释义对不上的词：${hit[0]}(${hit[2]})`);
    }
  }
  assert.ok(checked > 80, `样本里带中文释义的太少（${checked}），这个测试没意义`);
  assert.deepEqual(missing.slice(0, 8), [], `${checked} 条里反查不到自己的有 ${missing.length} 条`);
  assert.deepEqual(wrong.slice(0, 8), [], `反查结果里有 ${wrong.length} 条对不上`);
});

test('辞典：同义词表指向的释义必须真的存在（谢谢→感谢 这种）', async () => {
  await D.loadWords();
  const syn = globalThis.ThaiDictSynonyms || {};
  assert.ok(Object.keys(syn).length >= 5, '同义词表没加载出来');
  const glosses = new Set();
  for (const entry of globalThis.ThaiDictData.words) for (const s of segments(entry[2])) glosses.add(s);
  const bad = Object.entries(syn).filter(([, target]) => !glosses.has(target)).map(([a, t]) => `${a} → ${t}`);
  assert.deepEqual(bad, [], '同义词指向了词库里不存在的释义');
  // 抽两个最常用的口语说法，确认能查到词
  assert.ok(D.search('谢谢', 3).some((e) => e[0] === 'ขอบคุณ'), '查「谢谢」应该出 ขอบคุณ');
  assert.ok(D.search('对不起', 3).some((e) => e[0] === 'ขอโทษ'), '查「对不起」应该出 ขอโทษ');
});
