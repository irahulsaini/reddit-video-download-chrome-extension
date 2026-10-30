import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import JSZip from 'jszip';
const root = new URL('../dist/chrome/', import.meta.url);
test('packages MV3 extension with local scripts and least-scope hosts', async () => {
  const manifest = JSON.parse(await readFile(new URL('manifest.json', root), 'utf8'));
  assert.equal(manifest.manifest_version, 3);
  assert.deepEqual(manifest.permissions, ['downloads']);
  assert.deepEqual(manifest.host_permissions, ['https://www.reddit.com/*', 'https://v.redd.it/*', 'https://*.redgifs.com/*']);
  assert.ok(!(await readFile(new URL('app.mjs', root), 'utf8')).includes('/api/tools/video-download'));
  const html = await readFile(new URL('index.html', root), 'utf8');
  assert.ok(!/<script[^>]+src=["']https?:/i.test(html));
  for (const file of ['app.mjs', 'background.js', 'video-import.mjs', 'video-batch.mjs', 'direct.mjs', 'save-video.mjs', 'vendor/jszip.min.js']) assert.ok((await readFile(new URL(file, root))).length);
  const packaged = await JSZip.loadAsync(await readFile(new URL(`../reddit-video-downloader-chrome-${manifest.version}.zip`, root)));
  assert.ok(packaged.file('manifest.json'));
  assert.equal(await packaged.file('video-batch.mjs').async('string'), await readFile(new URL('../../lib/video-batch.mjs', root), 'utf8'));
});
