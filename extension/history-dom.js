/* Use only the visible Recent/Chats section, never a global list of chat URLs. */
(function(root) {
  const sidebarSelector = 'nav, aside, #history, [data-testid="history"], [data-testid="history-sidebar"]';
  const normalize = value => String(value || '').trim().replace(/\s+/g, ' ').toLowerCase();
  const names = {
    recent: ['recent', 'recents', 'recent chats', 'chats', 'your chats', 'chat history', '最近', '最近对话', '最近聊天', '聊天', '你的聊天', '聊天记录', '最近對話', '最近聊天', '聊天記錄'],
    pinned: ['pinned', 'pinned chats', 'favorites', 'favourites', '置顶', '置顶对话', '已置顶', '已釘選', '釘選', '收藏'],
    project: ['projects', 'project', '项目', '專案', '項目']
  };
  function namedKind(value) {
    const label = normalize(value);
    return Object.keys(names).find(kind => names[kind].includes(label)) || null;
  }
  function metadataKind(element) {
    for (const key of ['data-testid', 'data-section', 'data-sidebar-section', 'id']) {
      const value = normalize(element.getAttribute(key));
      if (/(^|[-_ ])(pinned|pins|favorites|favourites)([-_ ]|$)/.test(value)) return 'pinned';
      if (/(^|[-_ ])projects?([-_ ]|$)/.test(value)) return 'project';
      if (value === 'history' || /(^|[-_ ])(recent|recents)([-_ ]|$)/.test(value)) return 'recent';
    }
    // Section labels, not conversation names or arbitrary ancestor text.
    if (element.matches('section, nav, aside, [role="region"], [role="group"]')) return namedKind(element.getAttribute('aria-label'));
    return null;
  }
  function headingKind(element) {
    if (element.closest('a[href]') || element.querySelector('a[href]')) return null;
    return namedKind(element.getAttribute('aria-label')) || namedKind(element.textContent);
  }
  function scopeFor(link) {
    let scope = null;
    for (let parent = link.parentElement; parent; parent = parent.parentElement) {
      if (parent.matches(sidebarSelector)) scope = parent;
    }
    return scope;
  }
  function kindFor(link, scope) {
    let defaultKind = null;
    let recentScope = null;
    for (let parent = link.parentElement; parent; parent = parent.parentElement) {
      const kind = metadataKind(parent);
      if (kind === 'pinned' || kind === 'project') return kind;
      if (kind === 'recent') {defaultKind = 'recent'; if (!recentScope) recentScope = parent;}
      if (parent === scope) break;
    }
    // Following section headings change the zone; date headings do not.
    let section = defaultKind;
    for (const marker of (recentScope || scope).querySelectorAll('h1,h2,h3,h4,h5,h6,[role="heading"],button[aria-expanded],div,span')) {
      const kind = headingKind(marker);
      if (kind && (marker.compareDocumentPosition(link) & 4)) section = kind;
    }
    return section;
  }
  function recentLinks(document, location) {
    const all = Array.from(document.querySelectorAll('nav a[href],aside a[href],#history a[href],[data-testid="history"] a[href],[data-testid="history-sidebar"] a[href]'));
    const classified = [];
    for (const link of all) {
      let url;
      try { url = new URL(link.href, location.href); } catch { continue; }
      const scope = scopeFor(link);
      if (!scope || url.origin !== location.origin || !/^\/c\/[^/]+\/?$/.test(url.pathname)) continue;
      classified.push({link, visible:link.getClientRects().length > 0, path:url.pathname.replace(/\/$/, ''), kind:kindFor(link, scope)});
    }
    // If a pinned or project chat also appears in Recent, omit that duplicate too.
    const forbidden = new Set(classified.filter(item => ['pinned','project'].includes(item.kind)).map(item => item.path));
    const seen = new Set();
    return classified.filter(item => {
      if (!item.visible || item.kind !== 'recent' || forbidden.has(item.path) || seen.has(item.path)) return false;
      seen.add(item.path);
      return true;
    }).map(item => item.link);
  }
  root.HistoryDOM = {recentLinks};
  if (typeof module !== 'undefined') module.exports = root.HistoryDOM;
})(globalThis);
