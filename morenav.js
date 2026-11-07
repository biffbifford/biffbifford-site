(function () {
  var GAMES = [
    { href: "/challenge.html", name: "Daily Challenge", text: "Five new questions every day. Build a streak." },
    { href: "/puzzle.html", name: "Movie Puzzle", text: "Spin the wheel, pick letters, solve the puzzle." },
    { href: "/wheel.html", name: "The Wheel", text: "Spin for trivia, or for tonight's movie." },
    { href: "/quiz.html", name: "The Quiz", text: "Ten questions that get harder as you go." },
    { href: "/arcade.html", name: "The Arcade", text: "Speed Round and Sudden Death." }
  ];
  function go() {
    if (document.getElementById("bb-more")) return;
    var here = location.pathname.replace(/\/index\.html$/, "/");
    var list = GAMES.filter(function (g) { return here !== g.href; });
    if (here.indexOf("/blog/") === 0 || here === "/memoriam.html") list = GAMES.filter(function (g) { return g.href !== "/arcade.html"; }).slice(0, 3);
    else list = list.slice(0, 3);
    var host = document.querySelector(".fine") || document.querySelector(".foot") || document.querySelector("footer");
    if (!host || !host.parentNode) return;
    var st = document.createElement("style");
    st.textContent = "#bb-more{margin:36px 0 8px;font-family:'Work Sans',system-ui,sans-serif}#bb-more h2{font-family:'Fraunces',Georgia,serif;font-size:1.5rem;line-height:1.2;margin:0 0 14px;color:#EDE3CC}" +
      "#bb-more .t{display:grid;gap:12px}@media(min-width:700px){#bb-more .t{grid-template-columns:repeat(3,1fr)}}" +
      "#bb-more a{position:relative;display:flex;flex-direction:column;gap:4px;padding:18px 20px;min-height:84px;border:1px solid #8A6F27;border-radius:6px;background:linear-gradient(180deg,#241d13,#1b1610);color:#EDE3CC;text-decoration:none;overflow:hidden;transition:transform .15s,border-color .15s}" +
      "#bb-more a:hover{border-color:#C9A036;transform:translateY(-2px)}#bb-more a:focus-visible{outline:3px solid #fff;outline-offset:3px}" +
      "#bb-more a:before,#bb-more a:after{content:'';position:absolute;top:50%;width:20px;height:20px;margin-top:-10px;border-radius:50%;background:#15120D;border:1px solid #8A6F27}#bb-more a:before{left:-11px}#bb-more a:after{right:-11px}" +
      "#bb-more b{font-family:'Fraunces',Georgia,serif;font-size:1.25rem;color:#EDE3CC}#bb-more span{font-size:1rem;color:#cfc6af;line-height:1.4}";
    document.head.appendChild(st);
    var s = document.createElement("section");
    s.id = "bb-more"; s.setAttribute("aria-label", "More to play");
    var h = document.createElement("h2"); h.textContent = "More to play"; s.appendChild(h);
    var t = document.createElement("div"); t.className = "t";
    list.forEach(function (g) {
      var a = document.createElement("a"); a.href = g.href;
      var b = document.createElement("b"); b.textContent = g.name;
      var p = document.createElement("span"); p.textContent = g.text;
      a.appendChild(b); a.appendChild(p); t.appendChild(a);
    });
    s.appendChild(t);
    host.parentNode.insertBefore(s, host);
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", go); else go();
})();
