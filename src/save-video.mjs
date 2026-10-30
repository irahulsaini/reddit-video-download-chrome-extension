import { safeVideoName } from './video-batch.mjs';

export function downloadPath(filename) {
  const parts = String(filename).split('/');
  if (parts.length !== 2 || parts.some(part => !part || part === '.' || part === '..' || part.includes('\\')) || !/\.mp4$/i.test(parts[1])) throw new Error('Invalid video download path.');
  return `videos/${safeVideoName(parts[0], 'other').toLowerCase()}/${safeVideoName(parts[1].slice(0, -4))}.mp4`;
}

// Wait for Chrome to confirm the file is saved before releasing its blob URL.
export async function saveVideo(blob, filename, { signal, overwrite = false, api = chrome.downloads, urls = URL } = {}) {
  const destination = downloadPath(filename);
  if (signal?.aborted) throw new DOMException('Download cancelled.', 'AbortError');
  const url = urls.createObjectURL(blob);
  let id;
  try {
    id = await api.download({ url, filename: destination, conflictAction: overwrite === true ? 'overwrite' : 'uniquify', saveAs: false });
    return await new Promise((resolve, reject) => {
      let settled = false;
      let actualPath = destination;
      function finish(error) {
        if (settled) return;
        settled = true;
        api.onChanged.removeListener(changed);
        signal?.removeEventListener('abort', cancel);
        if (error) reject(error);
        else resolve({ id, filename: actualPath });
      }
      function trackFilename(value) {
        if (!value) return;
        const normalized = value.replace(/\\/g, '/');
        const index = normalized.lastIndexOf('/videos/');
        actualPath = index >= 0 ? normalized.slice(index + 1) : destination;
      }
      function changed(delta) {
        if (delta.id !== id) return;
        trackFilename(delta.filename?.current);
        if (delta.state?.current === 'complete') finish();
        else if (delta.state?.current === 'interrupted') finish(new Error(`Chrome could not save this video (${delta.error?.current || 'download interrupted'}).`));
      }
      function cancel() {
        if (settled) return;
        Promise.resolve(api.cancel(id)).catch(() => {});
        finish(new DOMException('Download cancelled.', 'AbortError'));
      }
      api.onChanged.addListener(changed);
      signal?.addEventListener('abort', cancel, { once: true });
      if (signal?.aborted) { cancel(); return; }
      // A small file may finish before download() returns its ID.
      Promise.resolve(api.search({ id })).then(items => {
        if (settled) return;
        const item = items[0];
        if (!item) { finish(new Error('Chrome download is no longer available.')); return; }
        trackFilename(item.filename);
        if (item.state === 'complete') finish();
        else if (item.state === 'interrupted') finish(new Error(`Chrome could not save this video (${item.error || 'download interrupted'}).`));
      }).catch(finish);
    });
  } finally { urls.revokeObjectURL(url); }
}
