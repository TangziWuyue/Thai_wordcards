/**
 * 全矩阵自测：随机模式把「组合范围 × 四个开关」的所有组合都跑一遍，
 * 固定模式把「每个辅音 / 每个元音 / 每个辅音×元音 × 是否检查规则」都跑一遍。
 *
 * 跑法：node --test web/
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createContext, runInContext } from 'node:vm';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const R = require('./rules.js');

// 辞典数据是给浏览器用的（window.ThaiDictData=…），这里造个假的 window 读进来，
// 用来验证「常用词」那一档真的只出常用词
const dictSandbox = createContext({ window: {} });
runInContext(readFileSync(new URL('./data/dict.js', import.meta.url), 'utf8'), dictSandbox);
const DICT = dictSandbox.window.ThaiDictData;
const COMMON = new Set(DICT.words.filter((e) => e[4]).map((e) => e[0]));
const ALL_WORDS = new Set(DICT.words.map((e) => e[0]));

const THAI = /^[\u0e00-\u0e7f]+$/;
const CONSONANTS = R.CONSONANTS.map((c) => c.ch);
const VOWELS = R.SELECTABLE_VOWEL_IDS;
const RANGES = ['any', 'strict', 'common'];

/** 界面上的「组合范围」三档 → generate 的 strict 参数 */
const isStrict = (range) => range !== 'any';

function assertParts(parts, { strict, range, allowClusters, allowFinal, allowVowelOnset, allowImplicit }, tag) {
  assert.ok(parts, `${tag}：应该能生成音节`);
  const text = R.assemble(parts);
  assert.match(text, THAI, `${tag}：拼出来要是合法的泰文（得到 ${JSON.stringify(text)}）`);

  if (!allowClusters) {
    assert.equal(parts.cluster, null, `${tag}：没开辅音簇却出现了簇 ${parts.cluster}`);
  }
  if (!allowFinal) {
    assert.equal(parts.final, null, `${tag}：没开尾辅音却出现了 ${parts.final}`);
  }
  if (!allowVowelOnset) {
    assert.notEqual(parts.onset, null, `${tag}：没开「元音充当声母」却出现了无声母音节`);
  }
  if (!allowImplicit) {
    assert.notEqual(parts.vowelId, 'o_implied', `${tag}：没开「无元音符号」却出现了隐含元音`);
  }
  if (parts.final) {
    assert.ok(R.FINALS[parts.final], `${tag}：尾辅音 ${parts.final} 不能作尾辅音`);
  }

  // 声调必须是这个组合用得上的
  const tone = R.toneOptions(parts, strict).find((t) => t.id === parts.tone);
  assert.ok(tone, `${tag}：声调 ${parts.tone} 不在候选里`);
  assert.ok(tone.allowed, `${tag}：用了 ${tone.reason}`);

  if (strict) {
    assert.deepEqual(R.check(parts), [], `${tag}：规则检查没通过`);
  }
  if (range === 'common') {
    assert.ok(COMMON.has(text), `${tag}：常用词档生成了非常用词 ${text}`);
  }

  // 两套注音都要能出结果，不能抛异常
  for (const sys of ['latin', 'ipa']) {
    const info = R.describe(parts, strict, sys);
    assert.equal(typeof info.text, 'string', `${tag}：describe(${sys}) 没给出文本`);
  }
  return text;
}

test('随机模式：组合范围 × 四个开关的 48 种搭配全部合法', () => {
  const stats = { configs: 0, syllables: 0, common: 0, vowelOnset: 0, clusters: 0, finals: 0, implicit: 0 };
  for (const range of RANGES) {
    for (const allowClusters of [false, true]) {
      for (const allowFinal of [false, true]) {
        for (const allowVowelOnset of [false, true]) {
          for (const allowImplicit of [false, true]) {
            const opts = {
              consonants: CONSONANTS,
              vowels: allowImplicit ? [...VOWELS, 'o_implied'] : [...VOWELS],
              allowClusters,
              allowFinal,
              allowVowelOnset,
              allowImplicit,
              strict: isStrict(range),
            };
            const tag = `${range}/簇${allowClusters ? 1 : 0}/尾${allowFinal ? 1 : 0}`
              + `/元声母${allowVowelOnset ? 1 : 0}/无元音符号${allowImplicit ? 1 : 0}`;
            stats.configs += 1;

            for (let i = 0; i < 200; i += 1) {
              let parts = null;
              // 常用词档在界面上是「反复抽到命中为止」，这里用同样的策略
              const tries = range === 'common' ? 2000 : 1;
              for (let k = 0; k < tries; k += 1) {
                const candidate = R.generate(opts);
                assert.ok(candidate, `${tag}：generate 返回了 null`);
                parts = candidate;
                if (range !== 'common' || COMMON.has(R.assemble(candidate))) break;
              }
              const text = assertParts(parts, { ...opts, range }, tag);
              stats.syllables += 1;
              if (COMMON.has(text)) stats.common += 1;
              if (!parts.onset) stats.vowelOnset += 1;
              if (parts.cluster) stats.clusters += 1;
              if (parts.final) stats.finals += 1;
              if (parts.vowelId === 'o_implied') stats.implicit += 1;
            }
          }
        }
      }
    }
  }
  assert.equal(stats.configs, 48, '应该覆盖 3 × 2 × 2 × 2 × 2 = 48 种搭配');
  // 目录里这些分支要真的被走到，否则测试等于没测
  assert.ok(stats.clusters > 0, '辅音簇一次都没出现，说明这条分支没被覆盖');
  assert.ok(stats.finals > 0, '尾辅音一次都没出现');
  assert.ok(stats.vowelOnset > 0, '元音充当声母一次都没出现');
  assert.ok(stats.implicit > 0, '无元音符号的闭音节一次都没出现');
  console.log(`    · 随机模式：${stats.configs} 种搭配 / ${stats.syllables} 个音节`
    + `（常用词 ${stats.common}、辅音簇 ${stats.clusters}、尾辅音 ${stats.finals}`
    + `、元音充当声母 ${stats.vowelOnset}、无元音符号 ${stats.implicit}）`);
});

test('随机模式：每个音节上的每个合法声调都能选、且仍然合法', () => {
  let checked = 0;
  for (const strict of [false, true]) {
    for (let i = 0; i < 400; i += 1) {
      const parts = R.generate({
        consonants: CONSONANTS, vowels: VOWELS,
        allowClusters: true, allowFinal: true, allowVowelOnset: true, strict,
      });
      const options = R.toneOptions(parts, strict).filter((t) => t.allowed);
      assert.ok(options.length > 0, '至少要有一个可用声调');
      for (const tone of options) {
        const next = { ...parts, tone: tone.id };
        const text = R.assemble(next);
        assert.match(text, THAI, `声调 ${tone.id}：拼出来不是泰文`);
        if (strict) {
          assert.deepEqual(R.check(next), [], `声调 ${tone.id}：规则检查没通过`);
        }
        checked += 1;
      }
    }
  }
  assert.ok(checked > 1000, `声调组合覆盖太少（${checked}）`);
  console.log(`    · 声调：验证了 ${checked} 个「音节 × 合法声调」组合`);
});

test('固定模式：44 个辅音单选 × 规则开关', () => {
  let n = 0;
  for (const ch of CONSONANTS) {
    for (const strict of [true, false]) {
      const parts = R.fixedParts({ onset: ch, strict });
      assert.ok(parts, `单选辅音 ${ch} 不应该返回 null`);
      const text = R.assemble(parts);
      if (strict) {
        // 检查规则时补 สระออ，读作字母本身的音（กอ）
        assert.equal(text, `${ch}อ`, `单选辅音 ${ch} 在检查规则时应该补成 ${ch}อ`);
        assert.deepEqual(R.check(parts), [], `单选辅音 ${ch}：规则检查没通过`);
      } else {
        assert.equal(text, ch, `单选辅音 ${ch} 在不检查规则时应该只显示字母本身`);
      }
      assert.match(text, THAI, `单选辅音 ${ch}：拼出来不是泰文`);
      R.describe(parts, strict, 'latin');
      n += 1;
    }
  }
  assert.equal(n, CONSONANTS.length * 2);
  console.log(`    · 固定模式：${n} 个「辅音单选 × 规则开关」`);
});

test('固定模式：所有元音单选 × 规则开关', () => {
  let n = 0;
  for (const id of VOWELS) {
    const vowel = R.VOWELS.find((v) => v.id === id);
    for (const strict of [true, false]) {
      const parts = R.fixedParts({ vowelId: id, strict });
      assert.ok(parts, `单选元音 ${id} 不应该返回 null`);
      const text = R.assemble(parts);
      assert.match(text, THAI, `单选元音 ${id}：拼出来不是泰文`);
      // 自己能站住的（ฤ ฤๅ ฦ ฦๅ）任何时候都不补载体
      if (vowel.canBeOnset) {
        assert.equal(parts.onset, null, `${id} 能自己站住，不该补 อ`);
      } else if (strict) {
        assert.equal(parts.onset, 'อ', `${id} 在检查规则时应该用 อ 当载体`);
        // ั / เ-ิ / เ-็ 这类「必须带尾辅音」的元音，固定模式没有尾辅音可选，
        // 只能拼出一个不完整的音节——这是已知且界面会提示的情况，不算 bug
        const issues = R.check(parts);
        if (issues.length) {
          assert.ok(vowel.requiresFinal, `单选元音 ${id}：规则检查没通过（${issues.join('；')}）`);
          assert.deepEqual(issues, ['该元音必须带尾辅音'], `单选元音 ${id}：出现了意料之外的问题`);
        }
      }
      R.describe(parts, strict, 'ipa');
      n += 1;
    }
  }
  assert.equal(n, VOWELS.length * 2);
  console.log(`    · 固定模式：${n} 个「元音单选 × 规则开关」`);
});

test('固定模式：44 × 35 个辅音+元音搭配 × 规则开关', () => {
  let n = 0;
  let checked = 0;
  for (const ch of CONSONANTS) {
    for (const id of VOWELS) {
      for (const strict of [true, false]) {
        const parts = R.fixedParts({ onset: ch, vowelId: id, strict });
        assert.ok(parts, `${ch}+${id} 不应该返回 null`);
        const text = R.assemble(parts);
        assert.match(text, THAI, `${ch}+${id}：拼出来不是泰文`);
        assert.ok(text.includes(ch), `${ch}+${id}：拼出来的 ${text} 里没有这个辅音`);
        if (strict) {
          const issues = R.check(parts);
          if (issues.length) {
            // 同上：必须是「该元音必须带尾辅音」这一个已知情况
            const vowel = R.VOWELS.find((v) => v.id === id);
            assert.ok(vowel.requiresFinal, `${ch}+${id}：规则检查没通过（${issues.join('；')}）`);
            assert.deepEqual(issues, ['该元音必须带尾辅音'], `${ch}+${id}：出现了意料之外的问题`);
          } else {
            checked += 1;
          }
        }
        R.describe(parts, strict, 'latin');
        n += 1;
      }
    }
  }
  assert.equal(n, CONSONANTS.length * VOWELS.length * 2);
  console.log(`    · 固定模式：${n} 个「辅音×元音×规则开关」组合（其中 ${checked} 个通过规则检查）`);
});

test('辞典：常用词档抽到的词都在词表里，且都有中文释义', () => {
  assert.ok(DICT && Array.isArray(DICT.words), '辞典数据要能读出来');
  assert.ok(COMMON.size > 1000, `常用词太少（${COMMON.size}）`);
  assert.ok(ALL_WORDS.size > COMMON.size, '常用词应该是全部词表的一个子集');
  // 常用词拿来做「换一批」，必须都有中文释义，否则列表里会出现空行
  const blank = DICT.words.filter((e) => e[4] && !e[2]);
  assert.equal(blank.length, 0, `有 ${blank.length} 个常用词没有中文释义`);
  console.log(`    · 辞典：全文 ${ALL_WORDS.size} 词 / 常用 ${COMMON.size} 词`);
});
