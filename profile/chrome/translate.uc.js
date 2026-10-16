// ==UserScript==
// @name           Translate (lite): DeepL / Google
// @description    Sağ tık menüsünden "Seçili metni çevir" ve "Sayfayı çevir"; çeviri servisi (DeepL ya da Google) menüden
//                 anında değiştirilir. Sayfaya olay dinleyicisi eklemez (resmi DeepL uzantısının çift tıkla sayfa başına
//                 atlama gibi bozulmaları buradan geliyordu); yalnızca siz komut verince çalışır. Resmi API anahtarı gerekir
//                 (about:config > extensions.translate-lite.*); anahtar yoksa ilgili servisin kendi web sitesi açılır.
// @include        main
// ==/UserScript==

(function () {
    'use strict';

    if (window.TranslateLite) return;

    // ---------------------------------------------------------------
    // Ayarlar (about:config > extensions.translate-lite.*)
    //   provider        deepl | google (sağ tık menüsünden de değişir)
    //   targetLang      hedef dil, DeepL kodu biçiminde (TR, EN-US, DE, ZH-HANS ...); Google için otomatik çevrilir. Kaynak dil hep otomatik.
    //   deeplApiKey     DeepL API anahtarı. ":fx" ile bitiyorsa ücretsiz plan (api-free.deepl.com).
    //   googleApiKey    Google Cloud Translation (Basic, v2) API anahtarı.
    //   deeplEndpoint / googleEndpoint   boşsa resmi adres; deneme için elle verilebilir.
    //   maxChars        bir sayfa çevirisinde en çok kaç karakter gönderilsin (kota koruması). Varsayılan 40000.
    //   autoFallback    true (varsayılan): seçili servisin kotası dolarsa (DeepL 456, Google kota/oran sınırı) otomatik öbür servise geçilir;
    //                   seçim kalıcı değişir, istediğinizde "Çeviri servisi" menüsünden geri alırsınız. Öbür serviste anahtar yoksa onun web yolu kullanılır.
    //   webMode         anahtar yokken seçili metin:
    //                   auto (varsayılan) Google: ekran dışı gizli bir tarayıcıda Google Translate sitesi açılır, çıkan çeviri sayfadan okunur ve
    //                   kendi panelimizde gösterilir (site engellenirse/doğrulama isterse görünür panele düşer); DeepL: sitesi küçük bir panelde gösterilir
    //                   hidden  yalnızca gizli tarayıcı (destekleyen servis) | panel  servisin sitesi görünür panelde | tab  yeni sekme
    // Anahtarlar prefs.js'te saklanır; depoya GÖNDERMEYİN.
    // ---------------------------------------------------------------
    const PREF = 'extensions.translate-lite.';
    const defaults = Services.prefs.getDefaultBranch(PREF);
    defaults.setStringPref('provider', 'deepl');
    defaults.setStringPref('targetLang', 'TR');
    defaults.setStringPref('deeplApiKey', '');
    defaults.setStringPref('deeplEndpoint', '');
    defaults.setStringPref('googleApiKey', '');
    defaults.setStringPref('googleEndpoint', '');
    defaults.setIntPref('maxChars', 40000);
    defaults.setBoolPref('autoFallback', true);   // seçili servisin kotası dolarsa öbür servise otomatik geç (seçim kalıcı değişir, menüden geri alınır)
    defaults.setStringPref('webMode', 'auto');   // anahtarsız seçili metin: auto | hidden | panel | tab (aşağıdaki açıklamaya bakın)
    const prefs = Services.prefs.getBranch(PREF);

    // Önceki sürümün (extensions.deepl-lite.*) değerlerini bir kez taşı
    try {
        const old = Services.prefs.getBranch('extensions.deepl-lite.');
        const move = (oldName, newName) => {
            if (old.prefHasUserValue(oldName) && !prefs.prefHasUserValue(newName)) prefs.setStringPref(newName, old.getStringPref(oldName));
        };
        move('apiKey', 'deeplApiKey'); move('targetLang', 'targetLang'); move('endpoint', 'deeplEndpoint');
    } catch (e) {}

    const get = k => prefs.getStringPref(k).trim();
    const targetLang = () => get('targetLang') || 'TR';

    // ---------------------------------------------------------------
    // Çeviri servisleri. Her biri: name, hasKey(), translate(texts) -> metin listesi, chunk (istek sınırları),
    // webSelection(text) (anahtarsız: seçili metin için servisin kendi sitesi), webPage(uri) (anahtarsız sayfa çevirisi ya da null)
    // ---------------------------------------------------------------
    class QuotaError extends Error {}
    function errorFor(name, res, extra = {}) {
        const why = { 400: 'istek geçersiz', 401: 'API anahtarı geçersiz', 403: 'API anahtarı geçersiz ya da yetkisiz', 429: 'çok fazla istek, biraz bekleyin', ...extra }[res.status] || '';
        return new Error(`${name} hatası ${res.status}${why ? ': ' + why : ''}`);
    }

    const PROVIDERS = {
        deepl: {
            name: 'DeepL',
            chunk: { count: 45, chars: 60000 },
            hasKey: () => !!get('deeplApiKey'),
            async translate(texts) {
                const key = get('deeplApiKey');
                if (!key) throw new Error('DeepL API anahtarı yok. about:config > extensions.translate-lite.deeplApiKey');
                const base = (get('deeplEndpoint') || (key.endsWith(':fx') ? 'https://api-free.deepl.com' : 'https://api.deepl.com')).replace(/\/+$/, '');
                const res = await fetch(base + '/v2/translate', {
                    method: 'POST',
                    headers: { 'Authorization': 'DeepL-Auth-Key ' + key, 'Content-Type': 'application/json' },
                    body: JSON.stringify({ text: texts, target_lang: targetLang(), preserve_formatting: true })
                });
                if (res.status === 456) throw new QuotaError('DeepL aylık kotası doldu');
                if (!res.ok) throw errorFor('DeepL', res);
                return (await res.json()).translations.map(t => t.text);
            },
            webSelection: text => 'https://www.deepl.com/translator#auto/' + targetLang().toLowerCase() + '/' +
                encodeURIComponent(text.slice(0, 1500)).replace(/%2F/g, '%5C%2F'),
            hasWebPage: false,
            webPage: () => null
        },
        google: {
            name: 'Google',
            chunk: { count: 100, chars: 15000 },
            hasKey: () => !!get('googleApiKey'),
            async translate(texts) {
                const key = get('googleApiKey');
                if (!key) throw new Error('Google API anahtarı yok. about:config > extensions.translate-lite.googleApiKey');
                const base = (get('googleEndpoint') || 'https://translation.googleapis.com').replace(/\/+$/, '');
                const res = await fetch(base + '/language/translate/v2', {
                    method: 'POST',
                    headers: { 'X-Goog-Api-Key': key, 'Content-Type': 'application/json' },
                    body: JSON.stringify({ q: texts, target: googleLang(targetLang()), format: 'text' })
                });
                if (!res.ok) {
                    // Kota / oran sınırı: 429 ya da 403 + reason (quotaExceeded, dailyLimitExceeded, rateLimitExceeded ...)
                    let reason = '';
                    try { const j = await res.clone().json(); reason = JSON.stringify(j.error && (j.error.errors || j.error.status || j.error.message) || ''); } catch (e) {}
                    if (res.status === 429 || /quota|limitexceeded|resource_exhausted/i.test(reason)) throw new QuotaError('Google kotası ya da istek sınırı doldu');
                    throw errorFor('Google', res);
                }
                return (await res.json()).data.translations.map(t => t.translatedText);
            },
            webSelection: text => 'https://translate.google.com/?sl=auto&tl=' + googleLang(targetLang()) +
                '&text=' + encodeURIComponent(text.slice(0, 5000)) + '&op=translate',
            hasWebPage: true,
            // Gizli web motoru: sitenin kendi sayfası URL ile (metin hazır dolu) açılır, sonuç sayfadan okunur
            hiddenUrl: text => 'https://translate.google.com/?sl=auto&tl=' + googleLang(targetLang()) + '&text=' + encodeURIComponent(text) + '&op=translate',
            // Google'ın kendi web sitesi çeviri hizmeti (translate.goog): anahtarsız, ama sayfa o adreste yeniden açılır;
            // oturum açmış (giriş gerektiren) sayfalarda çalışmaz
            webPage(uri) {
                if (!uri || !/^https?$/.test(uri.scheme)) return null;
                const host = uri.host.replace(/-/g, '--').replace(/\./g, '-');
                const lang = googleLang(targetLang());
                const sep = uri.query ? '&' : '?';
                return `https://${host}.translate.goog${uri.filePath}${uri.query ? '?' + uri.query : ''}${sep}_x_tr_sl=auto&_x_tr_tl=${lang}&_x_tr_hl=${lang}&_x_tr_pto=wapp`;
            }
        }
    };
    // DeepL hedef dil kodunu Google'ınkine çevir (EN-US -> en, ZH-HANS -> zh-CN, PT-BR -> pt)
    function googleLang(code) {
        const c = String(code || 'TR').toUpperCase();
        return { 'ZH-HANS': 'zh-CN', 'ZH-HANT': 'zh-TW', 'ZH': 'zh-CN' }[c] || c.split('-')[0].toLowerCase();
    }
    const provider = () => PROVIDERS[get('provider')] || PROVIDERS.deepl;

    // İstekler servisin sınırlarına uyar
    async function translateAll(texts) {
        const p = provider();
        const out = new Array(texts.length);
        let i = 0;
        while (i < texts.length) {
            let j = i, chars = 0;
            while (j < texts.length && j - i < p.chunk.count && chars + texts[j].length <= p.chunk.chars) chars += texts[j++].length;
            if (j === i) j = i + 1;   // tek başına çok uzun metin
            const part = await p.translate(texts.slice(i, j));
            part.forEach((t, k) => { out[i + k] = t; });
            i = j;
        }
        return out;
    }

    // ---------------------------------------------------------------
    // İçerik tarafı (çerçeve betiği): yalnızca mesajla çalışır, sayfaya hiçbir dinleyici eklemez
    // ---------------------------------------------------------------
    const FRAME_SCRIPT = `
        let nodes = [], orig = [], pre = [], suf = [], docId = 0;
        const SKIP = /^(SCRIPT|STYLE|NOSCRIPT|CODE|PRE|TEXTAREA|SVG|KBD|SAMP|INPUT|SELECT|OPTION)$/;
        const reply = (name, data) => sendAsyncMessage('TranslateLite:' + name, data);
        const reset = () => { nodes = []; orig = []; pre = []; suf = []; docId = 0; };
        // Gezinme olunca durumu sıfırla (yalnızca gözlem, sayfayı etkilemez)
        addEventListener('pagehide', e => { if (e.target === content.document) { reset(); reply('State', { translated: false }); } }, true);

        addMessageListener('TranslateLite:Collect', m => {
            try {
                reset();
                const body = content.document.body;
                const texts = [];
                if (body) {
                    const w = content.document.createTreeWalker(body, 4, null);
                    for (let n = w.nextNode(); n; n = w.nextNode()) {
                        const p = n.parentElement, v = n.nodeValue;
                        if (!p || SKIP.test(p.tagName) || !/\\S/.test(v)) continue;
                        const core = v.trim();
                        if (core.length < 2 || /^[\\d\\s.,:;%$€£+\\-\\/()|•·…]+$/.test(core)) continue;
                        if (p.closest('[contenteditable=true], [translate=no], .notranslate')) continue;
                        if (p.checkVisibility && !p.checkVisibility()) continue;
                        nodes.push(n); orig.push(v);
                        pre.push(v.slice(0, v.indexOf(core))); suf.push(v.slice(v.indexOf(core) + core.length));
                        texts.push(core);
                    }
                }
                docId = content.windowGlobalChild.innerWindowId;
                reply('Collected', { id: m.data.id, texts });
            } catch (e) { reply('Collected', { id: m.data.id, texts: [], error: String(e) }); }
        });

        // Seçimin görünür alandaki konumu (panel seçimin yanında açılsın diye); metin kutusu seçimlerinde yok
        addMessageListener('TranslateLite:SelRect', m => {
            let rect = null;
            try {
                const sel = content.getSelection();
                if (sel && sel.rangeCount) {
                    const rs = sel.getRangeAt(0).getClientRects();
                    if (rs.length) { const f = rs[0], l = rs[rs.length - 1]; rect = { left: f.left, top: f.top, bottom: l.bottom, right: l.right }; }
                }
            } catch (e) {}
            reply('SelRect', { id: m.data.id, rect });
        });

        addMessageListener('TranslateLite:Apply', m => {
            let n = 0;
            try {
                if (docId === content.windowGlobalChild.innerWindowId) {
                    m.data.translations.forEach((t, i) => {
                        if (typeof t === 'string' && nodes[i] && nodes[i].isConnected) { nodes[i].nodeValue = pre[i] + t + suf[i]; n++; }
                    });
                }
            } catch (e) {}
            reply('Applied', { id: m.data.id, count: n });
            reply('State', { translated: n > 0 });
        });

        addMessageListener('TranslateLite:Restore', m => {
            try {
                if (docId === content.windowGlobalChild.innerWindowId) nodes.forEach((n, i) => { if (n.isConnected) n.nodeValue = orig[i]; });
            } catch (e) {}
            reset();
            reply('Restored', { id: m.data.id });
            reply('State', { translated: false });
        });
    `;
    try {
        window.messageManager.loadFrameScript('data:application/javascript;charset=utf-8,' + encodeURIComponent(FRAME_SCRIPT), true);
    } catch (e) {
        console.error('[TranslateLite] çerçeve betiği yüklenemedi', e);
        return;
    }

    let seq = 0;
    const waiting = new Map();
    for (const name of ['Collected', 'Applied', 'Restored', 'SelRect']) {
        window.messageManager.addMessageListener('TranslateLite:' + name, msg => {
            const done = waiting.get(msg.data && msg.data.id);
            if (done) done(msg.data);
        });
    }
    window.messageManager.addMessageListener('TranslateLite:State', msg => {
        const tab = gBrowser.getTabForBrowser(msg.target);
        if (tab) tab._translateDone = !!(msg.data && msg.data.translated);
    });
    function ask(browser, name, data = {}) {
        return new Promise(resolve => {
            const id = ++seq;
            const timer = window.setTimeout(() => { waiting.delete(id); resolve(null); }, 15000);
            waiting.set(id, d => { window.clearTimeout(timer); waiting.delete(id); resolve(d); });
            browser.messageManager.sendAsyncMessage('TranslateLite:' + name, { id, ...data });
        });
    }

    // ---------------------------------------------------------------
    // Arayüz: Firefox'un panel renklerinden türeyen küçük sonuç paneli + geçici bildirim
    // ---------------------------------------------------------------
    const XHTML = 'http://www.w3.org/1999/xhtml';
    const CSS = `
    .tl, .tl-toast { --tl-fg: var(--arrowpanel-color, FieldText); --tl-bg: var(--arrowpanel-background, Field);
        --tl-muted: color-mix(in srgb, var(--tl-fg) 62%, transparent); --tl-hover: color-mix(in srgb, var(--tl-fg) 9%, transparent);
        --tl-err: light-dark(#c50042, #ff6a8d);
        color: var(--tl-fg); font: inherit; font-size: 13px; line-height: 1.45; }
    .tl { width: 380px; max-width: 80vw; padding: 10px 12px 12px; box-sizing: border-box; }
    .tl-web { width: 464px; }
    .tl-head { display: flex; align-items: center; gap: 6px; color: var(--tl-muted); font-size: 11px; margin-bottom: 6px; }
    .tl-head span { flex: 1; letter-spacing: .04em; text-transform: uppercase; font-weight: 600; }
    .tl-ib { width: 24px; height: 24px; border: 0; border-radius: 4px; background: transparent; color: var(--tl-fg); cursor: pointer; display: grid; place-items: center; padding: 0; }
    .tl-ib:hover { background: var(--tl-hover); }
    .tl-ib svg { width: 14px; height: 14px; stroke: currentColor; fill: none; stroke-width: 1.6; stroke-linecap: round; stroke-linejoin: round; }
    .tl-body { max-height: 260px; overflow-y: auto; white-space: pre-wrap; user-select: text; -moz-user-select: text; }
    .tl-body.tl-err { color: var(--tl-err); }
    .tl-body.tl-wait { color: var(--tl-muted); }
    .tl-toast { position: fixed; left: 50%; bottom: 28px; transform: translateX(-50%); z-index: 2147483647; padding: 6px 12px; border-radius: 6px;
        font-size: 12px; background: var(--tl-fg); color: var(--tl-bg); box-shadow: 0 2px 10px rgba(0,0,0,.3); pointer-events: none; }
    `;
    function ensureStyle(doc) {
        let st = doc.getElementById('translate-lite-style');
        if (!st) { st = doc.createElementNS(XHTML, 'style'); st.id = 'translate-lite-style'; doc.documentElement.appendChild(st); }
        st.textContent = CSS;
    }
    const el = (tag, props = {}, kids = []) => { const e = document.createElementNS(XHTML, tag); Object.assign(e, props); kids.forEach(k => e.appendChild(k)); return e; };
    const svg = (paths) => {
        const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); s.setAttribute('viewBox', '0 0 16 16');
        paths.forEach(d => { const p = document.createElementNS('http://www.w3.org/2000/svg', 'path'); p.setAttribute('d', d); s.appendChild(p); });
        return s;
    };
    function iconBtn(paths, title, onClick) {
        const b = el('button', { className: 'tl-ib', type: 'button' }, [svg(paths)]);
        b.setAttribute('title', title); b.setAttribute('aria-label', title);
        b.addEventListener('click', onClick);
        return b;
    }

    function toast(message) {
        ensureStyle(document);
        document.getElementById('translate-lite-toast')?.remove();
        const t = el('div', { id: 'translate-lite-toast', className: 'tl-toast', textContent: message });
        t.setAttribute('role', 'status');
        (document.body || document.documentElement).appendChild(t);
        window.setTimeout(() => t.remove(), 2600);
    }

    let panel = null;
    // rect: seçimin tarayıcı alanındaki konumu (CSS px, görünür alana göre) ya da null
    function placePanel(rect) {
        const b = gBrowser.selectedBrowser;
        const z = b.fullZoom || 1;
        const W = 400, GAP = 8;
        let x, y;
        if (rect) {
            x = Math.min(Math.max(8, rect.left * z), Math.max(8, b.clientWidth - W));
            y = rect.bottom * z + GAP;                       // seçimin ALTINDA
            if (y > b.clientHeight - 200 && rect.top * z > 220) y = Math.max(8, rect.top * z - 200 - GAP);   // altı dar: ÜSTÜNDE
        } else {
            x = Math.max(20, (b.clientWidth - W) / 2); y = 40;
        }
        return { b, x, y };
    }

    // Gömülü web panelinde gizlenen üst alanlar (en iyi çaba: servislerin sayfa yapısı değişirse görünür kalabilir)
    const WEB_PANEL_FRAME = `
        const HIDE_CSS = 'header, [role="banner"], nav { display: none !important; }';
        const apply = () => {
            try {
                const d = content.document;
                if (!d || !d.documentElement || !/(^|\\.)(google\\.com|deepl\\.com)$/.test(content.location.hostname) || d.getElementById('tl-web-style')) return;
                const st = d.createElement('style');
                st.id = 'tl-web-style';
                st.textContent = HIDE_CSS;
                (d.head || d.documentElement).appendChild(st);
            } catch (e) {}
        };
        // Başlık gizlenince ana içerik hâlâ eski üst boşluğunda kalır (Google sayfası bu boşluğu ayrı aralıklarla bırakır; kaydırmayı
        // sayfa sıfırlıyor, ölçüldü). Ana içeriğin üstünü ölçüp sayfayı o kadar yukarı çek (negatif üst kenar boşluğu), bir kez.
        const shiftMain = () => {
            try {
                const d = content.document, root = d && d.documentElement, m = d && d.querySelector('[role="main"]'), st = d && d.getElementById('tl-web-style');
                if (!m || !st || root.dataset.tlShift) return;
                const top = m.getBoundingClientRect().top;
                if (top > 40) { st.textContent += ' body { margin-top: ' + (4 - top) + 'px !important; }'; root.dataset.tlShift = '1'; }
            } catch (e) {}
        };
        addEventListener('DOMContentLoaded', apply, true);
        addEventListener('load', apply, true);
        apply();
        shiftMain();
    `;

    function ensurePanel() {
        ensureStyle(document);
        if (panel) return;
        panel = document.createXULElement('panel');
        panel.id = 'translate-lite-result-panel';
        panel.setAttribute('type', 'arrow');
        panel.setAttribute('flip', 'both');
        panel.setAttribute('class', 'panel-no-padding');
        panel.style.setProperty('--arrowpanel-padding', '0');
        panel.addEventListener('popuphidden', () => panel.replaceChildren());   // gömülü web tarayıcısını (varsa) at
        document.documentElement.appendChild(panel);
    }

    function showResult(state, text, rect, viaWeb) {
        ensurePanel();
        const body = el('div', { className: 'tl-body' + (state === 'error' ? ' tl-err' : state === 'wait' ? ' tl-wait' : ''), textContent: text });
        const copy = iconBtn(['M5.5 5.5h7v8h-7z', 'M3.5 10.5v-8h7'], 'Kopyala', () => {
            Cc['@mozilla.org/widget/clipboardhelper;1'].getService(Ci.nsIClipboardHelper).copyString(text);
            toast('Çeviri panoya kopyalandı');
        });
        const close = iconBtn(['M3.5 3.5l9 9', 'M12.5 3.5l-9 9'], 'Kapat', () => panel.hidePopup());
        const head = el('div', { className: 'tl-head' }, [el('span', { textContent: provider().name + (viaWeb ? ' (web)' : '') + ' · otomatik → ' + targetLang() })]);
        if (state === 'ok') head.appendChild(copy);
        head.appendChild(close);
        panel.replaceChildren(el('div', { className: 'tl' }, [head, body]));
        if (rect !== undefined) lastRect = rect;   // metin gelince (undefined) önceki konum korunur
        const pos = placePanel(lastRect);
        if (panel.state === 'open' || panel.state === 'showing') panel.moveToAnchor(pos.b, 'overlap', pos.x, pos.y, false);
        else panel.openPopup(pos.b, 'overlap', pos.x, pos.y, false, false);
    }
    let lastRect = null;

    // ---------------------------------------------------------------
    // Gizli web motoru (yalnızca Google): ekran dışı bir tarayıcıda Google Translate SİTESİ açılır (sitenin kendi sayfası, kullanıcı
    // seçimiyle, her seferinde tek istek), çıkan çeviri sayfadan okunur ve kendi panelimizde gösterilir. Engel/doğrulama (CAPTCHA)
    // görülürse aşılmaya ÇALIŞILMAZ: görünür panele düşülür ve bir süre gizli motor kullanılmaz. Boşta kalınca tarayıcı atılır.
    // ---------------------------------------------------------------
    const HIDDEN_FRAME = `
        addMessageListener('TranslateLite:HPeek', m => {
            let out;
            try {
                const d = content.document, href = content.location.href;
                const spans = Array.from(d.querySelectorAll('span.ryNqvb'));
                let text = '';
                if (spans.length) { const c = spans[0].closest('span.HwtZe, div.lRu31') || spans[0].parentElement; text = c ? c.innerText : spans.map(x => x.textContent).join(''); }
                out = { href, ready: d.readyState, text,
                        blocked: href.indexOf('/sorry/') >= 0 || !!d.querySelector('iframe[src*="recaptcha"], form[action*="sorry"]') };
            } catch (e) { out = { error: String(e) }; }
            sendAsyncMessage('TranslateLite:HOut', Object.assign({ id: m.data.id }, out));
        });
    `;
    let hiddenEngine = null, hiddenIdleTimer = 0, hiddenBlockedUntil = 0, hiddenChain = Promise.resolve();
    window.messageManager.addMessageListener('TranslateLite:HOut', msg => {
        const done = waiting.get(msg.data && msg.data.id);
        if (done) done(msg.data);
    });
    function closeHidden() {
        window.clearTimeout(hiddenIdleTimer);
        if (hiddenEngine) { try { hiddenEngine.host.remove(); } catch (e) {} hiddenEngine = null; }
    }
    function createHidden() {
        const host = el('div', { id: 'translate-lite-hidden' });
        host.style.cssText = 'position:fixed;left:-10000px;top:0;width:480px;height:360px;overflow:hidden;pointer-events:none';
        const b = document.createXULElement('browser');
        for (const [k, v] of Object.entries({ type: 'content', remote: 'true', maychangeremoteness: 'true', disableglobalhistory: 'true', messagemanagergroup: 'browsers', nodefaultsrc: 'true' })) b.setAttribute(k, v);
        b.style.width = '480px'; b.style.height = '360px';
        host.appendChild(b);
        document.documentElement.appendChild(host);
        return { host, browser: b };
    }
    const sleep = ms => new Promise(r => window.setTimeout(r, ms));
    function peek(b) {
        return new Promise(resolve => {
            const id = ++seq;
            const timer = window.setTimeout(() => { waiting.delete(id); resolve(null); }, 4000);
            waiting.set(id, d => { window.clearTimeout(timer); waiting.delete(id); resolve(d); });
            try { b.messageManager.sendAsyncMessage('TranslateLite:HPeek', { id }); } catch (e) { window.clearTimeout(timer); waiting.delete(id); resolve(null); }
        });
    }
    // Sonuç: { ok, text } | { blocked } | { error }
    async function hiddenTranslate(p, text) {
        window.clearTimeout(hiddenIdleTimer);
        if (!hiddenEngine) hiddenEngine = createHidden();
        const b = hiddenEngine.browser;
        b.loadURI(Services.io.newURI(p.hiddenUrl(text)), { triggeringPrincipal: sysPrincipal() });
        await sleep(500);
        const inject = () => { try { b.messageManager.loadFrameScript('data:application/javascript;charset=utf-8,' + encodeURIComponent(HIDDEN_FRAME), false); } catch (e) {} };
        inject();
        let last = '', reinjected = false;
        const deadline = Date.now() + 18000;
        while (Date.now() < deadline) {
            const r = await peek(b);
            if (!r) { if (!reinjected) { inject(); reinjected = true; } await sleep(250); continue; }
            if (r.error) return { error: r.error };
            if (r.blocked) return { blocked: true };
            // Önceki sayfanın sonucu okunmasın: URL'deki metin gönderdiğimizle aynı olmalı
            let urlText = null;
            try { urlText = new URL(r.href).searchParams.get('text'); } catch (e) {}
            if (r.ready === 'complete' && urlText === text && r.text) {
                if (r.text === last) return { ok: true, text: last.trim() };   // iki ardışık okumada aynı: çeviri tamamlandı
                last = r.text;
            }
            await sleep(250);
        }
        return { error: 'Google sayfası zamanında cevap vermedi' };
    }
    // İstekler sırayla (tek tarayıcı); boşta 30 sn sonra tarayıcı atılır
    function hiddenQueue(p, text) {
        const run = async () => {
            try { return await hiddenTranslate(p, text); }
            catch (e) { return { error: String(e.message || e) }; }
            finally { hiddenIdleTimer = window.setTimeout(closeHidden, 30000); }
        };
        const r = hiddenChain.then(run);
        hiddenChain = r;
        return r;
    }

    // Anahtarsız yol: servisin KENDİ web sitesi (DeepL / Google Translate), metin hazır dolu, küçük bir panelde gösterilir.
    // Sayfanın içeriği okunmaz ya da kazınmaz; kullanıcıya siteyi olduğu gibi gösteren bir pencere. Panel kapanınca tarayıcı atılır.
    function showWebResult(url, rect) {
        ensurePanel();
        const b = document.createXULElement('browser');
        for (const [k, v] of Object.entries({ type: 'content', remote: 'true', maychangeremoteness: 'true', disableglobalhistory: 'true', messagemanagergroup: 'browsers', nodefaultsrc: 'true' })) b.setAttribute(k, v);
        b.style.width = '440px'; b.style.height = '380px'; b.style.display = 'block';
        const openInTab = iconBtn(['M6.5 3.5h-3v9h9v-3', 'M8.5 3.5h4v4', 'M12.5 3.5l-5.5 5.5'], 'Sekmede aç', () => { panel.hidePopup(); openTab(url); });
        const close = iconBtn(['M3.5 3.5l9 9', 'M12.5 3.5l-9 9'], 'Kapat', () => panel.hidePopup());
        const head = el('div', { className: 'tl-head' }, [el('span', { textContent: provider().name + ' · web çevirmeni' })]);
        head.append(openInTab, close);
        const wrap = el('div', { className: 'tl tl-web' }, [head]);
        wrap.appendChild(b);
        panel.replaceChildren(wrap);
        if (rect !== undefined) lastRect = rect;
        const pos = placePanel(lastRect);
        if (panel.state === 'open' || panel.state === 'showing') panel.moveToAnchor(pos.b, 'overlap', pos.x, pos.y, false);
        else panel.openPopup(pos.b, 'overlap', pos.x, pos.y, false, false);
        // Panelde sitenin üst kısmı (logo, menüler, giriş, çeviri türü sekmeleri) gösterilmez: yalnızca bu panelin
        // içindeki sayfaya stil eklenir; servisin kendi sitesinde ya da başka sekmelerde hiçbir şey değişmez.
        // Gecikmeli yükleme (allowDelayedLoad) bu gömülü tarayıcıda çalışmadı (ölçüldü); sayfa yüklendikten sonra
        // birkaç kez enjekte edilir (betik kendini tekrar uygulamaz): sayfa uygulaması başlığı geç çizebilir.
        const inject = () => { try { if (b.isConnected && b.messageManager) b.messageManager.loadFrameScript('data:application/javascript;charset=utf-8,' + encodeURIComponent(WEB_PANEL_FRAME), false); } catch (e) {} };
        for (const ms of [700, 1500, 3000, 6000]) window.setTimeout(inject, ms);
        try { b.loadURI(Services.io.newURI(url), { triggeringPrincipal: sysPrincipal() }); }
        catch (e) { b.setAttribute('src', url); }
        return b;
    }

    // ---------------------------------------------------------------
    // Komutlar
    // ---------------------------------------------------------------
    const sysPrincipal = () => Services.scriptSecurityManager.getSystemPrincipal();
    const openTab = url => { gBrowser.selectedTab = gBrowser.addTab(url, { triggeringPrincipal: sysPrincipal() }); };

    // Seçili servisin kotası dolduysa (ve ayar açıksa) öbür servise kalıcı geç; başarılıysa true
    function fallbackFrom(p) {
        if (!prefs.getBoolPref('autoFallback')) return false;
        const other = Object.keys(PROVIDERS).find(id => PROVIDERS[id] !== p);
        if (!other) return false;
        setProvider(other, `${p.name} kotası doldu: ${PROVIDERS[other].name} servisine geçildi`);
        return true;
    }

    async function translateSelection(text, retried = false) {
        text = (text || '').trim();
        if (!text) return;
        const p = provider();
        // Anahtar yoksa: servisin kendi web çevirmenini seçili metin hazır dolu olarak yeni sekmede aç (anahtarsız, resmi site)
        if (!p.hasKey()) {
            const mode = get('webMode');
            if (mode === 'tab') {
                openTab(p.webSelection(text));
                toast(`${p.name} API anahtarı yok: ${p.name} web çevirmeni açıldı`);
                return;
            }
            const got = await ask(gBrowser.selectedBrowser, 'SelRect');
            const rect = got ? got.rect : null;
            // Gizli web motoru: destekleyen servis (Google) ve auto/hidden kipinde; engel görülürse bir süre kullanılmaz
            if (p.hiddenUrl && (mode === 'auto' || mode === 'hidden') && Date.now() > hiddenBlockedUntil) {
                showResult('wait', 'Çevriliyor…', rect, true);
                const r = await hiddenQueue(p, text.slice(0, 4000));
                if (r.ok) { showResult('ok', r.text, undefined, true); return; }
                if (r.blocked) { hiddenBlockedUntil = Date.now() + 10 * 60000; toast(`${p.name} doğrulama istedi: 10 dakika görünür panel kullanılacak`); }
                else if (mode === 'hidden') { showResult('error', r.error || 'Çeviri alınamadı', undefined, true); return; }
                showWebResult(p.webSelection(text), rect);   // görünür panele düş (kullanıcı doğrulamayı kendisi geçebilir)
                return;
            }
            showWebResult(p.webSelection(text), rect);
            return;
        }
        const got = await ask(gBrowser.selectedBrowser, 'SelRect');
        showResult('wait', 'Çevriliyor…', got ? got.rect : null);
        try {
            const [t] = await translateAll([text]);
            showResult('ok', t);
        } catch (e) {
            if (e instanceof QuotaError && !retried && fallbackFrom(p)) return translateSelection(text, true);
            showResult('error', String(e.message || e));
        }
    }

    let pageBusy = false;
    async function translatePage(retried = false) {
        if (pageBusy) return;
        const p = provider();
        // Anahtar yoksa: Google'ın web sitesi çeviri hizmeti (sayfa o adreste yeniden açılır); DeepL'in anahtarsız sayfa yolu yok
        if (!p.hasKey()) {
            const url = p.webPage(gBrowser.currentURI);
            if (url) { gBrowser.selectedBrowser.loadURI(Services.io.newURI(url), { triggeringPrincipal: sysPrincipal() }); toast(`${p.name} web çevirisi açılıyor (giriş gerektiren sayfalarda çalışmaz)`); }
            else toast(`${p.name} için API anahtarı gerekli: about:config > extensions.translate-lite.${get('provider') === 'google' ? 'googleApiKey' : 'deeplApiKey'}`);
            return;
        }
        const browser = gBrowser.selectedBrowser;
        pageBusy = true;
        try {
            const got = await ask(browser, 'Collect');
            if (!got || !got.texts.length) { toast('Çevrilecek metin bulunamadı'); return; }
            const max = prefs.getIntPref('maxChars');
            let texts = got.texts, total = 0, cut = texts.length;
            for (let i = 0; i < texts.length; i++) { total += texts[i].length; if (total > max) { cut = i; break; } }
            texts = texts.slice(0, cut);
            if (!texts.length) { toast('Sayfa kota sınırından büyük (extensions.translate-lite.maxChars)'); return; }
            toast(`${p.name}: ${texts.length} parça çevriliyor${cut < got.texts.length ? ' (sayfanın başı, kota sınırı)' : ''}…`);
            const out = await translateAll(texts);
            const res = await ask(browser, 'Apply', { translations: out });
            toast(res && res.count ? 'Sayfa çevrildi' : 'Sayfa değişmiş, çeviri uygulanamadı');
        } catch (e) {
            if (e instanceof QuotaError && !retried && fallbackFrom(p)) { pageBusy = false; return translatePage(true); }
            toast(String(e.message || e));
        } finally { pageBusy = false; }
    }

    async function restorePage() {
        await ask(gBrowser.selectedBrowser, 'Restore');
        toast('Orijinal sayfa gösteriliyor');
    }

    function setProvider(id, message) {
        if (!PROVIDERS[id]) return;
        prefs.setStringPref('provider', id);
        toast(message || 'Çeviri servisi: ' + PROVIDERS[id].name);
    }

    // ---------------------------------------------------------------
    // Sağ tık menüsü
    // ---------------------------------------------------------------
    const menu = document.getElementById('contentAreaContextMenu');
    const mk = (id, label, cmd) => {
        const mi = document.createXULElement('menuitem');
        mi.id = id; mi.setAttribute('label', label);
        mi.addEventListener('command', cmd);
        return mi;
    };
    const selItem = mk('translate-lite-selection', 'Seçili metni çevir', () => {
        const info = window.gContextMenu && window.gContextMenu.selectionInfo;
        translateSelection(info && (info.fullText || info.text));
    });
    const pageItem = mk('translate-lite-page', 'Sayfayı çevir', () => translatePage());
    const backItem = mk('translate-lite-restore', 'Orijinal sayfayı göster', () => restorePage());
    // "Çeviri servisi" alt menüsü: DeepL / Google (radyo), seçim anında kaydedilir
    const provMenu = document.createXULElement('menu');
    provMenu.id = 'translate-lite-provider';
    provMenu.setAttribute('label', 'Çeviri servisi');
    const provPopup = document.createXULElement('menupopup');
    const provItems = {};
    for (const id of Object.keys(PROVIDERS)) {
        const mi = document.createXULElement('menuitem');
        mi.setAttribute('type', 'radio'); mi.setAttribute('name', 'translate-lite-provider'); mi.setAttribute('label', PROVIDERS[id].name);
        mi.addEventListener('command', () => setProvider(id));
        provPopup.appendChild(mi); provItems[id] = mi;
    }
    provMenu.appendChild(provPopup);
    if (menu) {
        // Kendi ayracımız yok: Firefox'un mevcut gruplarına eklenir (uBlock gibi başka eklentiler de kendi ayracını ekler)
        const after = (id, ...nodes) => { const ref = menu.querySelector('#' + id); if (ref) { ref.after(...nodes); return true; } return false; };
        // Dört madde yan yana, "Denetle" grubunun sonunda
        if (!after('context-inspect', selItem, pageItem, backItem, provMenu)) menu.append(selItem, pageItem, backItem, provMenu);
        menu.addEventListener('popupshowing', e => {
            if (e.target !== menu) return;
            const gcm = window.gContextMenu;
            const p = provider();
            const normalPage = gcm && !gcm.onLink && !gcm.onImage && !gcm.onVideo && !gcm.onAudio && !gcm.onTextInput;
            const translated = !!gBrowser.selectedTab._translateDone;
            // Etiketler seçili servisin adını taşır; anahtar yoksa servisin web sitesine gidileceği belli olsun
            selItem.setAttribute('label', `Seçili metni ${p.name} ile çevir${p.hasKey() ? '' : ' (web)'}`);
            pageItem.setAttribute('label', `Sayfayı ${p.name} ile çevir${!p.hasKey() && p.hasWebPage ? ' (web)' : ''}`);
            selItem.hidden = !(gcm && gcm.isTextSelected);
            pageItem.hidden = !normalPage || translated;
            backItem.hidden = !translated;
            provMenu.hidden = selItem.hidden && pageItem.hidden && backItem.hidden;
            // Önce hepsinin işaretini kaldır, sonra seçileni işaretle (radyo grubu, sırayla 'false' yazılırsa seçileni de siler)
            const cur = get('provider') in PROVIDERS ? get('provider') : 'deepl';
            for (const id of Object.keys(provItems)) provItems[id].removeAttribute('checked');
            provItems[cur].setAttribute('checked', 'true');
        });
    }

    window.TranslateLite = { translateSelection, translatePage, restorePage, translateAll, setProvider, showWebResult, hiddenQueue, PROVIDERS, prefs };
    window.addEventListener('unload', () => { try { panel?.remove(); } catch (e) {} closeHidden(); }, { once: true });
})();
