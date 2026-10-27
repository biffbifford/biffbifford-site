// scripts/telegram-post.mjs
//
// Posts to the Telegram channel. Usage:  node scripts/telegram-post.mjs <quiz|pick|blog>
//   quiz - a quiz poll with the answer revealed on tap, from the verified questions
//   pick - tonight's classic film (the same pick as the home page)
//   blog - announces the newest blog story once
// Needs two settings (GitHub repo secrets): TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID
// (the channel, like @yourchannel). With either missing, it only prints what it
// would post, so it is safe to run for a test.

import { readFile, writeFile } from "fs/promises";

const SITE = "https://biffbifford.com";
const mode = process.argv[2];
const token = (process.env.TELEGRAM_BOT_TOKEN || "").trim();
const chat = (process.env.TELEGRAM_CHAT_ID || "").trim();
const live = Boolean(token && chat);

// Today in Pacific time, so it matches the website.
const parts = Object.fromEntries(new Intl.DateTimeFormat("en-US", { timeZone: "America/Los_Angeles", year: "numeric", month: "numeric", day: "numeric" })
  .formatToParts(new Date()).map((p) => [p.type, p.value]));
const Y = Number(parts.year), M = Number(parts.month), D = Number(parts.day);
const dayNum = Math.floor((Date.UTC(Y, M - 1, D) - Date.UTC(Y, 0, 0)) / 86400000);
const readJSON = async (p) => JSON.parse(await readFile(p, "utf8"));

async function tg(method, body) {
  if (!live) { console.log(`[dry run] ${method}`, JSON.stringify(body, null, 2)); return; }
  const r = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ chat_id: chat, ...body })
  });
  const j = await r.json();
  if (!j.ok) throw new Error(`Telegram ${method} failed: ${j.description}`);
  console.log(`Sent ${method}`);
}
const clip = (s, n) => (s.length <= n ? s : s.slice(0, n - 1).replace(/\s+\S*$/, "") + "…");
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

if (mode === "quiz") {
  const qs = (await readJSON("data/questions.json")).questions.filter((q) => q.verified === true && !q.final).sort((a, b) => (a.id < b.id ? -1 : 1));
  const q = qs[(dayNum * 7 + Y) % qs.length];
  // shuffle the answers the same way all day, so the right one isn't always first
  let seed = dayNum * 31 + Y;
  const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  const order = [0, 1, 2, 3].sort(() => rnd() - 0.5);
  const options = order.map((i) => clip(q.options[i], 100));
  await tg("sendPoll", {
    question: clip(`🎬 ${q.q}`, 300), options, type: "quiz", is_anonymous: true,
    correct_option_id: order.indexOf(q.answer), explanation: clip(q.fact, 200)
  });
  await tg("sendMessage", { text: `Want five more? Play today's Daily Challenge and keep your streak: ${SITE}/challenge.html`, disable_web_page_preview: true });
} else if (mode === "pick") {
  const picks = (await readJSON("data/daily.json")).picks.filter((p) => p.title && p.year);
  const p = picks[(dayNum + Y) % picks.length];
  const trailer = "https://www.youtube.com/results?search_query=" + encodeURIComponent(`${p.title} ${p.year} trailer`);
  await tg("sendMessage", {
    parse_mode: "HTML", disable_web_page_preview: true,
    text: `🎬 <b>Tonight's classic: ${esc(p.title)} (${esc(p.year)})</b>\nDirected by ${esc(p.director)}. Starring ${esc(p.stars)}.\n\n<a href="${trailer}">Find the trailer</a>\nWatching it? Tell us your favorite scene.\n\nMore at ${SITE}`
  });
} else if (mode === "blog") {
  const posts = (await readJSON("data/blog.json")).posts || [];
  if (!posts.length) { console.log("No blog posts."); process.exit(0); }
  const latest = posts[0];
  let state = {};
  try { state = await readJSON("data/telegram-state.json"); } catch {}
  if (state.last_blog === latest.slug) { console.log("Latest blog story already announced."); process.exit(0); }
  await tg("sendMessage", {
    parse_mode: "HTML",
    text: `📖 <b>New on the blog: ${esc(latest.title)}</b>\n\n${esc(latest.summary)}\n\n${SITE}/blog/${latest.slug}.html`
  });
  if (live) await writeFile("data/telegram-state.json", JSON.stringify({ last_blog: latest.slug }, null, 2) + "\n");
} else {
  console.error("Usage: node scripts/telegram-post.mjs <quiz|pick|blog>");
  process.exit(1);
}
