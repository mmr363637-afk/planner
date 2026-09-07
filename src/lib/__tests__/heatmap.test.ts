import { describe, expect, it } from "vitest";
import { heatLevel, heatmapData } from "../stats";
import type { StudySession } from "../../types";

function sess(date: string, minutes = 45): StudySession {
  return { id: `s-${date}`, topicId: null, startedAt: 1, endedAt: 2, durationMinutes: minutes, rating: null, mode: "free", date };
}

describe("heatmapData", () => {
  it("اولین سلول شنبه است و ستون‌ها کامل هفته‌اند", () => {
    const { cells } = heatmapData([sess("2026-01-05", 40)], "2026-01-05"); // دوشنبه
    expect(cells[0].dow).toBe(6); // شنبه
    expect(cells.length % 7).toBe(0); // همه‌ی ستون‌ها هفته‌ی کامل
    expect(cells.some((c) => c.date === "2026-01-05" && c.minutes === 40)).toBe(true);
    // روزهای بعد از امروز خالی‌اند (پدینگ انتهای هفته)
    expect(cells[cells.length - 1].minutes).toBe(0);
  });

  it("دقیقه‌ی هر روز جمع می‌شود", () => {
    const { cells } = heatmapData([sess("2026-01-05", 40), sess("2026-01-05", 20)], "2026-01-05");
    const day = cells.find((c) => c.date === "2026-01-05")!;
    expect(day.minutes).toBe(60);
  });

  it("برچسب ماه حداقل یکی دارد و درست است", () => {
    const { months } = heatmapData([], "2026-01-05");
    expect(months.length).toBeGreaterThan(0);
    expect(months[0].label.length).toBeGreaterThan(0);
  });
});

describe("heatLevel", () => {
  it("پنج سطح شدت", () => {
    expect(heatLevel(0)).toBe(0);
    expect(heatLevel(20)).toBe(1);
    expect(heatLevel(45)).toBe(2);
    expect(heatLevel(90)).toBe(3);
    expect(heatLevel(200)).toBe(4);
  });
});
