import { cp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import JSZip from 'jszip';
const root = path.dirname(fileURLToPath(import.meta.url));
const output = path.join(root, 'dist/chrome');
await rm(output, { recursive: true, force: true });
await mkdir(path.join(output, 'vendor'), { recursive: true });
await cp(path.join(root, 'src'), output, { recursive: true });
await cp(path.join(root, 'lib/video-batch.mjs'), path.join(output, 'video-batch.mjs'));
const importer = (await readFile(path.join(root, 'lib/video-import.mjs'), 'utf8')).replace("import JSZip from 'jszip';", 'const JSZip = globalThis.JSZip;');
await writeFile(path.join(output, 'video-import.mjs'), importer);
await cp(path.join(root, 'node_modules/jszip/dist/jszip.min.js'), path.join(output, 'vendor/jszip.min.js'));
await cp(path.join(root, 'node_modules/jszip/LICENSE.markdown'), path.join(output, 'vendor/JSZip-LICENSE.markdown'));
const zip = new JSZip();
const { readdir } = await import('node:fs/promises');
async function add(directory, prefix = '') {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const filename = path.join(directory, entry.name), relative = prefix + entry.name;
    if (entry.isDirectory()) await add(filename, relative + '/');
    else zip.file(relative, await readFile(filename));
  }
}
await add(output);
const manifest = JSON.parse(await readFile(path.join(output, 'manifest.json'), 'utf8'));
const filename = `reddit-video-downloader-chrome-${manifest.version}.zip`;
const archive = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
await writeFile(path.join(root, 'dist', filename), archive);
console.log(`Chrome extension built: ${output}`);
