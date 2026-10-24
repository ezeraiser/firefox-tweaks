// ==UserScript==
// @name           Bookmark Host Tag
// @description    Yer imi çubuğundaki her düğmeye alan adını data-bm-host özniteliği olarak yazar. userChrome.css bunu,
//                 koyu temada koyu görünen tek renkli simgeleri (GitHub vb.) ters çevirmek için kullanır.
// @include        main
// ==/UserScript==

(function () {
    'use strict';

    const items = document.getElementById('PlacesToolbarItems');
    if (!items || items.__hostTag) return;
    items.__hostTag = true;

    function tag() {
        for (const el of items.children) {
            try {
                const uri = el._placesNode?.uri;
                if (uri && /^https?:/.test(uri)) el.setAttribute('data-bm-host', new URL(uri).hostname.replace(/^www\./, ''));
            } catch (e) {}
        }
    }

    new MutationObserver(tag).observe(items, { childList: true });
    tag();
})();
