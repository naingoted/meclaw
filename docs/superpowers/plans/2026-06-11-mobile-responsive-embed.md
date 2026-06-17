# Mobile-Responsive Embed Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the embed.js widget responsive on mobile devices (≤768px) by switching to full-screen mode with keyboard handling, while maintaining backward compatibility with desktop.

**Architecture:** Add viewport detection helpers (`isMobile`, `isPWA`, `shouldUseFullscreen`) to embed.js. Branch styling logic based on viewport mode. Use `visualViewport` API with fallback for keyboard resize handling. Debounce viewport events at 75ms.

**Tech Stack:** Vanilla JavaScript (ES5-compatible for max browser support), CSS `visualViewport` API, `env(safe-area-inset-*)` for notched devices.

**Design Spec:** `docs/superpowers/specs/2026-06-11-mobile-responsive-embed-design.md`

---

## File Structure

**Modify:**
- `apps/chat/public/embed.js` — Add mobile detection, full-screen mode, keyboard handling, PWA detection

**No changes:**
- `apps/chat/app/widget/page.tsx` — Already responsive
- `apps/chat/components/chat/chat.tsx` — Already responsive
- CSP configuration — Already handles mobile via existing `frame-ancestors`

**Test manually on:**
- `/Users/naingthet/Projects/leanior` — Landing page that loads the embed

---

### Task 1: Add Helper Functions

**Files:**
- Modify: `apps/chat/public/embed.js:42-43` (after token validation, before origin resolution)

- [ ] **Step 1: Add viewport detection helpers**

Insert the following code after line 42 (after the token validation block, before the `// Resolve the chat-app origin` comment):

```javascript
  // ----- Viewport helpers -----
  function isMobile() {
    return window.innerWidth <= 768;
  }

  function isPWA() {
    return window.matchMedia("(display-mode: standalone)").matches;
  }

  function shouldUseFullscreen() {
    return isMobile() || isPWA();
  }

  function debounce(fn, ms) {
    var timer;
    return function () {
      var args = arguments;
      var ctx = this;
      clearTimeout(timer);
      timer = setTimeout(function () {
        fn.apply(ctx, args);
      }, ms);
    };
  }
```

**Notes:**
- Uses `var` instead of `const/let` for ES5 compatibility (older mobile browsers)
- Uses `arguments` object instead of rest parameters for ES5 compatibility
- `debounce` is defined here but used in Task 4

- [ ] **Step 2: Verify syntax**

Run: `node -c apps/chat/public/embed.js`

Expected: No output (syntax OK). If errors, fix before proceeding.

- [ ] **Step 3: Commit**

```bash
git add apps/chat/public/embed.js
git commit -m "feat(embed): add viewport detection helpers

- isMobile(): checks window.innerWidth <= 768
- isPWA(): checks display-mode: standalone
- shouldUseFullscreen(): combines both checks
- debounce(): utility for resize event throttling

Refs: docs/superpowers/specs/2026-06-11-mobile-responsive-embed-design.md"
```

---

### Task 2: Update Bubble Styling for Mobile

**Files:**
- Modify: `apps/chat/public/embed.js:72-88` (bubble styling block)

- [ ] **Step 1: Update bubble display logic**

Find the bubble styling block (lines 72-88). Change the `Object.assign` call to conditionally set `display` based on `shouldUseFullscreen()`:

**Before:**
```javascript
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
```

**After:**
```javascript
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
    display: shouldUseFullscreen() ? "none" : "block",
  });
```

**Notes:**
- On mobile/PWA: bubble is hidden (full-screen mode doesn't need a toggle button)
- On desktop: bubble is visible (existing behavior)
- The bubble will be shown/hidden dynamically in Task 4 when viewport changes

- [ ] **Step 2: Verify syntax**

Run: `node -c apps/chat/public/embed.js`

Expected: No output (syntax OK).

- [ ] **Step 3: Commit**

```bash
git add apps/chat/public/embed.js
git commit -m "feat(embed): hide bubble on mobile/PWA

Bubble is hidden in full-screen mode (mobile ≤768px or PWA standalone).
Desktop behavior unchanged.

Refs: docs/superpowers/specs/2026-06-11-mobile-responsive-embed-design.md"
```

---

### Task 3: Update Container Styling for Mobile

**Files:**
- Modify: `apps/chat/public/embed.js:96-113` (container styling block)

- [ ] **Step 1: Update container styling to branch on fullscreen mode**

Find the container styling block (lines 99-113). Replace it with branching logic:

**Before:**
```javascript
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
```

**After:**
```javascript
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
    display: fullscreen ? "block" : "none",
    background: "transparent",
    paddingBottom: fullscreen ? "env(safe-area-inset-bottom)" : undefined,
    paddingTop: fullscreen ? "env(safe-area-inset-top)" : undefined,
  });
```

**Notes:**
- `fullscreen ? "0" : undefined` — setting to `undefined` removes the property (falls back to CSS default)
- Height fallback chain (determined **before** Object.assign to avoid flash/reflow):
  - `100dvh` — iOS Safari 15.4+, Chrome 108+, Firefox 101+ (dynamic viewport height)
  - `-webkit-fill-available` — iOS Safari <15 (fills available viewport)
  - `100vh` — final fallback for older browsers
- `env(safe-area-inset-*)` adds padding for notched devices (iPhone X+, etc.)
  - **Dependency:** Requires parent site to have `<meta name="viewport" content="viewport-fit=cover">`
  - If parent site lacks this meta tag, safe-area insets are ignored (no padding, but embed still works)
- On mobile: container auto-opens (`display: "block"`) — no bubble to click
- On desktop: container hidden by default (`display: "none"`) — existing behavior

- [ ] **Step 2: Verify syntax**

Run: `node -c apps/chat/public/embed.js`

Expected: No output (syntax OK).

- [ ] **Step 3: Commit**

```bash
git add apps/chat/public/embed.js
git commit -m "feat(embed): full-screen container on mobile/PWA

Mobile mode (≤768px or PWA):
- Container fills viewport (100vw × 100dvh)
- Positioned at top-left (0,0)
- No border-radius or shadow
- Auto-opens (no bubble to click)
- Safe-area padding for notched devices
- Height fallback chain: 100dvh → -webkit-fill-available → 100vh
  (determined before Object.assign to avoid flash/reflow)

Desktop mode unchanged (380×560px floating widget).

Refs: docs/superpowers/specs/2026-06-11-mobile-responsive-embed-design.md"
```

---

### Task 4: Add Keyboard and Viewport Resize Handling

**Files:**
- Modify: `apps/chat/public/embed.js:142-152` (postMessage resize block)

- [ ] **Step 1: Add viewport resize handler**

Find the postMessage resize block (lines 142-152). Insert the viewport resize handling code **before** the existing postMessage listener:

**Before:**
```javascript
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
```

**After:**
```javascript
  // ----- Viewport resize handler (keyboard open/close, orientation change) -----
  function handleViewportResize() {
    var fullscreen = shouldUseFullscreen();

    // Update bubble visibility
    bubble.style.display = fullscreen ? "none" : "block";

    // Update container dimensions
    if (fullscreen) {
      container.style.top = "0";
      container.style.left = "0";
      container.style.right = "";
      container.style.bottom = "";
      container.style.width = "100vw";
      container.style.borderRadius = "0";
      container.style.boxShadow = "none";
      container.style.paddingBottom = "env(safe-area-inset-bottom)";
      container.style.paddingTop = "env(safe-area-inset-top)";

      // Use visualViewport for keyboard handling (modern browsers)
      // Note: visualViewport.height automatically adjusts when keyboard opens/closes
      // When keyboard is closed, visualViewport.height equals full viewport height
      if (window.visualViewport) {
        container.style.height = window.visualViewport.height + "px";
      } else {
        // Fallback for older browsers (less accurate keyboard detection)
        container.style.height = window.innerHeight + "px";
      }
    } else {
      container.style.top = "";
      container.style.left = "";
      container.style.right = "20px";
      container.style.bottom = "92px";
      container.style.width = "380px";
      container.style.height = "560px";
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

  // ----- postMessage resize (the iframe may ask us to grow/shrink) -----
  // fallow-ignore-next-line complexity
  window.addEventListener("message", function (event) {
    if (event.origin !== origin) return;
    var data = event.data;
    if (data?.type !== "meclaw:resize") return;
    // Only apply postMessage resize in desktop mode (mobile uses visualViewport)
    if (shouldUseFullscreen()) return;
    if (typeof data.height === "number") {
      var next = Math.max(200, Math.min(data.height, window.innerHeight - 120));
      container.style.height = next + "px";
    }
  });
```

**Notes:**
- `handleViewportResize()` switches between mobile and desktop layouts dynamically
- Debounced at 75ms to balance responsiveness with performance
- Listens to `visualViewport.resize` (keyboard open/close), `resize` (window resize), and `orientationchange` (device rotation)
- Uses `visualViewport.height` when available (accurate keyboard detection), falls back to `window.innerHeight`
- postMessage resize handler now skips in full-screen mode (mobile uses `visualViewport` instead)
- Setting `container.style.right = ""` (empty string) removes the inline style, allowing CSS defaults

- [ ] **Step 2: Verify syntax**

Run: `node -c apps/chat/public/embed.js`

Expected: No output (syntax OK).

- [ ] **Step 3: Commit**

```bash
git add apps/chat/public/embed.js
git commit -m "feat(embed): keyboard and viewport resize handling

- Add handleViewportResize() to switch between mobile/desktop layouts
- Use visualViewport API for accurate keyboard detection
- Fallback to window.innerHeight for older browsers
- Debounce resize events at 75ms
- Listen to visualViewport.resize, resize, orientationchange
- postMessage resize skipped in full-screen mode

When keyboard opens on mobile:
- visualViewport.height shrinks → container height shrinks
- Chat input remains visible and usable

When viewport resizes (orientation change, window resize):
- Layout switches between mobile (full-screen) and desktop (floating)

Refs: docs/superpowers/specs/2026-06-11-mobile-responsive-embed-design.md"
```

---

### Task 5: Local Testing on Leanior

**Files:**
- Test on: `/Users/naingthet/Projects/leanior/src/app/layout.tsx` (temporarily modify embed URL)

- [ ] **Step 1: Start echo-clone dev server**

```bash
cd /Users/naingthet/Projects/ideas/echo-clone
pnpm dev
```

Expected: Dev server starts at `http://localhost:3000`. embed.js served at `http://localhost:3000/embed.js`.

- [ ] **Step 2: Update leanior to use local embed**

Edit `/Users/naingthet/Projects/leanior/src/app/layout.tsx`. Find the Script tag (around line 52-56) and change the `src` from production to local:

**Before:**
```tsx
<Script
  src="https://chat.example.com/embed.js"
  data-meclaw-token="pk_c535d74f082a1d8b8b2b22c153017a74"
  strategy="afterInteractive"
/>
```

**After:**
```tsx
<Script
  src="http://localhost:3000/embed.js"
  data-meclaw-token="pk_c535d74f082a1d8b8b2b22c153017a74"
  strategy="afterInteractive"
/>
```

**Notes:**
- This temporarily points leanior to the local echo-clone dev server
- Do NOT commit this change to leanior (it's for local testing only)
- The token `pk_c535d74f...` is the same (works with both local and production)

- [ ] **Step 3: Start leanior dev server**

```bash
cd /Users/naingthet/Projects/leanior
npm run dev
```

Expected: Dev server starts (likely at `http://localhost:3000` or `http://localhost:3001`). Check terminal output for the exact URL.

**Note:** If leanior also runs on port 3000, change its port in `next.config.js` or use `npm run dev -- -p 3001`.

- [ ] **Step 4: Test mobile mode (≤768px)**

Open Chrome DevTools → Toggle device toolbar (Ctrl+Shift+M / Cmd+Opt+M). Select "iPhone 12" or "Pixel 5" viewport.

Navigate to the leanior page. Verify:
- [ ] Embed loads full-screen (no bubble visible)
- [ ] Container fills the viewport (100vw × 100dvh)
- [ ] Chat input is visible at the bottom
- [ ] Click the close button (✕) → embed hides
- [ ] Refresh page → embed re-opens (mobile auto-opens)

- [ ] **Step 5: Test keyboard handling**

With mobile viewport active:
- [ ] Click the chat input field → virtual keyboard opens (simulate via DevTools)
- [ ] Container height shrinks to fit `visualViewport.height`
- [ ] Chat input remains visible above the keyboard
- [ ] Close keyboard → container expands back to full-screen

**Note:** Chrome DevTools doesn't perfectly simulate mobile keyboard behavior. For accurate testing, use a real mobile device (see Step 8).

- [ ] **Step 6: Test orientation change**

With mobile viewport active:
- [ ] Rotate device (click the rotation icon in DevTools)
- [ ] Container adjusts to new orientation (portrait → landscape or vice versa)
- [ ] Layout remains full-screen in both orientations

- [ ] **Step 6b: Test compound scenario — keyboard open + rotation**

With mobile viewport active:
- [ ] Click chat input → keyboard opens
- [ ] While keyboard is open, rotate device (portrait → landscape)
- [ ] Container adjusts to landscape orientation
- [ ] Chat input remains visible above keyboard
- [ ] Close keyboard → container expands to full-screen landscape
- [ ] Rotate back to portrait → container adjusts to full-screen portrait

**Note:** This is a common real-world scenario where bugs surface (e.g., visualViewport dimensions getting stuck).

- [ ] **Step 7: Test desktop mode (>768px)**

Disable device toolbar (or select "Responsive" with width >768px).

- [ ] Bubble visible at bottom-right
- [ ] Click bubble → iframe opens at 380×560px
- [ ] Iframe positioned above bubble (bottom: 92px, right: 20px)
- [ ] Resize browser to <768px → switches to mobile mode (bubble hides, container full-screen)
- [ ] Resize browser to >768px → switches back to desktop mode

- [ ] **Step 8: Test on real mobile device (optional but recommended)**

For accurate keyboard and touch testing:
1. Ensure your dev machine and mobile device are on the same network
2. Find your dev machine's local IP (e.g., `192.168.1.100`)
3. Update leanior to use `http://192.168.1.100:3000/embed.js` (replace with your IP)
4. Open leanior on your mobile device (e.g., `http://192.168.1.100:3001`)
5. Test keyboard open/close, orientation change, touch interactions

**Note:** This requires network access and may require firewall adjustments. Skip if not feasible.

- [ ] **Step 9: Revert leanior changes**

After testing, revert the leanior `layout.tsx` change:

```bash
cd /Users/naingthet/Projects/leanior
git checkout src/app/layout.tsx
```

Expected: leanior points back to production embed (`https://chat.example.com/embed.js`).

- [ ] **Step 10: Verify no regressions in echo-clone**

```bash
cd /Users/naingthet/Projects/ideas/echo-clone
pnpm verify
```

Expected: All checks pass (lint, typecheck, build, test).

---

### Task 6: Final Commit and Documentation

**Files:**
- No file changes (documentation only)

- [ ] **Step 1: Update HANDOFF.md**

Edit `docs/ai/HANDOFF.md`. Add a note about the mobile-responsive embed completion:

```markdown
## Mobile-Responsive Embed (2026-06-11)

**Status:** COMPLETE  
**Spec:** `docs/superpowers/specs/2026-06-11-mobile-responsive-embed-design.md`

**What was built:**
- Mobile breakpoint (≤768px) → full-screen embed
- Keyboard handling via `visualViewport` API with fallback
- PWA mode detection (display-mode: standalone)
- Safe-area insets for notched devices
- 75ms debounced viewport resize handling
- Backward compatible with desktop (>768px)

**Testing:**
- Manual testing on leanior repo (local dev servers)
- Chrome DevTools mobile emulation
- Real mobile device testing (optional)

**Browser compatibility:**
- visualViewport API: Chrome 61+, Firefox 55+, Safari 13+
- 100dvh: Chrome 108+, Firefox 101+, Safari 15.4+
- Fallbacks: 100vh for older browsers, resize event for older browsers
```

- [ ] **Step 2: Commit HANDOFF update**

```bash
git add docs/ai/HANDOFF.md
git commit -m "docs: update HANDOFF with mobile-responsive embed completion"
```

- [ ] **Step 3: Final verification**

```bash
pnpm verify
```

Expected: All checks pass.

---

## Summary

**Total tasks:** 6  
**Estimated time:** 2-3 hours (including manual testing)  
**Files modified:** 1 (`apps/chat/public/embed.js`)  
**Files created:** 0  
**Breaking changes:** None  
**Backward compatibility:** Full (desktop behavior unchanged)

**Key features delivered:**
1. Mobile full-screen mode (≤768px)
2. Keyboard resize handling (visualViewport API)
3. PWA mode detection
4. Safe-area insets for notched devices
5. Dynamic viewport mode switching (resize/orientation)
6. 75ms debounced resize events

**Next steps (v2):**
- Tablet-specific breakpoints (768px–1024px)
- Automated visual regression tests (Playwright/Percy)
- Smooth transitions between modes
- User preference persistence (localStorage)
