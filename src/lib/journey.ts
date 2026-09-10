// ===== سفر مطالعه — هر ساعت مطالعه، چند کیلومتر سفر =====

export interface JourneyStop {
  city: string;
  /** کیلومتر تجمعی از مبدأ */
  km: number;
  icon: string;
}

/** مسیر سفر (کیلومترهای تقریبی جاده‌ای/هوایی از تهران) */
export const JOURNEY_STOPS: JourneyStop[] = [
  { city: "تهران", km: 0, icon: "🚩" },
  { city: "قم", km: 150, icon: "🕌" },
  { city: "کاشان", km: 350, icon: "🌸" },
  { city: "اصفهان", km: 550, icon: "🌉" },
  { city: "یزد", km: 850, icon: "🏜️" },
  { city: "شیراز", km: 1300, icon: "🍊" },
  { city: "بندرعباس", km: 1900, icon: "⚓" },
  { city: "چابهار", km: 2500, icon: "🌊" },
  { city: "دبی ✈️", km: 3200, icon: "🛫" },
  { city: "استانبول ✈️", km: 4500, icon: "🎈" },
  { city: "پاریس ✈️", km: 6500, icon: "🗼" },
];

/** هر ساعت مطالعه چند کیلومتر جلو می‌برد */
export const KM_PER_HOUR = 25;

export interface JourneyProgress {
  km: number;
  current: JourneyStop;
  next: JourneyStop | null;
  /** پیشرفت بین دو ایستگاه (۰..۱۰۰) */
  pct: number;
  finished: boolean;
}

export function journeyProgress(totalMinutes: number): JourneyProgress {
  const km = Math.floor((Math.max(0, totalMinutes) / 60) * KM_PER_HOUR);
  let current = JOURNEY_STOPS[0];
  let next: JourneyStop | null = null;
  for (let i = 0; i < JOURNEY_STOPS.length; i++) {
    if (km >= JOURNEY_STOPS[i].km) current = JOURNEY_STOPS[i];
    else {
      next = JOURNEY_STOPS[i];
      break;
    }
  }
  if (!next) return { km, current, next: null, pct: 100, finished: true };
  const span = next.km - current.km;
  const pct = span > 0 ? Math.min(100, Math.round(((km - current.km) / span) * 100)) : 100;
  return { km, current, next, pct, finished: false };
}
