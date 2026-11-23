export interface SketchHoldMagnifierOptions {
  /** مدتِ نگه‌داشتن پیش از ظاهرشدنِ ذره‌بین */
  holdDelayMs?: number;
  /** بزرگ‌نماییِ موضعی — عمداً ملایم‌تر از زومِ عادیِ گالری */
  magnification?: number;
  /** قطرِ ذره‌بین برحسب پیکسل */
  size?: number;
  /** حرکتِ مجاز پیش از فعال‌شدن؛ حرکتِ زودهنگام یعنی کاربر قصدِ اسکرول دارد */
  movementTolerance?: number;
}

/**
 * ذره‌بینِ موقت را روی صفحهٔ اسکچ‌نوت نصب می‌کند. هم تصویرِ کارت‌های گالری و
 * صفحهٔ تک‌اسکچ، هم تصویرِ لایت‌باکس پشتیبانی می‌شوند. فقط HTML هم‌مبدأ قابل
 * دست‌کاری است؛ در صفحهٔ سفارشی/cross-origin بی‌خطر و بدونِ تغییر خارج می‌شود.
 */
export function installSketchHoldMagnifier(
  doc: Document,
  options: SketchHoldMagnifierOptions = {},
): () => void {
  const win = doc.defaultView;
  const lightbox = doc.querySelector<HTMLElement>("[data-sk-lb]");
  const magnifiableSelector = ".sk-item__btn img[data-full], [data-sk-lb] [data-sk-img]";
  if (!win || !doc.body || !doc.querySelector(magnifiableSelector)) return () => {};
  const view = win as NonNullable<typeof win>;

  const holdDelayMs = Math.max(0, options.holdDelayMs ?? 140);
  const magnification = Math.min(2, Math.max(1.1, options.magnification ?? 1.55));
  const size = Math.max(120, Math.min(240, options.size ?? 184));
  const movementTolerance = Math.max(0, options.movementTolerance ?? 9);

  // در لایت‌باکس اسکرولِ طبیعیِ لازم نیست و stage خودش زوم‌شده را drag می‌کند؛
  // در کارت‌های معمولی touch-action را دست نمی‌زنیم تا اسکرولِ صفحه نشکند.
  const imageTouchActions = new Map<HTMLImageElement, string>();
  lightbox?.querySelectorAll<HTMLImageElement>("[data-sk-img]").forEach((image) => {
    imageTouchActions.set(image, image.style.touchAction);
    image.style.touchAction = "none";
  });

  const lens = doc.createElement("div");
  lens.dataset.skHoldMagnifier = "";
  lens.setAttribute("aria-hidden", "true");
  lens.style.cssText = [
    "position:fixed",
    "display:none",
    `width:${size}px`,
    `height:${size}px`,
    "box-sizing:border-box",
    "border:3px solid rgba(255,255,255,.96)",
    "border-radius:50%",
    "background-color:#fff",
    "background-repeat:no-repeat",
    "box-shadow:0 8px 28px rgba(0,0,0,.42)",
    "pointer-events:none",
    "z-index:200",
    "opacity:0",
    "transform:scale(.94)",
    "transition:opacity 110ms ease, transform 130ms ease",
    "will-change:left,top,background-position,background-size,opacity,transform",
  ].join(";");
  doc.body.appendChild(lens);

  let activeImage: HTMLImageElement | null = null;
  let activePointerId: number | null = null;
  let activeButton: Element | null = null;
  let startX = 0;
  let startY = 0;
  let holdTimer: number | null = null;
  let hideTimer: number | null = null;
  let active = false;
  let disposed = false;
  let suppressClickButton: Element | null = null;
  let suppressClickUntil = 0;

  const clamp = (n: number, min: number, max: number): number => Math.max(min, Math.min(max, n));
  const pointerIdOf = (event: PointerEvent): number =>
    typeof event.pointerId === "number" ? event.pointerId : -1;

  function imageFromTarget(target: EventTarget | null): HTMLImageElement | null {
    if (!(target instanceof view.Element)) return null;

    const lightboxImage = target.closest("[data-sk-lb] [data-sk-img]") as HTMLImageElement | null;
    if (lightboxImage) {
      return lightboxImage.closest("[data-sk-lb][open]") ? lightboxImage : null;
    }

    const button = target.closest(".sk-item__btn");
    return button?.querySelector<HTMLImageElement>("img[data-full]") ?? null;
  }

  function fullImageUrl(image: HTMLImageElement): string | null {
    const candidate = image.getAttribute("data-full") || image.getAttribute("data-mid-fallback") || image.currentSrc || image.src;
    if (!candidate) return null;
    try {
      return new URL(candidate, doc.baseURI).href;
    } catch {
      return null;
    }
  }

  function renderLens(image: HTMLImageElement, clientX: number, clientY: number, pointerType: string): boolean {
    const imageRect = image.getBoundingClientRect();
    if (imageRect.width <= 0 || imageRect.height <= 0) return false;

    const url = fullImageUrl(image);
    if (!url) return false;
    const escapedUrl = url.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
    lens.style.backgroundImage = `url("${escapedUrl}")`;

    const viewportWidth = Math.max(1, view.innerWidth || doc.documentElement.clientWidth);
    const viewportHeight = Math.max(1, view.innerHeight || doc.documentElement.clientHeight);
    const lensSize = Math.min(size, Math.max(96, viewportWidth - 12), Math.max(96, viewportHeight - 12));
    const half = lensSize / 2;
    lens.style.width = `${lensSize}px`;
    lens.style.height = `${lensSize}px`;
    lens.style.backgroundSize = `${imageRect.width * magnification}px ${imageRect.height * magnification}px`;

    const pointX = clamp(clientX, imageRect.left, imageRect.right);
    const pointY = clamp(clientY, imageRect.top, imageRect.bottom);
    let centerX = clientX;
    let centerY = clientY;

    // روی گوشی ذره‌بین بالای انگشت می‌آید تا خودش جزئیاتی را که باید دیده شوند نپوشاند.
    if (pointerType === "touch") {
      const offset = lensSize * 0.78;
      centerY = clientY - offset;
      if (centerY - half < 6) centerY = clientY + offset;
    }
    centerX = clamp(centerX, half + 4, viewportWidth - half - 4);
    centerY = clamp(centerY, half + 4, viewportHeight - half - 4);

    const sourceX = ((pointX - imageRect.left) / imageRect.width) * imageRect.width * magnification;
    const sourceY = ((pointY - imageRect.top) / imageRect.height) * imageRect.height * magnification;
    lens.style.backgroundPosition = `${half - sourceX}px ${half - sourceY}px`;
    lens.style.left = `${centerX - half}px`;
    lens.style.top = `${centerY - half}px`;
    return true;
  }

  function clearHoldTimer() {
    if (holdTimer !== null) view.clearTimeout(holdTimer);
    holdTimer = null;
  }

  function hideLens() {
    active = false;
    lens.style.opacity = "0";
    lens.style.transform = "scale(.94)";
    if (hideTimer !== null) view.clearTimeout(hideTimer);
    hideTimer = view.setTimeout(() => {
      lens.style.display = "none";
      lens.style.backgroundImage = "none";
    }, 140);
  }

  function finishPointer() {
    clearHoldTimer();
    if (active) hideLens();
    activeImage = null;
    activePointerId = null;
    activeButton = null;
  }

  function activate(image: HTMLImageElement, clientX: number, clientY: number, pointerType: string) {
    if (disposed || !image.isConnected) return;
    if (hideTimer !== null) view.clearTimeout(hideTimer);
    hideTimer = null;
    if (!renderLens(image, clientX, clientY, pointerType)) return;
    lens.style.display = "block";
    // خواندنِ layout باعث می‌شود transition هم در فعال‌سازیِ دوباره اجرا شود.
    void lens.offsetWidth;
    lens.style.opacity = "1";
    lens.style.transform = "scale(1)";
    active = true;
  }

  function onPointerDown(event: Event) {
    const pointer = event as PointerEvent;
    const image = imageFromTarget(pointer.target);
    if (!image) return;
    if (pointer.pointerType === "mouse" && typeof pointer.button === "number" && pointer.button !== 0) return;

    suppressClickButton = null;
    suppressClickUntil = 0;
    finishPointer();
    activeImage = image;
    activeButton = image.closest(".sk-item__btn");
    activePointerId = pointerIdOf(pointer);
    startX = pointer.clientX;
    startY = pointer.clientY;
    const pointerType = pointer.pointerType || "mouse";
    holdTimer = view.setTimeout(() => {
      holdTimer = null;
      if (activeImage === image && activePointerId === pointerIdOf(pointer)) {
        activate(image, startX, startY, pointerType);
      }
    }, holdDelayMs);
  }

  function isCurrentPointer(event: PointerEvent): boolean {
    return activePointerId !== null && pointerIdOf(event) === activePointerId;
  }

  function onPointerMove(event: Event) {
    const pointer = event as PointerEvent;
    if (!activeImage || !isCurrentPointer(pointer)) return;
    if (!active) {
      const dx = pointer.clientX - startX;
      const dy = pointer.clientY - startY;
      if (Math.hypot(dx, dy) > movementTolerance) finishPointer();
      return;
    }
    // وقتی ذره‌بین فعال است، نگذار drag قدیمیِ گالری هم‌زمان تصویر را جابه‌جا کند.
    pointer.stopPropagation();
    renderLens(activeImage, pointer.clientX, pointer.clientY, pointer.pointerType || "mouse");
  }

  function onPointerEnd(event: Event) {
    const pointer = event as PointerEvent;
    if (activePointerId !== null && !isCurrentPointer(pointer)) return;
    if (active && activeButton) {
      suppressClickButton = activeButton;
      suppressClickUntil = Date.now() + 800;
    }
    finishPointer();
  }

  function onClick(event: Event) {
    if (!suppressClickButton) return;
    if (Date.now() > suppressClickUntil) {
      suppressClickButton = null;
      return;
    }
    const target = event.target;
    if (target instanceof view.Node && suppressClickButton.contains(target)) {
      event.preventDefault();
      event.stopImmediatePropagation();
      suppressClickButton = null;
    }
  }

  function onContextMenu(event: Event) {
    if (active) event.preventDefault();
  }

  function onKeyDown(event: Event) {
    if ((event as KeyboardEvent).key === "Escape") finishPointer();
  }

  function onBlur() {
    finishPointer();
  }

  doc.addEventListener("pointerdown", onPointerDown, true);
  doc.addEventListener("pointermove", onPointerMove, true);
  doc.addEventListener("pointerup", onPointerEnd, true);
  doc.addEventListener("pointercancel", onPointerEnd, true);
  doc.addEventListener("click", onClick, true);
  doc.addEventListener("contextmenu", onContextMenu, true);
  doc.addEventListener("keydown", onKeyDown, true);
  doc.addEventListener("visibilitychange", onBlur);
  view.addEventListener("blur", onBlur);

  return () => {
    disposed = true;
    clearHoldTimer();
    if (hideTimer !== null) view.clearTimeout(hideTimer);
    doc.removeEventListener("pointerdown", onPointerDown, true);
    doc.removeEventListener("pointermove", onPointerMove, true);
    doc.removeEventListener("pointerup", onPointerEnd, true);
    doc.removeEventListener("pointercancel", onPointerEnd, true);
    doc.removeEventListener("click", onClick, true);
    doc.removeEventListener("contextmenu", onContextMenu, true);
    doc.removeEventListener("keydown", onKeyDown, true);
    doc.removeEventListener("visibilitychange", onBlur);
    view.removeEventListener("blur", onBlur);
    imageTouchActions.forEach((touchAction, image) => { image.style.touchAction = touchAction; });
    lens.remove();
    activeImage = null;
    activePointerId = null;
    activeButton = null;
    suppressClickButton = null;
    active = false;
  };
}
