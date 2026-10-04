// scripts/fetch-news.mjs
//
// Pulls headlines from public RSS feeds and writes them to data/news.json.
// It keeps only the headline, the outlet name, the date and the link back to
// the original article — never the article text. No API key is needed.
// A feed that fails is skipped; the others still go through.

import { writeFile, mkdir } from "fs/promises";

// Add or remove outlets here. Each one needs a name and its RSS feed address.
const FEEDS = [
  { source: "Variety", url: "https://variety.com/feed/" },
  { source: "The Hollywood Reporter", url: "https://www.hollywoodreporter.com/feed/" },
  { source: "Deadline", url: "https://deadline.com/feed/" },
  { source: "IndieWire", url: "https://www.indiewire.com/feed/" },
  { source: "Collider", url: "https://collider.com/feed/" },
  { source: "TheWrap", url: "https://www.thewrap.com/feed/" },
  { source: "MovieMaker", url: "https://www.moviemaker.com/feed/" },
  { source: "Open Culture", url: "https://www.openculture.com/feed" }
];

const OUTPUT_PATH = "data/news.json";
const MAX_ITEMS = 9;        // how many headlines to keep
const MAX_PER_SOURCE = 3;   // so one outlet can't take over the list
const MAX_AGE_DAYS = 21;    // ignore anything older than this
const USER_AGENT = "BiffBiffordSiteBot/1.0 (+https://biffbifford.com)";

// Headlines mentioning these words float to the top, so a classic-Hollywood
// page isn't all this month's industry deals. Edit the list to taste.
const CLASSIC_WORDS = [
  "classic", "classics", "restored", "restoration", "retrospective",
  "anniversary", "legend", "legendary", "vintage", "tribute", "remembered",
  "golden age", "silent film", "film noir", "noir", "western", "criterion",
  "tcm", "turner classic movies", "rediscovered", "archive", "cult classic",
  "1930s", "1940s", "1950s", "1960s", "1970s", "1980s", "1990s"
];
const classicRe = new RegExp(`\\b(${CLASSIC_WORDS.join("|")})\\b`, "i");

// ---------- tiny RSS/Atom reader (no dependencies) ----------

const NAMED = {
  amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ",
  rsquo: "’", lsquo: "‘", rdquo: "”", ldquo: "“",
  ndash: "–", mdash: "—", hellip: "…"
};

// One pass, so "&amp;#8217;" is never decoded twice.
function decodeEntities(str) {
  return str.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, e) => {
    try {
      if (e[0] === "#") {
        const code = e[1].toLowerCase() === "x" ? parseInt(e.slice(2), 16) : Number(e.slice(1));
        return String.fromCodePoint(code);
      }
      return NAMED[e.toLowerCase()] ?? match;
    } catch {
      return match;
    }
  });
}

function tagText(block, tag) {
  const m = block.match(new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag}>`, "i"));
  if (!m) return "";
  let value = m[1].trim();
  const cdata = value.match(/^<!\[CDATA\[([\s\S]*?)\]\]>$/);
  if (cdata) value = cdata[1];
  return decodeEntities(value).replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim();
}

function itemLink(block) {
  const plain = tagText(block, "link");              // RSS: <link>https://…</link>
  if (/^https?:\/\//i.test(plain)) return plain;
  const atom = block.match(/<link\b[^>]*\bhref=["']([^"']+)["'][^>]*>/i); // Atom
  return atom ? decodeEntities(atom[1]) : "";
}

function safeUrl(value) {
  try {
    const u = new URL(value);
    return u.protocol === "https:" || u.protocol === "http:" ? u.href : "";
  } catch {
    return "";
  }
}

function parseFeed(xml, source) {
  const blocks = xml.match(/<(item|entry)\b[\s\S]*?<\/\1>/gi) || [];
  return blocks
    .map((block) => {
      const title = tagText(block, "title");
      const url = safeUrl(itemLink(block));
      const when = tagText(block, "pubDate") || tagText(block, "published") ||
                   tagText(block, "updated") || tagText(block, "dc:date");
      const time = Date.parse(when);
      return { title, url, source, time };
    })
    .filter((i) => i.title && i.url && !Number.isNaN(i.time));
}

async function readFeed({ source, url }) {
  const res = await fetch(url, {
    headers: { "User-Agent": USER_AGENT, Accept: "application/rss+xml, application/xml, text/xml, */*" },
    signal: AbortSignal.timeout(15000)
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return parseFeed(await res.text(), source);
}

// ---------- main ----------

async function main() {
  let all = [];
  for (const feed of FEEDS) {
    try {
      const items = await readFeed(feed);
      console.log(`OK    ${feed.source}: ${items.length} items`);
      all = all.concat(items);
    } catch (err) {
      console.warn(`SKIP  ${feed.source}: ${err.message}`);
    }
  }

  const cutoff = Date.now() - MAX_AGE_DAYS * 86400000;
  const seen = new Set();
  const fresh = all
    .filter((i) => i.time >= cutoff && i.time <= Date.now() + 86400000)
    .filter((i) => (seen.has(i.url) ? false : seen.add(i.url)))
    .map((i) => ({ ...i, classic: classicRe.test(i.title) }))
    .sort((a, b) => Number(b.classic) - Number(a.classic) || b.time - a.time);

  const perSource = {};
  const picked = [];
  for (const item of fresh) {
    if ((perSource[item.source] || 0) >= MAX_PER_SOURCE) continue;
    perSource[item.source] = (perSource[item.source] || 0) + 1;
    picked.push(item);
    if (picked.length >= MAX_ITEMS) break;
  }

  // If every feed failed, keep yesterday's file rather than publishing nothing.
  if (!picked.length) {
    console.error("No headlines collected from any feed; leaving data/news.json unchanged.");
    process.exit(1);
  }

  picked.sort((a, b) => b.time - a.time);
  const items = picked.map(({ title, url, source, time }) => ({
    title, url, source, published: new Date(time).toISOString()
  }));

  await mkdir("data", { recursive: true });
  await writeFile(OUTPUT_PATH, JSON.stringify({ updated_at: new Date().toISOString(), items }, null, 2));
  console.log(`Wrote ${items.length} headlines to ${OUTPUT_PATH}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
