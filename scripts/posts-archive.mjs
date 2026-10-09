// Pure helpers for the X post snapshot and the permanent post archive.
// No network calls and no token here, so tests can import this file directly.

export const PAGE_SIZE = 100;       // most posts one X API page can return
export const SNAPSHOT_SIZE = 10;    // data/posts.json stays at the latest 10
export const REFRESH_DAYS = 7;
export const REFRESH_WINDOW_MS = REFRESH_DAYS * 24 * 60 * 60 * 1000;
// Hard stop so a missing date can never walk the whole account history.
export const MAX_PAGES = 10;

// X wants start_time as YYYY-MM-DDTHH:mm:ssZ. The boundary is inclusive.
export function refreshStartTime(nowIso) {
  const now = new Date(nowIso).getTime();
  if (Number.isNaN(now)) {
    throw new Error(`Invalid time: ${nowIso}`);
  }
  return new Date(now - REFRESH_WINDOW_MS).toISOString().replace(/\.\d{3}Z$/, "Z");
}

export function isWithinRefreshWindow(createdAt, nowIso) {
  const published = new Date(createdAt).getTime();
  const now = new Date(nowIso).getTime();
  if (Number.isNaN(published) || Number.isNaN(now)) return false;
  return now - published <= REFRESH_WINDOW_MS;
}

// Newest-first pages. Ask for another page only while every post on this
// page is still inside the refresh window. The first older post means we
// already have the week we care about, so we do not keep paging into history.
export function shouldFetchAnotherPage(page, nextToken, nowIso) {
  if (!nextToken || !Array.isArray(page) || page.length === 0) return false;
  let oldest = Infinity;
  for (const tweet of page) {
    const published = new Date(tweet?.created_at).getTime();
    if (Number.isNaN(published)) return false;
    if (published < oldest) oldest = published;
  }
  const now = new Date(nowIso).getTime();
  if (Number.isNaN(now)) return false;
  return now - oldest <= REFRESH_WINDOW_MS;
}

export function toPostRecord(tweet, nowIso, username) {
  const metrics = tweet?.public_metrics || {};
  const impressionCount = metrics.impression_count;
  return {
    id: tweet.id,
    text: tweet.text ?? "",
    created_at: tweet.created_at,
    likes: metrics.like_count ?? 0,
    retweets: metrics.retweet_count ?? 0,
    replies: metrics.reply_count ?? 0,
    quotes: metrics.quote_count ?? 0,
    // null means the API did not send a view count. A real zero stays 0.
    impression_count: impressionCount == null ? null : impressionCount,
    url: `https://x.com/${username}/status/${tweet.id}`,
    metrics_updated_at: nowIso
  };
}

// Same fields the website already reads, plus impression_count.
export function toSnapshotTweet(record) {
  return {
    id: record.id,
    text: record.text,
    created_at: record.created_at,
    likes: record.likes,
    retweets: record.retweets,
    replies: record.replies,
    quotes: record.quotes,
    impression_count: record.impression_count ?? null,
    url: record.url
  };
}

export function newestSnapshot(records, limit = SNAPSHOT_SIZE) {
  return [...records]
    .sort(byNewest)
    .slice(0, limit)
    .map(toSnapshotTweet);
}

function byNewest(a, b) {
  const aTime = a?.created_at || "";
  const bTime = b?.created_at || "";
  if (aTime !== bTime) return aTime < bTime ? 1 : -1;
  const aId = String(a?.id || "");
  const bId = String(b?.id || "");
  if (aId === bId) return 0;
  return aId < bId ? 1 : -1;
}

// One record per post id. Posts inside the last 7 days get fresh counts.
// Older posts already on file are left untouched. Nothing is ever removed.
export function mergeArchive(existingPosts, incoming, nowIso) {
  const byId = new Map();
  for (const post of existingPosts || []) {
    if (post?.id) byId.set(post.id, post);
  }

  let added = 0;
  let refreshed = 0;
  let frozen = 0;

  for (const post of incoming || []) {
    if (!post?.id) continue;
    const prev = byId.get(post.id);
    if (!prev) {
      byId.set(post.id, post);
      added += 1;
      continue;
    }
    const publishedAt = prev.created_at || post.created_at;
    if (!isWithinRefreshWindow(publishedAt, nowIso)) {
      frozen += 1;
      continue;
    }
    byId.set(post.id, {
      ...prev,
      text: post.text,
      likes: post.likes,
      retweets: post.retweets,
      replies: post.replies,
      quotes: post.quotes,
      impression_count: post.impression_count == null
        ? (prev.impression_count ?? null)
        : post.impression_count,
      url: post.url || prev.url,
      created_at: prev.created_at || post.created_at,
      metrics_updated_at: nowIso
    });
    refreshed += 1;
  }

  const posts = [...byId.values()].sort(byNewest);
  return { posts, added, refreshed, frozen };
}
