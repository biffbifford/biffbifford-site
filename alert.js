/* Breaking bar. Reads data/alert.json and shows a slim bar at the top of the page.
   Hidden when active is false, when the "until" time has passed, or after the visitor closes it. */
(function () {
  function run() {
    fetch("/data/alert.json", { cache: "no-store" }).then(function (r) { return r.ok ? r.json() : null; }).then(function (a) {
      if (!a || !a.active || !a.text) return;
      if (a.until && Date.now() > Date.parse(a.until)) return;
      var key = "bb_alert_closed", closed = "";
      try { closed = localStorage.getItem(key) || ""; } catch (e) {}
      if (closed === a.text) return;
      var st = document.createElement("style");
      st.textContent = ".bb-alert{background:#000;color:#EDE3CC;border-bottom:3px solid #C9A036;font-family:'Work Sans',system-ui,sans-serif;font-size:18px;line-height:1.4;position:relative;z-index:60}" +
        ".bb-alert .in{max-width:1100px;margin:0 auto;padding:10px 56px 10px 20px;display:flex;flex-wrap:wrap;gap:4px 14px;align-items:center}" +
        ".bb-alert b{font-family:'Space Mono',monospace;font-size:.85em;letter-spacing:.08em;color:#C9A036;text-transform:uppercase}" +
        ".bb-alert a{color:#C9A036;font-weight:600;padding:8px 0;display:inline-block}" +
        ".bb-alert button{position:absolute;right:8px;top:50%;transform:translateY(-50%);width:44px;height:44px;border:0;background:none;color:#EDE3CC;font-size:26px;cursor:pointer;line-height:1}" +
        ".bb-alert a:focus-visible,.bb-alert button:focus-visible{outline:3px solid #fff;outline-offset:2px}";
      document.head.appendChild(st);
      var bar = document.createElement("div");
      bar.className = "bb-alert"; bar.setAttribute("role", "region"); bar.setAttribute("aria-label", "Announcement");
      var inner = document.createElement("div"); inner.className = "in";
      var tag = document.createElement("b"); tag.textContent = "In memoriam";
      var txt = document.createElement("span"); txt.textContent = a.text;
      inner.appendChild(tag); inner.appendChild(txt);
      if (a.link) {
        var l = document.createElement("a"); l.href = a.link; l.textContent = (a.link_text || "Read more") + " →"; inner.appendChild(l);
      }
      var x = document.createElement("button"); x.type = "button"; x.setAttribute("aria-label", "Close this announcement"); x.textContent = "×";
      x.onclick = function () { try { localStorage.setItem(key, a.text); } catch (e) {} bar.remove(); };
      bar.appendChild(inner); bar.appendChild(x);
      document.body.insertBefore(bar, document.body.firstChild);
    }).catch(function () {});
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", run); else run();
})();
