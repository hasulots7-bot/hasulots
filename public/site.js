/* Shared by landing + inner pages. EDIT YOUR CONTACT DETAILS ONLY HERE. */
window.SITE_CONFIG = {
  whatsapp: "919999999999",            // country code + number, no + or spaces
  phone:    "+91 99999 99999",
  email:    "enquiry.print@hasulotstechnologies.com",
  message:  "Hello, I want a 1 week free demo of QuickPrint for my shop."
};
(function () {
  var C = window.SITE_CONFIG;
  var NAV = [
    ["Home", "/"], ["Pricing", "/#pricing"], ["How to Setup", "/setup-guide"], ["⬇ Download App", "/download"],
    ["Features", "/features"], ["About", "/about"], ["Contact Us", "/contact"]
  ];
  var path = location.pathname.replace(/\/+$/, "") || "/";

  var header = '<header><div class="wrap nav">' +
    '<a href="/" class="logo"><img src="/icon-192.png" alt="QuickPrint"><div>QuickPrint<small>BY HASULOTS TECHNOLOGIES</small></div></a>' +
    '<nav><ul id="menu">' + NAV.map(function (n) {
      var active = n[1] === path ? ' class="nav-active"' : '';
      return '<li><a href="' + n[1] + '"' + active + '>' + n[0] + '</a></li>';
    }).join("") + '</ul></nav>' +
    '<div class="nav-cta"><a href="/admin" class="btn btn-ghost">🔑 Shop Login</a>' +
    '<button class="burger" onclick="document.getElementById(\'menu\').classList.toggle(\'open\')" aria-label="Menu">☰</button></div>' +
    '</div></header>';

  var footer = '<footer><div class="wrap"><div class="fgrid">' +
    '<div><div class="logo" style="color:#fff;margin-bottom:10px"><img src="/icon-192.png" alt=""><div>QuickPrint</div></div>' +
    '<p>Scan. Upload. Pay. Auto Print.<br>Cyber cafes, print shops and CSC centers-ku smart printing software.</p></div>' +
    '<div><h4>Product</h4><a href="/setup-guide">How to Setup</a><a href="/features">Features</a><a href="/download">Download Windows App</a><a href="/#pricing">Pricing</a><a href="/#faq">FAQ</a></div>' +
    '<div><h4>Contact</h4><a id="fPhone" href="#">📞 Phone</a><a id="fMail" href="#">📧 Email</a><a href="/about">About Us</a><a href="/admin">🔑 Shop Owner Login</a></div>' +
    '</div><div class="copy">© 2026 QuickPrint • Powered by Hasulots Technologies • All rights reserved</div></div></footer>' +
    '<a class="wa-fab" id="waFab" href="#" target="_blank" rel="noopener" aria-label="WhatsApp">💬</a>';

  document.addEventListener("DOMContentLoaded", function () {
    var h = document.getElementById("site-header"), f = document.getElementById("site-footer");
    if (h) h.outerHTML = header;
    if (f) f.outerHTML = footer;
    var wa = "https://wa.me/" + C.whatsapp + "?text=" + encodeURIComponent(C.message);
    document.querySelectorAll("[data-wa]").forEach(function (a) { a.href = wa; a.target = "_blank"; a.rel = "noopener"; });
    var fab = document.getElementById("waFab"); if (fab) fab.href = wa;
    var p = document.getElementById("fPhone"); if (p) { p.href = "tel:+" + C.whatsapp; p.textContent = "📞 " + C.phone; }
    var m = document.getElementById("fMail"); if (m) { m.href = "mailto:" + C.email; m.textContent = "📧 " + C.email; }
    document.querySelectorAll("[data-phone]").forEach(function (e) { e.textContent = C.phone; if (e.tagName === "A") e.href = "tel:+" + C.whatsapp; });
    document.querySelectorAll("[data-email]").forEach(function (e) { e.textContent = C.email; if (e.tagName === "A") e.href = "mailto:" + C.email; });
    document.querySelectorAll("[data-mailto]").forEach(function (e) { e.href = "mailto:" + C.email; });
    document.querySelectorAll("[data-tel]").forEach(function (e) { e.href = "tel:+" + C.whatsapp; });
    document.querySelectorAll("[data-email-text]").forEach(function (e) { e.textContent = C.email; });
    document.querySelectorAll("[data-phone-text]").forEach(function (e) { e.textContent = C.phone; });
    document.querySelectorAll("#menu a").forEach(function (a) {
      a.addEventListener("click", function () { document.getElementById("menu").classList.remove("open"); });
    });
  });
})();
