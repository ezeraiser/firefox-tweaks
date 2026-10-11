// GPU süreci belleğini azaltır (varsayılan 2048). Ölçüm: GPU özel belleği ~228 MB -> ~165-191 MB,
// Speedometer 3.1'de fark yok. Geri almak için bu satırı silin ve Firefox'u yeniden başlatın.
user_pref("gfx.webrender.max-shared-surface-size", 1024);
