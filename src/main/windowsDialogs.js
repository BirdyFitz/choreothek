// Windows-Dialoge „Öffnen mit“ und „Eigenschaften“ für eine Datei.
// Ohne Electron-Abhängigkeit, damit sie sich außerhalb der App testen lassen.
import { spawn } from 'child_process';

// „Öffnen mit“: rundll32 erwartet den Pfad ohne Anführungszeichen (der Rest der Befehlszeile
// ist der Pfad). Node setzt Pfade mit Leerzeichen sonst in Anführungszeichen, dann bleibt der
// Dialog stumm aus -- deshalb windowsVerbatimArguments.
export function openWithDialog(file) {
  return spawn('rundll32.exe', [`shell32.dll,OpenAs_RunDLL ${file}`], {
    detached: true,
    stdio: 'ignore',
    windowsVerbatimArguments: true
  });
}

// „Eigenschaften“: Der Dialog gehört zum aufrufenden Prozess, deshalb läuft ein unsichtbares
// PowerShell, solange er offen ist. Ein Hintergrundprozess darf sein Fenster nicht in den
// Vordergrund holen -- der Dialog wird kurz „immer im Vordergrund“ gesetzt und dann aktiviert,
// sonst öffnet er sich hinter dem Choreothek-Fenster.
export function propertiesScript(file) {
  const quoted = file.replace(/'/g, "''");
  return `
Add-Type @'
using System;
using System.Runtime.InteropServices;
public static class Win {
  public delegate bool EnumProc(IntPtr h, IntPtr l);
  [DllImport("user32.dll")] public static extern bool EnumWindows(EnumProc cb, IntPtr l);
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr h);
  [DllImport("user32.dll")] public static extern bool SetWindowPos(IntPtr h, IntPtr after, int x, int y, int cx, int cy, uint flags);
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h);
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  public static IntPtr VisibleWindowOf(uint pid) {
    IntPtr found = IntPtr.Zero;
    EnumWindows((h, l) => { uint p; GetWindowThreadProcessId(h, out p); if (p == pid && IsWindowVisible(h)) { found = h; return false; } return true; }, IntPtr.Zero);
    return found;
  }
  public static void BringToFront(IntPtr h) {
    // HWND_TOPMOST = -1, HWND_NOTOPMOST = -2; SWP_NOMOVE|SWP_NOSIZE|SWP_SHOWWINDOW = 0x43
    SetWindowPos(h, new IntPtr(-1), 0, 0, 0, 0, 0x43);
    SetWindowPos(h, new IntPtr(-2), 0, 0, 0, 0, 0x43);
    SetForegroundWindow(h);
  }
}
'@
$path = '${quoted}'
$item = (New-Object -ComObject Shell.Application).Namespace((Split-Path $path)).ParseName((Split-Path $path -Leaf))
$item.InvokeVerb('properties')
$t = 0
while (([Win]::VisibleWindowOf($PID) -eq [IntPtr]::Zero) -and $t -lt 100) { Start-Sleep -Milliseconds 100; $t++ }
$dialog = [Win]::VisibleWindowOf($PID)
if ($dialog -ne [IntPtr]::Zero) { [Win]::BringToFront($dialog) }
"sichtbar=" + ($dialog -ne [IntPtr]::Zero) + " vorne=" + ([Win]::GetForegroundWindow() -eq $dialog)
while ([Win]::VisibleWindowOf($PID) -ne [IntPtr]::Zero) { Start-Sleep -Milliseconds 300 }
`;
}

// Nicht detached: als losgelöster Prozess zeigt Windows den Dialog gar nicht an (gemessen).
export function propertiesDialog(file, { stdio = 'ignore' } = {}) {
  const encoded = Buffer.from(propertiesScript(file), 'utf16le').toString('base64');
  return spawn('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-WindowStyle', 'Hidden', '-EncodedCommand', encoded], {
    detached: false,
    stdio,
    windowsHide: true
  });
}
