import { describe, expect, it } from "vitest";
import { DEFAULT_LOCATION, altAz, localSiderealDeg, moonPhase, visibleStars } from "../stars";
import { buildSkillMap, statusColor } from "../skillMap";
import { computeWrapped, wrappedAvailable } from "../wrapped";
import type { Topic } from "../../types";

describe("astronomy (آسمان واقعی)", () => {
  const { lat, lon } = DEFAULT_LOCATION;
  const now = new Date("2026-03-20T21:00:00+03:30").getTime();

  it("ستاره‌ی قطبی تقریباً در شمال و بالای افق است (تهران)", () => {
    // Polaris: ra 2.53h, dec 89.264 → alt ≈ lat (±۱°)، az ≈ شمال
    const p = altAz(2.53, 89.264, now, lat, lon);
    expect(p.alt).toBeGreaterThan(34.5);
    expect(p.alt).toBeLessThan(37);
    const azErr = Math.min(p.az, 360 - p.az);
    expect(azErr).toBeLessThan(2.5);
    // فرازِ قطبی در هر زاویه‌ی ساعتی تقریباً ثابت می‌ماند
    for (const dt of [6, 12, 18]) {
      const q = altAz(2.53, 89.264, now + dt * 3600e3, lat, lon);
      expect(Math.abs(q.alt - p.alt)).toBeLessThan(1.2);
    }
  });

  it("ستاره‌ای دقیقاً راستای قطب جنوبیِ زمین، جنوبِ افق را نشان می‌دهد", () => {
    // خیالی: dec = -90 → در هر مکانی alt = -lat (زیر افق در نیمکره شمالی) — آزمون پایداری
    const s = altAz(0, -90, now, lat, lon);
    expect(s.alt).toBeLessThan(0);
  });

  it("ستاره‌ای روی خط استوا در عبور، بالا و تقریباً جنوب/شمال است", () => {
    // ستاره‌ای با ra برابر زمان نجومی را می‌سازیم تا در عبور (H=0) باشد
    const lst = localSiderealDeg(now, lon);
    const p = altAz(lst / 15, 0, now, lat, lon);
    expect(p.alt).toBeCloseTo(90 - lat, 0);
    // در تهران باید جنوب باشد
    expect(Math.abs(p.az - 180)).toBeLessThan(2);
  });

  it("localSiderealDeg در بازه‌ی ۰..۳۶۰ است", () => {
    for (const t of [now, now + 6 * 3600e3, now - 30 * 86400e3]) {
      const g = localSiderealDeg(t, lon);
      expect(g).toBeGreaterThanOrEqual(0);
      expect(g).toBeLessThan(360);
    }
  });

  it("visibleStars فقط بالای افق را برمی‌گرداند و اندازه دارد", () => {
    const stars = visibleStars(now, lat, lon);
    expect(stars.length).toBeGreaterThan(5);
    for (const s of stars) {
      expect(s.alt).toBeGreaterThan(0);
      expect(s.size).toBeGreaterThan(0.5);
      expect(s.az).toBeGreaterThanOrEqual(0);
      expect(s.az).toBeLessThan(360);
    }
  });

  it("moonPhase در بازه‌ی معتبر است و چرخه می‌چرخد", () => {
    const a = moonPhase(now);
    const b = moonPhase(now + 29.6 * 86400e3);
    expect(a.phase).toBeGreaterThanOrEqual(0);
    expect(a.phase).toBeLessThan(1);
    expect(b.phase).toBeGreaterThanOrEqual(0);
    expect(b.phase).toBeLessThan(1);
    // بعد از یک ماه قمری تقریباً همان فاز برمی‌گردد
    expect(Math.abs(a.phase - b.phase)).toBeLessThan(0.05);
  });
});

describe("skillMap", () => {
  const mk = (id: string, status: Topic["status"], parentId?: string, createdAt = 1): Topic => ({
    id, subjectId: "s1", name: `مبحث ${id}`, volume: 10, estimatedMinutes: 30, priority: "medium", difficulty: 2, status, createdAt, parentId,
  });
  const topics = [
    mk("t1", "mastered", undefined, 1),
    mk("t2", "learning", undefined, 2),
    mk("t3", "not_started", "t2", 3),
    mk("t4", "mastered", "t2", 4),
  ];

  it("گره مرکزی درس + همه‌ی مباحث + یال‌های درست", () => {
    const m = buildSkillMap({ id: "s1", name: "قلب", color: "#f00" }, topics, 600, 400);
    expect(m.nodes).toHaveLength(1 + topics.length);
    expect(m.edges).toHaveLength(topics.length);
    const center = m.nodes.find((n) => n.kind === "subject")!;
    expect(center.x).toBe(300);
    expect(center.y).toBe(200);
    // یال‌ها به درس یا مبحثِ والد وصل می‌شوند
    expect(m.edges.find((e) => e.to === "t1")!.from).toBe("s1");
    expect(m.edges.find((e) => e.to === "t3")!.from).toBe("t2");
  });

  it("رنگ وضعیت‌ها", () => {
    expect(statusColor("mastered")).toBe("#eab308");
    expect(statusColor("not_started")).toBe("#94a3b8");
    const m = buildSkillMap({ id: "s1", name: "قلب", color: "#f00" }, topics, 600, 400);
    expect(m.nodes.find((n) => n.id === "t1")!.color).toBe("#eab308");
  });

  it("برای درس بدون مبحث فقط گره مرکزی", () => {
    const m = buildSkillMap({ id: "s1", name: "قلب", color: "#f00" }, [], 600, 400);
    expect(m.nodes).toHaveLength(1);
    expect(m.edges).toHaveLength(0);
  });
});

describe("wrapped", () => {
  const today = "2026-09-10";
  it("خلاصه‌ی سال بهترین روز و زنجیره را می‌دهد", () => {
    const mk = (date: string, minutes: number) => ({
      id: date, topicId: "t1" as string | null, startedAt: new Date(`${date}T09:00:00`).getTime(),
      endedAt: new Date(`${date}T09:00:00`).getTime() + minutes * 60000, durationMinutes: minutes,
      rating: null, mode: "free" as const, date,
    });
    const sessions = [
      mk("2026-03-25", 30), mk("2026-03-26", 60), mk("2026-03-27", 90),
      mk("2026-03-29", 200), // بهترین روز
    ];
    const w = computeWrapped(sessions, [], today);
    expect(w.jalaliYear).toBe(1405);
    expect(w.totalMinutes).toBe(380);
    expect(w.bestDay?.date).toBe("2026-03-29");
    expect(w.longestStreak).toBe(3);
    expect(wrappedAvailable(sessions, today)).toBe(false); // فقط ۴ روز فعال
    const more = [...sessions, mk("2026-04-01", 10), mk("2026-04-02", 10)];
    expect(wrappedAvailable(more, today)).toBe(true);
  });
});
