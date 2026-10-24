// scripts/fetch-movies.mjs
//
// Writes data/movies.json for the "At the Movies" section:
//   - boxoffice: weekend box-office HEADLINES (title, outlet, date, link only)
//     pulled from the trade-paper RSS feeds. We never copy the articles.
//   - now_playing / trending: from The Movie Database (TMDB), only if a
//     TMDB_API_KEY secret is set. Without it, those lists are left as they were.
// This product uses the TMDB API but is not endorsed or certified by TMDB.

import { readFile, writeFile, mkdir } from "fs/promises";

const OUT = "data/movies.json";
const UA = "BiffBiffordSiteBot/1.0 (+https://biffbifford.com)";
const FEEDS = [
  { source: "Deadline", url: "https://deadline.com/feed/" },
  { source: "Variety", url: "https://variety.com/feed/" },
  { source: "The Hollywood Reporter", url: "https://www.hollywoodreporter.com/feed/" },
  { source: "TheWrap", url: "https://www.thewrap.com/feed/" },
  { source: "Collider", url: "https://collider.com/feed/" }
];
const KEEP_DAYS = 14, MAX_BOX = 6;

const NAMED = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", rsquo: "’", lsquo: "‘", rdquo: "”", ldquo: "“", ndash: "–", mdash: "—", hellip: "…" };
const dec = (s) => s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => {
  try { return e[0] === "#" ? String.fromCodePoint(e[1].toLowerCase() === "x" ? parseInt(e.slice(2), 16) : Number(e.slice(1))) : (NAMED[e.toLowerCase()] ?? m); } catch { return m; }
});
function tag(block, t) {
  const m = block.match(new RegExp(`<${t}(?:\\s[^>]*)?>([\\s\\S]*?)</${t}>`, "i"));
  if (!m) return "";
  let v = m[1].trim(); const c = v.match(/^<!\[CDATA\[([\s\S]*?)\]\]>$/); if (c) v = c[1];
  return dec(v).replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim();
}
const safe = (v) => { try { const u = new URL(v); return /^https?:$/.test(u.protocol) ? u.href : ""; } catch { return ""; } };
function parseFeed(xml, source) {
  return (xml.match(/<(item|entry)\b[\s\S]*?<\/\1>/gi) || []).map((b) => {
    const link = tag(b, "link"), atom = b.match(/<link\b[^>]*\bhref=["']([^"']+)["']/i);
    return { title: tag(b, "title"), url: safe(/^https?:/i.test(link) ? link : atom ? dec(atom[1]) : ""), source,
      time: Date.parse(tag(b, "pubDate") || tag(b, "published") || tag(b, "updated") || tag(b, "dc:date")) };
  }).filter((i) => i.title && i.url && !Number.isNaN(i.time));
}

let prev = {};
try { prev = JSON.parse(await readFile(OUT, "utf8")); } catch {}

// ---- box office headlines ----
const found = [];
let worked = 0;
for (const f of FEEDS) {
  try {
    const r = await fetch(f.url, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(15000) });
    if (!r.ok) throw new Error("HTTP " + r.status);
    const items = parseFeed(await r.text(), f.source);
    worked++; console.log(`OK    ${f.source}: ${items.length} items`);
    found.push(...items.filter((i) => /box office/i.test(i.title)));
  } catch (e) { console.warn(`SKIP  ${f.source}: ${e.message}`); }
}
const cutoff = Date.now() - KEEP_DAYS * 864e5;
const merged = new Map();
for (const i of [...(prev.boxoffice || []).map((p) => ({ title: p.title, url: p.url, source: p.source, time: Date.parse(p.published) })), ...found]) {
  if (i.time >= cutoff && i.time <= Date.now() + 864e5 && !merged.has(i.url)) merged.set(i.url, i);
}
const perSource = {};
const boxoffice = [...merged.values()].sort((a, b) => b.time - a.time).filter((i) => (perSource[i.source] = (perSource[i.source] || 0) + 1) <= 2).slice(0, MAX_BOX)
  .map((i) => ({ title: i.title, url: i.url, source: i.source, published: new Date(i.time).toISOString() }));

// ---- TMDB lists ----
let now_playing = prev.now_playing || [], trending = prev.trending || [];
const key = (process.env.TMDB_API_KEY || "").trim();
async function tmdb(path, params = "") {
  const bearer = key.length > 40;
  const url = `https://api.themoviedb.org/3${path}?language=en-US${params}${bearer ? "" : "&api_key=" + key}`;
  const r = await fetch(url, { headers: { "User-Agent": UA, Accept: "application/json", ...(bearer ? { Authorization: "Bearer " + key } : {}) }, signal: AbortSignal.timeout(15000) });
  if (!r.ok) throw new Error("TMDB HTTP " + r.status);
  return (await r.json()).results || [];
}
const shape = (m) => ({ id: m.id, title: m.title, year: (m.release_date || "").slice(0, 4), released: m.release_date || "",
  overview: (m.overview || "").length > 220 ? m.overview.slice(0, 217).replace(/\s+\S*$/, "") + "…" : (m.overview || ""),
  poster: m.poster_path || "", popularity: m.popularity || 0 });
if (key) {
  try {
    const np = await tmdb("/movie/now_playing", "&region=US&page=1");
    now_playing = np.filter((m) => m.poster_path && m.overview).sort((a, b) => b.popularity - a.popularity).slice(0, 12).map(shape);
    const tr = await tmdb("/trending/movie/week");
    trending = tr.filter((m) => m.poster_path && m.overview).slice(0, 6).map(shape);
    console.log(`TMDB: ${now_playing.length} now playing, ${trending.length} trending`);
  } catch (e) { console.warn("TMDB failed, keeping previous lists:", e.message); }
} else console.log("No TMDB_API_KEY set; skipping now playing / trending.");

if (!worked && !key) { console.error("Nothing could be reached; leaving file unchanged."); process.exit(1); }
await mkdir("data", { recursive: true });
await writeFile(OUT, JSON.stringify({ updated_at: new Date().toISOString(), boxoffice, now_playing, trending }, null, 2) + "\n");
console.log(`Wrote ${boxoffice.length} box-office headlines to ${OUT}`);
