// Updates über GitHub-Releases (electron-updater). Nichts passiert ohne Zustimmung: beim Start wird
// nur nachgesehen; Herunterladen und Installieren erst auf Klick in der Oberfläche.
// Nur in der installierten App -- in der Entwicklungsfassung meldet check() „dev“.
import { app, ipcMain } from 'electron';
import electronUpdater from 'electron-updater';
import { getSetting } from '../server/db.js';

const { autoUpdater } = electronUpdater;

export function initUpdater(getWindow) {
  const send = (channel, data) => getWindow()?.webContents.send(channel, data);
  let available = null;

  if (app.isPackaged) {
    // Kein eigenes Protokoll der Bibliothek: „noch kein Release“ oder „offline“ sind beim Start normal;
    // Fehler bei einer vom Nutzer ausgelösten Prüfung zeigt die Oberfläche
    autoUpdater.logger = null;
    autoUpdater.autoDownload = false;
    autoUpdater.autoInstallOnAppQuit = false;
    autoUpdater.on('update-available', (info) => {
      available = { version: info.version, notes: typeof info.releaseNotes === 'string' ? info.releaseNotes : null };
      send('choreothek:update-available', available);
    });
    autoUpdater.on('download-progress', (p) => send('choreothek:update-progress', { percent: Math.round(p.percent) }));
    autoUpdater.on('update-downloaded', () => send('choreothek:update-downloaded', available));
    autoUpdater.on('error', (e) => send('choreothek:update-error', { message: String(e?.message || e).slice(0, 300) }));
  }

  const check = async () => {
    if (!app.isPackaged) return { status: 'dev', current: app.getVersion() };
    // Vorgabe: in der Pilotphase (Version 0.x) Vorabversionen erhalten, sonst nur stabile
    const setting = await getSetting('updates_prerelease');
    autoUpdater.allowPrerelease = setting === null ? app.getVersion().startsWith('0.') : setting === '1';
    const result = await autoUpdater.checkForUpdates();
    const version = result?.updateInfo?.version;
    const newer = result?.isUpdateAvailable ?? (version && version !== app.getVersion());
    return newer ? { status: 'available', current: app.getVersion(), version } : { status: 'none', current: app.getVersion() };
  };

  ipcMain.handle('choreothek:update-check', () => check().catch((e) => ({ status: 'error', current: app.getVersion(), message: String(e?.message || e).slice(0, 300) })));
  ipcMain.handle('choreothek:update-download', () => (app.isPackaged ? autoUpdater.downloadUpdate().then(() => true) : false));
  ipcMain.handle('choreothek:update-install', () => {
    if (app.isPackaged) autoUpdater.quitAndInstall();
  });

  // Beim Start nachsehen, etwas verzögert, damit der Start nicht gebremst wird
  if (app.isPackaged) setTimeout(() => check().catch(() => {}), 8000);
}
