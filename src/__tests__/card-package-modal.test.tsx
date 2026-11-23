// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import CardPackageModal from "../components/CardPackageModal";
import { StoreProvider } from "../store";
import { STORAGE_KEY } from "../lib/persist";
import { CARD_PACKAGE_FORMAT } from "../lib/cardPackage";

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ subjects: [], topics: [], flashcards: [], settings: { onboarded: true } }));
});

afterEach(cleanup);

describe("پیشرفتِ ورودِ بستهٔ فلش‌کارت", () => {
  it("حینِ افزودن، spinner و نوارِ پیشرفت را نشان می‌دهد و بعد نتیجه را اعلام می‌کند", async () => {
    render(
      <StoreProvider>
        <CardPackageModal open onClose={() => {}} />
      </StoreProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: /ورود بسته/ }));

    const cards = Array.from({ length: 650 }, (_, index) => ({ front: `سؤال ${index}`, back: `پاسخ ${index}` }));
    const input = screen.getByPlaceholderText(/study-planner\.cards/) as HTMLTextAreaElement;
    fireEvent.change(input, {
      target: { value: JSON.stringify({ format: CARD_PACKAGE_FORMAT, version: 1, exportedAt: 1, topics: [], cards }) },
    });
    expect(await screen.findByText(/۶۵۰ کارت تازه/)).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: /افزودن به کارت‌های من/ }));
    expect(screen.getByRole("progressbar", { name: "پیشرفت واردکردن کارت‌ها" })).toBeTruthy();
    expect(screen.getByRole("status").textContent).toContain("در حال");
    await waitFor(() => expect(screen.getByText(/۶۵۰ کارت و ۰ مبحث اضافه شد/)).toBeTruthy());
  });
});
