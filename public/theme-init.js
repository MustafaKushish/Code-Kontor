// Hell- oder Dunkel-Modus setzen, bevor die Seite gezeichnet wird (kein Aufblitzen).
try {
  var t = localStorage.getItem("ck-theme");
  if (t === "light" || t === "dark") document.documentElement.setAttribute("data-theme", t);
} catch (e) {}
