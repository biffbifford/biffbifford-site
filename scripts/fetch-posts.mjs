// scripts/fetch-posts.mjs
//
// Fetches recent posts AND account-level stats for one X (Twitter) account.
// Writes the latest 10 posts to data/posts.json (what the website reads),
// merges every fetched post into data/posts-archive.json, and appends a row
// to data/stats-history.json. Posts older than 7 days stay in the archive
// with their last saved counts. This does not walk older history.
//
// Designed to run inside a GitHub Actions workflow, where the Bearer Token
// is provided as a secret environment variable — never hardcode the token
// itself in this file.
//
// Requires: X_BEARER_TOKEN environment variable.

import { writeFile, mkdir, readFile } from "fs/promises";
import { pathToFileURL } from "node:url";
import {
  PAGE_SIZE,
  MAX_PAGES,
  refreshStartTime,
  toPostRecord,
  newestSnapshot,
  mergeArchive,
  shouldFetchAnotherPage
} from "./posts-archive.mjs";

const USERNAME = "TBifford";       // your X handle, no @
const POSTS_PATH = "data/posts.json";
const ARCHIVE_PATH = "data/posts-archive.json";
const HISTORY_PATH = "data/stats-history.json";

async function xFetch(url, token) {
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` }
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`X API error ${res.status}: ${body}`);
  }
  return res.json();
}

async function readJsonSafe(path, fallback) {
  try {
    const raw = await readFile(path, "utf8");
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

async function fetchRecentPosts(userId, token, nowIso) {
  const collected = [];
  let paginationToken = null;
  let pages = 0;
  const startTime = refreshStartTime(nowIso);

  while (pages < MAX_PAGES) {
    const url = new URL(`https://api.twitter.com/2/users/${userId}/tweets`);
    url.searchParams.set("max_results", String(PAGE_SIZE));
    url.searchParams.set("exclude", "replies,retweets");
    url.searchParams.set("tweet.fields", "created_at,public_metrics");
    url.searchParams.set("start_time", startTime);
    if (paginationToken) url.searchParams.set("pagination_token", paginationToken);

    const tweetData = await xFetch(url, token);
    const page = tweetData?.data || [];
    collected.push(...page);
    pages += 1;

    const nextToken = tweetData?.meta?.next_token || null;
    if (!shouldFetchAnotherPage(page, nextToken, nowIso)) break;
    paginationToken = nextToken;
  }

  return { tweets: collected, pages };
}

export async function main() {
  const token = process.env.X_BEARER_TOKEN;
  if (!token) {
    console.error("Missing X_BEARER_TOKEN environment variable.");
    process.exit(1);
  }

  // 1. Resolve the numeric user ID and account-level stats in one call.
  const userData = await xFetch(
    `https://api.twitter.com/2/users/by/username/${USERNAME}` +
    `?user.fields=public_metrics`,
    token
  );
  const user = userData?.data;
  const userId = user?.id;
  if (!userId) {
    throw new Error(`Could not resolve a user ID for @${USERNAME}`);
  }

  const accountStats = {
    followers: user.public_metrics?.followers_count ?? 0,
    following: user.public_metrics?.following_count ?? 0,
    posts: user.public_metrics?.tweet_count ?? 0,
    listed: user.public_metrics?.listed_count ?? 0
  };

  const now = new Date().toISOString();

  // 2. Pull original posts from the last 7 days (start_time), up to 100
  //    per page, and stop once a page reaches past that window.
  const { tweets: rawTweets, pages } = await fetchRecentPosts(userId, token, now);
  const records = rawTweets.map((tweet) => toPostRecord(tweet, now, USERNAME));

  // 3. Latest 10 stay in the file the website already reads.
  const tweets = newestSnapshot(records);
  await mkdir("data", { recursive: true });
  await writeFile(
    POSTS_PATH,
    JSON.stringify({ updated_at: now, account: accountStats, tweets }, null, 2) + "\n"
  );
  console.log(`Wrote ${tweets.length} posts + account stats to ${POSTS_PATH}`);

  // 4. Permanent archive: one record per post, newest first. Never delete.
  const archive = await readJsonSafe(ARCHIVE_PATH, { posts: [] });
  const merged = mergeArchive(archive.posts, records, now);
  await writeFile(
    ARCHIVE_PATH,
    JSON.stringify({ posts: merged.posts }, null, 2) + "\n"
  );
  console.log(
    `Updated ${ARCHIVE_PATH}: ${merged.posts.length} posts ` +
    `(${merged.added} new, ${merged.refreshed} refreshed, ${merged.frozen} left frozen, ${pages} page(s)).`
  );

  // 5. Append today's account stats to the growth history file
  //    (one entry per day — re-running the same day updates that day's row).
  //    recent_engagement stays the sum for the same 10 posts the site shows.
  const history = await readJsonSafe(HISTORY_PATH, { entries: [] });
  const today = now.slice(0, 10); // YYYY-MM-DD, the day stats were collected
  const totalEngagement = tweets.reduce(
    (sum, t) => sum + t.likes + t.retweets + t.replies + t.quotes,
    0
  );
  const entry = { date: today, ...accountStats, recent_engagement: totalEngagement };

  const idx = history.entries.findIndex((e) => e.date === today);
  if (idx >= 0) {
    history.entries[idx] = entry;
  } else {
    history.entries.push(entry);
  }

  await writeFile(HISTORY_PATH, JSON.stringify(history, null, 2) + "\n");
  console.log(`Updated ${HISTORY_PATH} with today's snapshot (${today}).`);
}

const isDirectRun = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isDirectRun) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
