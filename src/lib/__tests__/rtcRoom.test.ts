import { describe, expect, it } from "vitest";
import { StudyRoom, decodeSignal, encodeSignal, isSignalCode, type RTCDataChannelLike, type RoomEvent } from "../rtcRoom";

// ---------- پیاده‌سازی فیکِ WebRTC برای تست handshake کامل ----------

class FakeChannel implements RTCDataChannelLike {
  readyState = "connecting";
  onopen: (() => void) | null = null;
  onmessage: ((ev: { data: string }) => void) | null = null;
  onclose: (() => void) | null = null;
  peer: FakeChannel | null = null;

  send(data: string): void {
    if (this.readyState !== "open") return;
    queueMicrotask(() => this.peer?.onmessage?.({ data }));
  }
  close(): void {
    if (this.readyState === "closed") return;
    this.readyState = "closed";
    queueMicrotask(() => this.onclose?.());
    queueMicrotask(() => this.peer && (this.peer.readyState = "closed"));
  }

  link(other: FakeChannel) {
    this.peer = other;
    other.peer = this;
  }

  openBoth() {
    this.readyState = "open";
    if (this.peer) this.peer.readyState = "open";
    queueMicrotask(() => {
      this.onopen?.();
      this.peer?.onopen?.();
    });
  }
}

let seq = 0;
const ALL_PCS = new Map<string, FakePc>();

class FakePc {
  id = ++seq;
  channel: FakeChannel | null = null;
  localDescription: { sdp?: string | null } | null = null;
  iceGatheringState = "complete";
  onicegatheringstatechange: (() => void) | null = null;
  ondatachannel: ((ev: { channel: FakeChannel }) => void) | null = null;
  remote: FakePc | null = null;

  constructor() {
    ALL_PCS.set(`pc${this.id}`, this);
  }

  createDataChannel(): FakeChannel {
    this.channel = new FakeChannel();
    return this.channel;
  }

  async createOffer() {
    return { type: "offer", sdp: `v=0 fake-offer-sdp VOFFER|${this.id}` };
  }
  async createAnswer() {
    return { type: "answer", sdp: `v=0 fake-answer-sdp VANSWER|${this.id}` };
  }
  async setLocalDescription(d: { type: string; sdp: string }) {
    this.localDescription = { sdp: d.sdp };
  }
  async setRemoteDescription(d: { type: string; sdp: string }) {
    if (d.type === "offer") {
      // sdp شکل VOFFER|<hostId>
      const id = Number(sdpFrom(d).split("|")[1]);
      this.remote = ALL_PCS.get(`pc${id}`) ?? null;
      // تحویل کانالِ ساخته‌شده توسط میزبان به مهمان
      const guestChannel = new FakeChannel();
      const hostChannel = this.remote?.channel ?? null;
      if (hostChannel) guestChannel.link(hostChannel);
      queueMicrotask(() => this.ondatachannel?.({ channel: guestChannel }));
    } else {
      // sdp شکل VANSWER|<guestId> — فقط میزبان با remote مشخص‌شده فراخوانی می‌کند
      const id = Number(sdpFrom(d).split("|")[1]);
      const guest = ALL_PCS.get(`pc${id}`) ?? null;
      if (guest && this.channel) {
        queueMicrotask(() => this.channel!.openBoth());
      }
    }
  }
  close() {
    this.channel?.close();
  }
}

function sdpFrom(d: { sdp?: string | null }): string {
  return (d.sdp ?? "") as string;
}

const fakeFactory = () => new FakePc() as unknown as import("../rtcRoom").RTCPeerConnectionLike;

function pcOfRoom(room: StudyRoom): Map<string, FakePc> {
  void room;
  return ALL_PCS;
}
void pcOfRoom;

// فیک: مهمان باید remote خود را روی میزبانِ همان offer ست نگه دارد تا یافتن peer ممکن شود.
// ساده‌سازی: setRemoteDescription(answer) روی میزبان با نگاشت از روی remote مهمان انجام می‌شود،
// اما در تست ما دنباله‌ی واقعی را همین‌جا صادر می‌کنیم.

describe("rtcRoom — کدگذاری سیگنال", () => {
  it("روندمسیر encode/decode", async () => {
    const code = await encodeSignal({ t: "offer", sdp: "v=0 o=- 1 2 IN IP4 127.0.0.1 ...", n: "میزبان" });
    expect(isSignalCode(code)).toBe(true);
    const b = await decodeSignal(code);
    expect(b.t).toBe("offer");
    expect(b.n).toBe("میزبان");
    expect(b.sdp).toContain("127.0.0.1");
  });

  it("متن نامعتبر رد می‌شود", async () => {
    await expect(decodeSignal("not-a-code")).rejects.toThrow();
    expect(isSignalCode("SPLNR1|xxx")).toBe(false);
  });
});

describe("rtcRoom — دست‌دهی کامل و تبادل پیام", () => {
  it("میزبان↔مهمان وصل می‌شوند و پیام ردوبدل می‌کنند", async () => {
    const host = new StudyRoom({ name: "میزبان", factory: fakeFactory });
    const guest = new StudyRoom({ name: "مهمان", factory: fakeFactory });

    const hostEvents: RoomEvent[] = [];
    const guestMsgs: import("../rtcRoom").RoomMessage[] = [];
    host.on((e) => hostEvents.push(e));
    guest.on((e) => e.type === "message" && guestMsgs.push(e.msg));

    const offer = await host.hostCode();
    expect(host.status).toBe("waiting");

    const answer = await guest.joinCode(offer);
    // میزبانِ guest را نمی‌شناسد؛ در فیک ما remote را از روی offer یاد گرفته بود

    await host.acceptAnswer(answer);
    // بازشدن کانال‌ها آسنکرون (queueMicrotask) اتفاق می‌افتد
    await new Promise((r) => setTimeout(r, 5));

    expect(host.status).toBe("connected");
    expect(guest.status).toBe("connected");
    expect(host.peerName).toBe("مهمان");
    expect(guest.peerName).toBe("میزبان");

    // پیام حضور از مهمان به میزبان
    guest.send({ kind: "presence", running: true, topic: "قلب", minutes: 25 });
    await new Promise((r) => setTimeout(r, 5));
    const lastPresence = hostEvents.filter((e) => e.type === "message").map((e) => (e as Extract<RoomEvent, { type: "message" }>).msg).pop();
    expect(lastPresence).toEqual({ kind: "presence", running: true, topic: "قلب", minutes: 25 });

    // تشویق از میزبان به مهمان
    host.send({ kind: "cheer", emoji: "👏" });
    await new Promise((r) => setTimeout(r, 5));
    expect(guestMsgs.pop()).toEqual({ kind: "cheer", emoji: "👏" });

    // خداحافظی
    guest.send({ kind: "bye" });
    await new Promise((r) => setTimeout(r, 5));
    expect(host.status).toBe("closed");
  });

  it("نمی‌شود دو بار host کرد", async () => {
    const r = new StudyRoom({ name: "x", factory: fakeFactory });
    await r.hostCode();
    await expect(r.hostCode()).rejects.toThrow();
  });

  it("answer بدون offer رد می‌شود", async () => {
    const r = new StudyRoom({ name: "x", factory: fakeFactory });
    const code = await encodeSignal({ t: "answer", sdp: "VANSWER|1", n: "a" });
    await expect(r.joinCode(code)).rejects.toThrow();
  });
});
