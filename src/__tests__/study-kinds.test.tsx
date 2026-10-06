// @vitest-environment jsdom
import { useState } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { KindPicker } from "../components/shared";
import { collapseStudyKinds, normalizeStudyKinds, studyKindTaskKinds } from "../types";

function Harness() {
  const [kinds, setKinds] = useState<import("../types").StudyKind[]>([]);
  return (
    <>
      <KindPicker value={kinds} onChange={setKinds} />
      <output data-testid="value">{JSON.stringify(kinds)}</output>
    </>
  );
}

const value = () => JSON.parse(screen.getByTestId("value").textContent || "[]") as string[];

afterEach(cleanup);

describe("انتخاب «چه شکلی خواندی؟» — چند انتخابی", () => {
  it("می‌شود درسنامه و تست را با هم انتخاب کرد (کتاب‌های درسنامه‌وتستِ یک‌پارچه)", () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole("checkbox", { name: /آموزشی/ }));
    fireEvent.click(screen.getByRole("checkbox", { name: /🧪 تست/ }));
    expect(value()).toEqual(["learn", "test"]);
    // کلیک دوباره، هم‌ان انتخاب را برمی‌دارد
    fireEvent.click(screen.getByRole("checkbox", { name: /🧪 تست/ }));
    expect(value()).toEqual(["learn"]);
  });

  it("«ترکیبی» جای بقیه را می‌گیرد و با بقیه جمع نمی‌شود", () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole("checkbox", { name: /ترکیبی/ }));
    expect(value()).toEqual(["mixed"]);
    // انتخاب «ترکیبی» یعنی هر دو کار؛ پس انتخاب‌های تک‌نوعی را کنار می‌زند
    fireEvent.click(screen.getByRole("checkbox", { name: /ترکیبی/ }));
    fireEvent.click(screen.getByRole("checkbox", { name: /آموزشی/ }));
    expect(value()).toEqual(["learn"]);
    fireEvent.click(screen.getByRole("checkbox", { name: /ترکیبی/ }));
    expect(value()).toEqual(["mixed"]);
    fireEvent.click(screen.getByRole("checkbox", { name: /ترکیبی/ }));
    expect(value()).toEqual([]);
  });
});

describe("نرمال‌سازی نوع‌های جلسه", () => {
  it("تک‌نوع قدیمی و چندنوع تازه را یکدست می‌کند", () => {
    expect(normalizeStudyKinds("test")).toEqual(["test"]);
    expect(normalizeStudyKinds(["learn", "test"])).toEqual(["learn", "test"]);
    expect(normalizeStudyKinds(undefined)).toEqual([]);
  });

  it("«ترکیبی» هیچ‌وقت با نوع دیگر ترکیب نمی‌شود", () => {
    expect(normalizeStudyKinds(["learn", "mixed"])).toEqual(["mixed"]);
    expect(normalizeStudyKinds(["mixed", "review"])).toEqual(["mixed"]);
  });

  it("«ترکیبی» به تسک‌های یادگیری و تست ترجمه می‌شود", () => {
    expect(studyKindTaskKinds(["mixed"]).sort()).toEqual(["learn", "test"]);
    expect(studyKindTaskKinds(["learn", "summary"]).sort()).toEqual(["learn", "summary"]);
    expect(studyKindTaskKinds(undefined, "review")).toEqual(["review"]);
    expect(studyKindTaskKinds([])).toEqual([]);
  });

  it("برچسبِ ذخیره‌شده: تک‌نوع همان، چندنوع «ترکیبی»", () => {
    expect(collapseStudyKinds(["learn"])).toBe("learn");
    expect(collapseStudyKinds(["learn", "test"])).toBe("mixed");
    expect(collapseStudyKinds([])).toBeUndefined();
    expect(collapseStudyKinds(undefined)).toBeUndefined();
  });
});
