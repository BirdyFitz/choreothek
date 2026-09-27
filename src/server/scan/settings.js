// Ordner und Zuordnungen von Hand für die Erkennung der Volumes/MegaMixe aus den Einstellungen
import path from 'path';
import { getSetting, setSetting } from '../db.js';
import { scanZinVolumes, scanMegaMixes } from './volumes.js';

export const ZIN_OVERRIDES_SETTING = 'zin_volume_overrides';
export const MEGAMIX_OVERRIDES_SETTING = 'megamix_overrides';

async function readJson(key, fallback) {
  const raw = await getSetting(key);
  return raw ? JSON.parse(raw) : fallback;
}

export async function zinFolders() {
  const choreoRoot = (await getSetting('zin_volumes_choreo_root')) || null;
  const musicRoot = (await getSetting('zin_volumes_mp3_root')) || null;
  // Ohne eigene Einstellung: Videos im Ordner über den Choreo Notes (bisheriges Verhalten)
  const videoRoot = (await getSetting('zin_volumes_video_root')) || (choreoRoot ? path.dirname(choreoRoot) : null);
  return { choreoRoot, musicRoot, videoRoot };
}

export async function scanZinFromSettings() {
  return scanZinVolumes({ ...(await zinFolders()), overrides: await readJson(ZIN_OVERRIDES_SETTING, {}) });
}

export async function scanMegaMixFromSettings() {
  return scanMegaMixes({ root: (await getSetting('megamix_root')) || null, overrides: await readJson(MEGAMIX_OVERRIDES_SETTING, {}) });
}

// Zuordnung von Hand setzen bzw. mit folder = null entfernen
export async function setOverride(settingKey, number, field, folder) {
  const overrides = await readJson(settingKey, {});
  const entry = { ...(overrides[number] || {}) };
  if (folder) entry[field] = folder;
  else delete entry[field];
  if (Object.keys(entry).length) overrides[number] = entry;
  else delete overrides[number];
  await setSetting(settingKey, JSON.stringify(overrides));
}
