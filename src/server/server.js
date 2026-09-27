// Lokaler Server der App: liefert Oberfläche, API und Mediendateien aus.
// Nur an 127.0.0.1 gebunden. Schutz gegen Webseiten im Browser desselben PCs:
//  - Host-Header muss 127.0.0.1:<port> sein (gegen DNS-Rebinding)
//  - ändernde Anfragen (POST/PUT/PATCH/DELETE) brauchen den Sitzungs-Token im Header
//    X-Choreothek-Token; fremde Seiten können diesen Header ohne CORS-Freigabe nicht setzen
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import express from 'express';
import { initDB, getSetting, setSetting } from './db.js';
import { setDataDir, getUploadsDir } from './paths.js';
import { buildMediaIndex } from './utils/mediaFinder.js';
import searchRoutes from './routes/search.js';
import settingsRoutes from './routes/settings.js';
import libraryRoutes from './routes/library.js';
import aiRoutes from './routes/ai.js';
import { t } from '../shared/i18n.js';
import mediaRoutes from './routes/media.js';

export async function startServer({ dataDir, rendererDir, port = 0, dbFile } = {}) {
  setDataDir(dataDir);
  await initDB(dbFile);

  const token = crypto.randomBytes(32).toString('hex');
  const app = express();
  let expectedHost = null;

  app.disable('x-powered-by');
  app.use((req, res, next) => {
    if (req.headers.host !== expectedHost) return res.status(403).end();
    if (req.method !== 'GET' && req.method !== 'HEAD' && req.get('X-Choreothek-Token') !== token) {
      return res.status(403).json({ error: t('errors.forbidden') });
    }
    next();
  });
  app.use(express.json());
  app.use('/uploads', express.static(getUploadsDir()));

  app.use('/api', searchRoutes);
  app.use('/api', settingsRoutes);
  app.use('/api', libraryRoutes);
  app.use('/api', aiRoutes);
  app.use('/api', mediaRoutes);
  app.get('/api/health', (req, res) => res.json({ status: 'OK' }));

  if (rendererDir && fs.existsSync(rendererDir)) {
    app.use(express.static(rendererDir));
    app.get(/^\/(?!api\/|uploads\/).*/, (req, res) => res.sendFile(path.join(rendererDir, 'index.html')));
  }

  // Jam-Session-Medienindex (Dateizähler in den Einstellungen)
  const raw = await getSetting('media_roots');
  if (raw === null) await setSetting('media_roots', JSON.stringify([]));
  const mediaRoots = raw ? JSON.parse(raw) : [];
  if (mediaRoots.length > 0) {
    try {
      await buildMediaIndex(mediaRoots);
    } catch (error) {
      console.error('Media-Index konnte nicht aufgebaut werden:', error.message);
    }
  }

  const server = await new Promise((resolve, reject) => {
    const s = app.listen(port, '127.0.0.1', () => resolve(s));
    s.on('error', reject);
  });
  const actualPort = server.address().port;
  expectedHost = `127.0.0.1:${actualPort}`;
  return { server, port: actualPort, token, url: `http://${expectedHost}/` };
}
