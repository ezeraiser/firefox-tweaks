// ==UserScript==
// @name           UI helpers for userChrome.css
// @description    The small helpers userChrome.css needs, in one file. Each section only measures or tags elements;
//                 userChrome.css does the drawing. Sections and the userChrome.css blocks they feed (search for the
//                 same "[ui:...]" tag in both files):
//                   [ui:bookmarks-bottom]  --bm-left / --bm-right, sidebar button alignment  -> @ft:begin bookmarks-bottom
//                   [ui:bookmark-host-tag] data-bm-host on bookmark buttons                  -> dark-theme icon inversion
//                   [ui:urlbar-domain]     data-host on #urlbar                              -> @ft:begin urlbar-domain-only
//                   [ui:topbar-autohide]   ft-autohide-off, ft-ah-js, #nav-bar[ft-ah-open],
//                                          "Auto-hide the top bar" context menu item          -> @ft:begin topbar-autohide
//                 Each section runs in its own try block: an error in one does not stop the others.
// @description:tr userChrome.css'in ihtiyaç duyduğu küçük yardımcılar, tek dosyada. Her bölüm yalnızca ölçer ya da
//                 öğeleri etiketler; çizimi userChrome.css yapar. Bölümler ve besledikleri userChrome.css blokları
//                 (iki dosyada da aynı "[ui:...]" etiketini arayın): yukarıdaki liste. Her bölüm kendi try bloğunda
//                 çalışır: birindeki hata diğerlerini durdurmaz.
// @include        main
// ==/UserScript==

(function () {
    'use strict';

    const root = document.documentElement;

    function section(name, fn) {
        try { fn(); } catch (e) { console.error(`ui.uc.js [ui:${name}]`, e); }
    }

    // ------------------------------------------------------------------------------------------------------------
    // [ui:bookmarks-bottom]  userChrome.css: @ft:begin bookmarks-bottom (#PersonalToolbar inset uses --bm-left / --bm-right)
    // EN: Measures the left/right edges of the page area (#tabbrowser-tabbox) and writes them to --bm-left /
    // EN: --bm-right, so that userChrome.css can start the bookmarks bar where the vertical bar ends.
    // TR: userChrome.css'in yer imi çubuğunu dikey çubuğun bittiği yerden başlatması için sayfa alanının
    // TR: (#tabbrowser-tabbox) sol/sağ kenarını ölçüp --bm-left / --bm-right değişkenlerine yazar.
    // ------------------------------------------------------------------------------------------------------------
    section('bookmarks-bottom', () => {
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
    });

    // ------------------------------------------------------------------------------------------------------------
    // [ui:bookmark-host-tag]  userChrome.css: the dark-theme rule on .bookmark-item[data-bm-host=...] (end of file)
    // EN: Writes the domain name as a data-bm-host attribute on every button in the bookmarks bar. userChrome.css
    // EN: uses it to invert single-color icons (GitHub etc.) that look dark on a dark theme.
    // TR: Yer imi çubuğundaki her düğmeye alan adını data-bm-host özniteliği olarak yazar. userChrome.css bunu,
    // TR: koyu temada koyu görünen tek renkli simgeleri (GitHub vb.) ters çevirmek için kullanır.
    // ------------------------------------------------------------------------------------------------------------
    section('bookmark-host-tag', () => {
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
    });

    // ------------------------------------------------------------------------------------------------------------
    // [ui:urlbar-domain]  userChrome.css: @ft:begin urlbar-domain-only (#urlbar[data-host], .urlbar-input-container::after)
    // EN: Shows only the main domain name (without www.; the page name on about: pages) centered while the address
    // EN: bar is not focused; on click (focus) the real, long URL appears. It does not touch the address bar's
    // EN: value: it only writes a data-host attribute on #urlbar and its container, and userChrome.css draws it.
    // TR: Adres çubuğu odakta değilken yalnızca ana alan adını (www. olmadan; about: sayfalarında sayfa adını) ortalı
    // TR: gösterir; tıklayınca (odaklanınca) gerçek, uzun URL görünür. Adres çubuğunun değerine dokunmaz: yalnızca
    // TR: #urlbar ve kapsayıcısına data-host özniteliği yazar, görüntüyü userChrome.css çizer.
    // ------------------------------------------------------------------------------------------------------------
    section('urlbar-domain', () => {
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
    });

    // ------------------------------------------------------------------------------------------------------------
    // [ui:topbar-autohide]  userChrome.css: @ft:begin topbar-autohide ([ft-autohide-off], [ft-ah-js], #nav-bar[ft-ah-open],
    //                       --ah-close-delay)
    // EN: 1) Adds "Auto-hide the top bar" to the toolbar context menu. The choice is kept in the
    // EN:    userChrome.topbar-autohide pref and applies to every window; while it is off, ft-autohide-off is set on
    // EN:    the root and the CSS rules do not apply.
    // EN: 2) Decides when the bar is open (#nav-bar[ft-ah-open]) and counts the close delay itself. In pure CSS the
    // EN:    close delay was an animation delay; when the mouse came back before it ran out, the animation name
    // EN:    switched back to ah-in and the opening animation replayed on an already open bar. Here the attribute
    // EN:    simply stays during the delay. Without this script the CSS falls back to :hover.
    // TR: 1) Araç çubuğu sağ tık menüsüne "Üst çubuğu otomatik gizle" ekler. Seçim userChrome.topbar-autohide ayarında
    // TR:    saklanır ve tüm pencerelere uygulanır; kapalıyken kökte ft-autohide-off olur, CSS kuralları uygulanmaz.
    // TR: 2) Çubuğun ne zaman açık olacağına (#nav-bar[ft-ah-open]) karar verir, kapanış gecikmesini kendi sayar. Saf
    // TR:    CSS'te gecikme animasyon gecikmesiydi; fare süre bitmeden dönünce animasyon adı yeniden ah-in olduğu için
    // TR:    açılış animasyonu zaten açık çubukta baştan oynuyordu. Burada öznitelik gecikme boyunca durur.
    // TR:    Betik yoksa CSS :hover'a döner.
    // ------------------------------------------------------------------------------------------------------------
    section('topbar-autohide', () => {
        if (root.__topbarAutohide) return;
        root.__topbarAutohide = true;

        const PREF = 'userChrome.topbar-autohide';
        const enabled = () => Services.prefs.getBoolPref(PREF, true);
        const apply = () => root.toggleAttribute('ft-autohide-off', !enabled());

        const menu = document.getElementById('toolbar-context-menu');
        if (menu) {
            const isTr = Services.locale.appLocaleAsBCP47.startsWith('tr');
            const item = document.createXULElement('menuitem');
            item.id = 'ft-topbar-autohide-item';
            item.setAttribute('type', 'checkbox');
            item.setAttribute('label', isTr ? 'Üst çubuğu otomatik gizle' : 'Auto-hide the top bar');
            item.addEventListener('command', () => Services.prefs.setBoolPref(PREF, !enabled()));
            menu.prepend(item, document.createXULElement('menuseparator'));
            // EN: In XUL the PRESENCE of "checked" means checked ("false" is checked too), so it must be removed.
            // TR: XUL'da checked özniteliğinin VARLIĞI işaret demektir; "false" da işaretli sayılır, bu yüzden kaldırılmalı.
            menu.addEventListener('popupshowing', (e) => {
                if (e.target === menu) item.toggleAttribute('checked', enabled());
            });
        }

        // EN: Applied at once when the pref changes (from this or another window, or about:config).
        // TR: Ayar değişince (bu ya da başka bir pencereden, about:config'ten) hemen uygulanır.
        const observer = { observe: apply };
        Services.prefs.addObserver(PREF, observer);
        window.addEventListener('unload', () => Services.prefs.removeObserver(PREF, observer), { once: true });
        apply();

        const navBar = document.getElementById('nav-bar');
        if (!navBar) return;
        const WANT = ':hover, :focus-within, :has(#urlbar[open], toolbarbutton[open])';
        let closeTimer = null;

        // EN: The delay is read from --ah-close-delay in userChrome.css (".6s" or "600ms"), so it is set in one place.
        // TR: Gecikme userChrome.css'teki --ah-close-delay'den okunur (".6s" ya da "600ms"), tek yerden ayarlansın diye.
        function closeDelay() {
            const v = getComputedStyle(root).getPropertyValue('--ah-close-delay').trim();
            const n = parseFloat(v);
            if (isNaN(n)) return 600;
            return v.endsWith('ms') ? n : n * 1000;
        }

        function update() {
            if (navBar.matches(WANT)) {
                clearTimeout(closeTimer);
                closeTimer = null;
                navBar.setAttribute('ft-ah-open', '');
            } else if (navBar.hasAttribute('ft-ah-open') && !closeTimer) {
                closeTimer = setTimeout(() => {
                    closeTimer = null;
                    if (!navBar.matches(WANT)) navBar.removeAttribute('ft-ah-open');
                }, closeDelay());
            }
        }
        // EN: :hover / :focus-within may not be updated yet when the event fires; check on the next turn.
        // TR: Olay anında :hover / :focus-within henüz güncellenmemiş olabilir; bir sonraki turda bakılır.
        const later = () => setTimeout(update, 0);
        for (const type of ['mouseenter', 'mouseleave', 'focusin', 'focusout']) navBar.addEventListener(type, later);
        new MutationObserver(later).observe(navBar, { subtree: true, attributes: true, attributeFilter: ['open'] });
        root.setAttribute('ft-ah-js', '');
        update();
    });
})();
