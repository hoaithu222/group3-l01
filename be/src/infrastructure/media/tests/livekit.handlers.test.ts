import { clearLiveKitHandlers, dispatchLiveKitEvent, registerLiveKitHandler } from "../livekit.handlers";
import type { NormalizedLiveKitEvent } from "../livekit.webhook";

const event = (over: Partial<NormalizedLiveKitEvent> = {}): NormalizedLiveKitEvent => ({
  id: "EV_1",
  type: "participant_joined",
  roomName: "call_x",
  createdAt: null,
  room: null,
  participant: null,
  track: null,
  egress: null,
  ...over,
});

beforeEach(() => clearLiveKitHandlers());

describe("dispatchLiveKitEvent (MED-07)", () => {
  it("room call_x → handler `call`; room meet_y → handler `meeting`; mỗi loại chỉ chạy handler của mình", async () => {
    const onCall = jest.fn().mockResolvedValue("PROCESSED");
    const onMeeting = jest.fn().mockResolvedValue("PROCESSED");
    registerLiveKitHandler({ roomKind: "call", types: ["participant_joined"], handle: onCall });
    registerLiveKitHandler({ roomKind: "meeting", types: ["participant_joined"], handle: onMeeting });

    await expect(dispatchLiveKitEvent(event({ roomName: "call_x" }))).resolves.toBe("PROCESSED");
    expect(onCall).toHaveBeenCalledTimes(1);
    expect(onMeeting).not.toHaveBeenCalled();

    await expect(dispatchLiveKitEvent(event({ roomName: "meet_y" }))).resolves.toBe("PROCESSED");
    expect(onMeeting).toHaveBeenCalledTimes(1);
    expect(onCall).toHaveBeenCalledTimes(1);
  });

  it("tiền tố lạ (`abc`) / không có tên phòng → IGNORED, không handler nào chạy", async () => {
    const handle = jest.fn().mockResolvedValue("PROCESSED");
    registerLiveKitHandler({ roomKind: "call", types: ["participant_joined"], handle });
    await expect(dispatchLiveKitEvent(event({ roomName: "abc" }))).resolves.toBe("IGNORED");
    await expect(dispatchLiveKitEvent(event({ roomName: null }))).resolves.toBe("IGNORED");
    expect(handle).not.toHaveBeenCalled();
  });

  it("loại sự kiện không nằm trong `types` → IGNORED", async () => {
    const handle = jest.fn().mockResolvedValue("PROCESSED");
    registerLiveKitHandler({ roomKind: "call", types: ["room_finished"], handle });
    await expect(dispatchLiveKitEvent(event())).resolves.toBe("IGNORED");
    expect(handle).not.toHaveBeenCalled();
  });

  it("handler `*` (egress của p2-06) nhận mọi loại phòng, kể cả tiền tố lạ", async () => {
    const handle = jest.fn().mockResolvedValue("PROCESSED");
    registerLiveKitHandler({ roomKind: "*", types: ["egress_ended"], handle });
    await dispatchLiveKitEvent(event({ type: "egress_ended", roomName: "meet_z" }));
    await dispatchLiveKitEvent(event({ type: "egress_ended", roomName: "call_z" }));
    expect(handle).toHaveBeenCalledTimes(2);
  });

  it("nhiều handler khớp chạy TUẦN TỰ theo thứ tự đăng ký; PROCESSED nếu có ít nhất 1 PROCESSED", async () => {
    const order: string[] = [];
    registerLiveKitHandler({ roomKind: "call", types: ["participant_joined"], handle: () => { order.push("a"); return Promise.resolve("IGNORED"); } });
    registerLiveKitHandler({ roomKind: "*", types: ["participant_joined"], handle: () => { order.push("b"); return Promise.resolve("PROCESSED"); } });
    await expect(dispatchLiveKitEvent(event())).resolves.toBe("PROCESSED");
    expect(order).toEqual(["a", "b"]);
  });

  it("mọi handler trả IGNORED → IGNORED", async () => {
    registerLiveKitHandler({ roomKind: "call", types: ["participant_joined"], handle: () => Promise.resolve("IGNORED") });
    await expect(dispatchLiveKitEvent(event())).resolves.toBe("IGNORED");
  });

  it("handler ném lỗi → lỗi được ném tiếp (job retry), handler sau không chạy", async () => {
    const after = jest.fn().mockResolvedValue("PROCESSED");
    registerLiveKitHandler({ roomKind: "call", types: ["participant_joined"], handle: () => Promise.reject(new Error("db down")) });
    registerLiveKitHandler({ roomKind: "call", types: ["participant_joined"], handle: after });
    await expect(dispatchLiveKitEvent(event())).rejects.toThrow("db down");
    expect(after).not.toHaveBeenCalled();
  });

  it("đăng ký lại cùng `name` thì THAY THẾ (import lặp không nhân đôi handler)", async () => {
    const first = jest.fn().mockResolvedValue("PROCESSED");
    const second = jest.fn().mockResolvedValue("PROCESSED");
    registerLiveKitHandler({ name: "p2-01.call", roomKind: "call", types: ["participant_joined"], handle: first });
    registerLiveKitHandler({ name: "p2-01.call", roomKind: "call", types: ["participant_joined"], handle: second });
    await dispatchLiveKitEvent(event());
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
  });

  it("phòng spike_ → handler `spike`", async () => {
    const handle = jest.fn().mockResolvedValue("PROCESSED");
    registerLiveKitHandler({ roomKind: "spike", types: ["participant_joined"], handle });
    await expect(dispatchLiveKitEvent(event({ roomName: "spike_demo" }))).resolves.toBe("PROCESSED");
  });
});
