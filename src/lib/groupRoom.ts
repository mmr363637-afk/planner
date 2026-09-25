// ===== 🤝 اتاق مطالعه‌ی گروهی (حالت ابریِ اختیاری) =====
// اتاق دونفره‌ی موجود (WebRTC + کد دعوت) کاملاً آفلاین/P2P است و دست‌نخورده می‌ماند.
// این ماژول یک حالتِ «لابی ابری» اضافه می‌کند برای وقتی که سینک Supabase وصل است:
// کانال Realtime با broadcast (وضعیت تایمر) و presence (اعضای آنلاین).
// بدون Supabase → حالت گروهی در UI غیرفعال است و پیام راهنما می‌دهد؛ یعنی
// تجربه‌ی آفلاین هرگز به آنلاین وابسته نمی‌شود.

export interface RoomTick {
  type: "tick";
  name: string;
  running: boolean;
  elapsedMinutes: number;
  topicName: string | null;
  at: number;
}

export interface RoomCheer {
  type: "cheer";
  name: string;
  emoji: string;
  at: number;
}

export type RoomMessage = RoomTick | RoomCheer;

export const CHEERS = ["🔥", "💪", "👏", "🌟", "☕", "🍅"] as const;

/** کد اتاق: ۴ تا ۲۴ کاراکتر قابل‌چاپ؛ نرمال‌سازی برای اینکه دو نفر یک کد را یکسان بسازند */
export function normalizeRoomCode(raw: string): string | null {
  const code = raw.trim().toUpperCase().replace(/[^A-Z0-9\u0621-\u064A]/g, "").slice(0, 24);
  return code.length >= 4 ? code : null;
}

export function randomRoomCode(len = 6): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // بدون I/O/0/1 — خوانا در پیام‌رسان
  const bytes = new Uint8Array(len);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join("");
}

export function channelName(code: string): string {
  return `study-room:${normalizeRoomCode(code) ?? code}`;
}

/** اعتبارسنجی پیام‌های ورودی کانال — هر چیز ناشناخته دور ریخته می‌شود */
export function parseRoomMessage(raw: unknown): RoomMessage | null {
  if (!raw || typeof raw !== "object") return null;
  const m = raw as Partial<RoomMessage> & Record<string, unknown>;
  const name = typeof m.name === "string" ? m.name.trim().slice(0, 24) : "";
  if (!name) return null;
  if (m.type === "tick") {
    if (typeof m.running !== "boolean" || typeof m.elapsedMinutes !== "number" || !Number.isFinite(m.elapsedMinutes)) return null;
    return {
      type: "tick",
      name,
      running: m.running,
      elapsedMinutes: Math.max(0, Math.min(24 * 60, m.elapsedMinutes)),
      topicName: typeof m.topicName === "string" ? m.topicName.slice(0, 60) : null,
      at: typeof m.at === "number" ? m.at : Date.now(),
    };
  }
  if (m.type === "cheer") {
    const emoji = typeof m.emoji === "string" && (CHEERS as readonly string[]).includes(m.emoji) ? m.emoji : "🔥";
    return { type: "cheer", name, emoji, at: typeof m.at === "number" ? m.at : Date.now() };
  }
  return null;
}

export interface RoomMember {
  name: string;
  running: boolean;
  elapsedMinutes: number;
  topicName: string | null;
  lastSeen: number;
}

/** ادغام پیام‌های دریافتی در فهرست اعضا — تازه‌ترین tick هر عضو برنده است */
export function mergeMember(list: RoomMember[], msg: RoomTick, now: number = Date.now()): RoomMember[] {
  const rest = list.filter((m) => m.name !== msg.name);
  return [...rest, { name: msg.name, running: msg.running, elapsedMinutes: msg.elapsedMinutes, topicName: msg.topicName, lastSeen: now }];
}

/** اعضای ساکت‌تر از ttl (پیش‌فرض ۹۰ ثانیه) از فهرست حذف می‌شوند */
export function pruneMembers(list: RoomMember[], now: number = Date.now(), ttl = 90_000): RoomMember[] {
  return list.filter((m) => now - m.lastSeen <= ttl);
}
