// Electron-Hauptprozess: zeigt sofort das Startbild, startet dann den lokalen Server und öffnet das
// App-Fenster, sobald die Oberfläche bedienbar ist.
// Oben nur leichte Importe -- Server, KI-Anbieter und Updater werden erst nach dem Startbild geladen,
// damit es ohne Verzögerung erscheint.
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron';
import { t } from '../shared/i18n.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.join(__dirname, '..', '..');
// Hauptfenster spätestens nach dieser Zeit zeigen, auch ohne „bereit“-Meldung der Oberfläche
const SHOW_TIMEOUT_MS = 15000;
// Startbild mindestens so lange zeigen, damit es nicht nur aufblitzt
const SPLASH_MIN_MS = 900;

// Nur eine Instanz: ein zweiter Start holt das vorhandene Fenster nach vorn
const isFirstInstance = app.requestSingleInstanceLock();
if (!isFirstInstance) app.quit();

let mainWindow = null;
let splash = null;
let splashShownAt = 0;
let session = null;
let stopPropertiesHelper = () => {};

// Startzeiten in der Entwicklungsfassung (Sekunden seit Programmstart)
const logStart = (what) => !app.isPackaged && console.log(`${what} nach ${process.uptime().toFixed(2)} s`);

function showSplash() {
  splash = new BrowserWindow({
    width: 300,
    height: 330,
    frame: false,
    transparent: true,
    resizable: false,
    movable: true,
    center: true,
    show: false,
    title: t('app.name'),
    webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false }
  });
  splash.loadFile(path.join(__dirname, 'splash.html'), { query: { hint: t('app.starting') } });
  splash.once('ready-to-show', () => {
    splash?.show();
    splashShownAt = Date.now();
    logStart('Startbild sichtbar');
  });
}

// Hauptfenster zeigen und Startbild schließen (einmalig)
function reveal() {
  if (!mainWindow || mainWindow.isVisible()) return;
  const wait = Math.max(0, SPLASH_MIN_MS - (Date.now() - splashShownAt));
  setTimeout(() => {
    mainWindow.show();
    mainWindow.focus();
    logStart('Hauptfenster sichtbar');
    splash?.destroy();
    splash = null;
  }, splashShownAt ? wait : 0);
}

function createWindow() {
  // Fenstersymbol: im installierten Programm kommt es aus der .exe, in der Entwicklung aus build/
  const devIcon = path.join(appRoot, 'build', 'icon.png');
  mainWindow = new BrowserWindow({
    ...(!app.isPackaged && fs.existsSync(devIcon) ? { icon: devIcon } : {}),
    width: 1280,
    height: 900,
    minWidth: 800,
    minHeight: 600,
    show: false,
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
    // Webseiten und E-Mail (Problem melden) im Standardprogramm öffnen
    if (/^(https:\/\/|mailto:)/.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (!url.startsWith(session.url)) event.preventDefault();
  });
  // Die Oberfläche meldet sich, sobald die ersten Daten angezeigt werden
  ipcMain.once('choreothek:ui-ready', reveal);
  setTimeout(reveal, SHOW_TIMEOUT_MS);

  mainWindow.loadURL(session.url);
}

app.on('second-instance', () => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
  }
});

app.whenReady().then(async () => {
  if (!isFirstInstance) return;
  showSplash();

  const [{ startServer }, { setSecretStore }, { createSafeStorageStore }, { setBackupAppVersion }, { setAppInfo }, { initUpdater }, fileMenu, dialogs] =
    await Promise.all([
      import('../server/server.js'),
      import('../server/ai/secrets.js'),
      import('./secretStore.js'),
      import('../server/routes/backup.js'),
      import('../server/appInfo.js'),
      import('./updater.js'),
      import('./fileMenu.js'),
      import('./windowsDialogs.js')
    ]);
  stopPropertiesHelper = dialogs.stopPropertiesHelper;

  setSecretStore(createSafeStorageStore(app.getPath('userData')));
  setBackupAppVersion(app.getVersion());
  setAppInfo({ version: app.getVersion() });
  session = await startServer({
    dataDir: app.getPath('userData'),
    rendererDir: path.join(appRoot, 'dist', 'renderer')
  });

  if (!app.isPackaged) console.log(`Choreothek-Server: ${session.url} (Daten: ${app.getPath('userData')})`);

  ipcMain.handle('choreothek:token', () => session.token);
  ipcMain.handle('choreothek:file-menu', (event, target) =>
    fileMenu.showFileMenu(BrowserWindow.fromWebContents(event.sender), target)
  );
  ipcMain.handle('choreothek:open-file', (event, target) => fileMenu.openInDefaultApp(target));
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
  initUpdater(() => mainWindow);

  // Helfer für den Eigenschaften-Dialog im Hintergrund vorbereiten (spart beim ersten Klick
  // rund eine Sekunde); verzögert, damit der App-Start nicht gebremst wird
  setTimeout(() => dialogs.warmUpPropertiesHelper(), 3000);
});

app.on('window-all-closed', () => {
  // Das Startbild allein zählt nicht (es wird beim Zeigen des Hauptfensters geschlossen)
  if (mainWindow === null && splash) return;
  stopPropertiesHelper();
  if (session) session.server.close();
  app.quit();
});
