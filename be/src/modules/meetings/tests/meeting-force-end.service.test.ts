import type { MeetingEntity } from "../entities/meeting.interface";
import { MeetingForceEndService, type ForceEndLifecycle } from "../services/meeting-force-end.service";
import type { MeetingRoomDeps } from "../services/meeting-room.deps";

/**
 * Consumer outbox `meeting.force-end` (p2-07): kết thúc qua `endBySystem(FORCE_ENDED, { actorId })`, báo CHỦ TRÌ/ĐỒNG CHỦ TRÌ bằng hộp thư `meeting.force-ended` (dedupe theo phiên),
 * idempotent khi job retry, bỏ qua yêu cầu lỗi thời (phiên đã đổi / đã kết thúc bởi lý do khác).
 */
type Attendee = { userId: string; role: "HOST" | "CO_HOST" | "ATTENDEE" };

function build(initial: Partial<MeetingEntity> = {}, attendees: Attendee[] = [{ userId: "host", role: "HOST" }, { userId: "co", role: "CO_HOST" }, { userId: "guest", role: "ATTENDEE" }]) {
  let meeting = { id: "m1", workspaceId: "w1", title: "Họp giao ban", status: "LIVE", currentCallId: "c1", endReason: null, ...initial } as MeetingEntity;
  const endBySystem = jest.fn<ReturnType<ForceEndLifecycle["endBySystem"]>, Parameters<ForceEndLifecycle["endBySystem"]>>(async (_id, reason) => {
    if (meeting.status !== "LIVE") return null;
    meeting = { ...meeting, status: "ENDED", endReason: reason };
    return meeting;
  });
  const notified: Array<Record<string, unknown>> = [];
  const d = { repo: { findById: () => Promise.resolve(meeting), findActiveAttendees: () => Promise.resolve(attendees) } } as unknown as MeetingRoomDeps;
  const svc = new MeetingForceEndService(d, { endBySystem }, (input) => (notified.push(input as unknown as Record<string, unknown>), Promise.resolve()));
  return { svc, endBySystem, notified };
}

const PAYLOAD = { meetingId: "m1", actorId: "admin-1", callId: "c1", reason: "Phòng treo sau sự cố" };

describe("MeetingForceEndService", () => {
  it("LIVE → endBySystem(FORCE_ENDED, actor admin) rồi báo đúng chủ trì + đồng chủ trì (không báo khách, không lộ admin)", async () => {
    const { svc, endBySystem, notified } = build();
    await expect(svc.run(PAYLOAD)).resolves.toBe("ENDED");
    expect(endBySystem).toHaveBeenCalledWith("m1", "FORCE_ENDED", { actorId: "admin-1" });
    expect(notified).toHaveLength(1);
    expect(notified[0]).toMatchObject({
      type: "meeting.force-ended",
      scope: { type: "MEETING", id: "m1" },
      workspaceId: "w1",
      dedupeKey: "meeting-force-ended:m1:c1",
      recipients: [{ userId: "host" }, { userId: "co" }],
      refs: { meetingId: "m1", workspaceId: "w1", title: "Họp giao ban" },
    });
    expect("actorId" in notified[0]!).toBe(false); // không lộ danh tính admin cho người dùng
    expect(JSON.stringify(notified[0])).not.toContain("admin-1");
  });

  it("retry SAU khi đã kết thúc bởi chính force-end → không kết thúc lại nhưng vẫn báo (dedupeKey trùng ⇒ notify() idempotent)", async () => {
    const { svc, endBySystem, notified } = build({ status: "ENDED", endReason: "FORCE_ENDED" });
    await expect(svc.run(PAYLOAD)).resolves.toBe("ENDED");
    expect(endBySystem).not.toHaveBeenCalled();
    expect(notified.map((n) => n.dedupeKey)).toEqual(["meeting-force-ended:m1:c1"]);
  });

  it("đã kết thúc vì lý do KHÁC (chủ trì tự kết thúc trước khi job chạy) → SKIPPED, không báo", async () => {
    const { svc, endBySystem, notified } = build({ status: "ENDED", endReason: "HOST_ENDED" });
    await expect(svc.run(PAYLOAD)).resolves.toBe("SKIPPED");
    expect(endBySystem).not.toHaveBeenCalled();
    expect(notified).toHaveLength(0);
  });

  it("phiên đã đổi (kết thúc rồi bắt đầu lại → currentCallId khác) → yêu cầu lỗi thời: KHÔNG kết thúc phiên mới của người khác", async () => {
    const { svc, endBySystem, notified } = build({ currentCallId: "c2" });
    await expect(svc.run(PAYLOAD)).resolves.toBe("SKIPPED");
    expect(endBySystem).not.toHaveBeenCalled();
    expect(notified).toHaveLength(0);
  });

  it("không có cuộc họp → SKIPPED; lỗi khi báo chủ trì không làm hỏng việc kết thúc", async () => {
    const none = new MeetingForceEndService({ repo: { findById: () => Promise.resolve(null) } } as unknown as MeetingRoomDeps, { endBySystem: jest.fn() }, jest.fn());
    await expect(none.run(PAYLOAD)).resolves.toBe("SKIPPED");

    const { endBySystem } = build();
    const failingNotify = new MeetingForceEndService(
      { repo: { findById: () => Promise.resolve({ id: "m1", workspaceId: "w1", title: "t", status: "ENDED", endReason: "FORCE_ENDED", currentCallId: "c1" }), findActiveAttendees: () => Promise.resolve([{ userId: "host", role: "HOST" }]) } } as unknown as MeetingRoomDeps,
      { endBySystem },
      () => Promise.reject(new Error("notify down"))
    );
    await expect(failingNotify.run(PAYLOAD)).resolves.toBe("ENDED");
  });

  it("cuộc họp không còn chủ trì/đồng chủ trì đang hoạt động → không gọi notify", async () => {
    const { svc, notified } = build({}, [{ userId: "guest", role: "ATTENDEE" }]);
    await expect(svc.run(PAYLOAD)).resolves.toBe("ENDED");
    expect(notified).toHaveLength(0);
  });
});
