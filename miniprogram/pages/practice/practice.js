// 练习页：随机拼读 + 声调 + 词表 + 发音（规则引擎来自 web/rules.js，单一数据源）
const R = require('../../core/rules.js');
const AUDIO = require('../../core/audio-manifest.js');
const player = require('../../utils/audio.js');

const ALL_CONS = R.CONSONANTS.filter((c) => !c.obsolete).map((c) => c.ch);
const ALL_VOWELS = R.SELECTABLE_VOWEL_IDS.slice();
const RANGES = [
  { id: 'any', label: '任意' },
  { id: 'strict', label: '按规则' },
  { id: 'common', label: '真词' },
];

Page({
  data: {
    syl: 'สวัสดี',
    roman: 'sà-wàt-dii',
    hint: '点「随机组合」开始',
    parts: [],
    real: true,
    gloss: '你好',
    canPlay: true,
    ranges: RANGES,
    range: 'strict',
    tones: [],
    consGroups: [],
    vowelGroups: [],
    consOn: {},
    vowelOn: {},
  },
  onLoad() {
    this.state = {
      consonants: new Set(ALL_CONS),
      vowels: new Set(ALL_VOWELS),
      allowClusters: true,
      allowFinal: true,
      allowVowelOnset: false,
      allowImplicit: true,
      range: 'strict',
      tone: 'none',
      parts: null,
    };
    this.render();
  },

  render() {
    const st = this.state;
    const strict = st.range !== 'any';
    let parts = st.parts;
    if (!parts) {
      const word = 'สวัสดี';
      const info = AUDIO.words[word] || null;
      this.setData({
        syl: word,
        roman: (info && info[3]) || 'sà-wàt-dii',
        gloss: (info && info[4]) || '你好',
        real: !!info,
        canPlay: !!info,
        parts: [{ label: '词', text: '打招呼的话（来自内置词表）' }],
        tones: this.toneList(strict, null),
        ...this.chipData(),
      });
      return;
    }
    const info = R.describe(parts, strict);
    const realInfo = AUDIO.words[info.text] || null;
    const rows = [
      { label: '声母', text: info.onsetLabel + (info.clusterNote ? `（${info.clusterNote}）` : '') },
      { label: '元音', text: `${info.vowelName}（${info.vowelLength}）` },
    ];
    if (parts.final) rows.push({ label: '尾音', text: `${parts.final}（读 ${info.finalRoman || '—'}）` });
    rows.push({ label: '声调', text: this.toneText(info) });
    if (realInfo && realInfo[3] && realInfo[3] !== info.roman) rows.push({ label: '读音', text: realInfo[3] });
    this.setData({
      syl: info.text,
      roman: (realInfo && realInfo[3]) || info.roman,
      gloss: (realInfo && realInfo[4]) || '',
      real: !!realInfo,
      canPlay: !!realInfo,
      parts: rows,
      tones: this.toneList(strict, info),
      ...this.chipData(),
    });
  },

  toneText(info) {
    const mark = { none: '不写', ek: '写 อ่', tho: '写 อ้', tri: '写 อ๊', chattawa: '写 อ๋' }[this.state.tone] || '不写';
    if (info.spokenTone) return `${mark} → 读第${info.spokenTone}调`;
    return mark;
  },
  toneList(strict, info) {
    return R.TONES.map((t) => ({
      id: t.id,
      label: t.id === 'none' ? '无' : t.mark,
      disabled: !!(info && !info.tones.find((x) => x.id === t.id).allowed),
      on: this.state.tone === t.id,
    }));
  },
  chipData() {
    const cons = ALL_CONS.map((ch) => ({ ch, on: this.state.consonants.has(ch) }));
    const vows = ALL_VOWELS.map((id) => {
      const v = R.VOWELS.find((x) => x.id === id);
      return { id, label: v ? v.name.replace('สระ ', '') : id, on: this.state.vowels.has(id) };
    });
    return { consOn: cons, vowelOn: vows };
  },

  randomize() {
    const st = this.state;
    st.parts = R.generate({
      consonants: [...st.consonants],
      vowels: [...st.vowels, ...(st.allowImplicit ? ['o_implied'] : [])],
      allowClusters: st.allowClusters,
      allowFinal: st.allowFinal,
      allowVowelOnset: st.allowVowelOnset,
      strict: st.range !== 'any',
    });
    if (st.range === 'common' && st.parts) {
      for (let i = 0; i < 2000 && !AUDIO.words[R.assemble(st.parts)]; i += 1) {
        st.parts = R.generate({ consonants: [...st.consonants], vowels: [...st.vowels], allowClusters: true, allowFinal: true, strict: true });
      }
    }
    if (!st.parts) { wx.showToast({ title: '当前词表组不出音节', icon: 'none' }); return; }
    st.tone = st.parts.tone;
    this.render();
  },
  pickTone(e) {
    const id = e.currentTarget.dataset.id;
    if (!this.state.parts) return;
    this.state.tone = id;
    this.state.parts.tone = id;
    this.render();
  },
  pickRange(e) {
    this.state.range = e.currentTarget.dataset.id;
    this.setData({ range: this.state.range });
    this.render();
  },
  toggleCons(e) {
    const ch = e.currentTarget.dataset.ch;
    if (this.state.consonants.has(ch)) this.state.consonants.delete(ch);
    else this.state.consonants.add(ch);
    this.render();
  },
  toggleVowel(e) {
    const id = e.currentTarget.dataset.id;
    if (this.state.vowels.has(id)) this.state.vowels.delete(id);
    else this.state.vowels.add(id);
    this.render();
  },
  allCons() { this.state.consonants = new Set(ALL_CONS); this.render(); },
  noneCons() { this.state.consonants = new Set(); this.render(); },
  allVowels() { this.state.vowels = new Set(ALL_VOWELS); this.render(); },
  noneVowels() { this.state.vowels = new Set(); this.render(); },

  play() {
    const word = this.data.syl;
    const info = AUDIO.words[word];
    if (!info) return;
    player.play(info[0]).catch(() => {
      wx.showToast({ title: '发音包还没配置（见 README）', icon: 'none' });
    });
  },
});
