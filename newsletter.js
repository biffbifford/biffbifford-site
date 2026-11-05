(function () {
  function go() {
    fetch("/data/newsletter.json", { cache: "no-store" }).then(function (r) { return r.ok ? r.json() : null; }).then(function (c) {
      if (!c || !c.url) return;
      var host = document.querySelector("footer") || document.querySelector(".foot");
      if (!host || document.getElementById("bb-news")) return;
      var st = document.createElement("style");
      st.textContent = "#bb-news{max-width:1100px;margin:40px auto;padding:26px 24px;background:#1D1811;border:1px solid rgba(237,227,204,.16);border-left:5px solid #C9A036;color:#EDE3CC;font-family:'Work Sans',system-ui,sans-serif;font-size:18px;line-height:1.55}" +
        "#bb-news h2{font-family:'Fraunces',Georgia,serif;font-size:1.6rem;line-height:1.2;margin:0 0 8px;color:#EDE3CC}" +
        "#bb-news p{margin:0 0 16px;color:#cfc6af}" +
        "#bb-news a{display:inline-flex;align-items:center;min-height:54px;padding:0 26px;background:#C9A036;color:#15120D;font-weight:600;font-size:1.1rem;text-decoration:none;border-radius:4px}" +
        "#bb-news a:hover{background:#dcb64a}#bb-news a:focus-visible{outline:3px solid #fff;outline-offset:3px}" +
        "@media(max-width:1140px){#bb-news{margin-left:16px;margin-right:16px}}";
      document.head.appendChild(st);
      var d = document.createElement("section");
      d.id = "bb-news"; d.setAttribute("aria-label", "Email signup");
      var h = document.createElement("h2"); h.textContent = c.title || "Get the week's best stories by email";
      var p = document.createElement("p"); p.textContent = c.text || "";
      var a = document.createElement("a"); a.href = c.url; a.target = "_blank"; a.rel = "noopener"; a.textContent = "Sign up free";
      d.appendChild(h); d.appendChild(p); d.appendChild(a);
      host.parentNode.insertBefore(d, host);
    }).catch(function () {});
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", go); else go();
})();
