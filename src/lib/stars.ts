// ===== آسمانِ واقعی در حالت تمرکز عمیق =====
// کاتالوگ کوچکی از درخشان‌ترین ستاره‌های آسمان (RA/Dec نجومی) + محاسبه‌ی
// سمت/فراز (alt/az) برای هر نقطه‌ی زمین و هر لحظه — همه چیز آفلاین محاسبه می‌شود.
// موقعیت‌ها برای نمایش هنری کافی‌اند (هر نیم‌درجه خطا روی نمایشگر چشم‌گیر نیست).

export interface SkyStar {
  /** نام فارسی/بین‌المللی ستاره */
  name: string;
  /** صعود مستقیم — ساعت (۰..۲۴) */
  ra: number;
  /** میل — درجه */
  dec: number;
  /** قدر ظاهری (کوچک‌تر = درخشان‌تر) */
  mag: number;
}

export const BRIGHT_STARS: SkyStar[] = [
  { name: "شعرای یمانی (Sirius)", ra: 6.752, dec: -16.716, mag: -1.46 },
  { name: "سهیل (Canopus)", ra: 6.399, dec: -52.696, mag: -0.74 },
  { name: "سماک رامح (Arcturus)", ra: 14.261, dec: 19.182, mag: -0.05 },
  { name: "نسر واقع (Vega)", ra: 18.616, dec: 38.784, mag: 0.03 },
  { name: "عقیق (Capella)", ra: 5.278, dec: 45.998, mag: 0.08 },
  { name: "رجل الجبار (Rigel)", ra: 5.242, dec: -8.202, mag: 0.13 },
  { name: "شعرای شامی (Procyon)", ra: 7.655, dec: 5.225, mag: 0.34 },
  { name: "منکب الجوزا (Betelgeuse)", ra: 5.919, dec: 7.407, mag: 0.42 },
  { name: "آخر النهر (Achernar)", ra: 1.629, dec: -57.237, mag: 0.46 },
  { name: "حضار (Hadar)", ra: 14.064, dec: -60.373, mag: 0.61 },
  { name: "نسر طائر (Altair)", ra: 19.846, dec: 8.868, mag: 0.76 },
  { name: "عکروکس (Acrux)", ra: 12.443, dec: -63.099, mag: 0.77 },
  { name: "الدبران (Aldebaran)", ra: 4.599, dec: 16.509, mag: 0.86 },
  { name: "قلب العقرب (Antares)", ra: 16.49, dec: -26.432, mag: 0.96 },
  { name: "سمک اعزل (Spica)", ra: 13.42, dec: -11.161, mag: 0.97 },
  { name: "رأس التوأم المؤخر (Pollux)", ra: 7.755, dec: 28.026, mag: 1.14 },
  { name: "فم الحوت (Fomalhaut)", ra: 22.961, dec: -29.622, mag: 1.16 },
  { name: "ذنب الدجاجه (Deneb)", ra: 20.69, dec: 45.28, mag: 1.25 },
  { name: "میموزا (Mimosa)", ra: 12.795, dec: -59.689, mag: 1.25 },
  { name: "قلب الاسد (Regulus)", ra: 10.14, dec: 11.967, mag: 1.35 },
  { name: "عضارة (Adhara)", ra: 6.977, dec: -28.972, mag: 1.5 },
  { name: "رأس التوأم المقدم (Castor)", ra: 7.577, dec: 31.888, mag: 1.58 },
  { name: "بطریقة (Bellatrix)", ra: 5.418, dec: 6.35, mag: 1.64 },
  { name: "النطح (Elnath)", ra: 5.438, dec: 28.608, mag: 1.65 },
  { name: "مرفق الثريا (Mirfak)", ra: 3.405, dec: 49.861, mag: 1.79 },
  { name: "نظام (Alnilam)", ra: 5.604, dec: -1.202, mag: 1.69 },
  { name: "النطاق (Alnitak)", ra: 5.679, dec: -1.943, mag: 1.74 },
  { name: "منطقة (Mintaka)", ra: 5.533, dec: -0.299, mag: 2.23 },
  { name: "خنصر (Alphard)", ra: 9.46, dec: -8.659, mag: 1.98 },
  { name: "سراطین (Alpheratz)", ra: 0.14, dec: 29.091, mag: 2.07 },
  { name: "رأس الحمل (Hamal)", ra: 2.12, dec: 23.462, mag: 2.0 },
  { name: "جدی (Polaris)", ra: 2.53, dec: 89.264, mag: 1.98 },
  { name: "المشاه (Mirach)", ra: 1.162, dec: 35.62, mag: 2.05 },
  { name: "الغول (Algol)", ra: 3.136, dec: 40.956, mag: 2.09 },
  { name: "مئزر (Mizar)", ra: 13.399, dec: 54.925, mag: 2.06 },
  { name: "قائد بنات نعش (Alkaid)", ra: 13.792, dec: 49.313, mag: 1.86 },
  { name: "كوكب الشمالي (Kochab)", ra: 14.845, dec: 74.156, mag: 2.08 },
  { name: "رکبة (Ruchbah)", ra: 0.945, dec: 60.717, mag: 2.27 },
  { name: "كاف (Caph)", ra: 0.153, dec: 59.15, mag: 2.4 },
  { name: "شعدات (Schedir)", ra: 0.675, dec: 56.537, mag: 2.24 },
  { name: "منخر (Diphda)", ra: 0.727, dec: -17.987, mag: 2.04 },
  { name: "فكة (Alphecca)", ra: 15.578, dec: 26.715, mag: 2.22 },
  { name: "رأس الحاوي (Rasalhague)", ra: 17.582, dec: 12.561, mag: 2.07 },
  { name: "صدر (Sadr)", ra: 20.371, dec: 40.257, mag: 2.2 },
  { name: "المعلق (Almach)", ra: 2.065, dec: 42.33, mag: 2.1 },
  { name: "الشولة (Shaula)", ra: 17.56, dec: -37.104, mag: 1.62 },
  { name: "کوس الجنوبي (Kaus Australis)", ra: 18.403, dec: -34.385, mag: 1.85 },
  { name: "النون (Nunki)", ra: 18.921, dec: -26.297, mag: 2.05 },
  { name: "انف (Enif)", ra: 21.736, dec: 9.875, mag: 2.38 },
  { name: "مركب (Markab)", ra: 23.079, dec: 15.205, mag: 2.48 },
  { name: "منكب الفرص (Scheat)", ra: 23.063, dec: 28.083, mag: 2.42 },
  { name: "الهناة (Alhena)", ra: 6.629, dec: 16.399, mag: 1.93 },
  { name: "سايف (Saiph)", ra: 5.796, dec: -9.67, mag: 2.09 },
];

export const DEFAULT_LOCATION = { lat: 35.6892, lon: 51.389, label: "تهران" };

const RAD = Math.PI / 180;

/** تاریخ ژولینی از timestamp (ms) */
export function julianDate(nowMs: number): number {
  return nowMs / 86400000 + 2440587.5;
}

/** ساعت نجومی محلی بر حسب درجه (۰..۳۶۰) */
export function localSiderealDeg(nowMs: number, lonDeg: number): number {
  const jd = julianDate(nowMs);
  // زمان نجومی گرینویچ تقریبی (ساعت)
  let gmst = 18.697374558 + 24.06570982441908 * (jd - 2451545.0);
  gmst = ((gmst % 24) + 24) % 24;
  let lst = gmst + lonDeg / 15;
  lst = ((lst / 24) % 1) * 24;
  return lst * 15;
}

/**
 * سمت (az) و فراز (alt) یک ستاره برای ناظر در عرض جغرافیایی `latDeg`
 * و لحظه‌ی `nowMs` و طول جغرافیایی `lonDeg`.
 * az از شمال، در جهت عقربه‌های ساعت: شمال=۰، شرق=۹۰، جنوب=۱۸۰، غرب=۲۷۰.
 */
export function altAz(raHours: number, decDeg: number, nowMs: number, latDeg: number, lonDeg: number): { alt: number; az: number } {
  const lst = localSiderealDeg(nowMs, lonDeg);
  let hdeg = lst - raHours * 15; // زاویه‌ی ساعتی (درجه)
  hdeg = ((hdeg % 360) + 540) % 360 - 180;
  const h = hdeg * RAD;
  const lat = latDeg * RAD;
  const dec = decDeg * RAD;
  const sinAlt = Math.sin(dec) * Math.sin(lat) + Math.cos(dec) * Math.cos(lat) * Math.cos(h);
  const alt = Math.asin(Math.max(-1, Math.min(1, sinAlt)));
  // سمت از جنوب، بعد +۱۸۰ تا از شمال شود (فرمول استاندارد Duffett-Smith)
  let az = Math.atan2(Math.sin(h), Math.cos(h) * Math.sin(lat) - Math.tan(dec) * Math.cos(lat)) / RAD + 180;
  az = ((az % 360) + 360) % 360;
  return { alt: alt / RAD, az };
}

export interface VisibleStar extends SkyStar {
  alt: number;
  az: number;
  /** اندازه‌ی نمایشی (از قدر) — پیکسل */
  size: number;
}

/** ستاره‌های بالای افق برای نمایش */
export function visibleStars(nowMs: number, latDeg: number, lonDeg: number, magLimit = 2.6): VisibleStar[] {
  const out: VisibleStar[] = [];
  for (const s of BRIGHT_STARS) {
    if (s.mag > magLimit) continue;
    const { alt, az } = altAz(s.ra, s.dec, nowMs, latDeg, lonDeg);
    if (alt <= 0) continue;
    const size = Math.max(0.9, 3.2 - s.mag * 0.9);
    out.push({ ...s, alt, az, size });
  }
  return out;
}

export type MoonPhaseName = "ماه نو" | "هلال اول" | "تربیع اول" | "کوژ برون" | "بدر" | "کوژ درون" | "تربیع آخر" | "هلال پایانی";

export interface MoonPhase {
  /** ۰..۱ — ۰=ماه نو، ۰٫۵=بدر */
  phase: number;
  ageDays: number;
  name: MoonPhaseName;
  emoji: string;
}

/** فاز تقریبی ماه از روی مبنای ماهِ نوِ ۶ ژانویه ۲۰۰۰ (دوره‌ی ۲۹٫۵۳ روز) */
export function moonPhase(nowMs: number): MoonPhase {
  const knownNew = Date.UTC(2000, 0, 6, 18, 14);
  const synodic = 29.530588853;
  const age = (((nowMs - knownNew) / 86400000) % synodic + synodic) % synodic;
  const phase = age / synodic;
  const idx = Math.floor(phase * 8 + 0.5) % 8;
  const names: MoonPhaseName[] = ["ماه نو", "هلال اول", "تربیع اول", "کوژ برون", "بدر", "کوژ درون", "تربیع آخر", "هلال پایانی"];
  const emojis = ["🌑", "🌒", "🌓", "🌔", "🌕", "🌖", "🌗", "🌘"];
  return { phase, ageDays: Math.round(age * 10) / 10, name: names[idx], emoji: emojis[idx] };
}
