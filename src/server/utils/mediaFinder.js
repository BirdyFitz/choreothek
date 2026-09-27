import fs from 'fs';
import path from 'path';

let mediaRoots = [];
let mediaIndex = [];

export function getMediaRoots() {
  return mediaRoots;
}

export async function buildMediaIndex(rootPaths) {
  const roots = rootPaths.filter(Boolean);
  const index = [];

  for (let rootIndex = 0; rootIndex < roots.length; rootIndex++) {
    const rootPath = roots[rootIndex];
    const entries = await fs.promises.readdir(rootPath, { recursive: true, withFileTypes: true });

    for (const entry of entries) {
      if (!entry.isFile()) continue;
      const dir = entry.parentPath || entry.path;
      const fullPath = path.join(dir, entry.name);
      index.push({
        rootIndex,
        filename: entry.name,
        relativePath: path.relative(rootPath, fullPath).split(path.sep).join('/')
      });
    }
  }

  mediaRoots = roots;
  mediaIndex = index;
  return mediaIndex.length;
}

export function resolveMediaPath(rootIndex, relativePath) {
  const root = mediaRoots[rootIndex];
  if (!root) return null;

  const rootResolved = path.resolve(root);
  const targetResolved = path.resolve(rootResolved, relativePath);

  if (targetResolved !== rootResolved && !targetResolved.startsWith(rootResolved + path.sep)) {
    return null;
  }
  return targetResolved;
}

