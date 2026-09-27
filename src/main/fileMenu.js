// Kontextmenü für Musik, Videos und Choreo Notes in den Suchergebnissen.
// Eigenes Menü mit Windows-Funktionen (kein natives Shell-Menü, siehe Plan):
// Öffnen, Öffnen mit …, Im Explorer anzeigen, Pfad kopieren, Eigenschaften.
// Geöffnet werden nur Dateien aus den eingestellten Datenquellen oder den PDF-Kopien der App.
import path from 'path';
import { Menu, clipboard, shell } from 'electron';
import { resolveFileTarget, isAppCopy } from '../server/fileAccess.js';
import { openWithDialog, propertiesDialog, warmUpPropertiesHelper } from './windowsDialogs.js';
import { t } from '../shared/i18n.js';

export async function showFileMenu(window, target) {
  warmUpPropertiesHelper(); // falls der Helfer nicht (mehr) läuft: jetzt starten, bis zum Klick ist er meist bereit
  const file = await resolveFileTarget(target);
  if (!file) {
    Menu.buildFromTemplate([{ label: t('menu.fileNotFound'), enabled: false }]).popup({ window });
    return;
  }
  const template = [
    { label: path.basename(file), enabled: false },
    ...(isAppCopy(file) ? [{ label: t('menu.appCopy'), enabled: false }] : []),
    { type: 'separator' },
    { label: t('menu.open'), click: () => shell.openPath(file) },
    {
      label: t('menu.openWith'),
      click: () => openWithDialog(file).unref()
    },
    { label: t('menu.showInExplorer'), click: () => shell.showItemInFolder(file) },
    { label: t('menu.copyPath'), click: () => clipboard.writeText(file) },
    { type: 'separator' },
    { label: t('menu.properties'), click: () => propertiesDialog(file) }
  ];
  Menu.buildFromTemplate(template).popup({ window });
}
