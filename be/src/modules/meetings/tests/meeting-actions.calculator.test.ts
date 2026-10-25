import type { AttendeeEntity, MeetingEntity, MyMeetingActions } from "../entities/meeting.interface";
import { computeMyActions, joinOpensAt } from "../services/meeting-actions.calculator";

const T0 = new Date("2026-06-15T02:00:00.000Z"); // giờ bắt đầu
const meeting = (over: Partial<MeetingEntity> = {}): MeetingEntity =>
  ({
    id: "m1",
    workspaceId: "w1",
    code: "abc-defg-hij",
    title: "Họp",
    status: "SCHEDULED",
    platform: "INTERNAL",
    visibility: "ATTENDEES",
    lobbyMode: "NON_ATTENDEES",
    joinWindowMinutes: 10,
    recordingAllowed: true,
    startAt: T0,
    endAt: new Date(T0.getTime() + 3_600_000),
    ...over,
  }) as MeetingEntity;
const att = (role: AttendeeEntity["role"]): Pick<AttendeeEntity, "role" | "removedAt"> => ({ role, removedAt: null });
const opts = { restartWindowMinutes: 60 };
const at = (minutesFromStart: number): Date => new Date(T0.getTime() + minutesFromStart * 60_000);

/** Chỉ đối chiếu các cờ `true` (+ `joinVia`) để bảng dễ đọc; cờ không liệt kê phải `false`/`null`. */
function expectActions(actual: MyMeetingActions, expected: Partial<MyMeetingActions>): void {
  const base: MyMeetingActions = {
    canEdit: false, canEditLimited: false, canManageAttendees: false, canManageRoles: false, canCancel: false, cancelRequiresReason: false,
    canDelete: false, canStart: false, canJoin: false, joinVia: null, canEnd: false, canOpenExternal: false, canRsvp: false,
    canLeaveAttendance: false, canViewRecap: false, canEditRecap: false, canRecord: false,
  };
  expect(actual).toEqual({ ...base, ...expected });
}

describe("MeetingActionsCalculator — bảng README §6.2 (MT-12, table-driven)", () => {
  const before = at(-30); // ngoài cửa sổ vào (10 phút trước giờ)
  const inWindow = at(-5); // trong cửa sổ vào

  const cases: Array<[string, Partial<MeetingEntity>, ReturnType<typeof att> | null, "OWNER" | "ADMIN" | "MEMBER" | "GUEST" | null, Date, Partial<MyMeetingActions>]> = [
    // ── SCHEDULED ─────────────────────────────────────────────────────────────
    ["SCHEDULED · HOST · ngoài cửa sổ", {}, att("HOST"), "MEMBER", before, { canEdit: true, canManageAttendees: true, canManageRoles: true, canCancel: true, canDelete: true, canRsvp: true }],
    ["SCHEDULED · HOST · trong cửa sổ → được bắt đầu", {}, att("HOST"), "MEMBER", inWindow, { canEdit: true, canManageAttendees: true, canManageRoles: true, canCancel: true, canDelete: true, canStart: true, canRsvp: true }],
    ["SCHEDULED · CO_HOST · trong cửa sổ", {}, att("CO_HOST"), "MEMBER", inWindow, { canEdit: true, canManageAttendees: true, canCancel: true, canStart: true, canRsvp: true, canLeaveAttendance: true }],
    ["SCHEDULED · ATTENDEE · ngoài cửa sổ", {}, att("ATTENDEE"), "MEMBER", before, { canRsvp: true, canLeaveAttendance: true }],
    ["SCHEDULED · ATTENDEE · trong cửa sổ → vào chờ chủ trì", {}, att("ATTENDEE"), "MEMBER", inWindow, { canRsvp: true, canLeaveAttendance: true, canJoin: true, joinVia: "WAIT_FOR_HOST" }],
    ["SCHEDULED · ATTENDEE · nền tảng ngoài → mở link, không vào phòng", { platform: "ZOOM" }, att("ATTENDEE"), "MEMBER", inWindow, { canRsvp: true, canLeaveAttendance: true, canOpenExternal: true }],
    ["SCHEDULED · thành viên WS (WORKSPACE, lobby ≠ OFF) · trong cửa sổ → qua lobby", { visibility: "WORKSPACE" }, null, "MEMBER", inWindow, { canJoin: true, joinVia: "LOBBY" }],
    ["SCHEDULED · thành viên WS (WORKSPACE, lobby OFF) · trong cửa sổ → chờ như attendee", { visibility: "WORKSPACE", lobbyMode: "OFF" }, null, "MEMBER", inWindow, { canJoin: true, joinVia: "WAIT_FOR_HOST" }],
    ["SCHEDULED · thành viên WS (WORKSPACE) · ngoài cửa sổ", { visibility: "WORKSPACE" }, null, "MEMBER", before, {}],
    ["SCHEDULED · OWNER WS không tham dự (ATTENDEES) → chỉ huỷ có lý do + xoá", {}, null, "OWNER", before, { canCancel: true, cancelRequiresReason: true, canDelete: true }],
    ["SCHEDULED · ADMIN WS không tham dự → chỉ huỷ có lý do", {}, null, "ADMIN", before, { canCancel: true, cancelRequiresReason: true }],
    ["SCHEDULED · MEMBER WS không tham dự (ATTENDEES) → không làm được gì", {}, null, "MEMBER", inWindow, {}],
    ["SCHEDULED · GUEST WS (WORKSPACE) không tham dự → không làm được gì", { visibility: "WORKSPACE" }, null, "GUEST", inWindow, {}],
    // ── LIVE ──────────────────────────────────────────────────────────────────
    ["LIVE · HOST", { status: "LIVE" }, att("HOST"), "MEMBER", at(20), { canEditLimited: true, canManageAttendees: true, canManageRoles: true, canJoin: true, joinVia: "DIRECT", canEnd: true, canRsvp: true, canViewRecap: true, canEditRecap: true, canRecord: true }],
    ["LIVE · CO_HOST · ghi hình tắt", { status: "LIVE", recordingAllowed: false }, att("CO_HOST"), "MEMBER", at(20), { canEditLimited: true, canManageAttendees: true, canJoin: true, joinVia: "DIRECT", canEnd: true, canRsvp: true, canViewRecap: true, canEditRecap: true }],
    ["LIVE · ATTENDEE", { status: "LIVE" }, att("ATTENDEE"), "MEMBER", at(20), { canJoin: true, joinVia: "DIRECT", canRsvp: true }],
    ["LIVE · thành viên WS (WORKSPACE, lobby ≠ OFF) → qua lobby", { status: "LIVE", visibility: "WORKSPACE" }, null, "MEMBER", at(20), { canJoin: true, joinVia: "LOBBY" }],
    ["LIVE · OWNER WS không tham dự → metadata, không hành động", { status: "LIVE" }, null, "OWNER", at(20), {}],
    // ── ENDED ─────────────────────────────────────────────────────────────────
    ["ENDED · HOST · còn trong cửa sổ bắt đầu lại", { status: "ENDED" }, att("HOST"), "MEMBER", at(90), { canStart: true, canDelete: true, canViewRecap: true, canEditRecap: true }],
    ["ENDED · HOST · quá cửa sổ bắt đầu lại (endAt + 60 phút)", { status: "ENDED" }, att("HOST"), "MEMBER", at(200), { canDelete: true, canViewRecap: true, canEditRecap: true }],
    ["ENDED · ATTENDEE · biên bản chưa công bố", { status: "ENDED" }, att("ATTENDEE"), "MEMBER", at(90), {}],
    // ── CANCELLED ─────────────────────────────────────────────────────────────
    ["CANCELLED · HOST", { status: "CANCELLED" }, att("HOST"), "MEMBER", before, { canDelete: true }],
    ["CANCELLED · ATTENDEE", { status: "CANCELLED" }, att("ATTENDEE"), "MEMBER", before, {}],
    ["CANCELLED · OWNER WS không tham dự", { status: "CANCELLED" }, null, "OWNER", before, { canDelete: true }],
  ];

  it.each(cases)("%s", (_name, over, attendee, wsRole, now, expected) => {
    expectActions(computeMyActions(meeting(over), attendee, wsRole, now, opts), expected);
  });

  it("ENDED có biên bản đã công bố/ghi hình READY: HOST không xoá được; người tham dự thấy biên bản đã công bố", () => {
    const flags = { hasPublishedRecap: true, readyRecordingCount: 1 };
    const host = computeMyActions(meeting({ status: "ENDED" }), att("HOST"), "MEMBER", at(90), { ...opts, flags });
    expect(host.canDelete).toBe(false);
    const attendee = computeMyActions(meeting({ status: "ENDED" }), att("ATTENDEE"), "MEMBER", at(90), { ...opts, flags });
    expect(attendee.canViewRecap).toBe(true);
    expect(attendee.canEditRecap).toBe(false);
    const owner = computeMyActions(meeting({ status: "ENDED" }), null, "OWNER", at(90), { ...opts, flags });
    expect(owner.canDelete).toBe(true); // OWNER xoá kèm lý do + audit (service kiểm)
  });

  it("người bị loại khỏi PHIÊN họp LIVE (blockedFromCall) không vào lại được", () => {
    const a = computeMyActions(meeting({ status: "LIVE" }), att("ATTENDEE"), "MEMBER", at(20), { ...opts, flags: { blockedFromCall: true } });
    expect(a.canJoin).toBe(false);
    expect(a.joinVia).toBeNull();
  });

  it("attendee đã bị xoá (removedAt) chỉ còn quyền theo vai trò workspace", () => {
    const removed = { role: "ATTENDEE" as const, removedAt: new Date() };
    expectActions(computeMyActions(meeting({ visibility: "WORKSPACE" }), removed, "MEMBER", inWindow, opts), { canJoin: true, joinVia: "LOBBY" });
    expectActions(computeMyActions(meeting(), removed, "MEMBER", inWindow, opts), {});
  });

  it("joinOpensAt = startAt − joinWindowMinutes", () => {
    expect(joinOpensAt(meeting()).toISOString()).toBe("2026-06-15T01:50:00.000Z");
    expect(joinOpensAt(meeting({ joinWindowMinutes: 0 })).toISOString()).toBe(T0.toISOString());
  });
});
