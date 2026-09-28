// Brücke zwischen Oberfläche und Hauptprozess: nur diese Funktionen sind für die Oberfläche sichtbar.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('choreothek', {
  getToken: () => ipcRenderer.invoke('choreothek:token'),
  selectFolder: (startPath) => ipcRenderer.invoke('choreothek:select-folder', startPath || null),
  // target: { dir, file } oder { sourcePath, uploadName }
  showFileMenu: (target) => ipcRenderer.invoke('choreothek:file-menu', target),
  // Datei im Windows-Standardprogramm öffnen; target wie bei showFileMenu. Ergebnis: '' oder Fehlertext
  openFile: (target) => ipcRenderer.invoke('choreothek:open-file', target)
});
