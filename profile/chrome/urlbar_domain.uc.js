// ==UserScript==
// @name           URL Bar Domain Only
// @description    Adres çubuğu odakta değilken yalnızca ana alan adını (www. olmadan; about: sayfalarında sayfa adını) ortalı gösterir; tıklayınca
//                 (odaklanınca) gerçek, uzun URL görünür. Adres çubuğunun değerine dokunmaz: yalnızca #urlbar ve kapsayıcısına
//                 data-host özniteliği yazar, görüntüyü userChrome.css çizer (.urlbar-input-container::after).
// @include        main
// ==/UserScript==

(function () {
    'use strict';

    const urlbar = document.getElementById('urlbar');
    const box = urlbar?.querySelector('.urlbar-input-container');
    if (!urlbar || !box || urlbar.__domainOnly) return;
    urlbar.__domainOnly = true;

    // http(s): ana alan adı (www. olmadan). about: sayfaları (about:config, about:preferences ...): sayfa adı, "#bölüm"
    // ve "?sorgu" olmadan, yine ortalı. Adres çubuğunun zaten boş gösterdiği about:blank/newtab/home ve diğer
    // şemalar (file:, moz-extension: ...) olduğu gibi kalır.
    const BLANK_ABOUT = new Set(['about:blank', 'about:newtab', 'about:home', 'about:privatebrowsing']);
    function labelFor(uri) {
        try {
            if (!uri) return '';
            if (uri.scheme === 'http' || uri.scheme === 'https') return uri.host.replace(/^www\./, '');
            if (uri.scheme === 'about') {
                const name = 'about:' + uri.filePath;
                return BLANK_ABOUT.has(name) ? '' : name;
            }
        } catch (e) {}
        return '';
    }

    function update(uri) {
        const host = labelFor(uri);
        // İki öğeye de yazılır: CSS durumu #urlbar'dan seçer, attr() ise ::after'ın sahibi olan kapsayıcıdan okur.
        for (const el of [urlbar, box]) {
            if (host) el.setAttribute('data-host', host);
            else el.removeAttribute('data-host');
        }
    }

    const current = () => gBrowser.selectedBrowser?.currentURI;

    const listener = {
        onLocationChange(browser, webProgress, request, uri) {
            if (browser === gBrowser.selectedBrowser && webProgress.isTopLevel) update(uri);
        },
    };
    gBrowser.addTabsProgressListener(listener);
    gBrowser.tabContainer.addEventListener('TabSelect', () => update(current()));
    window.addEventListener('unload', () => gBrowser.removeTabsProgressListener(listener), { once: true });
    update(current());
})();
