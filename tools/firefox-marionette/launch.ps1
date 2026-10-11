param([string]$PrefsFile, [int]$Port, [string]$Tag, [string]$FirefoxExe = 'C:\Business\Programs\Z\Driver\Tools\Browsers\Mozilla\Firefox\firefox.exe')
$prof = Join-Path $env:TEMP $Tag
if (Test-Path $prof) { Remove-Item -LiteralPath $prof -Recurse -Force -ErrorAction SilentlyContinue }
New-Item -ItemType Directory -Path $prof -Force | Out-Null
if ($env:FF_CHROME_SRC) { New-Item -ItemType Directory -Path (Join-Path $prof 'chrome') -Force | Out-Null; foreach ($f in $env:FF_CHROME_SRC.Split(';')) { Copy-Item $f (Join-Path $prof 'chrome') } }
$base = @(
 'user_pref("browser.shell.checkDefaultBrowser", false);',
 'user_pref("browser.aboutwelcome.enabled", false);',
 "user_pref(`"marionette.port`", $Port);",
 'user_pref("app.update.auto", false);',
 'user_pref("app.update.enabled", false);')
$extra = if ($PrefsFile -and (Test-Path $PrefsFile)) { Get-Content $PrefsFile } else { @() }
($base + $extra) | Set-Content (Join-Path $prof 'user.js') -Encoding ascii
Start-Process $FirefoxExe -ArgumentList @('-no-remote','-profile',$prof,'--marionette','--remote-allow-system-access','about:blank') | Out-Null
Start-Sleep 11
if (-not (Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue)) { 'NOT LISTENING' }
