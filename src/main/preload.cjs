// Brücke zwischen Oberfläche und Hauptprozess: nur diese Funktionen sind für die Oberfläche sichtbar.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('choreothek', {
  getToken: () => ipcRenderer.invoke('choreothek:token'),
  // Oberfläche ist bedienbar (erste Daten angezeigt) -> Hauptfenster zeigen, Startbild schließen
  uiReady: () => ipcRenderer.send('choreothek:ui-ready'),
  selectFolder: (startPath) => ipcRenderer.invoke('choreothek:select-folder', startPath || null),
  // target: { dir, file } oder { sourcePath, uploadName }
  showFileMenu: (target) => ipcRenderer.invoke('choreothek:file-menu', target),
  // Datei im Windows-Standardprogramm öffnen; target wie bei showFileMenu. Ergebnis: '' oder Fehlertext
  openFile: (target) => ipcRenderer.invoke('choreothek:open-file', target),
  // Sicherung: Speicherort bzw. Sicherungsdatei über Windows-Dialoge; null = abgebrochen
  chooseBackupTarget: (defaultName) => ipcRenderer.invoke('choreothek:backup-target', defaultName),
  chooseBackupSource: () => ipcRenderer.invoke('choreothek:backup-source'),
  // Updates: nachsehen, herunterladen, installieren; Ereignisse über onUpdate(name, callback)
  checkUpdate: () => ipcRenderer.invoke('choreothek:update-check'),
  downloadUpdate: () => ipcRenderer.invoke('choreothek:update-download'),
  installUpdate: () => ipcRenderer.invoke('choreothek:update-install'),
  onUpdate: (name, callback) => {
    const channel = `choreothek:update-${name}`;
    if (!['available', 'progress', 'downloaded', 'error'].includes(name)) return () => {};
    const listener = (event, data) => callback(data);
    ipcRenderer.on(channel, listener);
    return () => ipcRenderer.removeListener(channel, listener);
  }
});
