// scripts/build-blog.mjs
//
// Turns the markdown files in blog/posts/ into web pages.
//   node scripts/build-blog.mjs
// Writes: blog/index.html, blog/<slug>.html, data/blog.json, and the blog
// entries in sitemap.xml. No dependencies.

import { readFile, writeFile, readdir } from "fs/promises";

const SITE = "https://biffbifford.com";
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function inline(t) {
  t = esc(t);
  t = t.replace(/\[([^\]]+)\]\(((?:[^()\s]|\([^()\s]*\))+)\)/g, (m, a, u) => `<a href="${u}" target="_blank" rel="noopener">${a}</a>`);
  t = t.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  t = t.replace(/(^|[^*])\*([^*]+)\*(?!\*)/g, "$1<em>$2</em>");
  return t;
}

function md(src) {
  const lines = src.split("\n"), out = [];
  let para = [], list = [];
  const flushP = () => { if (para.length) { out.push(`<p>${inline(para.join(" "))}</p>`); para = []; } };
  const flushL = () => { if (list.length) { out.push("<ul>" + list.map((i) => `<li>${inline(i)}</li>`).join("") + "</ul>"); list = []; } };
  for (const raw of lines) {
    const l = raw.trimEnd();
    if (!l.trim()) { flushP(); flushL(); continue; }
    let m;
    if ((m = l.match(/^##\s+(.*)/))) { flushP(); flushL(); out.push(`<h2>${inline(m[1])}</h2>`); }
    else if ((m = l.match(/^-\s+(.*)/))) { flushP(); list.push(m[1]); }
    else { flushL(); para.push(l.trim()); }
  }
  flushP(); flushL();
  return out.join("\n");
}

function parse(file, text) {
  const m = text.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!m) throw new Error(`${file}: missing front matter`);
  const meta = {};
  for (const line of m[1].split("\n")) { const i = line.indexOf(":"); if (i > 0) meta[line.slice(0, i).trim()] = line.slice(i + 1).trim(); }
  for (const k of ["title", "slug", "date", "summary"]) if (!meta[k]) throw new Error(`${file}: missing ${k}`);
  return { ...meta, body: m[2].trim() };
}

const prettyDate = (d) => new Date(d + "T12:00:00Z").toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric", timeZone: "UTC" });

const FONTS = `<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin><link href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,500;9..144,700&family=Space+Mono:wght@400;700&family=Work+Sans:wght@400;500;600&display=swap" rel="stylesheet">`;

const CSS = `:root{--ink:#15120D;--soft:#1D1811;--cream:#EDE3CC;--gold:#C9A036;--gold-dim:#8A6F27;--steel:#cfc6af;--line:rgba(237,227,204,.16)}
*{box-sizing:border-box}
body{margin:0;background:radial-gradient(ellipse at 50% 0,#2a2116 0,var(--ink) 65%);color:var(--cream);font-family:"Work Sans",system-ui,sans-serif;font-size:20px;line-height:1.75;min-height:100vh}
a{color:var(--gold)}
a:focus-visible,button:focus-visible{outline:3px solid #fff;outline-offset:3px}
.wrap{max-width:42rem;margin:0 auto;padding:0 20px 64px}
.top{display:flex;justify-content:space-between;align-items:center;padding:14px 0;flex-wrap:wrap;gap:6px}
.top a{color:var(--cream);text-decoration:none;font-family:"Fraunces",Georgia,serif;font-weight:700;font-size:1.35rem;padding:10px 0;display:inline-block}
.top nav a{font-family:"Work Sans",sans-serif;font-weight:500;font-size:1.05rem;margin-left:18px;color:var(--steel)}
.kicker{font-family:"Space Mono",monospace;font-size:1rem;color:var(--gold);margin:26px 0 0}
h1{font-family:"Fraunces",Georgia,serif;font-size:clamp(2.1rem,6.5vw,3.2rem);line-height:1.1;margin:8px 0 12px}
article h2{font-family:"Fraunces",Georgia,serif;font-size:1.7rem;line-height:1.2;margin:2.2em 0 .4em;color:var(--gold)}
article p{margin:0 0 1.1em}
article ul{padding-left:1.2em;margin:0 0 1.2em}
article li{margin-bottom:.8em}
.meta{color:var(--steel);font-size:1rem;margin-bottom:28px}
.lede{font-size:1.25rem;color:var(--steel)}
.btn{display:inline-flex;align-items:center;font:inherit;font-weight:600;font-size:1.1rem;color:var(--ink);background:var(--gold);border:0;border-radius:4px;padding:14px 26px;min-height:54px;text-decoration:none}
.btn:hover{background:#dcb64a}
.btn.alt{background:transparent;color:var(--cream);border:1px solid var(--gold-dim)}
.row{display:flex;flex-wrap:wrap;gap:12px;margin:28px 0}
.card{display:block;background:var(--soft);border:1px solid var(--line);border-left:4px solid var(--gold);padding:22px 24px;margin:0 0 18px;text-decoration:none;color:var(--cream)}
.card:hover{border-color:var(--gold-dim);border-left-color:var(--gold)}
.card h2{font-family:"Fraunces",Georgia,serif;font-size:1.6rem;line-height:1.2;margin:4px 0 8px;color:var(--cream)}
.card p{margin:0;color:var(--steel);font-size:1.05rem;line-height:1.55}
.card .meta{margin:0}
.memorial{margin:22px 0 0;padding:12px 16px;border:1px solid var(--gold-dim);border-left:6px solid #000;background:#0b0907;color:var(--cream);font-family:"Space Mono",monospace;font-size:1rem;letter-spacing:.04em}
.foot{border-top:1px solid var(--line);margin-top:48px;padding-top:20px;color:var(--steel);font-size:1rem}
.foot a{display:inline-block;padding:8px 4px}
@media (prefers-reduced-motion:reduce){*{scroll-behavior:auto!important}}`;

const HEAD = (title, desc, url, extra = "") => `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}">
<link rel="canonical" href="${url}">
<meta property="og:type" content="article"><meta property="og:title" content="${esc(title)}"><meta property="og:description" content="${esc(desc)}"><meta property="og:url" content="${url}">
<meta property="og:image" content="${SITE}/og-image.png"><meta name="twitter:card" content="summary_large_image"><meta name="twitter:image" content="${SITE}/og-image.png">
${FONTS}
<style>${CSS}</style>${extra}
</head><body><div class="wrap">
<div class="top"><a href="/index.html">BiffBifford</a><nav><a href="/blog/">Blog</a><a href="/challenge.html">Daily Challenge</a><a href="/quiz.html">Quiz</a></nav></div>`;

const FOOT = `<div class="foot">Follow along: <a href="https://x.com/TBifford" target="_blank" rel="noopener">@TBifford on X</a> · <a href="https://www.tiktok.com/@biffbifford" target="_blank" rel="noopener">TikTok</a> · <a href="https://t.me/biffbifford" target="_blank" rel="noopener">Telegram</a> · <a href="/index.html">Home</a></div>
</div></body></html>`;

const files = (await readdir("blog/posts")).filter((f) => f.endsWith(".md")).sort().reverse();
const posts = [];
for (const f of files) posts.push(parse(f, await readFile(`blog/posts/${f}`, "utf8")));
posts.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));

for (const p of posts) {
  const url = `${SITE}/blog/${p.slug}.html`;
  const ld = `<script type="application/ld+json">${JSON.stringify({ "@context": "https://schema.org", "@type": "Article", headline: p.title, datePublished: p.date, description: p.summary, author: { "@type": "Person", name: "Biff Bifford" }, mainEntityOfPage: url, image: `${SITE}/og-image.png` })}</script>`;
  const tweet = `https://twitter.com/intent/tweet?text=${encodeURIComponent(p.title)}&url=${encodeURIComponent(url)}`;
  const others = posts.filter((o) => o.slug !== p.slug).slice(0, 3);
  const more = others.length ? `<h2 style="font-family:Fraunces,Georgia,serif;font-size:1.5rem;margin-top:2em">More from the blog</h2>` + others.map((o) => `<a class="card" href="/blog/${o.slug}.html"><p class="meta">${prettyDate(o.date)}</p><h2>${esc(o.title)}</h2><p>${esc(o.summary)}</p></a>`).join("") : "";
  const html = HEAD(`${p.title} | BiffBifford`, p.summary, url, ld) +
    `${p.memorial ? `<p class="memorial">In memoriam · ${esc(p.memorial)}</p>` : ""}<p class="kicker">${esc(p.tags || "The Blog")}</p><article><h1>${esc(p.title)}</h1><p class="meta">By Biff Bifford · ${prettyDate(p.date)}</p>\n${md(p.body)}</article>
<div class="row"><a class="btn" href="${tweet}" target="_blank" rel="noopener">Share on X</a><a class="btn alt" href="/challenge.html">Play the Daily Challenge</a></div>${more}` + FOOT;
  await writeFile(`blog/${p.slug}.html`, html);
}

const idx = HEAD("The Blog | BiffBifford", "Longer stories behind the classic TV, movies and music on @TBifford.", `${SITE}/blog/`) +
  `<p class="kicker">The Blog</p><h1>The longer story</h1><p class="lede">The posts on X are short. These are the full stories behind them.</p>` +
  (posts.length ? posts.map((p) => `<a class="card" href="/blog/${p.slug}.html"><p class="meta">${p.memorial ? "In memoriam · " : ""}${prettyDate(p.date)}${p.tags ? " · " + esc(p.tags) : ""}</p><h2>${esc(p.title)}</h2><p>${esc(p.summary)}</p></a>`).join("") : `<p>The first story is on its way.</p>`) + FOOT;
await writeFile("blog/index.html", idx);

await writeFile("data/blog.json", JSON.stringify({ posts: posts.map((p) => ({ title: p.title, slug: p.slug, date: p.date, summary: p.summary, tags: p.tags || "", memorial: p.memorial || "" })) }, null, 1) + "\n");

let sm = await readFile("sitemap.xml", "utf8");
sm = sm.replace(/\s*<url>\s*<loc>https:\/\/biffbifford\.com\/blog\/[^<]*<\/loc>[\s\S]*?<\/url>/g, "");
const urls = [`${SITE}/blog/`, ...posts.map((p) => `${SITE}/blog/${p.slug}.html`)];
sm = sm.replace("</urlset>", urls.map((u) => `  <url>\n    <loc>${u}</loc>\n  </url>\n`).join("") + "</urlset>");
await writeFile("sitemap.xml", sm);
console.log(`Built ${posts.length} post(s).`);
