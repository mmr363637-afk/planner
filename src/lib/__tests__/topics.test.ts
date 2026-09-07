import { describe, expect, it } from "vitest";
import { aggregateStatus, ancestorsOf, depthOf, descendantsOf, isParentTopic, leafTopics, sortedForDisplay } from "../topics";
import type { Topic } from "../../types";

function t(id: string, parentId?: string, status: Topic["status"] = "learning"): Topic {
  return { id, subjectId: "s1", name: `مبحث ${id}`, volume: 10, estimatedMinutes: 60, priority: "medium", difficulty: 2, status, createdAt: 1, parentId };
}

const tree = [t("quan"), t("quan-kin", "quan"), t("quan-dyn", "quan", "mastered"), t("quan-kin-1", "quan-kin", "not_started")];

describe("درخت مباحث", () => {
  it("تشخیص والد و برگ", () => {
    expect(isParentTopic(tree[0], tree)).toBe(true);
    expect(isParentTopic(tree[2], tree)).toBe(false);
    expect(leafTopics(tree).map((x) => x.id).sort()).toEqual(["quan-dyn", "quan-kin-1"]);
  });

  it("نوادگان و اجداد", () => {
    expect(descendantsOf("quan", tree).map((x) => x.id)).toEqual(["quan-kin", "quan-dyn", "quan-kin-1"]);
    const kin = tree[1];
    expect(ancestorsOf(kin, tree).map((x) => x.id)).toEqual(["quan"]);
    expect(depthOf(tree[3], tree)).toBe(2);
  });

  it("وضعیت تجمعی از پایین به بالا", () => {
    expect(aggregateStatus(tree[0], tree)).toBe("learning"); // مخلوط
    const allMastered = [...tree.map((x) => ({ ...x })), t("extra", "quan-kin", "mastered")];
    // همه‌ی نسل‌های quan باید mastered شوند
    const fixed = allMastered.map((x) => (x.id.startsWith("quan") ? { ...x, status: "mastered" as const } : x));
    expect(aggregateStatus(fixed[0], fixed)).toBe("mastered");
    const allNot = tree.map((x) => ({ ...x, status: "not_started" as const }));
    expect(aggregateStatus(allNot[0], allNot)).toBe("not_started");
  });

  it("ترتیب نمایش: والد قبل از فرزند + شکستن یتیم‌ها", () => {
    const sorted = sortedForDisplay([tree[3], tree[1], tree[0], tree[2]]);
    expect(sorted.map((x) => x.id)).toEqual(["quan", "quan-kin", "quan-kin-1", "quan-dyn"]);
    const orphan = [...tree, t("lost", "ghost-parent")];
    const s2 = sortedForDisplay(orphan);
    expect(s2[s2.length - 1].id).toBe("lost");
  });
});
