// EN: Reduces GPU process memory (default 2048). Measurement: GPU private memory ~228 MB -> ~165-191 MB, no
// EN: difference in Speedometer 3.1. To revert, delete this line and restart Firefox.
// TR: GPU süreci belleğini azaltır (varsayılan 2048). Ölçüm: GPU özel belleği ~228 MB -> ~165-191 MB,
// TR: Speedometer 3.1'de fark yok. Geri almak için bu satırı silin ve Firefox'u yeniden başlatın.
user_pref("gfx.webrender.max-shared-surface-size", 1024);

// EN: Enables userChrome.css (required for profile/chrome/userChrome.css, which moves the bookmarks bar to the
// EN: bottom).
// TR: userChrome.css'i etkinleştirir (yer imi çubuğunu alta taşıyan profile/chrome/userChrome.css için gerekli).
user_pref("toolkit.legacyUserProfileCustomizations.stylesheets", true);
