// ==UserScript==
// @name         Steampy 方向键翻页
// @namespace    https://steampy.com/
// @version      2026.10.24
// @description  在 SteamPY 页面用 ← / → 翻页；优先点目标页码（规避第一页点「下一页」乱跳的 bug），兼顾新旧两种分页结构
// @author       WorkBuddy
// @match        https://steampy.com/*
// @match        https://www.steampy.com/*
// @match        https://*.steampy.com/*
// @run-at       document-idle
// @grant        none
// ==/UserScript==

(function () {
  'use strict';

  /* ================= 可配置项 ================= */
  const CONFIG = {
    prevKeys: ['ArrowLeft'],           // 上一页
    nextKeys: ['ArrowRight'],          // 下一页
    pageKeys: ['PageUp', 'PageDown'],  // 额外支持（设为 [] 关闭）
    cooldown: 300,                     // 两次翻页最小间隔（毫秒）
    scrollToTop: true,                 // 翻页后回到列表顶部
    showToast: true                    // 轻提示
  };

  /* ================= 两种分页结构 =================
     新版（iView）：
       <ul class="ivu-page" current="2" max-page="9">
         <li class="ivu-page-prev"><a>…</a></li>
         <li class="ivu-page-item">1</li>
         <li class="ivu-page-item ivu-page-item-active"><a>2</a></li>
         <li class="ivu-page-item-jump-next"><a>…</a></li>   ← 跳 5 页，千万别点
         <li class="ivu-page-item">683</li>
         <li class="ivu-page-next"><a>…</a></li>
       </ul>

     旧版（自定义组件）：
       <nav class="zpagenav"><ul class="page-ul">
         <li class="">&lt;</li> … <li class="active">11</li> … <li class="">&gt;</li>
       </ul></nav>

     ⚠ SteamPY 在第一页点「下一页」会偶发连续翻很多页（站点 bug），
       所以只要目标页码在可见页码里，就直接点页码，不碰 < / > 箭头。
  */

  /* ================= 基础工具 ================= */
  function isVisible(el) {
    if (!el || !el.getBoundingClientRect) return false;
    const r = el.getBoundingClientRect();
    const s = getComputedStyle(el);
    return r.width > 0 && r.height > 0 && s.display !== 'none' && s.visibility !== 'hidden';
  }

  function isDisabled(el) {
    if (!el) return true;
    if (el.classList && el.classList.contains('ivu-page-disabled')) return true;
    return el.getAttribute('aria-disabled') === 'true' || el.disabled === true;
  }

  const txt = (el) => (el ? (el.textContent || '').replace(/\s+/g, '').trim() : '');
  const num = (el) => (/^\d+$/.test(txt(el)) ? parseInt(txt(el), 10) : NaN);
  const toInt = (v) => (/^\d+$/.test(String(v || '').trim()) ? parseInt(v, 10) : NaN);

  const maxOf = (arr) => arr.filter(Number.isFinite).reduce((a, b) => (a > b ? a : b), NaN);

  /* ================= 适配器 1：新版 iView ================= */
  function detectIView() {
    const roots = Array.from(document.querySelectorAll('ul.ivu-page')).filter(isVisible);
    if (!roots.length) return null;
    const root = roots.find((r) => r.closest('.page')) || roots[0];

    const prev = root.querySelector('li.ivu-page-prev');
    const next = root.querySelector('li.ivu-page-next');
    if (!prev || !next) return null;

    const last = () => {
      const ns = Array.from(root.querySelectorAll('li.ivu-page-item')).map(num);
      const m = maxOf(ns);
      if (Number.isFinite(m)) return m;
      return toInt(root.getAttribute('max-page'));
    };
    const current = () => {
      const active = root.querySelector('li.ivu-page-item-active');
      const fromActive = num(active);
      if (Number.isFinite(fromActive)) return fromActive;
      return toInt(root.getAttribute('current'));
    };

    // 直接点目标页码：SteamPY 第一页点「下一页」会乱跳，所以优先走这里
    const goto = (n) => {
      const hit = Array.from(root.querySelectorAll('li.ivu-page-item')).find((li) => num(li) === n);
      if (!hit || isDisabled(hit)) return false;
      clickPage(hit);
      return true;
    };

    return { kind: 'iview 新版', root, prev, next, prevBtn: prev, nextBtn: next, current, last, goto };
  }

  /* ================= 适配器 2：旧版 .zpagenav ================= */
  const PREV_TEXTS = ['<', '‹', '«', '＜', '上一页', '上页', '前一页'];
  const NEXT_TEXTS = ['>', '›', '»', '＞', '下一页', '下页', '后一页'];

  function detectZPager() {
    const navs = Array.from(document.querySelectorAll('nav.zpagenav')).filter(isVisible);
    if (!navs.length) return null;
    const nav = navs.find((n) => n.closest('.page')) || navs[0];

    const items = () => Array.from(nav.querySelectorAll('ul.page-ul > li'));
    const byText = (list) => items().find((li) => list.includes(txt(li))) || null;

    const prev = byText(PREV_TEXTS);
    const next = byText(NEXT_TEXTS);
    if (!prev || !next) return null;

    return {
      kind: 'zpagenav 旧版',
      root: nav,
      prev, next,
      prevBtn: prev, nextBtn: next,
      current: () => num(nav.querySelector('ul.page-ul > li.active')),
      last: () => maxOf(items().map(num)),
      goto: (n) => {
        const hit = items().find((li) => num(li) === n);
        if (!hit || isDisabled(hit)) return false;
        clickPage(hit);
        return true;
      }
    };
  }

  function detect() {
    return detectIView() || detectZPager();
  }

  /* ================= 点击 ================= */
  function clickPage(li) {
    // iView 把 click 绑在 li 上，旧版也是 li；点内部 a 会冒泡到 li，两种都覆盖
    const target = (li.querySelector && li.querySelector('a')) || li;
    target.dispatchEvent(new MouseEvent('click', {
      bubbles: true, cancelable: true, view: window, button: 0
    }));
  }

  function scrollToListTop(root) {
    if (!CONFIG.scrollToTop || !root) return;
    const box = root.closest('.page') || root.parentElement;
    if (!box) return;
    let sib = box.previousElementSibling;
    while (sib && sib.getBoundingClientRect().height < 120) {
      sib = sib.previousElementSibling;
    }
    const anchor = sib || box;
    const r = anchor.getBoundingClientRect();
    if (r.top >= 0 && r.top < window.innerHeight * 0.6) return; // 已在视野内不动
    try {
      anchor.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } catch (_) {
      anchor.scrollIntoView();
    }
  }

  /* ================= 轻提示 ================= */
  let toastEl = null, toastTimer = null;
  function toast(text, ms) {
    if (!CONFIG.showToast || !document.body) return;
    if (!toastEl || !toastEl.isConnected) {
      toastEl = document.createElement('div');
      toastEl.style.cssText = [
        'position:fixed', 'left:50%', 'bottom:36px', 'transform:translateX(-50%)',
        'z-index:2147483647', 'padding:8px 17px', 'border-radius:999px',
        'background:rgba(24,24,27,.88)', 'color:#fff', 'font-size:13px',
        'font-family:system-ui,-apple-system,"Microsoft YaHei",sans-serif',
        'pointer-events:none', 'opacity:0', 'transition:opacity .15s ease',
        'box-shadow:0 6px 20px rgba(0,0,0,.22)', 'white-space:nowrap'
      ].join(';');
      document.body.appendChild(toastEl);
    }
    toastEl.textContent = text;
    toastEl.style.opacity = '1';
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { toastEl.style.opacity = '0'; }, ms || 1000);
  }

  /* ================= 翻页 ================= */
  function turnPage(kind) {
    const now = Date.now();
    if (window.__spPagerLock && now - window.__spPagerLock < CONFIG.cooldown) return;
    window.__spPagerLock = now;

    const pager = detect();
    if (!pager) {
      toast('没找到分页组件');
      return;
    }

    const cur = pager.current();
    const last = pager.last();
    const btn = kind === 'next' ? pager.nextBtn : pager.prevBtn;

    if (isDisabled(btn)) {
      toast(kind === 'next' ? '已经是最后一页' : '已经是第一页');
      return;
    }
    if (kind === 'next' && Number.isFinite(cur) && Number.isFinite(last) && cur >= last) {
      toast('已经是最后一页');
      return;
    }
    if (kind === 'prev' && Number.isFinite(cur) && cur <= 1) {
      toast('已经是第一页');
      return;
    }

    // 优先：直接点目标页码（第一页点「下一页」会乱跳，绕开它）
    const target = cur + (kind === 'next' ? 1 : -1);
    let done = false;
    if (Number.isFinite(cur) && target >= 1 && typeof pager.goto === 'function') {
      done = pager.goto(target);
    }

    // 兜底：目标页码不在可见页码里（比如当前在第 4 页、下一屏只显示 1~4 和 683）
    if (!done) clickPage(btn);

    scrollToListTop(pager.root);

    setTimeout(() => {
      const p2 = detect();
      const n = p2 ? p2.current() : NaN;
      toast(Number.isFinite(n) ? `第 ${n} 页` : (kind === 'next' ? '下一页' : '上一页'));
    }, 200);
  }

  /* ================= 按键 ================= */
  function isTypingContext(el) {
    if (!el) return false;
    const tag = (el.tagName || '').toLowerCase();
    if (tag === 'input' || tag === 'textarea' || tag === 'select') return true;
    return el.isContentEditable === true;
  }

  function onKeyDown(e) {
    if (e.defaultPrevented || e.ctrlKey || e.altKey || e.metaKey || e.isComposing) return;
    if (isTypingContext(document.activeElement) || isTypingContext(e.target)) return;

    let kind = null;
    if (CONFIG.nextKeys.includes(e.key)) kind = 'next';
    else if (CONFIG.prevKeys.includes(e.key)) kind = 'prev';
    else if (CONFIG.pageKeys.includes(e.key)) kind = e.key === 'PageDown' ? 'next' : 'prev';
    if (!kind) return;

    e.preventDefault();
    turnPage(kind);
  }

  /* ================= 调试：Alt+P ================= */
  function debugReport() {
    const p = detect();
    const d = (li) => (li ? `「${txt(li) || 'icon'}」class="${li.className}"${isDisabled(li) ? ' [disabled]' : ''}` : '未找到');

    console.group('[SteamPY 翻页] 识别结果');
    console.log('分页类型：', p ? p.kind : '未识别');
    console.log('当前页 / 末页：', p ? p.current() : NaN, '/', p ? p.last() : NaN);
    console.log('「上一页」：', p ? d(p.prevBtn) : '-');
    console.log('「下一页」：', p ? d(p.nextBtn) : '-');
    console.groupEnd();

    toast(p
      ? `${p.kind} · 第 ${Number.isFinite(p.current()) ? p.current() : '?'} / ${Number.isFinite(p.last()) ? p.last() : '?'} 页`
      : '未识别到分页组件', 2200);
  }

  document.addEventListener('keydown', onKeyDown, true);
  window.addEventListener('keydown', (e) => {
    if (e.altKey && (e.key === 'p' || e.key === 'P')) {
      e.preventDefault();
      debugReport();
    }
  }, true);

  window.__spPager = {
    prev: () => turnPage('prev'),
    next: () => turnPage('next'),
    info: () => {
      const p = detect();
      return p ? { kind: p.kind, current: p.current(), last: p.last() } : null;
    },
    debug: debugReport
  };
})();
