// scripts/fetch-news.mjs
//
// Pulls headlines from public RSS feeds and writes them to data/news.json.
// It keeps only the headline, the outlet name, the date and the link back to
// the original article — never the article text. No API key is needed.
// A feed that fails is skipped; the others still go through.

import { writeFile, mkdir } from "fs/promises";

// Add or remove outlets here. Each one needs a name and its RSS feed address.
// "classic: true" means everything this outlet posts counts as classic-era.
// Outlets without it only count when a headline contains a classic word (below).
const FEEDS = [
  { source: "Variety", url: "https://variety.com/feed/" },
  { source: "The Hollywood Reporter", url: "https://www.hollywoodreporter.com/feed/" },
  { source: "Deadline", url: "https://deadline.com/feed/" },
  { source: "IndieWire", url: "https://www.indiewire.com/feed/" },
  { source: "Collider", url: "https://collider.com/feed/" },
  { source: "TheWrap", url: "https://www.thewrap.com/feed/" },
  { source: "MovieMaker", url: "https://www.moviemaker.com/feed/" },
  { source: "Open Culture", url: "https://www.openculture.com/feed" },

  // Classic-film blogs. Small blogs post slowly, so a quiet one is normal.
  { source: "Classic Movie Hub", url: "https://www.classicmoviehub.com/blog/feed", classic: true },
  { source: "Come Over Hollywood", url: "https://www.cometoverhollywood.com/feed", classic: true },
  // Address below is a best guess; the run log will say SKIP if it's wrong.
  { source: "Classic Film & TV Café", url: "https://www.classicfilmtvcafe.com/feed/", classic: true }
];

const OUTPUT_PATH = "data/news.json";
const MAX_ITEMS = 9;        // how many headlines to keep
const MAX_PER_SOURCE = 3;   // so one outlet can't take over the list
const MAX_AGE_DAYS = 60;    // ignore anything older than this
const USER_AGENT = "BiffBiffordSiteBot/1.0 (+https://biffbifford.com)";

// On general outlets, only headlines containing one of these words are kept,
// so the page stays classic-era. Edit the list to taste.
const CLASSIC_WORDS = [
  "classic", "classics", "restored", "restoration", "retrospective",
  "vintage", "golden age", "old hollywood", "silent film", "silent era",
  "film noir", "noir", "western", "criterion", "tcm", "turner classic movies",
  "rediscovered", "cult classic", "centennial",
  "1920s", "1930s", "1940s", "1950s", "1960s", "1970s", "1980s", "1990s"
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

async function readFeed({ source, url, classic }) {
  const res = await fetch(url, {
    headers: { "User-Agent": USER_AGENT, Accept: "application/rss+xml, application/xml, text/xml, */*" },
    signal: AbortSignal.timeout(15000)
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return parseFeed(await res.text(), source).map((i) => ({ ...i, fromClassicOutlet: Boolean(classic) }));
}

// ---------- main ----------

async function main() {
  let all = [];
  let feedsWorked = 0;
  for (const feed of FEEDS) {
    try {
      const items = await readFeed(feed);
      console.log(`OK    ${feed.source}: ${items.length} items`);
      all = all.concat(items);
      feedsWorked += 1;
    } catch (err) {
      console.warn(`SKIP  ${feed.source}: ${err.message}`);
    }
  }

  // A real failure: nothing
