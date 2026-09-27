// Kontextmenü für Musik, Videos und Choreo Notes in den Suchergebnissen.
// Eigenes Menü mit Windows-Funktionen (kein natives Shell-Menü, siehe Plan):
// Öffnen, Öffnen mit …, Im Explorer anzeigen, Pfad kopieren, Eigenschaften.
// Geöffnet werden nur Dateien aus den eingestellten Datenquellen oder den PDF-Kopien der App.
import path from 'path';
import { Menu, clipboard, shell } from 'electron';
import { resolveFileTarget, isAppCopy } from '../server/fileAccess.js';
import { openWithDialog, propertiesDialog } from './windowsDialogs.js';

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
      click: () => openWithDialog(file).unref()
    },
    { label: 'Im Explorer anzeigen', click: () => shell.showItemInFolder(file) },
    { label: 'Pfad kopieren', click: () => clipboard.writeText(file) },
    { type: 'separator' },
    { label: 'Eigenschaften', click: () => propertiesDialog(file) }
  ];
  Menu.buildFromTemplate(template).popup({ window });
}
