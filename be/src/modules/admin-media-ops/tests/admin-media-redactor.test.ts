import type { CallContext, CallRecord, MeetingRecord } from "../entities/admin-media.types";
import { toCallDetail, toCallRow, toMeetingDetail, toMeetingRow } from "../services/admin-media-redactor";

/**
 * OPC-05 (p2-07 be.md §10): DTO admin chỉ chứa các trường CHO PHÉP — khoá bằng danh sách khoá đúng từng trường (snapshot), và kiểm không có gì nhạy cảm dù bản ghi gốc
 * bị nhét thêm trường rác (mô phỏng "ai đó thêm cột vào `select`").
 */
const D = (s: string) => new Date(s);

const meeting = (over: Partial<MeetingRecord> = {}): MeetingRecord => ({
  id: "m1", code: "abc-defg-hij", title: "Họp tuần", workspaceId: "w1", hostId: "u-host", startAt: D("2026-09-01T02:00:00Z"), endAt: D("2026-09-01T03:00:00Z"),
  timezone: "Asia/Ho_Chi_Minh", status: "ENDED", platform: "INTERNAL", attendeeCount: 12, endReason: "HOST_ENDED", cancelledAt: null, currentCallId: null, lockedAt: null, version: 5, ...over,
});

const call = (over: Partial<CallRecord> = {}): CallRecord => ({
  id: "c1", scopeType: "CONVERSATION", scopeId: "conv-secret", workspaceId: null, mode: "RING", mediaKind: "AUDIO", status: "ENDED", endReason: "COMPLETED",
  startedAt: D("2026-09-01T02:00:00Z"), endedAt: D("2026-09-01T02:05:00Z"), durationSec: 300, peakParticipants: 2, invitedCount: 1, version: 4, ...over,
});

const ctx = (over: Partial<CallContext> = {}): CallContext => ({
  workspaceNames: new Map([["w1", "Nhóm Alpha"]]),
  conversationKinds: new Map([["conv-secret", "DIRECT"]]),
  channels: new Map([["ch-pub", { name: "chung", visibility: "PUBLIC" }], ["ch-priv", { name: "bí-mật-lãnh-đạo", visibility: "PRIVATE" }]]),
  meetings: new Map([["m1", { code: "abc-defg-hij", title: "Họp tuần" }]]),
  ...over,
});

describe("AdminMediaRedactor — cuộc họp", () => {
  it("dòng cuộc họp chỉ có đúng các trường cho phép; trường lạ của bản ghi gốc KHÔNG rò ra", () => {
    const polluted = { ...meeting(), agenda: "BÍ-MẬT-AGENDA", location: "Phòng kín", externalUrl: "https://zoom.us/j/1?pwd=x", attendees: ["u1", "u2"], conversationId: "conv1" } as MeetingRecord;
    const row = toMeetingRow(polluted, { sessionCount: 2, totalDurationSec: 4000 }, 1, { workspace: "Nhóm Alpha", host: "Chị Chủ Trì" });
    expect(Object.keys(row).sort()).toEqual(
      ["attendeeCount", "code", "endAt", "endReason", "host", "id", "platform", "recordingCount", "sessionCount", "startAt", "status", "timezone", "title", "totalDurationSec", "workspace"].sort()
    );
    const raw = JSON.stringify(row);
    for (const secret of ["BÍ-MẬT-AGENDA", "Phòng kín", "zoom.us", "u1", "conv1", "currentCallId", "lockedAt", "version"]) expect(raw).not.toContain(secret);
    expect(row).toMatchObject({ workspace: { id: "w1", name: "Nhóm Alpha" }, host: { id: "u-host", name: "Chị Chủ Trì" }, sessionCount: 2, totalDurationSec: 4000, recordingCount: 1 });
  });

  it("thiếu tên (workspace/chủ trì đã xoá) → name null; không phiên → 0; cuộc họp bị huỷ có cancelledAt, không endReason", () => {
    const row = toMeetingRow(meeting({ status: "CANCELLED", endReason: null, cancelledAt: D("2026-08-30T00:00:00Z") }), undefined, 0, {});
    expect(row).toMatchObject({ workspace: { id: "w1", name: null }, host: { id: "u-host", name: null }, sessionCount: 0, totalDurationSec: 0, recordingCount: 0, cancelledAt: "2026-08-30T00:00:00.000Z" });
    expect("endReason" in row).toBe(false);
  });

  it("chi tiết: currentSession (đang LIVE) + phiên + tổng bản ghi; không danh sách người tham dự", () => {
    const live = call({ id: "c9", scopeType: "MEETING", scopeId: "m1", status: "ACTIVE", endReason: null, endedAt: null, durationSec: null });
    const row = toMeetingRow(meeting({ status: "LIVE", endReason: null }), { sessionCount: 2, totalDurationSec: 100 }, 0, {});
    const d = toMeetingDetail(row, { sessions: [live, call({ id: "c8", scopeType: "MEETING", scopeId: "m1" })], current: { call: live, connectedCount: 7, lockedAt: D("2026-09-01T02:30:00Z") }, recordings: { ready: 1, failed: 0, totalBytes: 1234 } });
    expect(d.currentSession).toEqual({ callId: "c9", startedAt: "2026-09-01T02:00:00.000Z", connectedCount: 7, lockedAt: "2026-09-01T02:30:00.000Z" });
    expect(d.sessions.map((s) => s.callId)).toEqual(["c9", "c8"]);
    expect(d.sessions[0]).toEqual({ callId: "c9", startedAt: "2026-09-01T02:00:00.000Z", peakParticipants: 2 }); // đang chạy: không endedAt/durationSec/endReason
    expect(d.recordings).toEqual({ ready: 1, failed: 0, totalBytes: 1234 });
    expect(Object.keys(d).sort()).toEqual([...Object.keys(row), "currentSession", "recordings", "sessions"].sort());
  });
});

describe("AdminMediaRedactor — cuộc gọi", () => {
  it("DIRECT → 'Cuộc gọi 1-1', KHÔNG scopeId/conversationId/initiatorId/hostId/livekitRoom; đúng các khoá cho phép", () => {
    const polluted = { ...call(), initiatorId: "u-caller", hostId: "u-host", livekitRoom: "call_c1", conversationId: "conv-secret", endedBy: "u-x" } as CallRecord;
    const row = toCallRow(polluted, ctx());
    expect(row.label).toBe("Cuộc gọi 1-1");
    expect(Object.keys(row).sort()).toEqual(["durationSec", "endReason", "endedAt", "id", "invitedCount", "label", "mediaKind", "mode", "peakParticipants", "scopeType", "startedAt", "status"].sort());
    const raw = JSON.stringify(row);
    for (const secret of ["conv-secret", "u-caller", "u-host", "call_c1", "u-x"]) expect(raw).not.toContain(secret);
  });

  it("nhóm chat → 'Nhóm chat' (không tiêu đề); kênh PUBLIC → '#tên' + channel; kênh riêng tư → 'Kênh riêng tư' (không tên, không id)", () => {
    const group = toCallRow(call({ scopeId: "conv-g", workspaceId: "w1" }), ctx({ conversationKinds: new Map([["conv-g", "GROUP"]]) }));
    expect(group.label).toBe("Nhóm chat");
    expect(group.workspace).toEqual({ id: "w1", name: "Nhóm Alpha" });
    expect(JSON.stringify(group)).not.toContain("conv-g");

    const pub = toCallRow(call({ scopeType: "CHANNEL", scopeId: "ch-pub", mode: "ROOM" }), ctx());
    expect(pub.label).toBe("#chung");
    expect(pub.channel).toEqual({ id: "ch-pub", name: "chung" });

    const priv = toCallRow(call({ scopeType: "CHANNEL", scopeId: "ch-priv", mode: "ROOM" }), ctx());
    expect(priv.label).toBe("Kênh riêng tư");
    expect(priv.channel).toBeUndefined();
    expect(JSON.stringify(priv)).not.toMatch(/bí-mật|ch-priv/);
  });

  it("cuộc gọi của cuộc họp → tiêu đề + meeting { id, code, title }; cuộc họp không tra được → nhãn chung", () => {
    const row = toCallRow(call({ scopeType: "MEETING", scopeId: "m1", mode: "ROOM", workspaceId: "w1" }), ctx());
    expect(row).toMatchObject({ label: "Họp tuần", meeting: { id: "m1", code: "abc-defg-hij", title: "Họp tuần" } });
    expect(toCallRow(call({ scopeType: "MEETING", scopeId: "gone" }), ctx()).label).toBe("Cuộc họp");
  });

  it("cuộc gọi đang chạy: không endedAt/durationSec/endReason", () => {
    const row = toCallRow(call({ status: "ACTIVE", endReason: null, endedAt: null, durationSec: null }), ctx());
    expect(["endedAt", "durationSec", "endReason"].some((k) => k in row)).toBe(false);
  });

  it("chi tiết: chỉ SỐ ĐẾM theo trạng thái người tham gia + thiết lập kết nối; roomActive chỉ khi biết", () => {
    const row = toCallRow(call(), ctx());
    const d = toCallDetail(row, { INVITED: 0, RINGING: 0, CONNECTED: 1, RECONNECTING: 1, LEFT: 2, MISSED: 1, DECLINED: 2, BUSY: 1, REMOVED: 1 }, { attempts: 5, successWithin: 4 }, true);
    expect(d.participantStats).toEqual({ invited: 9, answered: 4, connected: 2, missed: 1, declined: 2, busy: 1, removed: 1 });
    expect(d.setup).toEqual({ attempts: 5, successWithin20s: 4 });
    expect(d.roomActive).toBe(true);
    expect(Object.keys(d).sort()).toEqual([...Object.keys(row), "participantStats", "roomActive", "setup"].sort());
    expect("roomActive" in toCallDetail(row, {}, { attempts: 0, successWithin: 0 }, undefined)).toBe(false);
    expect(JSON.stringify(d)).not.toMatch(/userId|conv-secret/);
  });
});
