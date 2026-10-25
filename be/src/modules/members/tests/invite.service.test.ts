/**
 * Unit — CHỈ các nhánh throw/return TRƯỚC KHI chạm `withTransaction()` (be.md
 * §5.2/§5.3): `create()` kiểm `activePerWorkspaceMax` trước khi tạo; `preview()`
 * tính trạng thái xong throw ngay khi hết hiệu lực (chưa đọc `Workspace` thật);
 * `accept()` trả sớm khi đã ACTIVE (MB-02, không tiêu lượt) hoặc chặn ngay khi
 * BANNED (INV_004). Nhánh "tái kích hoạt LEFT"/tranh lượt cuối (MB-08) cần
 * transaction Prisma thật → `tests/integration/invites.routes.test.ts`.
 */
import { InviteService } from "../services/invite.service";
import { InMemoryInviteLinkRepository } from "../repositories/invite-link.repository.inmemory";
import { InMemoryMembershipRepository } from "../repositories/membership.repository.inmemory";
import { generateInviteToken, hashInviteToken } from "../services/invite-token.util";
import { ErrorCode } from "../../../core/utils/error.codes";
import type { ChannelBootstrapPort } from "../../../shared/ports/channel-bootstrap.port";
import type { InviteLink } from "../entities/invite.interface";
import type { WorkspaceMembership } from "../entities/member.interface";

function makeLink(overrides: Partial<InviteLink> = {}): InviteLink {
  const now = new Date();
  return {
    id: "link1",
    workspaceId: "ws1",
    tokenHash: "hash",
    tokenPrefix: "prefix",
    role: "MEMBER",
    maxUses: 10,
    remainingUses: 10,
    usesCount: 0,
    expiresAt: new Date(now.getTime() + 3600_000),
    revokedAt: null,
    revokedBy: null,
    createdBy: "owner1",
    createdAt: now,
    lastUsedAt: null,
    ...overrides,
  };
}

function makeMembership(overrides: Partial<WorkspaceMembership> = {}): WorkspaceMembership {
  return {
    id: "m1",
    workspaceId: "ws1",
    userId: "u1",
    role: "MEMBER",
    status: "ACTIVE",
    displayName: null,
    joinedAt: new Date(),
    leftAt: null,
    expiresAt: null,
    invitedBy: null,
    inviteLinkId: null,
    banReason: null,
    removedBy: null,
    ...overrides,
  };
}

function noopChannelBootstrap(): ChannelBootstrapPort {
  return { createDefault: jest.fn(), joinDefault: jest.fn() };
}

describe("InviteService", () => {
  let inviteRepo: InMemoryInviteLinkRepository;
  let membershipRepo: InMemoryMembershipRepository;
  let service: InviteService;

  beforeEach(() => {
    inviteRepo = new InMemoryInviteLinkRepository();
    membershipRepo = new InMemoryMembershipRepository();
    service = new InviteService(inviteRepo, membershipRepo, noopChannelBootstrap());
  });

  describe("create()", () => {
    it("INV_006 khi workspace đã có >= activePerWorkspaceMax (20) link đang hoạt động", async () => {
      for (let i = 0; i < 20; i += 1) {
        inviteRepo.seed(makeLink({ id: `link-${i}`, tokenHash: `hash-${i}` }));
      }
      await expect(service.create("owner1", "ws1", { expiresInHours: 24, maxUses: 10 })).rejects.toMatchObject({
        statusCode: 409,
        errorCode: ErrorCode.INV_006,
      });
    });
  });

  describe("preview()", () => {
    it("404 khi token không tồn tại", async () => {
      await expect(service.preview("token-la", undefined)).rejects.toMatchObject({ statusCode: 404 });
    });

    it("INV_001 (410) khi đã hết hạn", async () => {
      const { token, tokenHash } = generateInviteToken();
      inviteRepo.seed(makeLink({ tokenHash, expiresAt: new Date(Date.now() - 1000) }));
      await expect(service.preview(token, undefined)).rejects.toMatchObject({
        statusCode: 410,
        errorCode: ErrorCode.INV_001,
      });
    });

    it("INV_002 (410) khi hết lượt sử dụng", async () => {
      const { token, tokenHash } = generateInviteToken();
      inviteRepo.seed(makeLink({ tokenHash, remainingUses: 0 }));
      await expect(service.preview(token, undefined)).rejects.toMatchObject({
        statusCode: 410,
        errorCode: ErrorCode.INV_002,
      });
    });

    it("INV_003 (410) khi đã bị thu hồi — không lộ workspace name (chỉ throw AppError, không trả payload)", async () => {
      const { token, tokenHash } = generateInviteToken();
      inviteRepo.seed(makeLink({ tokenHash, revokedAt: new Date() }));
      await expect(service.preview(token, undefined)).rejects.toMatchObject({
        statusCode: 410,
        errorCode: ErrorCode.INV_003,
      });
    });

    it("hashInviteToken(token) đúng bằng seed → preview không tìm nhầm link khác", async () => {
      const { tokenHash } = generateInviteToken();
      expect(hashInviteToken("token-khong-khop")).not.toBe(tokenHash);
    });
  });

  describe("accept()", () => {
    it("404 khi token không tồn tại", async () => {
      await expect(service.accept("u1", "token-la")).rejects.toMatchObject({ statusCode: 404 });
    });

    it("MB-02 — membership đã ACTIVE → trả alreadyMember:true, KHÔNG tiêu lượt (không đụng transaction)", async () => {
      const { token, tokenHash } = generateInviteToken();
      inviteRepo.seed(makeLink({ tokenHash, remainingUses: 5, usesCount: 5 }));
      membershipRepo.seedMembership(makeMembership({ userId: "u1", workspaceId: "ws1", status: "ACTIVE" }));

      const result = await service.accept("u1", token);
      expect(result).toEqual({ workspaceId: "ws1", defaultChannelId: null, alreadyMember: true });

      const link = await inviteRepo.findByTokenHash(tokenHash);
      expect(link?.remainingUses).toBe(5);
      expect(link?.usesCount).toBe(5);
    });

    it("BANNED → 403 INV_004 (thông điệp trung tính)", async () => {
      const { token, tokenHash } = generateInviteToken();
      inviteRepo.seed(makeLink({ tokenHash }));
      membershipRepo.seedMembership(makeMembership({ userId: "u1", workspaceId: "ws1", status: "BANNED" }));

      await expect(service.accept("u1", token)).rejects.toMatchObject({
        statusCode: 403,
        errorCode: ErrorCode.INV_004,
      });
    });
  });
});
