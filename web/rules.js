/**
 * 泰语拼写规则引擎（纯逻辑，无 DOM 依赖）
 *
 * 一个音节按泰文码点顺序拼装：
 *   [前引元音] [首辅音] [辅音簇第二字] [元音前段] [声调符号] [元音后段] [尾辅音]
 *      เ แ โ ใ ไ                        า ิ ี ึ ื ุ ู  ่ ้ ๊ ๋   ะ ำ อ า ย ว
 *
 * 注意：前引元音在码点里排在辅音前面，但显示在左半边，所以拼装顺序
 * 必须是「先前引、再辅音」，写成字符串才不会被拆开渲染。
 * 声调符号的位置则在「元音前段之后、元音后段与尾辅音之前」：
 *   น้ำ = น + ้ + ำ ，เปล่า = เ + ป + ล + ่ + า ，ชั่ว = ช + ั + ่ + ว
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

  // ── 元音（สระ 32 รูป）──────────────────────────────────────────────
  // 分组与名称、音标、例词对齐《基础泰语（1）》的元音表：
  //   单元音 18（สระเดี่ยว）+ 复合元音 6（สระประสม）+ 超额元音 8（สระเกิน）= 32，
  // 另外单列 4 个「拼写变体」（课本不单独计入 32）：ั / เ-ิ / เ-็ / 无元音符号。
  //
  // name   = 课本的泰文名称（สระ อา）
  // en     = 课本的英文名称（sara aa）
  // roman  = 课本「音标」列，也用作卡片上的参考注音
  // example= 课本「例词」列（个别课本留空的，用常见词补）
  // lead   = 写在辅音左边的部分（前引元音）
  // follow = 紧跟在辅音后、声调符号之前的元音段
  // tail   = 声调符号之后、尾辅音之前的元音段（ะ ำ อ า ย ว 都是这一段的常客）
  // short  = 短音；allowsFinal = 能否带尾辅音；requiresFinal = 必须带尾辅音
  // noTone = 该元音不写声调符号（写声调时要换写法）
  // dropFollowWithFinal = 带尾辅音时省掉 follow 段（ัว 的 ั 会消失：สวย / ช่วง）
  // canBeOnset = 可以单独当声母用（ฤ ฤๅ ฦ ฦๅ，如 ฤดู / ฤษี）
  const VOWELS = [
    // ── 单元音 18 ──
    { id: 'a', group: 'single', name: 'สระ อะ', en: 'sara a', roman: 'a',
      example: 'ปะ = pa', lead: '', follow: '', tail: 'ะ',
      short: true, allowsFinal: false },
    { id: 'aa', group: 'single', name: 'สระ อา', en: 'sara aa', roman: 'a',
      example: 'มา = ma', lead: '', follow: 'า', tail: '',
      short: false, allowsFinal: true },
    { id: 'i', group: 'single', name: 'สระ อิ', en: 'sara i', roman: 'i',
      example: 'มิ = mi', lead: '', follow: 'ิ', tail: '',
      short: true, allowsFinal: true },
    { id: 'ii', group: 'single', name: 'สระ อี', en: 'sara ii', roman: 'i',
      example: 'มีด = mit', lead: '', follow: 'ี', tail: '',
      short: false, allowsFinal: true },
    { id: 'ue', group: 'single', name: 'สระ อึ', en: 'sara ue', roman: 'ue',
      example: 'นึก = nuek', lead: '', follow: 'ึ', tail: '',
      short: true, allowsFinal: true },
    { id: 'uue', group: 'single', name: 'สระ อือ', en: 'sara uee', roman: 'ue',
      example: 'หรือ = rue', lead: '', follow: 'ื', tail: '',
      short: false, allowsFinal: true },
    { id: 'u', group: 'single', name: 'สระ อุ', en: 'sara u', roman: 'u',
      example: 'คุณ = khun', lead: '', follow: 'ุ', tail: '',
      short: true, allowsFinal: true },
    { id: 'uu', group: 'single', name: 'สระ อู', en: 'sara uu', roman: 'u',
      example: 'หรู = ru', lead: '', follow: 'ู', tail: '',
      short: false, allowsFinal: true },
    { id: 'e_short', group: 'single', name: 'สระ เอะ', en: 'sara eh', roman: 'e',
      example: 'เละ = le', lead: 'เ', follow: '', tail: 'ะ',
      short: true, allowsFinal: false },
    { id: 'e', group: 'single', name: 'สระ เอ', en: 'sara e', roman: 'e',
      example: 'เลน = len', lead: 'เ', follow: '', tail: '',
      short: false, allowsFinal: true },
    { id: 'ae_short', group: 'single', name: 'สระ แอะ', en: 'sara aeh', roman: 'ae',
      example: 'และ = lae', lead: 'แ', follow: '', tail: 'ะ',
      short: true, allowsFinal: false },
    { id: 'ae', group: 'single', name: 'สระ แอ', en: 'sara ae', roman: 'ae',
      example: 'แสง = saeng', lead: 'แ', follow: '', tail: '',
      short: false, allowsFinal: true },
    { id: 'o_short', group: 'single', name: 'สระ โอะ', en: 'sara oh', roman: 'o',
      example: 'โละ = lo', lead: 'โ', follow: '', tail: 'ะ',
      short: true, allowsFinal: false },
    { id: 'o', group: 'single', name: 'สระ โอ', en: 'sara o', roman: 'o',
      example: 'โล้ = lo', lead: 'โ', follow: '', tail: '',
      short: false, allowsFinal: true },
    { id: 'o_short_open', group: 'single', name: 'สระ เอาะ', en: 'sara orh', roman: 'o',
      example: 'เลาะ = lo', lead: 'เ', follow: '', tail: 'าะ',
      short: true, allowsFinal: false },
    { id: 'o_long', group: 'single', name: 'สระ ออ', en: 'sara or', roman: 'o',
      example: 'ลอม = lom', lead: '', follow: '', tail: 'อ',
      short: false, allowsFinal: true },
    { id: 'oe_short', group: 'single', name: 'สระ เออะ', en: 'sara oeh', roman: 'oe',
      example: 'เลอะ = loe', lead: 'เ', follow: '', tail: 'อะ',
      short: true, allowsFinal: false },
    { id: 'oe', group: 'single', name: 'สระ เออ', en: 'sara oe', roman: 'oe',
      example: 'เธอ = thoe', lead: 'เ', follow: '', tail: 'อ',
      short: false, allowsFinal: false },
    // ── 复合元音 6 ──
    { id: 'ua_short', group: 'compound', name: 'สระ อัวะ', en: 'sara uah', roman: 'ua',
      example: 'ผัวะ = phua', lead: '', follow: 'ั', tail: 'วะ',
      short: true, allowsFinal: false, noTone: true },
    { id: 'ua', group: 'compound', name: 'สระ อัว', en: 'sara ua', roman: 'ua',
      example: 'มัว = mua', lead: '', follow: 'ั', tail: 'ว', dropFollowWithFinal: true,
      short: false, allowsFinal: true },
    { id: 'ia_short', group: 'compound', name: 'สระ เอียะ', en: 'sara iah', roman: 'ia',
      example: 'เผียะ = phia', lead: 'เ', follow: 'ี', tail: 'ยะ',
      short: true, allowsFinal: false, noTone: true },
    { id: 'ia', group: 'compound', name: 'สระ เอีย', en: 'sara ia', roman: 'ia',
      example: 'เลียน = lian', lead: 'เ', follow: 'ี', tail: 'ย',
      short: false, allowsFinal: true },
    { id: 'uea_short', group: 'compound', name: 'สระ เอือะ', en: 'sara uaeh', roman: 'uae',
      lead: 'เ', follow: 'ื', tail: 'อะ',
      short: true, allowsFinal: false, noTone: true },
    { id: 'uea', group: 'compound', name: 'สระ เอือ', en: 'sara uea', roman: 'uae',
      example: 'เลือก = luaek', lead: 'เ', follow: 'ื', tail: 'อ',
      short: false, allowsFinal: true },
    // ── 超额元音 8 ──
    { id: 'rue', group: 'extra', name: 'สระ รึ', en: 'sara rue', roman: 'rue',
      example: 'ฤดู = ruedu', lead: '', follow: 'ฤ', tail: '',
      short: true, allowsFinal: false, noTone: true, canBeOnset: true },
    { id: 'ruee', group: 'extra', name: 'สระ รือ', en: 'sara ruee', roman: 'rue',
      example: 'ฤษี = ruesi', lead: '', follow: 'ฤๅ', tail: '',
      short: false, allowsFinal: false, noTone: true, canBeOnset: true },
    { id: 'lue', group: 'extra', name: 'สระ ลึ', en: 'sara lue', roman: 'lue',
      lead: '', follow: 'ฦ', tail: '',
      short: true, allowsFinal: false, noTone: true, canBeOnset: true },
    { id: 'luee', group: 'extra', name: 'สระ ลือ', en: 'sara luee', roman: 'lue',
      lead: '', follow: 'ฦๅ', tail: '',
      short: false, allowsFinal: false, noTone: true, canBeOnset: true },
    { id: 'am', group: 'extra', name: 'สระ อำ', en: 'sara am', roman: 'am',
      example: 'รำ = ram', lead: '', follow: '', tail: 'ำ',
      short: true, allowsFinal: false },
    { id: 'ai_mai', group: 'extra', name: 'สระ ใอ', en: 'sara ai mai muan', roman: 'ai',
      example: 'ใย = yai', lead: 'ใ', follow: '', tail: '',
      short: false, allowsFinal: true },
    { id: 'ai', group: 'extra', name: 'สระ ไอ', en: 'sara ai mai malai', roman: 'ai',
      example: 'ไทย = thai', lead: 'ไ', follow: '', tail: '',
      short: false, allowsFinal: true },
    { id: 'ao', group: 'extra', name: 'สระ เอา', en: 'sara ao', roman: 'ao',
      example: 'เมา = mao', lead: 'เ', follow: '', tail: 'า',
      short: false, allowsFinal: true },
    // ── 拼写变体 4（不单独计入 32）──
    { id: 'a_short', group: 'variant', name: 'ไม้หันอากาศ', en: 'mai han akat', roman: 'a',
      example: 'กัน = kan', lead: '', follow: 'ั', tail: '',
      short: true, allowsFinal: true, requiresFinal: true,
      note: '闭音节里的 สระ อะ' },
    { id: 'e_closed', group: 'variant', name: 'สระ เออ (เ-ิ)', en: 'sara oe (closed)', roman: 'oe',
      example: 'เกิด = koet', lead: 'เ', follow: 'ิ', tail: '',
      short: true, allowsFinal: true, requiresFinal: true,
      note: '闭音节里的 สระ เออ' },
    { id: 'e_taikhu', group: 'variant', name: 'ไม้ไต่คู้', en: 'mai taikhu', roman: 'e',
      example: 'เก็ง = keng', lead: 'เ', follow: '็', tail: '',
      short: true, allowsFinal: true, requiresFinal: true, noTone: true,
      note: '闭音节里的 สระ เอ / แอ，不写声调符号' },
    { id: 'o_implied', group: 'variant', name: 'สระ โอะ (ไม่มีรูป)', en: 'sara oh (implied)', roman: 'o',
      example: 'กบ = kop', lead: '', follow: '', tail: '',
      short: true, allowsFinal: true, requiresFinal: true,
      // optionOnly：不在词表里显示，由「允许无元音符号的闭音节（กบ）」这个开关控制
      optionOnly: true,
      note: '没有元音符号的闭音节（如 กบ = kop）' },

    // 内部用（不出现在词表里）：固定模式 + 关闭拼写规则时「不补位」，
    // 卡片上只显示辅音本身。没有 lead/follow/tail，所以拼出来就是孤零零一个辅音。
    { id: 'none', group: 'internal', name: '（无元音）', en: 'no vowel', roman: '', ipa: '—',
      lead: '', follow: '', tail: '',
      short: false, allowsFinal: false, noTone: true, internal: true },
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

  // ── 复合声母 ────────────────────────────────────────────────────────
  // ① อักษรควบแท้（真簇）：两个字母都要读出来
  //    กร กล ขร ขล คร คล ตร ปร ปล พร พล ฟร กว ขว คว
  const TRUE_CLUSTERS = [
    ['ก', 'ร'], ['ก', 'ล'], ['ข', 'ร'], ['ข', 'ล'], ['ค', 'ร'], ['ค', 'ล'],
    ['ต', 'ร'], ['ป', 'ร'], ['ป', 'ล'], ['พ', 'ร'], ['พ', 'ล'], ['ฟ', 'ร'],
    ['ก', 'ว'], ['ข', 'ว'], ['ค', 'ว'],
  ];

  // ② อักษรนำ（前引辅音）：ห 打头、后面跟响音时 ห 不发音，只把后面那个低类辅音变成高类
  //    หมา = ma   หรู = ru   หนู = nu   ใหญ่ = yai
  const LEADING_H_CLUSTERS = [
    ['ห', 'ง'], ['ห', 'ญ'], ['ห', 'น'], ['ห', 'ม'], ['ห', 'ย'], ['ห', 'ร'], ['ห', 'ล'], ['ห', 'ว'],
  ];

  // ③ อักษรควบไม่แท้（假簇）：第二个字母不按字面读
  //    จริง = jing（ร 不发音）   ศรี = sii（ร 不发音）    ทราย = saai（整体读 s）
  const SILENT_SECOND_CLUSTERS = [
    ['จ', 'ร'], ['ศ', 'ร'],
  ];
  const REPLACED_CLUSTERS = {
    'ทร': { book: 's', ipa: 's' },
  };

  const CLUSTERS = [...TRUE_CLUSTERS, ...LEADING_H_CLUSTERS, ...SILENT_SECOND_CLUSTERS, ...Object.keys(REPLACED_CLUSTERS).map((pair) => [...pair])];

  const SILENT_H_PAIRS = new Set(LEADING_H_CLUSTERS.map((pair) => pair.join('')));
  const SILENT_SECOND_PAIRS = new Set(SILENT_SECOND_CLUSTERS.map((pair) => pair.join('')));

  /** 这个声母 + 辅音簇是不是「前引 ห」组合（ห 不发音） */
  function isLeadingH(onset, cluster) {
    return SILENT_H_PAIRS.has(`${onset}${cluster || ''}`);
  }

  /** 单个辅音的国际音标写法（供界面显示） */
  function consonantIPA(ch) {
    const c = CONSONANT_MAP.get(ch);
    if (!c) return '';
    // 不用 ?? / ?. ：老版本 iOS Safari 不支持，会让整个脚本报语法错误
    return Object.prototype.hasOwnProperty.call(CONSONANT_IPA, c.roman)
      ? CONSONANT_IPA[c.roman]
      : c.roman;
  }

  /** 复合声母的注音说明（没有特殊情况时返回空字符串） */
  function clusterNote(onset, cluster) {
    if (!cluster) return '';
    const pair = `${onset}${cluster}`;
    if (SILENT_H_PAIRS.has(pair)) return '前引 ห 不发音';
    if (SILENT_SECOND_PAIRS.has(pair)) return `${cluster} 不发音`;
    if (REPLACED_CLUSTERS[pair]) return `${pair} 整体读 ${REPLACED_CLUSTERS[pair].book}`;
    return '';
  }

  // ── 尾辅音（ตัวสะกด）────────────────────────────────────────────────
  // 44 个辅音里只有 ฃ ฅ ผ ฝ ห อ ฮ 不能作尾辅音，其余按实际读音归类：
  //   แม่กก(k)  ก ข ค ฆ        แม่กด(t)  จ ฉ ช ซ ฌ ฎ ฏ ฐ ฑ ฒ ด ต ถ ท ธ ศ ษ ส
  //   แม่กบ(p)  บ ป พ ฟ ภ      แม่กน(n)  ญ ณ น ร ล ฬ
  //   แม่กง(ng) ง               แม่กม(m)  ม
  //   แม่เกย(y) ย               แม่เกอว(w) ว
  // sonorant = 响音尾（读长音、活音节），其余为塞音尾
  const FINAL_GROUPS = {
    k: ['ก', 'ข', 'ค', 'ฆ'],
    t: ['จ', 'ฉ', 'ช', 'ซ', 'ฌ', 'ฎ', 'ฏ', 'ฐ', 'ฑ', 'ฒ', 'ด', 'ต', 'ถ', 'ท', 'ธ', 'ศ', 'ษ', 'ส'],
    p: ['บ', 'ป', 'พ', 'ฟ', 'ภ'],
    n: ['ญ', 'ณ', 'น', 'ร', 'ล', 'ฬ'],
    ng: ['ง'],
    m: ['ม'],
    y: ['ย'],
    w: ['ว'],
  };

  // 国际音标写法：辅音（按课本注音推导）、尾辅音、元音
  // 尾辅音在拉丁转写里的写法：แม่เกย 写 i（ไทย = thai）、แม่เกอว 写 o（แมว = maeo）
  const FINAL_ROMAN = { k: 'k', t: 't', p: 'p', n: 'n', ng: 'ng', m: 'm', y: 'i', w: 'o' };

  const CONSONANT_IPA = {
    k: 'k', kh: 'kʰ', ch: 'tɕʰ', th: 'tʰ', ph: 'pʰ', f: 'f', s: 's', h: 'h',
    ng: 'ŋ', n: 'n', m: 'm', y: 'j', r: 'r', l: 'l', w: 'w',
    j: 'tɕ', d: 'd', b: 'b', p: 'p', t: 't', '': 'ʔ',
  };
  const FINAL_IPA = { k: 'k', t: 't', p: 'p', n: 'n', ng: 'ŋ', m: 'm', y: 'j', w: 'w' };
  const VOWEL_IPA = {
    a: 'a', aa: 'aː', i: 'i', ii: 'iː', ue: 'ɯ', uue: 'ɯː', u: 'u', uu: 'uː',
    e_short: 'e', e: 'eː', ae_short: 'ɛ', ae: 'ɛː', o_short: 'o', o: 'oː',
    o_short_open: 'ɔ', o_long: 'ɔː', oe_short: 'ɤ', oe: 'ɤː',
    // 复合元音按泰语习惯不标长音符号，长短由「短音/长音」提示体现
    ua_short: 'ua', ua: 'ua', ia_short: 'ia', ia: 'ia', uea_short: 'ɯa', uea: 'ɯa',
    rue: 'rɯ', ruee: 'rɯː', lue: 'lɯ', luee: 'lɯː',
    am: 'am', ai_mai: 'aj', ai: 'aj', ao: 'aw',
    a_short: 'a', e_closed: 'ɤ', e_taikhu: 'e', o_implied: 'o',
  };

  const FINALS = (() => {
    const table = {};
    for (const [sound, chars] of Object.entries(FINAL_GROUPS)) {
      const sonorant = ['n', 'ng', 'm', 'y', 'w'].includes(sound);
      for (const ch of chars) {
        table[ch] = { roman: FINAL_ROMAN[sound], ipa: FINAL_IPA[sound], sonorant };
      }
    }
    return table;
  })();

  const CONSONANT_MAP = new Map(CONSONANTS.map((c) => [c.ch, c]));

  // 44 个字母的传统例词（ก ไก่ ข ไข่ …），[例词, 中文义]
  const CONSONANT_EXAMPLES = {
    ก: ['ไก่', '鸡'], จ: ['จาน', '盘子'], ฎ: ['ชฎา', '尖顶冠'], ฏ: ['ปฏัก', '刺棒'],
    ด: ['เด็ก', '小孩'], ต: ['เต่า', '乌龟'], บ: ['ใบไม้', '树叶'], ป: ['ปลา', '鱼'],
    อ: ['อ่าง', '盆'],
    ข: ['ไข่', '蛋'], ฃ: ['ขวด', '瓶子'], ฉ: ['ฉิ่ง', '小钹'], ฐ: ['ฐาน', '基座'],
    ถ: ['ถุง', '袋子'], ผ: ['ผึ้ง', '蜜蜂'], ฝ: ['ฝา', '盖子'], ศ: ['ศาลา', '凉亭'],
    ษ: ['ฤๅษี', '修行者'], ส: ['เสือ', '老虎'], ห: ['หีบ', '箱子'],
    ค: ['ควาย', '水牛'], ฅ: ['ฅน', '人'], ฆ: ['ระฆัง', '钟'], ง: ['งู', '蛇'],
    ช: ['ช้าง', '大象'], ซ: ['โซ่', '链子'], ฌ: ['เฌอ', '树'], ญ: ['หญิง', '女人'],
    ฑ: ['มณโฑ', '《拉玛坚》人物'], ฒ: ['ผู้เฒ่า', '老人'], ณ: ['เณร', '小沙弥'], ท: ['ทหาร', '士兵'],
    ธ: ['ธง', '旗子'], น: ['หนู', '老鼠'], พ: ['พาน', '托盘'], ฟ: ['ฟัน', '牙齿'],
    ภ: ['สำเภา', '帆船'], ม: ['ม้า', '马'], ย: ['ยักษ์', '夜叉'], ร: ['เรือ', '船'],
    ล: ['ลิง', '猴子'], ว: ['แหวน', '戒指'], ฬ: ['จุฬา', '风筝'], ฮ: ['นกฮูก', '猫头鹰'],
  };
  for (const c of CONSONANTS) {
    const [word, gloss] = CONSONANT_EXAMPLES[c.ch] || [];
    c.example = word || '';
    c.gloss = gloss || '';
  }
  const VOWEL_MAP = new Map(VOWELS.map((v) => [v.id, v]));
  const TONE_MAP = new Map(TONES.map((t) => [t.id, t]));
  /** 词表里默认能勾选的元音：排除内部项，以及要用开关单独开启的项 */
  const isSelectableVowel = (v) => !v.internal && !v.optionOnly;
  const SELECTABLE_VOWEL_IDS = VOWELS.filter(isSelectableVowel).map((v) => v.id);
  // 每个元音都带上国际音标写法
  for (const v of VOWELS) v.ipa = VOWEL_IPA[v.id] || v.roman;

  /** 卡片注音可选的两种转写方式 */
  const ROMAN_SYSTEMS = [
    { id: 'latin', label: '罗马注音', note: '用拉丁字母拼读，与《基础泰语（1）》音标列一致；不区分长短音' },
    { id: 'ipa', label: '国际音标', note: 'IPA 写法，长音用 ː 标出' },
  ];
  const VOWEL_GROUPS = [
    { id: 'single', label: '单元音', thai: 'สระเดี่ยว' },
    { id: 'compound', label: '复合元音', thai: 'สระประสม' },
    { id: 'extra', label: '超额元音', thai: 'สระเกิน' },
    { id: 'variant', label: '拼写变体', thai: 'รูปเขียนพิเศษ' },
  ].map((g) => ({ ...g, count: VOWELS.filter((v) => v.group === g.id).length }));

  const LEAD_VOWEL_CHARS = ['เ', 'แ', 'โ', 'ใ', 'ไ'];
  const FOLLOW_VOWEL_CHARS = ['ะ', 'า', 'ิ', 'ี', 'ึ', 'ื', 'ุ', 'ู'];
  const TONE_CHARS = TONES.map((t) => t.mark).filter(Boolean);
  // 所有出现在元音各段里的字符（新增元音时自动生效，不用再手改名单）
  const VOWEL_CHARS = new Set(
    VOWELS.flatMap((v) => [...((v.lead || '') + (v.follow || '') + (v.tail || ''))]),
  );
  // 贴在辅音上方 / 下方的组合符号（界面上单独显示时需要做垂直微调）
  const ABOVE_COMBINING_CHARS = new Set(['ั', 'ิ', 'ี', 'ึ', 'ื', '็']);
  const BELOW_COMBINING_CHARS = new Set(['ุ', 'ู']);
  const COMBINING_CHARS = new Set([...ABOVE_COMBINING_CHARS, ...BELOW_COMBINING_CHARS]);

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

  /** 该元音在这个音节里是否算短元音（供界面/说明使用） */
  function isShortVowel(vowel, hasFinal) {
    if (!vowel) return false;
    return !!vowel.short;
  }

  /**
   * 把元音摊成实际拼装的样子：parts 只记「选了什么」，
   * 每个字符落在哪个位置由元音表决定。
   */
  function layout(parts) {
    const vowel = VOWEL_MAP.get(parts.vowelId) || {};
    const follow = vowel.dropFollowWithFinal && parts.final ? '' : (vowel.follow || '');
    return {
      lead: vowel.lead || '',
      onset: parts.onset || '',
      cluster: parts.cluster || '',
      follow,
      tone: toneMark(parts.tone),
      tail: vowel.tail || '',
      final: parts.final || '',
    };
  }

  /**
   * 声调可选性。
   * strict = true 时按泰语规则禁用：
   *   - ๊ / ๋ 仅限中类首辅音
   *   - ็ 类元音不写声调符号（要标声调得换写法，如 เก็ง → เก่ง）
   */
  function toneOptions(parts, strict) {
    const vowel = VOWEL_MAP.get(parts.vowelId);
    const cls = classOf(parts.onset);
    return TONES.map((tone) => {
      if (tone.id === 'none') return { ...tone, allowed: true, reason: '' };
      if (!strict) return { ...tone, allowed: true, reason: '' };
      if (tone.midOnly && cls !== 'mid') {
        return { ...tone, allowed: false, reason: 'ตรี / จัตวา 只用于中类辅音' };
      }
      if (vowel && vowel.noTone) {
        return { ...tone, allowed: false, reason: `${vowel.name} 不写声调符号，标声调时要换写法` };
      }
      return { ...tone, allowed: true, reason: '' };
    });
  }

  /**
   * 按泰文码点顺序拼装成字符串：
   * 前引元音 → 首辅音 → 辅音簇 → 元音前段 → 声调符号 → 元音后段 → 尾辅音
   */
  function assemble(parts) {
    const l = layout(parts);
    return l.lead + l.onset + l.cluster + l.follow + l.tone + l.tail + l.final;
  }

  /**
   * 参考注音（不含声调）。
   * system = 'latin' 用罗马注音；system = 'ipa' 用国际音标。
   */
  function romanize(parts, system = 'latin') {
    const useIPA = system === 'ipa';
    const vowel = VOWEL_MAP.get(parts.vowelId);
    const letter = (ch) => {
      const c = CONSONANT_MAP.get(ch);
      if (!c) return '';
      if (!useIPA) return c.roman;
      return Object.prototype.hasOwnProperty.call(CONSONANT_IPA, c.roman)
        ? CONSONANT_IPA[c.roman]
        : c.roman;
    };
    const vowelRoman = useIPA ? vowel.ipa : vowel.roman;

    const pair = `${parts.onset}${parts.cluster || ''}`;
    const replaced = REPLACED_CLUSTERS[pair];
    // 整体换读音的假簇（ทราย = saai）
    if (replaced) {
      const final = parts.final ? (useIPA ? FINALS[parts.final].ipa : FINALS[parts.final].roman) : '';
      return (useIPA ? replaced.ipa : replaced.book) + vowelRoman + final;
    }

    const onset = SILENT_H_PAIRS.has(pair) ? '' : letter(parts.onset);
    const cluster = parts.cluster && !SILENT_SECOND_PAIRS.has(pair) ? letter(parts.cluster) : '';

    let final = '';
    if (parts.final) {
      const entry = FINALS[parts.final];
      // ไทย / สวย 这类：尾辅音读出来跟元音结尾同一个音，就只写一次
      final = vowel.ipa.endsWith(entry.ipa) ? '' : (useIPA ? entry.ipa : entry.roman);
    }
    return onset + cluster + vowelRoman + final;
  }

  /**
   * 固定模式：把「自己挑的一个辅音 / 一个元音」拼成一个音节。
   * 纯逻辑放在这里，界面（app.js）只负责把结果画出来，测试可以直接跑这个函数。
   *
   *   onset 有、vowelId 无 → 只选辅音：strict 时补 สระออ，显示成 กอ（字母本身的读法）；
   *                          关掉规则就不补，卡片上只留这个辅音
   *   onset 无、vowelId 有 → 只选元音：strict 时用 อ 当载体，显示成 อา（课本写单元音的方式）；
   *                          关掉规则且这个元音本身有字形时不补；
   *                          「无元音符号」这类没有字形的必须补，否则卡片一片空白；
   *                           ฤ ฤๅ ฦ ฦๅ 自己能站住，任何时候都不补
   *   两个都有             → 正常拼成一个音节，如 กา
   *
   * 两个都没选返回 null。
   */
  function fixedParts({ onset = null, vowelId = null, strict = true } = {}) {
    if (!onset && !vowelId) return null;
    const vowel = vowelId ? VOWEL_MAP.get(vowelId) : null;
    if (vowelId && !vowel) return null;
    const vowelForm = vowel ? `${vowel.lead || ''}${vowel.follow || ''}${vowel.tail || ''}` : '';
    const needCarrier = !!vowel && !vowel.canBeOnset && (strict || !vowelForm);
    if (onset) {
      return {
        vowelId: vowelId || (strict ? 'o_long' : 'none'),
        onset,
        cluster: null,
        tone: 'none',
        final: null,
      };
    }
    return {
      vowelId,
      onset: needCarrier ? 'อ' : null,
      cluster: null,
      tone: 'none',
      final: null,
    };
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
      (ch) => !isConsonant(ch) && !VOWEL_CHARS.has(ch) && !TONE_CHARS.includes(ch),
    );
    if (unknown.length) issues.push(`未知字符 ${unknown.join('')}`);

    const toneCount = chars.filter((ch) => TONE_CHARS.includes(ch)).length;
    if (toneCount > 1) issues.push('出现多个声调符号');

    // 按 canonical 顺序把各段铺到字符串上，得到每个字符的角色
    const l = layout(parts);
    const pieces = [
      ['lead', l.lead],
      ['onset', l.onset],
      ['cluster', l.cluster],
      ['follow', l.follow],
      ['tone', l.tone],
      ['tail', l.tail],
      ['final', l.final],
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

    if (parts.onset && !isConsonant(parts.onset)) issues.push('首辅音不是辅音');
    // 只有 ฤ ฤๅ ฦ ฦๅ 可以自己当声母（ฤษี / ฤดู）
    if (!parts.onset && !(vowel && vowel.canBeOnset)) issues.push('缺少首辅音');

    // 前引元音必须排在首个辅音之前（码点顺序错就会渲染错位）
    // 没有声母时不检查「前引元音的位置」（固定模式下会故意只显示一个元音符号）
    if (parts.onset) {
      if (at('lead') !== -1 && at('lead') > firstConsonant) {
        issues.push('前引元音排在辅音之后');
      }
      for (let i = 0; i < chars.length; i += 1) {
        if (LEAD_VOWEL_CHARS.includes(chars[i]) && i > firstConsonant) {
          issues.push('前引元音排在辅音之后');
          break;
        }
      }
    }

    if (at('tone') !== -1) {
      if (at('follow') !== -1 && at('follow') > at('tone')) issues.push('声调符号排在元音前段之前');
      if (at('tail') !== -1 && at('tail') < at('tone')) issues.push('声调符号排在元音后段之后');
      if (at('final') !== -1 && at('final') < at('tone')) issues.push('尾辅音排在声调符号之前');
      if (at('tone') < firstConsonant) issues.push('声调符号排在辅音之前');
      if (vowel && vowel.noTone) issues.push('该元音不写声调符号');
      const usedTone = TONE_MAP.get(parts.tone);
      if (usedTone && usedTone.midOnly && classOf(parts.onset) !== 'mid') {
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
   * @param {boolean} [options.allowVowelOnset] 允许 ฤ ฤๅ ฦ ฦๅ 自己当声母（ฤษี / ฤดู）
   * @param {function} [options.rng]          随机源，便于测试
   */
  function generate(options = {}) {
    const {
      consonants = [],
      vowels = [],
      allowClusters = false,
      allowFinal = true,
      strict = true,
      allowVowelOnset = false,
      rng = Math.random,
    } = options;

    const onsets = consonants.filter(isConsonant);
    // internal 的项（「无元音」）只给固定模式内部用，随机组合里不该出现
    const vowelList = vowels
      .map((id) => VOWEL_MAP.get(id))
      .filter((v) => v && !v.internal);
    if (!vowelList.length) return null;

    // 能自己当声母的元音（ฤ ฤๅ ฦ ฦๅ）
    const vowelOnsetVowels = allowVowelOnset ? vowelList.filter((v) => v.canBeOnset) : [];
    if (!onsets.length && !vowelOnsetVowels.length) return null;

    const finalCandidates = allowFinal ? onsets.filter((ch) => FINALS[ch]) : [];

    // 元音要挑「约束能满足」的
    const usableVowels = vowelList.filter(
      (v) => !(v.requiresFinal && !finalCandidates.length),
    );
    if (!usableVowels.length && !vowelOnsetVowels.length) return null;

    // 元音自己当声母按固定概率出现。不能把 ฤ 系列每个元音都算作一个「声母选项」——
    // 那样只勾一两个辅音时它们会占掉大部分结果。
    const vowelOnsetChance = onsets.length && usableVowels.length ? 0.15 : 1;
    if (vowelOnsetVowels.length && rng() < vowelOnsetChance) {
      const parts = {
        vowelId: pick(vowelOnsetVowels, rng).id,
        onset: null,
        cluster: null,
        tone: 'none',
        final: null,
      };
      parts.tone = allowedTones(parts, strict)[0] || 'none';
      return parts;
    }

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

    // parts 只记「选了什么」，各段位置由元音表在 layout() 里决定
    const parts = { vowelId: vowel.id, onset, cluster, tone: 'none', final };

    const tones = allowedTones(parts, strict);
    // 无音调权重高一点，避免每张卡都带符号
    const weighted = tones.filter((id) => id === 'none' || rng() < 0.6);
    parts.tone = pick(weighted.length ? weighted : tones, rng);

    return parts;
  }

  /** 生成结果的完整快照，供界面渲染 */
  function describe(parts, strict = true, system = 'latin') {
    const vowel = VOWEL_MAP.get(parts.vowelId);
    const consonant = CONSONANT_MAP.get(parts.onset) || {};
    const tone = TONE_MAP.get(parts.tone) || TONE_MAP.get('none');
    return {
      parts,
      text: assemble(parts),
      roman: romanize(parts, system),
      romanSystem: system,
      romanLatin: romanize(parts, 'latin'),
      romanIPA: romanize(parts, 'ipa'),
      toneName: tone.name,
      onsetClass: consonant.cls,
      onsetClassLabel: CLASS_LABEL[consonant.cls] || '',
      isVowelOnset: !parts.onset,
      onsetLabel: parts.onset
        ? `${parts.onset} ${CLASS_LABEL[consonant.cls] || ''}`.trim()
        : '元音充当声母',
      leadingH: isLeadingH(parts.onset, parts.cluster),
      clusterNote: clusterNote(parts.onset, parts.cluster),
      vowelLabel: vowel ? vowel.label : '',
      vowelName: vowel ? vowel.name : '',
      vowelEn: vowel ? vowel.en : '',
      vowelRoman: vowel ? vowel.roman : '',
      vowelIPA: vowel ? vowel.ipa : '',
      vowelExample: vowel ? vowel.example || '' : '',
      vowelLength: vowel ? (vowel.short ? '短音' : '长音') : '',
      vowelGroup: vowel ? vowel.group : '',
      vowelForm: vowel ? `${vowel.lead || ''}${vowel.follow || ''}${vowel.tail || ''}` : '',
      finalRoman: parts.final ? (FINALS[parts.final] || {}).roman || '' : '',
      tones: toneOptions(parts, strict),
      issues: check(parts),
    };
  }

  return {
    CONSONANTS,
    VOWELS,
    VOWEL_GROUPS,
    SELECTABLE_VOWEL_IDS,
    isSelectableVowel,
    ROMAN_SYSTEMS,
    TRUE_CLUSTERS,
    LEADING_H_CLUSTERS,
    SILENT_SECOND_CLUSTERS,
    REPLACED_CLUSTERS,
    TONES,
    CLUSTERS,
    FINALS,
    FINAL_GROUPS,
    CLASS_LABEL,
    LEAD_VOWEL_CHARS,
    FOLLOW_VOWEL_CHARS,
    VOWEL_CHARS,
    COMBINING_CHARS,
    ABOVE_COMBINING_CHARS,
    BELOW_COMBINING_CHARS,
    TONE_CHARS,
    isConsonant,
    classOf,
    toneMark,
    toneOptions,
    allowedTones,
    layout,
    assemble,
    romanize,
    isLeadingH,
    consonantIPA,
    clusterNote,
    check,
    fixedParts,
    generate,
    describe,
    isShortVowel,
  };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = ThaiRules;
if (typeof window !== 'undefined') window.ThaiRules = ThaiRules;
