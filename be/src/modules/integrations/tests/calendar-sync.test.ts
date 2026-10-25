import type { CalendarEventInput, CalendarEventRef, ICalendarClient } from "../providers/google-calendar.provider";
import { ProviderAuthError, type TokenSet } from "../providers/provider.interface";
import { sealCredentials } from "../services/credential.vault";
import { CalendarSyncService } from "../services/calendar-sync.service";
import type { CalendarMeetingInfo, IMeetingCalendarReader } from "../services/integration.ports";
import { FakeGoogleProvider, makeHarness, type Harness } from "./support/integration-harness";

const U1 = "650000000000000000000101";
const U2 = "650000000000000000000102";
const M = "650000000000000000000201";

class FakeCalendar implements ICalendarClient {
  inserts = 0;
  patches = 0;
  deletes: string[] = [];
  tokensSeen: string[] = [];
  failNext: Error | null = null;
  upsertEvent(tokens: TokenSet, _cal: string, input: CalendarEventInput, existing: CalendarEventRef | null): Promise<CalendarEventRef> {
    this.tokensSeen.push(tokens.accessToken);
    if (this.failNext) {
      const err = this.failNext;
      this.failNext = null;
      return Promise.reject(err);
    }
    if (existing) this.patches += 1;
    else this.inserts += 1;
    return Promise.resolve({ externalEventId: existing?.externalEventId ?? `g-${input.meetingId}-${input.userId}`, etag: `e${this.inserts + this.patches}` });
  }
  deleteEvent(_t: TokenSet, _cal: string, id: string): Promise<void> {
    this.deletes.push(id);
    return Promise.resolve();
  }
}

class FakeMeetings implements IMeetingCalendarReader {
  meeting: CalendarMeetingInfo = {
    id: M,
    code: "abc-defg-hij",
    title: "Họp nhóm",
    agenda: "Chốt sprint",
    location: null,
    externalUrl: null,
    startAt: new Date(Date.now() + 86_400_000),
    endAt: new Date(Date.now() + 90_000_000),
    timezone: "Asia/Ho_Chi_Minh",
    status: "SCHEDULED",
    deleted: false,
    version: 1,
    attendeeIds: [U1, U2],
  };
  getMeeting = (id: string) => Promise.resolve(id === M ? { ...this.meeting } : null);
  listUpcomingForUser = () => Promise.resolve([{ meetingId: M, version: this.meeting.version }]);
  endTimes = (ids: string[]) => Promise.resolve(new Map(ids.map((i) => [i, this.meeting.endAt])));
}

let h: Harness;
let google: FakeGoogleProvider;
let calendar: FakeCalendar;
let meetings: FakeMeetings;
let sync: CalendarSyncService;

async function connectU1(expiresInMs = 3_600_000): Promise<string> {
  const ui = await h.userIntegrations.upsert({
    userId: U1,
    provider: "GOOGLE_CALENDAR",
    externalAccountId: "u1@gmail.com",
    credentials: sealCredentials({ accessToken: "at-1", refreshToken: "rt-1" }),
    tokenExpiresAt: new Date(Date.now() + expiresInMs),
  });
  return ui.id;
}

/** Chạy mọi job lịch đã xếp (như worker), rồi xoá hàng đợi. */
async function drain(): Promise<string[]> {
  const jobs = h.jobs.calendar.splice(0);
  const out: string[] = [];
  for (const job of jobs) out.push(await sync.syncMeeting(job));
  return out;
}

beforeEach(() => {
  google = new FakeGoogleProvider();
  h = makeHarness([google]);
  calendar = new FakeCalendar();
  meetings = new FakeMeetings();
  sync = new CalendarSyncService({
    userIntegrations: h.userIntegrations,
    calendarLinks: h.calendarLinks,
    meetings,
    calendar,
    tokens: h.deps.tokens,
    status: h.deps.status,
    jobs: h.jobs,
    availability: h.deps.availability,
    meetingUrl: (code) => `https://web.test/m/${code}`,
    now: () => new Date(),
  });
});

describe("INT-07 — tạo / đổi giờ / huỷ cuộc họp", () => {
  it("mỗi thay đổi đẩy lên Google ĐÚNG MỘT lần, chỉ cho người đã nối lịch", async () => {
    await connectU1();
    expect(await sync.onMeetingEvent({ event: "created", meetingId: M, version: 1 })).toBe(1);
    expect(h.jobs.calendar[0]).toMatchObject({ userId: U1, change: "UPSERT", version: 1 });
    expect(await drain()).toEqual(["SYNCED"]);
    expect(calendar.inserts).toBe(1);
    // Job chạy lại (retry/trùng sự kiện) → bỏ qua nhờ `syncedVersion`.
    expect(await sync.syncMeeting({ meetingId: M, userId: U1, version: 1, change: "UPSERT" })).toBe("SKIPPED");

    meetings.meeting = { ...meetings.meeting, version: 2, startAt: new Date(Date.now() + 2 * 86_400_000) };
    await sync.onMeetingEvent({ event: "updated", meetingId: M, version: 2 });
    expect(await drain()).toEqual(["SYNCED"]);
    expect(calendar.patches).toBe(1);
    expect(calendar.inserts).toBe(1);

    meetings.meeting = { ...meetings.meeting, version: 3, status: "CANCELLED" };
    await sync.onMeetingEvent({ event: "cancelled", meetingId: M, version: 3 });
    expect(h.jobs.calendar).toEqual([{ meetingId: M, userId: U1, version: 3, change: "DELETE" }]);
    expect(await drain()).toEqual(["DELETED"]);
    expect(calendar.deletes).toEqual([`g-${M}-${U1}`]);
    expect(await sync.syncMeeting({ meetingId: M, userId: U1, version: 3, change: "DELETE" })).toBe("SKIPPED");
    expect(calendar.deletes).toHaveLength(1);
    expect((await h.calendarLinks.find(M, U1))?.deletedAt).toBeInstanceOf(Date);
  });

  it("người bị gỡ khỏi cuộc họp → sự kiện bị xoá; sự kiện lệch thứ tự vẫn hội tụ theo trạng thái hiện tại", async () => {
    await connectU1();
    await sync.onMeetingEvent({ event: "created", meetingId: M, version: 1 });
    meetings.meeting = { ...meetings.meeting, version: 2, attendeeIds: [U2] };
    // Job v1 chạy SAU khi cuộc họp đã sang v2 (U1 đã bị gỡ) → không tạo sự kiện.
    expect(await drain()).toEqual(["SKIPPED"]);
    expect(calendar.inserts).toBe(0);
    await sync.onMeetingEvent({ event: "attendees-changed", meetingId: M, version: 2 });
    expect(h.jobs.calendar).toHaveLength(0);
  });

  it("admin tắt Google Calendar → không xếp job", async () => {
    await connectU1();
    h.flags.providers["google-calendar"] = false;
    expect(await sync.onMeetingEvent({ event: "created", meetingId: M, version: 1 })).toBe(0);
  });
});

describe("CW-04 — token Google hết hạn / bị thu hồi", () => {
  it("token sắp hết hạn → làm mới rồi đồng bộ bằng token mới, hẹn lượt làm mới kế tiếp", async () => {
    const id = await connectU1(30_000);
    await sync.onMeetingEvent({ event: "created", meetingId: M, version: 1 });
    expect(await drain()).toEqual(["SYNCED"]);
    expect(google.refreshCalls).toBe(1);
    expect(calendar.tokensSeen).toEqual(["at-2"]);
    expect(h.jobs.refreshes).toEqual([expect.objectContaining({ kind: "USER", id })]);
    expect((await h.userIntegrations.findById(id))?.status).toBe("ACTIVE");
  });

  it("Google trả 401 giữa chừng → làm mới một lần rồi thử lại thành công", async () => {
    await connectU1();
    calendar.failNext = new ProviderAuthError("unauthorized", "401");
    await sync.onMeetingEvent({ event: "created", meetingId: M, version: 1 });
    expect(await drain()).toEqual(["SYNCED"]);
    expect(google.refreshCalls).toBe(1);
    expect(calendar.tokensSeen).toEqual(["at-1", "at-2"]);
  });

  it("invalid_grant → REVOKED, xoá token, thông báo INTEGRATION_ERROR tới chủ tài khoản, không thử lại", async () => {
    const id = await connectU1(30_000);
    google.refreshWith = new ProviderAuthError("invalid_grant", "Token has been expired or revoked.");
    await sync.onMeetingEvent({ event: "created", meetingId: M, version: 1 });
    expect(await drain()).toEqual(["REVOKED"]);
    expect(calendar.inserts).toBe(0);
    const ui = await h.userIntegrations.findById(id);
    expect(ui).toMatchObject({ status: "REVOKED", statusReason: "TOKEN_INVALID", credentials: null });
    expect(h.notifier.notices).toEqual([expect.objectContaining({ subjectId: id, recipientIds: [U1], reason: "TOKEN_INVALID" })]);
    // Job kế tiếp của kết nối đã thu hồi → bỏ qua (không gọi Google, không thông báo lặp).
    expect(await sync.syncMeeting({ meetingId: M, userId: U1, version: 2, change: "UPSERT" })).toBe("SKIPPED");
    expect(h.notifier.notices).toHaveLength(1);
  });

  it("job integration.token-refresh: làm mới trước hạn; job cũ (mốc hết hạn khác) bị bỏ qua", async () => {
    const id = await connectU1(200_000);
    const ui = await h.userIntegrations.findById(id);
    expect(await h.deps.tokens.refreshUser(id, 123)).toBe("SKIPPED");
    expect(await h.deps.tokens.refreshUser(id, ui!.tokenExpiresAt!.getTime())).toBe("REFRESHED");
    expect(google.refreshCalls).toBe(1);
    google.refreshWith = new ProviderAuthError("invalid_grant", "revoked");
    const fresh = await h.userIntegrations.findById(id);
    expect(await h.deps.tokens.refreshUser(id, fresh!.tokenExpiresAt!.getTime())).toBe("REVOKED");
    expect((await h.userIntegrations.findById(id))?.status).toBe("REVOKED");
  });
});

describe("ngắt kết nối", () => {
  it("dọn sự kiện tương lai, xoá liên kết + kết nối; đã nối lại thì bỏ qua", async () => {
    const id = await connectU1();
    await sync.onMeetingEvent({ event: "created", meetingId: M, version: 1 });
    await drain();
    await h.userIntegrations.setStatus(id, "DISABLED", "DISCONNECTING");
    expect(await sync.cleanupUser(id)).toBe("CLEANED");
    expect(calendar.deletes).toEqual([`g-${M}-${U1}`]);
    expect(await h.userIntegrations.findById(id)).toBeNull();
    expect(h.calendarLinks.rows.size).toBe(0);
    const again = await connectU1();
    expect(await sync.cleanupUser(again)).toBe("SKIPPED");
  });
});
