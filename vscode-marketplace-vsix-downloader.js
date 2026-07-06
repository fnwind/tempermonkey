// ==UserScript==
// @name         VSCode Marketplace VSIX Downloader
// @namespace    https://github.com/vsc-exten/vsc-downloader
// @version      2026.7.6
// @description  在 VSCode Marketplace 的 Version History 标签页中，将每个版本号变为可点击的下载链接，点击下载 .vsix 安装包并自动命名为 插件ID-版本号.vsix。
// @author       chenshoufeng
// @match        https://marketplace.visualstudio.com/items?itemName=*
// @icon         https://marketplace.visualstudio.com/favicon.ico
// @grant        GM_xmlhttpRequest
// @connect      gallery.vsassets.io
// @connect      *
// @run-at       document-idle
// ==/UserScript==

(function () {
  'use strict';

  // 版本号：标准 semver（如 3.28.0）或日期型（如 2026.5.2026061001），点号分隔、不含斜杠
  const VERSION_RE = /^\d+(?:\.\d+){2,}$/;
  const LINK_FLAG = 'data-vsix-linked';
  const DOWNLOADING_FLAG = 'data-vsix-downloading';

  function parseItemName() {
    const params = new URLSearchParams(location.search);
    const itemName = params.get('itemName') || '';
    const idx = itemName.indexOf('.');
    if (idx <= 0 || idx === itemName.length - 1) return null;
    return {
      publisher: itemName.slice(0, idx),
      extension: itemName.slice(idx + 1)
    };
  }

  function buildUrl(p, e, v) {
    const sub = p.toLowerCase();
    return `https://${sub}.gallery.vsassets.io/_apis/public/gallery/publisher/${encodeURIComponent(p)}/extension/${encodeURIComponent(e)}/${encodeURIComponent(v)}/assetbyname/Microsoft.VisualStudio.Services.VSIXPackage`;
  }

  // 用 GM_xmlhttpRequest 获取 Blob，再用 a.download 指定文件名触发下载（绕过 CORS + 控制文件名）
  function downloadVsix(info, version, linkEl) {
    if (linkEl.hasAttribute(DOWNLOADING_FLAG)) return;
    const url = buildUrl(info.publisher, info.extension, version);
    const filename = `${info.publisher}.${info.extension}-${version}.vsix`;
    const origText = linkEl.textContent;

    linkEl.setAttribute(DOWNLOADING_FLAG, '1');
    linkEl.style.opacity = '0.55';
    linkEl.textContent = `${origText} downloading...`;

    function restore() {
      linkEl.removeAttribute(DOWNLOADING_FLAG);
      linkEl.style.opacity = '1';
      linkEl.textContent = origText;
    }

    function fallback() {
      // 降级：直接打开新标签，文件名将由服务器决定
      window.open(url, '_blank');
    }

    if (typeof GM_xmlhttpRequest !== 'function') {
      fallback();
      restore();
      return;
    }

    GM_xmlhttpRequest({
      method: 'GET',
      url: url,
      responseType: 'blob',
      timeout: 120000,
      onload: (res) => {
        const blob = res.response || (res.responseText && new Blob([res.responseText]));
        if (!blob) { restore(); fallback(); return; }
        const blobUrl = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = blobUrl;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        a.remove();
        // 稍延迟释放，避免下载未启动
        setTimeout(() => URL.revokeObjectURL(blobUrl), 4000);
        restore();
      },
      onerror: () => { restore(); fallback(); },
      ontimeout: () => { restore(); fallback(); }
    });
  }

  function makeLink(info, versionText) {
    const version = versionText.trim();
    if (!VERSION_RE.test(version)) return null;
    const a = document.createElement('a');
    a.href = buildUrl(info.publisher, info.extension, version);
    a.textContent = version;
    a.rel = 'noopener noreferrer';
    a.style.color = '#0078d4';
    a.style.textDecoration = 'none';
    a.style.cursor = 'pointer';
    a.title = `${info.publisher}.${info.extension}-${version}.vsix`;
    a.addEventListener('mouseenter', () => { a.style.textDecoration = 'underline'; });
    a.addEventListener('mouseleave', () => { a.style.textDecoration = 'none'; });
    // 拦截点击：用 Blob 下载以指定文件名，失败降级为新标签打开
    a.addEventListener('click', (e) => {
      e.preventDefault();
      downloadVsix(info, version, a);
    });
    return a;
  }

  function linkVersionCell(td, info) {
    if (td.hasAttribute(LINK_FLAG)) return;
    const text = td.textContent.trim();
    if (!VERSION_RE.test(text)) return;
    td.setAttribute(LINK_FLAG, '1');
    const link = makeLink(info, text);
    if (!link) return;
    td.textContent = '';
    td.appendChild(link);
  }

  function linkOverviewVersion(info) {
    const versionLabel = document.getElementById('version');
    if (!versionLabel) return;
    const versionCell = versionLabel.nextElementSibling;
    if (!versionCell || versionCell.getAttribute(LINK_FLAG)) return;
    const text = versionCell.textContent.trim();
    if (!VERSION_RE.test(text)) return;
    versionCell.setAttribute(LINK_FLAG, '1');
    const link = makeLink(info, text);
    if (!link) return;
    versionCell.textContent = '';
    versionCell.appendChild(link);
  }

  function processVersionHistory(info) {
    const rows = document.querySelectorAll('tr.version-history-container-row');
    rows.forEach(row => {
      const cells = row.querySelectorAll('td');
      if (cells.length === 0) return;
      const firstCell = cells[0];
      const cellText = firstCell.textContent.trim();
      if (VERSION_RE.test(cellText)) {
        linkVersionCell(firstCell, info);
      }
    });
  }

  function init() {
    const info = parseItemName();
    if (!info) return;

    function scan() {
      linkOverviewVersion(info);
      processVersionHistory(info);
    }

    scan();

    const observer = new MutationObserver(() => {
      scan();
    });
    observer.observe(document.body, { childList: true, subtree: true });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
