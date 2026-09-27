// Kontextmenü für Musik, Videos und Choreo Notes in den Suchergebnissen.
// Eigenes Menü mit Windows-Funktionen (kein natives Shell-Menü, siehe Plan):
// Öffnen, Öffnen mit …, Im Explorer anzeigen, Pfad kopieren, Eigenschaften.
// Geöffnet werden nur Dateien aus den eingestellten Datenquellen oder den PDF-Kopien der App.
import path from 'path';
import { spawn } from 'child_process';
import { Menu, clipboard, shell } from 'electron';
import { resolveFileTarget, isAppCopy } from '../server/fileAccess.js';

// Windows-Eigenschaften-Dialog: gehört zum aufrufenden Prozess, deshalb läuft ein
// unsichtbares PowerShell so lange weiter, wie der Dialog sichtbar ist.
function showProperties(file) {
  const quoted = file.replace(/'/g, "''");
  const script = `
Add-Type @'
using System;
using System.Runtime.InteropServices;
public static class Win {
  public delegate bool EnumProc(IntPtr h, IntPtr l);
  [DllImport("user32.dll")] public static extern bool EnumWindows(EnumProc cb, IntPtr l);
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr h);
  public static int VisibleWindowsOf(uint pid) {
    int n = 0;
    EnumWindows((h, l) => { uint p; GetWindowThreadProcessId(h, out p); if (p == pid && IsWindowVisible(h)) n++; return true; }, IntPtr.Zero);
    return n;
  }
}
'@
$path = '${quoted}'
$item = (New-Object -ComObject Shell.Application).Namespace((Split-Path $path)).ParseName((Split-Path $path -Leaf))
$item.InvokeVerb('properties')
$t = 0
while ([Win]::VisibleWindowsOf($PID) -eq 0 -and $t -lt 100) { Start-Sleep -Milliseconds 100; $t++ }
while ([Win]::VisibleWindowsOf($PID) -gt 0) { Start-Sleep -Milliseconds 300 }
`;
  const encoded = Buffer.from(script, 'utf16le').toString('base64');
  spawn('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-WindowStyle', 'Hidden', '-EncodedCommand', encoded], {
    detached: true,
    stdio: 'ignore',
    windowsHide: true
  }).unref();
}

export async function showFileMenu(window, target) {
  const file = await resolveFileTarget(target);
  if (!file) {
    Menu.buildFromTemplate([{ label: 'Datei nicht gefunden', enabled: false }]).popup({ window });
    return;
  }
  const template = [
    { label: path.basename(file), enabled: false },
    ...(isAppCopy(file) ? [{ label: '(Kopie in Choreothek – Original nicht gefunden)', enabled: false }] : []),
    { type: 'separator' },
    { label: 'Öffnen', click: () => shell.openPath(file) },
    {
      label: 'Öffnen mit …',
      click: () => spawn('rundll32.exe', ['shell32.dll,OpenAs_RunDLL', file], { detached: true, stdio: 'ignore' }).unref()
    },
    { label: 'Im Explorer anzeigen', click: () => shell.showItemInFolder(file) },
    { label: 'Pfad kopieren', click: () => clipboard.writeText(file) },
    { type: 'separator' },
    { label: 'Eigenschaften', click: () => showProperties(file) }
  ];
  Menu.buildFromTemplate(template).popup({ window });
}
