// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { AMBIENT_IDS, AmbientEngine, BINAURAL_BASE_HZ, autoMixForHour, binauralBeatOf } from "../ambient";

class MockParam {
  value = 0;
  ramps: number[] = [];
  setValueAtTime() {
    return this;
  }
  setTargetAtTime() {
    return this;
  }
  linearRampToValueAtTime(v: number) {
    this.ramps.push(v);
    return this;
  }
  exponentialRampToValueAtTime() {
    return this;
  }
  cancelScheduledValues() {
    return this;
  }
}

class MockNode {
  connect(node: MockNode) {
    return node;
  }
  disconnect() {
    /* noop */
  }
}

class MockGain extends MockNode {
  gain = new MockParam();
}
class MockBiquad extends MockNode {
  type = "lowpass";
  frequency = new MockParam();
  gain = new MockParam();
  Q = new MockParam();
}
class MockStereoPanner extends MockNode {
  pan = new MockParam();
}
class MockDelay extends MockNode {
  delayTime = new MockParam();
}
class MockCompressor extends MockNode {
  threshold = new MockParam();
  knee = new MockParam();
  ratio = new MockParam();
  attack = new MockParam();
  release = new MockParam();
}
class MockWaveShaper extends MockNode {
  curve: unknown = null;
  oversample = "none";
}
class MockOscillator extends MockNode {
  type = "sine";
  frequency = new MockParam();
  detune = new MockParam();
  started = 0;
  start() {
    this.started++;
  }
  stop() {
    /* noop */
  }
}
class MockBufferSource extends MockNode {
  buffer: unknown = null;
  loop = false;
  loopStart = 0;
  loopEnd = 0;
  playbackRate = new MockParam();
  started = 0;
  start() {
    this.started++;
  }
  stop() {
    /* noop */
  }
}

class MockAudioContext {
  state: "running" | "suspended" = "suspended";
  currentTime = 0;
  sampleRate = 44100;
  destination = new MockNode();
  oscillators: MockOscillator[] = [];
  gains: MockGain[] = [];
  async resume() {
    this.state = "running";
  }
  async suspend() {
    this.state = "suspended";
  }
  createGain() {
    const n = new MockGain();
    this.gains.push(n);
    return n;
  }
  createBiquadFilter() {
    return new MockBiquad();
  }
  createOscillator() {
    const n = new MockOscillator();
    this.oscillators.push(n);
    return n;
  }
  createBufferSource() {
    return new MockBufferSource();
  }
  createStereoPanner() {
    return new MockStereoPanner();
  }
  createDelay() {
    return new MockDelay();
  }
  createDynamicsCompressor() {
    return new MockCompressor();
  }
  createWaveShaper() {
    return new MockWaveShaper();
  }
  createBuffer(channels: number, length: number, sampleRate: number): AudioBuffer {
    const data = Array.from({ length: channels }, () => new Float32Array(length));
    return {
      duration: length / sampleRate,
      sampleRate,
      length,
      numberOfChannels: channels,
      getChannelData: (ch: number) => data[ch],
    } as unknown as AudioBuffer;
  }
}

function freshEngine(): { engine: AmbientEngine; ctx: MockAudioContext } {
  const ctx = new MockAudioContext();
  const provider = window as unknown as { AudioContext?: unknown; webkitAudioContext?: unknown };
  provider.AudioContext = function (this: unknown) {
    return ctx;
  };
  const engine = new AmbientEngine();
  return { engine, ctx };
}

afterEach(() => {
  delete (window as unknown as { AudioContext?: unknown }).AudioContext;
});

describe("میکس خودکارِ ساعت روز", () => {
  it("برای هر فصلِ روز یک ترکیبِ معنادار برمی‌گرداند", () => {
    const morning = autoMixForHour(6);
    expect(morning.birds).toBeGreaterThan(0);
    expect(morning.rain).toBeGreaterThan(0);

    const midday = autoMixForHour(10);
    expect(midday.cafe).toBeGreaterThan(0);

    const afternoon = autoMixForHour(15);
    expect(afternoon.cafe).toBeGreaterThan(0);
    expect(afternoon.fan).toBeGreaterThan(0);

    const evening = autoMixForHour(18);
    expect(evening.ocean).toBeGreaterThan(0);
    expect(evening.forest).toBeGreaterThan(0);

    const night = autoMixForHour(21);
    expect(night.crickets).toBeGreaterThan(0);
    expect(night.fireplace).toBeGreaterThan(0);

    const midnight = autoMixForHour(2);
    expect(midnight.brown).toBeGreaterThan(0);
  });

  it("همه‌ی کلیدها همیشه پرند و ورودیِ دوربرگردان هم درست می‌شود", () => {
    for (const h of [-30, -1, 0, 5, 8, 9, 12, 13, 16, 17, 19, 20, 23, 24, 47]) {
      const mix = autoMixForHour(h);
      for (const id of AMBIENT_IDS) {
        expect(mix[id]).toBeGreaterThanOrEqual(0);
        expect(mix[id]).toBeLessThanOrEqual(1);
      }
    }
    // شدتِ اصلیِ هر فصل واقعاً روشن است (میکس خالی برندارد)
    for (const h of [0, 6, 10, 14, 18, 22]) {
      expect(Object.values(autoMixForHour(h)).some((v) => v > 0)).toBe(true);
    }
  });
});

describe("ضربان دوگوشی در موتور", () => {
  it("وقتی لایه‌ی بینارال روشن است گوشِ راست با اختلافِ باند فرکانس می‌گیرد", async () => {
    const { engine, ctx } = freshEngine();
    await engine.start({ binaural: 0.6 }, 0.8);
    expect(engine.playing).toBe(true);

    const left = ctx.oscillators.find((o) => o.frequency.value === BINAURAL_BASE_HZ && o.started === 1);
    const rightA = ctx.oscillators.find((o) => o.frequency.value === BINAURAL_BASE_HZ + 10 && o.started === 1);
    expect(left).toBeDefined();
    expect(rightA).toBeDefined(); // آلفای پیش‌فرض: ۱۰ هرتز

    // تعویضِ زنده‌ی باند → همان اسیلاتور زیر تغییر می‌دهد نه گراف تازه
    const oscCountBefore = ctx.oscillators.length;
    engine.setBinauralBand("beta");
    expect(rightA!.frequency.ramps).toContain(BINAURAL_BASE_HZ + binauralBeatOf("beta"));
    engine.setBinauralBand("delta");
    expect(rightA!.frequency.ramps).toContain(BINAURAL_BASE_HZ + binauralBeatOf("delta"));
    expect(ctx.oscillators.length).toBe(oscCountBefore);
    expect(binauralBeatOf("theta")).toBe(6);

    engine.stop();
  });
});

describe("واکنشِ صدا به فاز پومودورو", () => {
  it("در استراحت صدا نرم می‌شود و در کار به حالت عادی برمی‌گردد؛ فقط وقتی فعال باشد", async () => {
    const { engine } = freshEngine();
    await engine.start({ rain: 0.5 }, 0.8);
    expect(engine.duckLevel).toBe(1);

    engine.setFocusPhase("break", true);
    expect(engine.duckLevel).toBeCloseTo(0.45);
    engine.setFocusPhase("work", true);
    expect(engine.duckLevel).toBe(1);

    // خاموش بودنِ گزینه یعنی هیچ واکنشی به فاز نیست
    engine.setFocusPhase("break", false);
    expect(engine.duckLevel).toBe(1);
    // چند باره ست‌کردنِ همان حالت تکرارِ بی‌معنی نمی‌سازد
    engine.setFocusPhase("work", true);
    engine.setFocusPhase("work", true);
    expect(engine.duckLevel).toBe(1);

    engine.stop();
  });
});
