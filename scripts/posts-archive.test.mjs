import test from "node:test";
import assert from "node:assert/strict";
import {
  PAGE_SIZE,
  SNAPSHOT_SIZE,
  isWithinRefreshWindow,
  shouldFetchAnotherPage,
  toPostRecord,
  toSnapshotTweet,
  newestSnapshot,
  mergeArchive
} from "./posts-archive.mjs";

const NOW = "2026-10-09T18:00:00.000Z";
const USER = "TBifford";

function daysAgo(days, hours = 0) {
  const t = new Date(NOW).getTime() - days * 24 * 60 * 60 * 1000 - hours * 60 * 60 * 1000;
  return new Date(t).toISOString();
}

function apiTweet(id, createdAt, metrics) {
  return {
    id,
    text: `text ${id}`,
    created_at: createdAt,
    public_metrics: {
      like_count: metrics.likes ?? 0,
      retweet_count: metrics.retweets ?? 0,
      reply_count: metrics.replies ?? 0,
      quote_count: metrics.quotes ?? 0,
      impression_count: metrics.impression_count
    }
  };
}

test("maps impression_count and created_at from the API payload", () => {
  const record = toPostRecord(
    apiTweet("1", "2026-10-08T00:02:00.000Z", { likes: 10, impression_count: 5000 }),
    NOW,
    USER
  );
  assert.equal(record.created_at, "2026-10-08T00:02:00.000Z");
  assert.equal(record.impression_count, 5000);
  assert.equal(record.likes, 10);
  assert.equal(record.url, "https://x.com/TBifford/status/1");
});

test("stores null when the API omits impression_count", () => {
  const tweet = apiTweet("1", daysAgo(1), { likes: 1 });
  delete tweet.public_metrics.impression_count;
  const record = toPostRecord(tweet, NOW, USER);
  assert.equal(record.impression_count, null);
});

test("snapshot keeps the website fields and only the latest 10", () => {
  const records = [];
  for (let i = 0; i < 15; i += 1) {
    records.push(toPostRecord(apiTweet(String(i), daysAgo(0, i), { likes: i, impression_count: i }), NOW, USER));
  }
  const snapshot = newestSnapshot(records);
  assert.equal(snapshot.length, SNAPSHOT_SIZE);
  assert.equal(PAGE_SIZE, 100);
  const tweet = snapshot[0];
  for (const key of ["id", "text", "created_at", "likes", "retweets", "replies", "quotes", "url"]) {
    assert.ok(key in tweet, `missing ${key}`);
  }
  assert.equal(tweet.impression_count, 0);
  assert.equal(snapshot[0].id, "0");
  assert.equal(snapshot[9].id, "9");
  assert.deepEqual(Object.keys(toSnapshotTweet(records[0])), [
    "id", "text", "created_at", "likes", "retweets", "replies", "quotes", "impression_count", "url"
  ]);
});

test("adds new posts and never drops old ones", () => {
  const old = toPostRecord(apiTweet("old", daysAgo(30), { likes: 4, impression_count: 100 }), daysAgo(20), USER);
  const fresh = toPostRecord(apiTweet("new", daysAgo(1), { likes: 2, impression_count: 50 }), NOW, USER);
  const { posts, added } = mergeArchive([old], [fresh], NOW);
  assert.equal(added, 1);
  assert.deepEqual(posts.map((p) => p.id), ["new", "old"]);
});

test("refreshes posts from the last 7 days and keeps the original publish time", () => {
  const createdAt = daysAgo(2);
  const stored = toPostRecord(apiTweet("a", createdAt, { likes: 1, impression_count: 10 }), daysAgo(1), USER);
  const incoming = toPostRecord(apiTweet("a", createdAt, { likes: 9, impression_count: 80 }), NOW, USER);
  incoming.text = "edited";
  const { posts, refreshed } = mergeArchive([stored], [incoming], NOW);
  assert.equal(refreshed, 1);
  assert.equal(posts.length, 1);
  assert.equal(posts[0].likes, 9);
  assert.equal(posts[0].impression_count, 80);
  assert.equal(posts[0].text, "edited");
  assert.equal(posts[0].created_at, createdAt);
  assert.equal(posts[0].metrics_updated_at, NOW);
});

test("freezes posts older than 7 days", () => {
  const createdAt = daysAgo(8);
  const stored = toPostRecord(apiTweet("old", createdAt, { likes: 3, impression_count: 20 }), daysAgo(6), USER);
  const incoming = toPostRecord(apiTweet("old", createdAt, { likes: 99, impression_count: 999 }), NOW, USER);
  incoming.text = "should not replace";
  const { posts, frozen, refreshed } = mergeArchive([stored], [incoming], NOW);
  assert.equal(frozen, 1);
  assert.equal(refreshed, 0);
  assert.equal(posts[0].likes, 3);
  assert.equal(posts[0].impression_count, 20);
  assert.equal(posts[0].text, "text old");
  assert.equal(posts[0].metrics_updated_at, daysAgo(6));
});

test("a post exactly 7 days old is still refreshed", () => {
  const createdAt = daysAgo(7);
  assert.equal(isWithinRefreshWindow(createdAt, NOW), true);
  const stored = toPostRecord(apiTweet("edge", createdAt, { likes: 1, impression_count: 1 }), daysAgo(1), USER);
  const incoming = toPostRecord(apiTweet("edge", createdAt, { likes: 4, impression_count: 8 }), NOW, USER);
  const { refreshed, posts } = mergeArchive([stored], [incoming], NOW);
  assert.equal(refreshed, 1);
  assert.equal(posts[0].likes, 4);
});

test("does not wipe a saved view count when a later response omits it", () => {
  const createdAt = daysAgo(1);
  const stored = toPostRecord(apiTweet("a", createdAt, { likes: 1, impression_count: 40 }), daysAgo(0, 2), USER);
  const incoming = toPostRecord(apiTweet("a", createdAt, { likes: 2 }), NOW, USER);
  const { posts } = mergeArchive([stored], [incoming], NOW);
  assert.equal(posts[0].impression_count, 40);
  assert.equal(posts[0].likes, 2);
});

test("pages forward only while the whole page is inside the refresh window", () => {
  const recentPage = [apiTweet("1", daysAgo(1), {}), apiTweet("2", daysAgo(6), {})];
  assert.equal(shouldFetchAnotherPage(recentPage, "next", NOW), true);

  const mixedPage = [apiTweet("1", daysAgo(1), {}), apiTweet("2", daysAgo(9), {})];
  assert.equal(shouldFetchAnotherPage(mixedPage, "next", NOW), false);

  assert.equal(shouldFetchAnotherPage(recentPage, null, NOW), false);
  assert.equal(shouldFetchAnotherPage([], "next", NOW), false);
  assert.equal(shouldFetchAnotherPage([{ id: "x" }], "next", NOW), false);
});
