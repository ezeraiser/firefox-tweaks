// ==UserScript==
// @name           Extension Toggle Manager - Optimized
// @description    Gelişmiş extension yönetici - Optimize edilmiş versiyon
// @author         Extension Toggle
// @include        main
// @startup        window.ExtensionToggleManager.init();
// @shutdown       window.ExtensionToggleManager.shutdown();
// @onlyonce
// ==/UserScript==

(function() {
    'use strict';

    if (window.ExtensionToggleManager) return;

    // ===========================================
    // STYLE CONSTANTS
    // ===========================================
    const STYLES = {
        CONTAINER: 'width:370px;max-height:650px;background:transparent;border-radius:8px;overflow:hidden;box-shadow:0 6px 24px rgba(0,0,0,0.15);font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif',
        HEADER: 'background:linear-gradient(135deg,#667eea 0%,#764ba2 100%);color:white;padding:14px',
        SEARCH_ROW: 'display:flex;gap:8px;align-items:center',
        INPUT: 'flex:1;padding:6px 12px;border:none;border-radius:16px;font-size:13px;background:rgba(255,255,255,0.9);color:#333',
        SELECT: 'padding:6px 10px;border:none;border-radius:16px;background:rgba(255,255,255,0.9);font-size:12px;color:#333;cursor:pointer',
        LIST: 'max-height:400px;overflow-y:auto;background:#f8f9fa;padding:8px',
        FOOTER: 'display:flex;padding:10px;background:white;border-top:1px solid #e0e0e0;gap:8px',
        SETTINGS_FOOTER: 'display:flex;padding:8px;background:#f0f0f0;border-top:1px solid #ddd;gap:6px',
        BUTTON: (color) => `flex:1;padding:8px 1px;border:none;border-radius:6px;font-weight:600;font-size:11px;cursor:pointer;background:${color};color:white;transition:all 0.3s`,
        MODAL_BACKDROP: 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.6);z-index:9999;display:flex;align-items:center;justify-content:center',
        MODAL: 'background:white;border-radius:12px;box-shadow:0 12px 36px rgba(0,0,0,0.3);overflow:hidden;animation:modalSlideIn 0.3s ease;color:#000',
        MODAL_HEADER: (bg) => `display:flex;justify-content:space-between;align-items:center;padding:18px 24px;background:${bg};color:white`,
        CLOSE_BTN: 'background:none;border:none;color:white;font-size:28px;cursor:pointer;padding:0;width:32px;height:32px;border-radius:50%;transition:background 0.3s',
        EXT_ITEM: (active) => `display:flex;align-items:center;padding:3px;margin-bottom:8px;background:${active ? 'white' : '#f5f5f5'};border-radius:8px;box-shadow:0 1px 3px rgba(0,0,0,0.1);transition:all 0.3s;cursor:pointer;opacity:${active ? '1' : '0.7'};user-select:none;border-left:4px solid ${active ? '#4caf50' : '#ddd'}`,
        SWITCH: (active) => `width:40px;height:22px;background:${active ? '#4caf50' : '#ccc'};border-radius:11px;position:relative;margin-right:12px;transition:background 0.3s;cursor:pointer;box-shadow:inset 0 1px 3px rgba(0,0,0,0.2)`,
        SWITCH_KNOB: (active) => `position:absolute;width:18px;height:18px;border-radius:50%;background:white;top:2px;left:${active ? '20px' : '2px'};transition:left 0.3s;box-shadow:0 1px 3px rgba(0,0,0,0.3)`,
        ICON_BTN: (bg, show) => `background:${bg};color:white;border:none;border-radius:50%;width:24px;height:24px;font-size:${bg === '#4caf50' ? '11px' : '12px'};cursor:pointer;margin-right:8px;opacity:0;transition:all 0.3s;display:${show ? 'flex' : 'none'};align-items:center;justify-content:center`
    };

    const ICONS = {
        LIGHT: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAAXNSR0IArs4c6QAAAAlwSFlzAAABAQAAAQEBn5eVwwAAAJtJREFUeNpjcC/wYcCGgSASiDdBcSQudbg06wPxciT+cpAYKQaUALELEt8FJIZNLbqTE6F4NhB3IMl1gMQQ8ggvwRQYwPyKhA2QDDBAk9sEk4crQNhIGIPUUtEARKhfAfkTGoA8pBrAAw0cOVggkmIAHKPFOw8lBuwk1QtyIE0g/0PpRHJiYTY0xclRHI0DYoAcNB3sJBJfgXkVAPeRyZQejDf1AAAAAElFTkSuQmCC',
        DARK: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQBAMAAADt3eJSAAAAAXNSR0IArs4c6QAAAAlwSFlzAAAOwAAADsABataJCQAAACpQTFRFR3BMwMDAzMzM2dnZ4+Pj5+fn5eXl7e3t6urq7Ozs7+/v7Ozs8fHx9/f3OXArmQAAAA50Uk5TABcuQV9mdJyvwMLh5vbLj3JsAAAAX0lEQVR42mNgYGDsOSHAAAKcBewTwAxuAcYNQIqpoteB9Ua7AgPLtRQFJrfcAAZWsDxnAAPLAhCDC8i41QhhMBpWgRlg7VCGNYTBvOIIVPERARADZg4XsoG3VgHBXAcANKYXcNF+Nf8AAAAASUVORK5CYII='
    };

    // ===========================================
    // HELPER FUNCTIONS
    // ===========================================
    const H = {
        // Element creator
        el: (doc, tag, props = {}, style = '', children = []) => {
            const el = doc.createElementNS('http://www.w3.org/1999/xhtml', tag);
            Object.entries(props).forEach(([k, v]) => el[k] = v);
            if (style) el.style.cssText = style;
            children.forEach(c => el.appendChild(c));
            return el;
        },

        // XUL element creator
        xul: (doc, tag, attrs = {}) => {
            const el = doc.createXULElement(tag);
            Object.entries(attrs).forEach(([k, v]) => el.setAttribute(k, v));
            return el;
        },

        // Button creator
        btn: (doc, {text, icon, color, onClick, style = '', title}) => {
            const btn = H.el(doc, 'button', {
                textContent: icon || text,
                title: title || text
            }, STYLES.BUTTON(color) + style);

            btn.addEventListener('mouseenter', () => {
                btn.style.transform = 'translateY(-1px)';
                btn.style.boxShadow = '0 2px 8px rgba(0,0,0,0.2)';
            });
            btn.addEventListener('mouseleave', () => {
                btn.style.transform = 'translateY(0)';
                btn.style.boxShadow = 'none';
            });
            btn.addEventListener('click', onClick);
            return btn;
        },

        // Close button
        closeBtn: (doc, onClose) => {
            const btn = H.el(doc, 'button', {textContent: '×'}, STYLES.CLOSE_BTN);
            btn.addEventListener('click', onClose);
            ['mouseenter', 'mouseleave'].forEach((e, i) => {
                btn.addEventListener(e, () => {
                    btn.style.background = i ? 'none' : 'rgba(255,255,255,0.2)';
                });
            });
            return btn;
        },

        // Hover effect
        hover: (el, enter, leave) => {
            el.addEventListener('mouseenter', enter);
            el.addEventListener('mouseleave', leave);
        },

        // Wait
        wait: (ms) => new Promise(r => setTimeout(r, ms)),

        // Clean domain
        cleanDomain: (d) => d.replace(/^https?:\/\//, '').split('/')[0]
    };

    // ===========================================
    // MAIN MANAGER
    // ===========================================
    window.ExtensionToggleManager = {
        button: null,
        panel: null,
        extensions: [],
        domainRules: {},
        manualStates: {},
        customOrder: [],
        initialized: false,
        draggedIndex: null,

        // =============== INIT ===============
        async init() {
            if (this.initialized) return;
            console.log('🚀 Extension Toggle Manager - Optimized');

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

        // =============== BUTTON ===============
        addButton() {
            const win = Services.wm.getMostRecentWindow('navigator:browser');
            if (!win) return;
            const doc = win.document;

            doc.getElementById('enhanced-ext-toggle-btn')?.remove();

            // Try CustomizableUI
            if (typeof CustomizableUI !== 'undefined') {
                try {
                    CustomizableUI.destroyWidget('enhanced-ext-toggle-btn');
                } catch (e) {}

                CustomizableUI.createWidget({
                    id: 'enhanced-ext-toggle-btn',
                    type: 'custom',
                    defaultArea: CustomizableUI.AREA_NAVBAR,
                    tooltiptext: 'Extension Manager\nSol: Panel | Orta: Toggle | Sağ: Menü',
                    onBuild: (aDoc) => {
                        const btn = H.xul(aDoc, 'toolbarbutton', {
                            id: 'enhanced-ext-toggle-btn',
                            class: 'toolbarbutton-1 chromeclass-toolbar-additional',
                            label: 'Extensions+',
                            removable: 'true',
                            'cui-areatype': 'toolbar'
                        });

                        const isDark = aDoc.documentElement.hasAttribute('lwtheme-brighttext') ||
                            window.matchMedia('(prefers-color-scheme: dark)').matches;
                        btn.style.listStyleImage = `url(${isDark ? ICONS.DARK : ICONS.LIGHT})`;

                        btn.addEventListener('click', (e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            const actions = [
                                () => this.togglePanel(btn),
                                () => this.quickToggleAll(),
                                () => this.showContextMenu(e)
                            ];
                            actions[e.button]?.();
                        });

                        return btn;
                    }
                });

                this.button = doc.getElementById('enhanced-ext-toggle-btn');
                console.log('✅ CustomizableUI widget created');
                return;
            }

            // Fallback
            const button = H.xul(doc, 'toolbarbutton', {
                id: 'enhanced-ext-toggle-btn',
                class: 'toolbarbutton-1 chromeclass-toolbar-additional',
                label: 'Extensions+',
                tooltiptext: 'Extension Manager',
                removable: 'true',
                'cui-areatype': 'toolbar'
            });

            button.style.listStyleImage = `url(${ICONS.LIGHT})`;
            button.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                [() => this.togglePanel(button), () => this.quickToggleAll(), () => this.showContextMenu(e)][e.button]?.();
            });

            doc.getElementById('nav-bar')?.appendChild(button);
            this.button = button;
            console.log('✅ Fallback button added');
        },

        // =============== PANEL ===============
        togglePanel(anchor) {
            if (this.panel?.state === 'open') {
                this.panel.hidePopup();
            } else {
                this.showExtensionPanel(anchor);
            }
        },

        async showExtensionPanel(anchor) {
            const doc = anchor.ownerDocument;
            this.panel?.remove();

            // Create panel
            this.panel = H.xul(doc, 'panel', {
                id: 'enhanced-ext-panel',
                type: 'arrow',
                flip: 'both',
                position: 'bottomcenter topright'
            });
            this.panel.style.cssText = 'z-index:2147483647;position:relative';

            // Container
            const container = H.el(doc, 'div', {}, STYLES.CONTAINER);

            // Header
            const header = H.el(doc, 'div', {}, STYLES.HEADER, [
                H.el(doc, 'h3', {textContent: '🧩 Extensions'}, 'margin:0 0 1px 0;font-size:17px;font-weight:600'),
                this.createSearchRow(doc)
            ]);

            // List
            const list = H.el(doc, 'div', {id: 'ext-list-container'}, STYLES.LIST);

            // Footer buttons
            const footerBtns = [
                {text: 'Tümünü Kapat', color: '#f44336', action: () => this.toggleAll(false)},
                {text: 'Tümünü Aç', color: '#4caf50', action: () => this.toggleAll(true)},
                {text: 'Domain Kuralları', color: '#2196f3', action: () => this.openDomainRulesDialog()}
            ];

            const footer = H.el(doc, 'div', {}, STYLES.FOOTER);
            footerBtns.forEach(b => footer.appendChild(H.btn(doc, {text: b.text, color: b.color, onClick: b.action})));

            // Settings footer
            const settingsBtns = [
                {icon: '📤', text: 'Dışa Aktar', color: '#607d8b', action: () => this.exportSettings()},
                {icon: '📥', text: 'İçe Aktar', color: '#4caf50', action: () => this.importSettings()},
                {icon: '🔄', text: 'Sıfırla', color: '#ff9800', action: () => this.resetSettings()}
            ];

            const settingsFooter = H.el(doc, 'div', {}, STYLES.SETTINGS_FOOTER);
            settingsBtns.forEach(b => settingsFooter.appendChild(H.btn(doc, {text: `${b.icon} ${b.text}`, color: b.color, onClick: b.action})));

            // Assemble
            [header, list, footer, settingsFooter].forEach(el => container.appendChild(el));
            this.panel.appendChild(container);
            doc.documentElement.appendChild(this.panel);

            await this.loadExtensions();
            this.panel.openPopup(anchor, 'after_end', 0, 0, false, false);
        },

        createSearchRow(doc) {
            const row = H.el(doc, 'div', {}, STYLES.SEARCH_ROW);

            const search = H.el(doc, 'input', {
                id: 'ext-search-input',
                type: 'text',
                placeholder: 'Extension ara...'
            }, STYLES.INPUT);
            search.addEventListener('input', () => this.renderExtensions());

            const sort = H.el(doc, 'select', {id: 'ext-sort-select'}, STYLES.SELECT);
            ['Özel Sıra', 'İsme Göre', 'Duruma Göre'].forEach(opt => {
                sort.appendChild(H.el(doc, 'option', {textContent: opt}));
            });
            sort.addEventListener('change', () => this.renderExtensions());

            row.appendChild(search);
            row.appendChild(sort);
            return row;
        },

        // =============== EXTENSIONS ===============
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

                console.log(`${this.extensions.length} extension yüklendi`);
                this.renderExtensions();
            } catch (e) {
                console.error('Load error:', e);
                this.showError(e.message);
            }
        },

        async getAddonManager() {
            const methods = [
                () => ChromeUtils.import('resource://gre/modules/AddonManager.jsm').AddonManager,
                () => ChromeUtils.importESModule("resource://gre/modules/AddonManager.sys.mjs").AddonManager,
                () => Components.utils.import('resource://gre/modules/AddonManager.jsm', {}).AddonManager
            ];

            for (const method of methods) {
                try {
                    const AM = method();
                    if (AM) return AM;
                } catch (e) {}
            }
            return null;
        },

        renderExtensions() {
            const doc = this.panel?.ownerDocument;
            if (!doc) return;

            const container = doc.getElementById('ext-list-container');
            if (!container) return;

            const filtered = this.getFilteredExtensions();
            container.innerHTML = filtered.length ? '' :
                '<div style="text-align:center;padding:30px;color:#666">Extension bulunamadı</div>';

            filtered.forEach((ext, i) => container.appendChild(this.createExtItem(doc, ext, i)));
        },

        createExtItem(doc, ext, index) {
            const item = H.el(doc, 'div', {
                className: 'ext-item',
                draggable: true
            }, STYLES.EXT_ITEM(ext.isActive));
            item.dataset.id = ext.id;

            // Drag handle
            const drag = H.el(doc, 'div', {textContent: '⋮⋮'}, 'width:20px;margin-right:12px;opacity:0.4;cursor:move;font-size:12px;color:#666;transition:opacity 0.3s');

            // Switch
            const switchCont = H.el(doc, 'div', {}, STYLES.SWITCH(ext.isActive));
            const knob = H.el(doc, 'div', {}, STYLES.SWITCH_KNOB(ext.isActive));
            switchCont.appendChild(knob);

            // Info
            const info = H.el(doc, 'div', {}, 'flex:1;min-width:0;margin-right:8px', [
                H.el(doc, 'div', {textContent: ext.name}, 'font-weight:600;font-size:14px;margin-bottom:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:#333'),
                H.el(doc, 'div', {textContent: `v${ext.version}`}, 'font-size:11px;color:#888')
            ]);

            // Buttons
            const domainBtn = H.el(doc, 'button', {textContent: '🌐', title: 'Domain kuralları'}, STYLES.ICON_BTN('#667eea', true));
            domainBtn.addEventListener('click', e => {
                e.stopPropagation();
                this.openDomainDialog(ext);
            });

            const settingsBtn = H.el(doc, 'button', {textContent: '⚙️', title: 'Uzantı ayarları'}, STYLES.ICON_BTN('#4caf50', ext.isActive));
            settingsBtn.addEventListener('click', async e => {
                e.stopPropagation();
                await this.openExtensionSettings(ext);
            });

            // Status
            const status = H.el(doc, 'span', {textContent: ext.isActive ? 'AÇIK' : 'KAPALI'},
                `padding:3px 8px;border-radius:12px;font-size:10px;font-weight:bold;background:${ext.isActive ? '#e8f5e9' : '#ffebee'};color:${ext.isActive ? '#2e7d32' : '#c62828'};min-width:45px;text-align:center`
            );

            // Events
            H.hover(item,
                () => {
                    item.style.transform = 'translateX(4px)';
                    item.style.boxShadow = '0 3px 12px rgba(0,0,0,0.15)';
                    [domainBtn, settingsBtn, drag].forEach(el => el.style.opacity = ext.isActive || el === domainBtn ? '1' : '0.8');
                },
                () => {
                    item.style.transform = 'translateX(0)';
                    item.style.boxShadow = '0 1px 3px rgba(0,0,0,0.1)';
                    [domainBtn, settingsBtn, drag].forEach(el => el.style.opacity = el === drag ? '0.4' : '0');
                }
            );

            const toggle = async(e) => {
                e?.stopPropagation();
                await this.toggleExtension(ext.id, !ext.isActive);
            };

            item.addEventListener('click', toggle);
            switchCont.addEventListener('click', e => {
                e.stopPropagation();
                toggle();
            });

            // Drag & Drop
            item.addEventListener('dragstart', e => this.handleDragStart(e, index));
            item.addEventListener('dragover', e => this.handleDragOver(e));
            item.addEventListener('drop', e => this.handleDrop(e, index));
            item.addEventListener('dragend', () => this.handleDragEnd());

            [drag, switchCont, info, domainBtn, settingsBtn, status].forEach(el => item.appendChild(el));
            return item;
        },

        getFilteredExtensions() {
            const doc = this.panel?.ownerDocument;
            if (!doc) return this.extensions;

            const search = doc.getElementById('ext-search-input')?.value.toLowerCase() || '';
            const sort = doc.getElementById('ext-sort-select')?.selectedIndex || 0;

            let filtered = this.extensions.filter(e =>
                e.name.toLowerCase().includes(search) ||
                (e.description?.toLowerCase().includes(search))
            );

            const sorters = [
                (a, b) => {
                    const [ai, bi] = [a, b].map(x => this.customOrder.indexOf(x.id));
                    return (ai === -1 ? Infinity : ai) - (bi === -1 ? Infinity : bi);
                },
                (a, b) => a.name.localeCompare(b.name, 'tr'),
                (a, b) => (b.isActive - a.isActive)
            ];

            return filtered.sort(sorters[sort]);
        },

        // =============== TOGGLE ===============
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

        // =============== EXTENSION SETTINGS ===============
        async openExtensionSettings(ext) {
            console.log(`⚙️ ${ext.name} ayarları açılıyor...`);

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
                        console.log(`✅ ${ext.name} toolbar'da bulundu`);
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

        // =============== DOMAIN RULES ===============
        openDomainDialog(ext) {
            const win = Services.wm.getMostRecentWindow('navigator:browser');
            const doc = win.document;

            const {backdrop, content} = this.createModal(doc, `Domain Kuralları - ${ext.name}`, {width: '480px'}, '#667eea');

            // Current domain
            const current = this.getCurrentDomain();
            content.appendChild(H.el(doc, 'div', {
                innerHTML: `<strong>🌐 Aktif Domain:</strong> ${current || 'Bilinmiyor'}`
            }, 'padding:14px;background:linear-gradient(135deg,#e3f2fd,#f3e5f5);border-radius:8px;margin-bottom:18px;font-size:13px;border-left:4px solid #667eea;color:#000'));

            // Input group
            const inputGroup = H.el(doc, 'div', {}, 'display:flex;gap:10px;margin-bottom:18px');

            const domainInput = H.el(doc, 'input', {
                type: 'text',
                placeholder: 'örn: sahibinden.com',
                value: current || ''
            }, 'flex:1;padding:10px 14px;border:2px solid #e0e0e0;border-radius:8px;font-size:14px;transition:border-color 0.3s;color:#000;background:#fff');

            ['focus', 'blur'].forEach((e, i) => {
                domainInput.addEventListener(e, () => {
                    domainInput.style.borderColor = i ? '#e0e0e0' : '#667eea';
                });
            });

            const ruleSelect = H.el(doc, 'select', {}, 'padding:10px 14px;border:2px solid #e0e0e0;border-radius:8px;font-size:14px;cursor:pointer;background:white;color:#000', [
                H.el(doc, 'option', {value: 'false', textContent: 'Kapat'}),
                H.el(doc, 'option', {value: 'true', textContent: 'Aç'})
            ]);

            const addBtn = H.btn(doc, {
                text: 'Ekle',
                color: '#667eea',
                onClick: () => {
                    const domain = domainInput.value.trim();
                    if (domain) {
                        this.addDomainRule(ext.id, domain, ruleSelect.value === 'true');
                        domainInput.value = '';
                        this.renderDomainRules(rulesList, ext.id);
                    }
                },
                style: 'flex:initial;padding:10px 18px;font-size:16px'
            });

            [domainInput, ruleSelect, addBtn].forEach(el => inputGroup.appendChild(el));

            // Rules list
            const rulesList = H.el(doc, 'div', {}, 'max-height:280px;overflow-y:auto;border:1px solid #e0e0e0;border-radius:8px;background:#fafafa;padding:8px');

            content.appendChild(inputGroup);
            content.appendChild(H.el(doc, 'h5', {textContent: 'Kayıtlı Kurallar'}, 'margin:0 0 12px 0;font-size:15px;color:#333;font-weight:600'));
            content.appendChild(rulesList);

            this.renderDomainRules(rulesList, ext.id);
            domainInput.focus();
        },

        renderDomainRules(container, extId) {
            const doc = container.ownerDocument;
            container.innerHTML = '';

            const rules = Object.entries(this.domainRules)
                .filter(([_, r]) => r[extId] !== undefined)
                .map(([domain, r]) => ({domain, enabled: r[extId]}));

            if (rules.length === 0) {
                container.innerHTML = '<div style="text-align:center;color:#666;padding:32px;font-size:14px"><div style="font-size:32px;margin-bottom:12px">🌐</div><div>Henüz kural eklenmemiş</div></div>';
                return;
            }

            rules.forEach(r => {
                const item = H.el(doc, 'div', {}, `display:flex;justify-content:space-between;align-items:center;padding:12px 16px;margin-bottom:8px;background:white;border-radius:8px;border-left:4px solid ${r.enabled ? '#4caf50' : '#f44336'};box-shadow:0 1px 3px rgba(0,0,0,0.1);transition:transform 0.2s`);

                H.hover(item,
                    () => item.style.transform = 'translateX(4px)',
                    () => item.style.transform = 'translateX(0)'
                );

                const info = H.el(doc, 'div', {}, '', [
                    H.el(doc, 'div', {textContent: r.domain}, 'font-weight:600;font-size:14px;color:#333'),
                    H.el(doc, 'div', {textContent: r.enabled ? '✅ Açık' : '❌ Kapalı'}, `font-size:12px;color:${r.enabled ? '#4caf50' : '#f44336'};margin-top:2px`)
                ]);

                const delBtn = H.el(doc, 'button', {
                    textContent: 'Sil',
                    title: 'Kuralı sil'
                }, 'background:none;color:#f44336;border:1px solid #f44336;border-radius:4px;padding:4px 10px;font-size:12px;font-weight:600;cursor:pointer;transition:all 0.2s');

                delBtn.addEventListener('click', () => {
                    this.removeDomainRule(extId, r.domain);
                    this.renderDomainRules(container, extId);
                });

                H.hover(delBtn,
                    () => {
                        delBtn.style.background = '#f44336';
                        delBtn.style.color = 'white';
                    },
                    () => {
                        delBtn.style.background = 'none';
                        delBtn.style.color = '#f44336';
                    }
                );

                item.appendChild(info);
                item.appendChild(delBtn);
                container.appendChild(item);
            });
        },

        openDomainRulesDialog() {
            const win = Services.wm.getMostRecentWindow('navigator:browser');
            const doc = win.document;

            const {backdrop, content} = this.createModal(doc, '🌐 Tüm Domain Kuralları', {width: '550px'}, '#2196f3');
            content.style.maxHeight = '500px';
            content.style.overflowY = 'auto';

            if (Object.keys(this.domainRules).length === 0) {
                content.innerHTML = '<div style="text-align:center;color:#666;padding:48px"><div style="font-size:48px;margin-bottom:16px">🌐</div><h3 style="margin:0 0 8px 0;color:#333">Henüz domain kuralı eklenmemiş</h3></div>';
                return;
            }

            Object.entries(this.domainRules).forEach(([domain, rules]) => {
                const section = H.el(doc, 'div', {}, 'margin-bottom:24px;padding:16px;background:#f8f9fa;border-radius:12px;border-left:4px solid #667eea');

                const header = H.el(doc, 'div', {}, 'display:flex;justify-content:space-between;align-items:center;margin-bottom:12px');
                
                const domainTitle = H.el(doc, 'h5', {textContent: `🌐 ${domain}`}, 'margin:0;color:#333;font-size:16px;font-weight:600');
                
                const deleteDomainBtn = H.el(doc, 'button', {
                    textContent: 'Sil',
                    title: `${domain} kurallarını sil`
                }, 'background:none;color:#f44336;border:1px solid #f44336;border-radius:4px;padding:5px 12px;font-size:12px;font-weight:600;cursor:pointer;transition:all 0.2s');

                deleteDomainBtn.addEventListener('click', () => {
                    if (win.confirm(`${domain} domain kuralları silinecek. Emin misiniz?`)) {
                        delete this.domainRules[domain];
                        this.saveSettings();
                        backdrop.remove();
                        setTimeout(() => this.openDomainRulesDialog(), 100);
                        this.showNotification(`${domain} kuralları silindi`);
                    }
                });

                H.hover(deleteDomainBtn,
                    () => {
                        deleteDomainBtn.style.background = '#f44336';
                        deleteDomainBtn.style.color = 'white';
                    },
                    () => {
                        deleteDomainBtn.style.background = 'none';
                        deleteDomainBtn.style.color = '#f44336';
                    }
                );

                header.appendChild(domainTitle);
                header.appendChild(deleteDomainBtn);

                section.appendChild(header);

                Object.entries(rules).forEach(([extId, enabled]) => {
                    const ext = this.extensions.find(e => e.id === extId);
                    if (!ext) return;

                    const ruleItem = H.el(doc, 'div', {}, 'display:flex;justify-content:space-between;align-items:center;padding:8px 12px;margin:6px 0;background:white;border-radius:8px;font-size:13px;box-shadow:0 1px 3px rgba(0,0,0,0.1);transition:transform 0.2s');

                    H.hover(ruleItem,
                        () => ruleItem.style.transform = 'translateX(4px)',
                        () => ruleItem.style.transform = 'translateX(0)'
                    );

                    const info = H.el(doc, 'div', {}, 'flex:1', [
                        H.el(doc, 'span', {textContent: ext.name}, 'font-weight:500;display:block;color:#333'),
                        H.el(doc, 'span', {textContent: enabled ? '✅ Açık' : '❌ Kapalı'}, `font-weight:600;color:${enabled ? '#4caf50' : '#f44336'};font-size:12px`)
                    ]);

                    const delBtn = H.el(doc, 'button', {
                        textContent: 'Sil',
                        title: `${ext.name} kuralını sil`
                    }, 'background:none;color:#ff9800;border:1px solid #ff9800;border-radius:4px;padding:4px 10px;font-size:12px;font-weight:600;cursor:pointer;transition:all 0.2s;margin-left:8px');

                    delBtn.addEventListener('click', () => {
                        this.removeDomainRule(extId, domain);
                        if (!this.domainRules[domain] || Object.keys(this.domainRules[domain]).length === 0) {
                            backdrop.remove();
                            setTimeout(() => this.openDomainRulesDialog(), 100);
                        } else {
                            ruleItem.remove();
                        }
                    });

                    H.hover(delBtn,
                        () => {
                            delBtn.style.background = '#ff9800';
                            delBtn.style.color = 'white';
                        },
                        () => {
                            delBtn.style.background = 'none';
                            delBtn.style.color = '#ff9800';
                        }
                    );

                    ruleItem.appendChild(info);
                    ruleItem.appendChild(delBtn);
                    section.appendChild(ruleItem);
                });

                content.appendChild(section);
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

        // =============== DOMAIN CHECKS ===============
		setupTabListeners() {
			const gBrowser = Services.wm.getMostRecentWindow('navigator:browser').gBrowser;
			let _domainCheckTimer = null;  // EKLE

			gBrowser.tabContainer.addEventListener('TabSelect', () => {
				setTimeout(() => this.checkCurrentDomain(), 100);
			});

			gBrowser.addProgressListener({
				onLocationChange: () => {
					clearTimeout(_domainCheckTimer);  // EKLE
					_domainCheckTimer = setTimeout(() => this.checkCurrentDomain(), 200);  // DEĞİŞTİR
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

        // =============== DRAG & DROP ===============
        handleDragStart(e, index) {
            this.draggedIndex = index;
            e.dataTransfer.effectAllowed = 'move';
            e.target.style.opacity = '0.5';
        },

        handleDragOver(e) {
            e.preventDefault();
            e.dataTransfer.dropEffect = 'move';
        },

        handleDrop(e, targetIndex) {
            e.preventDefault();

            if (this.draggedIndex !== null && this.draggedIndex !== targetIndex) {
                const filtered = this.getFilteredExtensions();
                const draggedId = filtered[this.draggedIndex].id;
                const targetId = filtered[targetIndex].id;

                const dragPos = this.customOrder.indexOf(draggedId);
                const targetPos = this.customOrder.indexOf(targetId);

                if (dragPos !== -1) {
                    this.customOrder.splice(dragPos, 1);
                } else {
                    this.customOrder = this.customOrder.filter(id => id !== draggedId);
                }

                if (targetPos !== -1) {
                    this.customOrder.splice(targetPos, 0, draggedId);
                } else {
                    this.customOrder.push(draggedId);
                }

                this.saveSettings();
                this.renderExtensions();
            }
        },

        handleDragEnd() {
            this.draggedIndex = null;
            this.panel?.querySelectorAll('.ext-item').forEach(item => item.style.opacity = '');
        },

        // =============== CONTEXT MENU ===============
        showContextMenu(event) {
            event.preventDefault();
            const doc = event.target.ownerDocument;

            doc.getElementById('ext-toggle-context')?.remove();

            const menu = H.xul(doc, 'menupopup', {id: 'ext-toggle-context'});

            const items = [
                {label: '📋 Panel Aç/Kapa', cmd: () => this.togglePanel(this.button)},
                {label: '⚡ Hızlı Toggle', cmd: () => this.quickToggleAll()},
                {separator: true},
                {label: '🌐 Domain Kuralları', cmd: () => this.openDomainRulesDialog()},
                {separator: true},
                {label: '📤 Ayarları Dışa Aktar', cmd: () => this.exportSettings()},
                {label: '📥 Ayarları İçe Aktar', cmd: () => this.importSettings()},
                {label: '🔄 Ayarları Sıfırla', cmd: () => this.resetSettings()}
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

            doc.documentElement.appendChild(menu);
            menu.openPopupAtScreen(event.screenX, event.screenY, true);
        },

        // =============== IMPORT/EXPORT ===============
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

                this.showNotification('✅ Ayarlar panoya kopyalandı!');
            } catch (e) {
                console.error('Export error:', e);
                this.showNotification('❌ Export hatası!');
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
                this.showNotification('✅ Ayarlar başarıyla içe aktarıldı!');
            } catch (e) {
                console.error('Import error:', e);
                this.showNotification('❌ Import hatası: ' + e.message);
            }
        },

        async resetSettings() {
            const win = Services.wm.getMostRecentWindow('navigator:browser');

            if (win.confirm('🔄 Tüm ayarlar silinecek. Emin misiniz?')) {
                Object.assign(this, {
                    domainRules: {},
                    manualStates: {},
                    customOrder: []
                });

                this.saveSettings();
                await this.loadExtensions();
                this.showNotification('🔄 Ayarlar sıfırlandı!');
            }
        },

        // =============== UI HELPERS ===============
        createModal(doc, title, content, bgColor) {
            const backdrop = H.el(doc, 'div', {}, STYLES.MODAL_BACKDROP);

            const dialog = H.el(doc, 'div', {}, STYLES.MODAL + `;width:${content.width || '480px'}`);

            const header = H.el(doc, 'div', {}, STYLES.MODAL_HEADER(bgColor), [
                H.el(doc, 'h4', {textContent: title}, 'margin:0;font-size:16px;font-weight:600;color:white'),
                H.closeBtn(doc, () => backdrop.remove())
            ]);

            const contentDiv = H.el(doc, 'div', {}, 'padding:24px;color:#000');

            dialog.appendChild(header);
            dialog.appendChild(contentDiv);
            backdrop.appendChild(dialog);

            backdrop.addEventListener('click', e => e.target === backdrop && backdrop.remove());
            doc.body.appendChild(backdrop);

            // Add animation CSS
            if (!doc.getElementById('modal-styles')) {
                const style = H.el(doc, 'style', {id: 'modal-styles'});
                style.textContent = '@keyframes modalSlideIn{from{transform:scale(0.9) translateY(-20px);opacity:0}to{transform:scale(1) translateY(0);opacity:1}}';
                doc.head.appendChild(style);
            }

            return {backdrop, dialog, header, content: contentDiv};
        },

        showError(message) {
            const container = this.panel?.ownerDocument.getElementById('ext-list-container');
            if (!container) return;

            container.innerHTML = `
                <div style="text-align:center;padding:40px;color:#f44336">
                    <div style="font-size:48px;margin-bottom:16px">⚠️</div>
                    <h4 style="margin:0 0 8px 0">Extension Listesi Yüklenemedi</h4>
                    <p style="font-size:12px;color:#666;margin:10px 0">${message}</p>
                </div>
            `;
        },

        showNotification(message) {
            const doc = Services.wm.getMostRecentWindow('navigator:browser').document;

            doc.getElementById('ext-toggle-notif')?.remove();

            const notif = H.el(doc, 'div', {
                id: 'ext-toggle-notif',
                textContent: message
            }, 'position:fixed;bottom:24px;right:24px;background:linear-gradient(135deg,#667eea,#764ba2);color:white;padding:14px 20px;border-radius:12px;box-shadow:0 6px 20px rgba(0,0,0,0.3);z-index:10000;font-size:14px;font-weight:600;animation:slideIn 0.4s ease;max-width:300px');

            if (!doc.getElementById('ext-toggle-styles')) {
                const style = H.el(doc, 'style', {id: 'ext-toggle-styles'});
                style.textContent = '@keyframes slideIn{from{transform:translateX(100%) scale(0.8);opacity:0}to{transform:translateX(0) scale(1);opacity:1}}';
                doc.head.appendChild(style);
            }

            doc.body.appendChild(notif);

            setTimeout(() => {
                notif.style.cssText += ';opacity:0;transform:translateX(100%) scale(0.8);transition:all 0.4s ease';
                setTimeout(() => notif.remove(), 400);
            }, 3000);
        },

        // =============== SETTINGS ===============
        saveSettings() {
            const prefs = Services.prefs.getBranch('extensions.toggle-manager.');

            try {
                ['domainRules', 'manualStates', 'customOrder'].forEach(key => {
                    prefs.setStringPref(key, JSON.stringify(this[key]));
                });
                console.log('✅ Ayarlar kaydedildi');
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
                console.log('Ayarlar yüklendi');
            } catch (e) {
                console.error('Yükleme hatası:', e);
            }
        },

        // =============== SHUTDOWN ===============
        shutdown() {
            console.log('Extension Toggle Manager kapatılıyor...');

            try {
                if (typeof CustomizableUI !== 'undefined') {
                    CustomizableUI.destroyWidget('enhanced-ext-toggle-btn');
                }
            } catch (e) {}

            this.button?.remove();
            this.panel?.remove();
            this.button = this.panel = null;
            this.initialized = false;
        }
    };

    // Auto-start
    const start = () => window.ExtensionToggleManager.init();

    if (document.readyState === 'complete' || document.readyState === 'interactive') {
        setTimeout(start, 500);
    } else {
        document.addEventListener('DOMContentLoaded', () => setTimeout(start, 500));
    }

})();