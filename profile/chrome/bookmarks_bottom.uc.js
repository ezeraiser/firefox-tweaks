// ==UserScript==
// @name           Bookmarks Bottom
// @description    userChrome.css'in yer imi çubuğunu dikey çubuğun bittiği yerden başlatması için sayfa alanının
//                 (#tabbrowser-tabbox) sol/sağ kenarını ölçüp --bm-left / --bm-right değişkenlerine yazar.
// @include        main
// ==/UserScript==

(function () {
    'use strict';

    const root = document.documentElement;
    const content = document.getElementById('tabbrowser-tabbox');
    if (!content || content.__bmBottom) return;
    content.__bmBottom = true;

    function update() {
        const r = content.getBoundingClientRect();
        if (!r.width) return;
        const left = Math.round(r.left);
        const right = Math.max(0, Math.round(window.innerWidth - r.right));
        root.style.setProperty('--bm-left', left + 'px');
        root.style.setProperty('--bm-right', right + 'px');
    }

    // Dikey çubuğun altındaki düğmeleri yer imi çubuğunun satırıyla hizala: daraltılmışken "»" (genişlet) düğmesi,
    // genişlemişken araç düğmeleri (yıldız vb.) yan yana tek satırda durur. Genişleme/daralma animasyonunda ikisi
    // aynı yere oturmalı, yoksa simgeler zıplar. Düğmeler kenar çubuğunun shadow DOM'unda; userChrome.css'in
    // ::part() kuralı etki etmedi (ölçüldü), bu yüzden stil doğrudan shadow köküne eklenir.
    // Ölçülen merkezler (pencere altından): "»" 26px, araç düğmesi satırı 20px; yer imi çubuğu --bm-gap + --bm-h/2.
    const ARROW_CENTER_FROM_BOTTOM = 26;
    const TOOLS_ROW_CENTER_FROM_BOTTOM = 20;
    function alignSidebarButtons() {
        const sr = document.querySelector('sidebar-main')?.shadowRoot;
        if (!sr) return;
        const cs = getComputedStyle(root);
        const target = parseFloat(cs.getPropertyValue('--bm-gap')) + parseFloat(cs.getPropertyValue('--bm-h')) / 2;
        if (!isFinite(target)) return;
        if (!alignSidebarButtons.sheet) {
            alignSidebarButtons.sheet = new CSSStyleSheet();
            sr.adoptedStyleSheets = [...sr.adoptedStyleSheets, alignSidebarButtons.sheet];
        }
        alignSidebarButtons.sheet.replaceSync(
            `.overflow-button { translate: 0 ${ARROW_CENTER_FROM_BOTTOM - target}px; }
             .tools-and-extensions:not(.overflow-button)[orientation="horizontal"] { translate: 0 ${TOOLS_ROW_CENTER_FROM_BOTTOM - target}px; }`);
    }

    // Kenar çubuğu açılıp kapanınca / sürüklenince / pencere boyutu değişince sayfa alanı değişir.
    new ResizeObserver(update).observe(content);
    window.addEventListener('resize', update);
    update();
    alignSidebarButtons();
})();
