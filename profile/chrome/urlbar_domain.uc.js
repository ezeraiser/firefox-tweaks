// ==UserScript==
// @name           URL Bar Domain Only
// @description    Shows only the main domain name (without www.; the page name on about: pages) centered while the
//                 address bar is not focused; on click (focus) the real, long URL appears. It does not touch the
//                 address bar's value: it only writes a data-host attribute on #urlbar and its container, and
//                 userChrome.css draws the display (.urlbar-input-container::after).
// @description:tr Adres çubuğu odakta değilken yalnızca ana alan adını (www. olmadan; about: sayfalarında sayfa adını) ortalı gösterir; tıklayınca
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

    // EN: http(s): main domain name (without www.). about: pages (about:config, about:preferences ...): the
    // EN: page name, without "#section" and "?query", also centered. about:blank/newtab/home, which the address
    // EN: bar already shows as empty, and other schemes (file:, moz-extension: ...) are left as they are.
    // TR: http(s): ana alan adı (www. olmadan). about: sayfaları (about:config, about:preferences ...): sayfa adı, "#bölüm"
    // TR: ve "?sorgu" olmadan, yine ortalı. Adres çubuğunun zaten boş gösterdiği about:blank/newtab/home ve diğer
    // TR: şemalar (file:, moz-extension: ...) olduğu gibi kalır.
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
        // EN: Written to both elements: CSS selects the state from #urlbar, while attr() reads from the
        // EN: container that owns ::after.
        // TR: İki öğeye de yazılır: CSS durumu #urlbar'dan seçer, attr() ise ::after'ın sahibi olan kapsayıcıdan okur.
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
