/**
 * 辞典数据加载与查询。
 *
 * 数据放在 web/data/ 下，默认**按需联网加载**（同源，走本站自己的服务器，
 * 不依赖任何第三方接口，国内可直连）。单文件版打包时会把这两份数据内联进
 * HTML，此时下面的 loadScript 不会被触发，双击离线打开也能用。
 *
 * 纯逻辑 + 一个 script 注入，不碰界面；界面在 app.js 里消费。
 */
(function (global) {
  'use strict';

  // 只有一份数据：所有真词都在里面，常用词用第 5 位的排名标出来
  const SRC = 'data/dict.js';

  const loading = {};
  function loadScript(src) {
    if (!loading[src]) {
      loading[src] = new Promise((resolve, reject) => {
        const tag = document.createElement('script');
        tag.src = src;
        tag.onload = () => resolve();
        tag.onerror = () => {
          delete loading[src];
          reject(new Error(`加载失败：${src}`));
        };
        document.head.append(tag);
      });
    }
    return loading[src];
  }

  let loadPromise = null;
  let data = null;
  const byWord = new Map();
  const common = [];

  /** 加载词库。所有真词与常用词在同一份数据里，加载一次就够 */
  function loadWords() {
    if (!loadPromise) {
      loadPromise = (global.ThaiDictData
        ? Promise.resolve()
        : loadScript(SRC)
      ).then(() => {
        const raw = global.ThaiDictData;
        if (!raw || !Array.isArray(raw.words)) throw new Error('词库格式不对');
        data = raw;
        byWord.clear();
        common.length = 0;
        for (const entry of raw.words) {
          byWord.set(entry[0], entry);
          if (entry[4]) common.push(entry);
        }
        return data;
      }).catch((err) => {
        loadPromise = null;
        throw err;
      });
    }
    return loadPromise;
  }

  /** 与 loadWords 同一份数据；保留这个入口，调用方不必区分「索引」和「词库」 */
  function loadIndex() {
    return loadWords();
  }

  /**
   * 这个拼写是不是一个真实存在的泰语词。
   * 返回 null 表示索引还没加载好（调用方可以先不显示结论）。
   */
  function isWord(text) {
    if (!data) return null;
    return byWord.has(text);
  }

  /** 是不是词表里最基础的那一档（界面上的「常用词」）。data 没加载好时返回 null */
  function isCommon(text) {
    if (!data) return null;
    const entry = byWord.get(text);
    return !!(entry && entry[4]);
  }

  /** 词库是否已经加载好（常用词模式要靠它判断） */
  function ready() {
    return !!data;
  }

  /** 查词条；返回 [拼写, 罗马注音, 中文释义, 词性, 常用度]，查不到返回 null */
  function lookup(text) {
    return byWord.get(text) || null;
  }

  /**
   * 查词（教学页搜索框用）。两种方向自动分派：
   *   泰文 → 按拼写查（打「ไม」列出 ไม / ไมโครเวฟ / ไม่ …）
   *   中文 / 英文 → 按释义反查（打「你好」列出 สวัสดี）
   * 词库没加载好时返回空数组。
   */
  function search(text, limit) {
    if (!data) return [];
    const q = String(text || '').trim();
    if (!q) return [];
    return /[\u0E00-\u0E7F]/.test(q) ? searchBySpelling(q, limit) : searchByGloss(q, limit);
  }

  /**
   * 按拼写开头找词。
   * 顺序：完全一样的排第一 → 常用词里以它开头的 → 还不够再扫全表。
   * 先扫常用词那 2000 多条，是让「打半个词」时先出最常见的那几个。
   */
  function searchBySpelling(q, limit) {
    const max = limit > 0 ? limit : 8;
    const out = [];
    const seen = new Set();
    const push = (entry) => {
      if (!entry || seen.has(entry[0])) return;
      seen.add(entry[0]);
      out.push(entry);
    };
    push(byWord.get(q));
    for (const entry of common) {
      if (out.length >= max) break;
      if (entry[0].startsWith(q)) push(entry);
    }
    for (const entry of data.words) {
      if (out.length >= max) break;
      if (entry[0].startsWith(q)) push(entry);
    }
    return out.slice(0, max);
  }

  // ── 中→泰 / 英→泰 反查 ─────────────────────────────────────────────
  // 释义是「说；讲话」这种多义项，按标点切段建索引，查「讲话」也能命中。
  // 2.7 万条切一遍约几十毫秒，所以第一次反查时才建，平时不占内存。
  let glossIndex = null;

  function buildGlossIndex() {
    if (glossIndex) return glossIndex;
    const idx = new Map();
    // 同义词（谢谢→感谢）由构建脚本生成，写错了不会进表；这里把它当成别名键，
    // 于是查「谢谢」也能找到释义写着「感谢」的那些词
    const aliases = new Map();
    for (const [alias, canonical] of Object.entries(global.ThaiDictSynonyms || {})) {
      const k = String(canonical).trim().toLowerCase();
      if (!aliases.has(k)) aliases.set(k, []);
      aliases.get(k).push(String(alias).trim().toLowerCase());
    }
    const add = (raw, entry) => {
      const key = raw.trim().toLowerCase().replace(/[.。;；,，、]+$/, '');
      if (!key) return;
      const list = idx.get(key);
      if (list) {
        if (list[list.length - 1] !== entry) list.push(entry);
      } else {
        idx.set(key, [entry]);
      }
      for (const alias of aliases.get(key) || []) {
        const list2 = idx.get(alias);
        if (list2) {
          if (list2[list2.length - 1] !== entry) list2.push(entry);
        } else {
          idx.set(alias, [entry]);
        }
      }
    };
    for (const entry of data.words) {
      const zh = entry[2];
      const en = entry[5];
      // 中文按分号 / 逗号 / 顿号 / 斜杠 / 括号切开，每个义项单独作键
      // （词库里「哥哥/姐姐」这种写法要拆开，不然打「姐姐」查不到）
      if (zh) for (const seg of String(zh).split(/[；;，,、／/（）()【】\[\]]+/)) add(seg, entry);
      // 英文按分号 / 逗号 / 斜杠 / 括号切开，句末的点去掉
      if (en) for (const seg of String(en).split(/[;,/()]+/)) add(seg, entry);
    }
    glossIndex = idx;
    return idx;
  }

  /**
   * 按释义找词：先给「这个义项正好是它」的，再给「以它开头」「包含它」的；
   * 每一档里常用词优先，词短的优先（一般更基础）。
   */
  function searchByGloss(q, limit) {
    const max = limit > 0 ? limit : 8;
    const idx = buildGlossIndex();
    const key = q.toLowerCase();
    const out = [];
    const seen = new Set();
    const push = (entry) => {
      if (!entry || seen.has(entry[0])) return;
      seen.add(entry[0]);
      out.push(entry);
    };
    // ① 整个义项刚好是这个查询词
    for (const entry of idx.get(key) || []) {
      if (out.length >= max) return out;
      push(entry);
    }
    // ② 义项以它开头（「你好」→「你好吗」）  ③ 义项里含它（「好」→「你好」）
    const tiers = [[], []];
    for (const [seg, list] of idx) {
      if (seg === key) continue;
      if (seg.startsWith(key)) tiers[0].push(...list);
      else if (seg.includes(key)) tiers[1].push(...list);
      if (tiers[0].length + tiers[1].length > 4000) break; // 单字查询的兜底，别把整库翻完
    }
    for (const bucket of tiers) {
      bucket.sort((a, b) => (b[4] - a[4]) || ([...a[0]].length - [...b[0]].length));
      for (const entry of bucket) {
        if (out.length >= max) return out;
        push(entry);
      }
    }
    return out;
  }

  // ── 「换一批」：洗牌抽取，抽完一轮再重洗，避免短时间内反复出现同一个词 ──
  let bag = [];
  function nextBatch(size) {
    if (!common.length) return [];
    const out = [];
    while (out.length < size) {
      if (!bag.length) {
        bag = common.map((_, i) => i);
        for (let i = bag.length - 1; i > 0; i -= 1) {
          const j = Math.floor(Math.random() * (i + 1));
          [bag[i], bag[j]] = [bag[j], bag[i]];
        }
      }
      out.push(common[bag.pop()]);
    }
    return out;
  }

  function total() {
    return common.length;
  }

  function source() {
    return data ? data.source : '';
  }

  function note() {
    return data ? data.note : '';
  }

  global.ThaiDict = {
    loadWords, loadIndex, isWord, isCommon, ready, lookup, search, nextBatch, total, source, note,
  };
})(window);
