// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import App from "../App";

afterEach(cleanup);

function savedState() {
  return JSON.parse(localStorage.getItem("study-planner-v1")!);
}

function openMixer() {
  fireEvent.click(screen.getByTitle("صداهای تمرکز"));
}

describe("میکسر: لایه‌های تازه (گروه‌بندی)", () => {
  it("گروه‌بندی‌ها و همه‌ی صداهای جدید با اسلایدر دیده می‌شوند", () => {
    localStorage.clear();
    render(<App />);
    openMixer();
    // گروه‌ها
    for (const group of ["طبیعت، آب و باران", "مکان‌ها و سفر", "نویزهای خالص", "آرام‌بخش و خیال‌انگیز", "موتورهای مولد"]) {
      expect(screen.getAllByText(group).length).toBeGreaterThan(0);
    }
    // صداهای تازه
    for (const label of [
      "نویز سفید", "نویز صورتی", "قطار", "کابین هواپیما", "سفر جاده‌ای", "آبشار", "زیر آب",
      "باران روی چادر", "قورباغه‌های برکه", "کتابخانه", "ساعت دیواری", "خرخر گربه", "زمزمه‌ی فضا", "موسیقی زنده", "ضربان دوگوشی",
    ]) {
      expect(screen.getAllByText(label).length).toBeGreaterThan(0);
      expect(screen.getByLabelText(`حجم ${label}`)).toBeTruthy();
    }
    // همه‌ی این‌ها پیش‌فرض خاموش‌اند تا میکسِ فعلیِ کاربر را خراب نکنند
    for (const id of ["white", "pink", "train", "music", "binaural"]) {
      expect(savedState().settings.ambient.volumes[id]).toBe(0);
    }
  });
});

describe("میکسر: ضربان بینارال", () => {
  it("ردیفِ باند مغزی زیر لایه‌ی ضربان دوگوشی است و انتخابِ باند در تنظیمات می‌ماند", async () => {
    localStorage.clear();
    render(<App />);
    openMixer();
    expect(screen.getByText(/باند موج مغزی/)).toBeTruthy();
    // آلفا پیش‌فرض انتخاب شده است
    expect(screen.getByRole("button", { name: /آلفا · تمرکز آرام/ }).getAttribute("aria-pressed")).toBe("true");

    fireEvent.click(screen.getByRole("button", { name: /بتا · هوشیاری/ }));
    await waitFor(() => expect(savedState().settings.ambient.binauralBand).toBe("beta"));
    expect(screen.getByRole("button", { name: /بتا · هوشیاری/ }).getAttribute("aria-pressed")).toBe("true");

    // روشن‌کردنِ لایه، حجم٢ش را ذخیره می‌کند
    fireEvent.change(screen.getByLabelText("حجم ضربان دوگوشی"), { target: { value: "40" } });
    await waitFor(() => expect(savedState().settings.ambient.volumes.binaural).toBe(0.4));
  });
});

describe("میکسر: پریست‌های من", () => {
  it("میکس فعلی با نام ذخیره می‌شود، در تنظیمات می‌ماند و قابل حذف است", async () => {
    localStorage.clear();
    render(<App />);
    openMixer();
    fireEvent.change(screen.getByLabelText("حجم باران"), { target: { value: "60" } });
    fireEvent.change(screen.getByLabelText("حجم نویز قهوه‌ای"), { target: { value: "50" } });
    await waitFor(() => expect(savedState().settings.ambient.volumes.brown).toBe(0.5));

    fireEvent.click(screen.getByRole("button", { name: /ذخیره میکس فعلی/ }));
    fireEvent.change(screen.getByPlaceholderText(/نام پریست/), { target: { value: "شبِ امتحان" } });
    fireEvent.click(screen.getByRole("button", { name: "ذخیره" }));

    await waitFor(() => {
      const presets = savedState().settings.ambient.customPresets;
      expect(presets).toHaveLength(1);
      expect(presets[0].label).toBe("شبِ امتحان");
      expect(presets[0].volumes.rain).toBe(0.6);
      expect(presets[0].volumes.brown).toBe(0.5);
    });

    // اجرای پریست بعد از تغییر میکس، همان میکس را برمی‌گرداند
    fireEvent.change(screen.getByLabelText("حجم باران"), { target: { value: "10" } });
    await waitFor(() => expect(savedState().settings.ambient.volumes.rain).toBe(0.1));
    fireEvent.click(screen.getByTitle("اجرای پریست «شبِ امتحان»"));
    await waitFor(() => expect(savedState().settings.ambient.volumes.rain).toBe(0.6));

    // حذف پریست
    fireEvent.click(screen.getByTitle(/حذف پریست/));
    await waitFor(() => expect(savedState().settings.ambient.customPresets).toHaveLength(0));
  });

  it("ذخیره‌ی بدون نام انجام نمی‌شود و دکمه‌ی ذخیره‌ی گرسره (disabled) است", () => {
    localStorage.clear();
    render(<App />);
    openMixer();
    fireEvent.click(screen.getByRole("button", { name: /ذخیره میکس فعلی/ }));
    const saveBtn = screen.getByRole("button", { name: "ذخیره" }) as HTMLButtonElement;
    expect(saveBtn.disabled).toBe(true);
    fireEvent.change(screen.getByPlaceholderText(/نام پریست/), { target: { value: "   " } });
    expect((screen.getByRole("button", { name: "ذخیره" }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "انصراف" }));
    expect(screen.getByRole("button", { name: /ذخیره میکس فعلی/ })).toBeTruthy();
  });
});

describe("میکسر: واکنش به پومودورو", () => {
  it("کلیدِ واکنشِ فاز در تنظیمات ذخیره می‌شود", async () => {
    localStorage.clear();
    render(<App />);
    openMixer();
    const toggle = screen.getByRole("switch", { name: "واکنش به پومودورو" });
    expect(toggle.getAttribute("aria-checked")).toBe("false");
    fireEvent.click(toggle);
    await waitFor(() => expect(savedState().settings.ambient.reactiveDuck).toBe(true));
    expect(screen.getByRole("switch", { name: "واکنش به پومودورو" }).getAttribute("aria-checked")).toBe("true");
  });
});
