// ==UserScript==
// @name         Steampy 左右方向键翻页
// @namespace    https://steampy.com/
// @version      2026.2.8
// @description  ← → 精确翻页
// @match        https://steampy.com/cdKey/*
// @grant        none
// ==/UserScript==

(function () {
    'use strict';

    const TURN_PAGE_INTERVAL = 500;
    const TOAST_DURATION = 2000;

    function isInInput() {
        const el = document.activeElement;
        if (!el) return false;
        const tag = el.tagName.toLowerCase();
        return tag === 'input' || tag === 'textarea' || el.isContentEditable;
    }

    function getPageNav() {
        return document.querySelector('nav.zpagenav');
    }

    function showToast(text) {
        let toast = document.getElementById('__steampy_toast__');
        if (!toast) {
            toast = document.createElement('div');
            toast.id = '__steampy_toast__';
            toast.style.cssText = `
                position: fixed;
                left: 50%;
                bottom: 120px;
                transform: translateX(-50%);
                z-index: 99999;
                padding: 10px 16px;
                background: rgba(0,0,0,.75);
                color: #fff;
                border-radius: 8px;
                font-size: 14px;
                pointer-events: none;
                opacity: 0;
                transition: opacity .2s ease;
                white-space: nowrap;
            `;
            document.body.appendChild(toast);
        }

        toast.textContent = text;
        toast.style.opacity = '1';

        clearTimeout(toast._timer);
        toast._timer = setTimeout(() => {
            toast.style.opacity = '0';
        }, TOAST_DURATION);
    }

    function isPageNumberLi(li) {
        return li && /^\d+$/.test(li.textContent.trim());
    }

    function findSiblingPage(activeLi, direction) {
        let cur = activeLi;
        while (cur) {
            cur = direction === 'prev'
                ? cur.previousElementSibling
                : cur.nextElementSibling;

            if (!cur) return null;
            if (isPageNumberLi(cur)) return cur;
        }
        return null;
    }

    let lastTurnTime = 0;

    function turnPage(direction) {
        const now = Date.now();
        if (now - lastTurnTime < TURN_PAGE_INTERVAL) return;
        lastTurnTime = now;

        const nav = getPageNav();
        if (!nav) return;

        const active = nav.querySelector('ul.page-ul > li.active');
        if (!active) return;

        const target = findSiblingPage(active, direction);

        if (!target) {
            showToast(direction === 'prev'
                ? '已经是第一页了'
                : '已经是最后一页了');
            return;
        }

        target.click();
    }

    document.addEventListener('keydown', e => {
        if (isInInput()) return;

        if (e.key === 'ArrowLeft') {
            e.preventDefault();
            turnPage('prev');
        }
        if (e.key === 'ArrowRight') {
            e.preventDefault();
            turnPage('next');
        }
    });

    console.log('[Steampy 翻页脚本 v2.2] 已加载');
})();
