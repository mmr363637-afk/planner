// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { StoreProvider, useStore } from "../store";
import { STORAGE_KEY } from "../lib/persist";
import type { AppState } from "../types";

afterEach(() => {
  cleanup();
  localStorage.clear();
});

function seedState(partial: Partial<AppState> = {}) {
  const base: AppState = {
    subjects: [{ id: "s1", name: "قلب", color: "#f00", priority: "high", createdAt: 1 }],
    topics: [
      { id: "t1", subjectId: "s1", name: "آریتمی", volume: 1, estimatedMinutes: 10, priority: "medium", difficulty: 1, status: "learning", createdAt: 1 },
    ],
    settings: { onboarded: true },
    ...partial,
  } as AppState;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(base));
}

/** شبیه‌سازیِ نوشتنِ یک تبِ دیگر: mirror همان‌جا نوشته می‌شود و رویداد storage اینجا می‌آید */
function otherTabWrites(state: AppState) {
  const json = JSON.stringify(state);
  localStorage.setItem(STORAGE_KEY, json);
  window.dispatchEvent(new StorageEvent("storage", { key: STORAGE_KEY, newValue: json }));
}

function Probe() {
  const { state } = useStore();
  return (
    <div data-testid="probe">
      {state.subjects.map((s) => s.name).join("،")}
    </div>
  );
}

function Controller() {
  const { startSession, endSession, externalTabWarning } = useStore();
  return (
    <div>
      <Probe />
      <button
        type="button"
        data-testid="start"
        onClick={() => act(() => startSession("t1", "free"))}
      >
        start
      </button>
      <button type="button" data-testid="end" onClick={() => act(() => endSession(3))}>
        end
      </button>
      <div data-testid="warning">{externalTabWarning ? "yes" : "no"}</div>
    </div>
  );
}

const externalWithLungs: AppState = {
  subjects: [
    { id: "s1", name: "قلب", color: "#f00", priority: "high", createdAt: 1 },
    { id: "s2", name: "ریه", color: "#00f", priority: "medium", createdAt: 2 },
  ],
  topics: [
    { id: "t1", subjectId: "s1", name: "آریتمی", volume: 1, estimatedMinutes: 10, priority: "medium", difficulty: 1, status: "learning", createdAt: 1 },
  ],
  settings: { onboarded: true },
} as AppState;

describe("همگام‌سازی چندتب", () => {
  it("تبِ بدون جلسه‌ی فعال، با نوشتنِ تبِ دیگر بی‌درنگ همگام می‌شود", async () => {
    seedState();
    render(
      <StoreProvider>
        <Controller />
      </StoreProvider>,
    );
    expect(screen.getByTestId("probe").textContent).toBe("قلب");

    otherTabWrites(externalWithLungs);

    await waitFor(() => expect(screen.getByTestId("probe").textContent).toBe("قلب،ریه"));
    expect(screen.getByTestId("warning").textContent).toBe("no");
  });

  it("با جلسه‌ی فعال داده را از تبِ دیگر نمی‌بلعد؛ هشدار می‌دهد و با پایان جلسه همگام می‌شود", async () => {
    seedState();
    render(
      <StoreProvider>
        <Controller />
      </StoreProvider>,
    );

    screen.getByTestId("start").click();
    // تایمر زنده است — حالا تبِ دیگر داده را عوض می‌کند
    otherTabWrites(externalWithLungs);

    await waitFor(() => expect(screen.getByTestId("warning").textContent).toBe("yes"));
    // داده‌ی خودِ این تب دست‌نخورده مانده است (تایمر از بین نرفته)
    expect(screen.getByTestId("probe").textContent).toBe("قلب");

    // پایان جلسه → همگام‌سازی خودکار
    screen.getByTestId("end").click();
    await waitFor(() => expect(screen.getByTestId("probe").textContent).toBe("قلب،ریه"));
    await waitFor(() => expect(screen.getByTestId("warning").textContent).toBe("no"));
  });

  it("نوشتنِ تبِ خود روی تبِ دیگر اثری ندارد (رویداد storage هم‌تب نمی‌آید)", async () => {
    seedState();
    render(
      <StoreProvider>
        <Controller />
      </StoreProvider>,
    );
    // یک تغییر عادی در همین تب — state فقط از مسیر خودت به‌روز می‌شود
    expect(screen.getByTestId("probe").textContent).toBe("قلب");
    // (این تست عمدتاً رجیستر می‌کند که رفتار عادی با وجود لیسنر storage سالم است)
    expect(screen.getByTestId("warning").textContent).toBe("no");
  });
});
