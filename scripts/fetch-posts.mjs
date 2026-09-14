// scripts/fetch-posts.mjs
//
// Fetches recent posts AND account-level stats for one X (Twitter) account.
// Writes the latest snapshot to data/posts.json, and appends a row to
// data/stats-history.json so you can track follower/engagement growth
// over time. Designed to run inside a GitHub Actions workflow, where the
// Bearer Token is provided as a secret environment variable — never
// hardcode the token itself in this file.
//
// Requires: X_BEARER_TOKEN environment variable.

import { writeFile, mkdir, readFile } from "fs/promises";

const USERNAME = "TBifford";       // your X handle, no @
const MAX_RESULTS = 10;            // how many recent posts to pull
const POSTS_PATH = "data/posts.json";
const HISTORY_PATH = "data/stats-history.json";

const token = process.env.X_BEARER_TOKEN;
if (!token) {
  console.error("Missing X_BEARER_TOKEN environment variable.");
  process.exit(1);
}

async function xFetch(url) {
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

async function main() {
  // 1. Resolve the numeric user ID and account-level stats in one call.
  const userData = await xFetch(
    `https://api.twitter.com/2/users/by/username/${USERNAME}` +
    `?user.fields=public_metrics`
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

  // 2. Pull recent posts, skipping replies and retweets so only
  //    original posts show up on the site, and grab their engagement.
  const tweetsUrl =
    `https://api.twitter.com/2/users/${userId}/tweets` +
    `?max_results=${MAX_RESULTS}` +
    `&exclude=replies,retweets` +
    `&tweet.fields=created_at,public_metrics`;
  const tweetData = await xFetch(tweetsUrl);

  const tweets = (tweetData?.data || []).map((t) => ({
    id: t.id,
    text: t.text,
    created_at: t.created_at,
    likes: t.public_metrics?.like_count ?? 0,
    retweets: t.public_metrics?.retweet_count ?? 0,
    replies: t.public_metrics?.reply_count ?? 0,
    quotes: t.public_metrics?.quote_count ?? 0,
    url: `https://x.com/${USERNAME}/status/${t.id}`
  }));

  const now = new Date().toISOString();

  // 3. Write the latest snapshot (used by the website).
  await mkdir("data", { recursive: true });
  await writeFile(
    POSTS_PATH,
    JSON.stringify({ updated_at: now, account: accountStats, tweets }, null, 2)
  );
  console.log(`Wrote ${tweets.length} posts + account stats to ${POSTS_PATH}`);

  // 4. Append today's account stats to the growth history file
  //    (one entry per day — re-running the same day updates that day's row).
  const history = await readJsonSafe(HISTORY_PATH, { entries: [] });
  const today = now.slice(0, 10); // YYYY-MM-DD
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

  await writeFile(HISTORY_PATH, JSON.stringify(history, null, 2));
  console.log(`Updated ${HISTORY_PATH} with today's snapshot (${today}).`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
