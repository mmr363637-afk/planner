import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { AMBIENT_BUFFER_KINDS } from "../ambient";
import { AMBIENT_IDS } from "../ambientMeta";
import type { AmbientSoundId } from "../../types";

// ===== 🐛→✅ نگهبانِ «صدای بی‌صدا» =====
//
// ریشه‌ی باگِ گزارش‌شده («میکسر صدا کار نمی‌کند / بعضی صداها هیچ صدایی ندارند»):
// `buffersFor` دستی نگه‌داری می‌شد و با کدِ واقعیِ سازنده‌ها هم‌خوان نبود؛ صداهایی مثل
// شومینه/پنکه/هواپیما/فضا بافرِ «قهوه‌ای» می‌خواستند که ساخته نمی‌شد ⇒ `loop()` روی
// بافر undefined خطا می‌داد ⇒ `start()` بی‌صدا false می‌شد.
//
// این تست، سورس را پارس می‌کند و برای هر صدا همه‌ی بافرهایی را که کدِ سازندهٔ همان
// صدا (و توابع کمکیِ آن) واقعاً لمس می‌کند جمع می‌کند و با نگاشتِ AMBIENT_BUFFER_KINDS
// مقابله می‌کند. اگر فردا کسی در یک سازنده `this.buffers.brown` اضافه کند و نگاشت را
// به‌روز نکند، همین تست قرمز می‌شود — نه گوشِ کاربر.

const SRC = readFileSync(resolve(process.cwd(), "src/lib/ambient.ts"), "utf8");

/** بدنهٔ متدها را با شمارش آکولاد بیرون می‌کشد (کافی برای سورسِ تایپ‌اسکریپتی) */
function methodBodies(): Map<string, string> {
  const lines = SRC.split("\n");
  const out = new Map<string, string>();
  const re = /^\s*(?:private |public |async )*([A-Za-z_$][\w$]*)\s*\([^)]*\)\s*(?::[^{]*)?\{\s*$/;
  let i = 0;
  while (i < lines.length) {
    const m = re.exec(lines[i]);
    if (!m) {
      i++;
      continue;
    }
    let depth = lines[i].split("{").length - lines[i].split("}").length;
    const body = [lines[i]];
    let j = i + 1;
    while (j < lines.length && depth > 0) {
      depth += lines[j].split("{").length - lines[j].split("}").length;
      body.push(lines[j]);
      j++;
    }
    out.set(m[1], body.join("\n"));
    i = j;
  }
  return out;
}

function calledMethods(body: string): string[] {
  return [...body.matchAll(/this\.([A-Za-z_$][\w$]*)\(/g)].map((m) => m[1]);
}

function bufferKinds(body: string): string[] {
  return [...new Set([...body.matchAll(/this\.buffers\.(white|pink|brown)/g)].map((m) => m[1]))];
}

const BODIES = methodBodies();

/** قطعهٔ سورسِ هر صدا در createBus (تا case بعدی) */
function createBusCase(id: AmbientSoundId): string {
  const start = SRC.indexOf(`case "${id}":`);
  expect(start, `case "${id}" در createBus پیدا نشد`).toBeGreaterThan(-1);
  const rest = SRC.slice(start + 8);
  const nextIdx = rest.search(/\n\s*(?:case "|default:)/);
  return SRC.slice(start, nextIdx > 0 ? start + 8 + nextIdx : undefined);
}

/** هر صدا + سازنده‌ها/کمکی‌هایش (به‌صورت بازگشتی) */
function requiredKinds(id: AmbientSoundId): Set<string> {
  const kinds = new Set<string>(bufferKinds(createBusCase(id)));
  const queue = calledMethods(createBusCase(id));
  const seen = new Set<string>();
  while (queue.length > 0) {
    const name = queue.pop()!;
    if (seen.has(name)) continue;
    seen.add(name);
    const body = BODIES.get(name);
    if (!body) continue;
    bufferKinds(body).forEach((k) => kinds.add(k));
    calledMethods(body).forEach((c) => queue.push(c));
  }
  return kinds;
}

describe("بافرهای موردنیاز هر صدا، با کدِ واقعی هم‌خوان‌اند", () => {
  it("برای همهٔ صداهای میکسر نگاشت وجود دارد (بدون صداِ بی‌تعریف)", () => {
    for (const id of AMBIENT_IDS) {
      expect(AMBIENT_BUFFER_KINDS[id], `نگاشتِ ${id}`).toBeDefined();
    }
  });

  it("هر بافری که کد لمس می‌کند در نگاشت هست (باگِ «صدا هیچ صدایی ندارد»)", () => {
    const problems: string[] = [];
    for (const id of AMBIENT_IDS) {
      const mapped = new Set<string>(AMBIENT_BUFFER_KINDS[id] ?? []);
      for (const kind of requiredKinds(id)) {
        if (!mapped.has(kind)) problems.push(`${id} از بافرِ «${kind}» استفاده می‌کند ولی ساخته نمی‌شود`);
      }
    }
    expect(problems).toEqual([]);
  });

  it("صداهایی که بافر لازم ندارند، واقعاً هیچ‌جا بافر نمی‌خوانند", () => {
    for (const id of AMBIENT_IDS) {
      if ((AMBIENT_BUFFER_KINDS[id] ?? []).length > 0) continue;
      expect([...requiredKinds(id)], `${id} بی‌دلیل بافر می‌خواهد`).toEqual([]);
    }
  });

  it("صداهای رویدادیِ خالی (بادچیم/کاسه/پرنده/…) تایمرِ رویدادِ خودشان را دارند", () => {
    // هر صدای رویدادی باید یک scheduleX داشته باشد؛ وگرنه در UI هست ولی هیچ‌وقت صدا نمی‌دهد
    const wired = new Set(calledMethods(BODIES.get("scheduleEvents") ?? ""));
    for (const [id, scheduler] of [
      ["chimes", "scheduleChimes"],
      ["singingBowl", "scheduleBowl"],
      ["birds", "scheduleBirds"],
      ["crickets", "scheduleCrickets"],
      ["frogs", "scheduleFrogs"],
      ["clock", "scheduleClock"],
    ] as const) {
      expect(wired.has(scheduler), `${id} → ${scheduler} در scheduleEvents وصل نشده`).toBe(true);
      expect(BODIES.has(scheduler), `${scheduler} وجود ندارد`).toBe(true);
    }
  });

  it("همهٔ صداهای رویدادی در clearAllEventTimers هم پاک می‌شوند", () => {
    const cleared = new Set(calledMethods(BODIES.get("clearAllEventTimers") ?? ""));
    for (const clear of ["clearChimeTimer", "clearBowlTimer", "clearBirdTimer", "clearClockTimer"]) {
      expect(cleared.has(clear), `${clear} در clearAllEventTimers نیست`).toBe(true);
    }
  });
});
