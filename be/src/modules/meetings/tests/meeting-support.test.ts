import { isValidMeetingExternalUrl } from "../../../core/constants/meeting-platforms";
import { isValidIanaTimeZone } from "../../../core/utils/timezone";
import { buildIcs, escapeIcsText, foldIcsLine, formatIcsDateTime } from "../../../infrastructure/mail/ics/ics-builder";
import { MEETING_CODE_ALPHABET, MEETING_CODE_REGEX, nextMeetingCode, randomMeetingCode } from "../services/meeting-code.generator";
import { formatMeetingTime, meetingIcsUid } from "../services/meeting-ics.service";
import { createMeetingSchema } from "../dtos";

describe("MeetingCodeGenerator", () => {
  it("dạng abc-defg-hij, chỉ 23 ký tự bỏ i/l/o, khớp regex resolve", () => {
    expect(MEETING_CODE_ALPHABET).toHaveLength(23);
    expect(MEETING_CODE_ALPHABET).not.toMatch(/[ilo]/);
    for (let i = 0; i < 500; i += 1) expect(randomMeetingCode()).toMatch(MEETING_CODE_REGEX);
  });

  it("thử lại khi trùng và dừng sau 5 lần", async () => {
    const seq = ["aaa-aaaa-aaa", "aaa-aaaa-aaa", "bbb-bbbb-bbb"];
    let i = 0;
    const taken = new Set(["aaa-aaaa-aaa"]);
    await expect(nextMeetingCode((c) => Promise.resolve(taken.has(c)), () => seq[i++]!)).resolves.toBe("bbb-bbbb-bbb");
    await expect(nextMeetingCode(() => Promise.resolve(true), () => "aaa-aaaa-aaa")).rejects.toMatchObject({ errorCode: "SYS_500" });
  });
});

describe("MEETING_PLATFORM_HOSTS / isValidMeetingExternalUrl (MT-13)", () => {
  it.each([
    ["ZOOM", "https://us02web.zoom.us/j/123", true],
    ["ZOOM", "https://zoom.us/j/123", true],
    ["ZOOM", "http://zoom.us/j/123", false],
    ["ZOOM", "https://evil.com/zoom.us", false],
    ["ZOOM", "https://zoom.us.evil.com/j/1", false],
    ["ZOOM", "https://user:pw@zoom.us/j/1", false],
    ["TEAMS", "https://teams.microsoft.com/l/meetup-join/x", true],
    ["TEAMS", "https://teams.live.com/meet/1", true],
    ["GOOGLE_MEET", "https://meet.google.com/abc-defg-hij", true],
    ["GOOGLE_MEET", "https://zoom.us/j/1", false],
    ["OTHER", "https://bat-ky.example.org/phong", true],
    ["OTHER", "http://bat-ky.example.org/phong", false],
    ["OTHER", "khong-phai-url", false],
  ] as const)("%s %s → %s", (platform, url, ok) => {
    expect(isValidMeetingExternalUrl(platform, url)).toBe(ok);
  });
});

describe("ICS builder (RFC 5545)", () => {
  const base = {
    uid: "665f00000000000000000001@superapp.vcijsc.com",
    sequence: 3,
    summary: "Họp tuần, nhóm A; hạng mục \\1",
    description: "Dòng 1\nDòng 2",
    location: "Phòng 3, tầng 2",
    url: "https://superapp.vcijsc.com/m/abc-defg-hij",
    startAt: new Date("2026-06-15T02:00:00.000Z"),
    endAt: new Date("2026-06-15T03:30:00.000Z"),
    timezone: "Asia/Ho_Chi_Minh",
    organizer: { email: "no-reply@superapp.vcijsc.com", name: "Super App" },
    now: new Date("2026-06-01T00:00:00.000Z"),
  };

  it("REQUEST: UID/SEQUENCE/DTSTART UTC/X-WR-TIMEZONE, CRLF, escape , ; \\ và xuống dòng", () => {
    const ics = buildIcs({ ...base, method: "REQUEST", attendeeEmails: ["b@e.com"] });
    expect(ics.startsWith("BEGIN:VCALENDAR\r\n")).toBe(true);
    expect(ics.endsWith("END:VCALENDAR\r\n")).toBe(true);
    expect(ics).toContain("METHOD:REQUEST\r\n");
    expect(ics).toContain(`UID:${base.uid}\r\n`);
    expect(ics).toContain("SEQUENCE:3\r\n");
    expect(ics).toContain("DTSTART:20260615T020000Z\r\n");
    expect(ics).toContain("DTEND:20260615T033000Z\r\n");
    expect(ics).toContain("DTSTAMP:20260601T000000Z\r\n");
    expect(ics).toContain("X-WR-TIMEZONE:Asia/Ho_Chi_Minh\r\n");
    expect(ics).toContain("SUMMARY:Họp tuần\\, nhóm A\\; hạng mục \\\\1\r\n");
    expect(ics).toContain("DESCRIPTION:Dòng 1\\nDòng 2\r\n");
    expect(ics).toContain("LOCATION:Phòng 3\\, tầng 2\r\n");
    expect(ics).toContain("STATUS:CONFIRMED\r\n");
    expect(ics).toContain("ATTENDEE;ROLE=REQ-PARTICIPANT;RSVP=FALSE:mailto:b@e.com\r\n");
    expect(ics.replace(/\r\n/g, "")).not.toMatch(/[\r\n]/);
  });

  it("CANCEL: cùng UID, STATUS:CANCELLED, SEQUENCE tăng; PUBLISH cho tải về", () => {
    const cancel = buildIcs({ ...base, method: "CANCEL", sequence: 4 });
    expect(cancel).toContain("METHOD:CANCEL\r\n");
    expect(cancel).toContain(`UID:${base.uid}\r\n`);
    expect(cancel).toContain("SEQUENCE:4\r\n");
    expect(cancel).toContain("STATUS:CANCELLED\r\n");
    expect(buildIcs({ ...base, method: "PUBLISH" })).toContain("METHOD:PUBLISH\r\n");
  });

  it("gấp dòng ≤ 75 octet, không cắt giữa ký tự nhiều byte, dòng tiếp bắt đầu bằng 1 khoảng trắng", () => {
    const long = `DESCRIPTION:${"Tiếng Việt có dấu ".repeat(20)}`;
    const folded = foldIcsLine(long);
    for (const line of folded.split("\r\n")) expect(Buffer.byteLength(line, "utf8")).toBeLessThanOrEqual(75);
    expect(folded.split("\r\n").slice(1).every((l) => l.startsWith(" "))).toBe(true);
    expect(folded.replace(/\r\n /g, "")).toBe(long);
  });

  it("tiện ích: escape, định dạng ngày UTC, UID ổn định, nhãn giờ theo múi giờ cuộc họp", () => {
    expect(escapeIcsText("a,b;c\\d\ne")).toBe("a\\,b\\;c\\\\d\\ne");
    expect(formatIcsDateTime(new Date("2026-01-02T03:04:05.000Z"))).toBe("20260102T030405Z");
    expect(meetingIcsUid("abc")).toBe("abc@superapp.vcijsc.com");
    const label = formatMeetingTime({ startAt: base.startAt, endAt: base.endAt, timezone: "Asia/Ho_Chi_Minh" });
    expect(label).toContain("09:00");
    expect(label).toContain("10:30");
    expect(label).toContain("(Asia/Ho_Chi_Minh)");
    expect(formatMeetingTime({ startAt: base.startAt, endAt: base.endAt, timezone: "Asia/Tokyo" })).toContain("11:00"); // MT-19: cùng khoảnh khắc, múi giờ khác
  });
});

describe("timezone + createMeetingSchema (MT-02)", () => {
  const ok = { title: "Họp", timezone: "Asia/Ho_Chi_Minh", startAt: "2026-06-15T02:00:00Z", endAt: "2026-06-15T03:00:00Z" };

  it("múi giờ IANA hợp lệ/không hợp lệ", () => {
    expect(isValidIanaTimeZone("Asia/Ho_Chi_Minh")).toBe(true);
    expect(isValidIanaTimeZone("UTC")).toBe(true);
    expect(isValidIanaTimeZone("Mars/Olympus")).toBe(false);
    expect(isValidIanaTimeZone("")).toBe(false);
  });

  it("mặc định đúng và mã lỗi nghiệp vụ nằm ở message", () => {
    const parsed = createMeetingSchema.parse(ok);
    expect(parsed).toMatchObject({ format: "ONLINE", platform: "INTERNAL", visibility: "ATTENDEES", lobbyMode: "NON_ATTENDEES", reminderMinutes: [15], notifyVia: "APP", createChatGroup: false, attendeeIds: [] });
    const messages = (input: object) => (createMeetingSchema.safeParse(input).success ? [] : createMeetingSchema.safeParse(input).error!.issues.map((i) => i.message));
    expect(messages({ ...ok, endAt: ok.startAt })).toContain("MEET_003");
    expect(messages({ ...ok, endAt: "2026-06-16T02:00:01Z" })).toContain("MEET_003"); // > 24 giờ
    expect(messages({ ...ok, platform: "ZOOM" })).toContain("MEET_015"); // thiếu externalUrl
    expect(messages({ ...ok, format: "OFFLINE", platform: "ZOOM", externalUrl: "https://zoom.us/j/1" })).toContain("MEET_015");
    expect(messages({ ...ok, reminderMinutes: [7] }).length).toBeGreaterThan(0); // mốc không hỗ trợ
    expect(messages({ ...ok, reminderMinutes: [5, 10, 15, 30] }).length).toBeGreaterThan(0); // > 3 mốc
    expect(messages({ ...ok, timezone: "Nowhere/City" }).length).toBeGreaterThan(0);
    expect(messages({ ...ok, title: "   " }).length).toBeGreaterThan(0);
  });
});
