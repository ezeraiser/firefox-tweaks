#requires -Version 5.1
<#
.SYNOPSIS
    Firefox-Tweaks installer, uninstaller and settings editor (windowed, English / Turkish).
    Firefox-Tweaks kurulum, kaldırma ve ayar düzenleme aracı (pencereli, İngilizce / Türkçe).

.DESCRIPTION
    EN  Installs: config.js, defaults\pref\config-prefs.js and distribution\policies.json into the Firefox folder;
        user.js, userChrome.css and the *.uc.js scripts into the profile. Every file it would overwrite is backed up to
        <profile>\firefox-tweaks-backup\ and recorded in manifest.json. Uninstall restores the backups, deletes only what
        it created (including empty folders it made and the logs the scripts write), removes the backup and finally asks
        whether to delete this script. The "Settings" tab edits the installed scripts' settings (see settings.json).
        Source: "Local" (the repo next to / above this script) or "Repo" (downloads a zip from GitHub). The script also
        works on its own: without a repo next to it, it downloads from GitHub.
        Example:  irm https://raw.githubusercontent.com/ezeraiser/firefox-tweaks/main/install-scripts/firefox-tweaks.ps1 | iex
        Command line instead of the window: -Mode Install | Uninstall | Get | Set | CheckSchema.  -DryRun touches nothing.
        UI language: -Lang en (default) | tr.

    TR  Kurar: Firefox klasörüne config.js, defaults\pref\config-prefs.js, distribution\policies.json; profile user.js,
        userChrome.css ve *.uc.js betikleri. Üzerine yazacağı her dosyayı <profil>\firefox-tweaks-backup\ altına yedekler ve
        manifest.json'a yazar. Kaldırma yedekleri geri yükler, yalnızca kendi oluşturduklarını siler (oluşturduğu boş klasörler
        ve betiklerin yazdığı günlükler dahil), yedeği kaldırır ve en sonda bu betiği silmek isteyip istemediğinizi sorar.
        "Ayarlar" sekmesi kurulu betiklerin ayarlarını düzenler (bkz. settings.json).
        Kaynak: "Yerel" (bu betiğin yanındaki / üstündeki repo) ya da "Repo" (GitHub'dan zip indirir). Betik tek başına da
        çalışır: yanında repo yoksa GitHub'dan indirir.
        Pencere yerine komut satırı: -Mode Install | Uninstall | Get | Set | CheckSchema.  -DryRun hiçbir şeye dokunmaz.
        Arayüz dili: -Lang en (varsayılan) | tr.
#>
[CmdletBinding()]
param(
    [ValidateSet('Gui', 'Install', 'Uninstall', 'Get', 'Set', 'CheckSchema')][string]$Mode = 'Gui',
    [ValidateSet('en', 'tr')][string]$Lang = 'en',
    [string]$FirefoxDir,
    [string]$ProfileDir,
    [ValidateSet('Auto', 'Local', 'Repo')][string]$Source = 'Auto',
    [string]$Ref = 'main',
    [string[]]$Components,
    [string[]]$Setting,
    [string]$SourceRoot,
    [switch]$DryRun,
    [switch]$KeepBackup,
    [switch]$RemovePrefs,
    [switch]$Force,
    [switch]$DeleteScript
)

$ErrorActionPreference = 'Stop'
$RepoOwner = 'ezeraiser'
$RepoName = 'firefox-tweaks'
$BackupDirName = 'firefox-tweaks-backup'
$ScriptPath = $PSCommandPath                       # empty when run with "iex"
$ScriptDir = if ($ScriptPath) { Split-Path -Parent $ScriptPath } else { $null }
$Inv = [Globalization.CultureInfo]::InvariantCulture
$Utf8 = New-Object Text.UTF8Encoding $false

# ----------------------------------------------------------------------------------------------------------------
# Strings (English first, Turkish second) / Metinler
# ----------------------------------------------------------------------------------------------------------------
$Strings = @{
    en = @{
        'comp.loader' = 'Loader: config.js + config-prefs.js (Firefox folder)'
        'comp.policies' = 'Enterprise policies: policies.json (also turns off the built-in PDF viewer)'
        'comp.userjs' = 'Profile settings: user.js'
        'comp.ui' = 'Interface: userChrome.css + bookmarks, address bar and extension manager scripts'
        'comp.lifecycle' = 'Memory: tab_lifecycle.uc.js'
        'comp.translate' = 'Translation: translate.uc.js'
        'tag.dry' = '[preview] '
        'src.local' = 'Source: local folder {0}'
        'src.github' = 'Source: GitHub ({0})'
        'dl' = 'Downloading: {0}'
        'err.nolocal' = 'Local source not found: there are no firefox-install\ and profile\ folders next to or above the script.'
        'err.nolocal2' = 'No local source: the script is not running from a file.'
        'err.dl' = 'Could not download from GitHub (branch/tag: {0}).'
        'err.emptyzip' = 'The downloaded archive is empty.'
        'err.noplan' = 'Nothing to install (no component selected, or the source is empty).'
        'err.nomanifest' = 'There is no installation record in this profile: {0}'
        'err.fxdir' = '-FirefoxDir must be a valid Firefox folder (containing firefox.exe).'
        'err.prdir' = '-ProfileDir must be an existing profile folder.'
        'err.running' = 'Firefox is running: close it first.'
        'log.mkdir' = '{0}folder created: {1}'
        'log.backup' = '{0}backed up: {1}'
        'log.copied' = '{0}copied: {1}'
        'log.done.install' = '{0}Installation finished. Open Firefox to see the changes (if needed: about:support > "Clear startup cache").'
        'log.skip.modified' = '{0}skipped (changed after installation): {1}'
        'log.restored' = '{0}restored from backup: {1}'
        'log.nobackup' = '{0}WARNING: backup not found, file left as it is: {1}'
        'log.deleted' = '{0}deleted: {1}'
        'log.logdeleted' = '{0}log deleted: {1}'
        'log.dirdeleted' = '{0}empty folder deleted: {1}'
        'log.dirkept' = '{0}folder is not empty, left in place: {1}'
        'log.prefs' = '{0}prefs.js: {1} setting line(s) deleted (extensions.translate-lite / deepl-lite / toggle-manager)'
        'log.skipped' = '{0}{1} file(s) skipped: backup and record were kept, you can uninstall these files again later.'
        'log.backupkept' = '{0}backup folder kept: {1}'
        'log.backupremoved' = '{0}backup and record deleted: {1}'
        'log.done.uninstall' = '{0}Uninstall finished.'
        'log.set' = '{0}saved: {1} = {2}'
        'log.set.notinstalled' = '{0}not installed, skipped: {1}'
        'log.set.nomarker' = '{0}setting not found in the file, skipped: {1} ({2})'
        'log.set.nochange' = 'No changes to save.'
        'log.set.done' = '{0}Settings saved. Restart Firefox for them to take effect (if needed: about:support > "Clear startup cache").'
        'log.set.prefsbackup' = '{0}prefs.js backed up before the first change.'
        'err.setparse' = 'Cannot parse "{0}" (expected id=value).'
        'err.setunknown' = 'Unknown setting id: {0}'
        'err.setvalue' = 'Invalid value for {0}: {1}'
        'chk.ok' = 'Schema matches the source files ({0} settings).'
        'chk.bad' = 'MISMATCH {0}: schema default = {1}, source = {2}'
        'chk.missing' = 'MISSING in source: {0}'
        'gui.title' = 'Firefox-Tweaks'
        'gui.sub' = 'Installs the scripts and settings; uninstall restores your backups and leaves nothing behind.'
        'lang.label' = 'Language'
        'tab.install' = 'Install'
        'tab.settings' = 'Settings'
        'fx.group' = 'Firefox folder'
        'fx.browse' = 'Browse...'
        'fx.ok' = 'firefox.exe found.'
        'fx.bad' = 'There is no firefox.exe in this folder.'
        'fx.pick' = 'Select the Firefox folder.'
        'pr.group' = 'Profile'
        'pr.other' = 'Other...'
        'pr.default' = '(default)'
        'pr.selected' = 'Selected'
        'pr.isdefault' = 'This is Firefox''s default profile. The installation goes here.'
        'pr.notdefault' = 'This profile is NOT the default. Make sure it is the right one.'
        'pr.pick' = 'Select a profile.'
        'pr.confirm' = 'I confirm this is the profile to install to / uninstall from'
        'src.group' = 'Source'
        'src.rb.local' = 'Local (repo next to the script)'
        'src.rb.repo' = 'Download from GitHub, branch/tag:'
        'co.group' = 'What to install'
        'un.group' = 'Uninstall and preview'
        'un.keep' = 'Keep the backups (do not delete the backup folder when uninstalling)'
        'un.prefs' = 'Also delete translation/extension settings from prefs.js (incl. API keys!)'
        'un.dry' = 'Preview (do not touch files)'
        'btn.install' = 'Install'
        'btn.uninstall' = 'Uninstall'
        'st.busy' = 'Working...'
        'st.running' = 'Firefox is open: close it, then continue.'
        'st.confirm' = 'Confirm the profile.'
        'st.has' = 'This profile has an installation: you can reinstall or uninstall.'
        'st.none' = 'No installation record in this profile: uninstall is off.'
        'dlg.fx' = 'Select the folder that contains firefox.exe'
        'dlg.pr' = 'Select the profile folder (the one containing prefs.js)'
        'dlg.admin.msg' = 'Cannot write to the Firefox folder:{0}{1}{0}{0}Restart as administrator?'
        'dlg.admin.title' = 'Administrator rights needed'
        'dlg.nocomp' = 'Select at least one component.'
        'dlg.un.title' = 'Uninstall'
        'dlg.un.head' = 'The installation will be undone:'
        'dlg.un.l1' = '- Files that existed before are restored from the backup'
        'dlg.un.l2' = '- Files that were created are deleted'
        'dlg.un.l3' = '- The backup folder is deleted'
        'dlg.un.keep' = ' (it will be kept)'
        'dlg.un.l4' = '- Translation/extension settings (including API keys) are deleted from prefs.js'
        'dlg.un.go' = 'Continue?'
        'dlg.mod' = 'This file was changed after installation:{0}{1}{0}{0}Restore it anyway? (your changes will be lost)'
        'dlg.mod.title' = 'File changed'
        'dlg.del' = 'Uninstall finished.{0}{0}Delete this script file too?{0}{1}'
        'dlg.del.title' = 'Delete the script'
        'set.profile' = 'Profile: {0}'
        'set.pickgroup' = 'Pick a file on the left.'
        'set.save' = 'Save changes'
        'set.revert' = 'Revert'
        'set.open' = 'Open file'
        'set.reset' = 'Default: {0}'
        'set.show' = 'Show'
        'set.needconfirm' = 'Confirm the profile on the Install tab first.'
        'set.notinstalled' = 'This file is not installed in the selected profile.'
        'set.running' = 'Firefox is open: close it to save settings.'
        'set.changed' = '{0} change(s) not saved yet.'
        'set.clean' = 'No unsaved changes.'
        'set.on' = 'On'
        'set.off' = 'Off'
    }
    tr = @{
        'comp.loader' = 'Yükleyici: config.js + config-prefs.js (Firefox klasörü)'
        'comp.policies' = 'Kurumsal ilkeler: policies.json (yerleşik PDF görüntüleyiciyi de kapatır)'
        'comp.userjs' = 'Profil ayarları: user.js'
        'comp.ui' = 'Arayüz: userChrome.css + yer imi, adres çubuğu ve uzantı yöneticisi betikleri'
        'comp.lifecycle' = 'Bellek: tab_lifecycle.uc.js'
        'comp.translate' = 'Çeviri: translate.uc.js'
        'tag.dry' = '[önizleme] '
        'src.local' = 'Kaynak: yerel klasör {0}'
        'src.github' = 'Kaynak: GitHub ({0})'
        'dl' = 'İndiriliyor: {0}'
        'err.nolocal' = 'Yerel kaynak bulunamadı: betiğin yanında ya da üstünde firefox-install\ ve profile\ klasörleri yok.'
        'err.nolocal2' = 'Yerel kaynak yok: betik dosyadan çalışmıyor.'
        'err.dl' = 'GitHub''dan indirilemedi (dal/etiket: {0}).'
        'err.emptyzip' = 'İndirilen arşiv boş.'
        'err.noplan' = 'Kurulacak dosya yok (bileşen seçilmedi ya da kaynak boş).'
        'err.nomanifest' = 'Bu profilde kurulum kaydı yok: {0}'
        'err.fxdir' = '-FirefoxDir geçerli bir Firefox klasörü olmalı (firefox.exe içermeli).'
        'err.prdir' = '-ProfileDir mevcut bir profil klasörü olmalı.'
        'err.running' = 'Firefox açık: önce kapatın.'
        'log.mkdir' = '{0}klasör oluşturuldu: {1}'
        'log.backup' = '{0}yedeklendi: {1}'
        'log.copied' = '{0}kopyalandı: {1}'
        'log.done.install' = '{0}Kurulum bitti. Değişikliklerin görünmesi için Firefox''u açın (gerekirse about:support > "Clear startup cache").'
        'log.skip.modified' = '{0}atlandı (kurulumdan sonra değişmiş): {1}'
        'log.restored' = '{0}yedekten geri yüklendi: {1}'
        'log.nobackup' = '{0}UYARI: yedek bulunamadı, dosya olduğu gibi bırakıldı: {1}'
        'log.deleted' = '{0}silindi: {1}'
        'log.logdeleted' = '{0}günlük silindi: {1}'
        'log.dirdeleted' = '{0}boş klasör silindi: {1}'
        'log.dirkept' = '{0}klasör boş değil, bırakıldı: {1}'
        'log.prefs' = '{0}prefs.js: {1} ayar satırı silindi (extensions.translate-lite / deepl-lite / toggle-manager)'
        'log.skipped' = '{0}{1} dosya atlandı: yedek ve kayıt silinmedi, bu dosyaları sonra yeniden kaldırabilirsiniz.'
        'log.backupkept' = '{0}yedek klasörü korundu: {1}'
        'log.backupremoved' = '{0}yedek ve kayıt silindi: {1}'
        'log.done.uninstall' = '{0}Kaldırma bitti.'
        'log.set' = '{0}kaydedildi: {1} = {2}'
        'log.set.notinstalled' = '{0}kurulu değil, atlandı: {1}'
        'log.set.nomarker' = '{0}ayar dosyada bulunamadı, atlandı: {1} ({2})'
        'log.set.nochange' = 'Kaydedilecek değişiklik yok.'
        'log.set.done' = '{0}Ayarlar kaydedildi. Etkili olması için Firefox''u yeniden başlatın (gerekirse about:support > "Clear startup cache").'
        'log.set.prefsbackup' = '{0}prefs.js ilk değişiklikten önce yedeklendi.'
        'err.setparse' = '"{0}" ayrıştırılamadı (id=değer bekleniyor).'
        'err.setunknown' = 'Bilinmeyen ayar kimliği: {0}'
        'err.setvalue' = '{0} için geçersiz değer: {1}'
        'chk.ok' = 'Şema kaynak dosyalarla uyumlu ({0} ayar).'
        'chk.bad' = 'UYUŞMAZLIK {0}: şema varsayılanı = {1}, kaynak = {2}'
        'chk.missing' = 'Kaynakta YOK: {0}'
        'gui.title' = 'Firefox-Tweaks'
        'gui.sub' = 'Betikleri ve ayarları kurar; kaldırınca yedeklerinizi geri yükler, geride bir şey bırakmaz.'
        'lang.label' = 'Dil'
        'tab.install' = 'Kurulum'
        'tab.settings' = 'Ayarlar'
        'fx.group' = 'Firefox klasörü'
        'fx.browse' = 'Gözat...'
        'fx.ok' = 'firefox.exe bulundu.'
        'fx.bad' = 'Bu klasörde firefox.exe yok.'
        'fx.pick' = 'Firefox klasörünü seçin.'
        'pr.group' = 'Profil'
        'pr.other' = 'Başka...'
        'pr.default' = '(varsayılan)'
        'pr.selected' = 'Seçilen'
        'pr.isdefault' = 'Firefox''un varsayılan profili. Kurulum buraya yapılacak.'
        'pr.notdefault' = 'Bu profil varsayılan DEĞİL. Doğru profil olduğundan emin olun.'
        'pr.pick' = 'Bir profil seçin.'
        'pr.confirm' = 'Kurulum / kaldırma için doğru profil olduğunu onaylıyorum'
        'src.group' = 'Kaynak'
        'src.rb.local' = 'Yerel (betiğin yanındaki repo)'
        'src.rb.repo' = 'GitHub''dan indir, dal/etiket:'
        'co.group' = 'Neler kurulsun'
        'un.group' = 'Kaldırma ve önizleme'
        'un.keep' = 'Yedekleri koru (kaldırınca yedek klasörünü silme)'
        'un.prefs' = 'Çeviri/uzantı ayarlarını prefs.js''ten de sil (API anahtarları dahil!)'
        'un.dry' = 'Önizleme (dosyalara dokunma)'
        'btn.install' = 'Kur'
        'btn.uninstall' = 'Kaldır'
        'st.busy' = 'Çalışıyor...'
        'st.running' = 'Firefox açık: kapatın, sonra devam edin.'
        'st.confirm' = 'Profili onaylayın.'
        'st.has' = 'Bu profilde kurulum var: yeniden kurabilir ya da kaldırabilirsiniz.'
        'st.none' = 'Bu profilde kurulum kaydı yok: kaldırma kapalı.'
        'dlg.fx' = 'firefox.exe''nin bulunduğu klasörü seçin'
        'dlg.pr' = 'Profil klasörünü seçin (içinde prefs.js olan klasör)'
        'dlg.admin.msg' = 'Firefox klasörüne yazılamıyor:{0}{1}{0}{0}Yönetici olarak yeniden başlatılsın mı?'
        'dlg.admin.title' = 'Yönetici izni gerekli'
        'dlg.nocomp' = 'En az bir bileşen seçin.'
        'dlg.un.title' = 'Kaldır'
        'dlg.un.head' = 'Kurulum geri alınacak:'
        'dlg.un.l1' = '- Önceden var olan dosyalar yedekten geri yüklenir'
        'dlg.un.l2' = '- Sonradan oluşturulanlar silinir'
        'dlg.un.l3' = '- Yedek klasörü silinir'
        'dlg.un.keep' = ' (korunacak)'
        'dlg.un.l4' = '- prefs.js''ten çeviri/uzantı ayarları (API anahtarları dahil) silinir'
        'dlg.un.go' = 'Devam edilsin mi?'
        'dlg.mod' = 'Bu dosya kurulumdan sonra değişmiş:{0}{1}{0}{0}Yine de geri alınsın mı? (değişiklikleriniz kaybolur)'
        'dlg.mod.title' = 'Dosya değişmiş'
        'dlg.del' = 'Kaldırma tamamlandı.{0}{0}Bu betik dosyasını da sileyim mi?{0}{1}'
        'dlg.del.title' = 'Betiği sil'
        'set.profile' = 'Profil: {0}'
        'set.pickgroup' = 'Soldan bir dosya seçin.'
        'set.save' = 'Değişiklikleri kaydet'
        'set.revert' = 'Geri al'
        'set.open' = 'Dosyayı aç'
        'set.reset' = 'Varsayılan: {0}'
        'set.show' = 'Göster'
        'set.needconfirm' = 'Önce Kurulum sekmesinde profili onaylayın.'
        'set.notinstalled' = 'Bu dosya seçili profilde kurulu değil.'
        'set.running' = 'Firefox açık: ayarları kaydetmek için kapatın.'
        'set.changed' = '{0} değişiklik henüz kaydedilmedi.'
        'set.clean' = 'Kaydedilmemiş değişiklik yok.'
        'set.on' = 'Açık'
        'set.off' = 'Kapalı'
    }
}
$script:CurLang = $Lang
function T([string]$Key, [object[]]$A) {
    $s = $Strings[$script:CurLang][$Key]
    if ($null -eq $s) { $s = $Strings['en'][$Key] }
    if ($null -eq $s) { return $Key }
    if ($null -ne $A -and $A.Count) { return ($s -f $A) }
    return $s
}
$ComponentIds = @('loader', 'policies', 'userjs', 'ui', 'lifecycle', 'translate')

# ----------------------------------------------------------------------------------------------------------------
# Source: which files go where / Kaynak
# ----------------------------------------------------------------------------------------------------------------
function Get-SourceFiles([string]$Root) {
    $items = New-Object System.Collections.ArrayList
    $fi = Join-Path $Root 'firefox-install'
    if (Test-Path -LiteralPath $fi) {
        foreach ($f in Get-ChildItem -LiteralPath $fi -Recurse -File) {
            $rel = $f.FullName.Substring($fi.Length).TrimStart('\', '/') -replace '\\', '/'
            $comp = if ($rel -like 'distribution/*') { 'policies' } else { 'loader' }
            [void]$items.Add([pscustomobject]@{ Component = $comp; Source = $f.FullName; Base = 'Firefox'; Rel = $rel })
        }
    }
    $uj = Join-Path $Root 'profile\user.js'
    if (Test-Path -LiteralPath $uj) {
        [void]$items.Add([pscustomobject]@{ Component = 'userjs'; Source = $uj; Base = 'Profile'; Rel = 'user.js' })
    }
    $ch = Join-Path $Root 'profile\chrome'
    if (Test-Path -LiteralPath $ch) {
        foreach ($f in Get-ChildItem -LiteralPath $ch -File) {
            $comp = switch ($f.Name) { 'tab_lifecycle.uc.js' { 'lifecycle' } 'translate.uc.js' { 'translate' } default { 'ui' } }
            [void]$items.Add([pscustomobject]@{ Component = $comp; Source = $f.FullName; Base = 'Profile'; Rel = 'chrome/' + $f.Name })
        }
    }
    return $items
}

function Find-LocalRoot {
    if (-not $ScriptDir) { return $null }
    foreach ($c in @($ScriptDir, (Split-Path -Parent $ScriptDir))) {
        if ($c -and (Test-Path -LiteralPath (Join-Path $c 'firefox-install')) -and (Test-Path -LiteralPath (Join-Path $c 'profile'))) { return $c }
    }
    return $null
}

function Resolve-Source([string]$Mode_, [string]$Ref_, [scriptblock]$Log) {
    # Returns @{ Root; Temp (temporary folder to delete or $null); Kind }
    if ($Mode_ -ne 'Repo') {
        $local = Find-LocalRoot
        if ($local) { & $Log (T 'src.local' @($local)); return @{ Root = $local; Temp = $null; Kind = 'Local' } }
        if ($Mode_ -eq 'Local') { if ($ScriptDir) { throw (T 'err.nolocal') } else { throw (T 'err.nolocal2') } }
    }
    [Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12
    $tmp = Join-Path ([IO.Path]::GetTempPath()) ('firefox-tweaks-' + [Guid]::NewGuid().ToString('N'))
    New-Item -ItemType Directory -Path $tmp | Out-Null
    $zip = Join-Path $tmp 'src.zip'
    $ok = $false
    foreach ($kind in @('heads', 'tags')) {
        $url = "https://github.com/$RepoOwner/$RepoName/archive/refs/$kind/$Ref_.zip"
        try { & $Log (T 'dl' @($url)); Invoke-WebRequest -UseBasicParsing -Uri $url -OutFile $zip; $ok = $true; break } catch { }
    }
    if (-not $ok) { Remove-Item -LiteralPath $tmp -Recurse -Force -ErrorAction SilentlyContinue; throw (T 'err.dl' @($Ref_)) }
    Expand-Archive -LiteralPath $zip -DestinationPath $tmp -Force
    $root = Get-ChildItem -LiteralPath $tmp -Directory | Select-Object -First 1
    if (-not $root) { throw (T 'err.emptyzip') }
    & $Log (T 'src.github' @($Ref_))
    return @{ Root = $root.FullName; Temp = $tmp; Kind = "GitHub ($Ref_)" }
}

# ----------------------------------------------------------------------------------------------------------------
# Firefox / profile detection
# ----------------------------------------------------------------------------------------------------------------
function Test-FirefoxDir([string]$Dir) { return [bool]($Dir -and (Test-Path -LiteralPath (Join-Path $Dir 'firefox.exe'))) }

function Find-FirefoxDirs {
    $found = New-Object System.Collections.Generic.List[string]
    $add = { param($p) if ($p -and (Test-FirefoxDir $p) -and -not $found.Contains($p)) { $found.Add($p) } }
    try { foreach ($p in Get-Process firefox -ErrorAction SilentlyContinue) { if ($p.Path) { & $add (Split-Path -Parent $p.Path) } } } catch { }
    foreach ($root in 'HKLM:\SOFTWARE\Mozilla\Mozilla Firefox', 'HKLM:\SOFTWARE\WOW6432Node\Mozilla\Mozilla Firefox') {
        try {
            $cur = (Get-ItemProperty $root -ErrorAction Stop).CurrentVersion
            if ($cur) { & $add ((Get-ItemProperty (Join-Path $root "$cur\Main") -ErrorAction Stop).'Install Directory') }
        } catch { }
    }
    foreach ($k in 'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\App Paths\firefox.exe', 'HKCU:\SOFTWARE\Microsoft\Windows\CurrentVersion\App Paths\firefox.exe') {
        try { & $add (Split-Path -Parent (Get-ItemProperty $k -ErrorAction Stop).'(default)') } catch { }
    }
    foreach ($p in "$env:ProgramFiles\Mozilla Firefox", "${env:ProgramFiles(x86)}\Mozilla Firefox", "$env:LOCALAPPDATA\Mozilla Firefox") { & $add $p }
    return @($found)
}

function Get-FirefoxProfiles {
    # Name, Path, IsDefault. Default: the [Install*] section's Default= first, otherwise Default=1 in [ProfileN]
    $ini = Join-Path $env:APPDATA 'Mozilla\Firefox\profiles.ini'
    if (-not (Test-Path -LiteralPath $ini)) { return @() }
    $base = Split-Path -Parent $ini
    $sections = @(); $cur = $null
    foreach ($line in Get-Content -LiteralPath $ini -Encoding UTF8) {
        if ($line -match '^\s*\[(.+)\]\s*$') { $cur = @{ _name = $Matches[1] }; $sections += , $cur }
        elseif ($cur -and $line -match '^\s*([^=;#]+?)\s*=\s*(.*)$') { $cur[$Matches[1]] = $Matches[2] }
    }
    $toPath = { param($p, $rel) if ($rel -eq '1' -or -not [IO.Path]::IsPathRooted($p)) { Join-Path $base ($p -replace '/', '\') } else { $p } }
    $installDefault = $null
    foreach ($s in $sections) { if ($s._name -like 'Install*' -and $s.Default) { $installDefault = & $toPath $s.Default '0'; break } }
    $list = @()
    foreach ($s in $sections) {
        if ($s._name -like 'Profile*' -and $s.Path) {
            $p = & $toPath $s.Path $s.IsRelative
            $list += [pscustomobject]@{ Name = $s.Name; Path = $p; IsDefault = $false; Flag = ($s.Default -eq '1') }
        }
    }
    if ($installDefault -and -not ($list | Where-Object { $_.Path -ieq $installDefault })) {
        $list += [pscustomobject]@{ Name = (Split-Path -Leaf $installDefault); Path = $installDefault; IsDefault = $false; Flag = $false }
    }
    $mark = $null
    if ($installDefault) { $mark = $list | Where-Object { $_.Path -ieq $installDefault } | Select-Object -First 1 }
    if (-not $mark) { $mark = $list | Where-Object { $_.Flag } | Select-Object -First 1 }
    if ($mark) { $mark.IsDefault = $true }
    return @($list | Sort-Object { -not $_.IsDefault })
}

function Test-FirefoxRunning([string]$FirefoxDir, [string]$ProfileDir) {
    try {
        foreach ($p in Get-Process firefox -ErrorAction SilentlyContinue) {
            if ($FirefoxDir -and $p.Path -and ((Split-Path -Parent $p.Path) -ieq $FirefoxDir.TrimEnd('\'))) { return $true }
        }
    } catch { }
    if ($ProfileDir) {
        $lock = Join-Path $ProfileDir 'parent.lock'
        if (Test-Path -LiteralPath $lock) {
            try { $fs = [IO.File]::Open($lock, 'Open', 'ReadWrite', 'None'); $fs.Close() } catch { return $true }
        }
    }
    return $false
}

function Test-Writable([string]$Dir) {
    if (-not (Test-Path -LiteralPath $Dir)) { return $true }
    try { $t = Join-Path $Dir ('.w' + [Guid]::NewGuid().ToString('N')); [IO.File]::WriteAllText($t, ''); Remove-Item -LiteralPath $t -Force; return $true } catch { return $false }
}

# ----------------------------------------------------------------------------------------------------------------
# Manifest
# ----------------------------------------------------------------------------------------------------------------
function Get-BackupRoot([string]$ProfileDir) { return Join-Path $ProfileDir $BackupDirName }
function Get-ManifestPath([string]$ProfileDir) { return Join-Path (Get-BackupRoot $ProfileDir) 'manifest.json' }

function Read-Manifest([string]$ProfileDir) {
    $mp = Get-ManifestPath $ProfileDir
    if (-not (Test-Path -LiteralPath $mp)) { return $null }
    $m = @{ files = (New-Object System.Collections.ArrayList); createdDirs = (New-Object System.Collections.ArrayList); firefoxDir = $null; source = $null }
    $j = [IO.File]::ReadAllText($mp, $Utf8) | ConvertFrom-Json
    foreach ($f in @($j.files)) { if ($f) { [void]$m.files.Add($f) } }
    foreach ($d in @($j.createdDirs)) { if ($d) { [void]$m.createdDirs.Add([string]$d) } }
    $m.firefoxDir = $j.firefoxDir; $m.source = $j.source
    return $m
}

function Save-Manifest([string]$ProfileDir, $M) {
    $root = Get-BackupRoot $ProfileDir
    if (-not (Test-Path -LiteralPath $root)) { New-Item -ItemType Directory -Path $root | Out-Null }
    $o = [pscustomobject]@{
        version = 1; installedAt = (Get-Date).ToString('s'); firefoxDir = $M.firefoxDir; profileDir = $ProfileDir; source = $M.source
        files = @($M.files); createdDirs = @($M.createdDirs)
    }
    [IO.File]::WriteAllText((Get-ManifestPath $ProfileDir), ($o | ConvertTo-Json -Depth 6), $Utf8)
}

# ----------------------------------------------------------------------------------------------------------------
# Install
# ----------------------------------------------------------------------------------------------------------------
function Install-Tweaks {
    param([string]$Root, [string]$SourceKind, [string]$FirefoxDir, [string]$ProfileDir, [string[]]$Ids, [switch]$DryRun, [scriptblock]$Log)
    $plan = @(Get-SourceFiles $Root | Where-Object { $Ids -contains $_.Component })
    if (-not $plan.Count) { throw (T 'err.noplan') }

    $m = Read-Manifest $ProfileDir
    if (-not $m) { $m = @{ files = (New-Object System.Collections.ArrayList); createdDirs = (New-Object System.Collections.ArrayList) } }
    $m.firefoxDir = $FirefoxDir; $m.source = $SourceKind
    $backupRoot = Get-BackupRoot $ProfileDir
    $tag = if ($DryRun) { T 'tag.dry' } else { '' }

    foreach ($it in $plan) {
        $base = if ($it.Base -eq 'Firefox') { $FirefoxDir } else { $ProfileDir }
        $target = Join-Path $base ($it.Rel -replace '/', '\')
        $dir = Split-Path -Parent $target

        # Missing folders (outermost first) are created and recorded: uninstall deletes only these, and only if empty
        $missing = @(); $d = $dir
        while ($d -and -not (Test-Path -LiteralPath $d)) { $missing += $d; $d = Split-Path -Parent $d }
        [array]::Reverse($missing)
        foreach ($x in $missing) {
            if (-not $DryRun) { New-Item -ItemType Directory -Path $x | Out-Null }
            if (-not $m.createdDirs.Contains($x)) { [void]$m.createdDirs.Add($x) }
            & $Log (T 'log.mkdir' @($tag, $x))
        }

        $entry = $m.files | Where-Object { $_.target -eq $target } | Select-Object -First 1
        if (-not $entry) {
            $existed = Test-Path -LiteralPath $target
            $bk = $null
            if ($existed) {
                $bk = 'files/{0:D3}-{1}' -f ($m.files.Count + 1), (Split-Path -Leaf $target)
                if (-not $DryRun) {
                    $bp = Join-Path $backupRoot ($bk -replace '/', '\')
                    New-Item -ItemType Directory -Path (Split-Path -Parent $bp) -Force | Out-Null
                    Copy-Item -LiteralPath $target -Destination $bp -Force
                }
                & $Log (T 'log.backup' @($tag, $target))
            }
            $entry = [pscustomobject]@{ target = $target; existed = $existed; backup = $bk; sha = $null }
            [void]$m.files.Add($entry)
        }
        if (-not $DryRun) {
            Copy-Item -LiteralPath $it.Source -Destination $target -Force
            $entry.sha = (Get-FileHash -Algorithm SHA256 -LiteralPath $target).Hash
        }
        & $Log (T 'log.copied' @($tag, $it.Rel))
    }
    if (-not $DryRun) { Save-Manifest $ProfileDir $m }
    & $Log (T 'log.done.install' @($tag))
}

# ----------------------------------------------------------------------------------------------------------------
# Uninstall: leave nothing behind
# ----------------------------------------------------------------------------------------------------------------
function Uninstall-Tweaks {
    param([string]$ProfileDir, [switch]$DryRun, [switch]$KeepBackup, [switch]$RemovePrefs, [scriptblock]$Log, [scriptblock]$OnModified)
    $m = Read-Manifest $ProfileDir
    if (-not $m) { throw (T 'err.nomanifest' @((Get-ManifestPath $ProfileDir))) }
    $backupRoot = Get-BackupRoot $ProfileDir
    $tag = if ($DryRun) { T 'tag.dry' } else { '' }
    $skipped = New-Object System.Collections.ArrayList

    for ($i = $m.files.Count - 1; $i -ge 0; $i--) {
        $e = $m.files[$i]; $t = [string]$e.target
        if ((Test-Path -LiteralPath $t) -and $e.sha) {
            $now = (Get-FileHash -Algorithm SHA256 -LiteralPath $t).Hash
            if ($now -ne $e.sha -and -not (& $OnModified $t)) { & $Log (T 'log.skip.modified' @($tag, $t)); [void]$skipped.Add($e); continue }
        }
        if ($e.existed) {
            $bp = Join-Path $backupRoot (([string]$e.backup) -replace '/', '\')
            if (Test-Path -LiteralPath $bp) {
                if (-not $DryRun) { Copy-Item -LiteralPath $bp -Destination $t -Force }
                & $Log (T 'log.restored' @($tag, $t))
            } else { & $Log (T 'log.nobackup' @($tag, $t)); [void]$skipped.Add($e) }
        } elseif (Test-Path -LiteralPath $t) {
            if (-not $DryRun) { Remove-Item -LiteralPath $t -Force }
            & $Log (T 'log.deleted' @($tag, $t))
        }
    }

    # Logs the scripts write while running
    foreach ($n in 'memlog.txt', 'memlog.txt.old') {
        $p = Join-Path $ProfileDir "chrome\$n"
        if (Test-Path -LiteralPath $p) { if (-not $DryRun) { Remove-Item -LiteralPath $p -Force }; & $Log (T 'log.logdeleted' @($tag, $p)) }
    }

    # Folders this installer created: only if empty, innermost first
    foreach ($d in @($m.createdDirs | Sort-Object { $_.Length } -Descending)) {
        if ((Test-Path -LiteralPath $d) -and -not (Get-ChildItem -LiteralPath $d -Force | Select-Object -First 1)) {
            if (-not $DryRun) { Remove-Item -LiteralPath $d -Force }
            & $Log (T 'log.dirdeleted' @($tag, $d))
        } elseif (Test-Path -LiteralPath $d) { & $Log (T 'log.dirkept' @($tag, $d)) }
    }

    if ($RemovePrefs) {
        $pj = Join-Path $ProfileDir 'prefs.js'
        if (Test-Path -LiteralPath $pj) {
            $lines = [IO.File]::ReadAllLines($pj, $Utf8)
            $keep = @($lines | Where-Object { $_ -notmatch '^\s*user_pref\("extensions\.(translate-lite|deepl-lite|toggle-manager)\.' })
            $n = $lines.Count - $keep.Count
            if ($n -gt 0 -and -not $DryRun) { [IO.File]::WriteAllLines($pj, $keep, $Utf8) }
            & $Log (T 'log.prefs' @($tag, $n))
        }
    }

    if ($skipped.Count) {
        if (-not $DryRun) { $m.files = $skipped; Save-Manifest $ProfileDir $m }
        & $Log (T 'log.skipped' @($tag, $skipped.Count))
    }
    elseif ($KeepBackup) { & $Log (T 'log.backupkept' @($tag, $backupRoot)) }
    else {
        if (-not $DryRun) { Remove-Item -LiteralPath $backupRoot -Recurse -Force }
        & $Log (T 'log.backupremoved' @($tag, $backupRoot))
    }
    & $Log (T 'log.done.uninstall' @($tag))
    return [pscustomobject]@{ Skipped = $skipped.Count }
}

function Remove-ScriptFile {
    if (-not $ScriptPath -or -not (Test-Path -LiteralPath $ScriptPath)) { return }
    # A running script may not delete itself: a separate hidden process deletes it after a short delay
    Start-Process -WindowStyle Hidden -FilePath cmd.exe -ArgumentList "/c ping 127.0.0.1 -n 3 >nul & del /f /q `"$ScriptPath`""
}

# ----------------------------------------------------------------------------------------------------------------
# Settings engine: schema (settings.json), read / write values in the installed files
#   kinds: css (a --variable in userChrome.css), js (KEY: value in a .uc.js), pref (user_pref in prefs.js),
#          toggle (a region of userChrome.css between "@ft:begin ID" and "@ft:end ID" markers, switched off by commenting out)
# ----------------------------------------------------------------------------------------------------------------
function Get-Schema([string]$Ref_) {
    if ($ScriptDir -and (Test-Path -LiteralPath (Join-Path $ScriptDir 'settings.json'))) {
        return [IO.File]::ReadAllText((Join-Path $ScriptDir 'settings.json'), $Utf8) | ConvertFrom-Json
    }
    [Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12
    $r = Invoke-WebRequest -UseBasicParsing -Uri "https://raw.githubusercontent.com/$RepoOwner/$RepoName/$Ref_/install-scripts/settings.json"
    return $Utf8.GetString($r.RawContentStream.ToArray()) | ConvertFrom-Json
}

function Get-SettingText($Obj, [string]$Lang_) { $x = $Obj.$Lang_; if ($null -eq $x) { $x = $Obj.en }; return $x }

function New-RegexObj([string]$Pattern) { return New-Object System.Text.RegularExpressions.Regex($Pattern) }

function Get-SettingRegex($s) {
    switch ($s.kind) {
        'css'    { return New-RegexObj ('(?<pre>(?<![\w-])' + [regex]::Escape($s.key) + '\s*:\s*)(?<v>-?\d*\.?\d+(?:px|vw|em|s|%)?)(?<post>\s*;)') }
        'js'     { return New-RegexObj ('(?m)^(?<pre>[ \t]*' + [regex]::Escape($s.key) + '[ \t]*:[ \t]*)(?<v>''[^''\r\n]*''|"[^"\r\n]*"|true|false|-?\d+(?:\.\d+)?)') }
        'pref'   { return New-RegexObj ('(?m)^user_pref\("' + [regex]::Escape($s.key) + '",\s*(?<v>.*?)\);[ \t]*(?:\r?\n|$)') }
        'toggle' { return New-RegexObj ('(?s)(?<b>/\* @ft:begin ' + [regex]::Escape($s.key) + ' \*/\r?\n)(?<body>.*?)(?<e>\r?\n/\* @ft:end ' + [regex]::Escape($s.key) + ' \*/)') }
    }
}

# Returns @{ Found; Value } where Value is typed: [bool] / [double] / [int] / [string]
function Read-SettingValue([string]$Text, $s) {
    if ($null -eq $Text) { return @{ Found = $false; Value = $null } }
    $m = (Get-SettingRegex $s).Match($Text)
    if (-not $m.Success) { return @{ Found = $false; Value = $null } }
    if ($s.kind -eq 'toggle') { return @{ Found = $true; Value = (-not $m.Groups['body'].Value.StartsWith('/*@ft:off')) } }
    $raw = $m.Groups['v'].Value.Trim()
    switch ($s.type) {
        'bool'   { return @{ Found = $true; Value = ($raw -eq 'true') } }
        'int'    { return @{ Found = $true; Value = [int][double]::Parse($raw, $Inv) } }
        'number' {
            $num = $raw -replace '(?i)(px|vw|em|%|s)$', ''
            return @{ Found = $true; Value = [double]::Parse($num, $Inv) }
        }
        default {
            if ($raw.Length -ge 2 -and ($raw[0] -eq '"' -or $raw[0] -eq "'")) {
                $raw = $raw.Substring(1, $raw.Length - 2)
                if ($s.kind -eq 'pref') { $raw = $raw -replace '\\(["\\])', '$1' } else { $raw = $raw -replace '\\([''\\])', '$1' }
            }
            return @{ Found = $true; Value = $raw }
        }
    }
}

function Format-SettingValue($s, $Value) {
    switch ($s.type) {
        'bool'   { return $(if ($Value) { 'true' } else { 'false' }) }
        'int'    { return ([int]$Value).ToString($Inv) }
        'number' { return ([double]$Value).ToString('0.####', $Inv) + $(if ($s.unit) { $s.unit } else { '' }) }
        default {
            $v = [string]$Value
            if ($s.kind -eq 'pref') { return '"' + ($v -replace '(["\\])', '\$1') + '"' }
            return "'" + ($v -replace '([''\\])', '\$1') + "'"
        }
    }
}

# Returns the new text, or $null if the setting cannot be found in the text
function Write-SettingValue([string]$Text, $s, $Value) {
    $re = Get-SettingRegex $s
    $m = $re.Match($Text)
    if ($s.kind -eq 'toggle') {
        if (-not $m.Success) { return $null }
        $nl = if ($Text.Contains("`r`n")) { "`r`n" } else { "`n" }
        $body = $m.Groups['body'].Value
        $isOff = $body.StartsWith('/*@ft:off')
        if ([bool]$Value -eq (-not $isOff)) { return $Text }
        if ($Value) {
            $inner = $body.Substring(('/*@ft:off' + $nl).Length)
            $inner = $inner.Substring(0, $inner.Length - ($nl + '@ft:off*/').Length)
            $new = $inner.Replace('*\/', '*/').Replace('/\*', '/*')
        } else {
            $new = '/*@ft:off' + $nl + $body.Replace('*/', '*\/').Replace('/*', '/\*') + $nl + '@ft:off*/'
        }
        return $Text.Substring(0, $m.Groups['body'].Index) + $new + $Text.Substring($m.Groups['body'].Index + $m.Groups['body'].Length)
    }
    # Same value as now: leave the text untouched (keeps the file's own formatting, e.g. ".14s")
    $curVal = Read-SettingValue $Text $s
    if ($curVal.Found) {
        $same = if ($s.type -eq 'number') { [math]::Abs([double]$curVal.Value - [double]$Value) -lt 1e-9 } else { "$($curVal.Value)" -eq "$Value" }
        if ($same) { return $Text }
    }
    $fmt = Format-SettingValue $s $Value
    if ($s.kind -eq 'pref') {
        $line = 'user_pref("' + $s.key + '", ' + $fmt + ');'
        if ($m.Success) {
            $tail = if ($m.Value.EndsWith("`n")) { $m.Value.Substring($m.Value.TrimEnd("`r", "`n").Length) } else { '' }
            return $Text.Substring(0, $m.Index) + $line + $tail + $Text.Substring($m.Index + $m.Length)
        }
        $nl = if ($Text.Contains("`r`n")) { "`r`n" } else { "`n" }
        if ($Text.Length -and -not $Text.EndsWith("`n")) { $Text += $nl }
        return $Text + $line + $nl
    }
    if (-not $m.Success) { return $null }
    $g = $m.Groups['v']
    return $Text.Substring(0, $g.Index) + $fmt + $Text.Substring($g.Index + $g.Length)
}

function Get-GroupPath([string]$ProfileDir, $Group) { return Join-Path $ProfileDir ($Group.file -replace '/', '\') }

function Read-FileText([string]$Path) { if (Test-Path -LiteralPath $Path) { return [IO.File]::ReadAllText($Path, $Utf8) } else { return $null } }

# Current values of all settings of a group: id -> @{ Found; Value }
function Get-GroupValues([string]$ProfileDir, $Group) {
    $text = Read-FileText (Get-GroupPath $ProfileDir $Group)
    $r = @{}
    foreach ($s in $Group.settings) { $r[$s.id] = Read-SettingValue $text $s }
    return $r
}

# Changes: list of @{ Setting; Value }. Writes each touched file once; keeps the manifest hash in sync.
function Save-Settings {
    param([string]$ProfileDir, $Schema, $Changes, [switch]$DryRun, [scriptblock]$Log)
    $tag = if ($DryRun) { T 'tag.dry' } else { '' }
    $manifest = Read-Manifest $ProfileDir
    $manifestDirty = $false
    $saved = 0
    foreach ($g in $Schema.groups) {
        $mine = @($Changes | Where-Object { $sid = $_.Setting.id; [bool]($g.settings | Where-Object { $_.id -eq $sid }) })
        if (-not $mine.Count) { continue }
        $path = Get-GroupPath $ProfileDir $g
        $text = Read-FileText $path
        if ($null -eq $text -and $g.file -ne 'prefs.js') { & $Log (T 'log.set.notinstalled' @($tag, $g.file)); continue }
        if ($null -eq $text) { $text = '' }
        $orig = $text
        foreach ($c in $mine) {
            $new = Write-SettingValue $text $c.Setting $c.Value
            if ($null -eq $new) { & $Log (T 'log.set.nomarker' @($tag, $c.Setting.id, $g.file)); continue }
            $text = $new; $saved++
            & $Log (T 'log.set' @($tag, $c.Setting.id, (Format-SettingValue $c.Setting $c.Value)))
        }
        if ($text -ne $orig -and -not $DryRun) {
            if ($g.file -eq 'prefs.js' -and (Test-Path -LiteralPath $path)) {
                $bk = Join-Path (Get-BackupRoot $ProfileDir) 'prefs.js.before-settings'
                if (-not (Test-Path -LiteralPath $bk)) {
                    New-Item -ItemType Directory -Path (Split-Path -Parent $bk) -Force | Out-Null
                    Copy-Item -LiteralPath $path -Destination $bk -Force
                    & $Log (T 'log.set.prefsbackup' @($tag))
                }
            }
            [IO.File]::WriteAllText($path, $text, $Utf8)
            if ($manifest) {
                $e = $manifest.files | Where-Object { $_.target -eq $path } | Select-Object -First 1
                if ($e) { $e.sha = (Get-FileHash -Algorithm SHA256 -LiteralPath $path).Hash; $manifestDirty = $true }
            }
        }
    }
    if ($manifestDirty) { Save-Manifest $ProfileDir $manifest }
    if ($saved) { & $Log (T 'log.set.done' @($tag)) } else { & $Log (T 'log.set.nochange') }
}

# Check that the schema defaults match the repo's own files (run: -Mode CheckSchema)
function Test-Schema([string]$Root, $Schema, [scriptblock]$Log) {
    $bad = 0; $n = 0
    $tlText = Read-FileText (Join-Path $Root 'profile\chrome\translate.uc.js')
    foreach ($g in $Schema.groups) {
        $text = if ($g.file -eq 'prefs.js') { $null } else { Read-FileText (Join-Path $Root ('profile\' + ($g.file -replace '/', '\'))) }
        foreach ($s in $g.settings) {
            $n++
            if ($s.kind -eq 'pref') {
                $short = $s.key -replace '^extensions\.translate-lite\.', ''
                $m = [regex]::Match($tlText, 'defaults\.set(?:String|Int|Bool)Pref\(''' + [regex]::Escape($short) + ''',\s*(?<v>[^)]+)\)')
                if (-not $m.Success) { & $Log (T 'chk.missing' @($s.id)); $bad++; continue }
                $raw = $m.Groups['v'].Value.Trim()
                $val = switch ($s.type) { 'bool' { $raw -eq 'true' } 'int' { [int]$raw } default { $raw.Trim("'") } }
            } else {
                $r = Read-SettingValue $text $s
                if (-not $r.Found) { & $Log (T 'chk.missing' @($s.id)); $bad++; continue }
                $val = $r.Value
            }
            $same = if ($s.type -eq 'number') { [math]::Abs([double]$val - [double]$s.default) -lt 1e-9 } else { "$val" -eq "$($s.default)" }
            if (-not $same) { & $Log (T 'chk.bad' @($s.id, $s.default, $val)); $bad++ }
        }
    }
    if (-not $bad) { & $Log (T 'chk.ok' @($n)) }
    return $bad
}

function ConvertTo-TypedValue($s, [string]$Text) {
    try {
        switch ($s.type) {
            'bool'   { if ($Text -match '^(true|1|on|yes)$') { return $true } elseif ($Text -match '^(false|0|off|no)$') { return $false } else { throw 'bool' } }
            'int'    { return [int]$Text }
            'number' { return [double]::Parse($Text, $Inv) }
            'enum'   { if (-not ($s.options | Where-Object { $_.v -eq $Text })) { throw 'enum' }; return $Text }
            default  { return $Text }
        }
    } catch { throw (T 'err.setvalue' @($s.id, $Text)) }
}

# ----------------------------------------------------------------------------------------------------------------
# Command line mode
# ----------------------------------------------------------------------------------------------------------------
function Invoke-Cli {
    $log = { param($s) Write-Host $s }
    if ($Mode -eq 'CheckSchema') {
        $root = if ($SourceRoot) { $SourceRoot } else { Find-LocalRoot }
        if (-not $root) { throw (T 'err.nolocal') }
        $bad = Test-Schema $root (Get-Schema $Ref) $log
        if ($bad) { exit 1 } else { return }
    }
    if (-not $ProfileDir -or -not (Test-Path -LiteralPath $ProfileDir)) { throw (T 'err.prdir') }
    if ($Mode -eq 'Get') {
        $schema = Get-Schema $Ref
        foreach ($g in $schema.groups) {
            $vals = Get-GroupValues $ProfileDir $g
            foreach ($s in $g.settings) {
                $v = $vals[$s.id]
                $shown = if ($v.Found) { Format-SettingValue $s $v.Value } else { '(not set)' }
                Write-Host ("{0} = {1}   (default {2})" -f $s.id, $shown, (Format-SettingValue $s $s.default))
            }
        }
        return
    }
    if (Test-FirefoxRunning $FirefoxDir $ProfileDir) { throw (T 'err.running') }
    if ($Mode -eq 'Set') {
        $schema = Get-Schema $Ref
        $all = @(); foreach ($g in $schema.groups) { $all += $g.settings }
        $changes = @()
        foreach ($item in @($Setting | ForEach-Object { $_ -split ';' } | Where-Object { $_ })) {
            if ($item -notmatch '^\s*([^=]+?)\s*=\s*(.*)$') { throw (T 'err.setparse' @($item)) }
            $id = $Matches[1]; $val = $Matches[2]
            $s = $all | Where-Object { $_.id -eq $id } | Select-Object -First 1
            if (-not $s) { throw (T 'err.setunknown' @($id)) }
            $changes += [pscustomobject]@{ Setting = $s; Value = (ConvertTo-TypedValue $s $val) }
        }
        Save-Settings -ProfileDir $ProfileDir -Schema $schema -Changes $changes -DryRun:$DryRun -Log $log
        return
    }
    if (-not (Test-FirefoxDir $FirefoxDir)) { throw (T 'err.fxdir') }
    if ($Mode -eq 'Install') {
        $ids = if ($Components) { @($Components | ForEach-Object { $_ -split ',' } | Where-Object { $_ }) } else { $ComponentIds }
        $src = Resolve-Source $Source $Ref $log
        try { Install-Tweaks -Root $src.Root -SourceKind $src.Kind -FirefoxDir $FirefoxDir -ProfileDir $ProfileDir -Ids $ids -DryRun:$DryRun -Log $log }
        finally { if ($src.Temp) { Remove-Item -LiteralPath $src.Temp -Recurse -Force -ErrorAction SilentlyContinue } }
    }
    else {
        $confirm = { param($p) [bool]$Force }
        $r = Uninstall-Tweaks -ProfileDir $ProfileDir -DryRun:$DryRun -KeepBackup:$KeepBackup -RemovePrefs:$RemovePrefs -Log $log -OnModified $confirm
        if ($DeleteScript -and -not $DryRun -and $r.Skipped -eq 0) { Remove-ScriptFile }
    }
}

# ----------------------------------------------------------------------------------------------------------------
# Window
# ----------------------------------------------------------------------------------------------------------------
function Show-Gui {
    Add-Type -AssemblyName System.Windows.Forms
    Add-Type -AssemblyName System.Drawing
    [Windows.Forms.Application]::EnableVisualStyles()
    $WF = 'System.Windows.Forms'

    $font = New-Object Drawing.Font('Segoe UI', 9.5)
    $bold = New-Object Drawing.Font('Segoe UI Semibold', 9.5)
    $mono = New-Object Drawing.Font('Consolas', 9)
    $muted = [Drawing.Color]::FromArgb(110, 110, 110)

    $form = New-Object Windows.Forms.Form
    $form.ClientSize = New-Object Drawing.Size(780, 900)
    $form.StartPosition = 'CenterScreen'
    $form.FormBorderStyle = 'FixedSingle'; $form.MaximizeBox = $false
    $form.Font = $font
    $form.BackColor = [Drawing.Color]::FromArgb(248, 248, 250)

    $loc = New-Object System.Collections.ArrayList          # @{ C = control; K = string key } : re-texted when the language changes
    $reg = { param($c, $k) [void]$loc.Add(@{ C = $c; K = $k }); $c.Text = T $k }
    $new = {
        param($parent, $type, $x, $y, $w, $h)
        $c = New-Object "$WF.$type"
        $c.Location = New-Object Drawing.Point($x, $y); $c.Size = New-Object Drawing.Size($w, $h)
        $parent.Controls.Add($c); return $c
    }

    $title = & $new $form Label 20 12 480 28; $title.Font = New-Object Drawing.Font('Segoe UI Semibold', 15); $title.Text = 'Firefox-Tweaks'
    $sub = & $new $form Label 20 42 600 22; $sub.ForeColor = $muted; & $reg $sub 'gui.sub'
    $lbLang = & $new $form Label 640 14 60 22; $lbLang.TextAlign = 'MiddleRight'; & $reg $lbLang 'lang.label'
    $cbLang = & $new $form ComboBox 704 12 66 26; $cbLang.DropDownStyle = 'DropDownList'
    [void]$cbLang.Items.Add('EN'); [void]$cbLang.Items.Add('TR')
    $cbLang.SelectedIndex = if ($script:CurLang -eq 'tr') { 1 } else { 0 }

    $tabs = & $new $form TabControl 10 72 760 818
    $pgInstall = New-Object Windows.Forms.TabPage; $pgInstall.BackColor = $form.BackColor; $tabs.TabPages.Add($pgInstall)
    $pgSet = New-Object Windows.Forms.TabPage; $pgSet.BackColor = $form.BackColor; $tabs.TabPages.Add($pgSet)

    $group = { param($parent, $x, $y, $w, $h) $g = & $new $parent GroupBox $x $y $w $h; $g.Font = $bold; return $g }
    $inG = { param($g, $type, $x, $y, $w, $h) $c = & $new $g $type $x $y $w $h; $c.Font = $font; return $c }

    # ---------------- Install tab ----------------
    $gFx = & $group $pgInstall 12 10 730 82; & $reg $gFx 'fx.group'
    $tbFx = & $inG $gFx TextBox 14 28 590 26
    $btFx = & $inG $gFx Button 612 26 104 28; & $reg $btFx 'fx.browse'
    $lbFx = & $inG $gFx Label 14 56 700 20; $lbFx.ForeColor = $muted

    $gPr = & $group $pgInstall 12 98 730 128; & $reg $gPr 'pr.group'
    $cbPr = & $inG $gPr ComboBox 14 28 590 26; $cbPr.DropDownStyle = 'DropDownList'
    $btPr = & $inG $gPr Button 612 26 104 28; & $reg $btPr 'pr.other'
    $lbPr = & $inG $gPr Label 14 58 700 20; $lbPr.ForeColor = $muted
    $ckPr = & $inG $gPr CheckBox 14 90 700 26; & $reg $ckPr 'pr.confirm'

    $gSrc = & $group $pgInstall 12 232 730 66; & $reg $gSrc 'src.group'
    $rbLocal = & $inG $gSrc RadioButton 14 28 280 24; & $reg $rbLocal 'src.rb.local'
    $rbRepo = & $inG $gSrc RadioButton 300 28 250 24; & $reg $rbRepo 'src.rb.repo'
    $tbRef = & $inG $gSrc TextBox 556 26 120 26; $tbRef.Text = $Ref
    $hasLocal = [bool](Find-LocalRoot)
    $rbLocal.Enabled = $hasLocal
    if ($hasLocal) { $rbLocal.Checked = $true } else { $rbRepo.Checked = $true }
    $tbRef.Enabled = $rbRepo.Checked
    $rbRepo.Add_CheckedChanged({ $tbRef.Enabled = $rbRepo.Checked })

    $gCo = & $group $pgInstall 12 304 730 176; & $reg $gCo 'co.group'
    $clb = & $inG $gCo CheckedListBox 14 26 700 140; $clb.CheckOnClick = $true; $clb.BorderStyle = 'None'; $clb.BackColor = $form.BackColor
    foreach ($id in $ComponentIds) { [void]$clb.Items.Add((T "comp.$id"), $true) }

    $gUn = & $group $pgInstall 12 486 730 92; & $reg $gUn 'un.group'
    $ckKeep = & $inG $gUn CheckBox 14 26 700 24; & $reg $ckKeep 'un.keep'
    $ckPref = & $inG $gUn CheckBox 14 52 440 24; & $reg $ckPref 'un.prefs'
    $ckDry = & $inG $gUn CheckBox 470 52 250 24; & $reg $ckDry 'un.dry'

    $btInstall = & $new $pgInstall Button 12 590 150 36; $btInstall.Font = $bold; & $reg $btInstall 'btn.install'
    $btUninstall = & $new $pgInstall Button 170 590 150 36; $btUninstall.Font = $bold; & $reg $btUninstall 'btn.uninstall'
    $lbStatus = & $new $pgInstall Label 330 590 412 36; $lbStatus.TextAlign = 'MiddleLeft'
    $tbLog = & $new $pgInstall TextBox 12 636 730 150; $tbLog.Multiline = $true; $tbLog.ReadOnly = $true; $tbLog.ScrollBars = 'Vertical'; $tbLog.Font = $mono

    # ---------------- Settings tab ----------------
    $lbSetProfile = & $new $pgSet Label 12 8 730 22; $lbSetProfile.ForeColor = $muted
    $lbGroups = & $new $pgSet ListBox 12 36 210 640; $lbGroups.IntegralHeight = $false
    $pnl = & $new $pgSet Panel 232 36 510 640; $pnl.AutoScroll = $true; $pnl.BackColor = [Drawing.Color]::White; $pnl.BorderStyle = 'FixedSingle'
    $btSave = & $new $pgSet Button 232 686 150 34; $btSave.Font = $bold; & $reg $btSave 'set.save'
    $btRevert = & $new $pgSet Button 390 686 110 34; & $reg $btRevert 'set.revert'
    $btOpen = & $new $pgSet Button 508 686 130 34; & $reg $btOpen 'set.open'
    $lbSetStatus = & $new $pgSet Label 12 730 730 22; $lbSetStatus.ForeColor = $muted
    $tbSetLog = & $new $pgSet TextBox 12 754 730 36; $tbSetLog.Multiline = $true; $tbSetLog.ReadOnly = $true; $tbSetLog.ScrollBars = 'Vertical'; $tbSetLog.Font = $mono

    $state = @{ Profiles = @(); Busy = $false; ProfilePath = $null; Schema = $null; Group = $null; Rows = @{}; Extra = $null }
    $writeLog = { param($s) $tbLog.AppendText($s + [Environment]::NewLine); [Windows.Forms.Application]::DoEvents() }
    $writeSetLog = { param($s) $tbSetLog.AppendText($s + [Environment]::NewLine); [Windows.Forms.Application]::DoEvents() }

    # ---------------- Settings tab: build rows ----------------
    $ensureSchema = {
        if (-not $state.Schema) { try { $state.Schema = Get-Schema $tbRef.Text.Trim() } catch { & $writeSetLog ('ERROR: ' + $_.Exception.Message) } }
        return $state.Schema
    }
    $countChanged = {
        $n = 0
        foreach ($id in $state.Rows.Keys) { $r = $state.Rows[$id]; if (-not (& $r.IsSame)) { $n++ } }
        return $n
    }
    $updateSetStatus = {
        $n = & $countChanged
        $lbSetStatus.Text = if ($n) { T 'set.changed' @($n) } else { T 'set.clean' }
        if ($btSave) { $btSave.Enabled = [bool]($n -and $state.SetReady) }
    }
    $buildRows = {
        $pnl.SuspendLayout()
        $pnl.Controls.Clear(); $state.Rows = @{}
        $g = $state.Group
        if (-not $g) {
            $l = New-Object Windows.Forms.Label; $l.Text = T 'set.pickgroup'; $l.ForeColor = $muted; $l.AutoSize = $true; $l.Location = New-Object Drawing.Point(14, 14); $pnl.Controls.Add($l)
            $pnl.ResumeLayout(); return
        }
        $pp = $state.ProfilePath
        $path = if ($pp) { Get-GroupPath $pp $g } else { $null }
        $installed = [bool]($path -and ((Test-Path -LiteralPath $path) -or $g.file -eq 'prefs.js'))
        $vals = if ($installed) { Get-GroupValues $pp $g } else { @{} }
        $y = 12; $w = 470
        $addLabel = {
            param($text, $f, $color, $x, $yy, $ww)
            $l = New-Object Windows.Forms.Label; $l.Font = $f; $l.ForeColor = $color; $l.AutoSize = $true; $l.MaximumSize = New-Object Drawing.Size($ww, 0)
            $l.Text = $text; $l.Location = New-Object Drawing.Point($x, $yy); $pnl.Controls.Add($l); return $l
        }
        if (-not $installed) { $l = & $addLabel (T 'set.notinstalled') $bold ([Drawing.Color]::Firebrick) 14 $y $w; $y += $l.PreferredHeight + 10 }
        if ($g.note) { $l = & $addLabel (Get-SettingText $g.note $script:CurLang) $font $muted 14 $y $w; $y += $l.PreferredHeight + 10 }
        foreach ($s in $g.settings) {
            $tx = Get-SettingText $s $script:CurLang
            $cur = $vals[$s.id]
            $value = if ($cur -and $cur.Found) { $cur.Value } else { $s.default }
            $row = @{ Setting = $s }
            $ctl = $null
            if ($s.type -eq 'bool') {
                $ctl = New-Object Windows.Forms.CheckBox; $ctl.Text = $tx.label; $ctl.Font = $bold; $ctl.AutoSize = $false
                $ctl.Size = New-Object Drawing.Size($w, 24); $ctl.Location = New-Object Drawing.Point(14, $y); $ctl.Checked = [bool]$value; $ctl.Enabled = $installed
                $pnl.Controls.Add($ctl); $y += 28
                $row.Get = { $ctl.Checked }.GetNewClosure(); $row.Set = { param($v) $ctl.Checked = [bool]$v }.GetNewClosure()
                $ctl.Add_CheckedChanged({ & $updateSetStatus })
            } else {
                $l = & $addLabel $tx.label $bold ([Drawing.SystemColors]::ControlText) 14 $y $w; $y += $l.PreferredHeight + 4
            }
            if ($tx.desc) { $l = & $addLabel $tx.desc $font $muted 14 $y $w; $y += $l.PreferredHeight + 4 }
            if ($tx.diagram) { $l = & $addLabel $tx.diagram $mono ([Drawing.Color]::FromArgb(70, 70, 70)) 22 $y ($w - 8); $y += $l.PreferredHeight + 6 }
            if ($s.type -in 'int', 'number') {
                $ctl = New-Object Windows.Forms.NumericUpDown; $ctl.Size = New-Object Drawing.Size(110, 26); $ctl.Location = New-Object Drawing.Point(14, $y)
                $ctl.DecimalPlaces = if ($s.type -eq 'int') { 0 } elseif ($s.step -lt 0.05) { 3 } else { 2 }
                $ctl.Minimum = [decimal]$s.min; $ctl.Maximum = [decimal]$s.max; $ctl.Increment = [decimal]$s.step
                $ctl.Value = [math]::Min([decimal]$s.max, [math]::Max([decimal]$s.min, [decimal]$value))
                $ctl.Enabled = $installed; $pnl.Controls.Add($ctl)
                if ($s.unit) { $null = & $addLabel $s.unit $font $muted 130 ($y + 3) 40 }
                $isInt = ($s.type -eq 'int')
                $row.Get = { if ($isInt) { [int]$ctl.Value } else { [double]$ctl.Value } }.GetNewClosure()
                $row.Set = { param($v) $ctl.Value = [math]::Min($ctl.Maximum, [math]::Max($ctl.Minimum, [decimal]$v)) }.GetNewClosure()
                $ctl.Add_ValueChanged({ & $updateSetStatus })
                $y += 32
            }
            elseif ($s.type -eq 'enum') {
                $ctl = New-Object Windows.Forms.ComboBox; $ctl.DropDownStyle = 'DropDownList'; $ctl.Size = New-Object Drawing.Size(280, 26); $ctl.Location = New-Object Drawing.Point(14, $y)
                $idx = -1; $i = 0
                foreach ($o in $s.options) { [void]$ctl.Items.Add((Get-SettingText $o $script:CurLang)); if ($o.v -eq "$value") { $idx = $i }; $i++ }
                if ($idx -lt 0) { [void]$ctl.Items.Add("$value"); $idx = $ctl.Items.Count - 1 }
                $ctl.SelectedIndex = $idx; $ctl.Enabled = $installed; $pnl.Controls.Add($ctl)
                $opts = @($s.options)
                $row.Get = { $i = $ctl.SelectedIndex; if ($i -lt $opts.Count) { $opts[$i].v } else { $ctl.Text } }.GetNewClosure()
                $row.Set = { param($v) for ($j = 0; $j -lt $opts.Count; $j++) { if ($opts[$j].v -eq "$v") { $ctl.SelectedIndex = $j } } }.GetNewClosure()
                $ctl.Add_SelectedIndexChanged({ & $updateSetStatus })
                $y += 32
            }
            elseif ($s.type -in 'secret', 'text') {
                $ctl = New-Object Windows.Forms.TextBox; $ctl.Size = New-Object Drawing.Size(300, 26); $ctl.Location = New-Object Drawing.Point(14, $y); $ctl.Text = "$value"; $ctl.Enabled = $installed
                if ($s.type -eq 'secret') {
                    $ctl.UseSystemPasswordChar = $true
                    $show = New-Object Windows.Forms.CheckBox; $show.Text = T 'set.show'; $show.AutoSize = $true; $show.Location = New-Object Drawing.Point(322, ($y + 2))
                    $show.Add_CheckedChanged({ $ctl.UseSystemPasswordChar = -not $show.Checked }.GetNewClosure()); $pnl.Controls.Add($show)
                }
                $pnl.Controls.Add($ctl)
                $row.Get = { $ctl.Text }.GetNewClosure(); $row.Set = { param($v) $ctl.Text = "$v" }.GetNewClosure()
                $ctl.Add_TextChanged({ & $updateSetStatus })
                $y += 32
            }
            # reset-to-default link
            $def = Format-SettingValue $s $s.default
            if ($s.type -eq 'bool') { $def = if ($s.default) { T 'set.on' } else { T 'set.off' } }
            elseif ($s.type -eq 'enum') { $o = $s.options | Where-Object { $_.v -eq "$($s.default)" } | Select-Object -First 1; if ($o) { $def = Get-SettingText $o $script:CurLang } }
            elseif ($s.type -eq 'secret') { $def = '-' }
            $lk = New-Object Windows.Forms.LinkLabel; $lk.Text = T 'set.reset' @($def); $lk.AutoSize = $true; $lk.Font = New-Object Drawing.Font('Segoe UI', 8.5)
            $lk.Location = New-Object Drawing.Point(14, $y); $lk.Enabled = $installed; $pnl.Controls.Add($lk)
            $defVal = $s.default; $setter = $row.Set
            $lk.Add_LinkClicked({ & $setter $defVal }.GetNewClosure())
            $y += 26
            $sep = New-Object Windows.Forms.Label; $sep.BorderStyle = 'Fixed3D'; $sep.Size = New-Object Drawing.Size($w, 2); $sep.Location = New-Object Drawing.Point(14, $y); $pnl.Controls.Add($sep)
            $y += 12
            $orig = $value; $get = $row.Get; $isNum = ($s.type -eq 'number')
            $row.IsSame = { $c = & $get; if ($isNum) { [math]::Abs([double]$c - [double]$orig) -lt 1e-9 } else { "$c" -eq "$orig" } }.GetNewClosure()
            $state.Rows[$s.id] = $row
        }
        $pnl.ResumeLayout()
        & $updateSetStatus
    }

    # ---------------- refresh: enable / disable by state ----------------
    $refresh = {
        $fxDir = $tbFx.Text.Trim()
        $okFx = Test-FirefoxDir $fxDir
        $lbFx.Text = if ($okFx) { T 'fx.ok' } elseif ($fxDir) { T 'fx.bad' } else { T 'fx.pick' }
        $lbFx.ForeColor = if ($okFx) { $muted } else { [Drawing.Color]::Firebrick }
        $pp = $state.ProfilePath
        $okPr = [bool]($pp -and (Test-Path -LiteralPath $pp))
        $isDef = [bool]($state.Profiles | Where-Object { $_.Path -ieq $pp -and $_.IsDefault })
        $lbPr.Text = if (-not $okPr) { T 'pr.pick' } elseif ($isDef) { T 'pr.isdefault' } else { T 'pr.notdefault' }
        $lbPr.ForeColor = if ($okPr -and -not $isDef) { [Drawing.Color]::DarkOrange } else { $muted }
        $running = $okPr -and (Test-FirefoxRunning $fxDir $pp)
        $hasManifest = $okPr -and (Test-Path -LiteralPath (Get-ManifestPath $pp))
        $ready = $okFx -and $okPr -and $ckPr.Checked -and -not $running -and -not $state.Busy
        $btInstall.Enabled = $ready
        $btUninstall.Enabled = $ready -and $hasManifest
        $lbStatus.Text = if ($state.Busy) { T 'st.busy' }
                         elseif ($running) { T 'st.running' }
                         elseif (-not ($okFx -and $okPr)) { '' }
                         elseif (-not $ckPr.Checked) { T 'st.confirm' }
                         elseif ($hasManifest) { T 'st.has' }
                         else { T 'st.none' }
        $lbStatus.ForeColor = if ($running) { [Drawing.Color]::Firebrick } else { $muted }
        # settings tab
        $lbSetProfile.Text = T 'set.profile' @($(if ($pp) { $pp } else { '-' }))
        $state.SetReady = [bool]($okPr -and $ckPr.Checked -and -not $running -and -not $state.Busy -and $state.Group)
        $btRevert.Enabled = [bool]$state.Group
        $btOpen.Enabled = [bool]($state.Group -and $state.Group.file -ne 'prefs.js' -and $pp -and (Test-Path -LiteralPath (Get-GroupPath $pp $state.Group)))
        $btSave.Enabled = [bool]($state.SetReady -and (& $countChanged))
        if ($okPr -and -not $ckPr.Checked) { $tbSetLog.Text = T 'set.needconfirm' } elseif ($running) { $tbSetLog.Text = T 'set.running' }
    }

    # ---------------- language ----------------
    $applyLang = {
        $form.Text = T 'gui.title'
        foreach ($e in $loc) { $e.C.Text = T $e.K }
        $tabs.TabPages[0].Text = T 'tab.install'; $tabs.TabPages[1].Text = T 'tab.settings'
        for ($i = 0; $i -lt $ComponentIds.Count; $i++) { $chk = $clb.GetItemChecked($i); $clb.Items[$i] = (T ('comp.' + $ComponentIds[$i])); $clb.SetItemChecked($i, $chk) }
        $sel = $lbGroups.SelectedIndex
        $lbGroups.Items.Clear()
        if ($state.Schema) { foreach ($g in $state.Schema.groups) { [void]$lbGroups.Items.Add((Get-SettingText $g.title $script:CurLang)) } }
        if ($sel -ge 0 -and $sel -lt $lbGroups.Items.Count) { $lbGroups.SelectedIndex = $sel }
        $state.Busy = $true   # avoid re-entrancy from SelectedIndexChanged while rebuilding the profile list
        $keep = $cbPr.SelectedIndex
        $cbPr.Items.Clear()
        foreach ($p in $state.Profiles) { [void]$cbPr.Items.Add($(if ($p.IsDefault) { "$($p.Name)  $(T 'pr.default')  -  $($p.Path)" } else { "$($p.Name)  -  $($p.Path)" })) }
        if ($state.Extra) { [void]$cbPr.Items.Add("$(T 'pr.selected')  -  $($state.Extra)") }
        if ($keep -ge 0 -and $keep -lt $cbPr.Items.Count) { $cbPr.SelectedIndex = $keep }
        $state.Busy = $false
        & $buildRows
        & $refresh
    }

    # ---------------- startup values ----------------
    $fx = @(Find-FirefoxDirs)
    if ($FirefoxDir) { $tbFx.Text = $FirefoxDir } elseif ($fx.Count) { $tbFx.Text = $fx[0] }
    $state.Profiles = @(Get-FirefoxProfiles)
    if ($ProfileDir) { $state.ProfilePath = $ProfileDir; $state.Extra = $ProfileDir }
    elseif ($state.Profiles.Count) { $state.ProfilePath = $state.Profiles[0].Path }
    $null = & $ensureSchema

    $btFx.Add_Click({
        $d = New-Object Windows.Forms.FolderBrowserDialog; $d.Description = T 'dlg.fx'
        if ($d.ShowDialog() -eq 'OK') { $tbFx.Text = $d.SelectedPath }
    })
    $tbFx.Add_TextChanged({ & $refresh })
    $cbPr.Add_SelectedIndexChanged({
        if ($state.Busy) { return }
        $i = $cbPr.SelectedIndex
        if ($i -ge 0 -and $i -lt $state.Profiles.Count) { $state.ProfilePath = $state.Profiles[$i].Path } elseif ($i -ge 0 -and $state.Extra) { $state.ProfilePath = $state.Extra }
        $ckPr.Checked = $false; & $buildRows; & $refresh
    })
    $btPr.Add_Click({
        $d = New-Object Windows.Forms.FolderBrowserDialog; $d.Description = T 'dlg.pr'
        if ($d.ShowDialog() -eq 'OK') {
            $state.Extra = $d.SelectedPath; $state.ProfilePath = $d.SelectedPath
            & $applyLang
            $cbPr.SelectedIndex = $cbPr.Items.Count - 1
        }
    })
    $ckPr.Add_CheckedChanged({ & $refresh })
    $cbLang.Add_SelectedIndexChanged({ $script:CurLang = if ($cbLang.SelectedIndex -eq 1) { 'tr' } else { 'en' }; & $applyLang })
    $timer = New-Object Windows.Forms.Timer; $timer.Interval = 2000; $timer.Add_Tick({ & $refresh }); $timer.Start()

    $needAdmin = {
        param($fxDir)
        if (-not (Test-Writable $fxDir)) {
            $r = [Windows.Forms.MessageBox]::Show((T 'dlg.admin.msg' @([Environment]::NewLine, $fxDir)), (T 'dlg.admin.title'), 'YesNo', 'Warning')
            if ($r -eq 'Yes' -and $ScriptPath) {
                Start-Process -Verb RunAs -FilePath (Get-Process -Id $PID).Path -ArgumentList "-NoProfile -ExecutionPolicy Bypass -File `"$ScriptPath`" -Lang $($script:CurLang)"
                $form.Close()
            }
            return $true
        }
        return $false
    }

    $btInstall.Add_Click({
        $fxDir = $tbFx.Text.Trim(); $pp = $state.ProfilePath
        $ids = @(); for ($i = 0; $i -lt $ComponentIds.Count; $i++) { if ($clb.GetItemChecked($i)) { $ids += $ComponentIds[$i] } }
        if (-not $ids.Count) { [void][Windows.Forms.MessageBox]::Show((T 'dlg.nocomp'), (T 'btn.install')); return }
        if (-not $ckDry.Checked -and (& $needAdmin $fxDir)) { return }
        $state.Busy = $true; & $refresh; $tbLog.Clear(); $form.Cursor = 'WaitCursor'
        $src = $null
        try {
            $mode = if ($rbRepo.Checked) { 'Repo' } else { 'Local' }
            $src = Resolve-Source $mode $tbRef.Text.Trim() $writeLog
            Install-Tweaks -Root $src.Root -SourceKind $src.Kind -FirefoxDir $fxDir -ProfileDir $pp -Ids $ids -DryRun:$ckDry.Checked -Log $writeLog
        } catch { & $writeLog ('ERROR: ' + $_.Exception.Message) }
        finally {
            if ($src -and $src.Temp) { Remove-Item -LiteralPath $src.Temp -Recurse -Force -ErrorAction SilentlyContinue }
            $state.Busy = $false; $form.Cursor = 'Default'; & $buildRows; & $refresh
        }
    })

    $btUninstall.Add_Click({
        $pp = $state.ProfilePath; $nl = [Environment]::NewLine
        $msg = (T 'dlg.un.head') + $nl + (T 'dlg.un.l1') + $nl + (T 'dlg.un.l2') + $nl + (T 'dlg.un.l3') + $(if ($ckKeep.Checked) { T 'dlg.un.keep' } else { '' })
        if ($ckPref.Checked) { $msg += $nl + (T 'dlg.un.l4') }
        $msg += $nl + $nl + (T 'dlg.un.go')
        if ([Windows.Forms.MessageBox]::Show($msg, (T 'dlg.un.title'), 'YesNo', 'Question') -ne 'Yes') { return }
        if (-not $ckDry.Checked -and (& $needAdmin $tbFx.Text.Trim())) { return }
        $state.Busy = $true; & $refresh; $tbLog.Clear(); $form.Cursor = 'WaitCursor'
        $confirm = { param($p) [Windows.Forms.MessageBox]::Show((T 'dlg.mod' @([Environment]::NewLine, $p)), (T 'dlg.mod.title'), 'YesNo', 'Warning') -eq 'Yes' }
        $done = $null
        try { $done = Uninstall-Tweaks -ProfileDir $pp -DryRun:$ckDry.Checked -KeepBackup:$ckKeep.Checked -RemovePrefs:$ckPref.Checked -Log $writeLog -OnModified $confirm }
        catch { & $writeLog ('ERROR: ' + $_.Exception.Message) }
        finally { $state.Busy = $false; $form.Cursor = 'Default'; & $buildRows; & $refresh }
        if ($done -and -not $ckDry.Checked -and $done.Skipped -eq 0 -and $ScriptPath) {
            $q = [Windows.Forms.MessageBox]::Show((T 'dlg.del' @([Environment]::NewLine, $ScriptPath)), (T 'dlg.del.title'), 'YesNo', 'Question')
            if ($q -eq 'Yes') { Remove-ScriptFile; $form.Close() }
        }
    })

    # settings tab events
    $lbGroups.Add_SelectedIndexChanged({
        $i = $lbGroups.SelectedIndex
        $state.Group = if ($state.Schema -and $i -ge 0) { $state.Schema.groups[$i] } else { $null }
        & $buildRows; & $refresh
    })
    $btRevert.Add_Click({ & $buildRows; & $refresh })
    $btOpen.Add_Click({
        $p = Get-GroupPath $state.ProfilePath $state.Group
        # notepad on purpose: the default handler for .js on Windows is Windows Script Host, which would RUN the file
        Start-Process -FilePath notepad.exe -ArgumentList ('"' + $p + '"')
    })
    $btSave.Add_Click({
        $changes = @()
        foreach ($id in $state.Rows.Keys) {
            $r = $state.Rows[$id]
            if (-not (& $r.IsSame)) { $changes += [pscustomobject]@{ Setting = $r.Setting; Value = (& $r.Get) } }
        }
        $tbSetLog.Clear()
        try { Save-Settings -ProfileDir $state.ProfilePath -Schema $state.Schema -Changes $changes -Log $writeSetLog }
        catch { & $writeSetLog ('ERROR: ' + $_.Exception.Message) }
        & $buildRows; & $refresh
    })

    & $applyLang
    if ($env:FT_GUI_TEST) {
        # Self-test hook (used by the maintainer's tests): walk every group in both languages, then close. Result goes to the file in $env:FT_GUI_TEST.
        $errs = New-Object System.Collections.ArrayList
        [Windows.Forms.Application]::add_ThreadException({ param($snd, $ev) [void]$errs.Add($ev.Exception.ToString()) })
        $form.Add_Shown({
            try {
                $rows = 0
                foreach ($lang in 0, 1) {
                    $cbLang.SelectedIndex = $lang
                    for ($i = 0; $i -lt $lbGroups.Items.Count; $i++) { $lbGroups.SelectedIndex = $i; [Windows.Forms.Application]::DoEvents(); $rows += $state.Rows.Count }
                }
                $tabs.SelectedIndex = 1; [Windows.Forms.Application]::DoEvents()
                [IO.File]::WriteAllText($env:FT_GUI_TEST, ('groups=' + $lbGroups.Items.Count + ' rows=' + $rows + ' errors=' + $errs.Count + "`n" + ($errs -join "`n")))
            } catch { [IO.File]::WriteAllText($env:FT_GUI_TEST, ('EXCEPTION ' + $_.ToString() + "`n" + $_.ScriptStackTrace)) }
            $form.Close()
        })
    }
    [void]$form.ShowDialog()
    $timer.Stop()
}

if ($Mode -eq 'Gui') { Show-Gui } else { Invoke-Cli }
