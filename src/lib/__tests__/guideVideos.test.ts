import { describe, expect, it } from "vitest";
import { existsSync, readdirSync, statSync } from "node:fs";
import {
  GUIDE_TOPICS,
  GUIDE_VIDEOS,
  formatVideoTime,
  guideTotals,
  guideVideoUrl,
  searchGuideVideos,
} from "../guideVideos";
import { scoreQuery } from "../textSearch";
import { MORE_MENU_LAYOUT, MORE_MENU_IDS, flattenMenu, menuItemCount } from "../../components/MoreMenu";

/**
 * 🎬 راهنمای ویدیویی — نگهبانِ دو چیز:
 *  ۱) فایلِ هر قسمت واقعاً در `public/guide/` باشد (وگرنه دکمهٔ پخش به بن‌بست می‌خورد)
 *  ۲) هیچ‌جا «پیش‌دانلودِ همهٔ قسمت‌ها» به‌وجود نیاید — همان چیزی که گوشی را کند می‌کرد
 * منوی ☰ هم همین‌جا قفل می‌شود: هر آیتم باید یک شناسهٔ یکتا و لینکِ قابلِ اجرا داشته باشد.
 */
describe("🎬 فهرستِ ویدیوهای راهنما", () => {
  it("هر ده قسمت با شناسه و ترتیبِ یکتا و فایلِ واقعی موجود است", () => {
    expect(GUIDE_VIDEOS).toHaveLength(10);
    expect(new Set(GUIDE_VIDEOS.map((v) => v.id)).size).toBe(10);
    expect(GUIDE_VIDEOS.map((v) => v.episode)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    const files = readdirSync("public/guide").filter((f) => f.endsWith(".mp4"));
    for (const video of GUIDE_VIDEOS) {
      expect(files).toContain(video.src.replace("guide/", ""));
      const path = `public/${video.src}`;
      expect(existsSync(path)).toBe(true);
      // اندازهٔ تقریبی هم باید با فایلِ واقعی جور باشد (کاربر قبل از پخش می‌بیند)
      const mb = statSync(path).size / 1024 / 1024;
      expect(Math.abs(mb - video.mb)).toBeLessThan(0.4);
    }
  });

  it("عنوان و خلاصهٔ همهٔ قسمت‌ها پر است", () => {
    for (const v of GUIDE_VIDEOS) {
      expect(v.title.length).toBeGreaterThan(5);
      expect(v.summary.length).toBeGreaterThan(10);
      expect(v.seconds).toBeGreaterThan(10);
      expect(GUIDE_TOPICS).toContain(v.topic);
      expect(v.keywords.length).toBeGreaterThan(0);
    }
  });

  it("مسیرِ نسبی می‌ماند (سازگار با base './' روی GitHub Pages)", () => {
    expect(guideVideoUrl(GUIDE_VIDEOS[0])).toBe("guide/ep01.mp4");
    expect(guideVideoUrl(GUIDE_VIDEOS[0], "/planner/")).toBe("/planner/guide/ep01.mp4");
    expect(guideVideoUrl(GUIDE_VIDEOS[0], "./")).toBe("guide/ep01.mp4");
  });

  it("زمان/حجم را درست جمع و قالب‌بندی می‌کند", () => {
    expect(formatVideoTime(0)).toBe("0:00");
    expect(formatVideoTime(96)).toBe("1:36");
    expect(formatVideoTime(65)).toBe("1:05");
    const totals = guideTotals();
    expect(totals.seconds).toBe(GUIDE_VIDEOS.reduce((s, v) => s + v.seconds, 0));
    expect(totals.mb).toBeGreaterThan(10);
  });

  it("جست‌وجو با عنوان، موضوع، برچسب و غلطِ تایپی پیدا می‌کند", () => {
    const byTitle = searchGuideVideos(GUIDE_VIDEOS, "فلش‌کارت", "all", scoreQuery);
    expect(byTitle[0]?.id).toBe("run-ep05");
    // نیم‌فاصله/ی عربی نباید مانع شود
    expect(searchGuideVideos(GUIDE_VIDEOS, "پومودورو", "all", scoreQuery).length).toBeGreaterThan(0);
    expect(searchGuideVideos(GUIDE_VIDEOS, "بکاپ", "all", scoreQuery)[0]?.id).toBe("run-ep09");
    // فیلترِ موضوع، فهرست را محدود می‌کند
    const content = searchGuideVideos(GUIDE_VIDEOS, "", "محتوا", scoreQuery);
    expect(content.map((v) => v.id)).toEqual(["run-ep07", "run-ep08"]);
    // عبارتِ بی‌ربط هیچ نتیجه‌ای نمی‌دهد
    expect(searchGuideVideos(GUIDE_VIDEOS, "zzzzz", "all", scoreQuery)).toEqual([]);
  });
});

describe("☰ منوی همهٔ امکانات", () => {
  it("چهار دستهٔ نام‌دار دارد و همهٔ آیتم‌ها شناسهٔ یکتا", () => {
    expect(MORE_MENU_LAYOUT).toHaveLength(4);
    expect(MORE_MENU_LAYOUT.map((s) => s.title)).toEqual([
      "📚 محتوا و مطالعه",
      "🛠 ابزارها",
      "🏆 پیشرفت",
      "❓ راهنما و برنامه",
    ]);
    const items = flattenMenu();
    const ids = items.map((i) => i.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toEqual(MORE_MENU_IDS);
    expect(items.length).toBe(menuItemCount());
    expect(ids.length).toBeGreaterThanOrEqual(18);
  });

  it("امکاناتِ «گوشه‌افتاده» در منو هستند", () => {
    for (const id of ["library", "exambank", "qbank", "audiostudio", "guide", "sources", "skills", "cram"]) {
      expect(MORE_MENU_IDS).toContain(id);
    }
  });
});
