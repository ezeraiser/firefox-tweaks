param([string]$Tag)
Get-CimInstance Win32_Process -Filter "Name='firefox.exe'" | Where-Object { $_.CommandLine -match $Tag } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
Start-Sleep 4
$prof = Join-Path $env:TEMP $Tag
if ($prof -like "$env:TEMP\$Tag") { Remove-Item -LiteralPath $prof -Recurse -Force -ErrorAction SilentlyContinue }
