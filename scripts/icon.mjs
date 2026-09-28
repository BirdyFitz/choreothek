// Programmsymbol erzeugen: build/icon.svg (groß), icon-small.svg (32 px), icon-tiny.svg (16/24 px)
// -> build/icon.ico (alle Größen, PNG-Einträge) und build/icon.png (256 px, Fenster in der Entwicklung).
// Aufruf: npx electron scripts/icon.mjs   (rendert mit Electron, kein weiteres Werkzeug nötig)
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { app, BrowserWindow } from 'electron';

const buildDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'build');
const SIZES = [16, 24, 32, 48, 64, 128, 256];
const sourceFor = (size) => (size <= 24 ? 'icon-tiny.svg' : size <= 32 ? 'icon-small.svg' : 'icon.svg');

app.commandLine.appendSwitch('force-device-scale-factor', '1');
app.disableHardwareAcceleration();

// Ein unsichtbares Fenster für alle Größen; je Größe wird nur das Bild ausgetauscht
let win = null;

async function render(svgFile, size) {
  if (!win) {
    win = new BrowserWindow({ show: false, width: 256, height: 256, transparent: true, frame: false, webPreferences: { offscreen: true } });
    await win.loadURL('data:text/html,<html><body style="margin:0;background:transparent;overflow:hidden"><img id="i" style="display:block"></body></html>');
  }
  const svg = Buffer.from(fs.readFileSync(path.join(buildDir, svgFile))).toString('base64');
  await win.webContents.executeJavaScript(`new Promise((resolve) => {
    const img = document.getElementById('i');
    img.onload = () => requestAnimationFrame(() => requestAnimationFrame(resolve));
    img.style.width = img.style.height = '${size}px';
    img.src = 'data:image/svg+xml;base64,${svg}';
  })`);
  await new Promise((r) => setTimeout(r, 100));
  let image = await win.webContents.capturePage({ x: 0, y: 0, width: size, height: size });
  if (image.getSize().width !== size) image = image.resize({ width: size, height: size, quality: 'best' });
  return image.toPNG();
}

// ICO-Datei mit PNG-Einträgen (ab Windows Vista für alle Größen zulässig)
function ico(entries) {
  const header = Buffer.alloc(6 + 16 * entries.length);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(entries.length, 4);
  let offset = header.length;
  entries.forEach(({ size, png }, i) => {
    const e = 6 + 16 * i;
    header.writeUInt8(size >= 256 ? 0 : size, e);
    header.writeUInt8(size >= 256 ? 0 : size, e + 1);
    header.writeUInt8(0, e + 2);
    header.writeUInt8(0, e + 3);
    header.writeUInt16LE(1, e + 4);
    header.writeUInt16LE(32, e + 6);
    header.writeUInt32LE(png.length, e + 8);
    header.writeUInt32LE(offset, e + 12);
    offset += png.length;
  });
  return Buffer.concat([header, ...entries.map((e) => e.png)]);
}

app.whenReady().then(async () => {
  try {
    const entries = [];
    for (const size of SIZES) entries.push({ size, png: await render(sourceFor(size), size) });
    fs.writeFileSync(path.join(buildDir, 'icon.ico'), ico(entries));
    fs.writeFileSync(path.join(buildDir, 'icon.png'), entries.find((e) => e.size === 256).png);
    console.log(`build/icon.ico (${SIZES.join(', ')} px) und build/icon.png geschrieben`);
    app.exit(0);
  } catch (error) {
    console.error(error);
    app.exit(1);
  }
});
