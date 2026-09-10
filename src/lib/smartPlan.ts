// ===== موتور برنامه‌ریزی هوشمند — خالص و تست‌پذیر =====
// برخلاف موتور کلاسیک (توزیع خطی دقیقه‌ها)، این موتور:
//  ۱. از «روز امتحان» به عقب برمی‌گردد و چند روز آخر را برای جمع‌بندی نگه می‌دارد
//  ۲. هر مبحث را بر اساس «مدل مطالعاتی» درسش به فاز می‌شکند (یادگیری/تست/مرور/خلاصه)
//  ۳. مرورهای خودکارِ فاصله‌دار (۱ و ۴ روز بعد) برای هر یادگیری می‌گذارد
//  ۴. ظرفیت هر روز را با «جدول کلاس‌ها» کم می‌کند تا روزِ شلوغ، خفه نشود
//  ۵. هر روز را متنوع می‌چیند (سقف ۳ درس) و مباحث سخت را اول می‌گذارد (پنجره‌ی طلایی)
import type { ClassBlock, Priority, StudyApproach, StudyTask, Subject, TaskKind, Topic } from "../types";
import { APPROACH_LABEL } from "../types";
import { addDays, diffDays, weekdayOf } from "./jalali";
import { availableDates, defaultId, effectiveMinutes, MIN_CHUNK } from "./planner";

export interface SmartPlanInput {
  planId: string;
  topics: Topic[]; // مباحث برگِ انتخاب‌شده
  subjects: Subject[];
  startDate: string;
  endDate: string;
  /** تاریخ امتحان (اختیاری) — اگر باشد، برنامه‌ریزی عقب‌گرد از روز قبلش انجام می‌شود */
  examDate?: string;
  studyDays: number[];
  dailyMinutes: number;
  classBlocks?: ClassBlock[];
  /** فاصله‌های مرور خودکار به روز — پیش‌فرض [1, 4] */
  reviewGaps?: number[];
  /** روزهای جمع‌بندی آخر — اگر null باشد خودکار (حدود ۱۲٪ بازه، حداکثر ۵ روز) */
  bufferDays?: number | null;
  /** مباحث سخت اولِ هر روز (پنجره‌ی طلایی) — پیش‌فرض true */
  goldenFirst?: boolean;
  /** سقف تعداد درس در هر روز — پیش‌فرض ۳ */
  maxSubjectsPerDay?: number;
  /** دقایقِ انجام‌شده‌ی قبلی هر مبحث (برای تنظیم مجدد) */
  doneMinutesByTopic?: Record<string, number>;
  /** مدل مطالعاتی هر درس — اگر نباشد از خودِ درس خوانده می‌شود */
  approaches?: Record<string, StudyApproach>;
  idFactory?: () => string;
}

export interface SmartPlanResult {
  tasks: StudyTask[];
  dates: string[];
  bufferDates: string[];
  totalNeeded: number;
  totalCapacity: number;
  scale: number;
  /** دقیقه بر اساس نوع فعالیت */
  minutesByKind: Record<TaskKind, number>;
  /** چرا این‌طور چیده شد؟ — برای نمایش به کاربر */
  notes: string[];
  /** هشدارها (فشردگی، روزهای پُربار…) */
  warnings: string[];
  /** تعداد روزهایی که کمی از ظرفیت رد شده (به‌خاطر مرورهای خودکار) */
  overflowDays: number;
}

interface Phase {
  topic: Topic;
  subjectId: string;
  kind: TaskKind;
  label: string;
  minutes: number;
  difficulty: number;
  priority: Priority;
}

// سهم هر فاز از زمان مبحث، بر اساس مدل مطالعاتی درس
const APPROACH_PHASES: Record<StudyApproach, { kind: TaskKind; share: number; label: string }[]> = {
  qbank: [
    { kind: "learn", share: 0.25, label: "یادگیری فشرده" },
    { kind: "test", share: 0.55, label: "تست آموزشی" },
    { kind: "review", share: 0.2, label: "مرور نکات" },
  ],
  notes: [
    { kind: "learn", share: 0.6, label: "خواندن جزوه" },
    { kind: "summary", share: 0.15, label: "خلاصه‌برداری" },
    { kind: "review", share: 0.25, label: "مرور" },
  ],
  reference: [
    { kind: "learn", share: 0.55, label: "خواندن عمیق" },
    { kind: "summary", share: 0.2, label: "خلاصه‌برداری" },
    { kind: "test", share: 0.25, label: "تست تکمیلی" },
  ],
  mixed: [
    { kind: "learn", share: 0.45, label: "یادگیری" },
    { kind: "test", share: 0.3, label: "تست" },
    { kind: "review", share: 0.25, label: "مرور" },
  ],
};

const MAX_CHUNK = 90; // بزرگ‌ترین تکه‌ی پیوسته‌ی یک مبحث در یک روز
const ROUND_TO = 5;

const PRIORITY_RANK: Record<Priority, number> = { high: 0, medium: 1, low: 2 };

function round5(n: number): number {
  return Math.max(MIN_CHUNK, Math.round(n / ROUND_TO) * ROUND_TO);
}

/** دقایقِ اشغالِ هر روز هفته توسط جدول کلاس‌ها (۰=یکشنبه … ۶=شنبه) */
export function busyMinutesByWeekday(blocks: ClassBlock[] | undefined, dailyMinutes: number): number[] {
  const out = new Array<number>(7).fill(0);
  if (!blocks) return out;
  const cap = Math.floor(dailyMinutes * 0.7);
  for (const b of blocks) {
    if (b.weekday < 0 || b.weekday > 6 || b.endMin <= b.startMin) continue;
    out[b.weekday] += Math.max(0, b.endMin - b.startMin);
  }
  return out.map((m) => Math.min(m, cap));
}

/** روزهای جمع‌بندی خودکار: حدود ۱۲٪ طول بازه، بین ۰ تا ۵ */
export function autoBufferDays(rangeLength: number): number {
  if (rangeLength < 4) return 0;
  if (rangeLength < 8) return 1;
  return Math.max(1, Math.min(5, Math.round(rangeLength * 0.12)));
}

function nextStudyDate(from: string, dates: string[]): string | null {
  for (const d of dates) {
    if (d >= from) return d;
  }
  return null;
}

export function generateSmartPlan(input: SmartPlanInput): SmartPlanResult {
  const id = input.idFactory ?? defaultId;
  const gaps = (input.reviewGaps ?? [1, 4]).filter((g) => g > 0).slice(0, 3);
  const goldenFirst = input.goldenFirst ?? true;
  const maxSubjects = Math.max(1, Math.min(6, input.maxSubjectsPerDay ?? 3));
  const approaches = input.approaches ?? {};
  const done = input.doneMinutesByTopic ?? {};

  const empty: SmartPlanResult = {
    tasks: [], dates: [], bufferDates: [], totalNeeded: 0, totalCapacity: 0, scale: 1,
    minutesByKind: { learn: 0, test: 0, review: 0, summary: 0 }, notes: [], warnings: [], overflowDays: 0,
  };

  // ۱) بازه: اگر امتحان مشخص است، روز امتحان (و بعدش) از برنامه بیرون است
  let end = input.endDate;
  if (input.examDate && input.examDate <= end) end = addDays(input.examDate, -1);
  const allDates = availableDates(input.startDate, end, input.studyDays);
  if (allDates.length === 0 || input.dailyMinutes <= 0 || input.topics.length === 0) {
    if (allDates.length === 0) empty.warnings.push("در این بازه هیچ روز مطالعه‌ای نیست؛ تاریخ‌ها یا روزهای هفته را عوض کن.");
    if (input.topics.length === 0) empty.warnings.push("مبحثی انتخاب نشده است.");
    return empty;
  }

  // ۲) روزهای جمع‌بندی از انتهای بازه جدا می‌شوند
  const rangeLen = diffDays(input.startDate, end) + 1;
  const bufCount = Math.min(allDates.length - 1, Math.max(0, input.bufferDays ?? autoBufferDays(rangeLen)));
  const bufferDates = allDates.slice(Math.max(0, allDates.length - bufCount));
  const learnDates = allDates.slice(0, Math.max(1, allDates.length - bufCount));

  // ۳) ظرفیت روزانه با کم‌کردنِ کلاس‌های ثابت
  const busy = busyMinutesByWeekday(input.classBlocks, input.dailyMinutes);
  const capacityOf = (d: string) => Math.max(0, input.dailyMinutes - busy[weekdayOf(d)]);
  const usableDates = learnDates.filter((d) => capacityOf(d) >= MIN_CHUNK);
  const usableBuffer = bufferDates.filter((d) => capacityOf(d) >= MIN_CHUNK);
  if (usableDates.length === 0) {
    empty.warnings.push("با این جدول کلاس‌ها هیچ روز خالیِ کافی برای یادگیری نمانده؛ ساعت روزانه را بیشتر کن.");
    return { ...empty, dates: allDates, bufferDates };
  }

  // ۴) ساخت فازها از روی مدل هر درس
  const subjectById = new Map(input.subjects.map((s) => [s.id, s]));
  const phases: Phase[] = [];
  const approachUsed = new Set<StudyApproach>();
  for (const t of input.topics) {
    const subj = subjectById.get(t.subjectId);
    const approach: StudyApproach = approaches[t.subjectId] ?? subj?.approach ?? "mixed";
    approachUsed.add(approach);
    const total = Math.max(0, effectiveMinutes(t) - (done[t.id] ?? 0));
    if (total <= 0) continue;
    const template = APPROACH_PHASES[approach];
    if (total < 40) {
      // مبحث خیلی کوچک: یک فاز یادگیری کافی است تا برنامه خُرد نشود
      phases.push({ topic: t, subjectId: t.subjectId, kind: "learn", label: template[0].label, minutes: round5(total), difficulty: t.difficulty, priority: t.priority });
      continue;
    }
    let assigned = 0;
    const parts = template.map((p, i) => {
      const m = i === template.length - 1 ? total - assigned : Math.round(total * p.share);
      assigned += m;
      return { kind: p.kind, label: p.label, minutes: m };
    });
    for (const p of parts) {
      if (p.minutes < MIN_CHUNK) {
        // فاز ریز را به یادگیری همان مبحث برمی‌گردانیم
        const learn = parts.find((x) => x.kind === "learn") ?? parts[0];
        if (p !== learn) {
          learn.minutes += p.minutes;
          p.minutes = 0;
        }
      }
    }
    for (const p of parts) {
      if (p.minutes > 0) phases.push({ topic: t, subjectId: t.subjectId, kind: p.kind, label: p.label, minutes: round5(p.minutes), difficulty: t.difficulty, priority: t.priority });
    }
  }

  if (phases.length === 0) {
    empty.warnings.push("همه‌ی مباحث انتخاب‌شده قبلاً پوشش داده شده‌اند.");
    return { ...empty, dates: allDates, bufferDates };
  }

  // ترتیب کلی: اولویت درس، بعد ترتیب مباحث درس (پایه‌ها اول)، بعد اولویت مبحث
  const subjectRank = (sid: string) => PRIORITY_RANK[subjectById.get(sid)?.priority ?? "medium"];
  phases.sort((a, b) =>
    subjectRank(a.subjectId) - subjectRank(b.subjectId) ||
    a.topic.createdAt - b.topic.createdAt ||
    PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority],
  );

  const totalNeeded = phases.reduce((s, p) => s + p.minutes, 0);
  const totalCapacity = usableDates.reduce((s, d) => s + capacityOf(d), 0) + usableBuffer.reduce((s, d) => s + Math.floor(capacityOf(d) / 2), 0);
  const scale = totalNeeded > totalCapacity && totalCapacity > 0 ? totalCapacity / totalNeeded : 1;
  if (scale < 1) {
    for (const p of phases) p.minutes = round5(p.minutes * scale);
  }

  // ۵) پخش فازها روی روزها — با سقفِ «تعداد درس در روز» برای تنوع
  const tasks: StudyTask[] = [];
  const queue = phases.map((p) => ({ ...p, remaining: p.minutes }));
  const learnPlacements: { topicId: string; date: string; minutes: number; subjectId: string }[] = [];
  let order = 0;

  for (const date of usableDates) {
    let dayLeft = capacityOf(date);
    const subjectsToday = new Set<string>();
    order = 0;
    for (const item of queue) {
      if (item.remaining <= 0) continue;
      if (dayLeft < MIN_CHUNK) continue; // جا نیست؛ می‌ماند برای فردا
      const isNewSubject = !subjectsToday.has(item.subjectId);
      if (isNewSubject && subjectsToday.size >= maxSubjects) continue; // سقف درس امروز؛ می‌ماند برای فردا
      let chunk = Math.min(item.remaining, dayLeft, MAX_CHUNK);
      const tail = item.remaining - chunk;
      if (tail > 0 && tail < MIN_CHUNK) {
        if (chunk - MIN_CHUNK >= MIN_CHUNK) chunk -= MIN_CHUNK;
        else if (item.remaining <= dayLeft + MIN_CHUNK) chunk = item.remaining;
      }
      chunk = Math.max(Math.min(MIN_CHUNK, item.remaining), Math.min(chunk, item.remaining));
      tasks.push({
        id: id(), planId: input.planId, topicId: item.topic.id, date,
        plannedMinutes: chunk, doneMinutes: 0, status: "pending",
        order: order++, priority: item.topic.priority, kind: item.kind, label: item.label,
      });
      if (item.kind === "learn") learnPlacements.push({ topicId: item.topic.id, date, minutes: chunk, subjectId: item.subjectId });
      item.remaining -= chunk;
      dayLeft -= chunk;
      subjectsToday.add(item.subjectId);
    }
    // آیتم‌های نیمه‌تمام و به‌تعویق‌افتاده، با همان ترتیب می‌مانند برای فردا
    for (let i = queue.length - 1; i >= 0; i--) {
      if (queue[i].remaining <= 0) queue.splice(i, 1);
    }
  }

  // ته‌مانده‌ها (نادر، وقتی فشرده‌سازی کافی نبوده): روی آخرین روز یادگیری
  const lastLearn = usableDates[usableDates.length - 1];
  for (const item of queue) {
    if (item.remaining <= 0) continue;
    tasks.push({
      id: id(), planId: input.planId, topicId: item.topic.id, date: lastLearn,
      plannedMinutes: item.remaining, doneMinutes: 0, status: "pending",
      order: order++, priority: item.topic.priority, kind: item.kind, label: item.label,
    });
    if (item.kind === "learn") learnPlacements.push({ topicId: item.topic.id, date: lastLearn, minutes: item.remaining, subjectId: item.subjectId });
    item.remaining = 0;
  }

  // ۶) مرورهای خودکارِ فاصله‌دار برای هر یادگیری (۱ و ۴ روز بعد)
  const topicById = new Map(input.topics.map((t) => [t.id, t]));
  const reviewSearchSpace = [...usableDates, ...usableBuffer];
  for (const lp of learnPlacements) {
    const topic = topicById.get(lp.topicId);
    if (!topic) continue;
    const minutes = Math.max(10, Math.min(30, Math.round((lp.minutes * 0.3) / 5) * 5));
    for (const gap of gaps) {
      const target = nextStudyDate(addDays(lp.date, gap), reviewSearchSpace);
      if (!target || target <= lp.date) continue;
      tasks.push({
        id: id(), planId: input.planId, topicId: lp.topicId, date: target,
        plannedMinutes: minutes, doneMinutes: 0, status: "pending",
        order: 900 + gap, priority: topic.priority, kind: "review", label: `مرور ${gap} روز بعد`,
      });
    }
  }

  // ۷) روزهای جمع‌بندی: برای پرحجم‌ترین درس‌ها، تسک خلاصه
  const subjectLoad = new Map<string, number>();
  for (const t of tasks) {
    if (t.kind === "review") continue;
    subjectLoad.set(topicById.get(t.topicId)?.subjectId ?? "", (subjectLoad.get(topicById.get(t.topicId)?.subjectId ?? "") ?? 0) + t.plannedMinutes);
  }
  const topSubjects = [...subjectLoad.entries()].filter(([sid]) => sid).sort((a, b) => b[1] - a[1]).slice(0, Math.max(2, maxSubjects)).map(([sid]) => sid);
  // یک مبحثِ نماینده از هر درس برای تسک جمع‌بندی (اولین مبحث همان درس)
  const repTopic = new Map<string, Topic>();
  for (const t of input.topics) {
    if (!repTopic.has(t.subjectId)) repTopic.set(t.subjectId, t);
  }
  for (const date of usableBuffer) {
    const cap = Math.floor(capacityOf(date) * 0.6);
    if (cap < MIN_CHUNK || topSubjects.length === 0) continue;
    const per = Math.max(MIN_CHUNK, Math.floor(cap / Math.min(topSubjects.length, 3) / 5) * 5);
    topSubjects.slice(0, 3).forEach((sid, i) => {
      const rep = repTopic.get(sid);
      if (!rep) return;
      tasks.push({
        id: id(), planId: input.planId, topicId: rep.id, date,
        plannedMinutes: per, doneMinutes: 0, status: "pending",
        order: 950 + i, priority: rep.priority, kind: "summary", label: "جمع‌بندی",
      });
    });
  }

  // ۸) مرتب‌سازی داخل هر روز: سخت‌ها اول (پنجره‌ی طلایی)، بعد یادگیری، بعد تست و مرور
  const KIND_RANK: Record<TaskKind, number> = { learn: 0, test: 1, summary: 2, review: 3 };
  const byDate = new Map<string, StudyTask[]>();
  for (const t of tasks) {
    const list = byDate.get(t.date) ?? [];
    list.push(t);
    byDate.set(t.date, list);
  }
  for (const list of byDate.values()) {
    list.sort((a, b) => {
      const ta = topicById.get(a.topicId);
      const tb = topicById.get(b.topicId);
      if (goldenFirst && ta && tb && ta.difficulty !== tb.difficulty && a.kind === "learn" && b.kind === "learn") {
        return tb.difficulty - ta.difficulty;
      }
      return (KIND_RANK[a.kind ?? "learn"] - KIND_RANK[b.kind ?? "learn"]) || a.order - b.order;
    });
    list.forEach((t, i) => {
      t.order = i;
    });
  }

  // آمار و توضیح‌ها
  const minutesByKind: Record<TaskKind, number> = { learn: 0, test: 0, review: 0, summary: 0 };
  for (const t of tasks) minutesByKind[t.kind ?? "learn"] += t.plannedMinutes;
  let overflowDays = 0;
  for (const d of allDates) {
    const dayTotal = (byDate.get(d) ?? []).reduce((s, t) => s + t.plannedMinutes, 0);
    if (dayTotal > capacityOf(d) + 1 && capacityOf(d) > 0) overflowDays += 1;
  }

  const notes: string[] = [];
  if (input.examDate) notes.push(`🧠 برنامه از روز قبلِ امتحان به عقب چیده شد تا هیچ‌چیز برای دقیقه‌ی نود نماند.`);
  if (bufferDates.length > 0) notes.push(`📦 ${bufferDates.length === 1 ? "یک روز آخر" : `${faNum(bufferDates.length)} روز آخر`} فقط برای جمع‌بندی نگه داشته شد (بدون مطلب جدید).`);
  if (gaps.length > 0) notes.push(`🔁 برای هر یادگیری، مرور خودکارِ ${gaps.map((g) => `${faNum(g)} روز بعد`).join(" و ")} گذاشته شد.`);
  if (goldenFirst) notes.push(`☀️ مباحث سخت، اولِ هر روز چیده شدند تا با انرژیِ تازه (پنجره‌ی طلایی‌ات) خوانده شوند.`);
  notes.push(`🎨 هر روز حداکثر ${faNum(maxSubjects)} درس دارد تا مغزت با تنوع، بهتر یاد بگیرد (یادگیری ترکیبی).`);
  if (busyMinutesByWeekday(input.classBlocks, input.dailyMinutes).some((m) => m > 0)) {
    notes.push(`🗓️ ساعت کلاس‌های هفتگی‌ات از ظرفیت همان روزها کم شد تا روز شلوغ، برنامه‌ی سنگین نگیرد.`);
  }
  for (const a of approachUsed) {
    const count = input.subjects.filter((s) => (approaches[s.id] ?? s.approach ?? "mixed") === a).length;
    if (count > 0) notes.push(`${a === "qbank" ? "🧪" : a === "notes" ? "📝" : a === "reference" ? "📚" : "🎯"} ${count === 1 ? "یک درس" : `${faNum(count)} درس`} با مدل «${APPROACH_LABEL[a]}» برنامه شد.`);
  }

  const warnings: string[] = [];
  if (scale < 0.999) {
    warnings.push(`⚠️ حجم کار از ظرفیت بیشتر بود؛ زمان‌ها به ${faNum(Math.round(scale * 100))}٪ فشرده شدند. ساعت روزانه را بیشتر یا بازه را طولانی‌تر کن.`);
  }
  if (overflowDays > 0) {
    warnings.push(`📌 ${faNum(overflowDays)} روز به‌خاطر مرورهای خودکار کمی پُربار شد؛ مرورها کوتاه‌اند و آگاهانه روی هم سوار شده‌اند.`);
  }

  return { tasks, dates: allDates, bufferDates, totalNeeded, totalCapacity, scale, minutesByKind, notes, warnings, overflowDays };
}

function faNum(n: number): string {
  return n.toLocaleString("fa-IR");
}
