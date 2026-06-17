# Mobile-Responsive Embed Design Spec

**Date:** 2026-06-11  
**Status:** Draft  
**Owner:** echo-clone team

## Problem Statement

The current embed.js widget is optimized for desktop: a 380×560px floating bubble + iframe positioned at the bottom-right of the viewport. On mobile devices, this creates a poor user experience:
- Widget is too small relative to screen size
- Chat input is difficult to tap
- When the virtual keyboard opens, the iframe doesn't adjust, causing the input field to be hidden or the layout to break
- No mobile-specific optimizations

## Goals

1. **Mobile-first usability:** On mobile devices (≤768px width), the embed should expand to full-screen for maximum usability
2. **Keyboard resilience:** When the virtual keyboard opens on mobile, the iframe should adjust height dynamically so the chat input remains visible and usable
3. **Backward compatibility:** Desktop behavior (>768px) remains unchanged
4. **Zero breaking changes:** Existing embed API (token, parentOrigin params) unchanged
5. **Smooth transitions:** Orientation changes and keyboard open/close should not cause layout jumps

## Non-Goals

- Tablet-specific optimizations (768px–1024px) — can be added in v2 if needed
- User-toggleable modes (minimize/expand) — out of scope for v1
- Changes to the Chat component itself — it's already responsive

## Architecture

### Breakpoint Detection

- **Mobile breakpoint:** `window.innerWidth <= 768`
- Detection runs on:
  - Initial load
  - `resize` event (debounced)
  - `orientationchange` event
  - `visualViewport.resize` event (keyboard open/close)

### Mobile Mode (≤768px)

**Container styling:**
```javascript
{
  position: "fixed",
  top: "0",
  left: "0",
  width: "100vw",
  height: "100dvh", // dynamic viewport height for iOS Safari 15.4+
  height: "100vh", // fallback for older browsers
  height: "-webkit-fill-available", // fallback for iOS Safari <15
  maxWidth: "100%",
  maxHeight: "100%",
  borderRadius: "0",
  boxShadow: "none",
  zIndex: "2147483646",
  display: "block",
  paddingBottom: "env(safe-area-inset-bottom)", // iPhone X+ notch/home indicator
  paddingTop: "env(safe-area-inset-top)",
}
```

**Note:** CSS cascade will use the last supported `height` value. Modern browsers use `100dvh`, older fallback to `100vh` or `-webkit-fill-available`.

**Bubble button:** Hidden (`display: "none"`)

**Iframe:** 100% width/height of container

### Desktop Mode (>768px)

Unchanged from current behavior:
- Bubble button visible at bottom-right
- Container: 380×560px, fixed position, rounded corners, shadow
- Container hidden by default, toggled on bubble click

### Keyboard Handling

Use the `window.visualViewport` API to detect keyboard open/close:

```javascript
function handleKeyboardResize() {
  const isMobile = window.innerWidth <= 768;
  if (!isMobile) return;
  
  // Use visualViewport if available (modern browsers)
  if (window.visualViewport) {
    container.style.height = window.visualViewport.height + 'px';
  } else {
    // Fallback: use window.innerHeight (less accurate but works)
    container.style.height = window.innerHeight + 'px';
  }
}

// Feature detection
if (window.visualViewport) {
  window.visualViewport.addEventListener('resize', handleKeyboardResize);
} else {
  // Fallback for older browsers (Android Chrome, older iOS)
  window.addEventListener('resize', handleKeyboardResize);
}
```

**Browser compatibility:**
- `visualViewport` API: Chrome 61+, Firefox 55+, Safari 13+ (iOS 13+)
- Fallback `resize` event: All browsers
- Note: Android Chrome keyboard doesn't always trigger `resize` but does change `visualViewport.height`

**Behavior:**
- When keyboard opens: `visualViewport.height` shrinks → iframe height shrinks → chat input remains visible
- When keyboard closes: `visualViewport.height` expands → iframe height expands → full-screen restored
- Chat component's internal scroll + fixed input already handle this gracefully

### Resize Debouncing

Debounce resize events to prevent excessive postMessage calls:
- Wait 75ms after last resize event before updating container dimensions
- Balances responsiveness (keyboard animation ~250ms) with performance
- Prevents layout thrashing during rapid keyboard open/close

### PWA Mode Detection

Detect if the embed is loaded in a PWA (Progressive Web App) installed on the home screen:

```javascript
function isPWA() {
  return window.matchMedia('(display-mode: standalone)').matches;
}
```

**Behavior:**
- PWA mode: Use mobile full-screen layout (same as mobile breakpoint)
- Rationale: PWAs have minimal browser chrome, so full-screen embed is appropriate
- Detection runs alongside mobile breakpoint check

## Implementation Details

### File: `apps/chat/public/embed.js`

**Changes:**

#### 1. Add helper functions (after line 40)

```javascript
function isMobile() {
  return window.innerWidth <= 768;
}

function isPWA() {
  return window.matchMedia('(display-mode: standalone)').matches;
}

function shouldUseFullscreen() {
  return isMobile() || isPWA();
}
```

#### 2. Update bubble button styling (lines 72-88)

**Before:**
```javascript
Object.assign(bubble.style, {
  position: "fixed",
  right: "20px",
  bottom: "20px",
  // ... other styles
  display: "block",
});
```

**After:**
```javascript
Object.assign(bubble.style, {
  position: "fixed",
  right: "20px",
  bottom: "20px",
  // ... other styles
  display: shouldUseFullscreen() ? "none" : "block", // Hide on mobile/PWA
});
```

#### 3. Update container styling (lines 97-113)

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
const fullscreen = shouldUseFullscreen();
Object.assign(container.style, {
  position: "fixed",
  top: fullscreen ? "0" : undefined,
  left: fullscreen ? "0" : undefined,
  right: fullscreen ? undefined : "20px",
  bottom: fullscreen ? undefined : "92px",
  width: fullscreen ? "100vw" : "380px",
  height: fullscreen ? "100dvh" : "560px",
  maxWidth: fullscreen ? "100%" : "calc(100vw - 40px)",
  maxHeight: fullscreen ? "100%" : "calc(100vh - 120px)",
  borderRadius: fullscreen ? "0" : "12px",
  overflow: "hidden",
  boxShadow: fullscreen ? "none" : "0 8px 24px rgba(0,0,0,0.22)",
  zIndex: "2147483646",
  display: fullscreen ? "block" : "none", // Auto-open on mobile
  background: "transparent",
  paddingBottom: fullscreen ? "env(safe-area-inset-bottom)" : undefined,
  paddingTop: fullscreen ? "env(safe-area-inset-top)" : undefined,
});

// Fallback for browsers that don't support 100dvh
if (fullscreen && !CSS.supports('height', '100dvh')) {
  container.style.height = '100vh';
}
```

#### 4. Update resize listener (lines 144-152)

**Before:**
```javascript
window.addEventListener("message", (event) => {
  if (event.data?.type === "meclaw:resize") {
    const newHeight = Math.max(200, Math.min(event.data.height, window.innerHeight - 120));
    container.style.height = newHeight + "px";
  }
});
```

**After:**
```javascript
// Debounce helper
function debounce(fn, ms) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  };
}

// Keyboard/viewport resize handler
function handleViewportResize() {
  const fullscreen = shouldUseFullscreen();
  
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
    
    // Use visualViewport for keyboard handling
    if (window.visualViewport) {
      container.style.height = window.visualViewport.height + "px";
    } else {
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

const debouncedViewportResize = debounce(handleViewportResize, 75);

// Listen to viewport changes
if (window.visualViewport) {
  window.visualViewport.addEventListener("resize", debouncedViewportResize);
}
window.addEventListener("resize", debouncedViewportResize);
window.addEventListener("orientationchange", debouncedViewportResize);

// Existing postMessage resize handler (for desktop mode)
window.addEventListener("message", (event) => {
  if (event.data?.type === "meclaw:resize" && !shouldUseFullscreen()) {
    const newHeight = Math.max(200, Math.min(event.data.height, window.innerHeight - 120));
    container.style.height = newHeight + "px";
  }
});
```

### File: `apps/chat/app/widget/page.tsx`

**No changes needed.** The Chat component already handles:
- Scrollable message area
- Fixed input at bottom
- Responsive layout

### File: `apps/chat/components/chat/chat.tsx`

**No changes needed.** Already responsive.

### CSP Configuration

**No changes needed.** The existing CSP `frame-ancestors` directive (configured via middleware) already permits embedding from authorized origins. The mobile responsive changes don't affect CSP requirements.

Reference: `apps/chat/lib/embed/auth.ts` handles CSP enforcement via `resolveEmbedClient()` and allowed origins list.

## Testing Plan

### Browser Compatibility Matrix

| Feature | Chrome | Firefox | Safari | Edge | Samsung Internet |
|---------|--------|---------|--------|------|------------------|
| `visualViewport` API | 61+ | 55+ | 13+ (iOS 13+) | 79+ | 8+ |
| `100dvh` | 108+ | 101+ | 15.4+ | 108+ | 23+ |
| `env(safe-area-inset-*)` | 69+ | 65+ | 11.2+ | 79+ | 10+ |
| `display-mode: standalone` | ✅ | ✅ | ✅ | ✅ | ✅ |

**Fallbacks:**
- `visualViewport` → `resize` event + `window.innerHeight`
- `100dvh` → `100vh` → `-webkit-fill-available`
- `env(safe-area-inset-*)` → ignored (no padding on notched devices)

### Local Testing Setup

1. **Start echo-clone dev server:**
   ```bash
   cd /Users/naingthet/Projects/ideas/echo-clone
   pnpm dev
   ```
   Embed.js served at `http://localhost:3000/embed.js`

2. **Update leanior to use local embed:**
   Edit `/Users/naingthet/Projects/leanior/src/app/layout.tsx`:
   ```tsx
   <Script
     src="http://localhost:3000/embed.js"  // Changed from https://chat.example.com/embed.js
     data-meclaw-token="pk_c535d74f082a1d8b8b2b22c153017a74"
     strategy="afterInteractive"
   />
   ```

3. **Start leanior dev server:**
   ```bash
   cd /Users/naingthet/Projects/leanior
   npm run dev
   ```
   Landing page at `http://localhost:3000` (or similar)

4. **Test on mobile viewport:**
   - Open Chrome DevTools → Toggle device toolbar (Ctrl+Shift+M)
   - Select iPhone 12 / Pixel 5 viewport
   - Load leanior page
   - Verify embed loads full-screen

### Cross-Origin Testing Setup

**Critical:** Test real-world scenario where embed.js is served from different origin than parent site (triggers CORS/CSP behavior).

**Option 1: Use production embed (recommended)**
- Keep leanior pointing to `https://chat.example.com/embed.js` (production)
- Deploy echo-clone changes to staging/production
- Test on real mobile device (not just DevTools)

**Option 2: Local cross-origin setup**
- Run echo-clone on `http://localhost:3000`
- Run leanior on `http://localhost:3001` (change port in `next.config.js`)
- Update leanior to use `http://localhost:3000/embed.js`
- This simulates cross-origin behavior locally

**Verify:**
- CSP `frame-ancestors` allows the parent origin
- postMessage origin validation passes
- No CORS errors in console

### Test Cases

**Mobile (≤768px):**
- [ ] Embed loads full-screen (no bubble visible)
- [ ] Chat input is visible and tappable
- [ ] Type a message → keyboard opens → input remains visible
- [ ] Close keyboard → iframe expands back to full-screen
- [ ] Rotate device → iframe adjusts to new orientation
- [ ] Close button (✕) works and hides the embed
- [ ] Safe area insets work on iPhone X+ (notch/home indicator)
- [ ] PWA mode (Add to Home Screen) → full-screen layout

**Desktop (>768px):**
- [ ] Bubble visible at bottom-right
- [ ] Click bubble → iframe opens at 380×560px
- [ ] Iframe positioned above bubble
- [ ] Resize browser to <768px → switches to mobile mode
- [ ] Resize browser to >768px → switches back to desktop mode

**Cross-browser (real devices or BrowserStack):**
- [ ] Chrome mobile (Android 12+)
- [ ] Safari mobile (iOS 15+) — verify `100dvh` works
- [ ] Safari mobile (iOS 13-14) — verify fallback to `100vh`
- [ ] Firefox mobile
- [ ] Samsung Internet
- [ ] Desktop Chrome/Firefox/Safari/Edge — verify no regression

**Edge cases:**
- [ ] Keyboard open → rotate device → keyboard close
- [ ] Rapid keyboard open/close (debounce test)
- [ ] Very small viewport (iPhone SE) — input still reachable
- [ ] Large tablet (iPad Pro) in portrait — uses desktop mode (acceptable for v1)
- [ ] Tablet in landscape (>768px) — uses desktop mode (acceptable for v1)
- [ ] Split-screen mode (Android/iPad) — behaves based on viewport width
- [ ] Pinch-to-zoom → embed scales with page (acceptable for v1)

**Cross-origin:**
- [ ] Embed loaded from different origin → no CORS errors
- [ ] CSP `frame-ancestors` allows parent origin → iframe loads
- [ ] CSP `frame-ancestors` blocks parent origin → iframe blocked (expected)
- [ ] postMessage origin validation passes → chat works
- [ ] postMessage origin mismatch → chat blocked (security)

## Out of Scope

- Tablet-specific breakpoints (768px–1024px)
- User-toggleable minimize/expand modes
- Persistent state (remember user's preferred mode)
- Animation/transitions between modes (snappy switch is acceptable)
- Changes to Chat component UI/UX

## Success Criteria

- [ ] Mobile users see full-screen embed (no tiny floating widget)
- [ ] Keyboard open/close doesn't break layout
- [ ] Chat input always reachable and usable on mobile
- [ ] Zero regressions on desktop
- [ ] All test cases pass

## Future Enhancements (v2)

- Tablet breakpoint (768px–1024px) with larger floating widget
- Smooth transitions between mobile/desktop modes
- User preference persistence (localStorage)
- Minimize-to-bubble on mobile (toggle mode)
- Haptic feedback on bubble tap (mobile)
