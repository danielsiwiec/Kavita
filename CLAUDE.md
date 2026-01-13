# Kavita Fork - Development Guidelines

## Repository Structure

This is a **fork** of [Kareadita/Kavita](https://github.com/Kareadita/Kavita).

- **origin**: `danielsiwiec/Kavita` (this fork)
- **upstream**: `Kareadita/Kavita` (original project)

## Branching Strategy

Keep commits minimal and focused to reduce merge conflicts with upstream. The goal is to maintain a small diff that can be easily rebased.

### Before Making Changes

```bash
# Fetch latest from upstream
git fetch upstream develop

# Rebase your branch on upstream/develop
git rebase upstream/develop
```

### After Making Changes

```bash
# Always rebase (not merge) to keep history clean
git fetch upstream develop
git rebase upstream/develop

# Force push after rebase
git push origin <branch> --force
```

## Commit Guidelines

1. **Keep commits atomic** - One feature/fix per commit
2. **Avoid modifying upstream files unnecessarily** - Only change what's needed for your feature
3. **Don't sync entire directories** - Cherry-pick specific changes to avoid overwriting upstream updates
4. **Check for upstream changes** before committing files that might have been updated upstream

## Common Pitfalls

### Entity/Migration Mismatches

When copying code from another local repo, be careful with:
- `API/Entities/` - Entity definitions must match migrations
- `API/Data/Migrations/` - Don't overwrite with older versions
- `DataContextModelSnapshot.cs` - Must be consistent with entity definitions

Always verify after syncing:
```bash
git diff upstream/develop -- API/Entities/
git diff upstream/develop -- API/Data/Migrations/DataContextModelSnapshot.cs
```

### Resolving Conflicts

When rebasing causes conflicts:
1. **Language files** (`*.json` in `assets/langs/`) - Take upstream version
2. **openapi.json** - Take upstream version
3. **Your feature files** - Merge carefully, keeping your changes
4. **Entity/Migration files** - Prefer upstream unless you have specific schema changes

## Local Development Files

These files are specific to this fork and not in upstream:
- `Dockerfile.dev` - Local development Dockerfile
- `Makefile` - Build helper

## Useful Commands

```bash
# Check what's different from upstream
git diff upstream/develop --stat

# See commits ahead of upstream
git log upstream/develop..HEAD --oneline

# Interactive rebase to clean up commits before pushing
git rebase -i upstream/develop
```

---

## Fork Features

This section documents custom features implemented in this fork. Use this as reference during rebases to ensure features are preserved correctly.

### Documentation Guidelines for AI Agents

When implementing or modifying fork features, always update this section with:

1. **Purpose**: Why the feature exists and what problem it solves
2. **Files Modified**: All files touched, with paths relative to repo root
3. **Key Implementation Details**: Important code patterns, gotchas, and design decisions
4. **Code Snippets**: Include relevant snippets that capture the essence of the implementation
5. **Why Not Alternatives**: Document approaches that were tried and failed, so future agents don't repeat mistakes
6. **Dependencies**: Any external libraries or upstream features this depends on

### Immersive Mode (PDF Reader)

**Files Modified:**
- `UI/Web/src/app/pdf-reader/_components/pdf-reader/pdf-reader.component.ts`
- `UI/Web/src/app/pdf-reader/_components/pdf-reader/pdf-reader.component.html`
- `UI/Web/src/app/pdf-reader/_components/pdf-reader/pdf-reader.component.scss`

**Purpose:** Provides a distraction-free, fullscreen-like reading experience optimized for iOS/iPadOS where the native Fullscreen API is not supported. Hides all UI chrome and stretches the PDF to fill the full viewport width.

**Dependencies:** `ngx-extended-pdf-viewer` library (already in upstream)

---

#### Toolbar Changes

**Removed from `toolbarViewerRight`:** Hand tool, Select tool, Presentation mode, Scroll/Spread/Theme toggles, Secondary toolbar toggle

**Download disabled:** `[showDownloadButton]="false"` (removed `canDownload` computed property)

**Added:** Immersive mode button with icon `fa-up-right-and-down-left-from-center`

---

#### Core Implementation

##### 1. Calibration-Based Zoom Calculation

**Why not `page-width`?** The PDF.js `page-width` zoom setting leaves small margins. To fill the viewport exactly, we calculate the precise zoom percentage.

**Algorithm:**
```typescript
// In toggleImmersiveMode() - entering immersive mode:
// Step 1: Set zoom to 100% to measure reference width
this.zoomSetting = 100;
this.cdRef.detectChanges();

// Step 2: After render, measure page width at 100%
setTimeout(() => {
  const pageElement = this.document.querySelector('.pdfViewer .page');
  this.pageWidthAt100Percent = pageElement.getBoundingClientRect().width;

  // Step 3: Calculate exact zoom to fill viewport
  const viewportWidth = window.innerWidth;
  const exactZoom = Math.round((viewportWidth / this.pageWidthAt100Percent) * 100);
  this.zoomSetting = exactZoom;
  this.actualZoomPercent = exactZoom;
}, 150);
```

##### 2. Zoom Button Handling

The `+`/`-` buttons must know the current numeric zoom even when `zoomSetting` is a string like `'page-width'`. The `getCurrentNumericZoom()` method provides this with multiple fallbacks:

```typescript
private getCurrentNumericZoom(): number {
  // 1. If already numeric, use directly
  if (typeof this.zoomSetting === 'number') return this.zoomSetting;

  // 2. Calculate from calibrated reference (most reliable)
  if (this.pageWidthAt100Percent > 0) {
    const pageElement = this.document.querySelector('.pdfViewer .page');
    const currentWidth = pageElement.getBoundingClientRect().width;
    return Math.round((currentWidth / this.pageWidthAt100Percent) * 100);
  }

  // 3. Use cached actualZoomPercent
  if (this.actualZoomPercent > 0) return this.actualZoomPercent;

  // 4. Try PDF.js API: window.PDFViewerApplication.pdfViewer.currentScale
  // 5. Try page viewport calculation
  // 6. Fallback: 100
}
```

##### 3. iOS Pinch Zoom Blocking

Safari on iOS ignores `touch-action: none` CSS. Must block at event level:

```typescript
private disablePinchZoom() {
  // Block Safari gesture events
  this.gestureStartHandler = (e: Event) => { e.preventDefault(); e.stopPropagation(); };
  this.gestureChangeHandler = (e: Event) => { e.preventDefault(); e.stopPropagation(); };

  // Block multi-touch
  this.touchStartHandler = (e: TouchEvent) => {
    if (e.touches.length > 1) { e.preventDefault(); e.stopPropagation(); }
  };
  this.touchMoveHandler = (e: TouchEvent) => {
    if (e.touches.length > 1) { e.preventDefault(); e.stopPropagation(); }
  };

  // Must use capture phase to intercept before PDF.js
  const options = { passive: false, capture: true };
  this.document.documentElement.addEventListener('gesturestart', this.gestureStartHandler, options);
  this.document.documentElement.addEventListener('gesturechange', this.gestureChangeHandler, options);
  this.document.documentElement.addEventListener('touchstart', this.touchStartHandler, options);
  this.document.documentElement.addEventListener('touchmove', this.touchMoveHandler, options);
  // Also add to document and body for coverage
}
```

**Critical:** Store handler references for removal in `enablePinchZoom()`. Clean up in `ngOnDestroy()` if leaving while immersive.

##### 4. Escape Key Handling

The Escape key behavior is context-aware: if in immersive mode, it exits immersive mode; otherwise, it closes the reader.

```typescript
// In constructor - register with KeyBindService
this.keyBindService.registerListener(
  this.destroyRef,
  () => this.handleEscape(),
  [KeyBindTarget.Escape],
);

// Handler method
handleEscape() {
  if (this.immersiveMode) {
    this.toggleImmersiveMode();
  } else {
    this.closeReader();
  }
}
```

##### 5. Floating Controls Placement

Controls are **outside** the main container to avoid being affected by CSS transforms:

```html
<!-- Inside container - gets immersive-active class -->
<div class="{{theme}}" [class.immersive-active]="immersiveMode" #container>
  <ngx-extended-pdf-viewer ... />
</div>

<!-- Outside container - not affected by immersive CSS -->
@if (immersiveMode) {
  <div class="immersive-controls">
    <button class="immersive-btn" (click)="zoomOut()">...</button>
    <button class="immersive-btn" (click)="zoomIn()">...</button>
    <button class="immersive-btn" (click)="toggleImmersiveMode()">...</button>
  </div>
}
```

##### 6. CSS Structure

Two-part CSS: direct class for container, `::ng-deep` for library internals:

```scss
// Direct styles on container element
.immersive-active {
  position: fixed !important;
  top: 0 !important; left: 0 !important; right: 0 !important; bottom: 0 !important;
  width: 100vw !important; height: 100vh !important;
  margin: 0 !important; padding: 0 !important;
}

// Deep styles for ngx-extended-pdf-viewer internals
::ng-deep .immersive-active {
  .toolbar, #toolbarViewer, #secondaryToolbar, #sidebarContainer { display: none !important; }

  #viewerContainer {
    position: absolute !important;
    top: 0 !important; left: 0 !important; right: 0 !important; bottom: 0 !important;
    width: 100vw !important;
    overflow-x: auto !important; overflow-y: auto !important;
  }

  .pdfViewer .page { margin: 0 auto !important; border: 0 !important; box-shadow: none !important; }
}

// Floating controls - maximum z-index, semi-transparent
.immersive-controls { position: fixed; top: 12px; left: 12px; z-index: 2147483647; }
.immersive-btn { width: 40px; height: 40px; border-radius: 50%; background: rgba(0,0,0,0.5); }
```

---

#### Why Not These Approaches (Failed Attempts)

1. **`pdfViewerComponent.currentZoomFactor`**: The `@ViewChild` approach to read zoom from the component was unreliable - often returned stale values.

2. **`PDFViewerApplication.pdfViewer.currentScale`**: The PDF.js global API was inconsistent, especially immediately after zoom changes.

3. **`page-width` zoom setting**: Leaves small margins on the sides - not true edge-to-edge.

4. **CSS `touch-action: none`**: Doesn't work on iOS Safari for pinch zoom.

---

#### Translation Keys

Added to `UI/Web/src/assets/langs/en.json` under `pdf-reader`:
```json
"immersive-mode-alt": "Immersive Mode",
"exit-immersive-alt": "Exit Immersive Mode",
"zoom-in-alt": "Zoom In",
"zoom-out-alt": "Zoom Out"
```

---

#### Properties and Methods Summary

**Properties:**
- `immersiveMode: boolean` - Current state
- `previousZoomSetting: string | number` - Saved zoom for restore on exit
- `actualZoomPercent: number` - Cached numeric zoom value
- `pageWidthAt100Percent: number` - Calibration reference
- `gestureStartHandler`, `gestureChangeHandler`, `touchStartHandler`, `touchMoveHandler` - Event handler references for cleanup

**Methods:**
- `toggleImmersiveMode()` - Main toggle with calibration
- `handleEscape()` - Escape key handler: exits immersive mode if active, otherwise closes reader
- `getCurrentNumericZoom()` - Multi-fallback zoom calculation
- `zoomIn()` / `zoomOut()` - Adjust by 10% (range 25-400%)
- `disablePinchZoom()` / `enablePinchZoom()` - iOS gesture blocking
