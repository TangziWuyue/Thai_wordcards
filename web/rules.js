/**
 * 泰语拼写规则引擎（纯逻辑，无 DOM 依赖）
 *
 * 一个音节按泰文码点顺序拼装：
 *   [前引元音] [首辅音] [辅音簇第二字] [后置元音] [声调符号] [尾辅音]
 *      เ แ โ ใ ไ                                            ่ ้ ๊ ๋
 *
 * 注意：前引元音在码点里排在辅音前面，但显示在左半边，所以拼装顺序
 * 必须是「先前引、再辅音」，写成字符串才不会被拆开渲染。
 *
 * 引擎不校验组合是否是真实存在的泰语词，只保证码点顺序合法、不叠字。
 */
const ThaiRules = (() => {
  'use strict';

  // ── 辅音 ────────────────────────────────────────────────────────────
  // 泰语 44 个辅音，按音调规则分三类：中类(กลาง) / 高类(สูง) / 低类(ต่ำ)
  const CONSONANTS = [
    // 中类 9 个
    { ch: 'ก', roman: 'k', cls: 'mid' },
    { ch: 'จ', roman: 'j', cls: 'mid' },
    { ch: 'ฎ', roman: 'd', cls: 'mid', rare: true },
    { ch: 'ฏ', roman: 't', cls: 'mid', rare: true },
    { ch: 'ด', roman: 'd', cls: 'mid' },
    { ch: 'ต', roman: 't', cls: 'mid' },
    { ch: 'บ', roman: 'b', cls: 'mid' },
    { ch: 'ป', roman: 'p', cls: 'mid' },
    { ch: 'อ', roman: '', cls: 'mid' },
    // 高类 11 个
    { ch: 'ข', roman: 'kh', cls: 'high' },
    { ch: 'ฃ', roman: 'kh', cls: 'high', obsolete: true },
    { ch: 'ฉ', roman: 'ch', cls: 'high' },
    { ch: 'ฐ', roman: 'th', cls: 'high', rare: true },
    { ch: 'ถ', roman: 'th', cls: 'high' },
    { ch: 'ผ', roman: 'ph', cls: 'high' },
    { ch: 'ฝ', roman: 'f', cls: 'high' },
    { ch: 'ศ', roman: 's', cls: 'high', rare: true },
    { ch: 'ษ', roman: 's', cls: 'high', rare: true },
    { ch: 'ส', roman: 's', cls: 'high' },
    { ch: 'ห', roman: 'h', cls: 'high' },
    // 低类 24 个
    { ch: 'ค', roman: 'kh', cls: 'low' },
    { ch: 'ฅ', roman: 'kh', cls: 'low', obsolete: true },
    { ch: 'ฆ', roman: 'kh', cls: 'low', rare: true },
    { ch: 'ง', roman: 'ng', cls: 'low' },
    { ch: 'ช', roman: 'ch', cls: 'low' },
    { ch: 'ซ', roman: 's', cls: 'low' },
    { ch: 'ฌ', roman: 'ch', cls: 'low', rare: true },
    { ch: 'ญ', roman: 'y', cls: 'low', rare: true },
    { ch: 'ฑ', roman: 'th', cls: 'low', rare: true },
    { ch: 'ฒ', roman: 'th', cls: 'low', rare: true },
    { ch: 'ณ', roman: 'n', cls: 'low', rare: true },
    { ch: 'ท', roman: 'th', cls: 'low' },
    { ch: 'ธ', roman: 'th', cls: 'low', rare: true },
    { ch: 'น', roman: 'n', cls: 'low' },
    { ch: 'พ', roman: 'ph', cls: 'low' },
    { ch: 'ฟ', roman: 'f', cls: 'low' },
    { ch: 'ภ', roman: 'ph', cls: 'low', rare: true },
    { ch: 'ม', roman: 'm', cls: 'low' },
    { ch: 'ย', roman: 'y', cls: 'low' },
    { ch: 'ร', roman: 'r', cls: 'low' },
    { ch: 'ล', roman: 'l', cls: 'low' },
    { ch: 'ว', roman: 'w', cls: 'low' },
    { ch: 'ฬ', roman: 'l', cls: 'low', rare: true },
    { ch: 'ฮ', roman: 'h', cls: 'low' },
  ];

  const CLASS_LABEL = { mid: '中类', high: '高类', low: '低类' };

  // ── 元音 ────────────────────────────────────────────────────────────
  // lead   = 写在辅音左边的部分（前引元音）
  // follow = 写在辅音右边/上下的部分（后置元音）
  // roman / romanClosed = 开音节 / 带尾辅音时的参考注音
  // short  = 短元音；allowsFinal = 能否带尾辅音；requiresFinal = 必须带尾辅音
  const VOWELS = [
    { id: 'implicit', lead: '', follow: '', roman: 'o', romanClosed: 'o',
      short: false, allowsFinal: true, label: '— （无元音符号）' },
    { id: 'a', lead: '', follow: 'ะ', roman: 'a', romanClosed: null,
      short: true, allowsFinal: false, label: 'ะ ·a 短' },
    { id: 'aa', lead: '', follow: 'า', roman: 'aa', romanClosed: 'aa',
      short: false, allowsFinal: true, label: 'า ·aa 长' },
    { id: 'i', lead: '', follow: 'ิ', roman: 'i', romanClosed: 'i',
      short: true, allowsFinal: true, label: 'ิ ·i 短' },
    { id: 'ii', lead: '', follow: 'ี', roman: 'ii', romanClosed: 'ii',
      short: false, allowsFinal: true, label: 'ี ·ii 长' },
    { id: 'ue', lead: '', follow: 'ึ', roman: 'ue', romanClosed: 'ue',
      short: true, allowsFinal: true, label: 'ึ ·ue 短' },
    { id: 'uue', lead: '', follow: 'ื', roman: 'uue', romanClosed: 'uue',
      short: false, allowsFinal: true, label: 'ื ·uue 长' },
    { id: 'u', lead: '', follow: 'ุ', roman: 'u', romanClosed: 'u',
      short: true, allowsFinal: true, label: 'ุ ·u 短' },
    { id: 'uu', lead: '', follow: 'ู', roman: 'uu', romanClosed: 'uu',
      short: false, allowsFinal: true, label: 'ู ·uu 长' },
    { id: 'e', lead: 'เ', follow: '', roman: 'ee', romanClosed: 'e',
      short: false, allowsFinal: true, label: 'เ·  ee 长' },
    { id: 'ae', lead: 'แ', follow: '', roman: 'ɛɛ', romanClosed: 'ɛ',
      short: false, allowsFinal: true, label: 'แ·  ɛɛ 长' },
    { id: 'o', lead: 'โ', follow: '', roman: 'oo', romanClosed: 'o',
      short: false, allowsFinal: true, label: 'โ·  oo 长' },
    { id: 'ai_mai', lead: 'ใ', follow: '', roman: 'ai', romanClosed: null,
      short: false, allowsFinal: false, label: 'ใ·  ai' },
    { id: 'ai', lead: 'ไ', follow: '', roman: 'ai', romanClosed: null,
      short: false, allowsFinal: false, label: 'ไ·  ai' },
    { id: 'e_short', lead: 'เ', follow: 'ะ', roman: 'e', romanClosed: null,
      short: true, allowsFinal: false, label: 'เ-ะ ·e 短' },
    { id: 'ae_short', lead: 'แ', follow: 'ะ', roman: 'ɛ', romanClosed: null,
      short: true, allowsFinal: false, label: 'แ-ะ ·ɛ 短' },
    { id: 'o_short', lead: 'โ', follow: 'ะ', roman: 'o', romanClosed: null,
      short: true, allowsFinal: false, label: 'โ-ะ ·o 短' },
    { id: 'e_closed', lead: 'เ', follow: 'ิ', roman: 'e', romanClosed: 'e',
      short: true, allowsFinal: true, requiresFinal: true,
      label: 'เ-ิ ·e 短（必带尾辅音）' },
  ];

  // ── 声调符号 ────────────────────────────────────────────────────────
  const TONES = [
    { id: 'none', mark: '', name: '无音调', shortName: '无' },
    { id: 'ek', mark: '่', name: 'ไม้เอก', shortName: 'เอก' },
    { id: 'tho', mark: '้', name: 'ไม้โท', shortName: 'โท' },
    // ตรี / จัตวา 在真实泰语里只和中类辅音搭配
    { id: 'tri', mark: '๊', name: 'ไม้ตรี', shortName: 'ตรี', midOnly: true },
    { id: 'chattawa', mark: '๋', name: 'ไม้จัตวา', shortName: 'จัตวา', midOnly: true },
  ];

  // ── 辅音簇（首辅音 + ร/ล/ว）────────────────────────────────────────
  const CLUSTERS = [
    ['ก', 'ร'], ['ก', 'ล'], ['ข', 'ร'], ['ข', 'ล'], ['ค', 'ร'], ['ค', 'ล'],
    ['จ', 'ร'], ['ป', 'ร'], ['ป', 'ล'], ['ต', 'ร'], ['บ', 'ร'], ['ผ', 'ล'],
    ['พ', 'ร'], ['พ', 'ล'], ['ฟ', 'ร'], ['ด', 'ร'],
  ];

  // ── 可作尾辅音的辅音 ────────────────────────────────────────────────
  // sonorant = 响音（ง น ม ย ว ล），其余为塞音尾
  const FINALS = {
    'ง': { roman: 'ng', sonorant: true },
    'น': { roman: 'n', sonorant: true },
    'ม': { roman: 'm', sonorant: true },
    'ย': { roman: 'y', sonorant: true },
    'ว': { roman: 'o', sonorant: true },
    'ล': { roman: 'n', sonorant: true },
    'ก': { roman: 'k', sonorant: false },
    'ข': { roman: 'k', sonorant: false },
    'ค': { roman: 'k', sonorant: false },
    'ด': { roman: 't', sonorant: false },
    'ต': { roman: 't', sonorant: false },
    'บ': { roman: 'p', sonorant: false },
    'ป': { roman: 'p', sonorant: false },
    'พ': { roman: 'p', sonorant: false },
    'ฟ': { roman: 'p', sonorant: false },
    'ส': { roman: 't', sonorant: false },
    'ศ': { roman: 't', sonorant: false },
    'ษ': { roman: 't', sonorant: false },
  };

  const CONSONANT_MAP = new Map(CONSONANTS.map((c) => [c.ch, c]));
  const VOWEL_MAP = new Map(VOWELS.map((v) => [v.id, v]));
  const TONE_MAP = new Map(TONES.map((t) => [t.id, t]));

  const LEAD_VOWEL_CHARS = ['เ', 'แ', 'โ', 'ใ', 'ไ'];
  const FOLLOW_VOWEL_CHARS = ['ะ', 'า', 'ิ', 'ี', 'ึ', 'ื', 'ุ', 'ู'];
  const TONE_CHARS = TONES.map((t) => t.mark).filter(Boolean);

  function isConsonant(ch) {
    return CONSONANT_MAP.has(ch);
  }

  function classOf(ch) {
    const c = CONSONANT_MAP.get(ch);
    return c ? c.cls : null;
  }

  function toneMark(toneId) {
    const t = TONE_MAP.get(toneId);
    return t ? t.mark : '';
  }

  /** 该元音在这个音节里是否算短元音（影响能否标声调） */
  function isShortVowel(vowel, hasFinal) {
    if (vowel.id === 'implicit') return hasFinal;
    return !!vowel.short;
  }

  /**
   * 声调可选性。
   * strict = true 时按泰语规则禁用：
   *   - ๊ / ๋ 仅限中类首辅音
   *   - 声调符号需要「有尾辅音」或「长元音」，短元音开音节不能标
   */
  function toneOptions(parts, strict) {
    const vowel = VOWEL_MAP.get(parts.vowelId);
    const cls = classOf(parts.onset);
    const hasFinal = !!parts.final;
    return TONES.map((tone) => {
      if (tone.id === 'none') return { ...tone, allowed: true, reason: '' };
      if (!strict) return { ...tone, allowed: true, reason: '' };
      if (tone.midOnly && cls !== 'mid') {
        return { ...tone, allowed: false, reason: `${tone.shortName} 只用于中类辅音` };
      }
      if (vowel && isShortVowel(vowel, hasFinal) && !hasFinal) {
        return { ...tone, allowed: false, reason: '短元音开音节不能标声调' };
      }
      return { ...tone, allowed: true, reason: '' };
    });
  }

  /** 按泰文码点顺序拼装成字符串 */
  function assemble(parts) {
    return (
      (parts.lead || '') +
      parts.onset +
      (parts.cluster || '') +
      (parts.follow || '') +
      toneMark(parts.tone) +
      (parts.final || '')
    );
  }

  /** 参考注音（近似，不含声调） */
  function romanize(parts) {
    const vowel = VOWEL_MAP.get(parts.vowelId);
    const onset = (CONSONANT_MAP.get(parts.onset) || { roman: '' }).roman;
    const cluster = parts.cluster ? (CONSONANT_MAP.get(parts.cluster) || { roman: '' }).roman : '';
    const hasFinal = !!parts.final;
    let v = vowel.roman;
    if (hasFinal && vowel.romanClosed) v = vowel.romanClosed;
    const final = hasFinal ? (FINALS[parts.final] || { roman: '' }).roman : '';
    return onset + cluster + v + final;
  }

  /**
   * 自检：返回问题列表，空数组表示码点顺序与规则都合法。
   * 先把字符串按 parts 逐段吃掉、记下每个字符的角色，再检查角色顺序，
   * 这样首辅音与尾辅音同字（如 ปลื่ป）也不会误判。
   */
  function check(parts) {
    const issues = [];
    const chars = [...assemble(parts)];
    const vowel = VOWEL_MAP.get(parts.vowelId);

    const unknown = chars.filter(
      (ch) =>
        !isConsonant(ch) &&
        !LEAD_VOWEL_CHARS.includes(ch) &&
        !FOLLOW_VOWEL_CHARS.includes(ch) &&
        !TONE_CHARS.includes(ch),
    );
    if (unknown.length) issues.push(`未知字符 ${unknown.join('')}`);

    const toneCount = chars.filter((ch) => TONE_CHARS.includes(ch)).length;
    if (toneCount > 1) issues.push('出现多个声调符号');

    // 按 canonical 顺序把 parts 铺到字符串上，得到每个字符的角色
    const pieces = [
      ['lead', parts.lead || ''],
      ['onset', parts.onset || ''],
      ['cluster', parts.cluster || ''],
      ['follow', parts.follow || ''],
      ['tone', toneMark(parts.tone)],
      ['final', parts.final || ''],
    ];
    const roles = [];
    let cursor = 0;
    let aligned = true;
    for (const [role, text] of pieces) {
      for (const ch of text) {
        if (chars[cursor] !== ch) aligned = false;
        roles[cursor] = role;
        cursor += 1;
      }
    }
    if (!aligned || cursor !== chars.length) issues.push('拼装顺序与 parts 不一致');

    const at = (role) => roles.indexOf(role);
    const firstConsonant = chars.findIndex(isConsonant);

    // 前引元音必须排在首个辅音之前（码点顺序错就会渲染错位）
    if (at('lead') !== -1 && at('lead') > firstConsonant) {
      issues.push('前引元音排在辅音之后');
    }
    for (let i = 0; i < chars.length; i += 1) {
      if (LEAD_VOWEL_CHARS.includes(chars[i]) && i > firstConsonant) {
        issues.push('前引元音排在辅音之后');
        break;
      }
    }

    if (at('tone') !== -1) {
      if (at('follow') !== -1 && at('follow') > at('tone')) issues.push('声调符号排在后置元音之前');
      if (at('final') !== -1 && at('final') < at('tone')) issues.push('尾辅音排在声调符号之前');
      if (at('tone') < firstConsonant) issues.push('声调符号排在辅音之前');
      if (vowel && isShortVowel(vowel, !!parts.final) && !parts.final) {
        issues.push('短元音开音节标了声调');
      }
      if (TONE_MAP.get(parts.tone)?.midOnly && classOf(parts.onset) !== 'mid') {
        issues.push('ตรี/จัตวา 用在了非中类辅音上');
      }
    }

    if (parts.final) {
      if (!FINALS[parts.final]) issues.push(`辅音 ${parts.final} 不能作尾辅音`);
      if (vowel && !vowel.allowsFinal) issues.push('该元音不能带尾辅音');
      if (roles[chars.length - 1] !== 'final') issues.push('尾辅音不在末尾');
    }
    if (vowel && vowel.requiresFinal && !parts.final) issues.push('该元音必须带尾辅音');
    if (parts.cluster) {
      if (at('cluster') !== at('onset') + 1) issues.push('辅音簇不相邻');
    }

    return issues;
  }

  function pick(list, rng) {
    return list[Math.min(list.length - 1, Math.floor(rng() * list.length))];
  }

  /** 某个辅音声调类别可用的所有声调（供随机用） */
  function allowedTones(parts, strict) {
    return toneOptions(parts, strict).filter((t) => t.allowed).map((t) => t.id);
  }

  /**
   * 随机生成一个音节。
   * @param {object} options
   * @param {string[]} options.consonants 选中的辅音字符
   * @param {string[]} options.vowels     选中的元音 id
   * @param {boolean} [options.allowClusters] 是否允许辅音簇
   * @param {boolean} [options.allowFinal]    是否可能带尾辅音
   * @param {boolean} [options.strict]        是否遵守声调规则
   * @param {function} [options.rng]          随机源，便于测试
   */
  function generate(options = {}) {
    const {
      consonants = [],
      vowels = [],
      allowClusters = false,
      allowFinal = true,
      strict = true,
      rng = Math.random,
    } = options;

    const onsets = consonants.filter(isConsonant);
    const vowelList = vowels.map((id) => VOWEL_MAP.get(id)).filter(Boolean);
    if (!onsets.length || !vowelList.length) return null;

    const finalCandidates = allowFinal ? onsets.filter((ch) => FINALS[ch]) : [];

    // 元音要挑「约束能满足」的
    const usableVowels = vowelList.filter(
      (v) => !(v.requiresFinal && !finalCandidates.length),
    );
    if (!usableVowels.length) return null;

    const onset = pick(onsets, rng);
    let cluster = null;
    if (allowClusters) {
      const pairs = CLUSTERS.filter(([a, b]) => a === onset && consonants.includes(b));
      if (pairs.length && rng() < 0.5) cluster = pick(pairs, rng)[1];
    }

    const vowel = pick(usableVowels, rng);

    let final = null;
    if (vowel.allowsFinal && finalCandidates.length) {
      if (vowel.requiresFinal || rng() < 0.5) final = pick(finalCandidates, rng);
    }

    const parts = {
      vowelId: vowel.id,
      lead: vowel.lead,
      onset,
      cluster,
      follow: vowel.follow,
      tone: 'none',
      final,
    };

    const tones = allowedTones(parts, strict);
    // 无音调权重高一点，避免每张卡都带符号
    const weighted = tones.filter((id) => id === 'none' || rng() < 0.6);
    parts.tone = pick(weighted.length ? weighted : tones, rng);

    return parts;
  }

  /** 生成结果的完整快照，供界面渲染 */
  function describe(parts, strict = true) {
    const vowel = VOWEL_MAP.get(parts.vowelId);
    const consonant = CONSONANT_MAP.get(parts.onset) || {};
    const tone = TONE_MAP.get(parts.tone) || TONE_MAP.get('none');
    return {
      parts,
      text: assemble(parts),
      roman: romanize(parts),
      toneName: tone.name,
      onsetClass: consonant.cls,
      onsetClassLabel: CLASS_LABEL[consonant.cls] || '',
      vowelLabel: vowel ? vowel.label : '',
      finalRoman: parts.final ? (FINALS[parts.final] || {}).roman || '' : '',
      tones: toneOptions(parts, strict),
      issues: check(parts),
    };
  }

  return {
    CONSONANTS,
    VOWELS,
    TONES,
    CLUSTERS,
    FINALS,
    CLASS_LABEL,
    LEAD_VOWEL_CHARS,
    FOLLOW_VOWEL_CHARS,
    TONE_CHARS,
    isConsonant,
    classOf,
    toneMark,
    toneOptions,
    allowedTones,
    assemble,
    romanize,
    check,
    generate,
    describe,
    isShortVowel,
  };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = ThaiRules;
if (typeof window !== 'undefined') window.ThaiRules = ThaiRules;
