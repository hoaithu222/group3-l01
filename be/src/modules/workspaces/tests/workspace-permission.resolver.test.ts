import { getResolver, clearScopeRegistry, type ResolveContext } from "../../../core/permission";
import { InMemoryWorkspaceRepository } from "../repositories/workspace.repository.inmemory";
import { registerWorkspacePermissionResolver } from "../services/workspace-permission.resolver";
import type { Workspace, WorkspaceMembership } from "../entities/workspace.interface";

const ctx: ResolveContext = { now: new Date(), resolve: () => Promise.reject(new Error("not used")) };
const user = { id: "u1", email: "u1@example.com" };

function makeWorkspace(overrides: Partial<Workspace> = {}): Workspace {
  return {
    id: "ws1",
    name: "Nhóm 1",
    normalizedName: "nhom 1",
    description: null,
    avatarAssetId: null,
    ownerId: "owner1",
    defaultChannelId: "ch1",
    status: "ACTIVE",
    archivedAt: null,
    archivedBy: null,
    archivedReason: null,
    archiveNote: null,
    memberCount: 3,
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
    isFavorite: false,
    position: null,
    notifyMode: "INHERIT",
    lastVisitedAt: null,
    ...overrides,
  };
}

describe("workspace-permission.resolver (WORKSPACE scope)", () => {
  afterEach(() => clearScopeRegistry());

  it("không phải thành viên → visible false, không action", async () => {
    const repo = new InMemoryWorkspaceRepository();
    repo.seedWorkspace(makeWorkspace());
    registerWorkspacePermissionResolver(repo);

    const access = await getResolver("WORKSPACE")!.resolve(user, "ws1", ctx);
    expect(access.visible).toBe(false);
    expect(access.actions.size).toBe(0);
  });

  it("membership LEFT → visible false (không tính là thành viên)", async () => {
    const repo = new InMemoryWorkspaceRepository();
    repo.seedWorkspace(makeWorkspace());
    repo.seedMembership(makeMembership({ status: "LEFT" }));
    registerWorkspacePermissionResolver(repo);

    const access = await getResolver("WORKSPACE")!.resolve(user, "ws1", ctx);
    expect(access.visible).toBe(false);
  });

  it("p3-04 — membership PENDING (chờ duyệt) → không phải thành viên: visible false (404 mọi nội dung)", async () => {
    const repo = new InMemoryWorkspaceRepository();
    repo.seedWorkspace(makeWorkspace());
    repo.seedMembership(makeMembership({ status: "PENDING" }));
    registerWorkspacePermissionResolver(repo);

    const access = await getResolver("WORKSPACE")!.resolve(user, "ws1", ctx);
    expect(access.visible).toBe(false);
    expect(access.actions.size).toBe(0);
  });

  it("p3-04 §5.1 — KHÁCH còn hạn: visible, role GUEST, kèm expiresAt để cache quyền tự vô hiệu đúng lúc", async () => {
    const repo = new InMemoryWorkspaceRepository();
    const expiresAt = new Date(ctx.now.getTime() + 3600_000);
    repo.seedWorkspace(makeWorkspace());
    repo.seedMembership(makeMembership({ role: "GUEST", expiresAt }));
    registerWorkspacePermissionResolver(repo);

    const access = await getResolver("WORKSPACE")!.resolve(user, "ws1", ctx);
    expect(access).toMatchObject({ visible: true, role: "GUEST", expiresAt });
    expect(access.actions.has("workspace.read")).toBe(true);
  });

  it("p3-04 §5.1 — KHÁCH quá hạn coi như KHÔNG phải thành viên NGAY (không chờ job guest.expire) → visible false", async () => {
    const repo = new InMemoryWorkspaceRepository();
    repo.seedWorkspace(makeWorkspace());
    repo.seedMembership(makeMembership({ role: "GUEST", expiresAt: new Date(ctx.now.getTime() - 1) }));
    registerWorkspacePermissionResolver(repo);

    const access = await getResolver("WORKSPACE")!.resolve(user, "ws1", ctx);
    expect(access.visible).toBe(false);
    expect(access.actions.size).toBe(0);
  });

  it("p3-04 — hạn chỉ áp cho GUEST: MEMBER có expiresAt cũ (dữ liệu lệch) vẫn đọc được", async () => {
    const repo = new InMemoryWorkspaceRepository();
    repo.seedWorkspace(makeWorkspace());
    repo.seedMembership(makeMembership({ role: "MEMBER", expiresAt: new Date(ctx.now.getTime() - 1000) }));
    registerWorkspacePermissionResolver(repo);

    const access = await getResolver("WORKSPACE")!.resolve(user, "ws1", ctx);
    expect(access.visible).toBe(true);
    expect(access.expiresAt).toBeUndefined();
  });

  it("MEMBER ACTIVE → đọc được, không sửa/archive", async () => {
    const repo = new InMemoryWorkspaceRepository();
    repo.seedWorkspace(makeWorkspace());
    repo.seedMembership(makeMembership({ role: "MEMBER" }));
    registerWorkspacePermissionResolver(repo);

    const access = await getResolver("WORKSPACE")!.resolve(user, "ws1", ctx);
    expect(access.visible).toBe(true);
    expect(access.role).toBe("MEMBER");
    expect(access.actions.has("workspace.read")).toBe(true);
    expect(access.actions.has("workspace.update")).toBe(false);
    expect(access.actions.has("workspace.archive")).toBe(false);
  });

  it("OWNER ACTIVE → có archive/transfer, ADMIN thì không", async () => {
    const repo = new InMemoryWorkspaceRepository();
    repo.seedWorkspace(makeWorkspace());
    repo.seedMembership(makeMembership({ role: "OWNER" }));
    registerWorkspacePermissionResolver(repo);

    const access = await getResolver("WORKSPACE")!.resolve(user, "ws1", ctx);
    expect(access.actions.has("workspace.archive")).toBe(true);
    expect(access.actions.has("workspace.transfer")).toBe(true);
    expect(access.actions.has("workspace.update")).toBe(true);
  });

  it("workspace ARCHIVED → chỉ còn action đọc, kể cả OWNER (README §2/§6)", async () => {
    const repo = new InMemoryWorkspaceRepository();
    repo.seedWorkspace(makeWorkspace({ status: "ARCHIVED" }));
    repo.seedMembership(makeMembership({ role: "OWNER" }));
    registerWorkspacePermissionResolver(repo);

    const access = await getResolver("WORKSPACE")!.resolve(user, "ws1", ctx);
    expect(access.visible).toBe(true);
    expect(access.actions.has("workspace.read")).toBe(true);
    expect(access.actions.has("workspace.update")).toBe(false);
    expect(access.actions.has("workspace.archive")).toBe(false);
  });
});

describe("workspace-permission.resolver — action Phase 3 (D-28: kho tài liệu, dự án, khách)", () => {
  afterEach(() => clearScopeRegistry());

  const MEMBER_ACTIONS = [
    "workspace.resource.read",
    "workspace.resource.upload",
    "workspace.folder.manage",
    "workspace.board.read",
    "workspace.task.create",
    "workspace.task.update",
    "workspace.task.status",
    "workspace.task.comment",
  ] as const;
  const ADMIN_ONLY_ACTIONS = [
    "workspace.resource.delete",
    "workspace.board.create",
    "workspace.board.edit",
    "workspace.task.delete",
    "workspace.guest.manage",
    "workspace.join-request.decide",
    "workspace.mention.role",
  ] as const;

  async function actionsOf(role: WorkspaceMembership["role"], status: Workspace["status"] = "ACTIVE") {
    const repo = new InMemoryWorkspaceRepository();
    repo.seedWorkspace(makeWorkspace({ status }));
    repo.seedMembership(makeMembership({ role }));
    registerWorkspacePermissionResolver(repo);
    return getResolver("WORKSPACE")!.resolve(user, "ws1", ctx);
  }

  it("MEMBER: có nhóm action MEMBER, KHÔNG có action ADMIN/OWNER", async () => {
    const access = await actionsOf("MEMBER");
    for (const a of MEMBER_ACTIONS) expect(access.actions.has(a)).toBe(true);
    for (const a of ADMIN_ONLY_ACTIONS) expect(access.actions.has(a)).toBe(false);
    expect(access.actions.has("workspace.policy.update")).toBe(false);
  });

  it("ADMIN: có nhóm MEMBER + ADMIN, nhưng KHÔNG có `workspace.policy.update` (chỉ OWNER)", async () => {
    const access = await actionsOf("ADMIN");
    for (const a of [...MEMBER_ACTIONS, ...ADMIN_ONLY_ACTIONS]) expect(access.actions.has(a)).toBe(true);
    expect(access.actions.has("workspace.policy.update")).toBe(false);
  });

  it("OWNER: có mọi action Phase 3 kể cả `workspace.policy.update`", async () => {
    const access = await actionsOf("OWNER");
    for (const a of [...MEMBER_ACTIONS, ...ADMIN_ONLY_ACTIONS, "workspace.policy.update" as const]) {
      expect(access.actions.has(a)).toBe(true);
    }
  });

  it("GUEST: KHÔNG có action Phase 3 nào (chỉ `workspace.read`) — 404 nhờ GUEST_HIDDEN_ACTIONS", async () => {
    const access = await actionsOf("GUEST");
    expect(access.role).toBe("GUEST");
    for (const a of [...MEMBER_ACTIONS, ...ADMIN_ONLY_ACTIONS, "workspace.policy.update" as const]) {
      expect(access.actions.has(a)).toBe(false);
    }
    expect(access.actions.has("workspace.read")).toBe(true);
  });

  it("workspace ARCHIVED: MEMBER giữ chỉ-xem/tải (resource.read, board.read), mất mọi action ghi; GUEST vẫn không có gì", async () => {
    const member = await actionsOf("MEMBER", "ARCHIVED");
    expect(member.actions.has("workspace.resource.read")).toBe(true);
    expect(member.actions.has("workspace.board.read")).toBe(true);
    for (const a of ["workspace.resource.upload", "workspace.folder.manage", "workspace.task.create", "workspace.task.status", "workspace.task.comment"] as const) {
      expect(member.actions.has(a)).toBe(false);
    }
    const guest = await actionsOf("GUEST", "ARCHIVED");
    expect(guest.actions.has("workspace.resource.read")).toBe(false);
    expect(guest.actions.has("workspace.board.read")).toBe(false);
  });
});
