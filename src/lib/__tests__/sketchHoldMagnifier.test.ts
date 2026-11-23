// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent } from "@testing-library/dom";
import { installSketchHoldMagnifier } from "../sketchHoldMagnifier";

function rect(left: number, top: number, width: number, height: number): DOMRect {
  return {
    x: left, y: top, left, top, right: left + width, bottom: top + height, width, height,
    toJSON: () => ({}),
  } as DOMRect;
}

function makeViewer() {
  document.body.innerHTML = `
    <section data-sk-lb open>
      <div data-sk-stage>
        <img data-sk-img data-full="/images/sketch-full.png" alt="sample sketch" />
      </div>
    </section>`;
  const lightbox = document.querySelector<HTMLElement>("[data-sk-lb]")!;
  const image = document.querySelector<HTMLImageElement>("[data-sk-img]")!;
  vi.spyOn(image, "getBoundingClientRect").mockReturnValue(rect(100, 80, 400, 300));
  return { lightbox, image };
}

function makeGallery() {
  document.body.innerHTML = `
    <main data-sk-gallery>
      <figure class="sk-item">
        <button type="button" class="sk-item__btn">
          <img src="/thumbs/one.jpg" data-full="/images/one-full.png" alt="one sketch" />
        </button>
      </figure>
    </main>
    <div data-sk-lb></div>`;
  const button = document.querySelector<HTMLButtonElement>(".sk-item__btn")!;
  const image = button.querySelector<HTMLImageElement>("img")!;
  const lightbox = document.querySelector<HTMLElement>("[data-sk-lb]")!;
  const onClick = vi.fn(() => lightbox.setAttribute("open", ""));
  button.addEventListener("click", onClick);
  vi.spyOn(image, "getBoundingClientRect").mockReturnValue(rect(40, 80, 280, 190));
  return { button, image, lightbox, onClick };
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

  it("روی تصویرِ لایت‌باکس، نقطهٔ زیرِ اشاره‌گر را ملایم بزرگ می‌کند و با رهاکردن محو می‌شود", () => {
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

  it("در خودِ گالری هم نگه‌داشتنِ تصویر بزرگ‌نمایی می‌کند، اما تپِ کوتاه همچنان لایت‌باکس را باز می‌کند", () => {
    const { button, image, lightbox, onClick } = makeGallery();
    const remove = installSketchHoldMagnifier(document);
    const lens = document.querySelector<HTMLElement>("[data-sk-hold-magnifier]")!;

    // تپِ کوتاه رفتارِ قبلیِ کارت را حفظ می‌کند.
    fireEvent.pointerDown(image, { pointerId: 10, pointerType: "touch", button: 0, clientX: 120, clientY: 140 });
    vi.advanceTimersByTime(80);
    fireEvent.pointerUp(image, { pointerId: 10, pointerType: "touch" });
    fireEvent.click(button);
    expect(onClick).toHaveBeenCalledTimes(1);
    expect(lightbox.hasAttribute("open")).toBe(true);
    lightbox.removeAttribute("open");

    // نگه‌داشتن از خودِ تصویر ذره‌بین می‌آورد و کلیکِ ساختگیِ پس از رهاکردن را نمی‌فرستد.
    fireEvent.pointerDown(button, { pointerId: 11, pointerType: "touch", button: 0, clientX: 150, clientY: 170 });
    vi.advanceTimersByTime(140);
    expect(lens.style.display).toBe("block");
    expect(lens.style.backgroundImage).toContain("one-full.png");
    fireEvent.pointerMove(document, { pointerId: 11, pointerType: "touch", clientX: 175, clientY: 180 });
    fireEvent.pointerUp(document, { pointerId: 11, pointerType: "touch" });
    fireEvent.click(button);
    expect(onClick).toHaveBeenCalledTimes(1);
    expect(lightbox.hasAttribute("open")).toBe(false);
    expect(lens.style.opacity).toBe("0");
    remove();
  });

  it("حرکتِ زودهنگام برای اسکرولِ صفحه، ذره‌بین را فعال نمی‌کند", () => {
    const { image } = makeViewer();
    const remove = installSketchHoldMagnifier(document);
    fireEvent.pointerDown(image, {
      pointerId: 3, pointerType: "touch", button: 0, clientX: 180, clientY: 160,
    });
    fireEvent.pointerMove(document, {
      pointerId: 3, pointerType: "touch", clientX: 205, clientY: 160,
    });
    vi.advanceTimersByTime(200);
    expect(document.querySelector("[data-sk-hold-magnifier]")?.getAttribute("style")).toContain("display: none");
    remove();
  });

  it("برای تصویرِ بیرون از لایت‌باکس یا لایت‌باکسِ بسته ذره‌بین نشان نمی‌دهد", () => {
    const { lightbox, image } = makeViewer();
    const outsideImage = document.createElement("img");
    outsideImage.setAttribute("data-sk-img", "");
    document.body.appendChild(outsideImage);
    const remove = installSketchHoldMagnifier(document);

    fireEvent.pointerDown(outsideImage, { pointerId: 1, pointerType: "mouse", button: 0, clientX: 150, clientY: 150 });
    lightbox.removeAttribute("open");
    fireEvent.pointerDown(image, { pointerId: 2, pointerType: "mouse", button: 0, clientX: 150, clientY: 150 });
    vi.advanceTimersByTime(200);
    expect(document.querySelector("[data-sk-hold-magnifier]")?.getAttribute("style")).toContain("display: none");
    remove();
  });

  it("صفحه‌ای که قراردادِ اسکچ‌نوت ندارد را دست نمی‌زند", () => {
    document.body.innerHTML = "<main>custom content</main>";
    const remove = installSketchHoldMagnifier(document);
    expect(document.querySelector("[data-sk-hold-magnifier]")).toBeNull();
    remove();
  });
});
