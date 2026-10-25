/**
 * Unit — `InvitationAcceptService` (be.md p3-04 §4/§5.3): các nhánh throw/return TRƯỚC KHI chạm `withTransaction()` —
 * xem trước (404 token lạ, 410 INV_010 khi thu hồi/đã dùng, che email, tên kênh của khách), RB-06 (email khác →
 * `403 INV_008 details.reason`, lời mời vẫn PENDING), INV_004 (bị chặn), INV_005 (nhóm đã lưu trữ), `acceptMine` chỉ với
 * đúng email, `listMine` chỉ khi đã xác minh. Chấp nhận thật (membership + grant kênh + lịch hết hạn) → integration.
 */
import { InvitationAcceptService } from "../services/invitation-accept.service";
import { hashInviteToken } from "../services/invite-token.util";
import { ErrorCode } from "../../../core/utils/error.codes";
import type { AuthUser } from "../../../core/types/express";
import type { ChannelBootstrapPort } from "../../../shared/ports/channel-bootstrap.port";
import type { ChannelGrantPort } from "../../../shared/ports/channel-grant.port";
import { CH_PRIVATE, CH_PUBLIC, MEMBER, OUTSIDER, OWNER, WS, buildHarness, makeInvitation, makeMembership, makeUser, makeWorkspace } from "./support/access-harness";

const TOKEN = "T".repeat(43);

function setup() {
  const h = buildHarness();
  const bootstrap: ChannelBootstrapPort = { createDefault: jest.fn(), joinDefault: jest.fn() };
  const grant = {
    grantMemberInTx: jest.fn(),
    revokeMemberInTx: jest.fn(),
    revokeAllInTx: jest.fn(),
    syncRoleAccessInTx: jest.fn(),
    afterCommit: jest.fn(),
  } as unknown as ChannelGrantPort;
  const service = new InvitationAcceptService(h.invitations, h.memberships, bootstrap, grant, h.config);
  return { h, service };
}

const guestUser = (email: string): AuthUser => ({ id: OUTSIDER, email });

describe("InvitationAcceptService.preview()", () => {
  it("token không tồn tại → 404", async () => {
    const { service } = setup();
    await expect(service.preview(TOKEN)).rejects.toMatchObject({ statusCode: 404 });
  });

  it("đã thu hồi / đã chấp nhận → 410 INV_010; PENDING nhưng quá hạn cũng 410 (kiểm expiresAt độc lập với job)", async () => {
    const { h, service } = setup();
    for (const status of ["REVOKED", "ACCEPTED"] as const) {
      h.invitations.seed(makeInvitation({ id: status, status, tokenHash: hashInviteToken(`${status}${"x".repeat(43)}`.slice(0, 43)) }));
      await expect(service.preview(`${status}${"x".repeat(43)}`.slice(0, 43))).rejects.toMatchObject({
        statusCode: 410,
        errorCode: ErrorCode.INV_010,
      });
    }
  });

  it("MEMBER: trả tên nhóm, người mời, email CHE, không có channels; không lộ id/email đầy đủ", async () => {
    const { h, service } = setup();
    h.invitations.seed(makeInvitation({ tokenHash: hashInviteToken(TOKEN), email: "lan@gmail.com", invitedBy: OWNER }));
    const preview = await service.preview(TOKEN);
    expect(preview).toMatchObject({
      workspace: { name: "Nhóm thử", avatarUrl: null },
      invitedBy: { name: expect.any(String) },
      role: "MEMBER",
      emailHint: "l***@gmail.com",
      status: "PENDING",
    });
    expect(preview.channels).toBeUndefined();
    expect(JSON.stringify(preview)).not.toContain("lan@gmail.com");
  });

  it("nhóm có ảnh đại diện → workspace.avatarUrl là URL ký sẵn (THUMB) của `Workspace.avatarAssetId` — ở xem trước lẫn `listMine`", async () => {
    const { h, service } = setup();
    const assetId = "65f0000000000000000000ef";
    h.invitations.workspaces.set(WS, makeWorkspace({ avatarAssetId: assetId }));
    h.invitations.seed(makeInvitation({ tokenHash: hashInviteToken(TOKEN) }));
    expect((await service.preview(TOKEN)).workspace.avatarUrl).toContain(`/api/v1/assets/${assetId}/image?v=THUMB`);

    h.invitations.users.set(OUTSIDER, makeUser(OUTSIDER, { email: "khach@example.com" }));
    const [mine] = await service.listMine({ id: OUTSIDER, email: "khach@example.com" });
    expect(mine.workspace.avatarUrl).toContain(`/api/v1/assets/${assetId}/image?v=THUMB`);
  });

  it("GUEST: kèm TÊN kênh chỉ định còn hoạt động (bỏ kênh đã lưu trữ), số ngày", async () => {
    const { h, service } = setup();
    h.invitations.channels[0] = { ...h.invitations.channels[0], status: "ARCHIVED" };
    h.invitations.seed(
      makeInvitation({ tokenHash: hashInviteToken(TOKEN), role: "GUEST", guestChannelIds: [CH_PUBLIC, CH_PRIVATE], guestDays: 14 })
    );
    const preview = await service.preview(TOKEN);
    expect(preview.channels).toEqual([{ name: "Ban giám hiệu" }]);
    expect(preview.guestDays).toBe(14);
  });

  it("nhóm đã lưu trữ → 409 INV_005", async () => {
    const { h, service } = setup();
    h.invitations.workspaces.set(WS, makeWorkspace({ status: "ARCHIVED" }));
    h.invitations.seed(makeInvitation({ tokenHash: hashInviteToken(TOKEN) }));
    await expect(service.preview(TOKEN)).rejects.toMatchObject({ statusCode: 409, errorCode: ErrorCode.INV_005 });
  });
});

describe("InvitationAcceptService.accept() — nhánh chặn trước transaction", () => {
  it("RB-06 — tài khoản khác email → 403 INV_008 {reason: EMAIL_MISMATCH}; lời mời vẫn PENDING", async () => {
    const { h, service } = setup();
    h.invitations.seed(makeInvitation({ tokenHash: hashInviteToken(TOKEN) }));
    h.invitations.users.set(OUTSIDER, makeUser(OUTSIDER, { email: "nguoi-khac@example.com" }));

    const error = await service.accept(guestUser("nguoi-khac@example.com"), TOKEN).catch((e: unknown) => e);
    expect(error).toMatchObject({ statusCode: 403, errorCode: ErrorCode.INV_008, details: { reason: "EMAIL_MISMATCH" } });
    expect((await h.invitations.findById("inv1"))?.status).toBe("PENDING");
  });

  it("đúng email (khác hoa/thường) nhưng CHƯA xác minh → 403 INV_008 {reason: EMAIL_NOT_VERIFIED}", async () => {
    const { h, service } = setup();
    h.invitations.seed(makeInvitation({ tokenHash: hashInviteToken(TOKEN) }));
    h.invitations.users.set(OUTSIDER, makeUser(OUTSIDER, { email: "KHACH@example.com", emailVerified: false }));
    await expect(service.accept(guestUser("KHACH@example.com"), TOKEN)).rejects.toMatchObject({
      errorCode: ErrorCode.INV_008,
      details: { reason: "EMAIL_NOT_VERIFIED" },
    });
  });

  it("token lạ → 404; đã thu hồi → 410 INV_010", async () => {
    const { h, service } = setup();
    await expect(service.accept(guestUser("khach@example.com"), TOKEN)).rejects.toMatchObject({ statusCode: 404 });
    h.invitations.seed(makeInvitation({ tokenHash: hashInviteToken(TOKEN), status: "REVOKED" }));
    await expect(service.accept(guestUser("khach@example.com"), TOKEN)).rejects.toMatchObject({ statusCode: 410, errorCode: ErrorCode.INV_010 });
  });

  it("đang bị chặn khỏi nhóm → 403 INV_004", async () => {
    const { h, service } = setup();
    h.invitations.seed(makeInvitation({ tokenHash: hashInviteToken(TOKEN) }));
    h.invitations.users.set(OUTSIDER, makeUser(OUTSIDER, { email: "khach@example.com" }));
    h.memberships.seedMembership(makeMembership({ id: "m-b", userId: OUTSIDER, status: "BANNED" }));
    await expect(service.accept(guestUser("khach@example.com"), TOKEN)).rejects.toMatchObject({
      statusCode: 403,
      errorCode: ErrorCode.INV_004,
    });
  });

  it("nhóm đã lưu trữ → 409 INV_005", async () => {
    const { h, service } = setup();
    h.invitations.workspaces.set(WS, makeWorkspace({ status: "ARCHIVED" }));
    h.invitations.seed(makeInvitation({ tokenHash: hashInviteToken(TOKEN) }));
    h.invitations.users.set(OUTSIDER, makeUser(OUTSIDER, { email: "khach@example.com" }));
    await expect(service.accept(guestUser("khach@example.com"), TOKEN)).rejects.toMatchObject({ errorCode: ErrorCode.INV_005 });
  });

  it("lời mời KHÁCH khi nhóm đã tắt mời khách / đủ khách lúc chấp nhận → 409 WS_018", async () => {
    const { h, service } = setup();
    h.invitations.seed(makeInvitation({ tokenHash: hashInviteToken(TOKEN), role: "GUEST", guestChannelIds: [CH_PUBLIC], guestDays: 7 }));
    h.invitations.users.set(OUTSIDER, makeUser(OUTSIDER, { email: "khach@example.com" }));

    h.invitations.workspaces.set(WS, makeWorkspace({ guestPolicy: { enabled: false, maxGuests: 5, maxDays: 30, memberCanInvite: false } }));
    await expect(service.accept(guestUser("khach@example.com"), TOKEN)).rejects.toMatchObject({ errorCode: ErrorCode.WS_018 });

    h.invitations.workspaces.set(WS, makeWorkspace());
    h.invitations.activeGuests.set(WS, 5);
    await expect(service.accept(guestUser("khach@example.com"), TOKEN)).rejects.toMatchObject({ errorCode: ErrorCode.WS_018 });
  });
});

describe("InvitationAcceptService — acceptMine / listMine", () => {
  it("acceptMine với email KHÔNG khớp lời mời → 404 trung tính (không lộ lời mời tồn tại)", async () => {
    const { h, service } = setup();
    h.invitations.seed(makeInvitation());
    await expect(service.acceptMine(guestUser("khac@example.com"), "inv1")).rejects.toMatchObject({ statusCode: 404 });
    await expect(service.acceptMine(guestUser("khach@example.com"), "khong-co")).rejects.toMatchObject({ statusCode: 404 });
  });

  it("acceptMine đúng email nhưng chưa xác minh → 403 INV_008 EMAIL_NOT_VERIFIED", async () => {
    const { h, service } = setup();
    h.invitations.seed(makeInvitation());
    h.invitations.users.set(OUTSIDER, makeUser(OUTSIDER, { email: "khach@example.com", emailVerified: false }));
    await expect(service.acceptMine(guestUser("khach@example.com"), "inv1")).rejects.toMatchObject({
      errorCode: ErrorCode.INV_008,
      details: { reason: "EMAIL_NOT_VERIFIED" },
    });
  });

  it("listMine: chưa xác minh email → []; đã xác minh → lời mời PENDING còn hạn khớp email, kèm tên nhóm/người mời, KHÔNG token", async () => {
    const { h, service } = setup();
    h.invitations.users.set(OUTSIDER, makeUser(OUTSIDER, { email: "Khach@example.com", emailVerified: false }));
    h.invitations.seed(makeInvitation({ invitedBy: MEMBER }));
    expect(await service.listMine({ id: OUTSIDER, email: "Khach@example.com" })).toEqual([]);

    h.invitations.users.set(OUTSIDER, makeUser(OUTSIDER, { email: "Khach@example.com", emailVerified: true }));
    h.invitations.seed(makeInvitation({ id: "het-han", normalizedEmail: "khach@example.com", expiresAt: new Date(Date.now() - 1000) }));
    const rows = await service.listMine({ id: OUTSIDER, email: "Khach@example.com" });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ id: "inv1", workspace: { name: "Nhóm thử" }, inviter: { name: expect.any(String) } });
    expect(JSON.stringify(rows)).not.toMatch(/tokenHash|pendingKey|normalizedEmail/);
  });
});
