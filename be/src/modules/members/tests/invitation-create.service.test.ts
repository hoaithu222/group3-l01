/**
 * Unit — `InvitationCreateService` (be.md p3-04 §4/§5.3): CHỈ các nhánh throw/return TRƯỚC KHI chạm `withTransaction()`
 * (chính sách khách, kênh chỉ định, trùng/đã là thành viên, hạn mức, quyền, cooldown). Nhánh ghi thật (tạo lời mời + outbox +
 * mail, thu hồi, gửi lại đổi token) cần transaction Prisma → `tests/integration/invitations.routes.test.ts`.
 */
import { InvitationCreateService } from "../services/invitation-create.service";
import { ErrorCode } from "../../../core/utils/error.codes";
import type { AuthUser } from "../../../core/types/express";
import {
  ADMIN,
  CH_PRIVATE,
  CH_PUBLIC,
  GUEST,
  MEMBER,
  OUTSIDER,
  OWNER,
  WS,
  buildHarness,
  makeInvitation,
  makeMembership,
  makeUser,
  makeWorkspace,
} from "./support/access-harness";

const ownerUser: AuthUser = { id: OWNER, email: `${OWNER}@e.com` };
const guestDto = { email: "khach@example.com", channelIds: [CH_PUBLIC], days: 7, message: undefined };

function setup(canManage: (actor: AuthUser, channelId: string) => Promise<boolean> = async () => true) {
  const h = buildHarness();
  const service = new InvitationCreateService(h.invitations, h.memberships, h.config, canManage);
  return { h, service };
}

describe("InvitationCreateService — mời khách (inviteGuest)", () => {
  it("nhóm chưa bật mời khách (mặc định nền tảng TẮT) → 409 WS_018", async () => {
    const { h, service } = setup();
    h.invitations.workspaces.set(WS, makeWorkspace({ guestPolicy: null }));
    await expect(service.inviteGuest({ user: ownerUser, role: "OWNER" }, WS, guestDto)).rejects.toMatchObject({
      statusCode: 409,
      errorCode: ErrorCode.WS_018,
    });
  });

  it("đã đủ số khách (ACTIVE + lời mời khách đang chờ ≥ maxGuests) → 409 WS_018", async () => {
    const { h, service } = setup();
    h.invitations.activeGuests.set(WS, 4);
    h.invitations.seed(makeInvitation({ id: "g-pending", role: "GUEST", normalizedEmail: "x@y.z", pendingKey: `${WS}:x@y.z` }));
    await expect(service.inviteGuest({ user: ownerUser, role: "OWNER" }, WS, guestDto)).rejects.toMatchObject({
      errorCode: ErrorCode.WS_018,
    });
  });

  it("số ngày vượt trần của nhóm → 400", async () => {
    const { service } = setup();
    await expect(
      service.inviteGuest({ user: ownerUser, role: "OWNER" }, WS, { ...guestDto, days: 60 }) // policy.maxDays = 30
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it("nhóm đã lưu trữ → 409 WS_002; nhóm không tồn tại → 404", async () => {
    const { h, service } = setup();
    h.invitations.workspaces.set(WS, makeWorkspace({ status: "ARCHIVED" }));
    await expect(service.inviteGuest({ user: ownerUser, role: "OWNER" }, WS, guestDto)).rejects.toMatchObject({
      errorCode: ErrorCode.WS_002,
    });
    await expect(service.inviteGuest({ user: ownerUser, role: "OWNER" }, "ff".repeat(12), guestDto)).rejects.toMatchObject({
      statusCode: 404,
    });
  });

  it("kênh không thuộc nhóm / đã lưu trữ → 400", async () => {
    const { h, service } = setup();
    await expect(
      service.inviteGuest({ user: ownerUser, role: "OWNER" }, WS, { ...guestDto, channelIds: ["ee".repeat(12)] })
    ).rejects.toMatchObject({ statusCode: 400 });

    h.invitations.channels[0] = { ...h.invitations.channels[0], status: "ARCHIVED" };
    await expect(service.inviteGuest({ user: ownerUser, role: "OWNER" }, WS, guestDto)).rejects.toMatchObject({ statusCode: 400 });
  });

  it("kênh RIÊNG TƯ người mời không quản lý → 403 CH_013 (kênh public không cần)", async () => {
    const { service } = setup(async () => false);
    await expect(
      service.inviteGuest({ user: ownerUser, role: "OWNER" }, WS, { ...guestDto, channelIds: [CH_PRIVATE] })
    ).rejects.toMatchObject({ statusCode: 403, errorCode: ErrorCode.CH_013 });
  });

  it("email đã là thành viên ACTIVE → 409 INV_011; đã bị chặn → 403 INV_004", async () => {
    const { h, service } = setup();
    h.invitations.users.set(MEMBER, makeUser(MEMBER, { email: "khach@example.com" }));
    await expect(service.inviteGuest({ user: ownerUser, role: "OWNER" }, WS, guestDto)).rejects.toMatchObject({
      statusCode: 409,
      errorCode: ErrorCode.INV_011,
    });

    h.memberships.seedMembership(makeMembership({ id: "m-banned", userId: MEMBER, status: "BANNED" }));
    await expect(service.inviteGuest({ user: ownerUser, role: "OWNER" }, WS, guestDto)).rejects.toMatchObject({
      statusCode: 403,
      errorCode: ErrorCode.INV_004,
    });
  });

  it("đã có lời mời PENDING còn hạn cho email này → 409 RES_002", async () => {
    const { h, service } = setup();
    h.invitations.seed(makeInvitation({ role: "GUEST", normalizedEmail: "khach@example.com", pendingKey: `${WS}:khach@example.com` }));
    await expect(service.inviteGuest({ user: ownerUser, role: "OWNER" }, WS, guestDto)).rejects.toMatchObject({
      statusCode: 409,
      errorCode: ErrorCode.RES_002,
    });
  });

  it("vượt 50 lời mời/nhóm/24 giờ → 429 RATE_003", async () => {
    const { h, service } = setup();
    for (let i = 0; i < 50; i += 1) {
      h.invitations.seed(makeInvitation({ id: `old-${i}`, normalizedEmail: `u${i}@e.com`, pendingKey: `${WS}:u${i}@e.com`, status: "ACCEPTED", createdAt: new Date() }));
    }
    await expect(service.inviteGuest({ user: ownerUser, role: "OWNER" }, WS, guestDto)).rejects.toMatchObject({
      statusCode: 429,
      errorCode: ErrorCode.RATE_003,
    });
  });
});

describe("InvitationCreateService — mời thành viên (inviteMembers)", () => {
  const admin = { user: { id: ADMIN, email: "a@e.com" }, role: "ADMIN" as const };

  it("MEMBER không được mời khi nhóm chưa bật memberCanInvite → 403 PERM_001", async () => {
    const { service } = setup();
    await expect(
      service.inviteMembers({ user: { id: MEMBER, email: "m@e.com" }, role: "MEMBER" }, WS, { emails: ["x@example.com"] })
    ).rejects.toMatchObject({ statusCode: 403, errorCode: ErrorCode.PERM_001 });
  });

  it("phân loại bỏ qua: ALREADY_MEMBER · BANNED · PENDING_EXISTS; email trùng (khác hoa/thường) gộp một; không tạo gì khi tất cả bị bỏ qua", async () => {
    const { h, service } = setup();
    const banned = "06".repeat(12);
    h.invitations.users.set(MEMBER, makeUser(MEMBER, { email: "thanhvien@example.com" }));
    h.invitations.users.set(banned, makeUser(banned, { email: "bichan@example.com" }));
    h.memberships.seedMembership(makeMembership({ id: "m-ban", userId: banned, status: "BANNED" }));
    h.invitations.seed(makeInvitation({ id: "p1", normalizedEmail: "dangcho@example.com", pendingKey: `${WS}:dangcho@example.com` }));

    const result = await service.inviteMembers(admin, WS, {
      emails: ["ThanhVien@Example.com", "bichan@example.com", "dangcho@example.com", "DANGCHO@example.com"],
    });
    expect(result.created).toEqual([]);
    expect(result.skipped).toEqual([
      { email: "ThanhVien@Example.com", reason: "ALREADY_MEMBER" },
      { email: "bichan@example.com", reason: "BANNED" },
      { email: "dangcho@example.com", reason: "PENDING_EXISTS" },
    ]);
  });

  it("MEMBER được mời khi guestPolicy.memberCanInvite = true (qua được kiểm quyền)", async () => {
    const { h, service } = setup();
    h.invitations.workspaces.set(WS, makeWorkspace({ guestPolicy: { enabled: true, maxGuests: 5, maxDays: 30, memberCanInvite: true } }));
    h.invitations.users.set(OUTSIDER, makeUser(OUTSIDER, { email: "da-co@example.com" }));
    h.memberships.seedMembership(makeMembership({ id: "m-out", userId: OUTSIDER }));
    const result = await service.inviteMembers({ user: { id: MEMBER, email: "m@e.com" }, role: "MEMBER" }, WS, {
      emails: ["da-co@example.com"],
    });
    expect(result.skipped).toEqual([{ email: "da-co@example.com", reason: "ALREADY_MEMBER" }]);
  });
});

describe("InvitationCreateService — thu hồi / gửi lại", () => {
  it("lời mời không tồn tại → 404; người ngoài nhóm hoặc MEMBER không phải người mời → 404 trung tính", async () => {
    const { h, service } = setup();
    h.invitations.seed(makeInvitation({ invitedBy: OWNER }));
    await expect(service.revoke({ id: OWNER, email: "o@e.com" }, "ff".repeat(12))).rejects.toMatchObject({ statusCode: 404 });
    await expect(service.revoke({ id: OUTSIDER, email: "x@e.com" }, "inv1")).rejects.toMatchObject({ statusCode: 404 });
    await expect(service.resend({ id: MEMBER, email: "m@e.com" }, "inv1")).rejects.toMatchObject({ statusCode: 404 });
  });

  it("gửi lại khi chưa đủ 12 giờ kể từ lần gửi trước → 429 RATE_003 kèm retryAfterSeconds", async () => {
    const { h, service } = setup();
    h.invitations.seed(makeInvitation({ lastSentAt: new Date(Date.now() - 2 * 3600_000) }));
    const error = await service.resend({ id: OWNER, email: "o@e.com" }, "inv1").catch((e: unknown) => e);
    expect(error).toMatchObject({ statusCode: 429, errorCode: ErrorCode.RATE_003 });
    const retry = (error as { details: { retryAfterSeconds: number } }).details.retryAfterSeconds;
    expect(retry).toBeGreaterThan(9 * 3600);
    expect(retry).toBeLessThanOrEqual(10 * 3600);
  });

  it("gửi lại lời mời không còn PENDING (đã thu hồi/chấp nhận/hết hạn) → 409", async () => {
    const { h, service } = setup();
    h.invitations.seed(makeInvitation({ status: "REVOKED" }));
    await expect(service.resend({ id: OWNER, email: "o@e.com" }, "inv1")).rejects.toMatchObject({ statusCode: 409 });
  });

  it("người mời (MEMBER còn ACTIVE) tự thu hồi/gửi lại lời mời của mình được qua kiểm quyền (đến lượt cooldown)", async () => {
    const { h, service } = setup();
    h.invitations.seed(makeInvitation({ invitedBy: MEMBER, lastSentAt: new Date() }));
    await expect(service.resend({ id: MEMBER, email: "m@e.com" }, "inv1")).rejects.toMatchObject({ errorCode: ErrorCode.RATE_003 });
    // …nhưng khách ACTIVE (ví dụ GUEST) không phải thành viên ADMIN/người mời → 404.
    h.memberships.seedMembership(makeMembership({ id: "m-g", userId: GUEST, role: "GUEST", expiresAt: new Date(Date.now() + 1e6) }));
    await expect(service.resend({ id: GUEST, email: "g@e.com" }, "inv1")).rejects.toMatchObject({ statusCode: 404 });
  });
});
