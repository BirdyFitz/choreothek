// Electron-Hauptprozess: startet den lokalen Server und öffnet das App-Fenster.
import path from 'path';
import { fileURLToPath } from 'url';
import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron';
import { startServer } from '../server/server.js';
import { setSecretStore } from '../server/ai/secrets.js';
import { createSafeStorageStore } from './secretStore.js';
import { setBackupAppVersion } from '../server/routes/backup.js';
import { showFileMenu, openInDefaultApp } from './fileMenu.js';
import { warmUpPropertiesHelper, stopPropertiesHelper } from './windowsDialogs.js';
import { t } from '../shared/i18n.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.join(__dirname, '..', '..');

// Nur eine Instanz: ein zweiter Start holt das vorhandene Fenster nach vorn
const isFirstInstance = app.requestSingleInstanceLock();
if (!isFirstInstance) app.quit();

let mainWindow = null;
let session = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 900,
    minWidth: 800,
    minHeight: 600,
    title: t('app.name'),
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false
    }
  });

  // Links nach außen (z. B. Spenden, Anbieter-Seiten) im Standardbrowser öffnen, nie im App-Fenster
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith(session.url)) return { action: 'allow' };
    if (/^https:\/\//.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (!url.startsWith(session.url)) event.preventDefault();
  });

  mainWindow.loadURL(session.url);
}

app.on('second-instance', () => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  }
});

app.whenReady().then(async () => {
  if (!isFirstInstance) return;
  setSecretStore(createSafeStorageStore(app.getPath('userData')));
  setBackupAppVersion(app.getVersion());
  session = await startServer({
    dataDir: app.getPath('userData'),
    rendererDir: path.join(appRoot, 'dist', 'renderer')
  });

  if (!app.isPackaged) console.log(`Choreothek-Server: ${session.url} (Daten: ${app.getPath('userData')})`);

  ipcMain.handle('choreothek:token', () => session.token);
  ipcMain.handle('choreothek:file-menu', (event, target) =>
    showFileMenu(BrowserWindow.fromWebContents(event.sender), target)
  );
  ipcMain.handle('choreothek:open-file', (event, target) => openInDefaultApp(target));
  // Sicherung: Ziel wählen („Speichern unter“) bzw. Sicherungsdatei zum Wiederherstellen öffnen
  ipcMain.handle('choreothek:backup-target', async (event, defaultName) => {
    const result = await dialog.showSaveDialog(mainWindow, {
      title: t('backup.saveTitle'),
      defaultPath: path.join(app.getPath('documents'), defaultName || 'Choreothek-Sicherung.zip'),
      filters: [{ name: t('backup.fileType'), extensions: ['zip'] }]
    });
    return result.canceled ? null : result.filePath;
  });
  ipcMain.handle('choreothek:backup-source', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      title: t('backup.openTitle'),
      defaultPath: app.getPath('documents'),
      filters: [{ name: t('backup.fileType'), extensions: ['zip'] }],
      properties: ['openFile']
    });
    return result.canceled ? null : result.filePaths[0];
  });
  ipcMain.handle('choreothek:select-folder', async (event, startPath) => {
    const result = await dialog.showOpenDialog(mainWindow, {
      title: t('menu.selectFolder'),
      defaultPath: startPath || undefined,
      properties: ['openDirectory']
    });
    return result.canceled ? null : result.filePaths[0];
  });

  createWindow();

  // Helfer für den Eigenschaften-Dialog im Hintergrund vorbereiten (spart beim ersten Klick
  // rund eine Sekunde); verzögert, damit der App-Start nicht gebremst wird
  setTimeout(() => warmUpPropertiesHelper(), 3000);
});

app.on('window-all-closed', () => {
  stopPropertiesHelper();
  if (session) session.server.close();
  app.quit();
});
