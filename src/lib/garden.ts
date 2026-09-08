// ===== باغ مجازی — گیمیفیکیشنِ بصریِ مبتنی بر مجموع زمان مطالعه =====
// هرچه بیشتر مطالعه کنی، باغ رشد می‌کند. گل‌ها هم از روی مباحثِ تسلط‌یافته باز می‌شوند.
// منطقِ مرحله‌ها تابع خالص است تا در تست و چاپ قابل اتکا بماند.

export interface GardenStageInfo {
  level: number;
  label: string;
  icon: string;
  /** از این مجموعِ دقایق باز می‌شود */
  fromMinutes: number;
  /** مرحله‌ی بعد از این مجموع (null = آخرین مرحله) */
  toMinutes: number | null;
}

export const GARDEN_STAGES: GardenStageInfo[] = [
  { level: 0, label: "خاکِ آماده", icon: "🟫", fromMinutes: 0, toMinutes: 60 },
  { level: 1, label: "جوانه", icon: "🌱", fromMinutes: 60, toMinutes: 300 },
  { level: 2, label: "نهال", icon: "🌿", fromMinutes: 300, toMinutes: 1200 },
  { level: 3, label: "درختچه", icon: "🪴", fromMinutes: 1200, toMinutes: 3600 },
  { level: 4, label: "درخت", icon: "🌳", fromMinutes: 3600, toMinutes: 12000 },
  { level: 5, label: "درختِ پرشاخه", icon: "🌲", fromMinutes: 12000, toMinutes: 30000 },
  { level: 6, label: "باغِ بزرگ", icon: "🌷", fromMinutes: 30000, toMinutes: null },
];

export interface GardenProgress {
  stage: GardenStageInfo;
  /** پیشرفت درونِ مرحله‌ی فعلی (۰ تا ۱) — ۱ یعنی آماده‌ی مرحله‌ی بعد */
  inStage: number;
  /** درصد پیشرفتِ کلی باغ تا آخرین مرحله */
  overall: number;
}

/** مرحله‌ی باغ را از روی مجموع دقایق مطالعه برمی‌گرداند */
export function gardenProgress(totalMinutes: number): GardenProgress {
  const total = Math.max(0, totalMinutes);
  let idx = 0;
  for (let i = 0; i < GARDEN_STAGES.length; i++) {
    if (total >= GARDEN_STAGES[i].fromMinutes) idx = i;
  }
  const stage = GARDEN_STAGES[idx];
  const span = stage.toMinutes == null ? 1 : stage.toMinutes - stage.fromMinutes;
  const inStage = stage.toMinutes == null ? 1 : Math.min(1, (total - stage.fromMinutes) / span);
  const last = GARDEN_STAGES[GARDEN_STAGES.length - 1].fromMinutes;
  const overall = Math.min(1, total / last);
  return { stage, inStage, overall };
}

/** چقدر گل روی چمن باز می‌شود: به ازای هر مبحثِ تسلط‌یافته یک گل (حداکثر جای موجود) */
export function gardenFlowers(masteredCount: number): number {
  return Math.max(0, Math.min(FLOWER_SPOTS.length, Math.floor(masteredCount)));
}

/** جایِ ثابتِ گل‌ها روی چمن (مختصات از ۰ تا ۱۰۰ در هر محورِ SVG تا رندر قطعی بماند) */
export const FLOWER_SPOTS: { x: number; y: number }[] = [
  { x: 16, y: 88 }, { x: 30, y: 92 }, { x: 46, y: 86 }, { x: 60, y: 90 },
  { x: 74, y: 85 }, { x: 86, y: 91 }, { x: 24, y: 80 }, { x: 38, y: 82 },
  { x: 52, y: 93 }, { x: 66, y: 96 }, { x: 80, y: 96 }, { x: 12, y: 95 },
  { x: 68, y: 78 }, { x: 90, y: 82 },
];
