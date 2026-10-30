import JSZip from 'jszip';

export async function importFile(file) {
  if (file.size > 2 * 1024 * 1024) throw new Error('Import files up to 2 MB.');
  if (/\.(txt|csv|tsv)$/i.test(file.name)) return file.text();
  if (!/\.xlsx$/i.test(file.name)) throw new Error('Use .xlsx, .txt, .csv or .tsv. Save legacy .xls files as .xlsx first.');
  const zip = await JSZip.loadAsync(file);
  const names = Object.keys(zip.files).filter(name => /^xl\/(sharedStrings\.xml|worksheets\/sheet\d+\.xml)$/.test(name));
  if (names.length > 100) throw new Error('Workbook has too many sheets.');
  let size = 0;
  const output = [];
  for (const name of names) {
    // Reject compressed workbook bombs before decompression.
    const entry = zip.file(name);
    size += entry?._data?.uncompressedSize || 0;
    if (size > 8 * 1024 * 1024) throw new Error('Workbook expands beyond the 8 MB limit.');
    const xml = new DOMParser().parseFromString(await entry.async('string'), 'application/xml');
    if (xml.querySelector('parsererror')) throw new Error('Invalid Excel workbook.');
    output.push(...Array.from(xml.querySelectorAll('t, v'), node => node.textContent));
    for (const link of xml.querySelectorAll('hyperlink')) output.push(link.getAttribute('location') || '');
  }
  // Excel hyperlink targets can live in worksheet relationship files.
  for (const name of Object.keys(zip.files).filter(name => /^xl\/worksheets\/_rels\/sheet\d+\.xml.rels$/.test(name))) {
    const entry = zip.file(name);
    size += entry?._data?.uncompressedSize || 0;
    if (size > 8 * 1024 * 1024) throw new Error('Workbook is too large.');
    const xml = new DOMParser().parseFromString(await entry.async('string'), 'application/xml');
    for (const rel of xml.querySelectorAll('Relationship')) output.push(rel.getAttribute('Target') || '');
  }
  return output.join('\n');
}

