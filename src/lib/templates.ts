// ===== قالب‌های هدف برای شروع سریع (آنبوردینگ) =====
// هر قالب: چند درس با مباحث واقعی، مدل مطالعاتی پیشنهادی و ساعت روزانه.
// کاربر با یک تپ، کتابخانه‌اش را می‌سازد و بعد با «برنامه هوشمند» ادامه می‌دهد.
import type { Difficulty, Priority, StudyApproach } from "../types";

export interface TemplateTopic {
  name: string;
  estimatedMinutes: number;
  difficulty: Difficulty;
  priority: Priority;
}

export interface TemplateSubject {
  name: string;
  color: string;
  priority: Priority;
  approach: StudyApproach;
  topics: TemplateTopic[];
}

export interface GoalTemplate {
  id: string;
  title: string;
  icon: string;
  desc: string;
  dailyMinutes: number;
  /** اگر true باشد به‌جای قالب، «دروس نمونه پزشکی» ایمپورت می‌شود */
  useSampleData?: boolean;
  subjects: TemplateSubject[];
}

export const GOAL_TEMPLATES: GoalTemplate[] = [
  {
    id: "konkoor",
    title: "کنکور تجربی",
    icon: "🎓",
    desc: "زیست، شیمی، فیزیک، ریاضی و زمین — تست‌محور",
    dailyMinutes: 360,
    subjects: [
      {
        name: "زیست‌شناسی", color: "#10b981", priority: "high", approach: "qbank",
        topics: [
          { name: "گوارش و جذب", estimatedMinutes: 180, difficulty: 2, priority: "high" },
          { name: "گردش مواد", estimatedMinutes: 150, difficulty: 2, priority: "high" },
          { name: "تنظیم عصبی و هورمونی", estimatedMinutes: 240, difficulty: 3, priority: "high" },
          { name: "ایمنی", estimatedMinutes: 120, difficulty: 2, priority: "medium" },
          { name: "تولیدمثل و رشد گیاهان", estimatedMinutes: 150, difficulty: 2, priority: "medium" },
          { name: "ژنتیک و خالص‌سازی", estimatedMinutes: 200, difficulty: 3, priority: "high" },
        ],
      },
      {
        name: "شیمی", color: "#8b5cf6", priority: "high", approach: "qbank",
        topics: [
          { name: "استوکیومتری", estimatedMinutes: 240, difficulty: 3, priority: "high" },
          { name: "اسید و باز", estimatedMinutes: 180, difficulty: 2, priority: "high" },
          { name: "الکتروشیمی", estimatedMinutes: 150, difficulty: 3, priority: "medium" },
          { name: "شیمی آلی (هیدروکربن‌ها)", estimatedMinutes: 220, difficulty: 3, priority: "high" },
        ],
      },
      {
        name: "فیزیک", color: "#3b82f6", priority: "high", approach: "qbank",
        topics: [
          { name: "حرکت‌شناسی و دینامیک", estimatedMinutes: 260, difficulty: 3, priority: "high" },
          { name: "کار و انرژی", estimatedMinutes: 150, difficulty: 2, priority: "high" },
          { name: "الکتریسیته ساکن و جاری", estimatedMinutes: 200, difficulty: 3, priority: "medium" },
          { name: "مغناطیس و القا", estimatedMinutes: 150, difficulty: 2, priority: "medium" },
        ],
      },
      {
        name: "ریاضی", color: "#f59e0b", priority: "medium", approach: "qbank",
        topics: [
          { name: "تابع", estimatedMinutes: 200, difficulty: 3, priority: "high" },
          { name: "حد و پیوستگی", estimatedMinutes: 150, difficulty: 2, priority: "high" },
          { name: "مشتق و کاربردها", estimatedMinutes: 220, difficulty: 3, priority: "high" },
          { name: "مثلثات", estimatedMinutes: 150, difficulty: 2, priority: "medium" },
        ],
      },
      {
        name: "زمین‌شناسی", color: "#a16207", priority: "low", approach: "notes",
        topics: [
          { name: "منابع آب و خاک", estimatedMinutes: 90, difficulty: 1, priority: "medium" },
          { name: "زمین‌ساخت و زمین‌لرزه", estimatedMinutes: 100, difficulty: 2, priority: "medium" },
        ],
      },
    ],
  },
  {
    id: "pezeshki",
    title: "امتحانات پزشکی",
    icon: "🩺",
    desc: "۱۳ درس نمونه (قلب، ریه، گوارش…) با ۲۹۷ مبحث آماده",
    dailyMinutes: 240,
    useSampleData: true,
    subjects: [],
  },
  {
    id: "zaban",
    title: "زبان انگلیسی",
    icon: "🌍",
    desc: "لغت، گرامر، ریدینگ و لیسنینگ — جزوه و مرورمحور",
    dailyMinutes: 120,
    subjects: [
      {
        name: "لغت (504 + 1100)", color: "#ec4899", priority: "high", approach: "notes",
        topics: [
          { name: "درس ۱ تا ۱۰ کتاب ۵۰۴", estimatedMinutes: 180, difficulty: 1, priority: "high" },
          { name: "درس ۱۱ تا ۲۰ کتاب ۵۰۴", estimatedMinutes: 180, difficulty: 1, priority: "high" },
          { name: "درس ۲۱ تا ۳۰ کتاب ۵۰۴", estimatedMinutes: 180, difficulty: 2, priority: "medium" },
          { name: "۱۱۰۰ واژه — بخش اول", estimatedMinutes: 200, difficulty: 2, priority: "medium" },
        ],
      },
      {
        name: "گرامر", color: "#6366f1", priority: "high", approach: "qbank",
        topics: [
          { name: "زمان‌ها (Tenses)", estimatedMinutes: 200, difficulty: 2, priority: "high" },
          { name: "جملات شرطی", estimatedMinutes: 120, difficulty: 2, priority: "high" },
          { name: "مجهول و نقل‌قول", estimatedMinutes: 120, difficulty: 2, priority: "medium" },
        ],
      },
      {
        name: "ریدینگ", color: "#0ea5a4", priority: "medium", approach: "mixed",
        topics: [
          { name: "تکنیک اسکیم و اسکن", estimatedMinutes: 90, difficulty: 1, priority: "high" },
          { name: "۱۰ متن تمرینی سطح متوسط", estimatedMinutes: 300, difficulty: 2, priority: "medium" },
        ],
      },
      {
        name: "لیسنینگ", color: "#f97316", priority: "medium", approach: "mixed",
        topics: [
          { name: "پادکست روزانه (۶ دقیقه‌ای)", estimatedMinutes: 180, difficulty: 1, priority: "high" },
          { name: "تکنیک سایه (Shadowing)", estimatedMinutes: 120, difficulty: 2, priority: "medium" },
        ],
      },
    ],
  },
  {
    id: "azad",
    title: "برنامه آزاد",
    icon: "🌱",
    desc: "از صفر شروع می‌کنم؛ درس‌های خودم را می‌سازم",
    dailyMinutes: 120,
    subjects: [],
  },
];
