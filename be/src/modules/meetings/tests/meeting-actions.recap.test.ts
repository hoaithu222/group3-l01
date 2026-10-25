import type { AttendeeEntity, MeetingEntity } from "../entities/meeting.interface";
import { computeMyActions } from "../services/meeting-actions.calculator";

const T0 = new Date("2026-06-15T02:00:00.000Z");
const meeting = (over: Partial<MeetingEntity>): MeetingEntity =>
  ({ id: "m1", workspaceId: "w1", platform: "INTERNAL", visibility: "ATTENDEES", lobbyMode: "OFF", joinWindowMinutes: 10, recordingAllowed: true, startAt: T0, endAt: new Date(T0.getTime() + 3_600_000), status: "ENDED", ...over }) as MeetingEntity;
const att = (role: AttendeeEntity["role"]) => ({ role, removedAt: null });
const now = new Date(T0.getTime() + 2 * 3_600_000);
const opts = { restartWindowMinutes: 60 };

describe("myActions — cờ biên bản/ghi hình (p2-06)", () => {
  it("ENDED: người tham dự thường chỉ thấy nút xem biên bản khi ĐÃ công bố; chủ trì luôn xem + sửa", () => {
    expect(computeMyActions(meeting({}), att("ATTENDEE"), "MEMBER", now, opts)).toMatchObject({ canViewRecap: false, canEditRecap: false });
    expect(computeMyActions(meeting({}), att("ATTENDEE"), "MEMBER", now, { ...opts, flags: { hasPublishedRecap: true } })).toMatchObject({ canViewRecap: true, canEditRecap: false });
    expect(computeMyActions(meeting({}), att("HOST"), "MEMBER", now, opts)).toMatchObject({ canViewRecap: true, canEditRecap: true });
    expect(computeMyActions(meeting({}), att("CO_HOST"), "MEMBER", now, opts)).toMatchObject({ canViewRecap: true, canEditRecap: true });
  });

  it("tác giả biên bản (không còn là chủ trì) vẫn xem + sửa được; người ngoài danh sách thì không", () => {
    const flags = { isRecapAuthor: true };
    expect(computeMyActions(meeting({}), att("ATTENDEE"), "MEMBER", now, { ...opts, flags })).toMatchObject({ canViewRecap: true, canEditRecap: true });
    expect(computeMyActions(meeting({ status: "LIVE" }), att("ATTENDEE"), "MEMBER", now, { ...opts, flags })).toMatchObject({ canViewRecap: true, canEditRecap: true });
    expect(computeMyActions(meeting({}), null, "MEMBER", now, { ...opts, flags })).toMatchObject({ canViewRecap: false, canEditRecap: false });
  });

  it("LIVE: người tham dự thường xem được biên bản đã công bố (từ phiên trước) nhưng không sửa; ghi hình chỉ chủ trì khi cuộc họp cho phép", () => {
    const live = meeting({ status: "LIVE" });
    expect(computeMyActions(live, att("ATTENDEE"), "MEMBER", now, { ...opts, flags: { hasPublishedRecap: true } })).toMatchObject({ canViewRecap: true, canEditRecap: false, canRecord: false });
    expect(computeMyActions(live, att("HOST"), "MEMBER", now, opts)).toMatchObject({ canRecord: true, canViewRecap: true, canEditRecap: true });
    expect(computeMyActions(meeting({ status: "LIVE", recordingAllowed: false }), att("HOST"), "MEMBER", now, opts).canRecord).toBe(false);
    expect(computeMyActions(meeting({ status: "LIVE", platform: "ZOOM" }), att("HOST"), "MEMBER", now, opts).canRecord).toBe(false);
  });

  it("xoá cuộc họp ENDED: chủ trì không xoá được khi đã có biên bản/bản ghi (chỉ OWNER kèm lý do)", () => {
    expect(computeMyActions(meeting({}), att("HOST"), "MEMBER", now, opts).canDelete).toBe(true);
    expect(computeMyActions(meeting({}), att("HOST"), "MEMBER", now, { ...opts, flags: { hasPublishedRecap: true } }).canDelete).toBe(false);
    expect(computeMyActions(meeting({}), att("HOST"), "MEMBER", now, { ...opts, flags: { readyRecordingCount: 2 } }).canDelete).toBe(false);
    expect(computeMyActions(meeting({}), null, "OWNER", now, { ...opts, flags: { readyRecordingCount: 2 } }).canDelete).toBe(true);
  });
});
