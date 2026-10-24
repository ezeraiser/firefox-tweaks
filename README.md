# Firefox-Tweaks

**English** | [Türkçe](README.tr.md)

Everything we did to cut Firefox's memory use without forking it (userChrome scripts in the profile plus a few
settings): the working scripts, settings, installer, measurement tools and a detailed report.
This folder is **independent** of the Helium (Chromium) build; it is only stored in this repo.

Current version: Firefox 159 (the UI and translation work is done on this version), Windows 11, portable install. The memory measurements were taken on 158 and have not been re-measured on 159. Detailed measurements and reasoning:
[Firefox.md](Firefox.md) (Turkish).

## Folder map

| Path | What it does | Where it goes |
|---|---|---|
| `firefox-install/config.js` | Autoconfig loader: runs the profile's `chrome\*.uc.js` scripts in every browser window. Also holds a few preferences (telemetry etc.). | Firefox install folder (next to `firefox.exe`) |
| `firefox-install/defaults/pref/config-prefs.js` | Enables `config.js` (`general.config.filename`, `sandbox_enabled=false`). | `<Firefox>\defaults\pref\` |
| `profile/user.js` | Profile settings: `gfx.webrender.max-shared-surface-size = 1024` (GPU memory) and `toolkit.legacyUserProfileCustomizations.stylesheets = true` (so `userChrome.css` loads). | Profile folder (next to `prefs.js`) |
| `profile/chrome/tab_lifecycle.uc.js` | **One file, one timeline:** sleep (2 s) -> deep sleep (60 s) -> main process + GPU trim (+60 s, only when no page is visible) -> tab trim (120 s) -> discard (900 s) + a global trim when the window is minimized. Replaces the three old scripts below. | `<profile>\chrome\` |
| `profile/disabled/tab_trimmer.uc.js`, `tab_freezer.uc.js`, `tab_discarder.uc.js` | **Old, separate scripts (do not use).** Run together with `tab_lifecycle.uc.js` they freeze and trim the same tab twice. | - |
| `profile/disabled/memory_cleaner.uc.js` | **Disabled:** the old GC/CC script. Removed from the live profile (GC+CC in the main process gave no measurable benefit, only ~20 ms of jank). | (not copied) |
| `profile/chrome/userChrome.css` + `bookmarks_bottom.uc.js` | **UI:** bookmarks bar at the bottom (starting where the vertical bar ends; the gap disappears when it is hidden or in "new tab only" mode), a narrow, tight vertical tab strip, a narrowed/centered address bar, and **auto-hide for the top bar** (it opens when the mouse reaches the thin strip at the top or on Ctrl+L; a separate block at the end, remove it to turn it off). Settings are the `--bm-*`, `--vt-*`, `--urlbar-*` variables at the top of the file. Details: [docs/UI-Tasarim.md](docs/UI-Tasarim.md) (Turkish). | `<profile>\chrome\` |
| `profile/chrome/bookmark_host_tag.uc.js` | Writes each bookmark button's domain as `data-bm-host`; in the dark theme userChrome.css uses it to invert single-colour icons (GitHub etc.). | `<profile>\chrome\` |
| `profile/chrome/urlbar_domain.uc.js` | Shows only the main domain (centered) while the address bar is not focused; the full URL appears on click. Shows the page name on `about:` pages. Does not touch the address bar's value. Details: [docs/UI-Tasarim.md](docs/UI-Tasarim.md) (Turkish). | `<profile>\chrome\` |
| `profile/chrome/ExtensionToggleManager.uc.js` | Extension manager panel (toolbar button: left click opens the panel, middle click toggles all, right click opens a menu). Compact, icon-based 300px UI that follows Firefox's panel colors and tooltips. Mock: [docs/ext-manager-mock.html](docs/ext-manager-mock.html). Details: [docs/UI-Tasarim.md](docs/UI-Tasarim.md) (Turkish). | `<profile>\chrome\` |
| `profile/chrome/translate.uc.js` | **Context-menu translation with a selectable service (DeepL or Google):** "Translate selection" (result in a small panel next to the selection), "Translate page" / "Show original page" and a "Translation service" submenu (the choice is saved immediately). Adds no listener to the page (the official DeepL extension's glitches such as jumping to the top on double-click come from that). **An official API key is required:** `about:config` > `extensions.translate-lite.deeplApiKey` / `googleApiKey` (keys stay in `prefs.js`, never in the repo). Settings: `provider`, `targetLang`, `maxChars`; the `SETTINGS` block at the top of the file: language detection (`showDetected`, `autoSwapSameLang`, `swapTarget`, `requireConfident`) and double-click alternative translations on Google results (`wordAlternatives`, `alternativeUnit`: sentence- or comma-based; unofficial endpoint). The result panel shows source/target language pickers and the detected language ("Otomatik · EN"). When a service's quota runs out it switches to the other one automatically (`autoFallback`). Without a key, for selected text: Google opens the Google Translate site in an off-screen hidden browser, reads the result from the page and shows it in our own panel (a block/CAPTCHA is not bypassed, it falls back to a visible panel); DeepL opens its site in a small panel next to the selection (`webMode`: auto/hidden/panel/tab); for pages, Google opens the page in its web translation service (translate.goog). Details: [docs/UI-Tasarim.md](docs/UI-Tasarim.md) section 10 (Turkish). | `<profile>\chrome\` |
| `docs/UI-Tasarim.md` | Design and process of the UI work: how each part works, measurements, lessons learned, what was not tested (Turkish). | - |
| `Firefox.md` | All research, measurements, pitfalls, open items (Turkish). | - |
| `tools/firefox-marionette/` | Tools that open Firefox with a temporary profile and measure/test from the inside (Marionette), plus `shot_popup.ps1` (screenshot of a popup, only when the test window is in front). | - |
| `tools/chromium-speedometer-drm/` | Speedometer, DRM capability probe and JS memory purge tools used on the Chromium/Helium/Edge side. | - |

Scripts load when Firefox restarts. The profile we use: `...\Mozilla\UserData\Ezer1`.
The `Ezer - Kopya` profile still has an old `memory_cleaner`.

## UI customizations (in brief)

Besides the memory scripts, Firefox's UI was moved toward Helium's compact look: bookmarks bar at the bottom,
a narrow vertical tab strip, a centered, low address bar, domain-only display and a redesigned extension manager
panel. How each part works, measurements, mistakes made along the way and **what was not tested** are in
[docs/UI-Tasarim.md](docs/UI-Tasarim.md) (Turkish). To install, copy these files into the profile's `chrome\` folder
and put `user.js` in the profile.

## Installation (from scratch)

1. Copy `firefox-install\config.js` into Firefox's install folder and `firefox-install\defaults\pref\config-prefs.js`
   into `<Firefox>\defaults\pref\`. (If Firefox updates remove these files, copy them again.)
2. Copy `profile\user.js` into the profile folder and `profile\chrome\*.uc.js` into the profile's `chrome\` folder
   (create it if missing).
3. (Optional) To disable the crash reporter, once:
   `[Environment]::SetEnvironmentVariable("MOZ_CRASHREPORTER_DISABLE", "1", "User")` (PowerShell). Details: `docs/UI-Tasarim.md` section 9.
4. Close and reopen Firefox.
5. Verification: `chrome\memlog.txt` should appear and contain one `yüklendi:` ("loaded") line per script. If not, open
   `Ctrl+Shift+J` (Browser Console) and look for `[config.js] ✓ Loaded: ...` / `✗ Failed: ...` lines.

## Scripts and key settings

The `CONFIG` block at the top of each script explains **every setting** (in Turkish). The notable ones:

| Script | Setting | Live value | Meaning |
|---|---|---|---|
| tab_trimmer | `HIDDEN_DELAY_SECONDS` | 10 | A tab process is trimmed after being invisible this many seconds |
| tab_trimmer | `TRIM_ALL_WHEN_MINIMIZED` / `MINIMIZED_DELAY_SECONDS` | on / 5 | When no page is visible the main process + GPU (+ other processes) are trimmed |
| tab_trimmer | `RETRIM_WHEN_ALL_IDLE_SECONDS` | 600 | While completely idle, re-trim all processes at this interval (prevents bloat over hours of idling) |
| tab_trimmer | `TRIM_HELPER_PROCESSES` | on | While idle, the decoder (RDD), network, utility and preallocated processes are trimmed too |
| tab_trimmer | `TRIM_OTHERS_WHILE_MEDIA_PLAYS` | on | The idle trim continues **even while audio/PiP/sharing is active**; only that media tab's process is skipped |
| tab_lifecycle | `ACTIVE_IDLE_SECONDS` / `ACTIVE_IDLE_REPEAT_MINUTES` | 17 / 5 | While the user is **idle** (window visible, mouse/keyboard still for 17 s) the main process + GPU are trimmed; it stops on input and is skipped while audio/PiP/loading tabs exist (0: off) |
| tab_lifecycle | `PROCESS_ACTIONS` / `FLOW_ORDER` | class table / `gc, cc, minimize, trim` | Separate `gc`, `cc`, `minimize`, `trim` flags **per process class** (main, passive tab, media, loading, active tab, GPU, rdd, network, utility, extension, idle, other); the order of jobs is `FLOW_ORDER`, and all flows run in a single queue with confirmed stages. Details: [docs/UI-Tasarim.md](docs/UI-Tasarim.md) section 5 |
| tab_lifecycle | `TRIM_MEDIA_TAB_AFTER_HIDDEN_SECONDS` / `TRIM_MEDIA_TAB_EVERY_SECONDS` | 10 / 60 | Process of a tab playing audio: trimmed once 10 s after Firefox goes to the background (no page visible), then every 60 s; the counter resets when it comes to the front (0: off). **Not tested** (with real media) |
| tab_trimmer | `RECLAIM_WHILE_MEDIA_PLAYS` | off | No "memory-pressure" notification while media plays (it also reaches the media tab's process and cannot exclude it); GC/CC only in the main process |
| tab_trimmer | `RECLAIM_BEFORE_MINIMIZED_TRIM` / `RECLAIM_REPEAT_MINUTES` | on / 10 | GC+CC+heap-minimize before trimming (real memory drop) |
| tab_trimmer | `TRIM_EXTENSION_PROCESS` | on | Also trim the extension process (uBlock etc.) |
| tab_freezer | `FREEZE_AFTER_SECONDS` | 2 | Freeze delay after leaving a tab |
| tab_freezer | `PROTECTED_RECENT_TABS` | 0 (script default 1) | Number of recently used tabs that are not frozen |
| tab_freezer | `DEEP_SLEEP_AFTER_MINUTES` | 600 (script default 5) | **Deep sleep:** if no tab in any window has been visible for this many minutes, every tab freezes except media (audio/PiP/sharing) and loading ones (including the selected one, protected ones and exempt sites); thaws instantly when a window opens. 0: off. 600 is effectively off |
| tab_freezer | `WAKE_INTERVAL_SECONDS` | 0 | Periodically wake a frozen tab (0: thaw only when switching to the tab) |
| tab_freezer | `RECLAIM_ON_FREEZE` | on | GC/CC in the frozen tab's own process |
| tab_freezer | `EXEMPT_HOSTS` | **empty** (script default: chat/mail/media sites) | Sites that are not frozen. Ignored during deep sleep |
| tab_discarder | `DISCARD_AFTER_MINUTES` | 10 (script default 30) | A tab hidden this many minutes is discarded (content reloads) |
| tab_discarder | `KEEP_RECENT_TABS` | 0 (script default 2) | Number of recently used tabs that are not discarded |
| tab_discarder | `EXEMPT_HOSTS` | chat/mail/media sites + docs.google.com | Sites that are not discarded |
| tab_discarder | `DRY_RUN` | false | true: does not discard, only logs "would discard" (for a first trial) |
| all | `ENABLE_LOGGING` | true | Writes to `chrome\memlog.txt` (rotates at 400 KB); if false nothing is written to the file (errors go only to the Browser Console) |

**Media policy (the same in every script):** a tab playing audio, in Picture-in-Picture or sharing screen/camera exempts only
**its own process**; it stops no other process or job. (In the trimmer this used to be a global gate, fixed on 2026-10-09,
see Firefox.md §14.)

`user.js`: `gfx.webrender.max-shared-surface-size` 2048 -> 1024. In measurement, GPU process private memory went 228 -> 165-191 MB,
with no difference in Speedometer.

## Reading the log (`chrome\memlog.txt`)

- `yüklendi:` ("loaded") once per script at startup (with its settings).
- `çalışıyor:` ("running") every 10 min: window/process count, total private memory, `allIdle` (is no page visible),
  whether media exists (with `medya=true(ses:site)` the main process/GPU are not trimmed), trim count, time of the last trim.
- `kırpıldı: sekme süreci=N uzantı süreci=M` ("trimmed", a trim round); `boşta: GC/CC/heap-minimize gönderildi` and
  `boşta: ana süreç + GPU kırpıldı` (idle trims); `BOŞALTILDI -> site | title` (discarded); `donduruldu:` (frozen) / `GC/CC/minimize:`.
- Errors carry `[Betik ERROR]`. If a script never wrote a `yüklendi` line it did not load.

## Rollback

- Turn off a single feature: remove its `.uc.js` file from `chrome\` (or rename it so it no longer ends in `.uc.js`).
- GPU setting: delete the line in `user.js` and (if present) reset `gfx.webrender.max-shared-surface-size` in `about:config`.
- Everything: remove the scripts from `chrome\` or delete `config.js`.

## Things to know (from the measurements)

- **Trimming** shrinks the working set (Task Manager "Memory"); it **does not lower private memory/commit**, pages go
  to disk (Windows memory compression is off on this machine). `about:processes` shows private memory, and that column does not drop with trimming.
- Real reductions come from GC/CC/heap-minimize and tab discarding. Discarding makes the content reload.
- Processes refill over time while idle (main process ~+30 MB per minute, hundreds of MB over hours), hence the periodic re-trim.
- Freezing uses `loadFrameScript` (JSWindowActor was tried and did not work); if Firefox removes this mechanism later it must be rewritten.
- Not measured: GC gain on long-lived tabs, rendering smoothness (`max-shared-surface-size`), recovery delay under RAM pressure,
  stability over days, multiple windows. Details: `Firefox.md` §11-12.
- `browser.cache.memory.capacity` and `browser.sessionhistory.max_total_viewers` were tried with no difference (not changed).

## Measurement tools (in brief)

`tools\firefox-marionette\launch.ps1 -PrefsFile <file> -Port <port> -Tag <name> [-FirefoxExe <path>]` opens Firefox with a temporary profile
using `--marionette --remote-allow-system-access` (to put scripts under `chrome\` use the `FF_CHROME_SRC` environment variable,
file paths separated by `;`). `mn.mjs <port> <script.js>` runs a script inside the browser (chrome context) over Marionette; `mncmd.mjs` runs a single
command (e.g. `Addon:Install`), `mnspeed.mjs` runs Speedometer 3.1 and reads the score;
`kill.ps1 -Tag <name>` closes only that temporary instance and deletes its profile. `r3.js` GPU process memory dump, `r1.js` opens sample tabs,
`p2.js`/`r4.js` process list, `z2.js` discarder trial, `srv2.mjs` local garbage-producing test page server.
Chromium/Helium/Edge side: `speedo.mjs` + `batch.sh` Speedometer A/B runs, `drm.mjs` DRM capability probe,
`purge.mjs` `Memory.forciblyPurgeJavaScriptMemory`. The tools are meant for a temporary environment; paths (e.g. the Firefox/Helium install
folder) must be adjusted for your own machine.
