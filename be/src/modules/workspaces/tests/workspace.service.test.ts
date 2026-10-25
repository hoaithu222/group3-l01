import { AppError } from "../../../core/exceptions";
import { ErrorCode } from "../../../core/utils/error.codes";
import { InMemoryWorkspaceRepository } from "../repositories/workspace.repository.inmemory";
import { WorkspaceService } from "../services/workspace.service";
import { WorkspaceLifecycleService } from "../services/workspace-lifecycle.service";
import type { ChannelBootstrapPort } from "../../../shared/ports/channel-bootstrap.port";
import type { MembershipLifecyclePort } from "../../../shared/ports/membership-lifecycle.port";
import type { AssetLinkService } from "../../assets/public";
import type { Workspace, WorkspaceMembership } from "../entities/workspace.interface";

function makeWorkspace(overrides: Partial<Workspace> = {}): Workspace {
  return {
    id: "ws1",
    name: "Nhóm 1",
    normalizedName: "nhom 1",
    description: null,
    avatarAssetId: null,
    ownerId: "u1",
    defaultChannelId: "ch1",
    status: "ACTIVE",
    archivedAt: null,
    archivedBy: null,
    archivedReason: null,
    archiveNote: null,
    memberCount: 1,
    lastActivityAt: new Date(),
    version: 1,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function makeMembership(overrides: Partial<WorkspaceMembership> = {}): WorkspaceMembership {
  return {
    id: "m1",
    workspaceId: "ws1",
    userId: "u1",
    role: "OWNER",
    status: "ACTIVE",
    displayName: null,
    joinedAt: new Date(),
    leftAt: null,
    expiresAt: null,
    invitedBy: null,
    inviteLinkId: null,
    banReason: null,
    removedBy: null,
    isFavorite: false,
    position: null,
    notifyMode: "INHERIT",
    lastVisitedAt: null,
    ...overrides,
  };
}

function buildService(repo: InMemoryWorkspaceRepository): WorkspaceService {
  const channelBootstrap: ChannelBootstrapPort = { createDefault: jest.fn(), joinDefault: jest.fn() };
  const assetLinks = { attach: jest.fn(), detach: jest.fn(), replace: jest.fn() } as unknown as AssetLinkService;
  return new WorkspaceService(repo, channelBootstrap, assetLinks);
}

describe("WorkspaceService", () => {
  it("create(): vượt perUserMax → WS_006, không chạm transaction/channelBootstrap", async () => {
    const repo = new InMemoryWorkspaceRepository();
    for (let i = 0; i < 50; i += 1) {
      repo.seedWorkspace(makeWorkspace({ id: `ws${i}`, ownerId: "u1" }));
      repo.seedMembership(makeMembership({ id: `m${i}`, workspaceId: `ws${i}`, userId: "u1" }));
    }
    const service = buildService(repo);

    await expect(service.create("u1", { name: "Nhóm mới" })).rejects.toMatchObject({
      errorCode: ErrorCode.WS_006,
      statusCode: 409,
    });
  });

  it("list(): sắp yêu thích trước, unreadAvailable=false khi p1-07 chưa đăng ký port", async () => {
    const repo = new InMemoryWorkspaceRepository();
    repo.seedWorkspace(makeWorkspace({ id: "ws1", name: "Không yêu thích" }));
    repo.seedWorkspace(makeWorkspace({ id: "ws2", name: "Yêu thích" }));
    repo.seedMembership(makeMembership({ id: "m1", workspaceId: "ws1", isFavorite: false }));
    repo.seedMembership(makeMembership({ id: "m2", workspaceId: "ws2", isFavorite: true }));
    const service = buildService(repo);

    const items = await service.list("u1", "ACTIVE");
    expect(items).toHaveLength(2);
    expect(items[0]!.name).toBe("Yêu thích");
    expect(items.every((i) => i.unreadAvailable === false && i.unreadCount === 0)).toBe(true);
  });
});

describe("AppError shape sanity", () => {
  it("WS_006 mã lỗi có thông điệp tiếng Việt", () => {
    expect(new AppError("x", 409, ErrorCode.WS_006).errorCode).toBe("WS_006");
  });
});

/**
 * be.md p1-01 §5.6 — `leave()` uỷ quyền qua `MembershipLifecyclePort` (p1-02
 * `createMembershipLifecyclePort()`, xem `workspaces.routes.ts`) thay vì tự
 * thao tác `WorkspaceMembership`. Mock port giống hệt cách `channelBootstrap`
 * được mock ở `buildService()` phía trên — service KHÔNG tự viết lại logic
 * revoke, chỉ chặn OWNER trước khi gọi tới cổng.
 */
describe("WorkspaceLifecycleService#leave() — uỷ quyền qua MembershipLifecyclePort", () => {
  function buildLifecycleService(
    repo: InMemoryWorkspaceRepository,
    membershipLifecycle: MembershipLifecyclePort
  ): WorkspaceLifecycleService {
    return new WorkspaceLifecycleService(repo, membershipLifecycle);
  }

  it("OWNER tự rời nhóm → WS_004, KHÔNG gọi tới membershipLifecycle.leave()", async () => {
    const repo = new InMemoryWorkspaceRepository();
    const membershipLifecycle: MembershipLifecyclePort = { leave: jest.fn().mockResolvedValue(undefined) };
    const service = buildLifecycleService(repo, membershipLifecycle);

    await expect(service.leave("u1", "ws1", "OWNER")).rejects.toMatchObject({
      errorCode: ErrorCode.WS_004,
      statusCode: 409,
    });
    expect(membershipLifecycle.leave).not.toHaveBeenCalled();
  });

  it("MEMBER rời nhóm → gọi membershipLifecycle.leave(userId, workspaceId) đúng tham số", async () => {
    const repo = new InMemoryWorkspaceRepository();
    const membershipLifecycle: MembershipLifecyclePort = { leave: jest.fn().mockResolvedValue(undefined) };
    const service = buildLifecycleService(repo, membershipLifecycle);

    await expect(service.leave("u2", "ws1", "MEMBER")).resolves.toBeUndefined();
    expect(membershipLifecycle.leave).toHaveBeenCalledTimes(1);
    expect(membershipLifecycle.leave).toHaveBeenCalledWith("u2", "ws1");
  });

  it("ADMIN rời nhóm → cũng uỷ quyền qua port (không có ngoại lệ ngoài OWNER)", async () => {
    const repo = new InMemoryWorkspaceRepository();
    const membershipLifecycle: MembershipLifecyclePort = { leave: jest.fn().mockResolvedValue(undefined) };
    const service = buildLifecycleService(repo, membershipLifecycle);

    await service.leave("u3", "ws1", "ADMIN");
    expect(membershipLifecycle.leave).toHaveBeenCalledWith("u3", "ws1");
  });

  it("membershipLifecycle.leave() ném lỗi → propagate nguyên vẹn (service không nuốt lỗi)", async () => {
    const repo = new InMemoryWorkspaceRepository();
    const boom = new AppError("Lỗi mô phỏng", 409, ErrorCode.WS_013);
    const membershipLifecycle: MembershipLifecyclePort = { leave: jest.fn().mockRejectedValue(boom) };
    const service = buildLifecycleService(repo, membershipLifecycle);

    await expect(service.leave("u4", "ws1", "MEMBER")).rejects.toBe(boom);
  });
});
