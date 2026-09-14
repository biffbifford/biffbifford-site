// scripts/fetch-trailers.mjs
//
// Fetches a rotating set of classic-Hollywood trailer/clip results from
// YouTube and writes them to data/trailers.json. Designed to run inside a
// GitHub Actions workflow, where the API key is provided as a secret
// environment variable — never hardcode the key itself in this file.
//
// Requires: YOUTUBE_API_KEY environment variable.

import { writeFile, mkdir } from "fs/promises";

const MAX_RESULTS = 9;
const OUTPUT_PATH = "data/trailers.json";

// A rotating set of search queries so the feed doesn't look identical every
// run. One is picked based on the day of the year.
const QUERIES = [
  "classic movie trailer restored HD",
  "80s movie trailer official",
  "90s movie trailer official",
  "classic Hollywood trailer remastered",
  "cult classic film trailer",
  "70s movie trailer original"
];

const apiKey = process.env.YOUTUBE_API_KEY;
if (!apiKey) {
  console.error("Missing YOUTUBE_API_KEY environment variable.");
  process.exit(1);
}

function pickQueryForToday() {
  const dayOfYear = Math.floor(
    (Date.now() - new Date(new Date().getFullYear(), 0, 0)) / 86400000
  );
  return QUERIES[dayOfYear % QUERIES.length];
}

async function main() {
  const query = pickQueryForToday();

  const searchUrl =
    `https://www.googleapis.com/youtube/v3/search` +
    `?part=snippet` +
    `&q=${encodeURIComponent(query)}` +
    `&type=video` +
    `&videoEmbeddable=true` +
    `&safeSearch=strict` +
    `&order=relevance` +
    `&maxResults=${MAX_RESULTS}` +
    `&key=${apiKey}`;

  const res = await fetch(searchUrl);
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`YouTube API error ${res.status}: ${body}`);
  }
  const data = await res.json();

  const clips = (data.items || [])
    .filter((item) => item.id?.videoId)
    .map((item) => ({
      id: item.id.videoId,
      title: item.snippet.title,
      channel: item.snippet.channelTitle,
      thumbnail:
        item.snippet.thumbnails?.high?.url ||
        item.snippet.thumbnails?.medium?.url ||
        item.snippet.thumbnails?.default?.url,
      publishedAt: item.snippet.publishedAt,
      url: `https://www.youtube.com/watch?v=${item.id.videoId}`
    }));

  await mkdir("data", { recursive: true });
  await writeFile(
    OUTPUT_PATH,
    JSON.stringify(
      { updated_at: new Date().toISOString(), query, clips },
      null,
      2
    )
  );

  console.log(`Wrote ${clips.length} clips (query: "${query}") to ${OUTPUT_PATH}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
