/**
 * Unit — nhánh THÀNH CÔNG của `InviteService.preview()` (`GET /invites/:token`): ảnh nhóm + ảnh người mời. Hai bản ghi (Workspace,
 * User người tạo link) đọc thẳng Prisma trong service → mock `infrastructure/database` (cùng mẫu `invites-expire.job.test.ts`).
 * Các nhánh 404/410 và `accept()` nằm ở `invite.service.test.ts`.
 */
const mockWorkspaceFindUnique = jest.fn<Promise<unknown>, unknown[]>();
const mockUserFindUnique = jest.fn<Promise<unknown>, unknown[]>();
jest.mock("../../../infrastructure/database", () => ({
  prisma: {
    workspace: { findUnique: (...args: unknown[]) => mockWorkspaceFindUnique(...args) },
    user: { findUnique: (...args: unknown[]) => mockUserFindUnique(...args) },
  },
  withTransaction: jest.fn(),
}));

import { InviteService } from "../services/invite.service";
import { InMemoryInviteLinkRepository } from "../repositories/invite-link.repository.inmemory";
import { InMemoryMembershipRepository } from "../repositories/membership.repository.inmemory";
import { generateInviteToken } from "../services/invite-token.util";
import type { ChannelBootstrapPort } from "../../../shared/ports/channel-bootstrap.port";
import type { InviteLink } from "../entities/invite.interface";

const WS_ASSET = "65f0000000000000000000e1";
const INVITER_ASSET = "65f0000000000000000000e2";
/** URL ảnh hiển thị TUYỆT ĐỐI ký sẵn (bản THUMB) — client dùng thẳng làm nguồn ảnh, không cần Bearer. */
const signedThumb = (assetId: string) => new RegExp(`^https?://\\S+/api/v1/assets/${assetId}/image\\?v=THUMB&e=\\d+&s=[0-9a-f]{64}$`);

function makeLink(tokenHash: string): InviteLink {
  const now = new Date();
  return {
    id: "link1",
    workspaceId: "ws1",
    tokenHash,
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
  };
}

function setup() {
  const inviteRepo = new InMemoryInviteLinkRepository();
  const bootstrap: ChannelBootstrapPort = { createDefault: jest.fn(), joinDefault: jest.fn() };
  const service = new InviteService(inviteRepo, new InMemoryMembershipRepository(), bootstrap);
  const { token, tokenHash } = generateInviteToken();
  inviteRepo.seed(makeLink(tokenHash));
  return { service, token };
}

const workspaceRow = (avatarAssetId: string | null) => ({
  id: "ws1",
  name: "Nhóm Alpha",
  description: "Nhóm học",
  status: "ACTIVE",
  joinPolicy: "OPEN",
  avatarAssetId,
});

describe("InviteService.preview() — ảnh nhóm + người mời", () => {
  it("nhóm + người mời có ảnh → workspace.avatarUrl / inviter.avatarUrl là URL ký sẵn (THUMB) của đúng asset, lấy từ CÙNG truy vấn", async () => {
    const { service, token } = setup();
    mockWorkspaceFindUnique.mockResolvedValue(workspaceRow(WS_ASSET));
    mockUserFindUnique.mockResolvedValue({ name: "Chủ nhóm", avatarAssetId: INVITER_ASSET });

    const preview = await service.preview(token, undefined);
    expect(Object.keys(preview.workspace).sort()).toEqual(["avatarUrl", "description", "id", "name"]);
    expect(preview.workspace).toMatchObject({ id: "ws1", name: "Nhóm Alpha", description: "Nhóm học" });
    expect(preview.workspace.avatarUrl).toMatch(signedThumb(WS_ASSET));
    expect(preview.inviter.name).toBe("Chủ nhóm");
    expect(preview.inviter.avatarUrl).toMatch(signedThumb(INVITER_ASSET));
    // Ảnh người mời đi cùng truy vấn tên (không N+1, không lộ trường khác của User).
    expect(mockUserFindUnique).toHaveBeenCalledTimes(1);
    expect(mockUserFindUnique).toHaveBeenCalledWith({ where: { id: "owner1" }, select: { name: true, avatarAssetId: true } });
  });

  it("nhóm chưa đặt ảnh, người mời không còn bản ghi → cả hai avatarUrl null (tên người mời '?')", async () => {
    const { service, token } = setup();
    mockWorkspaceFindUnique.mockResolvedValue(workspaceRow(null));
    mockUserFindUnique.mockResolvedValue(null);

    const preview = await service.preview(token, undefined);
    expect(preview.workspace.avatarUrl).toBeNull();
    expect(preview.inviter).toEqual({ name: "?", avatarUrl: null });
  });
});
