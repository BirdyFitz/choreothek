import { t } from '../../shared/i18n.js';

const LABEL_PATTERN = /^(?:\d+-)?(?:Maga|Mega)\s+Mix\s+(\d+)$/i;
const TRACK_PATTERN = /^(\d+)\s+(.*)$/;

export function parseMegaMixFilename(filename) {
  // alle Audioformate, die das MegaMix-Einlesen annimmt (sonst landet z. B. „.wav“ im Rhythmus)
  const base = filename.replace(/\.(mp3|m4a|wav|flac|ogg)$/i, '');
  const parts = base.split(' - ');
  if (parts.length < 3) {
    throw new Error(t('errors.unexpectedFilename', { file: filename }));
  }

  const labelPart = parts[0];
  const rhythm = parts[parts.length - 1].trim();
  const namePart = parts.slice(1, -1).join(' - ');

  const labelMatch = labelPart.match(LABEL_PATTERN);
  if (!labelMatch) {
    throw new Error(t('errors.unknownMegamixEdition', { label: labelPart }));
  }
  const editionNumber = parseInt(labelMatch[1], 10);
  const editionLabel = `Mega Mix ${editionNumber}`;

  const trackMatch = namePart.match(TRACK_PATTERN);
  const position = trackMatch ? parseInt(trackMatch[1], 10) : null;
  const songName = trackMatch ? trackMatch[2].trim() : namePart.trim();

  return { editionNumber, editionLabel, position, songName, rhythm };
}
