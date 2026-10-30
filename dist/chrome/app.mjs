import { MAX_URLS, parseVideoUrls } from './video-batch.mjs';
import { importFile } from './video-import.mjs';
import { downloadVideo } from './direct.mjs';
import { saveVideo } from './save-video.mjs';
import { filterResults, exportResults, resultGroup } from './results.mjs';
const $ = id => document.getElementById(id);
let running = false, controller, currentRows = [];
function status(message) { $('status').textContent = message; }
function render(rows = currentRows) {
  currentRows = rows;
  const visible = filterResults(rows, $('filter').value);
  $('filtered-count').textContent = `${visible.length} of ${rows.length} rows shown`;
  $('export').disabled = !visible.length;
  $('results').replaceChildren(...visible.map(row => {
    const tr = document.createElement('tr'); tr.dataset.status = resultGroup(row);
    for (const text of [row.url || row.raw, row.status, row.filename || row.error || '—']) {
      const td = document.createElement('td'); td.textContent = text; tr.append(td);
    }
    return tr;
  }));
}
function inspect() {
  const rows = parseVideoUrls($('urls').value);
  const count = rows.filter(row => row.status === 'Ready').length;
  $('counts').textContent = `${count} valid unique URLs · ${rows.filter(r => r.status === 'Duplicate').length} duplicates · ${rows.filter(r => r.status === 'Invalid').length} unsupported URLs`;
  $('start').disabled = running || !count || count > MAX_URLS;
  if (!running) render(rows);
  if (count > MAX_URLS) status(`Reduce the batch to ${MAX_URLS} unique videos.`);
  return rows;
}
$('filter').addEventListener('change', () => render());
$('export').addEventListener('click', () => {
  const rows = filterResults(currentRows, $('filter').value);
  if (!rows.length) return;
  const format = $('export-format').value;
  const url = URL.createObjectURL(new Blob([exportResults(rows, format)], { type: format === 'csv' ? 'text/csv;charset=utf-8' : 'text/plain;charset=utf-8' }));
  const link = document.createElement('a'); link.href = url;
  link.download = `video-results-${$('filter').value}.${format}`;
  document.body.append(link); link.click(); link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
});
$('urls').addEventListener('input', () => { inspect(); });
$('clear').addEventListener('click', () => { $('urls').value = ''; inspect(); status('Ready. Add URLs to begin.'); });
$('file').addEventListener('change', async event => {
  const file = event.target.files[0]; if (!file) return;
  try { $('urls').value += '\n' + await importFile(file); inspect(); status('File imported. Review your URLs.'); }
  catch (error) { status(error.message); }
  finally { event.target.value = ''; }
});
$('stop').addEventListener('click', () => controller?.abort());
$('start').addEventListener('click', async () => {
  const rows = inspect().map(row => ({ ...row, status: row.status === 'Ready' ? 'Queued' : row.status }));
  const countQueued = rows.filter(row => row.status === 'Queued').length;
  if (!countQueued || countQueued > MAX_URLS || running) return;
  running = true; controller = new AbortController();
  for (const id of ['urls', 'file', 'clear', 'start']) $(id).disabled = true;
  $('stop').hidden = false;
  let count = 0, processed = 0;
  try {
    for (let i = 0; i < rows.length && !controller.signal.aborted; i++) {
      if (rows[i].status !== 'Queued') continue;
      processed++;
      rows[i].status = 'Downloading'; render(rows); status(`Downloading ${processed} of ${countQueued}…`);
      try {
        const result = await downloadVideo(rows[i].url, { signal: controller.signal, maxBytes: 100 * 1024 * 1024 });
        rows[i].status = 'Saving to Downloads'; render(rows);
        const saved = await saveVideo(result.blob, result.filename, { signal: controller.signal });
        count++;
        rows[i].status = result.note.replace(/^Done/, 'Saved'); rows[i].filename = saved.filename;
      } catch (error) {
        rows[i].status = controller.signal.aborted ? 'Cancelled' : 'Failed';
        rows[i].error = error instanceof TypeError ? 'Cannot reach the media provider. Check extension site permissions and retry.' : error.message;
      }
      render(rows);
    }
    for (const row of rows) if (row.status === 'Queued') row.status = 'Cancelled';
    render(rows);
    status(`${count} of ${countQueued} videos saved to Downloads/videos/. ${count ? 'Completed files are already on disk.' : 'Review the results above.'}`);
  } catch (error) { status(error.message); }
  finally {
    running = false; controller = null; $('stop').hidden = true; $('stop').disabled = false;
    for (const id of ['urls', 'file', 'clear']) $(id).disabled = false;
    const ready = parseVideoUrls($('urls').value).filter(row => row.status === 'Ready').length;
    $('start').disabled = !ready || ready > MAX_URLS;
  }
});
window.addEventListener('beforeunload', event => {
  if (running) { event.preventDefault(); event.returnValue = ''; }
});
inspect();
