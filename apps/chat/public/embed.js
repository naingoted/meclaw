// meclaw embed loader — drop-in chat widget for third-party sites.
// Mobile-responsive: auto-switches to full-screen on mobile (≤768px) and PWA mode.
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

  var currentScript = document.currentScript;
  var scripts = document.getElementsByTagName("script");
  var thisScript = currentScript || scripts[scripts.length - 1];
  var token = thisScript?.getAttribute("data-meclaw-token");
  if (!token) {
    console.error("[meclaw] embed.js: missing data-meclaw-token attribute on <script> tag");
    return;
  }

  // ----- Viewport helpers -----
  function isMobile() {
    return window.innerWidth <= 768;
  }

  function isPWA() {
    return (
      window.matchMedia("(display-mode: standalone)").matches ||
      window.matchMedia("(display-mode: minimal-ui)").matches ||
      window.navigator.standalone === true
    );
  }

  function shouldUseFullscreen() {
    return isMobile() || isPWA();
  }

  function debounce(fn, ms) {
    var timer;
    return function (...args) {
      clearTimeout(timer);
      timer = setTimeout(() => {
        fn.apply(this, args);
      }, ms);
    };
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

  // ----- Theme detection -----
  // Read the parent page's light/dark theme so the widget can match it.
  // Priority: explicit data-meclaw-theme attribute > .dark class on <html>.
  // The host can also push live updates via postMessage({ type: "meclaw:theme", theme }).
  function detectParentTheme() {
    var attr = thisScript?.getAttribute("data-meclaw-theme");
    if (attr === "dark" || attr === "light") return attr;
    return document.documentElement.classList.contains("dark") ? "dark" : "light";
  }

  var initialTheme = detectParentTheme();
  var widgetUrl =
    origin +
    "/widget?embedToken=" +
    encodeURIComponent(token) +
    "&parentOrigin=" +
    encodeURIComponent(parentOrigin) +
    "&theme=" +
    encodeURIComponent(initialTheme);

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
    display: "block",
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
  var fullscreen = shouldUseFullscreen();

  // Determine height with full fallback chain (before Object.assign to avoid flash)
  var heightValue;
  if (fullscreen) {
    if (typeof CSS !== "undefined" && CSS.supports("height", "100dvh")) {
      heightValue = "100dvh";
    } else if (typeof CSS !== "undefined" && CSS.supports("height", "-webkit-fill-available")) {
      heightValue = "-webkit-fill-available";
    } else {
      heightValue = "100vh";
    }
  } else {
    heightValue = "560px";
  }

  Object.assign(container.style, {
    position: "fixed",
    top: fullscreen ? "0" : undefined,
    left: fullscreen ? "0" : undefined,
    right: fullscreen ? undefined : "20px",
    bottom: fullscreen ? undefined : "92px",
    width: fullscreen ? "100vw" : "380px",
    height: heightValue,
    maxWidth: fullscreen ? "100%" : "calc(100vw - 40px)",
    maxHeight: fullscreen ? "100%" : "calc(100vh - 120px)",
    borderRadius: fullscreen ? "0" : "12px",
    overflow: "hidden",
    boxShadow: fullscreen ? "none" : "0 8px 24px rgba(0,0,0,0.22)",
    zIndex: "2147483646",
    display: "none",
    background: "transparent",
    paddingBottom: fullscreen ? "env(safe-area-inset-bottom)" : undefined,
    paddingTop: fullscreen ? "env(safe-area-inset-top)" : undefined,
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
  // The widget always mounts CLOSED on every device (including mobile/PWA) so a
  // page load or refresh never forces it open — the floating bubble is the only
  // entry point. `open` starts false to match the container's initial
  // display:none; tapping the bubble (or MeclawWidget.open()) is what opens it.
  var open = false;
  // Bubble visibility + glyph for the current open/fullscreen state.
  // Fullscreen hides the bubble while open (the in-widget toolbar closes it) and
  // shows it again once closed — the sole reopen affordance. Desktop always
  // shows the bubble. The ✕ glyph only renders when the bubble is visible, so a
  // single `open` ternary covers both modes (fullscreen+open keeps 💬 but it's
  // display:none anyway).
  function updateBubble() {
    bubble.style.display = shouldUseFullscreen() && open ? "none" : "block";
    bubble.textContent = open ? "✕" : "💬";
    bubble.setAttribute("aria-expanded", String(open));
  }
  function toggle() {
    open = !open;
    container.style.display = open ? "block" : "none";
    updateBubble();
  }
  bubble.addEventListener("click", toggle);

  // Close on Escape
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && open) toggle();
  });

  // ----- Viewport resize handler (keyboard open/close, orientation change) -----
  // fallow-ignore-next-line complexity
  function handleViewportResize() {
    var fs = shouldUseFullscreen();
    var viewportHeight;

    // Update bubble visibility — in fullscreen the bubble only shows when the
    // widget is closed (so it can be reopened); on desktop it is always shown.
    bubble.style.display = fs && open ? "none" : "block";

    // Update container dimensions
    if (fs) {
      // Fullscreen mode: respect open state so a resize (keyboard/orientation)
      // doesn't force a dismissed widget back open.
      container.style.display = open ? "block" : "none";
      container.style.top = "0";
      container.style.left = "0";
      container.style.right = "";
      container.style.bottom = "";
      container.style.width = "100vw";
      container.style.maxWidth = "100%";
      container.style.maxHeight = "100%";
      container.style.borderRadius = "0";
      container.style.boxShadow = "none";
      container.style.paddingBottom = "env(safe-area-inset-bottom)";
      container.style.paddingTop = "env(safe-area-inset-top)";

      // Use visualViewport for keyboard handling (modern browsers)
      if (window.visualViewport) {
        viewportHeight = window.visualViewport.height;
        container.style.height = `${viewportHeight}px`;
      } else {
        container.style.height = `${window.innerHeight}px`;
      }
    } else {
      // Desktop mode: respect open state
      container.style.display = open ? "block" : "none";
      container.style.top = "";
      container.style.left = "";
      container.style.right = "20px";
      container.style.bottom = "92px";
      container.style.width = "380px";
      container.style.height = "560px";
      container.style.maxWidth = "calc(100vw - 40px)";
      container.style.maxHeight = "calc(100vh - 120px)";
      container.style.borderRadius = "12px";
      container.style.boxShadow = "0 8px 24px rgba(0,0,0,0.22)";
      container.style.paddingBottom = "";
      container.style.paddingTop = "";
    }
  }

  var debouncedViewportResize = debounce(handleViewportResize, 75);

  // Listen to viewport changes
  if (window.visualViewport) {
    window.visualViewport.addEventListener("resize", debouncedViewportResize);
  }
  window.addEventListener("resize", debouncedViewportResize);
  window.addEventListener("orientationchange", debouncedViewportResize);

  // ----- postMessage protocol (resize + close) -----
  // fallow-ignore-next-line complexity
  window.addEventListener("message", (event) => {
    if (event.origin !== origin) return;
    var data = event.data;
    if (!data || typeof data.type !== "string") return;
    var next;

    if (data.type === "meclaw:resize") {
      // Only apply postMessage resize in desktop mode (mobile uses visualViewport)
      if (shouldUseFullscreen()) return;
      if (typeof data.height === "number") {
        next = Math.max(200, Math.min(data.height, window.innerHeight - 120));
        container.style.height = `${next}px`;
      }
    } else if (data.type === "meclaw:close") {
      if (open) toggle();
    }
  });

  // ----- Parent → iframe theme sync -----
  // The host page can push live theme changes via postMessage. We validate the
  // sender's origin matches the parent page (not the iframe) and relay into
  // the iframe so the widget's ThemeProvider can apply it.
  function isThemePayload(data) {
    return (
      data && data.type === "meclaw:theme" && (data.theme === "dark" || data.theme === "light")
    );
  }
  function relayThemeToIframe(event) {
    if (event.origin !== parentOrigin || !isThemePayload(event.data)) return;
    iframe.contentWindow?.postMessage(event.data, origin);
  }
  window.addEventListener("message", relayThemeToIframe);

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
      // Cleanup viewport resize listeners
      window.removeEventListener("resize", debouncedViewportResize);
      window.removeEventListener("orientationchange", debouncedViewportResize);
      if (window.visualViewport) {
        window.visualViewport.removeEventListener("resize", debouncedViewportResize);
      }
      window.removeEventListener("message", relayThemeToIframe);
      bubble.remove();
      container.remove();
      delete window.MeclawWidget;
    },
  };
})();
