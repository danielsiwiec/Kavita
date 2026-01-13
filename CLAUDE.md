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

### Immersive Mode (PDF Reader)

**Files Modified:**
- `UI/Web/src/app/pdf-reader/_components/pdf-reader/pdf-reader.component.ts`
- `UI/Web/src/app/pdf-reader/_components/pdf-reader/pdf-reader.component.html`
- `UI/Web/src/app/pdf-reader/_components/pdf-reader/pdf-reader.component.scss`

**Purpose:** Provides a distraction-free, fullscreen-like reading experience optimized for iOS/iPadOS where the native Fullscreen API is not supported.

#### Toolbar Changes

**Removed buttons from `toolbarViewerRight`:**
- Hand tool (`<pdf-hand-tool />`)
- Select tool (`<pdf-select-tool />`)
- Presentation mode (`<pdf-presentation-mode />`)
- Scroll mode toggle button
- Spread mode toggle button
- Theme toggle button
- Secondary toolbar toggle (`<pdf-toggle-secondary-toolbar />`)

**Download disabled:**
- Changed `[showDownloadButton]="canDownload()"` → `[showDownloadButton]="false"`
- Removed `canDownload` computed property
- Removed Ctrl+S download key handler

**Added:**
- Immersive mode button (expand icon: `fa-up-right-and-down-left-from-center`)

#### Functionality

1. **Toggle Behavior**: Click the immersive button to enter/exit immersive mode

2. **Fixed Zoom Level**: `page-width` - ensures content fills the screen width with no side margins

3. **Hidden UI Elements** (via CSS `.immersive-active` class):
   - All toolbars (`#toolbarViewer`, `.toolbar`)
   - Secondary toolbar (`#secondaryToolbar`)
   - Sidebar (`#sidebarContainer`)

4. **Full-Width Display**:
   - Viewer container starts at `top: 0` (no toolbar offset)
   - Page margins and borders removed
   - Content stretches to 100% width

5. **Vertical Scroll Only**:
   - Horizontal overflow disabled (`overflow-x: hidden`)
   - Pinch zoom disabled via touch event handlers
   - Multi-touch gestures blocked (prevents accidental zoom)

6. **Floating Control Panel**: Top-left corner controls (outside main container to avoid zoom transforms)
   - Zoom out (-) button: decreases zoom by 25% (min 25%)
   - Zoom in (+) button: increases zoom by 25% (max 400%)
   - Exit (X) button: exits immersive mode

7. **Reading Progress Tracking**:
   - Scroll position ratio is preserved when toggling immersive mode
   - Page changes trigger `saveProgress()` to update last read location
   - Works correctly on iOS with delayed position restoration (150ms)

8. **Cleanup on Destroy**: Pinch zoom is automatically restored when leaving the reader while in immersive mode

#### Translation Keys

Added to `UI/Web/src/assets/langs/en.json` under `pdf-reader`:
```json
"immersive-mode-alt": "Immersive Mode",
"exit-immersive-alt": "Exit Immersive Mode",
"zoom-in-alt": "Zoom In",
"zoom-out-alt": "Zoom Out"
```

#### Removed Code

- `PdfScrollModeTypePipe` and `PdfSpreadTypePipe` imports (buttons using them are removed)
- `updateHandTool()` method and `(handToolChange)` event handler

#### Implementation Details

**TypeScript properties:**
```typescript
immersiveMode: boolean = false;
private previousZoomSetting: string | number = 'auto';
```

**Key methods:**
- `toggleImmersiveMode()` - Main toggle, saves/restores zoom and scroll position
- `disablePinchZoom()` - Blocks gesture and multi-touch events
- `enablePinchZoom()` - Removes event listeners on exit
- `zoomIn()` - Increases zoom by 25% (max 400%)
- `zoomOut()` - Decreases zoom by 25% (min 25%)

**CSS class applied to container:**
```html
<div class="{{theme}}" [class.immersive-active]="immersiveMode">
```
