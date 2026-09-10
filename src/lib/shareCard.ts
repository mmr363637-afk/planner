// ===== کارت تصویریِ قابل اشتراک (کاملاً آفلاین، با Canvas) =====
// یک «کارت خلاصه» ۱۰۸۰×۱۳۵۰ می‌سازد: استریک، مجموع مطالعه، سطح، مباحث تسلط‌یافته
// و باغ. تصویر یا با Web Share به اشتراک می‌رود یا دانلود می‌شود.

import { shareFile } from "./share";

export interface ShareCardData {
  dateLine: string; // مثلاً «پنجشنبه ۱۹ شهریور ۱۴۰۵»
  streakDays: number;
  totalHours: string; // متن آماده مثل «۴۲ ساعت»
  xp: number;
  levelText: string; // «سطح ۳ · پیشرفته»
  mastered: number;
  totalTopics: number;
  gardenIcon: string; // 🌳
  gardenLabel: string;
  weekHours: string;
  accent: string; // hex
}

const W = 1080;
const H = 1350;

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function fa(n: number): string {
  return String(n).replace(/\d/g, (d) => "۰۱۲۳۴۵۶۷۸۹"[Number(d)]);
}

/** رندر کارت روی canvas — null اگر 2D context در دسترس نباشد (مثلاً jsdom) */
export function renderShareCard(d: ShareCardData): HTMLCanvasElement | null {
  if (typeof document === "undefined") return null;
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;

  // پس‌زمینه: گرادیان تیره از رنگ اصلی برنامه
  const bg = ctx.createLinearGradient(0, 0, W, H);
  bg.addColorStop(0, "#0f172a");
  bg.addColorStop(0.55, "#134e4a");
  bg.addColorStop(1, "#042f2e");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  // هاله‌ی نور
  const glow = ctx.createRadialGradient(W * 0.8, H * 0.12, 40, W * 0.8, H * 0.12, 620);
  glow.addColorStop(0, d.accent + "55");
  glow.addColorStop(1, "transparent");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, W, H);

  // ستاره‌های محوِ بالا
  ctx.fillStyle = "rgba(255,255,255,0.10)";
  for (let i = 0; i < 70; i++) {
    const x = (i * 137) % W;
    const y = ((i * 89) % 420) + 18;
    const r = (i % 3) + 1;
    ctx.beginPath();
    ctx.arc(x, y, r * 0.8, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const font = (w: number, s: number) => `${w ? `${w} ` : ""}${s}px "Vazirmatn","IRANSans",Tahoma,sans-serif`;

  // سرشناسه
  ctx.fillStyle = "rgba(255,255,255,0.85)";
  ctx.font = font(800, 44);
  ctx.fillText("🌙 برنامه‌ریز مطالعه", W / 2, 105);
  ctx.fillStyle = "rgba(255,255,255,0.45)";
  ctx.font = font(400, 30);
  ctx.fillText(d.dateLine, W / 2, 165);

  // استریک — عدد بزرگ قهرمان
  ctx.font = font(900, 240);
  ctx.fillStyle = "#fff";
  ctx.fillText(`🔥 ${fa(d.streakDays)}`, W / 2, 425);
  ctx.font = font(700, 48);
  ctx.fillStyle = "rgba(255,255,255,0.85)";
  ctx.fillText("روز مطالعه‌ی پیاپی", W / 2, 575);

  // کارت‌های آمار (دوتا در هر ردیف)
  const items: { icon: string; label: string; value: string }[] = [
    { icon: "⏱", label: "مجموع مطالعه", value: d.totalHours },
    { icon: "🗓️", label: "این هفته", value: d.weekHours },
    { icon: "⭐", label: d.levelText, value: `${fa(d.xp)} XP` },
    { icon: "✅", label: "تسلط روی مبحث", value: `${fa(d.mastered)} از ${fa(d.totalTopics)}` },
  ];
  const cw = 470;
  const ch = 210;
  const gap = 36;
  const startX = (W - cw * 2 - gap) / 2;
  items.forEach((it, i) => {
    const col = i % 2;
    const row = Math.floor(i / 2);
    const x = startX + col * (cw + gap);
    const y = 660 + row * (ch + gap);
    roundRect(ctx, x, y, cw, ch, 36);
    ctx.fillStyle = "rgba(255,255,255,0.08)";
    ctx.fill();
    ctx.fillStyle = "rgba(255,255,255,0.55)";
    ctx.font = font(400, 28);
    ctx.textAlign = "center";
    ctx.fillText(`${it.icon} ${it.label}`, x + cw / 2, y + 62);
    ctx.fillStyle = "#fff";
    ctx.font = font(800, 46);
    ctx.fillText(it.value, x + cw / 2, y + 135);
  });

  // باغ
  ctx.fillStyle = "rgba(255,255,255,0.75)";
  ctx.font = font(500, 42);
  ctx.fillText(`باغ تو همین حالا یک «${d.gardenIcon} ${d.gardenLabel}» است`, W / 2, 1180);

  // پانوشت
  ctx.fillStyle = "rgba(255,255,255,0.35)";
  ctx.font = font(400, 26);
  ctx.fillText("داده‌ها فقط روی دستگاه ذخیره می‌شوند · کاملاً آفلاین", W / 2, 1280);

  return canvas;
}

export function canvasToFile(canvas: HTMLCanvasElement, name: string): Promise<File | null> {
  return new Promise((resolve) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        resolve(null);
        return;
      }
      resolve(new File([blob], name, { type: "image/png" }));
    }, "image/png");
  });
}

export function downloadCanvas(canvas: HTMLCanvasElement, name: string): boolean {
  try {
    const url = canvas.toDataURL("image/png");
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    return true;
  } catch {
    return false;
  }
}

/** تلاش برای اشتراک؛ در نبود پشتیبانی، دانلود */
export async function shareOrDownloadCard(canvas: HTMLCanvasElement, name: string, text: string): Promise<"shared" | "downloaded" | "failed"> {
  const file = await canvasToFile(canvas, name);
  if (file) {
    const r = await shareFile(file, text);
    if (r === "shared") return "shared";
  }
  return downloadCanvas(canvas, name) ? "downloaded" : "failed";
}
