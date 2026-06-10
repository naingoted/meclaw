// meclaw embed loader — drop-in chat widget for third-party sites.
//
// Usage:
//   <script src="https://chat.example.com/embed.js" data-meclaw-token="pk_xxx" async></script>
//
// What it does:
//   1. Reads `data-meclaw-token` from its own <script> tag.
//   2. Injects a floating bubble button in the bottom-right corner.
//   3. On click, opens an iframe at /widget?embedToken=<token>&parentOrigin=<host-origin>.
//      The parent origin is forwarded explicitly because the iframe's API calls
//      are same-origin (from the chat app), so the browser's Origin header
//      would identify the iframe, not this page.
//   4. Listens for postMessage resize events from the iframe.
//
// Idempotent — double-including the script is a no-op. Exposes a tiny
// control handle on `window.MeclawWidget` for programmatic open/close/destroy.

// fallow-ignore-next-line complexity
(() => {
  // Build identity — placeholders are replaced with the git tag + commit at
  // image build time (see apps/chat/Dockerfile). Unreplaced => local "dev".
  var MECLAW_VERSION = "__MECLAW_VERSION__";
  var MECLAW_SHA = "__MECLAW_SHA__";
  function buildIdent() {
    var v = MECLAW_VERSION.indexOf("__") === 0 ? "dev" : MECLAW_VERSION;
    var s = MECLAW_SHA.indexOf("__") === 0 ? "dev" : MECLAW_SHA.slice(0, 7);
    return { version: v, sha: s, label: `${v}+${s}` };
  }

  if (typeof window === "undefined") return;
  if (window.MeclawWidget) return;

  var ident = buildIdent();
  console.info(`[meclaw] embed loaded v${ident.version} (${ident.sha})`);

  var scripts = document.getElementsByTagName("script");
  var thisScript = scripts[scripts.length - 1];
  var token = thisScript?.getAttribute("data-meclaw-token");
  if (!token) {
    console.error("[meclaw] embed.js: missing data-meclaw-token attribute on <script> tag");
    return;
  }

  // Resolve the chat-app origin from the loader's own URL so embed.js works
  // from any subdomain / port the host chooses.
  var origin;
  try {
    origin = new URL(thisScript.src).origin;
  } catch (e) {
    console.error("[meclaw] embed.js: could not resolve script origin", e);
    return;
  }
  // The iframe's fetch() calls are same-origin from the chat-app origin, so
  // the browser's Origin header identifies the iframe, NOT this parent page.
  // We therefore forward the parent origin explicitly so the chat API can
  // verify it against the embed client's allowlist (defense-in-depth; the
  // CSP frame-ancestors on /widget is the primary enforcement).
  var parentOrigin = window.location.origin;
  var widgetUrl =
    origin +
    "/widget?embedToken=" +
    encodeURIComponent(token) +
    "&parentOrigin=" +
    encodeURIComponent(parentOrigin);

  // ----- Floating bubble -----
  var bubble = document.createElement("button");
  bubble.type = "button";
  bubble.setAttribute("aria-label", "Open chat");
  bubble.setAttribute("data-meclaw-bubble", "true");
  bubble.textContent = "💬"; // 💬
  Object.assign(bubble.style, {
    position: "fixed",
    right: "20px",
    bottom: "20px",
    width: "56px",
    height: "56px",
    borderRadius: "50%",
    border: "none",
    background: "#84cc16", // lime-500 (matches the terminal primary)
    color: "white",
    fontSize: "24px",
    lineHeight: "1",
    cursor: "pointer",
    boxShadow: "0 4px 12px rgba(0,0,0,0.18)",
    zIndex: "2147483646",
    transition: "transform 120ms ease",
  });
  bubble.addEventListener("mouseenter", () => {
    bubble.style.transform = "scale(1.05)";
  });
  bubble.addEventListener("mouseleave", () => {
    bubble.style.transform = "scale(1)";
  });

  // ----- Iframe container -----
  var container = document.createElement("div");
  container.setAttribute("data-meclaw-container", "true");
  Object.assign(container.style, {
    position: "fixed",
    right: "20px",
    bottom: "92px",
    width: "380px",
    height: "560px",
    maxWidth: "calc(100vw - 40px)",
    maxHeight: "calc(100vh - 120px)",
    borderRadius: "12px",
    overflow: "hidden",
    boxShadow: "0 8px 24px rgba(0,0,0,0.22)",
    zIndex: "2147483646",
    display: "none",
    background: "transparent",
  });

  var iframe = document.createElement("iframe");
  iframe.src = widgetUrl;
  iframe.setAttribute("title", "meclaw chat");
  iframe.setAttribute("allow", "clipboard-write");
  Object.assign(iframe.style, {
    width: "100%",
    height: "100%",
    border: "0",
    background: "transparent",
  });
  container.appendChild(iframe);

  // ----- Toggle logic -----
  var open = false;
  function toggle() {
    open = !open;
    container.style.display = open ? "block" : "none";
    bubble.textContent = open ? "✕" : "💬"; // ✕ or 💬
    bubble.setAttribute("aria-expanded", open ? "true" : "false");
  }
  bubble.addEventListener("click", toggle);

  // Close on Escape
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && open) toggle();
  });

  // ----- postMessage resize (the iframe may ask us to grow/shrink) -----
  // fallow-ignore-next-line complexity
  window.addEventListener("message", (event) => {
    if (event.origin !== origin) return;
    var data = event.data;
    if (data?.type !== "meclaw:resize") return;
    if (typeof data.height === "number") {
      const next = Math.max(200, Math.min(data.height, window.innerHeight - 120));
      container.style.height = `${next}px`;
    }
  });

  // ----- Mount -----
  document.body.appendChild(container);
  document.body.appendChild(bubble);

  window.MeclawWidget = {
    version: ident.label,
    open: () => {
      if (!open) toggle();
    },
    close: () => {
      if (open) toggle();
    },
    toggle: toggle,
    destroy: () => {
      bubble.remove();
      container.remove();
      delete window.MeclawWidget;
    },
  };
})();
