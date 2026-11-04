/* Seasonal theme loader. Turns the Thanksgiving look on for November.
   Preview any time with ?theme=thanksgiving, and force it off with ?theme=off. */
(function () {
  var q = (location.search.match(/[?&]theme=([a-z]+)/) || [])[1];
  var now = new Date();
  var on = q === "thanksgiving" || (q !== "off" && now.getMonth() === 10); // November
  if (!on) return;
  var l = document.createElement("link");
  l.rel = "stylesheet"; l.href = "/theme-thanksgiving.css"; document.head.appendChild(l);
  function build() {
    // garland under the first top bar
    var host = document.querySelector("nav") || document.querySelector(".top") || document.querySelector(".topbar");
    if (host && !document.querySelector(".bb-garland")) {
      var g = document.createElement("div"); g.className = "bb-garland"; g.setAttribute("aria-hidden", "true");
      host.parentNode.insertBefore(g, host.nextSibling);
    }
    // ribbon until the day after Thanksgiving (Nov 26, 2026)
    var home = document.getElementById("feature") || document.getElementById("top");
    if (home && now.getFullYear() === 2026 && (now.getMonth() === 10 && now.getDate() <= 26 || q === "thanksgiving")) {
      var r = document.createElement("div"); r.className = "bb-ribbon";
      r.innerHTML = "<span>🦃 Thanksgiving is Thursday, November 26. Pull up a chair.</span>";
      var gg = document.querySelector(".bb-garland");
      (gg || host).parentNode.insertBefore(r, gg ? gg.nextSibling : host.nextSibling);
    }
    // falling leaves
    if (!matchMedia("(prefers-reduced-motion: reduce)").matches) {
      var box = document.createElement("div"); box.className = "bb-leaves"; box.setAttribute("aria-hidden", "true");
      var cols = ["B5471F", "E4A23C", "C8602A", "8A4B1C"];
      for (var i = 0; i < 7; i++) {
        var s = document.createElement("span"); s.className = "bb-leaf";
        var c = cols[i % cols.length];
        s.style.backgroundImage = "url(\"data:image/svg+xml," + encodeURIComponent("<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 26 26'><path d='M13 2c8 5 11 13 0 22C2 15 5 7 13 2z' fill='#" + c + "'/><path d='M13 6v18' stroke='#17100A' stroke-opacity='.35' stroke-width='1.2'/></svg>") + "\")";
        s.style.left = (6 + i * 14) + "%"; s.style.animationDuration = (16 + i * 3) + "s"; s.style.animationDelay = (-i * 4) + "s";
        box.appendChild(s);
      }
      document.body.appendChild(box);
    }
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", build); else build();
})();
