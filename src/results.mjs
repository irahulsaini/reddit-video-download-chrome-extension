export function resultGroup(row) {
  if (/^(Saved|Done)\b/.test(row.status)) return 'success';
  if (row.status === 'Failed') return 'failed';
  if (row.status === 'Invalid') return 'invalid';
  if (row.status === 'Cancelled') return 'cancelled';
  if (row.status === 'Duplicate') return 'duplicate';
  return 'pending';
}
export function filterResults(rows, filter = 'all') {
  return filter === 'all' ? rows : rows.filter(row => resultGroup(row) === filter);
}
function csvCell(value) {
  let text = String(value || '');
  if (/^[\s\x00-\x1f]*[=+@-]/.test(text)) text = "'" + text;
  return `"${text.replace(/"/g, '""')}"`;
}
export function exportResults(rows, format = 'csv') {
  if (format === 'txt') return rows.map(row => row.url || row.raw).join('\r\n') + (rows.length ? '\r\n' : '');
  return '\ufeff' + [['Original URL', 'Validated URL', 'Status', 'Download path', 'Details'], ...rows.map(row => [row.raw, row.url, row.status, row.filename, row.error])].map(row => row.map(csvCell).join(',')).join('\r\n');
}
