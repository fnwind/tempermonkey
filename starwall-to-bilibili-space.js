// ==UserScript==
// @name         星墙快速跳转助手
// @namespace    http://tampermonkey.net/
// @version      2026.7.14
// @description  将举报存档页面的 MID 文本转换为可点击的 Bilibili 个人空间链接
// @match        https://nxgajbatnbuko.kimi.site/archive
// @grant        none
// @run-at       document-idle
// ==/UserScript==

(function () {
    'use strict';

    // 核心处理函数：将符合条件的 MID 文本转为超链接
    function convertMidToLink() {
        // 匹配目标 span：指定 class + 未处理标记，避免重复操作
        const midSpans = document.querySelectorAll('span.text-xs.font-mono.text-slate-500:not([data-mid-processed])');

        midSpans.forEach(span => {
            const text = span.textContent.trim();
            // 正则提取 MID 后的纯数字
            const midMatch = text.match(/^MID:\s*(\d+)$/);
            if (!midMatch) return;

            const mid = midMatch[1];
            // 创建超链接元素
            const link = document.createElement('a');
            link.href = `https://space.bilibili.com/${mid}`;
            link.target = '_blank';
            link.rel = 'noopener noreferrer';
            link.textContent = text;
            // 继承原 span 的样式类，保持页面视觉与布局一致
            link.className = span.className;
            // 标记已处理
            link.dataset.midProcessed = 'true';

            // 替换原 span 元素
            span.replaceWith(link);
        });
    }

    // 页面初始加载后执行一次
    convertMidToLink();

    // 监听 DOM 动态变化，适配列表懒加载、分页刷新等场景
    const observer = new MutationObserver(() => {
        convertMidToLink();
    });

    observer.observe(document.body, {
        childList: true,
        subtree: true
    });
})();
