import { LIMITS } from "../../../core/constants/limits";
import { roomNames } from "../../../infrastructure/media";
import { autoCloseAt, autoCloseEvent, autoCloseEvents, callEndReasonOf, meetingEndReasonOf } from "../services/meeting-room.schedule";
import { meetingCodeOfRoomRef } from "../services/meeting-room.webhook.service";

const at = (iso: string): Date => new Date(iso);
const limits = { maxMinutes: 240, restartWindowMinutes: 60 };

describe("autoCloseAt (be.md §2, mục tự đóng phòng)", () => {
  const meeting = { endAt: at("2026-10-01T10:00:00.000Z") };

  it("= min(bắt đầu phiên + maxMinutes, endAt + restartWindow)", () => {
    // bắt đầu đúng giờ: endAt + 60' (11:00) sớm hơn start + 240' (13:00)
    expect(autoCloseAt(meeting, at("2026-10-01T09:00:00.000Z"), limits)).toEqual(at("2026-10-01T11:00:00.000Z"));
    // họp kéo dài: bắt đầu 07:00 → start + 240' = 11:00 = endAt + 60'
    expect(autoCloseAt(meeting, at("2026-10-01T07:00:00.000Z"), limits)).toEqual(at("2026-10-01T11:00:00.000Z"));
    // bắt đầu quá sớm: chạm trần maxMinutes trước
    expect(autoCloseAt({ endAt: at("2026-10-01T20:00:00.000Z") }, at("2026-10-01T06:00:00.000Z"), limits)).toEqual(at("2026-10-01T10:00:00.000Z"));
  });

  it("bắt đầu lại sát/qua hạn endAt + restartWindow vẫn chạy tối thiểu minRestartRunMinutes (không tự đóng ngay); maxMinutes vẫn là trần cứng", () => {
    const start = at("2026-10-01T10:55:00.000Z"); // 5' trước hạn 11:00
    expect(autoCloseAt(meeting, start, limits)).toEqual(new Date(start.getTime() + LIMITS.meeting.minRestartRunMinutes * 60_000));
    expect(autoCloseAt(meeting, start, { maxMinutes: 10, restartWindowMinutes: 60 })).toEqual(new Date(start.getTime() + 10 * 60_000));
  });

  it("autoCloseEvents: có cảnh báo trước closingWarningMinutes khi còn ở tương lai; hết chỗ cảnh báo thì chỉ có CLOSE", () => {
    const now = at("2026-10-01T09:00:00.000Z");
    const closeAt = at("2026-10-01T11:00:00.000Z");
    const both = autoCloseEvents({ meetingId: "m1", callId: "c1", closeAt, now });
    expect(both.map((e) => (e.payload as { phase: string }).phase)).toEqual(["WARN", "CLOSE"]);
    expect(both[0]!.availableAt).toEqual(new Date(closeAt.getTime() - LIMITS.meeting.closingWarningMinutes * 60_000));
    expect(both[1]!.availableAt).toEqual(closeAt);

    const late = autoCloseEvents({ meetingId: "m1", callId: "c1", closeAt: at("2026-10-01T09:03:00.000Z"), now });
    expect(late.map((e) => (e.payload as { phase: string }).phase)).toEqual(["CLOSE"]);
  });

  it("hàng outbox hẹn giờ: queue calls, tên job, dedupeKey theo (cuộc họp, phiên, pha, giờ) — gia hạn đổi giờ thì khác khoá, cùng giờ thì cùng khoá", () => {
    const a = autoCloseEvent({ meetingId: "m1", callId: "c1", phase: "CLOSE", at: at("2026-10-01T11:00:00.000Z") });
    const same = autoCloseEvent({ meetingId: "m1", callId: "c1", phase: "CLOSE", at: at("2026-10-01T11:00:00.000Z") });
    const moved = autoCloseEvent({ meetingId: "m1", callId: "c1", phase: "CLOSE", at: at("2026-10-01T11:30:00.000Z") });
    expect(a).toMatchObject({ queue: "calls", jobName: "meeting.auto-close", aggregateType: "Meeting", aggregateId: "m1", payload: { meetingId: "m1", callId: "c1", phase: "CLOSE" } });
    expect(same.dedupeKey).toBe(a.dedupeKey);
    expect(moved.dedupeKey).not.toBe(a.dedupeKey);
  });
});

describe("ánh xạ lý do kết thúc cuộc họp và cuộc gọi", () => {
  it("cuộc họp → cuộc gọi", () => {
    expect(callEndReasonOf("HOST_ENDED")).toBe("HOST_ENDED");
    expect(callEndReasonOf("EMPTY")).toBe("EMPTY");
    expect(callEndReasonOf("MAX_DURATION")).toBe("MAX_DURATION");
    expect(callEndReasonOf("FORCE_ENDED")).toBe("FORCE_ENDED");
    expect(callEndReasonOf("WORKSPACE_ARCHIVED")).toBe("ARCHIVED");
    expect(callEndReasonOf("HOST_REMOVED")).toBe("REVOKED");
  });

  it("cuộc gọi → cuộc họp (Call bị kết thúc từ nơi khác); lý do lạ rơi về EMPTY", () => {
    expect(meetingEndReasonOf("HOST_ENDED")).toBe("HOST_ENDED");
    expect(meetingEndReasonOf("MAX_DURATION")).toBe("MAX_DURATION");
    expect(meetingEndReasonOf("FORCE_ENDED")).toBe("FORCE_ENDED");
    expect(meetingEndReasonOf("ARCHIVED")).toBe("WORKSPACE_ARCHIVED");
    expect(meetingEndReasonOf("REVOKED")).toBe("HOST_REMOVED");
    expect(meetingEndReasonOf("FAILED")).toBe("EMPTY");
    expect(meetingEndReasonOf(null)).toBe("EMPTY");
  });
});

describe("tên phòng LiveKit và mã họp (webhook)", () => {
  it("meet_<mã bỏ gạch> và meet_<mã>_<hậu tố phiên bắt đầu lại> đều suy ra được mã họp", () => {
    const first = roomNames.meeting("abc-defg-hij");
    expect(first).toBe("meet_abcdefghij");
    expect(meetingCodeOfRoomRef(roomNames.parse(first).ref)).toBe("abc-defg-hij");
    const restarted = `${first}_1a2b3c4d`;
    expect(roomNames.parse(restarted)).toEqual({ kind: "meeting", ref: "abcdefghij_1a2b3c4d" });
    expect(meetingCodeOfRoomRef(roomNames.parse(restarted).ref)).toBe("abc-defg-hij");
  });
});
