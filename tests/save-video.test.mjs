import test from 'node:test';
import assert from 'node:assert/strict';
import { saveVideo, downloadPath } from '../dist/chrome/save-video.mjs';
function browser(item = { id: 7, state: 'in_progress', filename: '/Users/test/Downloads/videos/games/Title (1).mp4' }) {
  const listeners = new Set(), revoked = [], cancelled = [], requests = [];
  return {
    api: {
      download: async options => { requests.push(options); return 7; },
      search: async () => [item], cancel: async id => { cancelled.push(id); },
      onChanged: { addListener: fn => listeners.add(fn), removeListener: fn => listeners.delete(fn) },
    },
    urls: { createObjectURL: () => 'blob:test', revokeObjectURL: value => revoked.push(value) },
    emit: delta => { for (const listener of listeners) listener(delta); },
    revoked, cancelled, requests, listeners,
  };
}
const tick = () => new Promise(resolve => setImmediate(resolve));
test('saves beneath videos with collision numbering and waits for completion', async () => {
  const fake = browser(); let finished = false;
  const pending = saveVideo(new Blob(['mp4']), 'games/Title.mp4', fake).then(result => { finished = true; return result; });
  await tick(); assert.equal(finished, false);
  assert.deepEqual(fake.requests[0], { url: 'blob:test', filename: 'videos/games/Title.mp4', conflictAction: 'uniquify', saveAs: false });
  assert.equal(fake.revoked.length, 0);
  fake.emit({ id: 999, state: { current: 'complete' } }); assert.equal(finished, false);
  fake.emit({ id: 7, state: { current: 'complete' } });
  assert.equal((await pending).filename, 'videos/games/Title (1).mp4');
  assert.deepEqual(fake.revoked, ['blob:test']); assert.equal(fake.listeners.size, 0);
});
test('handles downloads that finish before the listener attaches', async () => {
  const fake = browser({ id: 7, state: 'complete' });
  assert.equal((await saveVideo(new Blob(['mp4']), 'other/clip.mp4', fake)).filename, 'videos/other/clip.mp4');
  assert.equal(fake.listeners.size, 0);
});
test('reports interrupted downloads and releases resources', async () => {
  const fake = browser(); const pending = saveVideo(new Blob(['mp4']), 'games/Title.mp4', fake);
  const rejection = assert.rejects(pending, /FILE_NO_SPACE/);
  await tick(); fake.emit({ id: 7, state: { current: 'interrupted' }, error: { current: 'FILE_NO_SPACE' } });
  await rejection; assert.equal(fake.listeners.size, 0); assert.equal(fake.revoked.length, 1);
});
test('Stop cancels only the active Chrome download', async () => {
  const fake = browser(), controller = new AbortController();
  const pending = saveVideo(new Blob(['mp4']), 'other/clip.mp4', { ...fake, signal: controller.signal });
  const rejection = assert.rejects(pending, { name: 'AbortError' });
  await tick(); controller.abort(); await rejection;
  assert.deepEqual(fake.cancelled, [7]); assert.equal(fake.listeners.size, 0); assert.equal(fake.revoked.length, 1);
});
test('rejects unsafe paths and reports download permission failures', async () => {
  for (const path of ['../clip.mp4', 'games/../clip.mp4', '/clip.mp4', 'games/a\\b.mp4']) assert.throws(() => downloadPath(path));
  const fake = browser(); fake.api.download = async () => { throw new Error('Permission denied'); };
  await assert.rejects(saveVideo(new Blob(['mp4']), 'games/clip.mp4', fake), /Permission denied/);
  assert.equal(fake.revoked.length, 1);
});

test('overwrite replaces the exact destination only when explicitly enabled', async () => {
  for (const overwrite of [true, false, undefined, 'true']) {
    const fake = browser({ id: 7, state: 'complete' });
    await saveVideo(new Blob(['mp4']), 'games/Title.mp4', { ...fake, overwrite });
    assert.equal(fake.requests[0].conflictAction, overwrite === true ? 'overwrite' : 'uniquify');
    assert.equal(fake.requests[0].filename, 'videos/games/Title.mp4');
  }
});
