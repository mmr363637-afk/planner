// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

const curated = vi.hoisted(() => ({
  ensure: vi.fn<() => Promise<never>>(() => Promise.reject(new Error("Loading chunk curatedPacksData failed"))),
}));

// این همان شکستی است که روی PWA با index تازه + کشِ چانک قدیمی رخ می‌دهد.
vi.mock("../lib/curatedPacks", () => ({
  ensureCuratedPacks: curated.ensure,
  curatedPacksReady: () => false,
  getCuratedPacks: () => [],
  curatedPacksOfTopic: () => [],
  curatedPackById: () => undefined,
  curatedCardKey: (packId: string, front: string) => `${packId}::${front.trim()}`,
}));

import { StoreProvider } from "../store";
import FlashcardsView from "../components/Flashcards";

afterEach(cleanup);

beforeEach(() => {
  localStorage.clear();
  curated.ensure.mockClear();
});

describe("بازیابی خطای بارگذاری بانک منتخب فلش‌کارت", () => {
  it("به‌جای spinner ابدی، خطا و دکمه‌ی تلاش دوباره نشان می‌دهد", async () => {
    render(
      <StoreProvider>
        <FlashcardsView />
      </StoreProvider>,
    );

    expect(await screen.findByText("بانک فلش‌کارت‌های منتخب بارگذاری نشد")).toBeTruthy();
    expect(screen.getByText(/کارت‌های شخصی‌ات و مرورشان همچنان سالم‌اند/)).toBeTruthy();
    expect(curated.ensure).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("button", { name: /تلاش دوباره/ }));
    await waitFor(() => expect(curated.ensure).toHaveBeenCalledTimes(2));
  });
});
