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
  height: "100dvh", // dynamic viewport height for iOS Safari
  maxWidth: "100%",
  maxHeight: "100%",
  borderRadius: "0",
  boxShadow: "none",
  zIndex: "2147483646",
  display: "block",
}
```

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
if (window.visualViewport) {
  window.visualViewport.addEventListener('resize', () => {
    const isMobile = window.innerWidth <= 768;
    if (isMobile) {
      // Adjust container height to visualViewport.height
      container.style.height = window.visualViewport.height + 'px';
    }
  });
}
```

**Fallback:** If `visualViewport` not supported, use `window.innerHeight` on `resize` event.

**Behavior:**
- When keyboard opens: `visualViewport.height` shrinks → iframe height shrinks → chat input remains visible
- When keyboard closes: `visualViewport.height` expands → iframe height expands → full-screen restored
- Chat component's internal scroll + fixed input already handle this gracefully

### Resize Debouncing

Debounce resize events to prevent excessive postMessage calls:
- Wait 150ms after last resize event before updating container dimensions
- Prevents layout thrashing during rapid keyboard open/close

## Implementation Details

### File: `apps/chat/public/embed.js`

**Changes:**
1. Add mobile detection function: `function isMobile() { return window.innerWidth <= 768; }`
2. Add viewport mode setter: `function applyViewportMode() { ... }`
3. Add visualViewport resize listener
4. Modify container styling logic to branch on `isMobile()`
5. Hide bubble on mobile, show on desktop
6. Update existing resize listener to re-evaluate mobile detection

**Key code sections:**
- Lines 72-88: Bubble button styling → add `display: isMobile() ? "none" : "block"`
- Lines 97-113: Container styling → branch on `isMobile()` for dimensions/position
- Lines 144-152: Resize listener → add visualViewport handling + mobile re-evaluation

### File: `apps/chat/app/widget/page.tsx`

**No changes needed.** The Chat component already handles:
- Scrollable message area
- Fixed input at bottom
- Responsive layout

### File: `apps/chat/components/chat/chat.tsx`

**No changes needed.** Already responsive.

## Testing Plan

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
     src="http://localhost:3000/embed.js"  // Changed from https://meclaw.leanior.com/embed.js
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

### Test Cases

**Mobile (≤768px):**
- [ ] Embed loads full-screen (no bubble visible)
- [ ] Chat input is visible and tappable
- [ ] Type a message → keyboard opens → input remains visible
- [ ] Close keyboard → iframe expands back to full-screen
- [ ] Rotate device → iframe adjusts to new orientation
- [ ] Close button (✕) works and hides the embed

**Desktop (>768px):**
- [ ] Bubble visible at bottom-right
- [ ] Click bubble → iframe opens at 380×560px
- [ ] Iframe positioned above bubble
- [ ] Resize browser to <768px → switches to mobile mode
- [ ] Resize browser to >768px → switches back to desktop mode

**Cross-browser:**
- [ ] Chrome mobile (Android)
- [ ] Safari mobile (iOS) — verify `100dvh` works
- [ ] Firefox mobile
- [ ] Desktop Chrome/Firefox/Safari — verify no regression

**Edge cases:**
- [ ] Keyboard open → rotate device → keyboard close
- [ ] Rapid keyboard open/close (debounce test)
- [ ] Very small viewport (iPhone SE) — input still reachable
- [ ] Large tablet (iPad Pro) in portrait — uses desktop mode (acceptable for v1)

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
