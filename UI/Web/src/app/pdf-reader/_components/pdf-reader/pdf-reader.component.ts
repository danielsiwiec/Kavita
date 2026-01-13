import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  DestroyRef,
  ElementRef,
  HostListener,
  inject,
  OnDestroy,
  OnInit,
  signal,
  ViewChild
} from '@angular/core';
import {ActivatedRoute, Router} from '@angular/router';
import {
  NgxExtendedPdfViewerModule,
  PageViewModeType,
  pdfDefaultOptions,
  ProgressBarEvent,
  ScrollModeType
} from 'ngx-extended-pdf-viewer';
import {ToastrService} from 'ngx-toastr';
import {take} from 'rxjs';
import {BookService} from 'src/app/book-reader/_services/book.service';
import {UtilityService} from 'src/app/shared/_services/utility.service';
import {Chapter} from 'src/app/_models/chapter';
import {User} from 'src/app/_models/user/user';
import {AccountService} from 'src/app/_services/account.service';
import {NavService} from 'src/app/_services/nav.service';
import {CHAPTER_ID_DOESNT_EXIST, ReaderService} from 'src/app/_services/reader.service';
import {SeriesService} from 'src/app/_services/series.service';
import {ThemeService} from 'src/app/_services/theme.service';
import {NgbTooltip} from '@ng-bootstrap/ng-bootstrap';
import {AsyncPipe, DOCUMENT, NgStyle} from '@angular/common';
import {translate, TranslocoDirective} from "@jsverse/transloco";
import {PdfLayoutMode} from "../../../_models/preferences/pdf-layout-mode";
import {PdfScrollMode} from "../../../_models/preferences/pdf-scroll-mode";
import {PdfTheme} from "../../../_models/preferences/pdf-theme";
import {PdfSpreadMode} from "../../../_models/preferences/pdf-spread-mode";
import {SpreadType} from "node_modules/ngx-extended-pdf-viewer/lib/options/spread-type";
import {ReadingProfile} from "../../../_models/preferences/reading-profiles";
import {takeUntilDestroyed} from "@angular/core/rxjs-interop";
import {KeyBindService} from "../../../_services/key-bind.service";
import {KeyBindTarget} from "../../../_models/preferences/preferences";
import {Breakpoint, BreakpointService} from "../../../_services/breakpoint.service";

@Component({
  selector: 'app-pdf-reader',
  templateUrl: './pdf-reader.component.html',
  styleUrls: ['./pdf-reader.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [NgStyle, NgxExtendedPdfViewerModule, NgbTooltip, AsyncPipe, TranslocoDirective]
})
export class PdfReaderComponent implements OnInit, OnDestroy {

  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly seriesService = inject(SeriesService);
  private readonly navService = inject(NavService);
  private readonly toastr = inject(ToastrService);
  private readonly bookService = inject(BookService);
  private readonly themeService = inject(ThemeService);
  private readonly cdRef = inject(ChangeDetectorRef);
  public readonly accountService = inject(AccountService);
  public readonly readerService = inject(ReaderService);
  public readonly utilityService = inject(UtilityService);
  public readonly destroyRef = inject(DestroyRef);
  public readonly document = inject(DOCUMENT);
  private readonly keyBindService = inject(KeyBindService);
  protected readonly breakpointService = inject(BreakpointService);

  protected readonly ScrollModeType = ScrollModeType;

  @ViewChild('container') container!: ElementRef;

  libraryId!: number;
  seriesId!: number;
  volumeId!: number;
  chapterId!: number;
  chapter!: Chapter;
  user!: User;
  readingProfile!: ReadingProfile;

  /**
   * Reading List id. Defaults to -1.
   */
  readingListId: number = CHAPTER_ID_DOESNT_EXIST;

  /**
   * If this is true, no progress will be saved.
   */
  incognitoMode: boolean = false;

  /**
   * If this is true, chapters will be fetched in the order of a reading list, rather than natural series order.
   */
  readingListMode: boolean = false;

  /**
   * Current Page number
   */
  currentPage: number = 1;
  /**
   * Total pages
   */
  maxPages: number = 1;
  bookTitle: string = '';

  zoomSetting: string | number = 'auto';

  theme: 'dark' | 'light' = 'light';
  themeMap: {[key:string]: {background: string, font: string}} = {
    'dark': {'background': '#292929', 'font': '#d9d9d9'},
    'light': {'background': '#f9f9f9', 'font': '#5a5a5a'}
  }
  backgroundColor: string = this.themeMap[this.theme].background;
  fontColor: string = this.themeMap[this.theme].font;

  /**
   * True if Preferences.DataSaver is true
   */
  disableLoadingIndicator = signal(false);
  isLoading: boolean = true;
  /**
   * How much of the current document is loaded
   */
  loadPercent: number = 0;
  scrollbarNeeded = false;

  pageLayoutMode: PageViewModeType = 'multiple';
  scrollMode: ScrollModeType = ScrollModeType.vertical;
  spreadMode: SpreadType = 'off';
  isSearchOpen: boolean = false;
  /**
   * Immersive mode hides the toolbar for a fullscreen-like experience.
   * Works on iOS/iPadOS where the native Fullscreen API is not supported.
   */
  immersiveMode: boolean = false;
  /**
   * Stores the zoom setting before entering immersive mode so it can be restored.
   */
  private previousZoomSetting: string | number = 'auto';
  /**
   * Tracks the actual numeric zoom factor for use by zoom buttons.
   * Updated via zoomChange event.
   */
  private actualZoomPercent: number = 100;
  /**
   * Stores the page width at 100% zoom - used as reference for calculating current zoom.
   * Captured when entering immersive mode by briefly setting zoom to 100%.
   */
  private pageWidthAt100Percent: number = 0;

  /**
   * Bound event handlers for cleanup.
   */
  private gestureStartHandler: ((e: Event) => void) | null = null;
  private gestureChangeHandler: ((e: Event) => void) | null = null;
  private touchStartHandler: ((e: TouchEvent) => void) | null = null;
  private touchMoveHandler: ((e: TouchEvent) => void) | null = null;

  constructor() {
      this.navService.hideNavBar();
      this.themeService.clearThemes();
      this.navService.hideSideNav();

      this.keyBindService.registerListener(
        this.destroyRef,
        () => this.handleEscape(),
        [KeyBindTarget.Escape],
      );
  }

  @HostListener('window:resize', ['$event'])
  @HostListener('window:orientationchange', ['$event'])
  onResize(event: Event){
    // Update the window Height
    this.calcScrollbarNeeded();
  }

  ngOnDestroy(): void {
    this.themeService.currentTheme$.pipe(take(1)).subscribe(theme => {
      this.themeService.setTheme(theme.name);
    });

    // Restore pinch zoom if leaving while in immersive mode
    if (this.immersiveMode) {
      this.enablePinchZoom();
    }

    this.navService.showNavBar();
    this.navService.showSideNav();
    this.readerService.disableWakeLock();
  }

  ngOnInit(): void {
    const libraryId = this.route.snapshot.paramMap.get('libraryId');
    const seriesId = this.route.snapshot.paramMap.get('seriesId');
    const chapterId = this.route.snapshot.paramMap.get('chapterId');

    if (libraryId === null || seriesId === null || chapterId === null) {
      this.router.navigateByUrl('/home');
      return;
    }

    this.libraryId = parseInt(libraryId, 10);
    this.seriesId = parseInt(seriesId, 10);
    this.chapterId = parseInt(chapterId, 10);
    this.incognitoMode = this.route.snapshot.queryParamMap.get('incognitoMode') === 'true';

    this.route.data.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(data => {
      this.readingProfile = data['readingProfile'];
      if (this.readingProfile == null) {
        this.router.navigateByUrl('/home');
        return;
      }
      this.setupReaderSettings();
      this.cdRef.markForCheck();
    });


    const readingListId = this.route.snapshot.queryParamMap.get('readingListId');
    if (readingListId != null) {
      this.readingListMode = true;
      this.readingListId = parseInt(readingListId, 10);
    }

    this.cdRef.markForCheck();

    this.accountService.currentUser$.pipe(take(1)).subscribe(user => {
      if (user) {
        this.user = user;
        this.init();
      }
    });
  }


  calcScrollbarNeeded() {
    const viewContainer = this.document.querySelector('#viewerContainer');
    if (viewContainer == null) return;
    this.scrollbarNeeded = viewContainer.scrollHeight > this.container?.nativeElement?.clientHeight;
    this.cdRef.markForCheck();
  }

  onZoomChange(zoom: string | number | undefined) {
    // Track the actual numeric zoom for use by zoom buttons
    if (typeof zoom === 'number') {
      this.actualZoomPercent = zoom;
    }
    this.calcScrollbarNeeded();
  }

  convertPdfLayoutMode(mode: PdfLayoutMode) {
    switch (mode) {
      case PdfLayoutMode.Multiple:
        return 'multiple';
      case PdfLayoutMode.Single:
        return 'single';
      case PdfLayoutMode.Book:
        return 'book';
      case PdfLayoutMode.InfiniteScroll:
        return 'infinite-scroll';

    }
  }

  convertPdfScrollMode(mode: PdfScrollMode) {
    switch (mode) {
      case PdfScrollMode.Vertical:
        return ScrollModeType.vertical;
      case PdfScrollMode.Horizontal:
        return ScrollModeType.horizontal;
      case PdfScrollMode.Wrapped:
        return ScrollModeType.wrapped;
      case PdfScrollMode.Page:
        return ScrollModeType.page;
    }
  }

  convertPdfSpreadMode(mode: PdfSpreadMode): SpreadType {
    switch (mode) {
      case PdfSpreadMode.None:
        return 'off' as SpreadType;
      case PdfSpreadMode.Odd:
        return 'odd' as SpreadType;
      case PdfSpreadMode.Even:
        return 'even' as SpreadType;
    }
  }

  convertPdfTheme(theme: PdfTheme) {
    switch (theme) {
      case PdfTheme.Dark:
        return 'dark';
      case PdfTheme.Light:
        return 'light';
    }
  }

  setupReaderSettings() {
    this.pageLayoutMode = this.convertPdfLayoutMode(PdfLayoutMode.Multiple);
    this.scrollMode = this.convertPdfScrollMode(this.readingProfile.pdfScrollMode || PdfScrollMode.Vertical);
    this.spreadMode = this.convertPdfSpreadMode(this.readingProfile.pdfSpreadMode || PdfSpreadMode.None);
    this.theme = this.convertPdfTheme(this.readingProfile.pdfTheme || PdfTheme.Dark);
  }

  init() {
    this.backgroundColor = this.themeMap[this.theme].background;
    this.fontColor = this.themeMap[this.theme].font; // TODO: Move this to an observable or something

    this.disableLoadingIndicator.set(this.user.preferences.dataSaver);
    pdfDefaultOptions.disableAutoFetch = this.user.preferences.dataSaver;

    this.calcScrollbarNeeded();

    this.bookService.getBookInfo(this.chapterId).subscribe(info => {
      this.volumeId = info.volumeId;
      this.bookTitle = info.bookTitle;
      this.cdRef.markForCheck();
    });

    this.readerService.getProgress(this.chapterId).subscribe(progress => {
      this.currentPage = progress.pageNum || 1;
      this.cdRef.markForCheck();
    });

    this.seriesService.getChapter(this.chapterId).subscribe(chapter => {
      this.maxPages = chapter.pages;

      if (this.currentPage >= this.maxPages) {
        this.currentPage = this.maxPages - 1;
        // Don't save progress on first load to avoid session creation, wait for a page change event
      }
      this.cdRef.markForCheck();
    });
    setTimeout(() => this.readerService.enableWakeLock(this.container.nativeElement), 1000);
  }

  /**
   * Turns off Incognito mode. This can only happen once if the user clicks the icon. This will modify URL state
   */
   turnOffIncognito() {
    this.incognitoMode = false;
    const newRoute = this.readerService.getNextChapterUrl(this.router.url, this.chapterId, this.incognitoMode, this.readingListMode, this.readingListId);
    window.history.replaceState({}, '', newRoute);
    this.toastr.info(translate('toasts.incognito-off'));
    this.saveProgress();
    this.cdRef.markForCheck();
  }

  toggleTheme() {
    if (this.theme === 'dark') {
      this.theme = 'light';
    } else {
      this.theme = 'dark';
    }
    this.backgroundColor = this.themeMap[this.theme].background;
    this.fontColor = this.themeMap[this.theme].font;
    this.cdRef.markForCheck();
  }

  toggleScrollMode() {
    const options: Array<ScrollModeType> = [ScrollModeType.vertical, ScrollModeType.horizontal, ScrollModeType.page];
    let index = options.indexOf(this.scrollMode) + 1;
    if (index >= options.length) index = 0;
    this.scrollMode = options[index];

    this.calcScrollbarNeeded();
    const currPage = this.currentPage;
    this.cdRef.markForCheck();

    setTimeout(() => {
      this.currentPage = currPage;
      this.cdRef.markForCheck();
    }, 100);
  }

  toggleSpreadMode() {
     const options: Array<SpreadType> = ['off', 'odd', 'even'];
     let index = options.indexOf(this.spreadMode) + 1;
     if (index >= options.length) index = 0;
     this.spreadMode = options[index];


    this.cdRef.markForCheck();
  }

  toggleBookPageMode() {
    if (this.pageLayoutMode === 'book') {
      this.pageLayoutMode = 'multiple';
    } else {
      if (this.breakpointService.activeBreakpoint() < Breakpoint.Tablet) {
        this.toastr.info(translate('toasts.pdf-book-mode-screen-size'));
        return;
      }
      this.pageLayoutMode = 'book';
      // If the fit is automatic, let's adjust to 100% to ensure it renders correctly (can't do this, but it doesn't always happen)
    }
    this.cdRef.markForCheck();
  }

  saveProgress() {
    if (this.incognitoMode) return;
    this.readerService.saveProgress(this.libraryId, this.seriesId, this.volumeId, this.chapterId, this.currentPage).subscribe();
  }

  closeReader() {
    this.readerService.closeReader(this.libraryId, this.seriesId, this.chapterId, this.readingListMode, this.readingListId);
  }

  handleEscape() {
    if (this.immersiveMode) {
      this.toggleImmersiveMode();
    } else {
      this.closeReader();
    }
  }

  updateLoading(state: boolean) {
    this.isLoading = state;
    this.cdRef.markForCheck();
  }

  updateLoadProgress(event: ProgressBarEvent) {
    this.loadPercent = event.percent;
    this.cdRef.markForCheck();
  }

  updateSearchOpen(event: boolean) {
     this.isSearchOpen = event;
     this.cdRef.markForCheck();
  }

  toggleImmersiveMode() {
    this.immersiveMode = !this.immersiveMode;
    const savedPage = this.currentPage;
    const viewerContainer = this.document.querySelector('#viewerContainer');
    const scrollRatio = viewerContainer ? viewerContainer.scrollTop / (viewerContainer.scrollHeight || 1) : 0;

    if (this.immersiveMode) {
      // Save current zoom setting
      this.previousZoomSetting = this.zoomSetting;
      this.disablePinchZoom();

      // Calibration: First set to 100% to measure the reference page width
      // This allows us to accurately calculate any zoom level later
      this.zoomSetting = 100;
      this.cdRef.detectChanges();

      // Wait for PDF.js to render at 100%, measure, then calculate exact full-width zoom
      setTimeout(() => {
        const pageElement = this.document.querySelector('.pdfViewer .page');
        if (pageElement) {
          this.pageWidthAt100Percent = pageElement.getBoundingClientRect().width;
        }

        // Calculate the exact zoom needed to fill the viewport width
        const viewportWidth = window.innerWidth;
        if (this.pageWidthAt100Percent > 0) {
          // Calculate zoom: (viewportWidth / pageWidthAt100%) * 100
          const exactZoom = Math.round((viewportWidth / this.pageWidthAt100Percent) * 100);
          this.zoomSetting = exactZoom;
          this.actualZoomPercent = exactZoom;
        } else {
          // Fallback to page-width if measurement failed
          this.zoomSetting = 'page-width';
        }
        this.cdRef.markForCheck();
      }, 150);
    } else {
      // Restore previous zoom setting
      this.zoomSetting = this.previousZoomSetting;
      this.enablePinchZoom();
    }

    // Restore scroll position after zoom change settles (longer delay for iOS)
    setTimeout(() => {
      this.currentPage = savedPage;
      // Also restore scroll position ratio for iOS
      if (viewerContainer) {
        viewerContainer.scrollTop = scrollRatio * viewerContainer.scrollHeight;
      }
      this.cdRef.markForCheck();
    }, 150);
    this.cdRef.markForCheck();
  }

  /**
   * Gets the current scale directly from PDF.js global.
   */
  private getScaleFromPdfJs(): number | null {
    try {
      const pdfViewerApp = (window as any)['PDFViewerApplication'];
      const scale = pdfViewerApp?.pdfViewer?.currentScale;
      if (typeof scale === 'number' && scale > 0) {
        return scale;
      }
    } catch (e) {
      // Ignore errors
    }
    return null;
  }

  /**
   * Calculates zoom from PDF.js page viewport data.
   * Compares current viewport width to the intrinsic page width at scale 1.
   */
  private calculateZoomFromPageViewport(): number | null {
    try {
      const pdfViewerApp = (window as any)['PDFViewerApplication'];
      const pageView = pdfViewerApp?.pdfViewer?.getPageView(0);
      if (!pageView) return null;

      // Get the page's intrinsic width at scale 1
      const pdfPage = pageView.pdfPage;
      if (!pdfPage) return null;

      const intrinsicViewport = pdfPage.getViewport({ scale: 1 });
      if (!intrinsicViewport) return null;

      const intrinsicWidth = intrinsicViewport.width;
      if (!intrinsicWidth || intrinsicWidth <= 0) return null;

      // Get the current viewport (at current scale)
      const currentViewport = pageView.viewport;
      if (!currentViewport) return null;

      const currentWidth = currentViewport.width;
      if (!currentWidth || currentWidth <= 0) return null;

      // Calculate zoom: current scale = currentWidth / intrinsicWidth
      const zoom = Math.round((currentWidth / intrinsicWidth) * 100);
      return zoom > 0 ? zoom : null;
    } catch (e) {
      // Ignore errors
    }
    return null;
  }

  private disablePinchZoom() {
    // Prevent Safari gesture events (pinch zoom)
    this.gestureStartHandler = (e: Event) => {
      e.preventDefault();
      e.stopPropagation();
      return false;
    };
    this.gestureChangeHandler = (e: Event) => {
      e.preventDefault();
      e.stopPropagation();
      return false;
    };

    // Prevent multi-touch gestures
    this.touchStartHandler = (e: TouchEvent) => {
      if (e.touches.length > 1) {
        e.preventDefault();
        e.stopPropagation();
      }
    };

    this.touchMoveHandler = (e: TouchEvent) => {
      if (e.touches.length > 1) {
        e.preventDefault();
        e.stopPropagation();
      }
    };

    // Add event listeners with capture phase to intercept early
    const options = { passive: false, capture: true };
    this.document.documentElement.addEventListener('gesturestart', this.gestureStartHandler, options);
    this.document.documentElement.addEventListener('gesturechange', this.gestureChangeHandler, options);
    this.document.documentElement.addEventListener('gestureend', this.gestureStartHandler, options);
    this.document.documentElement.addEventListener('touchstart', this.touchStartHandler, options);
    this.document.documentElement.addEventListener('touchmove', this.touchMoveHandler, options);

    // Also add to document and body for extra coverage
    this.document.addEventListener('gesturestart', this.gestureStartHandler, options);
    this.document.addEventListener('gesturechange', this.gestureChangeHandler, options);
    this.document.body.addEventListener('gesturestart', this.gestureStartHandler, options);
    this.document.body.addEventListener('gesturechange', this.gestureChangeHandler, options);
  }

  private enablePinchZoom() {
    const options = { passive: false, capture: true };

    if (this.gestureStartHandler) {
      this.document.documentElement.removeEventListener('gesturestart', this.gestureStartHandler, options);
      this.document.documentElement.removeEventListener('gestureend', this.gestureStartHandler, options);
      this.document.removeEventListener('gesturestart', this.gestureStartHandler, options);
      this.document.body.removeEventListener('gesturestart', this.gestureStartHandler, options);
      this.gestureStartHandler = null;
    }
    if (this.gestureChangeHandler) {
      this.document.documentElement.removeEventListener('gesturechange', this.gestureChangeHandler, options);
      this.document.removeEventListener('gesturechange', this.gestureChangeHandler, options);
      this.document.body.removeEventListener('gesturechange', this.gestureChangeHandler, options);
      this.gestureChangeHandler = null;
    }
    if (this.touchStartHandler) {
      this.document.documentElement.removeEventListener('touchstart', this.touchStartHandler, options);
      this.touchStartHandler = null;
    }
    if (this.touchMoveHandler) {
      this.document.documentElement.removeEventListener('touchmove', this.touchMoveHandler, options);
      this.touchMoveHandler = null;
    }
  }

  prevPage() {
     this.currentPage--;
     if (this.currentPage < 0) this.currentPage = 0;
     this.cdRef.markForCheck();
  }

  nextPage() {
    this.currentPage++;
    if (this.currentPage > this.maxPages) this.currentPage = this.maxPages;
    this.cdRef.markForCheck();
  }

  zoomIn() {
    // Get current zoom - if page-width, calculate the actual numeric value
    const currentZoom = this.getCurrentNumericZoom();
    const newZoom = Math.min(currentZoom + 10, 400);
    this.zoomSetting = newZoom;
    this.actualZoomPercent = newZoom;
    this.cdRef.markForCheck();
  }

  zoomOut() {
    // Get current zoom - if page-width, calculate the actual numeric value
    const currentZoom = this.getCurrentNumericZoom();
    const newZoom = Math.max(currentZoom - 10, 25);
    this.zoomSetting = newZoom;
    this.actualZoomPercent = newZoom;
    this.cdRef.markForCheck();
  }

  /**
   * Gets the current numeric zoom value.
   * If zoomSetting is already numeric, returns it directly.
   * Otherwise calculates from the calibrated reference width or other methods.
   */
  private getCurrentNumericZoom(): number {
    // If zoomSetting is already numeric, use it
    if (typeof this.zoomSetting === 'number') {
      return this.zoomSetting;
    }

    // For string zoom settings like 'page-width', calculate from calibrated reference
    // Method 1: Use the calibrated page width at 100% (most reliable)
    if (this.pageWidthAt100Percent > 0) {
      const pageElement = this.document.querySelector('.pdfViewer .page');
      if (pageElement) {
        const currentWidth = pageElement.getBoundingClientRect().width;
        if (currentWidth > 0) {
          return Math.round((currentWidth / this.pageWidthAt100Percent) * 100);
        }
      }
    }

    // Method 2: Use captured actualZoomPercent (if available)
    if (this.actualZoomPercent && this.actualZoomPercent > 0) {
      return this.actualZoomPercent;
    }

    // Method 3: Try PDF.js currentScale
    const scale = this.getScaleFromPdfJs();
    if (scale && scale > 0) {
      return Math.round(scale * 100);
    }

    // Method 4: Calculate from page viewport
    const viewportZoom = this.calculateZoomFromPageViewport();
    if (viewportZoom && viewportZoom > 0) {
      return viewportZoom;
    }

    // Final fallback
    return 100;
  }

  protected readonly Breakpoint = Breakpoint;
}
