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

// „Eigenschaften“ über einen bereitgehaltenen PowerShell-Helfer: PowerShell starten und den
// C#-Teil übersetzen kostet jedes Mal rund eine Sekunde, deshalb läuft der Helfer einmal und
// nimmt Dateipfade zeilenweise über stdin entgegen. Die Dialoge gehören zum Helfer; er läuft,
// solange die App läuft (stdin zu = Helfer beendet sich).
// Ein Hintergrundprozess darf sein Fenster nicht in den Vordergrund holen -- der Dialog wird
// kurz „immer im Vordergrund“ gesetzt, sonst öffnet er sich hinter dem Choreothek-Fenster.
export const PROPERTIES_HELPER_SCRIPT = `
Add-Type @'
using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;
public static class Win {
  public delegate bool EnumProc(IntPtr h, IntPtr l);
  [DllImport("user32.dll")] public static extern bool EnumWindows(EnumProc cb, IntPtr l);
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr h);
  [DllImport("user32.dll")] public static extern bool SetWindowPos(IntPtr h, IntPtr after, int x, int y, int cx, int cy, uint flags);
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h);
  public static List<IntPtr> VisibleWindowsOf(uint pid) {
    var list = new List<IntPtr>();
    EnumWindows((h, l) => { uint p; GetWindowThreadProcessId(h, out p); if (p == pid && IsWindowVisible(h)) list.Add(h); return true; }, IntPtr.Zero);
    return list;
  }
  public static void BringToFront(IntPtr h) {
    // HWND_TOPMOST = -1, HWND_NOTOPMOST = -2; SWP_NOMOVE|SWP_NOSIZE|SWP_SHOWWINDOW = 0x43
    SetWindowPos(h, new IntPtr(-1), 0, 0, 0, 0, 0x43);
    SetWindowPos(h, new IntPtr(-2), 0, 0, 0, 0, 0x43);
    SetForegroundWindow(h);
  }
}
'@
$shell = New-Object -ComObject Shell.Application
# Vorwärmen: Kontextmenü-/Eigenschaften-Erweiterungen der Shell laden, ohne Dialog
$warm = $shell.Namespace([Environment]::GetFolderPath('Windows')).ParseName('notepad.exe')
if ($warm) { [void]$warm.Verbs(); [void]$warm.ExtendedProperty('System.Size') }
[Console]::Out.WriteLine('bereit')
while ($true) {
  $path = [Console]::In.ReadLine()
  if ($path -eq $null) { break }
  if (-not (Test-Path -LiteralPath $path -PathType Leaf)) { [Console]::Out.WriteLine('fehlt'); continue }
  $before = [Win]::VisibleWindowsOf($PID)
  # .NET statt Split-Path: "-LiteralPath -Leaf" gibt es in Windows PowerShell 5.1 nicht,
  # und [ ] in Dateinamen bleiben so unverändert
  try {
    $shell.Namespace([IO.Path]::GetDirectoryName($path)).ParseName([IO.Path]::GetFileName($path)).InvokeVerb('properties')
  } catch {
    [Console]::Out.WriteLine('fehler ' + $_.Exception.Message)
    continue
  }
  $dialog = [IntPtr]::Zero
  for ($t = 0; $t -lt 100 -and $dialog -eq [IntPtr]::Zero; $t++) {
    Start-Sleep -Milliseconds 30
    foreach ($h in [Win]::VisibleWindowsOf($PID)) { if (-not $before.Contains($h)) { $dialog = $h } }
  }
  if ($dialog -ne [IntPtr]::Zero) { [Win]::BringToFront($dialog); [Console]::Out.WriteLine('offen') } else { [Console]::Out.WriteLine('kein Dialog') }
}
`;

let helper = null;

// Helfer starten, falls er nicht schon läuft (z. B. beim Öffnen des Kontextmenüs aufrufen,
// damit er bis zum Klick auf „Eigenschaften“ bereit ist). Nicht detached: als losgelöster
// Prozess zeigt Windows den Dialog gar nicht an (gemessen).
export function warmUpPropertiesHelper() {
  if (helper && helper.exitCode === null && !helper.killed) return helper;
  const encoded = Buffer.from(PROPERTIES_HELPER_SCRIPT, 'utf16le').toString('base64');
  helper = spawn('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-WindowStyle', 'Hidden', '-EncodedCommand', encoded], {
    stdio: ['pipe', 'pipe', 'ignore'],
    windowsHide: true
  });
  helper.stdin.setDefaultEncoding('utf8');
  helper.on('exit', () => {
    helper = null;
  });
  return helper;
}

export function propertiesDialog(file) {
  const h = warmUpPropertiesHelper();
  h.stdin.write(`${file}\n`);
  return h;
}

export function stopPropertiesHelper() {
  if (helper) {
    helper.stdin.end();
    helper.kill();
    helper = null;
  }
}
