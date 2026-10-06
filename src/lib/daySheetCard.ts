// ===== خروجی تصویریِ «روز من» (Canvas، کاملاً آفلاین) =====
// یک کارت عمودیِ ۱۰۸۰ پیکسلی می‌سازد: سربرگ روز، کارت‌های آمار، تایم‌لاین رنگیِ
// ساعت‌به‌ساعت (کلاس/امتحان/ثبت‌شده/پیشنهادی + پنجره‌های خالی + خطِ «الان») و
// جمع‌بندیِ پایین. همین تصویر برای اشتراک‌گذاری یا ذخیره روی دستگاه است.

import type { DaySheet } from "./daySheet";
import { formatMinutes, toFa } from "./jalali";

const W = 1080;
const PAD = 56;
const LANE_X = PAD;
const LANE_W = 772;
const FONT = (weight: number, size: number) => `${weight} ${size}px "Vazirmatn","IRANSans",Tahoma,sans-serif`;

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  const rad = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.beginPath();
  ctx.moveTo(x + rad, y);
  ctx.arcTo(x + w, y, x + w, y + h, rad);
  ctx.arcTo(x + w, y + h, x, y + h, rad);
  ctx.arcTo(x, y + h, x, y, rad);
  ctx.arcTo(x, y, x + w, y, rad);
  ctx.closePath();
}

/** #rrggbb + آلفا → اندازه‌ی قابل استفاده در canvas */
function hexA(hex: string, a: number): string {
  const h = /^#([0-9a-f]{6})$/i.exec(hex.trim());
  if (!h) return `rgba(255,255,255,${a})`;
  const v = parseInt(h[1], 16);
  return `rgba(${(v >> 16) & 255},${(v >> 8) & 255},${v & 255},${a})`;
}

/**
 * جمع‌بندیِ متنیِ پایین کارت — خالص و قابل تست؛ در خودِ تصویر هم همین‌ها نوشته می‌شوند.
 */
export function daySheetCardSummary(sheet: DaySheet): string[] {
  const lines: string[] = [];
  for (const w of sheet.windows) {
    const badge = w.golden ? " · ساعت طلایی" : w.best ? " · طولانی‌ترین" : "";
    lines.push(`🟢 خالی ${toFa(clockOf(w.start))}–${toFa(clockOf(w.end))} · ${formatMinutes(w.minutes)}${badge}`);
  }
  for (const u of sheet.unplaced) {
    lines.push(`🟠 جا نشد: ${u.title}${u.subtitle ? ` (${u.subtitle})` : ""} · ${formatMinutes(u.minutes)}`);
  }
  for (const s of sheet.bySubject.slice(0, 6)) {
    lines.push(`🔵 سهم ${s.name} · ${formatMinutes(s.minutes)}`);
  }
  if (sheet.totals.reviewsDue > 0) lines.push(`🔁 مرور سررسیدشده: ${toFa(sheet.totals.reviewsDue)} مبحث`);
  return lines;
}

function clockOf(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/** رندر کارت «روز من» روی canvas — null اگر 2D context در دسترس نباشد (مثلاً jsdom) */
export function renderDaySheetCard(sheet: DaySheet, dateLine: string, opts: { accent?: string; title?: string } = {}): HTMLCanvasElement | null {
  if (typeof document === "undefined") return null;
  const accent = opts.accent ?? "#14b8a6";
  const span = Math.max(60, sheet.rangeEndMin - sheet.rangeStartMin);
  const px = Math.min(1.4, Math.max(0.5, 760 / span));
  const laneH = Math.round(span * px);

  const summary = daySheetCardSummary(sheet);
  const headerH = 96 + 74 + 34 + 30 + 18; // عنوان + تاریخ + نوار پیشرفت + حاشیه
  const statsH = 150;
  const laneLabelH = 54;
  const summaryH = summary.length ? 56 + summary.length * 46 : 0;
  const footerH = 92;
  const H = Math.round(PAD + headerH + statsH + laneLabelH + laneH + 40 + summaryH + footerH);

  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  if ("direction" in ctx) ctx.direction = "rtl";

  // ── پس‌زمینه‌ی تیره با گرادیان و هاله‌ی رنگ درس‌محور
  const bg = ctx.createLinearGradient(0, 0, W, H);
  bg.addColorStop(0, "#0b1220");
  bg.addColorStop(0.5, "#0f2f33");
  bg.addColorStop(1, "#071a24");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  const glow = ctx.createRadialGradient(W * 0.86, 90, 30, W * 0.86, 90, 620);
  glow.addColorStop(0, hexA(accent, 0.36));
  glow.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, W, H);

  const glow2 = ctx.createRadialGradient(W * 0.12, H * 0.72, 30, W * 0.12, H * 0.72, 520);
  glow2.addColorStop(0, hexA(sheet.bySubject[0]?.color ?? "#8b5cf6", 0.22));
  glow2.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = glow2;
  ctx.fillRect(0, 0, W, H);

  // نقطه‌های محوِ بالا (بافت)
  ctx.fillStyle = "rgba(255,255,255,0.07)";
  for (let i = 0; i < 60; i++) {
    const x = (i * 173) % W;
    const y = ((i * 97) % 300) + 12;
    ctx.beginPath();
    ctx.arc(x, y, (i % 3) + 0.7, 0, Math.PI * 2);
    ctx.fill();
  }

  let y = PAD;

  // ── سربرگ
  ctx.textAlign = "right";
  ctx.textBaseline = "middle";
  ctx.fillStyle = "#ffffff";
  ctx.font = FONT(800, 52);
  ctx.fillText(opts.title ?? "🌤️ روز من", W - PAD, y + 32);

  ctx.fillStyle = "rgba(255,255,255,0.62)";
  ctx.font = FONT(500, 30);
  ctx.fillText(dateLine, W - PAD, y + 96);

  if (sheet.holiday) {
    const text = `تعطیل · ${sheet.holiday}`;
    ctx.font = FONT(700, 26);
    const w = ctx.measureText(text).width + 44;
    roundRect(ctx, PAD, y + 8, w, 52, 26);
    ctx.fillStyle = "rgba(244,63,94,0.24)";
    ctx.fill();
    ctx.strokeStyle = "rgba(244,63,94,0.55)";
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fillStyle = "#fecdd3";
    ctx.textAlign = "center";
    ctx.fillText(text, PAD + w / 2, y + 35);
    ctx.textAlign = "right";
  }
  y += 138;

  // نوار پیشرفت روز: ثبت‌شده در برابر کلِ برنامه‌ی پیش‌بینی‌شده
  const doneTo = sheet.totals.recordedMinutes + sheet.totals.plannedMinutes;
  const ratio = doneTo > 0 ? Math.min(1, sheet.totals.recordedMinutes / doneTo) : 0;
  ctx.fillStyle = "rgba(255,255,255,0.5)";
  ctx.font = FONT(500, 24);
  ctx.fillText(`پیشرفت روز · ${formatMinutes(sheet.totals.recordedMinutes)} از ${formatMinutes(doneTo)}`, W - PAD, y);
  y += 24;
  roundRect(ctx, PAD, y, W - PAD * 2, 18, 9);
  ctx.fillStyle = "rgba(255,255,255,0.12)";
  ctx.fill();
  if (ratio > 0) {
    roundRect(ctx, W - PAD - (W - PAD * 2) * ratio, y, (W - PAD * 2) * ratio, 18, 9);
    const pg = ctx.createLinearGradient(W - PAD - (W - PAD * 2) * ratio, y, W - PAD, y + 18);
    pg.addColorStop(0, hexA(accent, 0.75));
    pg.addColorStop(1, accent);
    ctx.fillStyle = pg;
    ctx.fill();
  }
  y += 18 + 34;

  // ── کارت‌های آمار
  const tiles = [
    { icon: "🏫", label: "کلاس", value: formatMinutes(sheet.totals.classMinutes), color: "#38bdf8" },
    { icon: "✅", label: "ثبت‌شده", value: formatMinutes(sheet.totals.recordedMinutes), color: "#34d399" },
    { icon: "🎯", label: "پیشنهادی", value: formatMinutes(sheet.totals.suggestedMinutes), color: "#fbbf24" },
    { icon: "🟢", label: "زمان خالی", value: formatMinutes(sheet.totals.freeMinutes), color: "#a78bfa" },
  ];
  const gap = 20;
  const tw = (W - PAD * 2 - gap * (tiles.length - 1)) / tiles.length;
  tiles.forEach((t, i) => {
    const x = W - PAD - tw - i * (tw + gap); // از راست به چپ
    roundRect(ctx, x, y, tw, 132, 26);
    ctx.fillStyle = "rgba(255,255,255,0.07)";
    ctx.fill();
    ctx.strokeStyle = hexA(t.color, 0.35);
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.textAlign = "center";
    ctx.fillStyle = hexA(t.color, 0.9);
    ctx.font = FONT(600, 24);
    ctx.fillText(`${t.icon} ${t.label}`, x + tw / 2, y + 36);
    ctx.fillStyle = "#ffffff";
    ctx.font = FONT(800, 30);
    ctx.fillText(t.value, x + tw / 2, y + 92);
    ctx.textAlign = "right";
  });
  y += 132 + 50;

  // ── برچسب بخش تایم‌لاین
  ctx.fillStyle = "rgba(255,255,255,0.9)";
  ctx.font = FONT(700, 30);
  ctx.fillText("⏱ تایم‌لاین روز", W - PAD, y + 16);
  ctx.fillStyle = "rgba(255,255,255,0.4)";
  ctx.font = FONT(400, 22);
  ctx.textAlign = "left";
  ctx.fillText(`${toFa(Math.floor(sheet.rangeStartMin / 60))} تا ${toFa(Math.ceil(sheet.rangeEndMin / 60))}`, PAD, y + 16);
  ctx.textAlign = "right";
  y += 44;

  const laneTop = y;

  // شبکه‌ی ساعت‌ها + برچسب‌ها
  const firstHour = Math.ceil(sheet.rangeStartMin / 60);
  const lastHour = Math.floor(sheet.rangeEndMin / 60);
  for (let h = firstHour; h <= lastHour; h++) {
    const hy = laneTop + (h * 60 - sheet.rangeStartMin) * px;
    ctx.strokeStyle = "rgba(255,255,255,0.07)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(LANE_X, hy);
    ctx.lineTo(LANE_X + LANE_W, hy);
    ctx.stroke();
    ctx.fillStyle = "rgba(255,255,255,0.42)";
    ctx.font = FONT(500, 24);
    ctx.fillText(toFa(String(h).padStart(2, "0") + ":00"), W - PAD, hy);
  }

  // ستون تایم‌لاین
  roundRect(ctx, LANE_X, laneTop, LANE_W, laneH, 22);
  ctx.fillStyle = "rgba(255,255,255,0.035)";
  ctx.fill();

  // پنجره‌های خالی (پشت بلوک‌ها)
  for (const w of sheet.windows) {
    const wy = laneTop + (w.start - sheet.rangeStartMin) * px;
    const wh = Math.max(26, w.minutes * px - 6);
    roundRect(ctx, LANE_X + 6, wy + 3, LANE_W - 12, wh, 16);
    ctx.fillStyle = w.golden ? "rgba(250,204,21,0.10)" : "rgba(255,255,255,0.05)";
    ctx.fill();
    ctx.setLineDash([8, 8]);
    ctx.strokeStyle = w.golden ? "rgba(250,204,21,0.5)" : "rgba(255,255,255,0.22)";
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.setLineDash([]);
    if (wh > 44) {
      ctx.fillStyle = w.golden ? "rgba(253,224,71,0.85)" : "rgba(255,255,255,0.5)";
      ctx.font = FONT(600, 22);
      ctx.textAlign = "center";
      ctx.fillText(`خالی · ${formatMinutes(w.minutes)}${w.golden ? " · ساعت طلایی" : w.best ? " · طولانی‌ترین" : ""}`, LANE_X + LANE_W / 2, wy + wh / 2);
      ctx.textAlign = "right";
    }
  }

  // بلوک‌ها
  for (const item of sheet.items) {
    const by = laneTop + (item.startMin - sheet.rangeStartMin) * px;
    const bh = Math.max(26, item.minutes * px - 6);
    const grad = ctx.createLinearGradient(LANE_X, by, LANE_X + LANE_W, by + bh);
    grad.addColorStop(0, hexA(item.color, 0.72));
    grad.addColorStop(1, hexA(item.color, 0.96));
    ctx.save();
    roundRect(ctx, LANE_X + 4, by + 3, LANE_W - 8, bh, 16);
    ctx.fillStyle = grad;
    ctx.fill();
    ctx.clip();
    // نوارِ تأکیدِ سمت راست
    ctx.fillStyle = item.color;
    ctx.fillRect(LANE_X + LANE_W - 14, by + 3, 10, bh);
    // درخششِ ملایم بالا
    const shine = ctx.createLinearGradient(0, by, 0, by + bh);
    shine.addColorStop(0, "rgba(255,255,255,0.18)");
    shine.addColorStop(0.6, "rgba(255,255,255,0)");
    ctx.fillStyle = shine;
    ctx.fillRect(LANE_X + 4, by + 3, LANE_W - 8, bh);

    ctx.textAlign = "right";
    ctx.textBaseline = "middle";
    ctx.fillStyle = "rgba(255,255,255,0.98)";
    if (bh < 52) {
      ctx.font = FONT(700, 22);
      ctx.fillText(`${item.icon} ${item.title}`, LANE_X + LANE_W - 30, by + 3 + bh / 2, LANE_W - 220);
    } else {
      ctx.font = FONT(700, 30);
      ctx.fillText(`${item.icon} ${item.title}`, LANE_X + LANE_W - 30, by + 3 + 34, LANE_W - 70);
      ctx.fillStyle = "rgba(255,255,255,0.78)";
      ctx.font = FONT(500, 22);
      const extra = [item.subtitle, item.label].filter(Boolean).join(" · ");
      ctx.fillText(`${clockOf(item.startMin)}–${clockOf(item.endMin)} · ${formatMinutes(item.minutes)}${extra ? ` · ${extra}` : ""}`, LANE_X + LANE_W - 30, by + 3 + 68, LANE_W - 70);
    }
    ctx.restore();
  }

  // خطِ «الان»
  if (sheet.nowMin != null && sheet.nowMin >= sheet.rangeStartMin && sheet.nowMin <= sheet.rangeEndMin) {
    const ny = laneTop + (sheet.nowMin - sheet.rangeStartMin) * px;
    ctx.strokeStyle = "rgba(244,63,94,0.85)";
    ctx.lineWidth = 3;
    ctx.setLineDash([10, 7]);
    ctx.beginPath();
    ctx.moveTo(LANE_X, ny);
    ctx.lineTo(LANE_X + LANE_W, ny);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.beginPath();
    ctx.arc(LANE_X + LANE_W - 4, ny, 9, 0, Math.PI * 2);
    ctx.fillStyle = "#f43f5e";
    ctx.fill();
    const tag = `الان ${clockOf(sheet.nowMin)}`;
    ctx.font = FONT(700, 22);
    const tw2 = ctx.measureText(tag).width + 32;
    roundRect(ctx, LANE_X + 8, ny - 17, tw2, 34, 17);
    ctx.fillStyle = "#f43f5e";
    ctx.fill();
    ctx.fillStyle = "#fff";
    ctx.textAlign = "center";
    ctx.fillText(tag, LANE_X + 8 + tw2 / 2, ny);
    ctx.textAlign = "right";
  }

  y = laneTop + laneH + 40;

  // ── جمع‌بندی
  if (summary.length) {
    ctx.fillStyle = "rgba(255,255,255,0.9)";
    ctx.font = FONT(700, 28);
    ctx.fillText("📋 جمع‌بندی", W - PAD, y + 6);
    y += 44;
    for (const line of summary) {
      ctx.fillStyle = "rgba(255,255,255,0.72)";
      ctx.font = FONT(500, 25);
      ctx.fillText(line, W - PAD, y + 12, W - PAD * 2 - 20);
      y += 46;
    }
  }

  // ── پانوشت
  ctx.fillStyle = "rgba(255,255,255,0.34)";
  ctx.font = FONT(400, 24);
  ctx.textAlign = "center";
  ctx.fillText("🌙 برنامه‌ریز مطالعه · همه‌ی داده‌ها فقط روی دستگاه تو ذخیره می‌شود", W / 2, H - 44);
  ctx.textAlign = "right";

  return canvas;
}

/** نام فایل پیشنهادی برای دانلود کارت */
export function daySheetCardName(date: string): string {
  return `day-sheet-${date}.png`;
}
