import { adminCallListQuerySchema, adminMeetingListQuerySchema, callStatsQuerySchema, forceEndSchema, workspaceMediaStatsQuerySchema } from "../dtos";

/** DTO của p2-07: trường lạ → lỗi (đặc biệt `userId`/`conversationId` cho cuộc gọi, OPC-05); CSV enum; lý do bắt buộc 10–500 ký tự. */
const OID = "66f000000000000000000001";

describe("adminCallListQuerySchema", () => {
  it("mặc định phân trang + sort; nhận bộ lọc hợp lệ, status/endReason dạng CSV hoặc lặp tham số", () => {
    expect(adminCallListQuerySchema.parse({})).toMatchObject({ page: 1, limit: 20, sort: "-startedAt" });
    const q = adminCallListQuerySchema.parse({ status: "ACTIVE,ENDED", endReason: ["FORCE_ENDED", "EMPTY"], scopeType: "CHANNEL", mode: "ROOM", workspaceId: OID });
    expect(q).toMatchObject({ status: ["ACTIVE", "ENDED"], endReason: ["FORCE_ENDED", "EMPTY"], scopeType: "CHANNEL", mode: "ROOM", workspaceId: OID });
  });

  it.each(["userId", "conversationId", "scopeId", "initiatorId", "hostId"])("KHÔNG nhận %s (lọc theo người/hội thoại làm lộ ai gọi ai ở cuộc gọi 1-1)", (key) => {
    expect(adminCallListQuerySchema.safeParse({ [key]: OID }).success).toBe(false);
  });

  it("trần limit 50; page ≥ 1; giá trị enum lạ → lỗi; to < from → lỗi; meetingId phải đi với scopeType=MEETING", () => {
    expect(adminCallListQuerySchema.safeParse({ limit: 51 }).success).toBe(false);
    expect(adminCallListQuerySchema.safeParse({ page: 0 }).success).toBe(false);
    expect(adminCallListQuerySchema.safeParse({ status: "KHONG-CO" }).success).toBe(false);
    expect(adminCallListQuerySchema.safeParse({ endReason: "KHONG-CO" }).success).toBe(false);
    expect(adminCallListQuerySchema.safeParse({ from: "2026-09-02", to: "2026-09-01" }).success).toBe(false);
    expect(adminCallListQuerySchema.safeParse({ meetingId: OID, scopeType: "CHANNEL" }).success).toBe(false);
    expect(adminCallListQuerySchema.safeParse({ meetingId: OID }).success).toBe(true);
    expect(adminCallListQuerySchema.safeParse({ meetingId: OID, scopeType: "MEETING" }).success).toBe(true);
  });
});

describe("adminMeetingListQuerySchema", () => {
  it("q ≥ 2 ký tự; status CSV; platform enum; sort hợp lệ; trường lạ (hostId, attendeeId, userId) → lỗi", () => {
    expect(adminMeetingListQuerySchema.parse({ q: "họp", status: "LIVE,ENDED", platform: "ZOOM", sort: "-attendeeCount" })).toMatchObject({ q: "họp", status: ["LIVE", "ENDED"], platform: "ZOOM", sort: "-attendeeCount" });
    expect(adminMeetingListQuerySchema.safeParse({ q: "a" }).success).toBe(false);
    expect(adminMeetingListQuerySchema.safeParse({ sort: "hostId" }).success).toBe(false);
    for (const key of ["hostId", "attendeeId", "userId"]) expect(adminMeetingListQuerySchema.safeParse({ [key]: OID }).success).toBe(false);
  });
});

describe("callStatsQuerySchema / workspaceMediaStatsQuerySchema", () => {
  it("from/to bắt buộc, tz mặc định Asia/Ho_Chi_Minh; trường lạ → lỗi (khoảng > 92 ngày do SERVICE trả ADMIN_MEDIA_001)", () => {
    const q = callStatsQuerySchema.parse({ from: "2026-09-01T00:00:00Z", to: "2026-09-08T00:00:00Z" });
    expect(q.tz).toBe("Asia/Ho_Chi_Minh");
    expect(callStatsQuerySchema.safeParse({ from: "2026-09-01T00:00:00Z" }).success).toBe(false);
    expect(callStatsQuerySchema.safeParse({ from: "2026-09-01", to: "2026-09-08", userId: OID }).success).toBe(false);
    expect(callStatsQuerySchema.safeParse({ from: "2026-01-01", to: "2027-01-01" }).success).toBe(true);
  });

  it("days 1–92, mặc định 30", () => {
    expect(workspaceMediaStatsQuerySchema.parse({}).days).toBe(30);
    expect(workspaceMediaStatsQuerySchema.safeParse({ days: 93 }).success).toBe(false);
    expect(workspaceMediaStatsQuerySchema.safeParse({ days: 0 }).success).toBe(false);
  });
});

describe("forceEndSchema", () => {
  it("lý do 10–500 ký tự (đã trim); thiếu/ngắn/dài/trường lạ → lỗi", () => {
    expect(forceEndSchema.parse({ reason: "  Phòng treo sau sự cố  " }).reason).toBe("Phòng treo sau sự cố");
    expect(forceEndSchema.safeParse({}).success).toBe(false);
    expect(forceEndSchema.safeParse({ reason: "ngắn" }).success).toBe(false);
    expect(forceEndSchema.safeParse({ reason: "x".repeat(501) }).success).toBe(false);
    expect(forceEndSchema.safeParse({ reason: "Lý do đủ dài rồi", extra: 1 }).success).toBe(false);
  });
});
