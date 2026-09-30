/**
 * 分段控件的「滑块」与按压反馈（练习页、教学页共用）
 *
 * 一组按钮（字体 / 外观 / 组合范围 / 声调）选中时，背景不是画在按钮上，
 * 而是由一个绝对定位的 `.seg-thumb` 滑过去——切换时只动 transform / width / height，
 * **不碰布局**，所以页面高度不会变（用户要求「保持页面固定」）。
 *
 * 用法：
 *   Seg.build(container, items, current, onPick)   // 建按钮（含滑块）
 *   Seg.sync(container)                            // 把滑块挪到当前选中项下面
 *   Seg.pulse(container, id)                       // 点下去时收一下
 *
 * 手写按钮的容器（声调那一排）只要在自己的按钮上更新 `aria-pressed`，
 * 然后调 `Seg.sync(container)` 就行。
 */
const Seg = (() => {
  'use strict';

  function thumbOf(container) {
    let thumb = container.querySelector('.seg-thumb');
    if (!thumb) {
      thumb = document.createElement('span');
      thumb.className = 'seg-thumb';
      thumb.setAttribute('aria-hidden', 'true');
      container.prepend(thumb);
    }
    return thumb;
  }

  /** 把滑块摆到选中的按钮上；animate=false 用于刚重建完的第一次定位（别让它从左上角飞过来） */
  function place(container, thumb, animate) {
    const btn = container.querySelector('button[aria-pressed="true"]');
    if (!btn || btn.disabled) {
      thumb.style.opacity = '0';
      return;
    }
    if (!animate) thumb.style.transition = 'none';
    const c = container.getBoundingClientRect();
    const b = btn.getBoundingClientRect();
    thumb.style.width = `${b.width}px`;
    thumb.style.height = `${b.height}px`;
    thumb.style.transform = `translate(${b.left - c.left}px, ${b.top - c.top}px)`;
    thumb.style.opacity = '1';
    if (!animate) {
      void thumb.offsetWidth;   // 让上面的定位先生效，再恢复过渡
      thumb.style.transition = '';
    }
  }

  /** 把滑块挪到当前选中的那个按钮上；选中项被灰掉时藏起来（跟以前的样式一致） */
  function sync(container) {
    if (!container) return;
    place(container, thumbOf(container), true);
  }

  function build(container, items, current, onPick) {
    // 滑块要沿用同一个元素：重建按钮时把它一起留下，切换时才有「滑过去」的效果
    const thumb = thumbOf(container);
    const buttons = items.map((item) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.textContent = item.label;
      if (item.sample) {
        const span = document.createElement('span');
        span.className = 'sample';
        span.textContent = item.sample;
        btn.append(span);
      }
      btn.setAttribute('aria-pressed', String(item.id === current));
      btn.dataset.id = item.id;
      btn.addEventListener('click', () => onPick(item.id));
      return btn;
    });
    container.replaceChildren(thumb, ...buttons);
    place(container, thumb, false);
  }

  /** 选中的那一个收一下（跟「随机组合」按钮同一套节拍） */
  function pulse(container, id) {
    if (!container || prefersReduced()) return;
    const btn = [...container.children].find((b) => b.dataset.id === id);
    if (!btn) return;
    btn.classList.add('pulse');
    setTimeout(() => btn.classList.remove('pulse'), 400);
  }

  function prefersReduced() {
    return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  }

  // 窗口尺寸变了，按钮宽度也跟着变（组合范围那一排是等分整行），滑块要重新摆
  window.addEventListener('resize', () => {
    for (const box of document.querySelectorAll('.seg, .tones')) sync(box);
  });

  return { build, sync, pulse };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = Seg;
if (typeof window !== 'undefined') window.Seg = Seg;
