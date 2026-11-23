// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { act, cleanup, render } from "@testing-library/react";
import { StoreProvider, useStore, type StoreApi } from "../store";
import { STORAGE_KEY } from "../lib/persist";
import { CARD_PACKAGE_FORMAT } from "../lib/cardPackage";

let store: StoreApi | null = null;
function Probe() {
  store = useStore();
  return null;
}

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ subjects: [], topics: [], flashcards: [], settings: { onboarded: true } }));
  store = null;
});

afterEach(() => {
  cleanup();
});

describe("ورودِ بستهٔ فلش‌کارت", () => {
  it("کارت‌های زیاد را مرحله‌ای وارد و درصدِ پیشرفت را گزارش می‌کند", async () => {
    const view = render(
      <StoreProvider>
        <Probe />
      </StoreProvider>,
    );
    expect(store).not.toBeNull();

    const cards = Array.from({ length: 650 }, (_, index) => ({ front: `سؤال ${index}`, back: `پاسخ ${index}` }));
    const text = JSON.stringify({ format: CARD_PACKAGE_FORMAT, version: 1, exportedAt: 1, topics: [], cards });
    const progress: { phase: "planning" | "saving"; completed: number; total: number }[] = [];
    let result: Awaited<ReturnType<StoreApi["importCardPackageText"]>> | undefined;

    await act(async () => {
      result = await store!.importCardPackageText(text, (step) => progress.push(step));
    });

    expect(result?.ok).toBe(true);
    expect(result?.added).toBe(650);
    expect(store!.state.flashcards).toHaveLength(650);
    expect(progress.filter((step) => step.phase === "saving").map((step) => step.completed)).toEqual([0, 300, 600, 650]);
    expect(progress.at(-1)).toMatchObject({ phase: "saving", completed: 650, total: 650 });
    view.unmount();
  });
});
