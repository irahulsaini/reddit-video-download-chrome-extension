import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { MAX_URLS, parseVideoUrls } from '../dist/chrome/video-batch.mjs';
import { filterResults, exportResults, resultGroup } from '../dist/chrome/results.mjs';

test('table keeps invalid/duplicate rows and exports only the active filter after a batch', async () => {
  function element() {
    return { value: '', children: [], dataset: {}, handlers: {}, disabled: false, checked: false,
      addEventListener(name, fn) { this.handlers[name] = fn; },
      append(child) { this.children.push(child); },
      replaceChildren(...children) { this.children = children; }, click() {}, remove() {},
    };
  }
  const ids = Object.fromEntries(['results', 'filter', 'filtered-count', 'export', 'urls', 'counts', 'start', 'clear', 'file', 'stop', 'status', 'export-format', 'overwrite'].map(id => [id, element()]));
  ids.filter.value = 'all'; ids['export-format'].value = 'txt';
  let exported; const savedOptions = [];
  const source = (await readFile(new URL('../dist/chrome/app.mjs', import.meta.url), 'utf8')).replace(/^import .+;\n/gm, '');
  vm.runInNewContext(source, {
    MAX_URLS, parseVideoUrls, filterResults, exportResults, resultGroup, Blob, AbortController,
    importFile: async () => '',
    downloadVideo: async url => { if (url.includes('/bad/')) throw new Error('Provider rejected file'); return { blob: new Blob(['mp4']), filename: 'other/title.mp4', note: 'Done' }; },
    saveVideo: async (blob, filename, options) => { savedOptions.push(options); assert.equal(ids.overwrite.disabled, true); return { filename: 'videos/other/title.mp4' }; },
    document: { getElementById: id => ids[id], createElement: element, body: element() },
    window: { addEventListener() {} },
    URL: { createObjectURL(blob) { exported = blob; return 'blob:export'; }, revokeObjectURL() {} },
    setTimeout() {},
  });
  ids.urls.value = 'https://redd.it/good\nhttps://redd.it/bad\nhttps://example.com/video\nhttps://redd.it/good';
  ids.urls.handlers.input();
  assert.equal(ids.results.children.length, 4);
  await ids.start.handlers.click();
  assert.equal(ids.results.children.length, 4);
  assert.equal(savedOptions[0].overwrite, false);
  assert.equal(ids.overwrite.disabled, false);
  ids.filter.value = 'success'; ids.filter.handlers.change();
  assert.equal(ids.results.children.length, 1);
  assert.match(ids.results.children[0].children[1].textContent, /Saved/);
  ids.filter.value = 'failed'; ids.filter.handlers.change();
  assert.equal(ids.results.children.length, 1);
  ids.export.handlers.click();
  assert.equal(await exported.text(), 'https://www.reddit.com/comments/bad/\r\n');
  ids.filter.value = 'invalid'; ids.filter.handlers.change();
  assert.equal(ids.results.children.length, 1);
  ids.overwrite.checked = true;
  await ids.start.handlers.click();
  assert.equal(savedOptions.at(-1).overwrite, true);
});
