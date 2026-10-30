import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeVideoUrl, parseVideoUrls, safeVideoName, videoArchivePath } from '../lib/video-batch.mjs';
test('canonicalizes supported URLs and identifies invalid URLs and duplicates', () => {
  assert.equal(normalizeVideoUrl('https://old.reddit.com/r/games/comments/ABC123/title/'), 'https://www.reddit.com/comments/ABC123/');
  assert.deepEqual(parseVideoUrls('https://redd.it/abc123\nhttps://www.reddit.com/comments/abc123/\nhttps://example.com/video').map(r => r.status), ['Ready', 'Duplicate', 'Invalid']);
  for (const url of ['https://reddit.com.evil.test/comments/abc/', 'https://evil@reddit.com/comments/abc/', 'https://reddit.com:444/comments/abc/', 'https://redgifs.com/users/name', 'http://127.0.0.1/', 'file:///etc/passwd']) assert.equal(normalizeVideoUrl(url), null);
});
test('organizes tags, preserves Reddit titles and safely handles collisions', () => {
  const used = new Set(); const info = { extractor: 'RedGifs', title: 'tags', alt_title: 'The day of sigma', tags: ['#games', 'action'] };
  assert.equal(videoArchivePath(info, used), 'games/The day of sigma.mp4');
  assert.equal(videoArchivePath(info, used), 'games/The day of sigma (2).mp4');
  assert.equal(videoArchivePath({ extractor: 'Reddit', title: '../A/B', tags: ['ignored'] }), 'other/A B.mp4');
  assert.equal(videoArchivePath({ extractor: 'RedGifs', title: 'clip', tags: [] }), 'other/clip.mp4');
  assert.equal(safeVideoName('CON'), 'video');
});
test('accepts Reddit share URLs and preserves case-sensitive share tokens', () => {
  assert.equal(normalizeVideoUrl('https://www.reddit.com/r/Games/s/AbC123?utm_source=share'), 'https://www.reddit.com/r/Games/s/AbC123/');
  assert.equal(parseVideoUrls('https://reddit.com/r/games/s/AbC123')[0].status, 'Ready');
});

test('preserves case in usernames, communities, post IDs and provider identifiers', () => {
  assert.equal(normalizeVideoUrl('https://reddit.com/user/MixedUser/s/AbCd'), 'https://www.reddit.com/user/MixedUser/s/AbCd/');
  assert.equal(normalizeVideoUrl('https://reddit.com/r/MixedCommunity/s/AbCd'), 'https://www.reddit.com/r/MixedCommunity/s/AbCd/');
  assert.equal(normalizeVideoUrl('https://redd.it/AbCd'), 'https://www.reddit.com/comments/AbCd/');
  assert.equal(normalizeVideoUrl('https://redgifs.com/watch/MixedCase'), 'https://www.redgifs.com/watch/MixedCase');
});

test('accepts /u/ user share links and profile comments', () => {
  assert.equal(normalizeVideoUrl('https://www.reddit.com/u/Mixed_User/s/AbCd12?share=1'), 'https://www.reddit.com/u/Mixed_User/s/AbCd12/');
  assert.equal(normalizeVideoUrl('https://reddit.com/u/SomeUser/comments/Ab12/title'), 'https://www.reddit.com/comments/Ab12/');
});

test('accepts pasted relative Reddit user share paths', () => {
  assert.equal(normalizeVideoUrl('/u/SomeUser/s/MixedToken'), 'https://www.reddit.com/u/SomeUser/s/MixedToken/');
  assert.equal(parseVideoUrls('/u/SomeUser/s/MixedToken\nhttps://reddit.com/u/SomeUser/s/MixedToken')[1].status, 'Duplicate');
});
