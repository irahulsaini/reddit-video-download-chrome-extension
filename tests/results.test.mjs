import test from 'node:test';
import assert from 'node:assert/strict';
import { filterResults, exportResults } from '../dist/chrome/results.mjs';
const rows = [
  { raw: 'https://redd.it/1', url: 'https://www.reddit.com/comments/1/', status: 'Saved — video only; separate audio is not merged', filename: 'videos/other/title.mp4' },
  { raw: 'https://redd.it/2', url: 'https://www.reddit.com/comments/2/', status: 'Failed', error: 'Bad "MP4", retry' },
  { raw: 'https://example.com/', status: 'Invalid' },
  { raw: 'https://redd.it/3', status: 'Cancelled' },
];
test('filters success, failures and invalid URLs independently', () => {
  assert.equal(filterResults(rows, 'success').length, 1);
  assert.equal(filterResults(rows, 'failed')[0].error, 'Bad "MP4", retry');
  assert.equal(filterResults(rows, 'invalid').length, 1);
  assert.equal(filterResults(rows, 'cancelled').length, 1);
  assert.equal(filterResults(rows).length, 4);
});
test('exports exactly the filtered snapshot with CSV escaping and spreadsheet protection', () => {
  const filtered = filterResults(rows, 'failed');
  const csv = exportResults(filtered);
  assert.match(csv, /Bad ""MP4"", retry/);
  assert.ok(!csv.includes('videos/other/title.mp4'));
  assert.equal(exportResults(filtered, 'txt'), 'https://www.reddit.com/comments/2/\r\n');
  assert.ok(exportResults([{ raw: '=CMD()', status: 'Failed' }]).includes("'=CMD()"));
});
