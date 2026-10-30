import { normalizeVideoUrl, videoArchivePath } from './video-batch.mjs';

const LIMIT = 100 * 1024 * 1024;
export function mediaUrl(value) {
  const u = new URL(value);
  if (u.protocol !== 'https:' || u.username || u.password || u.port ||
      !(u.hostname === 'v.redd.it' || u.hostname.endsWith('.redgifs.com'))) throw new Error('Unsupported media host.');
  return u.href;
}
async function json(url, signal, fetcher, headers = {}, credentials = 'omit') {
  const response = await fetcher(url, { signal, credentials, redirect: 'error', headers });
  if (!response.ok) throw new Error(`Provider returned HTTP ${response.status}. The video may be unavailable or access restricted.`);
  return response.json();
}
export async function resolveVideo(value, { signal, fetcher = fetch } = {}) {
  const url = normalizeVideoUrl(value);
  if (!url) throw new Error('Unsupported video URL.');
  if (new URL(url).hostname === 'www.reddit.com') {
    if (/\/s\/[a-z0-9]+\/$/i.test(new URL(url).pathname)) {
      // Short share URLs need the provider's normal public redirect first.
      const response = await fetcher(url, { signal, credentials: 'omit', redirect: 'follow' });
      const target = normalizeVideoUrl(response.url);
      await response.body?.cancel();
      if (!response.ok) throw new Error(`Reddit share link returned HTTP ${response.status}. Open the link in Reddit and paste the full comments URL instead.`);
      if (!target || new URL(target).hostname !== 'www.reddit.com' || !/^\/comments\/[a-z0-9]+\/$/i.test(new URL(target).pathname)) throw new Error('Could not resolve Reddit share link. Open it in Reddit and paste the full comments URL instead.');
      return resolveVideo(target, { signal, fetcher });
    }
    let data;
    try {
      // Use only Reddit's existing browser session; never send it to media hosts.
      data = await json(`${url}.json?raw_json=1`, signal, fetcher, {}, 'include');
    } catch (error) {
      if (/HTTP (401|403)\b/.test(error.message)) throw new Error('Reddit denied access (HTTP 403/401). Sign in at https://www.reddit.com in this Chrome profile, confirm you can view the post, then retry. If it still fails, Reddit is restricting this API request; use the original RedGIFs URL when available.');
      throw error;
    }
    const post = data?.[0]?.data?.children?.[0]?.data;
    if (!post) throw new Error('Reddit post is unavailable.');
    const sources = [post, ...(post.crosspost_parent_list || [])];
    for (const source of sources) {
      const references = [source.url_overridden_by_dest, source.url];
      for (const embed of [source.secure_media?.oembed?.html, source.media?.oembed?.html, source.media_embed?.content, source.secure_media_embed?.content]) {
        references.push(...(String(embed || '').match(/https?:\/\/(?:www\.)?redgifs\.com\/(?:watch|ifr)\/[a-z0-9]+/gi) || []));
      }
      for (const reference of references) {
        const external = normalizeVideoUrl(reference);
        if (external && new URL(external).hostname === 'www.redgifs.com') {
          const result = await resolveVideo(external, { signal, fetcher });
          result.info.alt_title = post.title;
          return result;
        }
      }
    }
    const urls = [], manifests = [];
    let isGif = false;
    function add(value) {
      if (!value) return;
      try { const safe = mediaUrl(unescapeUrl(value)); if (!urls.includes(safe)) urls.push(safe); } catch {}
    }
    for (const source of sources) {
      const videos = [source.secure_media?.reddit_video, source.media?.reddit_video, source.preview?.reddit_video_preview];
      for (const video of videos) {
        if (!video) continue;
        add(video.fallback_url); isGif ||= !!video.is_gif;
        if (video.dash_url) manifests.push(video.dash_url);
      }
      for (const media of Object.values(source.media_metadata || {})) {
        if (media.e === 'RedditVideo') { add(media.fallback_url); if (media.dashUrl) manifests.push(media.dashUrl); }
        if (media.e === 'AnimatedImage') { add(media.s?.mp4); isGif = true; }
      }
      for (const image of source.preview?.images || []) {
        add(image.variants?.mp4?.source?.url);
        if (image.variants?.mp4?.source?.url) isGif = true;
      }
      for (const value of [source.url_overridden_by_dest, source.url]) {
        if (typeof value === 'string' && /\.mp4(?:[?#]|$)/i.test(value)) add(value);
      }
    }
    // Reddit sometimes supplies only a DASH manifest with complete MP4 BaseURLs.
    if (!urls.length) {
      for (const value of [...new Set(manifests)].slice(0, 3)) {
        try {
          const manifestUrl = mediaUrl(unescapeUrl(value));
          const response = await fetcher(manifestUrl, { signal, credentials: 'omit', redirect: 'error' });
          if (!response.ok) continue;
          const text = await response.text();
          if (text.length <= 1024 * 1024) for (const candidate of dashVideoUrls(text, manifestUrl)) add(candidate);
        } catch (error) { if (signal?.aborted) throw error; }
      }
    }
    if (!urls.length) throw new Error('This post has no supported downloadable MP4 in its video, preview or embedded media. It may contain photos, an unsupported external host, or segmented-only playback.');
    return { url: urls[0], urls, info: { title: post.title, id: post.id, extractor: 'Reddit' }, note: isGif ? 'Done' : 'Done — video only; separate audio is not merged' };
  }

  const id = new URL(url).pathname.split('/').pop();
  const auth = await json('https://api.redgifs.com/v2/auth/temporary', signal, fetcher);
  if (typeof auth.token !== 'string' || !auth.token) throw new Error('Provider authentication unavailable.');
  const data = await json(`https://api.redgifs.com/v2/gifs/${id}`, signal, fetcher, { Authorization: `Bearer ${auth.token}` });
  const gif = data.gif;
  const urls = [...new Set([gif?.urls?.hd, gif?.urls?.sd, /\.mp4(?:[?#]|$)/i.test(gif?.urls?.gif || '') ? gif.urls.gif : null].filter(Boolean).map(value => mediaUrl(unescapeUrl(value))))];
  if (!urls.length) throw new Error('RedGIFs did not supply a downloadable MP4. This item may be an image or unavailable.');
  return { url: urls[0], urls, info: { id, title: gif.title || gif.tags?.join(' ') || id, tags: gif.tags, extractor: 'RedGifs' }, note: 'Done' };
}
function unescapeUrl(value) {
  return String(value).replace(/&amp;/g, '&').replace(/&#38;/g, '&');
}
export function dashVideoUrls(text, manifestUrl) {
  const candidates = [];
  for (const match of text.matchAll(/<AdaptationSet\b([^>]*)>([\s\S]*?)<\/AdaptationSet>/gi)) {
    for (const rep of match[2].matchAll(/<Representation\b([^>]*)>([\s\S]*?)<\/Representation>/gi)) {
      if (!/(?:video\/mp4|contentType=["']video["']|\bwidth=)/i.test(match[1] + rep[1])) continue;
      if (/<Segment(?:Template|List)\b/i.test(match[2])) continue;
      const base = rep[2].match(/<BaseURL(?:\s[^>]*)?>([^<]+)<\/BaseURL>/i)?.[1];
      if (!base) continue;
      try {
        const url = mediaUrl(new URL(unescapeUrl(base.trim()), manifestUrl).href);
        if (/\.mp4(?:[?#]|$)/i.test(url)) candidates.push({ url, height: Number(rep[1].match(/height=["'](\d+)/i)?.[1] || 0) });
      } catch {}
    }
  }
  return candidates.sort((a, b) => b.height - a.height).map(item => item.url);
}
async function fetchVideo(url, { signal, fetcher, maxBytes }) {
  const response = await fetcher(url, { signal, credentials: 'omit', redirect: 'error' });
  if (!response.ok) { await response.body?.cancel(); throw new Error(`Media download returned HTTP ${response.status}.`); }
  const type = (response.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
  const generic = ['', 'application/octet-stream', 'binary/octet-stream', 'application/mp4'].includes(type);
  if (type !== 'video/mp4' && !generic) { await response.body?.cancel(); throw new Error(`Provider returned ${type || 'unknown content'}, not an MP4 video.`); }
  if (Number(response.headers.get('content-length')) > maxBytes) { await response.body?.cancel(); throw new Error('Video exceeds the 100 MB video limit.'); }
  const reader = response.body?.getReader();
  if (!reader) throw new Error('Video response is empty.');
  const chunks = []; let bytes = 0;
  try {
    while (true) {
      const { done, value: chunk } = await reader.read();
      if (done) break;
      bytes += chunk.byteLength;
      if (bytes > maxBytes) throw new Error('Video exceeds the 100 MB video limit.');
      chunks.push(chunk);
    }
  } catch (error) { await reader.cancel().catch(() => {}); throw error; }
  if (!bytes) throw new Error('Video response is empty.');
  const blob = new Blob(chunks, { type: 'video/mp4' });
  const header = new Uint8Array(await blob.slice(0, 64).arrayBuffer());
  const text = new TextDecoder().decode(header);
  if (/^\s*[<{]/.test(text) || (generic && String.fromCharCode(...header.slice(4, 8)) !== 'ftyp')) throw new Error('Provider did not return a valid MP4 file (login, error page or unsupported media).');
  return blob;
}
export async function downloadVideo(value, { signal, fetcher = fetch, maxBytes = LIMIT } = {}) {
  const resolved = await resolveVideo(value, { signal, fetcher });
  const errors = [];
  for (const url of resolved.urls || [resolved.url]) {
    try {
      const blob = await fetchVideo(url, { signal, fetcher, maxBytes });
      return { blob, filename: videoArchivePath(resolved.info), note: resolved.note };
    } catch (error) {
      if (signal?.aborted || error.name === 'AbortError') throw error;
      errors.push(error.message);
    }
  }
  throw new Error([...new Set(errors)].join(' '));
}
