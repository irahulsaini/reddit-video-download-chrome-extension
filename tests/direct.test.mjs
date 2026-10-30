import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveVideo, downloadVideo, mediaUrl } from '../dist/chrome/direct.mjs';
const postUrl = 'https://www.reddit.com/comments/abc123/';
const post = [{ data: { children: [{ data: { title: '../Example', id: 'abc123', secure_media: { reddit_video: { fallback_url: 'https://v.redd.it/example/DASH_720.mp4', is_gif: false } } } }] } }];
const reply = data => new Response(JSON.stringify(data), { headers: { 'content-type': 'application/json' } });
test('resolves Reddit direct video and explicitly reports missing merged audio', async () => {
  const result = await resolveVideo(postUrl, { fetcher: async () => reply(post) });
  assert.equal(result.url, 'https://v.redd.it/example/DASH_720.mp4');
  assert.match(result.note, /video only/);
});
test('rejects unrelated, insecure and credential-bearing media URLs', () => {
  for (const url of ['https://evil.test/a.mp4', 'https://redgifs.com.evil.test/a.mp4', 'http://v.redd.it/a.mp4', 'https://user@v.redd.it/a.mp4']) assert.throws(() => mediaUrl(url));
});
test('downloads supported MP4 and enforces streamed size limit without content-length', async () => {
  const fetcher = async url => url.includes('.json') ? reply(post) : new Response(new Uint8Array(8), { headers: { 'content-type': 'video/mp4' } });
  const result = await downloadVideo(postUrl, { fetcher });
  assert.equal(result.blob.size, 8); assert.ok(result.filename.startsWith('other/')); assert.ok(!result.filename.includes('../'));
  await assert.rejects(downloadVideo(postUrl, { fetcher, maxBytes: 4 }), /limit/);
});
test('uses temporary RedGIFs token only on metadata request and preserves tags', async () => {
  const calls = [];
  const fetcher = async (url, options) => {
    calls.push([url, options]);
    return reply(url.includes('/auth/') ? { token: 'test-token' } : { gif: { tags: ['Example'], urls: { hd: 'https://media.redgifs.com/example.mp4' } } });
  };
  const result = await resolveVideo('https://www.redgifs.com/watch/example', { fetcher });
  assert.equal(calls[1][1].headers.Authorization, 'Bearer test-token');
  assert.deepEqual(result.info.tags, ['Example']);
});
test('provider errors and invalid content are actionable failures', async () => {
  await assert.rejects(resolveVideo(postUrl, { fetcher: async () => new Response('', { status: 403 }) }), /403/);
  await assert.rejects(downloadVideo(postUrl, { fetcher: async url => url.includes('.json') ? reply(post) : new Response('<html>', { headers: { 'content-type': 'text/html' } }) }), /MP4/);
});
test('Reddit metadata uses the existing session while media requests omit credentials', async () => {
  const calls = [];
  await downloadVideo(postUrl, { fetcher: async (url, options) => {
    calls.push(options);
    return url.includes('.json') ? reply(post) : new Response(new Uint8Array(8), { headers: { 'content-type': 'video/mp4' } });
  } });
  assert.equal(calls[0].credentials, 'include');
  assert.equal(calls[1].credentials, 'omit');
});
test('Reddit access denial gives sign-in guidance and does not retry restricted endpoints', async () => {
  let calls = 0;
  await assert.rejects(resolveVideo(postUrl, { fetcher: async () => { calls++; return new Response('', { status: 403 }); } }), /Sign in.*still fails/);
  assert.equal(calls, 1);
});
test('resolves share links to a validated full Reddit post before fetching metadata', async () => {
  const calls = [];
  const result = await resolveVideo('https://www.reddit.com/r/games/s/AbC123', { fetcher: async (url, options) => {
    calls.push([url, options]);
    if (url.includes('/s/')) return { ok: true, url: postUrl, body: { cancel: async () => {} } };
    return reply(post);
  } });
  assert.equal(result.info.id, 'abc123');
  assert.equal(calls[0][1].credentials, 'omit');
  assert.equal(calls[1][0], `${postUrl}.json?raw_json=1`);
});
test('rejects share links that fail to resolve to a Reddit comments URL', async () => {
  for (const url of ['https://evil.test/comments/abc123', 'https://www.reddit.com/login', 'https://www.reddit.com/r/games/s/AbC123']) {
    await assert.rejects(resolveVideo('https://www.reddit.com/r/games/s/AbC123', { fetcher: async () => ({ ok: true, url }) }), /Could not resolve/);
  }
});

test('resolves /u/ share links', async () => {
  const result = await resolveVideo('https://reddit.com/u/SomeUser/s/AbCd', { fetcher: async url => url.includes('/s/') ? { ok: true, url: postUrl } : reply(post) });
  assert.equal(result.info.id, 'abc123');
});
function redditReply(fields) { return reply([{ data: { children: [{ data: { title: 'Original title', id: 'abc123', ...fields } }] } }]); }
test('finds Reddit preview videos and animated image MP4 variants', async () => {
  for (const fields of [
    { preview: { reddit_video_preview: { fallback_url: 'https://v.redd.it/preview/DASH_720.mp4' } } },
    { preview: { images: [{ variants: { mp4: { source: { url: 'https://v.redd.it/animated.mp4?a=1&amp;b=2' } } } }] } },
    { media_metadata: { animation: { e: 'AnimatedImage', s: { mp4: 'https://v.redd.it/animated.mp4' } } } },
  ]) {
    const result = await resolveVideo(postUrl, { fetcher: async () => redditReply(fields) });
    assert.match(result.url, /^https:\/\/v.redd.it\//); assert.ok(!result.url.includes('&amp;'));
  }
});
test('keeps original post media when a crosspost parent has no media', async () => {
  const result = await resolveVideo(postUrl, { fetcher: async () => redditReply({ crosspost_parent_list: [{}], secure_media: { reddit_video: { fallback_url: 'https://v.redd.it/original.mp4' } } }) });
  assert.equal(result.url, 'https://v.redd.it/original.mp4');
});
test('finds RedGIFs iframe embeds and preserves Reddit title', async () => {
  const result = await resolveVideo(postUrl, { fetcher: async url => {
    if (url.includes('.json')) return redditReply({ secure_media: { oembed: { html: '<iframe src="https://www.redgifs.com/ifr/Example"></iframe>' } } });
    return reply(url.includes('/auth/') ? { token: 'test' } : { gif: { urls: { hd: 'https://media.redgifs.com/example.mp4' } } });
  } });
  assert.equal(result.info.alt_title, 'Original title'); assert.equal(result.info.extractor, 'RedGifs');
});
test('accepts generic binary content only when MP4 bytes identify the file', async () => {
  const mp4 = new Uint8Array([0, 0, 0, 16, 102, 116, 121, 112, 105, 115, 111, 109, 0, 0, 0, 0]);
  const result = await downloadVideo(postUrl, { fetcher: async url => url.includes('.json') ? reply(post) : new Response(mp4, { headers: { 'content-type': 'application/octet-stream' } }) });
  assert.equal(result.blob.size, 16);
  await assert.rejects(downloadVideo(postUrl, { fetcher: async url => url.includes('.json') ? reply(post) : new Response('not a video', { headers: { 'content-type': 'application/octet-stream' } }) }), /valid MP4/);
});
test('tries SD when RedGIFs HD returns an HTML error page', async () => {
  const calls = [];
  const result = await downloadVideo('https://www.redgifs.com/watch/Example', { fetcher: async url => {
    calls.push(url);
    if (url.includes('/auth/')) return reply({ token: 'test' });
    if (url.includes('/gifs/')) return reply({ gif: { tags: ['Games'], urls: { hd: 'https://media.redgifs.com/hd.mp4', sd: 'https://media.redgifs.com/sd.mp4' } } });
    return url.includes('/hd.') ? new Response('<html>error</html>', { headers: { 'content-type': 'text/html' } }) : new Response(new Uint8Array(8), { headers: { 'content-type': 'video/mp4' } });
  } });
  assert.ok(calls.includes('https://media.redgifs.com/sd.mp4')); assert.equal(result.blob.size, 8);
});
test('resolves complete video MP4 BaseURLs from a DASH-only post', async () => {
  const result = await resolveVideo(postUrl, { fetcher: async url => url.includes('.json') ? redditReply({ media_metadata: { clip: { e: 'RedditVideo', dashUrl: 'https://v.redd.it/clip/DASHPlaylist.mpd' } } }) : new Response('<MPD><AdaptationSet mimeType="video/mp4"><Representation height="720"><BaseURL>DASH_720.mp4</BaseURL></Representation></AdaptationSet><AdaptationSet mimeType="audio/mp4"><Representation><BaseURL>audio.mp4</BaseURL></Representation></AdaptationSet></MPD>') });
  assert.equal(result.url, 'https://v.redd.it/clip/DASH_720.mp4');
});
test('does not mislabel photos or unsupported media as downloadable MP4', async () => {
  await assert.rejects(resolveVideo(postUrl, { fetcher: async () => redditReply({ url: 'https://i.redd.it/photo.jpg' }) }), /photos.*unsupported external host/);
});
