// Bilder der App für die Webseite: startet den Server mit ERFUNDENEN Daten in einem Demo-Ordner,
// öffnet ein unsichtbares Fenster (1280×800) und nimmt die Ansichten auf -> website/assets/img/*.png.
// Keine echten Namen, keine echten Choreo Notes, keine Musik aus dem Archiv (Töne werden erzeugt).
// Aufruf: npm run build:renderer && npx electron scripts/screenshots.mjs
import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
import { app, BrowserWindow, ipcMain } from 'electron';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = path.join(root, 'website', 'assets', 'img');
// Neutraler Ort, damit in Pfadfeldern kein Benutzername erscheint
const demoDir = path.join(process.env.PUBLIC || os.tmpdir(), 'Choreothek-Demo');
const WIDTH = 1280;
const HEIGHT = 800;

app.commandLine.appendSwitch('force-device-scale-factor', '1');
app.commandLine.appendSwitch('mute-audio');

// ---------- erfundene Daten ----------

// Kurzer, leiser Ton als WAV (nur damit Musikdateien mit Länge existieren)
function writeWav(file, seconds, freq) {
  const sr = 8000, n = sr * seconds, buf = Buffer.alloc(44 + n * 2);
  buf.write('RIFF', 0); buf.writeUInt32LE(36 + n * 2, 4); buf.write('WAVEfmt ', 8); buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20); buf.writeUInt16LE(1, 22); buf.writeUInt32LE(sr, 24); buf.writeUInt32LE(sr * 2, 28);
  buf.writeUInt16LE(2, 32); buf.writeUInt16LE(16, 34); buf.write('data', 36); buf.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) buf.writeInt16LE(Math.round(Math.sin((2 * Math.PI * freq * i) / sr) * 2000), 44 + i * 2);
  fs.writeFileSync(file, buf);
}

const JAMS = [
  {
    jammer: 'Erika Beispiel', date: '3. Mai 2025', location: 'Turnhalle Musterstadt', folder: '2025-05 Musterstadt',
    songs: [
      ['Sonnenschein', 'Die Testband', 'Salsa'], ['Nachtzug', 'Luna Demo', 'Cumbia'], ['Morgenrot', 'Die Testband', 'Merengue'],
      ['Wellenreiter', 'Beispiel-Trio', 'Reggaeton'], ['Sternenstaub', 'Luna Demo', 'Bachata'], ['Feuerwerk', 'Klangprobe', 'Soca'],
      ['Abendwind', 'Beispiel-Trio', 'Cooldown']
    ]
  },
  {
    jammer: 'Max Muster', date: '14. September 2025', location: 'Sporthalle Beispielhausen', folder: '2025-09 Beispielhausen',
    songs: [
      ['Karussell', 'Klangprobe', 'Merengue'], ['Himmelblau', 'Die Testband', 'Salsa'], ['Trommelfest', 'Rhythmus AG', 'Samba'],
      ['Mondlicht', 'Luna Demo', 'Bachata'], ['Sprungbrett', 'Rhythmus AG', 'Dancehall'], ['Leuchtturm', 'Beispiel-Trio', 'Cumbia']
    ]
  },
  {
    jammer: 'Lena Probe & Max Muster', date: '22. Februar 2026', location: 'Gemeindezentrum Testdorf', folder: '2026-02 Testdorf',
    songs: [
      ['Farbenspiel', 'Klangprobe', 'Salsa'], ['Wirbelwind', 'Rhythmus AG', 'Reggaeton'], ['Sommerregen', 'Luna Demo', 'Cumbia'],
      ['Tangoherz', 'Die Testband', 'Tango'], ['Glücksrad', 'Beispiel-Trio', 'Merengue']
    ]
  },
  {
    jammer: 'Lena Probe', date: '7. Juni 2026', location: 'Turnhalle Musterstadt', folder: '2026-06 Musterstadt',
    songs: [
      ['Sonnenschein', 'Die Testband', 'Salsa Choke'], ['Papierflieger', 'Klangprobe', 'Cumbia'], ['Taktgefühl', 'Rhythmus AG', 'Soca'],
      ['Abendwind', 'Beispiel-Trio', 'Cooldown']
    ]
  }
];

// Choreo Notes als PDF: je Song eine Seite mit einer erfundenen Schrittfolge
async function writeChoreoNotes(file, jam, PDFDocument, StandardFonts, rgb) {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const cover = doc.addPage([595, 842]);
  cover.drawText('Choreo Notes', { x: 60, y: 740, size: 30, font: bold, color: rgb(0.06, 0.43, 0.34) });
  cover.drawText(`Jam Session · ${jam.location}`, { x: 60, y: 700, size: 16, font });
  cover.drawText(`${jam.date} · ${jam.jammer}`, { x: 60, y: 676, size: 14, font });
  jam.songs.forEach(([name], i) => cover.drawText(`${i + 1}. ${name}`, { x: 60, y: 620 - i * 24, size: 13, font }));
  const parts = ['Intro', 'Strophe', 'Refrain', 'Strophe', 'Refrain', 'Bridge', 'Refrain', 'Ende'];
  const steps = ['Basic vor/zurück', 'Seitschritt mit Hüfte', 'Drehung rechts', 'Kick-Ball-Change', 'Arme hoch, 4× klatschen',
    'Grapevine links', 'Shimmy', 'Marsch am Platz', 'Mambo vor', 'Pose halten'];
  jam.songs.forEach(([name, artist, rhythm], s) => {
    const page = doc.addPage([595, 842]);
    page.drawText(name, { x: 50, y: 770, size: 24, font: bold, color: rgb(0.06, 0.43, 0.34) });
    page.drawText(`${artist} · ${rhythm}`, { x: 50, y: 742, size: 13, font });
    page.drawLine({ start: { x: 50, y: 728 }, end: { x: 545, y: 728 }, thickness: 1, color: rgb(0.7, 0.8, 0.76) });
    parts.forEach((part, p) => {
      const y = 690 - p * 78;
      page.drawText(part, { x: 50, y, size: 13, font: bold });
      for (let k = 0; k < 3; k++) {
        page.drawText(`${(k + 1) * 8} Takte – ${steps[(s * 3 + p * 2 + k) % steps.length]}`, { x: 150, y: y - k * 20, size: 12, font });
      }
    });
  });
  fs.writeFileSync(file, await doc.save());
}

async function seed() {
  const imp = (p) => import(new URL(`file:///${path.join(root, p).replaceAll(path.sep, '/')}`).href);
  const { PDFDocument, StandardFonts, rgb } = await imp('node_modules/pdf-lib/cjs/index.js');
  const { startServer } = await imp('src/server/server.js');
  const db = await imp('src/server/db.js');
  const { getUploadsDir } = await imp('src/server/paths.js');
  const { setSecretStore, createMemoryStore, setApiKey } = await imp('src/server/ai/secrets.js');
  const { saveAiSettings } = await imp('src/server/ai/aiService.js');
  const { setAppInfo } = await imp('src/server/appInfo.js');

  fs.rmSync(demoDir, { recursive: true, force: true });
  const jamRoot = path.join(demoDir, 'Jam Sessions');
  const dataDir = path.join(demoDir, 'Daten');
  fs.mkdirSync(dataDir, { recursive: true });

  // Schlüssel nur im Speicher (Attrappe), nie im Tresor des Benutzers
  setSecretStore(createMemoryStore());
  setAppInfo({ version: JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).version });
  const session = await startServer({ dataDir, rendererDir: path.join(root, 'dist', 'renderer') });

  await db.setSetting('setup_done', '1');
  await db.setSetting('media_roots', JSON.stringify([jamRoot]));
  await db.setSetting('last_backup_at', new Date().toISOString());
  let freq = 220;
  for (const [j, jam] of JAMS.entries()) {
    const folder = path.join(jamRoot, jam.folder);
    fs.mkdirSync(folder, { recursive: true });
    const pdf = `${j + 1}-choreo-notes.pdf`;
    await writeChoreoNotes(path.join(getUploadsDir(), pdf), jam, PDFDocument, StandardFonts, rgb);
    fs.copyFileSync(path.join(getUploadsDir(), pdf), path.join(folder, `Choreo Notes ${jam.folder}.pdf`));
    jam.songs.forEach(([name], i) => writeWav(path.join(folder, `${String(i + 1).padStart(2, '0')} ${name}.wav`), 4, (freq += 20)));
    const id = await db.insertJam(jam.jammer, jam.date, pdf, jam.location, folder);
    await db.insertSongs(id, jam.songs.map(([name, artist, rhythm], i) => ({ name, artist, rhythm, position: i + 1, page: i + 2 })));
  }
  const mm = await db.insertMegaMix(80, 'MegaMix 80', null);
  await db.insertMegaMixSongs(mm, [['Tanzfieber', 'Merengue'], ['Kaffeeklatsch', 'Cumbia'], ['Blitzlicht', 'Reggaeton']]
    .map(([name, rhythm], i) => ({ name, rhythm, position: i + 1 })));

  setApiKey('anthropic', 'sk-demo-nur-fuer-bilder');
  await saveAiSettings({ provider: 'anthropic', privacyAck: { anthropic: new Date().toISOString() } });
  return session;
}

// ---------- Aufnahme ----------

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

app.whenReady().then(async () => {
  try {
    const session = await seed();
    ipcMain.handle('choreothek:token', () => session.token);
    ipcMain.on('choreothek:ui-ready', () => {});
    const win = new BrowserWindow({
      show: false, width: WIDTH, height: HEIGHT, useContentSize: true,
      webPreferences: { preload: path.join(root, 'src', 'main', 'preload.cjs'), contextIsolation: true, sandbox: true, offscreen: true }
    });
    win.webContents.setAudioMuted(true);
    await win.loadURL(session.url);
    const js = (code) => win.webContents.executeJavaScript(code);
    // Warten, bis ein Element da ist; dann klicken (Text optional)
    const click = async (selector, text) => {
      for (let i = 0; i < 50; i++) {
        const ok = await js(`(() => {
          const el = [...document.querySelectorAll(${JSON.stringify(selector)})]
            .find((e) => ${text ? `e.textContent.trim().startsWith(${JSON.stringify(text)})` : 'true'});
          if (!el) return false;
          el.click();
          return true;
        })()`);
        if (ok) return;
        await sleep(100);
      }
      throw new Error(`Nicht gefunden: ${selector} ${text || ''}`);
    };
    const shot = async (name) => {
      await sleep(1500);
      const image = await win.webContents.capturePage();
      fs.mkdirSync(outDir, { recursive: true });
      fs.writeFileSync(path.join(outDir, `${name}.png`), image.toPNG());
      console.log(`${name}.png (${image.getSize().width}×${image.getSize().height})`);
    };

    // Suchen: Song mit Rhythmus-Filter „sal“ gewählt – Choreo Notes und Musik rechts
    await sleep(1500);
    await click('.results tbody tr', 'Himmelblau');
    await click('button, [role=button], li', 'Choreo Notes, Seite');
    await sleep(1500);
    await shot('suchen');

    // Bibliothek: eine Jam mit Songs und Dateien
    await click('.topbar .tab', 'Bibliothek');
    await click('.library-items button', 'Erika Beispiel');
    await shot('bibliothek');

    // Einstellungen → KI
    await click('.topbar .tab', 'Einstellungen');
    await click('.settings-menu button', 'KI');
    await js('document.querySelector(".page")?.scrollTo(0, 0)');
    await shot('ki');

    // Einstellungen → Vorschau
    await click('.settings-menu button', 'Vorschau');
    await shot('vorschau');

    session.server.close();
    app.exit(0);
  } catch (error) {
    console.error(error);
    app.exit(1);
  }
});
