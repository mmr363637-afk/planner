// ===== Domain model (equivalent of Room entities) =====

export type Priority = "low" | "medium" | "high";
export type Difficulty = 1 | 2 | 3; // آسان / متوسط / سخت
export type LearningStatus = "not_started" | "learning" | "needs_review" | "mastered";
export type TaskStatus = "pending" | "done" | "skipped";
export type ReviewStatus = "pending" | "done";
/** 0 = تقریباً یاد نگرفتم, 1 = نیاز به مرور, 2 = نسبتاً خوب, 3 = کامل */
export type Rating = 0 | 1 | 2 | 3;
export type SessionMode = "free" | "pomodoro";
export type PomodoroPhase = "work" | "short" | "long";

export interface Subject {
  id: string;
  name: string;
  color: string;
  priority: Priority;
  createdAt: number;
}

export interface Topic {
  id: string;
  subjectId: string;
  name: string;
  description?: string;
  volume: number; // pages / units
  estimatedMinutes: number;
  priority: Priority;
  difficulty: Difficulty;
  status: LearningStatus;
  createdAt: number;
}

export interface StudyPlan {
  id: string;
  goal: string;
  startDate: string; // ISO yyyy-mm-dd (local)
  endDate: string;
  topicIds: string[];
  studyDays: number[]; // JS weekday 0..6 (0 = Sunday)
  dailyMinutes: number;
  createdAt: number;
  archived: boolean;
}

export interface StudyTask {
  id: string;
  planId?: string;
  topicId: string;
  date: string; // ISO yyyy-mm-dd
  plannedMinutes: number;
  doneMinutes: number;
  status: TaskStatus;
  order: number;
  priority: Priority;
}

export interface StudySession {
  id: string;
  topicId: string;
  taskId?: string;
  startedAt: number;
  endedAt: number;
  durationMinutes: number;
  rating: Rating | null;
  mode: SessionMode;
  date: string;
}

export interface Review {
  id: string;
  topicId: string;
  dueDate: string;
  reviewNumber: number; // 1-based
  stage: number; // index into interval table
  intervalDays: number;
  status: ReviewStatus;
  completedAt?: number;
  rating?: Rating;
}

/** An exam the student marks on the calendar (independent of study plans/topics). */
export interface Exam {
  id: string;
  title: string;
  date: string; // ISO yyyy-mm-dd (local)
  subject?: string; // optional lesson/course the exam belongs to
  note?: string;
  color?: string; // marker color
  createdAt: number;
}

export interface Achievement {
  id: string;
  unlockedAt: number;
}

export interface PomodoroSettings {
  work: number;
  shortBreak: number;
  longBreak: number;
  cycles: number;
}

export interface NotificationSettings {
  enabled: boolean;
  studyStart: boolean;
  reviewsToday: boolean;
  overdueReviews: boolean;
  dailyPlan: boolean;
  breakEnd: boolean;
  examReminder: boolean;
  dailyReminderTime: string; // HH:mm
}

export interface UserSettings {
  theme: "light" | "dark" | "system";
  language: "fa";
  pomodoro: PomodoroSettings;
  reviewIntervals: number[];
  notifications: NotificationSettings;
  dayStart: string; // HH:mm
  dayEnd: string;
  xp: number;
  onboarded: boolean;
}

/** Active timer state – persisted so the timer survives navigation / reloads */
export interface ActiveSession {
  topicId: string;
  taskId?: string;
  mode: SessionMode;
  phase: PomodoroPhase;
  cycle: number; // completed work cycles
  running: boolean;
  startedAt: number | null; // timestamp when last resumed
  accumulatedMs: number; // ms accumulated in the current phase while paused
  totalStudyMs: number; // total study ms over the whole session (excl. breaks)
  sessionStartedAt: number;
}

export interface AppState {
  subjects: Subject[];
  topics: Topic[];
  plans: StudyPlan[];
  tasks: StudyTask[];
  sessions: StudySession[];
  reviews: Review[];
  achievements: Achievement[];
  exams: Exam[];
  settings: UserSettings;
  activeSession: ActiveSession | null;
}

export const DEFAULT_SETTINGS: UserSettings = {
  theme: "system",
  language: "fa",
  pomodoro: { work: 25, shortBreak: 5, longBreak: 15, cycles: 4 },
  reviewIntervals: [1, 3, 7, 14, 30],
  notifications: {
    enabled: false,
    studyStart: true,
    reviewsToday: true,
    overdueReviews: true,
    dailyPlan: true,
    breakEnd: true,
    examReminder: true,
    dailyReminderTime: "08:00",
  },
  dayStart: "07:00",
  dayEnd: "23:00",
  xp: 0,
  onboarded: false,
};

export const PRIORITY_LABEL: Record<Priority, string> = {
  low: "کم",
  medium: "متوسط",
  high: "زیاد",
};

export const DIFFICULTY_LABEL: Record<Difficulty, string> = {
  1: "آسان",
  2: "متوسط",
  3: "سخت",
};

export const STATUS_LABEL: Record<LearningStatus, string> = {
  not_started: "شروع نشده",
  learning: "در حال یادگیری",
  needs_review: "نیاز به مرور",
  mastered: "یاد گرفته‌ام",
};

export const RATING_LABEL: Record<Rating, string> = {
  3: "کامل یاد گرفتم",
  2: "نسبتاً خوب",
  1: "نیاز به مرور دارم",
  0: "تقریباً یاد نگرفتم",
};

export const SUBJECT_COLORS = [
  "#0ea5a4",
  "#6366f1",
  "#f59e0b",
  "#ef4444",
  "#8b5cf6",
  "#10b981",
  "#ec4899",
  "#3b82f6",
  "#f97316",
  "#14b8a6",
];
