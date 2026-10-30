export const MAX_URLS = 25;
export function normalizeVideoUrl(value) {
  try {
    const input = String(value || '').trim();
    const u = new URL(/^\/(?:r|u|user|comments)\//i.test(input) ? `https://www.reddit.com${input}` : input);
    if (!['https:', 'http:'].includes(u.protocol) || u.username || u.password || u.port) return null;
    const host = u.hostname.toLowerCase();
    let match;
    if (['reddit.com', 'www.reddit.com', 'old.reddit.com', 'm.reddit.com'].includes(host)) {
      const share = u.pathname.match(/^\/(r|user|u)\/([a-z0-9_-]+)\/s\/([a-z0-9]+)\/?$/i);
      if (share) return `https://www.reddit.com/${share[1]}/${share[2]}/s/${share[3]}/`;
      match = u.pathname.match(/^\/(?:(?:r|user|u)\/[^/]+\/)?comments\/([a-z0-9]+)(?:\/|$)/i);
      if (match) return `https://www.reddit.com/comments/${match[1]}/`;
    }
    if (host === 'redd.it' && /^\/[a-z0-9]+\/?$/i.test(u.pathname)) return `https://www.reddit.com/comments/${u.pathname.split('/')[1]}/`;
    if (['redgifs.com', 'www.redgifs.com'].includes(host)) {
      match = u.pathname.match(/^\/(?:watch|ifr)\/([a-z0-9]+)\/?$/i);
      if (match) return `https://www.redgifs.com/watch/${match[1]}`;
    }
  } catch {}
  return null;
}
export function parseVideoUrls(input) {
  const tokens = String(input).match(/https?:\/\/[^\s<>"',;]+|\/(?:r|u|user|comments)\/[^\s<>"',;]+/gi) || [];
  const seen = new Set();
  return tokens.map(raw => {
    const url = normalizeVideoUrl(raw.replace(/[)\].]+$/, ''));
    const status = !url ? 'Invalid' : seen.has(url) ? 'Duplicate' : 'Ready';
    if (url) seen.add(url);
    return { raw, url, status };
  });
}
export function safeVideoName(value, fallback = 'video') {
  const name = String(value || '').normalize('NFKC').replace(/[\x00-\x1f\x7f<>:"/\\|?*]/g, ' ').replace(/\s+/g, ' ').replace(/^[. ]+|[. ]+$/g, '').slice(0, 140).trim();
  return !name || /^(con|prn|aux|nul|com[0-9]|lpt[0-9])(?:\.|$)/i.test(name) ? fallback : name;
}
export function videoArchivePath(info, used = new Set()) {
  const tags = Array.isArray(info.tags) ? info.tags : Array.isArray(info.categories) ? info.categories : [];
  const redgifs = /redgifs/i.test(`${info.extractor_key || ''} ${info.extractor || ''} ${info.webpage_url || ''}`);
  const folder = redgifs && tags.length ? safeVideoName(String(tags[0]).replace(/^#/, ''), 'other').toLowerCase() : 'other';
  const title = safeVideoName(info.alt_title || info.title || info.id);
  let path = `${folder}/${title}.mp4`, index = 2;
  while (used.has(path.toLowerCase())) path = `${folder}/${title} (${index++}).mp4`;
  used.add(path.toLowerCase());
  return path;
}
