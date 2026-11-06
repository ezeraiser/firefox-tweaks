// ==UserScript==
// @name           Extension Toggle Manager - Optimized
// @description    Uzantıları aç/kapatan kompakt panel: arama, sıralama, domain kuralları
// @author         Extension Toggle
// @include        main
// @startup        window.ExtensionToggleManager.init();
// @shutdown       window.ExtensionToggleManager.shutdown();
// @onlyonce
// ==/UserScript==

(function() {
    'use strict';

    if (window.ExtensionToggleManager) return;

    // Araç çubuğu düğmesi: Firefox'un kendi Uzantılar simgesi
    const BTN_ICON = 'url("chrome://mozapps/skin/extensions/extension.svg")';

    const SORT_LABELS = ['Özel sıra', 'İsme göre', 'Duruma göre'];

    // Stil: Firefox'un panel renklerinden türer (tema ve koyu mod kendiliğinden uyar)
    const STYLE_ID = 'etm-style';
    const STYLE_CSS = `
    .etm, .etm-dialog, .etm-fltoast {
        --etm-fg: var(--arrowpanel-color, FieldText);
        --etm-bg: var(--arrowpanel-background, Field);
        --etm-muted: color-mix(in srgb, var(--etm-fg) 62%, transparent);
        --etm-line: color-mix(in srgb, var(--etm-fg) 20%, transparent);
        --etm-hover: color-mix(in srgb, var(--etm-fg) 8%, transparent);
        --etm-press: color-mix(in srgb, var(--etm-fg) 14%, transparent);
        --etm-field: color-mix(in srgb, var(--etm-fg) 5%, transparent);
        --etm-accent: var(--color-accent-primary, AccentColor);
        --etm-on-accent: AccentColorText;
        --etm-off: color-mix(in srgb, var(--etm-fg) 45%, transparent);
        --etm-danger: light-dark(#c50042, #ff6a8d);
        --etm-ok: light-dark(#058b00, #54ffbd);
        color: var(--etm-fg);
        font: inherit;
        font-size: 13px;
        line-height: 1.4;
    }
    .etm { position: relative; width: 300px; padding: 8px; box-sizing: border-box; }
    .etm *, .etm-dialog * { box-sizing: border-box; }
    .etm-bar { display: flex; align-items: center; gap: 2px; }
    /* Giriş alanları Firefox'un kendi değişkenlerini kullanır; yoksa panel renginden türer */
    .etm-search, .etm-input, .etm-select {
        height: 28px; margin: 0; padding: 0 8px; font: inherit;
        border: 1px solid var(--input-border-color, var(--etm-line));
        border-radius: var(--border-radius-small, 4px);
        background: var(--input-background-color, var(--etm-field));
        color: var(--input-text-color, var(--etm-fg));
    }
    .etm-search:hover, .etm-input:hover, .etm-select:hover { border-color: var(--input-border-color-hover, var(--border-color-interactive-hover, var(--etm-fg))); }
    .etm-search { flex: 1; min-width: 0; margin-inline-end: 4px; }
    .etm-search::placeholder, .etm-input::placeholder { color: var(--etm-muted); }
    .etm-search:focus-visible, .etm-input:focus-visible, .etm-select:focus-visible {
        outline: 2px solid var(--focus-outline-color, var(--etm-accent)); outline-offset: -1px;
        border-color: var(--focus-outline-color, var(--etm-accent));
    }
    .etm-ib {
        width: 28px; height: 28px; border: 0; border-radius: 4px; background: transparent; color: var(--etm-fg);
        display: grid; place-items: center; cursor: pointer; padding: 0; margin: 0; flex: none;
    }
    .etm-ib svg { width: 16px; height: 16px; stroke: currentColor; fill: none; stroke-width: 1.6; stroke-linecap: round; stroke-linejoin: round; pointer-events: none; }
    .etm-ib:hover { background: var(--etm-hover); }
    .etm-ib:active { background: var(--etm-press); }
    .etm-ib:focus-visible { outline: 2px solid var(--etm-accent); outline-offset: -2px; }
    .etm-list { margin-top: 6px; max-height: 320px; overflow-y: auto; display: flex; flex-direction: column; gap: 1px; }
    .etm-row { display: flex; align-items: center; gap: 8px; height: 32px; padding: 0 4px 0 6px; border-radius: 4px; position: relative; flex: none; }
    .etm-row:hover { background: var(--etm-hover); }
    .etm-row.etm-dragging { opacity: .45; }
    .etm-row.etm-over { box-shadow: inset 0 2px 0 var(--etm-accent); }
    .etm-grip { width: 10px; flex: none; margin-inline-start: -6px; opacity: 0; cursor: grab; display: grid; place-items: center; color: var(--etm-muted); }
    .etm-grip svg { width: 10px; height: 14px; fill: currentColor; stroke: none; }
    .etm-row:hover .etm-grip, .etm-row:focus-within .etm-grip { opacity: .8; }
    .etm-ico { width: 18px; height: 18px; border-radius: 4px; flex: none; display: grid; place-items: center; font-size: 10px; font-weight: 700; color: #fff; background: var(--etm-off); object-fit: contain; }
    .etm-row.etm-off .etm-ico { filter: grayscale(1); opacity: .55; }
    .etm-name { flex: 1; min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .etm-row.etm-off .etm-name { color: var(--etm-muted); }
    .etm-dot { width: 6px; height: 6px; border-radius: 50%; background: var(--etm-accent); flex: none; }
    .etm-acts { display: flex; opacity: 0; }
    .etm-row:hover .etm-acts, .etm-row:focus-within .etm-acts { opacity: 1; }
    .etm-acts .etm-ib { width: 24px; height: 24px; }
    .etm-sw { width: 28px; height: 16px; border-radius: 8px; border: 0; padding: 0; margin: 0; position: relative; flex: none; cursor: pointer; background: var(--etm-off); }
    .etm-sw::after { content: ""; position: absolute; top: 2px; left: 2px; width: 12px; height: 12px; border-radius: 50%; background: var(--etm-bg); transition: transform .12s; }
    .etm-sw[aria-checked="true"] { background: var(--etm-accent); }
    .etm-sw[aria-checked="true"]::after { transform: translateX(12px); background: var(--etm-on-accent); }
    .etm-sw:focus-visible { outline: 2px solid var(--etm-accent); outline-offset: 2px; }
    .etm-foot { display: flex; justify-content: space-between; align-items: center; margin-top: 6px; padding: 6px 6px 0; border-top: 1px solid var(--etm-line); color: var(--etm-muted); font-size: 11px; }
    .etm-empty { padding: 18px 8px; text-align: center; color: var(--etm-muted); }
    .etm-err { color: var(--etm-danger); }
    .etm-toast {
        position: absolute; inset-inline: 8px; bottom: 34px; padding: 6px 10px; border-radius: 6px; font-size: 12px;
        background: var(--etm-fg); color: var(--etm-bg); opacity: 0; transform: translateY(4px); transition: opacity .18s, transform .18s; pointer-events: none;
    }
    .etm-toast.etm-show { opacity: 1; transform: none; }
    .etm-fltoast {
        position: fixed; left: 50%; bottom: 28px; transform: translateX(-50%); z-index: 2147483647; padding: 6px 12px; border-radius: 6px;
        font-size: 12px; background: var(--etm-fg); color: var(--etm-bg); box-shadow: 0 2px 10px rgba(0,0,0,.3); pointer-events: none;
    }
    .etm-backdrop { position: fixed; inset: 0; z-index: 2147483646; background: rgba(0, 0, 0, .35); display: flex; align-items: center; justify-content: center; }
    .etm-dialog {
        position: relative; width: 360px; max-width: calc(100vw - 32px); max-height: calc(100vh - 64px); display: flex; flex-direction: column;
        background: var(--etm-bg); border-radius: 8px; box-shadow: 0 2px 14px rgba(0,0,0,.35), 0 0 0 1px var(--etm-line); overflow: hidden;
    }
    .etm-dh { display: flex; align-items: center; gap: 8px; padding: 10px 8px 6px 12px; }
    .etm-dh h4 { flex: 1; min-width: 0; margin: 0; font-size: 14px; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .etm-dc { padding: 4px 12px 14px; overflow-y: auto; }
    .etm-hint { color: var(--etm-muted); font-size: 12px; margin: 0 0 8px; }
    .etm-form { display: flex; gap: 6px; margin-bottom: 10px; }
    .etm-form .etm-input { flex: 1; min-width: 0; }
    .etm-select { padding: 0 4px; }
    .etm-btn { height: 28px; border: 0; border-radius: 4px; padding: 0 12px; font: inherit; font-weight: 600; cursor: pointer; background: var(--etm-accent); color: var(--etm-on-accent); }
    .etm-btn:hover { filter: brightness(1.08); }
    .etm-btn:focus-visible { outline: 2px solid var(--etm-accent); outline-offset: 2px; }
    .etm-sub { font-size: 11px; letter-spacing: .04em; text-transform: uppercase; color: var(--etm-muted); margin: 10px 0 4px; font-weight: 600; }
    .etm-group { margin-bottom: 10px; }
    .etm-ghead { display: flex; align-items: center; gap: 4px; padding-inline-start: 6px; font-weight: 600; }
    .etm-ghead span { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .etm-rule { display: flex; align-items: center; gap: 8px; min-height: 30px; padding: 0 2px 0 6px; border-radius: 4px; }
    .etm-rule:hover { background: var(--etm-hover); }
    .etm-rule .etm-rname { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .etm-state { font-size: 12px; }
    .etm-state.etm-on { color: var(--etm-ok); }
    .etm-state.etm-offs { color: var(--etm-danger); }
    .etm-rule .etm-ib { width: 24px; height: 24px; }
    `;
    function ensureStyle(doc) {
        let st = doc.getElementById(STYLE_ID);
        if (!st) {
            st = doc.createElementNS('http://www.w3.org/1999/xhtml', 'style');
            st.id = STYLE_ID;
            doc.documentElement.appendChild(st);
        }
        st.textContent = STYLE_CSS;
    }

    // Çizgi simgeler (currentColor)
    const SVG_NS = 'http://www.w3.org/2000/svg';
    const ICON_DEFS = {
        power: ['M8 1.8v5.4', 'M4.6 3.9a5.4 5.4 0 1 0 6.8 0'],
        sort:  ['M4.5 2.5v11', 'M2.4 11.4l2.1 2.1 2.1-2.1', 'M11.5 13.5v-11', 'M9.4 4.6l2.1-2.1 2.1 2.1'],
        more:  [{c: [3.5, 8, 0.8]}, {c: [8, 8, 0.8]}, {c: [12.5, 8, 0.8]}],
        globe: [{c: [8, 8, 6]}, 'M2 8h12', 'M8 2c2 1.8 2.9 3.8 2.9 6S10 12.2 8 14c-2-1.8-2.9-3.8-2.9-6S6 3.8 8 2z'],
        gear:  [{c: [8, 8, 2]}, 'M8 1.6l1 1.7 2-.3.6 1.9 1.8 1-.9 1.8.9 1.8-1.8 1-.6 1.9-2-.3-1 1.7-1-1.7-2 .3-.6-1.9-1.8-1 .9-1.8-.9-1.8 1.8-1 .6-1.9 2 .3z'],
        trash: ['M2.5 4.5h11', 'M6 4.5V3h4v1.5', 'M4 4.5l.7 8.5h6.6l.7-8.5', 'M6.7 7v4', 'M9.3 7v4'],
        close: ['M3.5 3.5l9 9', 'M12.5 3.5l-9 9']
    };
    function icon(doc, name) {
        const svg = doc.createElementNS(SVG_NS, 'svg');
        svg.setAttribute('viewBox', '0 0 16 16');
        svg.setAttribute('aria-hidden', 'true');
        for (const part of ICON_DEFS[name]) {
            if (typeof part === 'string') {
                const p = doc.createElementNS(SVG_NS, 'path');
                p.setAttribute('d', part);
                svg.appendChild(p);
            } else {
                const c = doc.createElementNS(SVG_NS, 'circle');
                c.setAttribute('cx', part.c[0]);
                c.setAttribute('cy', part.c[1]);
                c.setAttribute('r', part.c[2]);
                if (part.c[2] < 1) c.setAttribute('fill', 'currentColor');
                svg.appendChild(c);
            }
        }
        return svg;
    }
    function gripIcon(doc) {
        const svg = doc.createElementNS(SVG_NS, 'svg');
        svg.setAttribute('viewBox', '0 0 10 14');
        svg.setAttribute('aria-hidden', 'true');
        for (const y of [3, 7, 11]) {
            for (const x of [3, 7]) {
                const c = doc.createElementNS(SVG_NS, 'circle');
                c.setAttribute('cx', x);
                c.setAttribute('cy', y);
                c.setAttribute('r', 1);
                svg.appendChild(c);
            }
        }
        return svg;
    }

    const H = {
        // props özellik, attrs öznitelik olarak atanır
        el: (doc, tag, props = {}, attrs = {}, children = []) => {
            const el = doc.createElementNS('http://www.w3.org/1999/xhtml', tag);
            Object.entries(props).forEach(([k, v]) => el[k] = v);
            Object.entries(attrs).forEach(([k, v]) => el.setAttribute(k, v));
            children.forEach(c => c && el.appendChild(c));
            return el;
        },

        xul: (doc, tag, attrs = {}) => {
            const el = doc.createXULElement(tag);
            Object.entries(attrs).forEach(([k, v]) => el.setAttribute(k, v));
            return el;
        },

        iconBtn: (doc, name, label, onClick, extra = {}) => {
            const b = H.el(doc, 'button', {className: 'etm-ib', type: 'button'}, {title: label, 'aria-label': label, ...extra}, [icon(doc, name)]);
            if (onClick) b.addEventListener('click', onClick);
            return b;
        },

        wait: (ms) => new Promise(r => setTimeout(r, ms)),

        cleanDomain: (d) => d.replace(/^https?:\/\//, '').split('/')[0]
    };

    window.ExtensionToggleManager = {
        button: null,
        panel: null,
        extensions: [],
        domainRules: {},
        manualStates: {},
        customOrder: [],
        initialized: false,
        draggedIndex: null,
        sortMode: 0,   // 0 özel sıra, 1 isme göre, 2 duruma göre

        // INIT
        async init() {
            if (this.initialized) return;

            try {
                this.loadSettings();
                await H.wait(1000);
                this.addButton();
                this.setupTabListeners();
                this.checkCurrentDomain();
                this.initialized = true;
            } catch (e) {
                console.error('Init error:', e);
            }
        },

        // BUTTON
        addButton() {
            const doc = Services.wm.getMostRecentWindow('navigator:browser')?.document;
            if (!doc) return;

            doc.getElementById('enhanced-ext-toggle-btn')?.remove();
            try { CustomizableUI.destroyWidget('enhanced-ext-toggle-btn'); } catch (e) {}

            CustomizableUI.createWidget({
                id: 'enhanced-ext-toggle-btn',
                type: 'custom',
                defaultArea: CustomizableUI.AREA_NAVBAR,
                tooltiptext: 'Uzantı yöneticisi\nSol tık: panel · Orta tık: tümünü aç/kapat · Sağ tık: menü',
                onBuild: (aDoc) => {
                    const btn = H.xul(aDoc, 'toolbarbutton', {
                        id: 'enhanced-ext-toggle-btn',
                        class: 'toolbarbutton-1 chromeclass-toolbar-additional',
                        label: 'Extensions+',
                        removable: 'true',
                        'cui-areatype': 'toolbar'
                    });
                    btn.style.listStyleImage = BTN_ICON;
                    btn.addEventListener('click', (e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        [() => this.togglePanel(btn), () => this.quickToggleAll(), () => this.showContextMenu(e)][e.button]?.();
                    });
                    return btn;
                }
            });

            this.button = doc.getElementById('enhanced-ext-toggle-btn');
        },

        // PANEL
        togglePanel(anchor) {
            if (this.panel?.state === 'open') {
                this.panel.hidePopup();
            } else {
                this.showExtensionPanel(anchor);
            }
        },

        async showExtensionPanel(anchor) {
            const doc = anchor.ownerDocument;
            ensureStyle(doc);
            this.panel?.remove();

            this.panel = H.xul(doc, 'panel', {
                id: 'enhanced-ext-panel',
                type: 'arrow',
                class: 'panel-no-padding',
                flip: 'both',
                position: 'bottomcenter topright'
            });
            this.panel.style.setProperty('--arrowpanel-padding', '0');

            const search = H.el(doc, 'input',
                {id: 'etm-search', className: 'etm-search', type: 'search', placeholder: 'Uzantılarda ara', autocomplete: 'off'},
                {'aria-label': 'Uzantılarda ara'});
            search.addEventListener('input', () => this.renderExtensions());

            const allBtn = H.iconBtn(doc, 'power', 'Tümünü kapat', () => this.quickToggleAll(), {id: 'etm-all'});
            const sortBtn = H.iconBtn(doc, 'sort', 'Sırala', () => this.openSortMenu(sortBtn), {id: 'etm-sort-btn', 'aria-haspopup': 'menu'});
            const moreBtn = H.iconBtn(doc, 'more', 'Diğer işlemler', () => this.openMoreMenu(moreBtn), {id: 'etm-more-btn', 'aria-haspopup': 'menu'});
            const bar = H.el(doc, 'div', {className: 'etm-bar'}, {}, [search, allBtn, sortBtn, moreBtn]);

            const list = H.el(doc, 'div', {id: 'ext-list-container', className: 'etm-list'}, {role: 'list'});
            const foot = H.el(doc, 'div', {className: 'etm-foot'}, {}, [
                H.el(doc, 'span', {id: 'etm-count'}),
                H.el(doc, 'span', {id: 'etm-sortnote'})
            ]);
            const toast = H.el(doc, 'div', {id: 'etm-toast', className: 'etm-toast'}, {role: 'status'});

            this.panel.appendChild(H.el(doc, 'div', {className: 'etm'}, {}, [bar, list, foot, toast]));
            doc.documentElement.appendChild(this.panel);

            await this.loadExtensions();
            this.panel.addEventListener('popupshown', () => search.focus(), {once: true});
            this.panel.openPopup(anchor, 'after_end', 0, 0, false, false);
        },

        // Yerel menüler (panelin dışına taşabilir)
        newMenu(doc, id) {
            doc.getElementById(id)?.remove();
            const menu = H.xul(doc, 'menupopup', {id});
            doc.documentElement.appendChild(menu);
            return menu;
        },

        openSortMenu(anchor) {
            const doc = anchor.ownerDocument;
            const menu = this.newMenu(doc, 'etm-sort-menu');
            SORT_LABELS.forEach((label, i) => {
                const mi = H.xul(doc, 'menuitem', {label, type: 'radio', name: 'etm-sort', checked: i === this.sortMode ? 'true' : 'false'});
                mi.addEventListener('command', () => { this.sortMode = i; this.renderExtensions(); });
                menu.appendChild(mi);
            });
            menu.openPopup(anchor, 'after_end');
        },

        openMoreMenu(anchor) {
            const doc = anchor.ownerDocument;
            const menu = this.newMenu(doc, 'etm-more-menu');
            const add = (label, cmd) => {
                const mi = H.xul(doc, 'menuitem', {label});
                mi.addEventListener('command', cmd);
                menu.appendChild(mi);
            };
            add('Domain kuralları…', () => this.openDomainRulesDialog());
            menu.appendChild(H.xul(doc, 'menuseparator'));
            add('Ayarları dışa aktar', () => this.exportSettings());
            add('Ayarları içe aktar…', () => this.importSettings());
            menu.appendChild(H.xul(doc, 'menuseparator'));
            add('Ayarları sıfırla…', () => this.resetSettings());
            menu.openPopup(anchor, 'after_end');
        },

        // EXTENSIONS
        async loadExtensions() {
            try {
                const AM = await this.getAddonManager();
                if (!AM) {
                    this.showError('AddonManager yüklenemedi');
                    return;
                }

                const addons = await AM.getAddonsByTypes(['extension']);
                this.extensions = addons.filter(a =>
                    !a.isSystem && a.type === 'extension' && a.id !== 'extension-toggle@userchrome.js'
                );

                this.renderExtensions();
            } catch (e) {
                console.error('Load error:', e);
                this.showError(e.message);
            }
        },

        async getAddonManager() {
            try { return ChromeUtils.importESModule('resource://gre/modules/AddonManager.sys.mjs').AddonManager; }
            catch (e) { return null; }
        },

        currentSearch(doc) {
            return doc.getElementById('etm-search')?.value.trim().toLowerCase() || '';
        },

        renderExtensions() {
            const doc = this.panel?.ownerDocument;
            if (!doc) return;

            const container = doc.getElementById('ext-list-container');
            if (!container) return;

            const filtered = this.getFilteredExtensions();
            container.replaceChildren();
            if (!filtered.length) {
                container.appendChild(H.el(doc, 'div', {
                    className: 'etm-empty',
                    textContent: this.extensions.length ? 'Eşleşen uzantı yok' : 'Uzantı bulunamadı'
                }));
            }
            filtered.forEach((ext, i) => container.appendChild(this.createExtItem(doc, ext, i)));

            const active = this.extensions.filter(e => e.isActive).length;
            const count = doc.getElementById('etm-count');
            if (count) count.textContent = `${active} / ${this.extensions.length} etkin`;
            const note = doc.getElementById('etm-sortnote');
            if (note) note.textContent = this.sortMode === 0 ? '' : SORT_LABELS[this.sortMode];
            const allBtn = doc.getElementById('etm-all');
            if (allBtn) {
                const label = active > 0 ? 'Tümünü kapat' : 'Tümünü aç';
                allBtn.setAttribute('title', label);
                allBtn.setAttribute('aria-label', label);
            }
        },

        hasDomainRules(extId) {
            return Object.values(this.domainRules).some(r => r && r[extId] !== undefined);
        },

        createExtItem(doc, ext, index) {
            const canDrag = this.sortMode === 0 && !this.currentSearch(doc);
            const row = H.el(doc, 'div',
                {className: 'etm-row' + (ext.isActive ? '' : ' etm-off'), draggable: canDrag},
                {role: 'listitem'});
            row.dataset.id = ext.id;

            const grip = H.el(doc, 'span', {className: 'etm-grip'}, {title: 'Sırayı değiştirmek için sürükle'}, [gripIcon(doc)]);
            if (!canDrag) grip.style.display = 'none';

            // Simge yoksa ya da yüklenemezse baş harfli renkli kutu
            const letter = () => {
                let h = 0;
                for (const ch of ext.name) h = (h * 31 + ch.charCodeAt(0)) % 360;
                const el = H.el(doc, 'span', {className: 'etm-ico', textContent: (ext.name[0] || '?').toUpperCase()});
                el.style.background = `hsl(${h} 42% 38%)`;
                return el;
            };
            let ico;
            if (ext.iconURL) {
                ico = H.el(doc, 'img', {className: 'etm-ico', src: ext.iconURL, alt: ''});
                ico.addEventListener('error', () => ico.replaceWith(letter()), {once: true});
            } else {
                ico = letter();
            }

            const tip = [`${ext.name}${ext.version ? ' v' + ext.version : ''}`, ext.description ? String(ext.description).slice(0, 160) : '']
                .filter(Boolean).join('\n');
            const name = H.el(doc, 'span', {className: 'etm-name', textContent: ext.name}, {title: tip});
            const dot = this.hasDomainRules(ext.id)
                ? H.el(doc, 'span', {className: 'etm-dot'}, {title: 'Bu uzantı için domain kuralı var'})
                : null;

            const domainBtn = H.iconBtn(doc, 'globe', 'Domain kuralları', e => {
                e.stopPropagation();
                this.openDomainDialog(ext);
            });
            const settingsBtn = H.iconBtn(doc, 'gear', 'Uzantı ayarları', async e => {
                e.stopPropagation();
                await this.openExtensionSettings(ext);
            });
            if (!ext.isActive) settingsBtn.style.display = 'none';   // kapalı uzantının ayarına ulaşılamaz
            const acts = H.el(doc, 'span', {className: 'etm-acts'}, {}, [domainBtn, settingsBtn]);

            const sw = H.el(doc, 'button', {className: 'etm-sw', type: 'button'}, {
                role: 'switch',
                'aria-checked': String(!!ext.isActive),
                'aria-label': ext.name,
                title: ext.isActive ? 'Kapat' : 'Aç'
            });

            const toggle = async e => {
                e?.stopPropagation();
                await this.toggleExtension(ext.id, !ext.isActive);
            };
            row.addEventListener('click', toggle);
            sw.addEventListener('click', toggle);

            row.addEventListener('dragstart', e => this.handleDragStart(e, index));
            row.addEventListener('dragover', e => this.handleDragOver(e));
            row.addEventListener('dragleave', () => row.classList.remove('etm-over'));
            row.addEventListener('drop', e => this.handleDrop(e, index));
            row.addEventListener('dragend', () => this.handleDragEnd());

            [grip, ico, name, dot, acts, sw].forEach(el => el && row.appendChild(el));
            return row;
        },

        getFilteredExtensions() {
            const doc = this.panel?.ownerDocument;
            if (!doc) return this.extensions;

            const search = this.currentSearch(doc);

            const filtered = this.extensions.filter(e =>
                e.name.toLowerCase().includes(search) ||
                (e.description?.toLowerCase().includes(search))
            );

            const sorters = [
                (a, b) => {
                    const [ai, bi] = [a, b].map(x => this.customOrder.indexOf(x.id));
                    return (ai === -1 ? Infinity : ai) - (bi === -1 ? Infinity : bi);
                },
                (a, b) => a.name.localeCompare(b.name, 'tr'),
                (a, b) => (b.isActive - a.isActive) || a.name.localeCompare(b.name, 'tr')
            ];

            return filtered.sort(sorters[this.sortMode] || sorters[0]);
        },

        // TOGGLE
        async toggleExtension(id, enable) {
            try {
                const AM = await this.getAddonManager();
                const addon = await AM.getAddonByID(id);

                if (addon) {
                    enable ? await addon.enable() : await addon.disable();
                    this.manualStates[id] = enable;
                    this.saveSettings();
                    await this.loadExtensions();
                    this.showNotification(`${addon.name} ${enable ? 'açıldı' : 'kapatıldı'}`);
                }
            } catch (e) {
                console.error('Toggle error:', e);
                this.showNotification('Hata: Extension durumu değiştirilemedi');
            }
        },

        async toggleAll(enable) {
            const toToggle = this.extensions.filter(e => e.isActive !== enable);
            for (const ext of toToggle) {
                await this.toggleExtension(ext.id, enable);
                await H.wait(50);
            }
            this.showNotification(`${toToggle.length} extension ${enable ? 'açıldı' : 'kapatıldı'}`);
        },

        async quickToggleAll() {
            const hasEnabled = this.extensions.some(e => e.isActive);
            await this.toggleAll(!hasEnabled);
        },

        // EXTENSION SETTINGS
        async openExtensionSettings(ext) {
            // Önce kendi panelimizi kapat: uzantının kendi açılır penceresi (sabitlenmiş düğme) altında kalmasın
            if (this.panel?.state === 'open') {
                this.panel.hidePopup();
                await H.wait(100);
            }

            try {
                if (this.tryToolbarButton(ext)) return;
                if (await this.tryExtensionsMenu(ext)) return;
                this.openInAboutAddons(ext);
            } catch (e) {
                console.error('Settings error:', e);
            }
        },

        tryToolbarButton(ext) {
            try {
                const doc = Services.wm.getMostRecentWindow('navigator:browser').document;
                const btns = doc.querySelectorAll('#nav-bar toolbarbutton[data-extensionid]');

                for (const btn of btns) {
                    if (btn.getAttribute('data-extensionid') === ext.id && btn.offsetWidth > 0) {
                        btn.click();
                        return true;
                    }
                }
            } catch (e) {}
            return false;
        },

        async tryExtensionsMenu(ext) {
            try {
                const win = Services.wm.getMostRecentWindow('navigator:browser');
                const doc = win.document;

                if (this.panel?.state === 'open') {
                    this.panel.hidePopup();
                    await H.wait(100);
                }

                const extBtn = doc.getElementById('unified-extensions-button');
                if (!extBtn) return false;

                extBtn.click();
                await H.wait(25);

                const result = await this.findExtInMenu(doc, ext);
                if (!result.found) extBtn.click();

                return result.found;
            } catch (e) {
                console.error('Menu error:', e);
                return false;
            }
        },

        async findExtInMenu(doc, ext) {
            const view = doc.getElementById('unified-extensions-view');
            if (!view) return {found: false};

            const items = view.querySelectorAll('[data-extensionid], .unified-extensions-item');

            for (const item of items) {
                const id = item.getAttribute('data-extensionid');
                const text = item.textContent || '';

                if (id === ext.id || text.includes(ext.name)) {
                    const btn = item.querySelector('.unified-extensions-item-action-button') ||
                        item.querySelector('button') || item;
                    btn.click();
                    return {found: true};
                }
            }

            return {found: false};
        },

        openInAboutAddons(ext) {
            const win = Services.wm.getMostRecentWindow('navigator:browser');
            win.BrowserOpenAddonsMgr(`addons://detail/${encodeURIComponent(ext.id)}`);
        },

        // DOMAIN RULES (pencereler)
        openDomainDialog(ext) {
            const win = Services.wm.getMostRecentWindow('navigator:browser');
            const doc = win.document;

            const {content} = this.createModal(doc, `Domain kuralları · ${ext.name}`);

            const current = this.getCurrentDomain();
            content.appendChild(H.el(doc, 'p', {
                className: 'etm-hint',
                textContent: current ? `Açık site: ${current}` : 'Açık site yok (özel sayfa)'
            }));

            const input = H.el(doc, 'input',
                {className: 'etm-input', type: 'text', placeholder: 'örn: sahibinden.com', value: current || ''},
                {'aria-label': 'Domain'});
            const select = H.el(doc, 'select', {className: 'etm-select'}, {'aria-label': 'Kural'}, [
                H.el(doc, 'option', {value: 'false', textContent: 'Kapat'}),
                H.el(doc, 'option', {value: 'true', textContent: 'Aç'})
            ]);
            const addBtn = H.el(doc, 'button', {className: 'etm-btn', type: 'button', textContent: 'Ekle'});

            const rulesList = H.el(doc, 'div', {className: 'etm-rules'});

            const addRule = () => {
                const domain = input.value.trim();
                if (!domain) return;
                this.addDomainRule(ext.id, domain, select.value === 'true');
                input.value = '';
                this.renderDomainRules(rulesList, ext.id);
            };
            addBtn.addEventListener('click', addRule);
            input.addEventListener('keydown', e => { if (e.key === 'Enter') addRule(); });

            content.appendChild(H.el(doc, 'div', {className: 'etm-form'}, {}, [input, select, addBtn]));
            content.appendChild(H.el(doc, 'div', {className: 'etm-sub', textContent: 'Kayıtlı kurallar'}));
            content.appendChild(rulesList);

            this.renderDomainRules(rulesList, ext.id);
            input.focus();
            input.select();
        },

        ruleRow(doc, label, enabled, delTitle, onDelete) {
            const state = H.el(doc, 'span', {
                className: 'etm-state ' + (enabled ? 'etm-on' : 'etm-offs'),
                textContent: enabled ? 'Açık' : 'Kapalı'
            });
            return H.el(doc, 'div', {className: 'etm-rule'}, {}, [
                H.el(doc, 'span', {className: 'etm-rname', textContent: label}, {title: label}),
                state,
                H.iconBtn(doc, 'trash', delTitle, onDelete)
            ]);
        },

        renderDomainRules(container, extId) {
            const doc = container.ownerDocument;
            container.replaceChildren();

            const rules = Object.entries(this.domainRules)
                .filter(([_, r]) => r[extId] !== undefined)
                .map(([domain, r]) => ({domain, enabled: r[extId]}));

            if (rules.length === 0) {
                container.appendChild(H.el(doc, 'div', {className: 'etm-empty', textContent: 'Henüz kural yok'}));
                return;
            }

            rules.forEach(r => {
                container.appendChild(this.ruleRow(doc, r.domain, r.enabled, 'Kuralı sil', () => {
                    this.removeDomainRule(extId, r.domain);
                    this.renderDomainRules(container, extId);
                }));
            });
        },

        openDomainRulesDialog() {
            const win = Services.wm.getMostRecentWindow('navigator:browser');
            const doc = win.document;

            const {content} = this.createModal(doc, 'Domain kuralları');
            this.renderAllRules(content, win);
        },

        renderAllRules(content, win) {
            const doc = content.ownerDocument;
            content.replaceChildren();

            const domains = Object.entries(this.domainRules).filter(([, rules]) => rules && Object.keys(rules).length);
            if (!domains.length) {
                content.appendChild(H.el(doc, 'div', {className: 'etm-empty', textContent: 'Henüz domain kuralı yok'}));
                return;
            }

            domains.forEach(([domain, rules]) => {
                const head = H.el(doc, 'div', {className: 'etm-ghead'}, {}, [
                    H.el(doc, 'span', {textContent: domain}, {title: domain}),
                    H.iconBtn(doc, 'trash', 'Bu site için tüm kuralları sil', () => {
                        if (win.confirm(`${domain} için tüm kurallar silinsin mi?`)) {
                            delete this.domainRules[domain];
                            this.saveSettings();
                            this.renderAllRules(content, win);
                            this.showNotification(`${domain} kuralları silindi`);
                        }
                    })
                ]);
                const group = H.el(doc, 'div', {className: 'etm-group'}, {}, [head]);

                Object.entries(rules).forEach(([extId, enabled]) => {
                    const ext = this.extensions.find(e => e.id === extId);
                    if (!ext) return;
                    group.appendChild(this.ruleRow(doc, ext.name, enabled, `${ext.name} kuralını sil`, () => {
                        this.removeDomainRule(extId, domain);
                        this.renderAllRules(content, win);
                    }));
                });

                content.appendChild(group);
            });
        },

        addDomainRule(extId, domain, enable) {
            const clean = H.cleanDomain(domain);
            if (!this.domainRules[clean]) this.domainRules[clean] = {};
            this.domainRules[clean][extId] = enable;
            this.saveSettings();
            this.showNotification(`${clean} için kural eklendi`);

            if (clean === this.getCurrentDomain()) {
                setTimeout(() => this.checkCurrentDomain(), 100);
            }
        },

        removeDomainRule(extId, domain) {
            if (this.domainRules[domain]?.[extId] !== undefined) {
                delete this.domainRules[domain][extId];
                if (Object.keys(this.domainRules[domain]).length === 0) {
                    delete this.domainRules[domain];
                }
                this.saveSettings();
                this.showNotification(`${domain} kuralı silindi`);
            }
        },

        // DOMAIN CHECKS
		setupTabListeners() {
			const gBrowser = Services.wm.getMostRecentWindow('navigator:browser').gBrowser;
			let _domainCheckTimer = null;
			gBrowser.tabContainer.addEventListener('TabSelect', () => {
				setTimeout(() => this.checkCurrentDomain(), 100);
			});

			gBrowser.addProgressListener({
				onLocationChange: () => {
					clearTimeout(_domainCheckTimer);
					_domainCheckTimer = setTimeout(() => this.checkCurrentDomain(), 200);
				}
			});
		},

        async checkCurrentDomain() {
            const domain = this.getCurrentDomain();

            if (!domain) {
                for (const [id, state] of Object.entries(this.manualStates)) {
                    await this.applyDomainRule(id, state);
                }
                return;
            }

            const rules = this.domainRules[domain];
            const processed = new Set();

            if (rules) {
                for (const [id, enabled] of Object.entries(rules)) {
                    await this.applyDomainRule(id, enabled);
                    processed.add(id);
                }
            }

            for (const [id, state] of Object.entries(this.manualStates)) {
                if (!processed.has(id)) {
                    await this.applyDomainRule(id, state);
                }
            }
        },

        async applyDomainRule(extId, enable) {
            try {
                const AM = await this.getAddonManager();
                const addon = await AM.getAddonByID(extId);

                if (addon && addon.isActive !== enable) {
                    enable ? await addon.enable() : await addon.disable();
                }
            } catch (e) {
                console.error('Apply rule error:', e);
            }
        },

        getCurrentDomain() {
            try {
                const url = Services.wm.getMostRecentWindow('navigator:browser').gBrowser.currentURI.spec;
                if (url.startsWith('about:') || url.startsWith('moz-extension:') || url.startsWith('chrome:')) {
                    return null;
                }
                return Services.io.newURI(url).host;
            } catch (e) {
                return null;
            }
        },

        // DRAG & DROP
        handleDragStart(e, index) {
            this.draggedIndex = index;
            e.dataTransfer.effectAllowed = 'move';
            e.dataTransfer.setData('text/plain', String(index));   // Firefox sürüklemeyi başlatmak için veri ister
            e.currentTarget.classList.add('etm-dragging');
        },

        handleDragOver(e) {
            if (this.draggedIndex === null) return;
            e.preventDefault();
            e.dataTransfer.dropEffect = 'move';
            this.panel?.querySelectorAll('.etm-over').forEach(r => r.classList.remove('etm-over'));
            e.currentTarget.classList.add('etm-over');
        },

        handleDrop(e, targetIndex) {
            e.preventDefault();

            if (this.draggedIndex !== null && this.draggedIndex !== targetIndex) {
                const filtered = this.getFilteredExtensions();
                const draggedId = filtered[this.draggedIndex].id;
                const targetId = filtered[targetIndex].id;

                // Özel sıra boşsa önce görünen sırayı kaydet, yoksa tek sürükleme tüm listeyi karıştırır
                if (!this.customOrder.length) this.customOrder = filtered.map(x => x.id);
                this.customOrder = this.customOrder.filter(id => id !== draggedId);
                const targetPos = this.customOrder.indexOf(targetId);
                if (targetPos === -1) this.customOrder.push(draggedId);
                else this.customOrder.splice(targetPos, 0, draggedId);

                this.saveSettings();
                this.renderExtensions();
            }
        },

        handleDragEnd() {
            this.draggedIndex = null;
            this.panel?.querySelectorAll('.etm-dragging, .etm-over').forEach(r => r.classList.remove('etm-dragging', 'etm-over'));
        },

        // CONTEXT MENU
        showContextMenu(event) {
            event.preventDefault();
            const doc = event.target.ownerDocument;

            const menu = this.newMenu(doc, 'ext-toggle-context');

            const items = [
                {label: 'Paneli aç / kapat', cmd: () => this.togglePanel(this.button)},
                {label: 'Tümünü aç / kapat', cmd: () => this.quickToggleAll()},
                {separator: true},
                {label: 'Domain kuralları…', cmd: () => this.openDomainRulesDialog()},
                {separator: true},
                {label: 'Ayarları dışa aktar', cmd: () => this.exportSettings()},
                {label: 'Ayarları içe aktar…', cmd: () => this.importSettings()},
                {label: 'Ayarları sıfırla…', cmd: () => this.resetSettings()}
            ];

            items.forEach(item => {
                if (item.separator) {
                    menu.appendChild(H.xul(doc, 'menuseparator'));
                } else {
                    const menuItem = H.xul(doc, 'menuitem', {label: item.label});
                    menuItem.addEventListener('command', item.cmd);
                    menu.appendChild(menuItem);
                }
            });

            menu.openPopupAtScreen(event.screenX, event.screenY, true);
        },

        // IMPORT/EXPORT
        exportSettings() {
            const data = {
                version: '2.0',
                date: new Date().toISOString(),
                domainRules: this.domainRules,
                manualStates: this.manualStates,
                customOrder: this.customOrder
            };

            try {
                Cc['@mozilla.org/widget/clipboardhelper;1']
                    .getService(Ci.nsIClipboardHelper)
                    .copyString(JSON.stringify(data, null, 2));

                this.showNotification('Ayarlar panoya kopyalandı!');
            } catch (e) {
                console.error('Export error:', e);
                this.showNotification('Export hatası!');
            }
        },

        async importSettings() {
            const win = Services.wm.getMostRecentWindow('navigator:browser');

            try {
                const json = win.prompt('JSON ayarlarını yapıştırın:', '');
                if (!json) return;

                const data = JSON.parse(json);
                if (!data.version || !data.domainRules) throw new Error('Geçersiz ayar dosyası');

                Object.assign(this, {
                    domainRules: data.domainRules || {},
                    manualStates: data.manualStates || {},
                    customOrder: data.customOrder || []
                });

                this.saveSettings();
                await this.loadExtensions();
                this.showNotification('Ayarlar başarıyla içe aktarıldı!');
            } catch (e) {
                console.error('Import error:', e);
                this.showNotification('Import hatası: ' + e.message);
            }
        },

        async resetSettings() {
            const win = Services.wm.getMostRecentWindow('navigator:browser');

            if (win.confirm('Tüm ayarlar silinsin mi?')) {
                Object.assign(this, {
                    domainRules: {},
                    manualStates: {},
                    customOrder: []
                });

                this.saveSettings();
                await this.loadExtensions();
                this.showNotification('Ayarlar sıfırlandı!');
            }
        },

        // UI HELPERS
        createModal(doc, title, opts = {}) {
            ensureStyle(doc);
            const backdrop = H.el(doc, 'div', {className: 'etm-backdrop'});
            const dialog = H.el(doc, 'div', {className: 'etm-dialog'}, {role: 'dialog', 'aria-label': title});
            if (opts.width) dialog.style.width = opts.width;

            const onKey = e => {
                if (e.key === 'Escape') { e.stopPropagation(); close(); }
            };
            const close = () => {
                doc.removeEventListener('keydown', onKey, true);
                backdrop.remove();
            };

            const header = H.el(doc, 'div', {className: 'etm-dh'}, {}, [
                H.el(doc, 'h4', {textContent: title}, {title}),
                H.iconBtn(doc, 'close', 'Kapat', close)
            ]);
            const content = H.el(doc, 'div', {className: 'etm-dc'});
            const toast = H.el(doc, 'div', {className: 'etm-toast'}, {role: 'status'});
            toast.style.bottom = '12px';

            [header, content, toast].forEach(el => dialog.appendChild(el));
            backdrop.appendChild(dialog);
            backdrop.addEventListener('mousedown', e => { if (e.target === backdrop) close(); });
            doc.addEventListener('keydown', onKey, true);
            (doc.body || doc.documentElement).appendChild(backdrop);

            return {backdrop, dialog, header, content, toast, close};
        },

        showError(message) {
            const container = this.panel?.ownerDocument.getElementById('ext-list-container');
            if (!container) return;
            const doc = container.ownerDocument;
            container.replaceChildren(H.el(doc, 'div', {className: 'etm-empty'}, {}, [
                H.el(doc, 'div', {className: 'etm-err', textContent: 'Uzantı listesi yüklenemedi'}),
                H.el(doc, 'div', {textContent: String(message || '')}, {})
            ]));
        },

        // Bildirim: açık pencerenin ya da panelin içinde, yoksa altta küçük bir satır
        showNotification(message) {
            const doc = Services.wm.getMostRecentWindow('navigator:browser').document;
            const target = doc.querySelector('.etm-dialog .etm-toast') ||
                (this.panel?.state === 'open' ? doc.getElementById('etm-toast') : null);

            if (target) {
                target.textContent = message;
                target.classList.add('etm-show');
                clearTimeout(target._etmTimer);
                target._etmTimer = setTimeout(() => target.classList.remove('etm-show'), 2200);
                return;
            }

            ensureStyle(doc);
            doc.getElementById('ext-toggle-notif')?.remove();
            const notif = H.el(doc, 'div', {id: 'ext-toggle-notif', className: 'etm-fltoast', textContent: message}, {role: 'status'});
            (doc.body || doc.documentElement).appendChild(notif);
            setTimeout(() => notif.remove(), 2200);
        },

        // SETTINGS
        saveSettings() {
            const prefs = Services.prefs.getBranch('extensions.toggle-manager.');

            try {
                ['domainRules', 'manualStates', 'customOrder'].forEach(key => {
                    prefs.setStringPref(key, JSON.stringify(this[key]));
                });
            } catch (e) {
                console.error('❌ Kaydetme hatası:', e);
            }
        },

        loadSettings() {
            const prefs = Services.prefs.getBranch('extensions.toggle-manager.');

            try {
                ['domainRules', 'manualStates', 'customOrder'].forEach(key => {
                    if (prefs.prefHasUserValue(key)) {
                        this[key] = JSON.parse(prefs.getStringPref(key));
                    }
                });
            } catch (e) {
                console.error('Yükleme hatası:', e);
            }
        },

        // SHUTDOWN
        shutdown() {

            try {
                CustomizableUI.destroyWidget('enhanced-ext-toggle-btn');
            } catch (e) {}

            this.button?.remove();
            this.panel?.remove();
            this.button = this.panel = null;
            this.initialized = false;
        }
    };

    const start = () => window.ExtensionToggleManager.init();

    if (document.readyState === 'complete' || document.readyState === 'interactive') {
        setTimeout(start, 500);
    } else {
        document.addEventListener('DOMContentLoaded', () => setTimeout(start, 500));
    }

})();