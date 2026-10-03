/**
 * 页面之间的衔接（练习页、教学页共用，两边都引这一个文件）
 *
 * 两个页面都是静态页，互相跳转是整页重载，中间会闪一下白屏。
 * 这里在跳走之前先把整页淡出（给 <html> 加 .page-leaving，样式在 style.css 里），
 * 进来时由 style.css 的 pageIn 动画淡入——两头接上，就不像硬切了。
 *
 * 用法：
 *   PageFX.setup()   —— 页面初始化时调一次，接管页内所有指向另一个页面的 .html 链接
 *   PageFX.goTo(url) —— JS 自己发起的跳转（教学页把搜到的词带去练习页就是这条路）
 *
 * prefers-reduced-motion 时一律直接跳，不做任何动画。
 */
const PageFX = (() => {
  'use strict';

  /** 跟 style.css 里 body 的 transition 时长对齐：淡出完了再跳 */
  const LEAVE_MS = 180;

  function reduced() {
    return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  }

  /** 换页：先淡出，再跳 */
  function goTo(url) {
    if (!url || reduced()) {
      location.href = url;
      return;
    }
    document.documentElement.classList.add('page-leaving');
    setTimeout(() => { location.href = url; }, LEAVE_MS);
  }

  /** 只接管「另一个页面」的链接：外链、锚点、新窗口都交给浏览器 */
  function isPageLink(link) {
    const href = link.getAttribute('href') || '';
    if (!/\.html(\?|#|$)/.test(href)) return false;
    if (link.target && link.target !== '_self') return false;
    return true;
  }

  function setup() {
    for (const link of document.querySelectorAll('a[href]')) {
      if (!isPageLink(link)) continue;
      link.addEventListener('click', (event) => {
        // 修饰键、中键、右键：浏览器自己处理（新标签页 / 新窗口 / 菜单）
        if (event.defaultPrevented || event.button !== 0) return;
        if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
        if (reduced()) return;
        event.preventDefault();
        goTo(link.href);
      });
    }
    // 用「后退」从另一个页面回到这里时，浏览器可能直接复用（bfcache）这个页面：
    // 上一次离开时加的 .page-leaving 还在，整页会是透明的，得清掉
    window.addEventListener('pageshow', () => {
      document.documentElement.classList.remove('page-leaving');
    });
  }

  return { setup, goTo, reduced };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = PageFX;
if (typeof window !== 'undefined') window.PageFX = PageFX;
