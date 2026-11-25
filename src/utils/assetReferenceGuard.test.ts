import assert from 'node:assert/strict';
import test from 'node:test';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SRC_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ASSETS_DIR = path.join(SRC_DIR, 'assets');

const walk = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    return entry.isDirectory() ? walk(full) : [full];
  });

test('every shipped source asset has a code reference', () => {
  const assetFiles = walk(ASSETS_DIR);
  assert.ok(assetFiles.length > 0, 'the asset scan found no files');

  const sourceFiles = walk(SRC_DIR).filter(
    (file) => /\.tsx?$/.test(file) && !/\.test\.tsx?$/.test(file),
  );
  for (const required of [
    path.join('components', 'CinematicPavilionPane.tsx'),
    path.join('scene', 'PortraitLive2DRig.ts'),
  ]) {
    assert.ok(sourceFiles.includes(path.join(SRC_DIR, required)), `the source scan never read ${required}`);
  }

  const sourceText = sourceFiles.map((file) => readFileSync(file, 'utf8'));
  for (const asset of assetFiles) {
    const relative = path.relative(SRC_DIR, asset).split(path.sep).join('/');
    assert.ok(
      sourceText.some((text) => text.includes(relative) || text.includes(path.basename(asset))),
      `unreferenced source asset: ${relative}`,
    );
  }
});
