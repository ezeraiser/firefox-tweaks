param([string]$Tag, [int]$X, [int]$Y, [int]$W, [int]$H, [string]$Out)
Add-Type -AssemblyName System.Drawing
Add-Type @"
using System;
using System.Runtime.InteropServices;
public class FG {
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h);
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h, out RECT r);
  [StructLayout(LayoutKind.Sequential)] public struct RECT { public int L, T, R, B; }
}
"@
$procs = Get-CimInstance Win32_Process -Filter "Name='firefox.exe'" | Where-Object { $_.CommandLine -match $Tag -and $_.CommandLine -notmatch '-contentproc' }
$ids = @($procs | ForEach-Object { $_.ProcessId })
$main = Get-Process firefox | Where-Object { $ids -contains $_.Id -and $_.MainWindowHandle -ne 0 } | Select-Object -First 1
if (-not $main) { 'NO WINDOW'; exit 1 }
[FG]::SetForegroundWindow($main.MainWindowHandle) | Out-Null
Start-Sleep -Milliseconds 700
$fg = [FG]::GetForegroundWindow()
$fpid = 0
[FG]::GetWindowThreadProcessId($fg, [ref]$fpid) | Out-Null
if ($ids -notcontains [int]$fpid) { "FOREGROUND IS NOT THE TEST WINDOW (pid $fpid), not capturing"; exit 2 }
$r = New-Object FG+RECT
[FG]::GetWindowRect($main.MainWindowHandle, [ref]$r) | Out-Null
if ($X -lt $r.L -or $Y -lt $r.T -or ($X + $W) -gt $r.R -or ($Y + $H) -gt $r.B) { 'Capture rect is outside the test window, not capturing'; exit 3 }
$bmp = New-Object System.Drawing.Bitmap $W, $H
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.CopyFromScreen($X, $Y, 0, 0, $bmp.Size)
$bmp.Save($Out)
"saved $Out"
