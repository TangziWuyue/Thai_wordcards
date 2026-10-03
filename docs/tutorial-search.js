/**
 * 教学页搜索的匹配规则（纯逻辑，浏览器与 Node 都能加载，跟 rules.js 一个套路）
 *
 * 为什么单独一个文件：这套规则返工过好几次，最坑的一条是
 * **泰文不能按「包含」匹配**——搜 ไ 会被「ไ」这个字凑巧出现在词里的行带出来：
 *   ไ → ไม้หันอากาศ、ไม้ไต่คู้、ไม่มีรูป   （ไม่… / ไต่ 里带 ไ）
 *   ต → ไม้ไต่คู้、第4调、第5调            （ไต่ / ตรี / จัตวา 里带 ต）
 *   ม → 同上                               （ไม้ / สามัญ 里带 ม）
 * 所以泰文和拉丁文一律要求**整词相等**，只有中文按包含匹配。抽出来是为了能在
 * web/tutorial.test.mjs 里直接测，改坏了测试就红。
 */
const TutorialSearch = (() => {
  'use strict';

  const words = (s) => String(s === undefined || s === null ? '' : s).split(/\s+/).filter(Boolean);
  /** 查询词里有没有泰文 */
  const hasThai = (t) => /[\u0E00-\u0E7F]/.test(t);
  /** 纯拉丁 / 数字 / 连字符：这种也按整词算（k、kh、ai、-k、1） */
  const isLatinTerm = (t) => /^[a-z0-9][a-z0-9-]*$/.test(t);

  /**
   * 建一条索引。
   *   glyph  字形（泰文写法、-k、无、—…）
   *   keys1  这一行「本身」：名称、注音、标签、所在小节、字形，按空格切词
   *   keys2  keys1 + 例词
   *   all    最后兜底用的整串（例词 + 讲解正文）
   */
  function makeEntry(info, section) {
    const tags = info.tags || [];
    const glyph = info.glyph || '';
    const keys1 = [...words(info.name), ...words(info.roman), ...words(tags.join(' ')),
      ...words(section), ...words(glyph)];
    const keys2 = [...keys1, ...words(info.extra)];
    return {
      glyph,
      section: section || '',
      name: info.name || '',
      roman: info.roman || '',
      tags,
      extra: info.extra || '',
      text: info.text || '',
      keys1,
      keys2,
      keys1Joined: keys1.join('').toLowerCase(),
      keys2Joined: keys2.join('').toLowerCase(),
      all: `${keys2.join(' ')} ${info.text || ''}`.toLowerCase(),
      ref: info.ref,
    };
  }

  /** 一档字段上，这一行的所有查询词是不是都命中 */
  function hitLayer(item, terms, field) {
    const tokens = item[field];
    const joined = item[`${field}Joined`];
    return terms.every((t) => {
      if (hasThai(t)) {
        // 泰文：字形里带这个字（搜 อ 能出 อ 和 อา 这类用 อ 当底座的元音），
        // 或者跟某个词整词相等（搜 กอ 出 ก）——绝不按「词里包含」算
        if (item.glyph.includes(t)) return true;
        return tokens.some((k) => k === t);
      }
      if (isLatinTerm(t)) return tokens.some((k) => k.toLowerCase() === t);
      // 中文没有词边界，按包含算；连起来也查一遍，好让「第1调」这种没空格的写法也能中
      return tokens.some((k) => k.toLowerCase().includes(t)) || joined.includes(t);
    });
  }

  /**
   * 严格搜索，三档依次退让，前两档能命中就绝不显示第三档：
   *   1. strict —— keys1（名称 / 注音 / 标签 / 小节 / 字形）
   *   2. name   —— keys2（再加例词）
   *   3. loose  —— all（例词 + 讲解正文，界面上会说明一句）
   */
  function findMatches(index, query) {
    const terms = String(query || '').trim().toLowerCase().split(/\s+/).filter(Boolean);
    if (!terms.length) return { list: [], tier: 'strict' };
    const strict = [];
    const named = [];
    const loose = [];
    for (const item of index) {
      if (hitLayer(item, terms, 'keys1')) strict.push(item);
      else if (hitLayer(item, terms, 'keys2')) named.push(item);
      else if (terms.every((t) => item.all.includes(t))) loose.push(item);
    }
    // 字形跟查询一模一样（搜 ด 出 ด）的排最前面
    const q = String(query).trim().toLowerCase();
    strict.sort((x, y) => (x.glyph.toLowerCase() === q ? 0 : 1) - (y.glyph.toLowerCase() === q ? 0 : 1));
    if (strict.length) return { list: strict.slice(0, 12), tier: 'strict' };
    if (named.length) return { list: named.slice(0, 12), tier: 'name' };
    return { list: loose.slice(0, 12), tier: 'loose' };
  }

  return { makeEntry, findMatches, hitLayer, hasThai, isLatinTerm };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = TutorialSearch;
if (typeof window !== 'undefined') window.TutorialSearch = TutorialSearch;
