// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import App from "../App";
import { AMBIENT_PRESETS } from "../lib/ambient";
import { DEFAULT_AMBIENT } from "../types";

afterEach(cleanup);

function savedState() {
  return JSON.parse(localStorage.getItem("study-planner-v1")!);
}

/** مبحث نمونه تا صفحه‌ی مطالعه (و کارت سریع صداها) رندر شود */
function seedTopic() {
  localStorage.setItem(
    "study-planner-v1",
    JSON.stringify({
      subjects: [{ id: "s1", name: "فیزیولوژی", color: "#0ea5a4", priority: "high", createdAt: 1 }],
      topics: [
        {
          id: "t1",
          subjectId: "s1",
          name: "قلب",
          volume: 10,
          estimatedMinutes: 45,
          priority: "high",
          difficulty: 2,
          status: "not_started",
          createdAt: 1,
        },
      ],
    }),
  );
}

function openMixer() {
  fireEvent.click(screen.getByTitle("صداهای تمرکز"));
}

describe("میکسر صداهای محیطی (White Noise)", () => {
  it("از نوار بالای اپ باز می‌شود و هر سه صدا با اسلایدر مستقل دارد", () => {
    localStorage.clear();
    render(<App />);

    openMixer();
    expect(screen.getByText("🎧 صداهای تمرکز")).toBeTruthy();
    expect(screen.getByText("ترکیب‌های آماده")).toBeTruthy();

    for (const label of ["باران", "رعد و برق", "رودخانه"]) {
      expect(screen.getByText(label)).toBeTruthy();
      expect(screen.getByLabelText(`حجم ${label}`)).toBeTruthy();
    }
    expect(screen.getByLabelText("حجم کلی")).toBeTruthy();
  });

  it("در jsdom (بدون Web Audio) به‌جای crash، پیام پشتیبانی‌نشدن نشان می‌دهد", () => {
    localStorage.clear();
    render(<App />);

    openMixer();
    expect(screen.getByText(/Web Audio پشتیبانی نمی‌کند/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "شروع پخش" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "شروع پخش" })); // باید بی‌خطر باشد
    expect(savedState()).toBeTruthy();
  });

  it("خاموش/روشن کردن یک صدا، میکس را در تنظیمات ذخیره می‌کند", async () => {
    localStorage.clear();
    render(<App />);

    openMixer();
    expect(screen.getByTitle("خاموش کردن باران")).toBeTruthy();
    fireEvent.click(screen.getByTitle("خاموش کردن باران"));
    expect(screen.getByTitle("روشن کردن باران")).toBeTruthy();

    await waitFor(() => expect(savedState().settings.ambient.volumes.rain).toBe(0), { timeout: 2000 });
    // بقیه‌ی صداها دست‌نخورده می‌مانند
    expect(savedState().settings.ambient.volumes.river).toBe(DEFAULT_AMBIENT.volumes.river);

    // روشن شدن دوباره به همان حجم قبلی برمی‌گردد
    fireEvent.click(screen.getByTitle("روشن کردن باران"));
    await waitFor(() => expect(savedState().settings.ambient.volumes.rain).toBe(DEFAULT_AMBIENT.volumes.rain), { timeout: 2000 });
  });

  it("با اسلایدر می‌شود سه صدا را با هم میکس کرد", async () => {
    localStorage.clear();
    render(<App />);

    openMixer();
    fireEvent.change(screen.getByLabelText("حجم باران"), { target: { value: "90" } });
    fireEvent.change(screen.getByLabelText("حجم رودخانه"), { target: { value: "20" } });
    fireEvent.change(screen.getByLabelText("حجم کلی"), { target: { value: "50" } });

    await waitFor(() => {
      const ambient = savedState().settings.ambient;
      expect(ambient.volumes.rain).toBe(0.9);
      expect(ambient.volumes.river).toBe(0.2);
      expect(ambient.master).toBe(0.5);
    }, { timeout: 2000 });
  });

  it("ترکیب‌های آماده، هر سه صدا را با هم تنظیم می‌کنند", async () => {
    localStorage.clear();
    render(<App />);

    openMixer();
    const storm = AMBIENT_PRESETS.find((p) => p.id === "storm")!;
    fireEvent.click(screen.getByRole("button", { name: /طوفان/ }));

    await waitFor(() => expect(savedState().settings.ambient.volumes).toEqual(storm.volumes), { timeout: 2000 });
  });

  it("میکسِ ذخیره‌شده بعد از بستن و بازکردن اپ برمی‌گردد", async () => {
    localStorage.clear();
    render(<App />);
    openMixer();
    fireEvent.change(screen.getByLabelText("حجم رعد و برق"), { target: { value: "15" } });
    await waitFor(() => expect(savedState().settings.ambient.volumes.thunder).toBe(0.15), { timeout: 2000 });
    cleanup();

    render(<App />);
    openMixer();
    expect((screen.getByLabelText("حجم رعد و برق") as HTMLInputElement).value).toBe("15");
  });

  it("در صفحه‌ی مطالعه هم یک کارت سریع برای صداها هست", () => {
    seedTopic();
    render(<App />);

    fireEvent.click(screen.getAllByText("مطالعه")[0]);
    expect(screen.getByText("صداهای تمرکز")).toBeTruthy();
    for (const label of ["باران", "رعد و برق", "رودخانه"]) {
      expect(screen.getByTitle(`خاموش کردن ${label}`)).toBeTruthy();
    }

    fireEvent.click(screen.getByTitle("خاموش کردن رودخانه"));
    expect(screen.getByTitle("روشن کردن رودخانه")).toBeTruthy();
  });

  it("در تنظیمات، کلیدِ بازکردن میکسر و حجم کلی هست", () => {
    localStorage.clear();
    render(<App />);

    fireEvent.click(screen.getByTitle("تنظیمات"));
    expect(screen.getByText("صداهای تمرکز")).toBeTruthy();
    expect(screen.getByRole("button", { name: /باز کردن میکسر صداها/ })).toBeTruthy();

    fireEvent.change(screen.getByLabelText("حجم کلی صداهای تمرکز"), { target: { value: "30" } });
    // همان لحظه روی میکسرِ سراسری اعمال می‌شود
    fireEvent.click(screen.getByRole("button", { name: /باز کردن میکسر صداها/ }));
    expect((screen.getByLabelText("حجم کلی") as HTMLInputElement).value).toBe("30");
  });
});
