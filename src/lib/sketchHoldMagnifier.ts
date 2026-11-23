export interface SketchHoldMagnifierOptions {
  /** مدتِ نگه‌داشتن پیش از ظاهرشدنِ ذره‌بین */
  holdDelayMs?: number;
  /** بزرگ‌نماییِ موضعی — عمداً ملایم‌تر از زومِ عادیِ گالری */
  magnification?: number;
  /** قطرِ ذره‌بین برحسب پیکسل */
  size?: number;
  /** حرکتِ مجاز پیش از فعال‌شدن؛ حرکتِ زودهنگام یعنی کاربر قصدِ کشیدن دارد */
  movementTolerance?: number;
}

/**
 * روی لایت‌باکسِ اسکچ‌نوتی که از همان origin آمده یک ذره‌بینِ موقت نصب می‌کند.
 * خودِ HTML مخزن را تغییر نمی‌دهیم؛ ذره‌بین فقط هنگامِ نگه‌داشتنِ تصویر دیده
 * می‌شود و با رهاکردن/لغوِ اشاره‌گر محو می‌شود. برای صفحهٔ سفارشی یا cross-origin
 * که قراردادِ data-sk-* را ندارد، بی‌خطر و بدونِ تغییر خارج می‌شود.
 */
export function installSketchHoldMagnifier(
  doc: Document,
  options: SketchHoldMagnifierOptions = {},
): () => void {
  const win = doc.defaultView;
  const lightbox = doc.querySelector<HTMLElement>("[data-sk-lb]");
  const stage = lightbox?.querySelector<HTMLElement>("[data-sk-stage]");
  if (!win || !lightbox || !stage || !lightbox.querySelector("[data-sk-img]")) return () => {};
  const view = win as NonNullable<typeof win>;

  const holdDelayMs = Math.max(0, options.holdDelayMs ?? 140);
  const magnification = Math.min(2, Math.max(1.1, options.magnification ?? 1.55));
  const size = Math.max(120, Math.min(240, options.size ?? 184));
  const movementTolerance = Math.max(0, options.movementTolerance ?? 9);
  const imageTouchActions = new Map(
    Array.from(lightbox.querySelectorAll<HTMLImageElement>("[data-sk-img]"), (image) => [image, image.style.touchAction]),
  );
  imageTouchActions.forEach((_value, image) => { image.style.touchAction = "none"; });

  const lens = doc.createElement("div");
  lens.dataset.skHoldMagnifier = "";
  lens.setAttribute("aria-hidden", "true");
  lens.style.cssText = [
    "position:absolute",
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
    "z-index:30",
    "opacity:0",
    "transform:scale(.94)",
    "transition:opacity 110ms ease, transform 130ms ease",
    "will-change:left,top,background-position,background-size,opacity,transform",
  ].join(";");
  lightbox.appendChild(lens);

  let activeImage: HTMLImageElement | null = null;
  let activePointerId: number | null = null;
  let startX = 0;
  let startY = 0;
  let holdTimer: number | null = null;
  let hideTimer: number | null = null;
  let active = false;
  let disposed = false;

  const clamp = (n: number, min: number, max: number): number => Math.max(min, Math.min(max, n));
  const pointerIdOf = (event: PointerEvent): number =>
    typeof event.pointerId === "number" ? event.pointerId : -1;

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
  }

  function fullImageUrl(image: HTMLImageElement): string | null {
    const candidate = image.getAttribute("data-full") || image.currentSrc || image.src;
    if (!candidate) return null;
    try {
      return new URL(candidate, doc.baseURI).href;
    } catch {
      return null;
    }
  }

  function renderLens(image: HTMLImageElement, clientX: number, clientY: number, pointerType: string) {
    const imageRect = image.getBoundingClientRect();
    const boxRect = lightbox!.getBoundingClientRect();
    if (imageRect.width <= 0 || imageRect.height <= 0) return;

    const url = fullImageUrl(image);
    if (!url) return;
    const escapedUrl = url.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
    lens.style.backgroundImage = `url("${escapedUrl}")`;
    lens.style.backgroundSize = `${imageRect.width * magnification}px ${imageRect.height * magnification}px`;

    const pointX = clamp(clientX, imageRect.left, imageRect.right);
    const pointY = clamp(clientY, imageRect.top, imageRect.bottom);
    let centerX = clientX;
    let centerY = clientY;

    // روی گوشی، لنز را بالای انگشت می‌گذاریم تا خودش جزئیاتی را که قرار است
    // دیده شوند نپوشاند؛ اگر بالای تصویر جا نبود، به پایینِ انگشت می‌رود.
    if (pointerType === "touch") {
      const radius = size / 2;
      const offset = size * 0.78;
      centerY = clientY - offset;
      if (centerY - radius < boxRect.top + 6) centerY = clientY + offset;
    }
    centerX = clamp(centerX, boxRect.left + size / 2 + 4, boxRect.right - size / 2 - 4);
    centerY = clamp(centerY, boxRect.top + size / 2 + 4, boxRect.bottom - size / 2 - 4);

    const sourceX = ((pointX - imageRect.left) / imageRect.width) * imageRect.width * magnification;
    const sourceY = ((pointY - imageRect.top) / imageRect.height) * imageRect.height * magnification;
    lens.style.backgroundPosition = `${size / 2 - sourceX}px ${size / 2 - sourceY}px`;
    lens.style.left = `${centerX - boxRect.left - size / 2}px`;
    lens.style.top = `${centerY - boxRect.top - size / 2}px`;
  }

  function activate(image: HTMLImageElement, clientX: number, clientY: number, pointerType: string) {
    if (disposed || !image.isConnected || !lightbox?.hasAttribute("open")) return;
    if (hideTimer !== null) view.clearTimeout(hideTimer);
    hideTimer = null;
    renderLens(image, clientX, clientY, pointerType);
    lens.style.display = "block";
    // خواندنِ layout باعث می‌شود transition هم در فعال‌سازیِ دوباره اجرا شود.
    void lens.offsetWidth;
    lens.style.opacity = "1";
    lens.style.transform = "scale(1)";
    active = true;
  }

  function onPointerDown(event: Event) {
    const pointer = event as PointerEvent;
    const target = pointer.target;
    if (!(target instanceof view.HTMLImageElement)) return;
    if (!target.hasAttribute("data-sk-img") || !target.closest("[data-sk-lb][open]")) return;
    if (pointer.pointerType === "mouse" && typeof pointer.button === "number" && pointer.button !== 0) return;

    finishPointer();
    activeImage = target;
    activePointerId = pointerIdOf(pointer);
    startX = pointer.clientX;
    startY = pointer.clientY;
    const pointerType = pointer.pointerType || "mouse";
    holdTimer = view.setTimeout(() => {
      holdTimer = null;
      if (activeImage === target && activePointerId === pointerIdOf(pointer)) {
        activate(target, startX, startY, pointerType);
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
    finishPointer();
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
    doc.removeEventListener("contextmenu", onContextMenu, true);
    doc.removeEventListener("keydown", onKeyDown, true);
    doc.removeEventListener("visibilitychange", onBlur);
    view.removeEventListener("blur", onBlur);
    imageTouchActions.forEach((touchAction, image) => { image.style.touchAction = touchAction; });
    lens.remove();
    activeImage = null;
    activePointerId = null;
    active = false;
  };
}
