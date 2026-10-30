# Reddit & RedGIFs Batch Downloader

Chrome extension v1.3.2. Downloads supported Reddit and RedGIFs videos directly into `Downloads/videos/{category}/{title}.mp4`. No VPS, local download server, yt-dlp or FFmpeg is required.

[Download Chrome extension v1.3.2](https://github.com/irahulsaini/reddit-video-download-chrome-extension/raw/refs/tags/v1.3.2/dist/reddit-video-downloader-chrome-1.3.2.zip) · [Website tool and installation guide](https://www.irahulsaini.com/tools/reddit-video-downloader)

## Install

1. Download and extract the extension ZIP above.
2. Open `chrome://extensions`, enable **Developer mode**, then select **Load unpacked**.
3. Choose the extracted folder containing `manifest.json`.
4. Click the extension toolbar button to open its downloader tab. For Reddit links, sign in to Reddit in the same Chrome profile first.
5. Paste URLs or import XLSX, TXT, CSV or TSV. Review validation, then click **Download videos**. Keep the tab open until processing finishes.

To update an existing installation, replace its files with the new package, click **Reload** on the extension card, approve new permissions if prompted and reopen the downloader tab. This is a manually installed extension, not a Chrome Web Store listing.

## Features

- No URL-count cap. Videos are downloaded and saved sequentially, with 100 MB per video and no combined ZIP limit.
- Automatic saves under `videos/{category}/{title}.mp4` inside your configured Downloads directory. The first RedGIFs hashtag selects the category; native Reddit clips and untagged videos use `other/`.
- Reddit titles preserved for posts linking to RedGIFs; duplicate filenames numbered by Chrome by default. Check **Overwrite existing files** before starting to replace an exact category/filename match instead. The option is off by default and locked while the batch runs.
- Accepts full post URLs and `/r/`, `/user/` and `/u/` share links, including relative Reddit post/share paths.
- Per-item progress and errors. Filter Success, Failed, Invalid URLs, Cancelled, Pending / processing or Duplicates.
- Export only the currently filtered rows as CSV details or TXT URLs. CSV values are escaped and formula-like values protected.
- Stop cancels the current fetch/save and skips remaining work; completed files stay on disk.
- Checks original and crossposted videos, Reddit previews, animated MP4 previews, RedGIFs embeds and complete MP4 links in simple DASH manifests. HD failures fall back to SD; generic binary files require MP4 identification.

## Limits and privacy

Native Reddit MP4s may be video-only: separate audio tracks are not merged. Photos, segmented-only streams, unsupported external hosts, private/deleted media and provider access restrictions are not bypassed. Chrome download protections and managed policies still apply. Provider APIs can change; the user-reported failing live links have not yet been supplied for verification.

The extension contacts Reddit and RedGIFs directly. Reddit metadata uses the existing signed-in browser session; extension code does not read cookies or send them to media hosts. RedGIFs and video requests omit credentials. Share links follow public redirects, validate the resulting Reddit post and then request metadata. Host access is limited to www.reddit.com, v.redd.it and RedGIFs subdomains. The Downloads permission saves files automatically; no browsing-history or content-script access is requested.

Batch state and temporary provider tokens are held in memory. One video is held until Chrome confirms saving, then its blob URL is released. Closing the tab loses unsaved work but keeps completed files. JSZip is bundled locally only for Excel imports. No remote scripts execute.

## Development

Requires Node.js 20 or newer:

```sh
npm ci
npm test
```

`npm test` builds and runs all regression tests. To build without testing, run `npm run build`.

- `src/`: extension application and Manifest V3 configuration.
- `lib/`: self-contained URL validation and file-import helpers.
- `dist/chrome/`: installable unpacked extension.
- `dist/reddit-video-downloader-chrome-1.3.2.zip`: packaged extension, with `manifest.json` at the ZIP root.

The regression tests cover URL validation, media extraction, streamed size limits, filters, exports, download completion/cancellation and packaging. Real Chrome/provider behavior still needs live verification.

## Publishing updates

Update `src/manifest.json` and `package.json` versions, run `npm test`, and commit the regenerated `dist/` assets. Tag the tested commit as `v{version}` and push the commit and tag. Update the website's `data/reddit-video-downloader-release.json` to point to that tag's versioned ZIP. The extension build does not write into or depend on the website repository.
