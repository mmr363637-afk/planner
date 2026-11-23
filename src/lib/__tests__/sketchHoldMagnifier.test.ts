// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent } from "@testing-library/dom";
import { installSketchHoldMagnifier } from "../sketchHoldMagnifier";

function makeViewer() {
  document.body.innerHTML = `
    <section data-sk-lb open>
      <div data-sk-stage>
        <img data-sk-img data-full="/images/sketch-full.png" alt="sample sketch" />
      </div>
    </section>`;
  const lightbox = document.querySelector<HTMLElement>("[data-sk-lb]")!;
  const image = document.querySelector<HTMLImageElement>("[data-sk-img]")!;
  vi.spyOn(lightbox, "getBoundingClientRect").mockReturnValue({
    x: 0, y: 0, left: 0, top: 0, right: 800, bottom: 600, width: 800, height: 600,
    toJSON: () => ({}),
  } as DOMRect);
  vi.spyOn(image, "getBoundingClientRect").mockReturnValue({
    x: 100, y: 80, left: 100, top: 80, right: 500, bottom: 380, width: 400, height: 300,
    toJSON: () => ({}),
  } as DOMRect);
  return { lightbox, image };
}

describe("ذره‌بینِ نگه‌داشتنیِ اسکچ‌نوت", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    document.body.innerHTML = "";
    vi.clearAllTimers();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("پس از نگه‌داشتن، نقطهٔ زیرِ اشاره‌گر را ملایم بزرگ می‌کند و با رهاکردن محو می‌شود", () => {
    const { image } = makeViewer();
    const remove = installSketchHoldMagnifier(document);
    expect(image.style.touchAction).toBe("none");

    fireEvent.pointerDown(image, {
      pointerId: 7, pointerType: "mouse", button: 0, clientX: 220, clientY: 170,
    });
    vi.advanceTimersByTime(139);
    expect(document.querySelector("[data-sk-hold-magnifier]")?.getAttribute("style")).toContain("display: none");

    vi.advanceTimersByTime(1);
    const lens = document.querySelector<HTMLElement>("[data-sk-hold-magnifier]")!;
    expect(lens.style.display).toBe("block");
    expect(lens.style.backgroundImage).toContain("sketch-full.png");
    expect(lens.style.backgroundSize).toBe("620px 465px");
    expect(lens.style.opacity).toBe("1");
    const initialPosition = lens.style.backgroundPosition;
    fireEvent.pointerMove(image, { pointerId: 7, pointerType: "mouse", clientX: 310, clientY: 260 });
    expect(lens.style.backgroundPosition).not.toBe(initialPosition);

    fireEvent.pointerUp(image, { pointerId: 7, pointerType: "mouse" });
    expect(lens.style.opacity).toBe("0");
    vi.advanceTimersByTime(140);
    expect(lens.style.display).toBe("none");
    remove();
    expect(image.style.touchAction).toBe("");
    expect(document.querySelector("[data-sk-hold-magnifier]")).toBeNull();
  });

  it("حرکتِ زودهنگام برای کشیدنِ تصویر، ذره‌بین را فعال نمی‌کند", () => {
    const { image } = makeViewer();
    installSketchHoldMagnifier(document);
    fireEvent.pointerDown(image, {
      pointerId: 3, pointerType: "touch", button: 0, clientX: 180, clientY: 160,
    });
    fireEvent.pointerMove(document, {
      pointerId: 3, pointerType: "touch", clientX: 205, clientY: 160,
    });
    vi.advanceTimersByTime(200);
    expect(document.querySelector("[data-sk-hold-magnifier]")?.getAttribute("style")).toContain("display: none");
  });

  it("برای تصویرِ بیرون از لایت‌باکس یا صفحهٔ بسته ذره‌بین نشان نمی‌دهد", () => {
    const { lightbox, image } = makeViewer();
    const thumb = document.createElement("img");
    thumb.setAttribute("data-sk-img", "");
    document.body.appendChild(thumb);
    const remove = installSketchHoldMagnifier(document);

    fireEvent.pointerDown(thumb, { pointerId: 1, pointerType: "mouse", button: 0, clientX: 150, clientY: 150 });
    fireEvent.pointerDown(image, { pointerId: 2, pointerType: "mouse", button: 0, clientX: 150, clientY: 150 });
    lightbox.removeAttribute("open");
    vi.advanceTimersByTime(200);
    expect(document.querySelector("[data-sk-hold-magnifier]")?.getAttribute("style")).toContain("display: none");
    remove();
  });

  it("صفحه‌ای که لایت‌باکس ندارد را دست نمی‌زند", () => {
    document.body.innerHTML = "<main>custom content</main>";
    const remove = installSketchHoldMagnifier(document);
    expect(document.querySelector("[data-sk-hold-magnifier]")).toBeNull();
    remove();
  });
});
