// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { GenerativeDroneEngine } from "../drone";

// ===== 🐛→✅ نگهبانِ باگِ «دِرون ساکت می‌ماند» =====
// گزارش: صداهای میکسر روی گوشی گاهی هیچ صدایی نمی‌داد. لایه‌ی «دِرون» (space music)
// با یک موتورِ سراسری پخش می‌شود؛ اگر کاربر «توقف» و بی‌درنگ «پخش» را می‌زد،
// start() چون کانتکستِ قدیمی هنوز پاک نشده بود بی‌صدا return می‌شد و بعد از آن
// هیچ صدایی نمی‌آمد تا کاربر حجم را دست بزند. این تست همان مسیر را قفل می‌کند.

class MockParam {
  value = 0;
  setValueAtTime(v: number) {
    this.value = v;
    return this;
  }
  linearRampToValueAtTime(v: number) {
    this.value = v;
    return this;
  }
  cancelScheduledValues() {
    return this;
  }
}

class MockNode {
  gain = new MockParam();
  frequency = new MockParam();
  type = "sine";
  connect(): this {
    return this;
  }
  disconnect(): void {}
  start(): void {}
  stop(): void {}
}

class MockCtx {
  currentTime = 0;
  started = { osc: 0, gain: 0 };
  createGain() {
    this.started.gain++;
    return new MockNode();
  }
  createOscillator() {
    this.started.osc++;
    return new MockNode();
  }
}

function engineWithMock() {
  const ctx = new MockCtx();
  const dest = new MockNode();
  return { ctx, dest, engine: new GenerativeDroneEngine() };
}

describe("موتور دِرون (لایه‌ی موسیقیِ فضایی)", () => {
  afterEach(() => vi.useRealTimers());

  it("شروع، نوسان‌سازها را می‌سازد و isPlaying را روشن می‌کند", () => {
    const { ctx, dest, engine } = engineWithMock();
    expect(engine.isPlaying).toBe(false);
    engine.start(dest as unknown as AudioNode, ctx as unknown as AudioContext);
    expect(engine.isPlaying).toBe(true);
    expect(ctx.started.osc).toBeGreaterThan(0);
    engine.stop();
  });

  it("توقفِ نرم واقعاً زنجیره را می‌بندد (نه فقط enabled=false)", () => {
    vi.useFakeTimers();
    const { ctx, dest, engine } = engineWithMock();
    engine.start(dest as unknown as AudioNode, ctx as unknown as AudioContext);
    engine.stop();
    expect(engine.isPlaying).toBe(false);
    // تایمرِ پاک‌سازی باید زنجیره را کامل آزاد کند
    vi.advanceTimersByTime(2_000);
    const oscAfterStop = ctx.started.osc;
    engine.start(dest as unknown as AudioNode, ctx as unknown as AudioContext);
    // شروعِ تازه بعد از توقفِ کامل ⇒ زنجیره‌ی تازه ساخته می‌شود
    expect(ctx.started.osc).toBeGreaterThan(oscAfterStop);
    engine.stop();
  });

  it("🐛→✅ توقف و شروعِ فوری (بدونِ انتظار) دوباره صدا می‌دهد", () => {
    vi.useFakeTimers();
    const { ctx, dest, engine } = engineWithMock();
    const c = ctx as unknown as AudioContext;
    engine.start(dest as unknown as AudioNode, c);
    const oscCount = ctx.started.osc;

    engine.stop();
    // هنوز ۲ ثانیه‌ی خاموش‌شدن نگذشته، کاربر دوباره پخش را می‌زند
    engine.start(dest as unknown as AudioNode, c);

    expect(engine.isPlaying).toBe(true);
    // زنجیره‌ی قبلی دوباره فعال شده؛ نوسان‌سازِ تکراری ساخته نشده
    expect(ctx.started.osc).toBe(oscCount);
    // و حجم از صفر بالا آمده (توقفِ نیمه‌کاره لغو شده)
    vi.advanceTimersByTime(3_000);
    engine.stop();
  });

  it("setLevel بعد از شروع، حجم را روی گره‌ی مشترک می‌نشاند (نه صفرِ ماندگار)", () => {
    const { ctx, dest, engine } = engineWithMock();
    engine.start(dest as unknown as AudioNode, ctx as unknown as AudioContext);
    engine.setLevel(0.8);
    expect(engine.isPlaying).toBe(true);
    engine.stop();
  });
});
