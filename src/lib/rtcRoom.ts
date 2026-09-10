// ===== اتاق مطالعه‌ی دونفره — بدون سرور (WebRTC + سیگنالینگ دستی با QR/متن) =====
// نحوه‌ی کار: میزبان یک «کد دعوت» می‌سازد (پیشنهاد WebRTC، فشرده و کدشده) و با QR
// یا پیامک/چت می‌فرستد؛ مهمان با همان کد «کد پاسخ» می‌سازد و برمی‌گرداند؛ اتصال مستقیم
// P2P برقرار می‌شود. داده‌ی اتاق (حضور، تشویق، وضعیت تایمر) فقط بین دو دستگاه ردوبدل می‌شود.
//
// بخش‌های منطقی (کدگذاری سیگنال، ماشین حالت اتاق) آلارم‌محور و تست‌پذیرند؛
// خودِ RTCPeerConnection از طریق factory تزریق می‌شود تا در تست فیک شود.

import { base64UrlToBytes, bytesToBase64Url } from "./qrTransfer";

const PREFIX = "SPLRTC1";

export interface SignalBundle {
  t: "offer" | "answer";
  sdp: string;
  /** نام کاربر برای نمایش در همان سیگنال */
  n: string;
}

// ---------- کدگذاری سیگنال: JSON → (deflate اگر موجود) → base64url ----------

async function pack(obj: unknown): Promise<string> {
  const json = JSON.stringify(obj);
  const CS = (globalThis as { CompressionStream?: typeof CompressionStream }).CompressionStream;
  if (CS) {
    try {
      const buf = await new Response(new Blob([json]).stream().pipeThrough(new CS("deflate-raw"))).arrayBuffer();
      const packed = new Uint8Array(buf);
      if (packed.length < json.length) return "D" + bytesToBase64Url(packed);
    } catch {
      /* بدون فشرده‌سازی */
    }
  }
  return "R" + bytesToBase64Url(new TextEncoder().encode(json));
}

async function unpack(text: string): Promise<unknown> {
  const flag = text[0];
  const body = base64UrlToBytes(text.slice(1));
  if (flag === "D") {
    const DS = (globalThis as { DecompressionStream?: typeof DecompressionStream }).DecompressionStream;
    if (!DS) throw new Error("no-decompressor");
    const json = await new Response(new Blob([body.slice().buffer as ArrayBuffer]).stream().pipeThrough(new DS("deflate-raw"))).text();
    return JSON.parse(json);
  }
  if (flag === "R") return JSON.parse(new TextDecoder().decode(body));
  throw new Error("bad-flag");
}

export async function encodeSignal(bundle: SignalBundle): Promise<string> {
  return `${PREFIX}|${await pack(bundle)}`;
}

export function isSignalCode(text: string): boolean {
  return typeof text === "string" && text.trim().startsWith(PREFIX + "|");
}

export async function decodeSignal(text: string): Promise<SignalBundle> {
  const trimmed = text.trim();
  if (!isSignalCode(trimmed)) throw new Error("not-a-room-code");
  const obj = (await unpack(trimmed.split("|")[1])) as Partial<SignalBundle>;
  if ((obj.t !== "offer" && obj.t !== "answer") || typeof obj.sdp !== "string" || obj.sdp.length < 10) {
    throw new Error("invalid-room-code");
  }
  return { t: obj.t, sdp: obj.sdp, n: typeof obj.n === "string" ? obj.n.slice(0, 30) : "دوستم" };
}

// ---------- لایه‌های مجرد WebRTC برای تست‌پذیری ----------

export interface RTCDataChannelLike {
  readyState: string;
  send(data: string): void;
  close(): void;
  onopen: (() => void) | null;
  onmessage: ((ev: { data: string }) => void) | null;
  onclose: (() => void) | null;
}

export interface RTCSessionDescriptionInitLike {
  type: string;
  sdp: string;
}

export interface RTCPeerConnectionLike {
  createDataChannel(label: string): RTCDataChannelLike;
  createOffer(): Promise<RTCSessionDescriptionInitLike>;
  createAnswer(): Promise<RTCSessionDescriptionInitLike>;
  setLocalDescription(desc: RTCSessionDescriptionInitLike): Promise<void>;
  setRemoteDescription(desc: RTCSessionDescriptionInitLike): Promise<void>;
  readonly localDescription: { sdp?: string | null } | null;
  readonly iceGatheringState: string;
  onicegatheringstatechange: (() => void) | null;
  ondatachannel: ((ev: { channel: RTCDataChannelLike }) => void) | null;
  close(): void;
}

export type PeerFactory = () => RTCPeerConnectionLike;

/** factory واقعی از روی RTCPeerConnection مرورگر */
export function browserPeerFactory(): PeerFactory {
  const Ctor = (globalThis as { RTCPeerConnection?: typeof RTCPeerConnection }).RTCPeerConnection;
  if (!Ctor) throw new Error("rtc-unavailable");
  return () => new Ctor({ iceServers: [] }) as unknown as RTCPeerConnectionLike;
}

function waitIceComplete(pc: RTCPeerConnectionLike, timeoutMs = 6000): Promise<void> {
  if (pc.iceGatheringState === "complete") return Promise.resolve();
  return new Promise((resolve) => {
    const to = setTimeout(() => {
      pc.onicegatheringstatechange = null;
      resolve(); // با نامزدهای موجود ادامه می‌دهیم (قبولِ partial)
    }, timeoutMs);
    pc.onicegatheringstatechange = () => {
      if (pc.iceGatheringState === "complete") {
        clearTimeout(to);
        pc.onicegatheringstatechange = null;
        resolve();
      }
    };
  });
}

// ---------- ماشین حالت اتاق ----------

export type RoomStatus = "idle" | "creating" | "waiting" | "connected" | "closed" | "error";

export type RoomMessage =
  | { kind: "presence"; running: boolean; topic: string; minutes: number }
  | { kind: "cheer"; emoji: string }
  | { kind: "bye" };

export type RoomEvent =
  | { type: "status"; status: RoomStatus }
  | { type: "peer"; name: string | null }
  | { type: "message"; msg: RoomMessage };

export interface StudyRoomOptions {
  name: string;
  factory?: PeerFactory;
}

/** کنترلر اتاق دونفره (یک‌به‌یک؛ میزبان ↔ مهمان) */
export class StudyRoom {
  private pc: RTCPeerConnectionLike | null = null;
  private dc: RTCDataChannelLike | null = null;
  private listeners = new Set<(e: RoomEvent) => void>();
  private name: string;
  private factory: PeerFactory;
  status: RoomStatus = "idle";
  peerName: string | null = null;

  constructor(opts: StudyRoomOptions) {
    this.name = opts.name.slice(0, 30) || "من";
    this.factory = opts.factory ?? browserPeerFactory();
  }

  on(fn: (e: RoomEvent) => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private emit(e: RoomEvent) {
    for (const fn of [...this.listeners]) {
      try {
        fn(e);
      } catch {
        /* listener مشکل‌دار نباید اتاق را بشکند */
      }
    }
  }

  private setStatus(s: RoomStatus) {
    this.status = s;
    this.emit({ type: "status", status: s });
  }

  private bindChannel(dc: RTCDataChannelLike) {
    this.dc = dc;
    dc.onopen = () => {
      this.setStatus("connected");
      this.emit({ type: "peer", name: this.peerName });
    };
    dc.onclose = () => {
      if (this.status !== "closed" && this.status !== "error") {
        this.setStatus("closed");
        this.emit({ type: "peer", name: null });
      }
    };
    dc.onmessage = (ev) => {
      try {
        const msg = JSON.parse(ev.data) as RoomMessage;
        this.emit({ type: "message", msg });
        if (msg.kind === "bye") this.close();
      } catch {
        /* پیام ناشناخته نادیده گرفته می‌شود */
      }
    };
  }

  /** میزبان: ساخت کد دعوت */
  async hostCode(): Promise<string> {
    if (this.status !== "idle" && this.status !== "closed" && this.status !== "error") throw new Error("already-started");
    this.setStatus("creating");
    const pc = this.factory();
    this.pc = pc;
    this.bindChannel(pc.createDataChannel("study-room"));
    try {
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      await waitIceComplete(pc);
      const sdp = pc.localDescription?.sdp;
      if (!sdp) throw new Error("no-sdp");
      this.setStatus("waiting");
      return await encodeSignal({ t: "offer", sdp, n: this.name });
    } catch (e) {
      this.fail(e);
      throw e;
    }
  }

  /** مهمان: خواندن کد دعوت و ساخت کد پاسخ */
  async joinCode(offerCode: string): Promise<string> {
    if (this.status !== "idle" && this.status !== "closed" && this.status !== "error") throw new Error("already-started");
    this.setStatus("creating");
    const offer = await decodeSignal(offerCode);
    if (offer.t !== "offer") throw new Error("need-offer-code");
    this.peerName = offer.n;
    const pc = this.factory();
    this.pc = pc;
    pc.ondatachannel = (ev) => this.bindChannel(ev.channel);
    try {
      await pc.setRemoteDescription({ type: "offer", sdp: offer.sdp });
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      await waitIceComplete(pc);
      const sdp = pc.localDescription?.sdp;
      if (!sdp) throw new Error("no-sdp");
      return await encodeSignal({ t: "answer", sdp, n: this.name });
    } catch (e) {
      this.fail(e);
      throw e;
    }
  }

  /** میزبان: خواندن کد پاسخ و تکمیل اتصال */
  async acceptAnswer(answerCode: string): Promise<void> {
    const answer = await decodeSignal(answerCode);
    if (answer.t !== "answer") throw new Error("need-answer-code");
    if (!this.pc) throw new Error("not-waiting");
    this.peerName = answer.n;
    await this.pc.setRemoteDescription({ type: "answer", sdp: answer.sdp });
    // اتصال با onopen کانال تأیید می‌شود
  }

  send(msg: RoomMessage) {
    if (this.dc?.readyState === "open") this.dc.send(JSON.stringify(msg));
  }

  sendPresence(p: Extract<RoomMessage, { kind: "presence" }>) {
    this.send(p);
  }

  private fail(e: unknown) {
    this.setStatus("error");
    this.tearDown();
    if (e) this.emit({ type: "peer", name: null });
  }

  private tearDown() {
    try {
      this.dc?.close();
    } catch { /* ignore */ }
    try {
      this.pc?.close();
    } catch { /* ignore */ }
    this.dc = null;
    this.pc = null;
  }

  close() {
    this.tearDown();
    this.peerName = null;
    this.setStatus("closed");
    this.emit({ type: "peer", name: null });
  }
}
