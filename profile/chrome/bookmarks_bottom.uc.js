// ==UserScript==
// @name           Bookmarks Bottom
// @description    Measures the left/right edges of the page area (#tabbrowser-tabbox) and writes them to the --bm-left
//                 / --bm-right variables, so that userChrome.css can start the bookmarks bar where the vertical bar
//                 ends.
// @description:tr userChrome.css'in yer imi çubuğunu dikey çubuğun bittiği yerden başlatması için sayfa alanının
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

    // EN: Align the buttons at the bottom of the vertical bar with the bookmarks bar row: when collapsed, the
    // EN: "»" (expand) button; when expanded, the tool buttons (star etc.) sit side by side in a single row.
    // EN: During the expand/collapse animation both must land in the same place, otherwise the icons jump. The
    // EN: buttons are in the sidebar's shadow DOM; the ::part() rule in userChrome.css had no effect
    // EN: (measured), so the style is added directly to the shadow root. Measured centers (from the window
    // EN: bottom): "»" 26px, tool button row 20px; the bookmarks bar is --bm-gap + --bm-h/2.
    // TR: Dikey çubuğun altındaki düğmeleri yer imi çubuğunun satırıyla hizala: daraltılmışken "»" (genişlet) düğmesi,
    // TR: genişlemişken araç düğmeleri (yıldız vb.) yan yana tek satırda durur. Genişleme/daralma animasyonunda ikisi
    // TR: aynı yere oturmalı, yoksa simgeler zıplar. Düğmeler kenar çubuğunun shadow DOM'unda; userChrome.css'in
    // TR: ::part() kuralı etki etmedi (ölçüldü), bu yüzden stil doğrudan shadow köküne eklenir.
    // TR: Ölçülen merkezler (pencere altından): "»" 26px, araç düğmesi satırı 20px; yer imi çubuğu --bm-gap + --bm-h/2.
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

    // EN: The page area changes when the sidebar opens/closes, is dragged, or the window is resized.
    // TR: Kenar çubuğu açılıp kapanınca / sürüklenince / pencere boyutu değişince sayfa alanı değişir.
    new ResizeObserver(update).observe(content);
    window.addEventListener('resize', update);
    update();
    alignSidebarButtons();
})();
