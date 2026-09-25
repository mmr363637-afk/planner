import { describe, expect, it } from "vitest";
import { channelName, mergeMember, normalizeRoomCode, parseRoomMessage, pruneMembers, randomRoomCode, type RoomMember, type RoomTick } from "../groupRoom";

describe("اتاق مطالعه‌ی گروهی (لایه‌ی پیام)", () => {
  it("کد اتاق نرمال‌سازی می‌شود؛ کدهای خیلی کوتاه رد می‌شوند", () => {
    expect(normalizeRoomCode("  ab12 ")).toBe("AB12");
    expect(normalizeRoomCode("abc")).toBeNull();
    expect(normalizeRoomCode("a b-1_2!@#")).toBe("AB12");
    expect(channelName("ab12")).toBe("study-room:AB12");
  });

  it("کد تصادفی خوانا (بدون کاراکترهای مبهم) و یکتا", () => {
    const a = randomRoomCode();
    const b = randomRoomCode();
    expect(a).toMatch(/^[A-Z2-9]{6}$/);
    expect(a).not.toBe(b);
  });

  it("پیام tick معتبر پذیرفته و پیام خراب رد می‌شود", () => {
    const ok = parseRoomMessage({ type: "tick", name: "علی", running: true, elapsedMinutes: 12.4, topicName: "قلب", at: 5 });
    expect(ok?.type).toBe("tick");
    expect((ok as RoomTick).elapsedMinutes).toBe(12.4);

    expect(parseRoomMessage(null)).toBeNull();
    expect(parseRoomMessage({ type: "tick", name: "", running: true, elapsedMinutes: 1 })).toBeNull();
    expect(parseRoomMessage({ type: "tick", name: "x", running: "yes", elapsedMinutes: 1 })).toBeNull();
    expect(parseRoomMessage({ type: "hack", name: "x" })).toBeNull();
    // عدد دیوانه به بازه‌ی امن محدود می‌شود
    const capped = parseRoomMessage({ type: "tick", name: "x", running: false, elapsedMinutes: 99999, topicName: null, at: 1 });
    expect((capped as RoomTick).elapsedMinutes).toBe(24 * 60);
  });

  it("cheer فقط ایموجی‌های مجاز را رد می‌کند", () => {
    const c = parseRoomMessage({ type: "cheer", name: "سارا", emoji: "🍅", at: 1 });
    expect(c?.type).toBe("cheer");
    const bad = parseRoomMessage({ type: "cheer", name: "سارا", emoji: "<script>", at: 1 });
    expect(bad?.type).toBe("cheer");
    expect((bad as { emoji: string }).emoji).toBe("🔥"); // ایموجی غیرمجاز به پیش‌فرض برمی‌گردد
  });

  it("ادغام اعضا: تازه‌ترین tick هر عضو برنده است و ساکت‌ها حذف می‌شوند", () => {
    const t = (name: string, minutes: number, at: number): RoomTick => ({ type: "tick", name, running: true, elapsedMinutes: minutes, topicName: null, at });
    let list: RoomMember[] = [];
    list = mergeMember(list, t("علی", 5, 100), 100);
    list = mergeMember(list, t("سارا", 7, 101), 101);
    list = mergeMember(list, t("علی", 6, 200), 200);
    expect(list.length).toBe(2);
    expect(list.find((m) => m.name === "علی")!.elapsedMinutes).toBe(6);

    const pruned = pruneMembers(list, 101 + 90_001);
    expect(pruned.map((m) => m.name)).toEqual(["علی"]); // سارا ۹۰ ثانیه ساکت بود
  });
});
