import { AdminMediaUpdatedPublisher, type AdminMediaKind } from "../events/admin-media-updated.publisher";
import { callSignalToUpdate, meetingEventToUpdate } from "../events/admin-media.mapping";

/**
 * Sink `admin:media-updated` (p2-07 be.md §5.8/§6): ánh xạ sự kiện outbox → `{ kind, id, status }` (KHÔNG nội dung/người dùng) và throttle 1 sự kiện/giây/`kind`.
 */
describe("ánh xạ sự kiện → admin:media-updated", () => {
  it("meeting.events: started/ended/cancelled → MEETING; recording-ready → RECORDING/READY; sự kiện khác bị bỏ", () => {
    expect(meetingEventToUpdate({ event: "started", meetingId: "m1" })).toEqual({ kind: "MEETING", id: "m1", status: "LIVE" });
    expect(meetingEventToUpdate({ event: "ended", meetingId: "m1" })).toEqual({ kind: "MEETING", id: "m1", status: "ENDED" });
    expect(meetingEventToUpdate({ event: "cancelled", meetingId: "m1" })).toEqual({ kind: "MEETING", id: "m1", status: "CANCELLED" });
    expect(meetingEventToUpdate({ event: "recording-ready", meetingId: "m1", recordingId: "r1" })).toEqual({ kind: "RECORDING", id: "r1", status: "READY" });
    expect(meetingEventToUpdate({ event: "recording-ready", meetingId: "m1" })).toBeNull();
    for (const event of ["created", "updated", "deleted", "attendees-changed", "roles-changed", "lock-changed", "recap-published"]) expect(meetingEventToUpdate({ event, meetingId: "m1" })).toBeNull();
  });

  it("call.signal-dispatch: chỉ `ended` → CALL/ENDED", () => {
    expect(callSignalToUpdate({ event: "ended", callId: "c1" })).toEqual({ kind: "CALL", id: "c1", status: "ENDED" });
    for (const event of ["ringing", "answered", "declined", "host-action", "participant-changed"]) expect(callSignalToUpdate({ event, callId: "c1" })).toBeNull();
  });
});

describe("AdminMediaUpdatedPublisher", () => {
  it("phát tới room admin:media với đúng sự kiện + payload tối thiểu", async () => {
    const emitted: Array<{ room: string; event: string; payload: object }> = [];
    const p = new AdminMediaUpdatedPublisher(() => Promise.resolve(true), (room, event, payload) => emitted.push({ room, event, payload }));
    await expect(p.publish({ kind: "MEETING", id: "m1", status: "ENDED" })).resolves.toBe(true);
    expect(emitted).toEqual([{ room: "admin:media", event: "admin:media-updated", payload: { kind: "MEETING", id: "m1", status: "ENDED" } }]);
  });

  it("throttle theo kind: bị chặn thì không phát; kind khác không ảnh hưởng nhau", async () => {
    const seen = new Set<AdminMediaKind>();
    const emitted: string[] = [];
    const p = new AdminMediaUpdatedPublisher(
      (kind) => {
        if (seen.has(kind)) return Promise.resolve(false);
        seen.add(kind);
        return Promise.resolve(true);
      },
      (_room, _event, payload) => emitted.push((payload as { id: string }).id)
    );
    expect(await p.publish({ kind: "CALL", id: "c1", status: "ENDED" })).toBe(true);
    expect(await p.publish({ kind: "CALL", id: "c2", status: "ENDED" })).toBe(false);
    expect(await p.publish({ kind: "MEETING", id: "m1", status: "LIVE" })).toBe(true);
    expect(emitted).toEqual(["c1", "m1"]);
  });

  it("throttle/emit ném lỗi → publish KHÔNG ném (sự kiện mất cũng không sao)", async () => {
    const boom = new AdminMediaUpdatedPublisher(() => Promise.reject(new Error("redis")), () => undefined);
    await expect(boom.publish({ kind: "CALL", id: "c1", status: "ENDED" })).resolves.toBe(false);
    const emitBoom = new AdminMediaUpdatedPublisher(() => Promise.resolve(true), () => {
      throw new Error("socket");
    });
    await expect(emitBoom.publish({ kind: "CALL", id: "c1", status: "ENDED" })).resolves.toBe(false);
  });
});
