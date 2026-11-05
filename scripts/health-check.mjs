// Daily site health check. No dependencies.
// Checks the live site and the repo files. Exits 1 (so GitHub emails the owner) if anything is wrong.
import { readFile, readdir, access } from "node:fs/promises";

const SITE = process.env.SITE_URL || "https://biffbifford.com";
const problems = [];
const warnings = [];
const bad = (m) => problems.push(m);
const warn = (m) => warnings.push(m);
const exists = (p) => access(p).then(() => true, () => false);

// 1. Live pages load and look right
const pages = ["/", "/quiz.html", "/arcade.html", "/wheel.html", "/challenge.html", "/blog/", "/memoriam.html", "/about.html", "/contact.html", "/privacy.html", "/ads.txt", "/sitemap.xml"];
const blog = JSON.parse(await readFile("data/blog.json", "utf8")).posts || [];
for (const p of blog) pages.push(`/blog/${p.slug}.html`);
for (const path of pages) {
  try {
    const r = await fetch(SITE + path, { redirect: "follow", headers: { "user-agent": "biffbifford-health-check" } });
    if (!r.ok) { bad(`${path} returned HTTP ${r.status}`); continue; }
    const t = await r.text();
    if (path === "/ads.txt" && !t.includes("pub-7809888324609473")) bad("ads.txt is missing the AdSense publisher ID");
    if (path.endsWith(".html") || path === "/") {
      if (!/<title>[^<]+<\/title>/i.test(t)) bad(`${path} has no page title`);
      if (path !== "/" && !t.includes("adsbygoogle")) warn(`${path} is missing the AdSense code`);
    }
  } catch (e) { bad(`${path} could not be reached (${e.message})`); }
}

// 2. Data files are valid and not stale
for (const f of (await readdir("data")).filter((x) => x.endsWith(".json"))) {
  try { JSON.parse(await readFile(`data/${f}`, "utf8")); } catch { bad(`data/${f} is broken (invalid JSON)`); }
}
try {
  const q = JSON.parse(await readFile("data/questions.json", "utf8"));
  const list = Array.isArray(q) ? q : q.questions || [];
  const ok = list.filter((x) => x.verified);
  if (ok.length < 30) bad(`Only ${ok.length} verified quiz questions are available`);
} catch {}
try {
  const a = JSON.parse(await readFile("data/alert.json", "utf8"));
  if (a.active && a.until && Date.parse(a.until) < Date.now()) warn("The Breaking bar is switched on but its time has passed (it is hidden for visitors). Update or switch it off.");
} catch {}
try {
  const m = JSON.parse(await readFile("data/movies.json", "utf8"));
  const t = Date.parse(m.updated_at || "");
  if (t && Date.now() - t > 4 * 864e5) warn("Box-office data has not updated in over 4 days.");
} catch {}

// 3. Internal links in local pages point at files that exist
const htmlFiles = ["index.html", "quiz.html", "arcade.html", "wheel.html", "challenge.html", "memoriam.html", "about.html", "contact.html", "privacy.html", "blog/index.html", ...blog.map((p) => `blog/${p.slug}.html`)];
for (const f of htmlFiles) {
  if (!(await exists(f))) { bad(`${f} is missing from the repo`); continue; }
  const html = await readFile(f, "utf8");
  for (const m of html.matchAll(/(?:href|src)="(\/[^"#?]*)"/g)) {
    let p = m[1];
    if (p === "/") continue;
    if (p.endsWith("/")) p += "index.html";
    if (!(await exists(p.slice(1)))) bad(`${f} links to ${m[1]}, which does not exist`);
  }
}

console.log(`Checked ${pages.length} live pages and ${htmlFiles.length} files.`);
for (const w of warnings) console.log("WARNING:", w);
for (const p of problems) console.log("PROBLEM:", p);
if (problems.length) process.exit(1);
console.log("All good.");
