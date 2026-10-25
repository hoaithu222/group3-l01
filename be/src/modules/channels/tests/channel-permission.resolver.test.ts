/**
 * Unit — resolver CHANNEL (be.md §5.5) + `computeChannelActions()` (ma trận
 * hành động README §6). Mock `prisma.workspace.findUnique` (đọc thẳng, xem
 * docstring `channel-permission.resolver.ts`) — `redis` đã bị mock rỗng bởi
 * `src/tests/setup.ts` (fail-open, không cần cấu hình lại).
 */
const mockWorkspaceFindUnique = jest.fn();
jest.mock("../../../infrastructure/database", () => ({
  prisma: { workspace: { findUnique: (...args: unknown[]) => mockWorkspaceFindUnique(...args) } },
}));

import { getResolver, clearScopeRegistry, type ResolveContext, type ResolvedAccess } from "../../../core/permission";
import { InMemoryChannelRepository } from "../repositories/channel.repository.inmemory";
import { InMemoryChannelGrantRepository } from "../repositories/channel-grant.repository.inmemory";
import { registerChannelPermissionResolver, computeChannelActions } from "../services/channel-permission.resolver";
import type { Channel, ChannelGrant } from "../entities/channel.interface";

const user = { id: "u1", email: "u1@example.com" };

function makeChannel(overrides: Partial<Channel> = {}): Channel {
  return {
    id: "ch1",
    workspaceId: "ws1",
    name: "Frontend",
    normalizedName: "frontend",
    description: null,
    type: "TEXT",
    visibility: "PUBLIC",
    postingPolicy: "MEMBERS",
    status: "ACTIVE",
    archiveReason: null,
    archivedAt: null,
    archivedBy: null,
    isDefault: false,
    position: 0,
    lastSeq: 0,
    lastMessageAt: null,
    lastMessageId: null,
    memberCount: 1,
    createdBy: "creator1",
    version: 1,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function makeGrant(overrides: Partial<ChannelGrant> = {}): ChannelGrant {
  return {
    id: "g1",
    channelId: "ch1",
    workspaceId: "ws1",
    userId: "u1",
    level: "MEMBER",
    source: "DIRECT",
    roleRef: null,
    grantedBy: "creator1",
    createdAt: new Date(),
    ...overrides,
    // Grant DIRECT: subjectKey = userId (p3-04); ROLE seed tự đặt `subjectKey`.
    subjectKey: overrides.subjectKey ?? overrides.userId ?? "u1",
  };
}

function wsAccess(overrides: Partial<ResolvedAccess> = {}): ResolvedAccess {
  return { visible: true, role: "MEMBER", actions: new Set(), ...overrides };
}

function buildResolveArgs(wsResult: ResolvedAccess) {
  const ctx: ResolveContext = { now: new Date(), resolve: jest.fn().mockResolvedValue(wsResult) };
  return ctx;
}

describe("channel-permission.resolver — computeChannelActions (README §6 ma trận)", () => {
  it("ADMINS_ONLY + không quản lý: write (channel.message.send) bị chặn, react vẫn cho phép", () => {
    const actions = computeChannelActions({ isPrivate: false, manage: false, writable: true, postingPolicy: "ADMINS_ONLY" });
    expect(actions.has("channel.message.send")).toBe(false);
    expect(actions.has("channel.message.react")).toBe(true);
    expect(actions.has("channel.read")).toBe(true);
  });

  it("ADMINS_ONLY + có quản lý: write vẫn được phép (manage bỏ qua policy)", () => {
    const actions = computeChannelActions({ isPrivate: false, manage: true, writable: true, postingPolicy: "ADMINS_ONLY" });
    expect(actions.has("channel.message.send")).toBe(true);
    expect(actions.has("channel.message.react")).toBe(true);
  });

  it("MEMBERS policy + không quản lý: write + react đều cho phép", () => {
    const actions = computeChannelActions({ isPrivate: false, manage: false, writable: true, postingPolicy: "MEMBERS" });
    expect(actions.has("channel.message.send")).toBe(true);
    expect(actions.has("channel.message.react")).toBe(true);
  });

  it("writable=false (kênh/workspace ARCHIVED): không còn send/react dù có quyền quản lý", () => {
    const actions = computeChannelActions({ isPrivate: false, manage: true, writable: false, postingPolicy: "MEMBERS" });
    expect(actions.has("channel.message.send")).toBe(false);
    expect(actions.has("channel.message.react")).toBe(false);
    expect(actions.has("channel.read")).toBe(true);
    // manage/pin/moderate KHÔNG phụ thuộc writable — vẫn cần cho archive/restore
    // (route dùng requireChannelAccess("manage") kể cả khi ARCHIVED).
    expect(actions.has("channel.manage")).toBe(true);
    expect(actions.has("channel.grant.manage")).toBe(true);
    expect(actions.has("channel.message.pin")).toBe(true);
    expect(actions.has("channel.message.moderate")).toBe(true);
  });

  it("manage=false: không có pin/moderate/manage/grant.manage", () => {
    const actions = computeChannelActions({ isPrivate: false, manage: false, writable: true, postingPolicy: "MEMBERS" });
    expect(actions.has("channel.message.pin")).toBe(false);
    expect(actions.has("channel.message.moderate")).toBe(false);
    expect(actions.has("channel.manage")).toBe(false);
    expect(actions.has("channel.grant.manage")).toBe(false);
  });
});

describe("channel-permission.resolver — resolve() (be.md §5.5)", () => {
  afterEach(() => {
    clearScopeRegistry();
    mockWorkspaceFindUnique.mockReset();
  });

  it("kênh không tồn tại → visible false, không action", async () => {
    const channelRepo = new InMemoryChannelRepository();
    const grantRepo = new InMemoryChannelGrantRepository();
    registerChannelPermissionResolver(channelRepo, grantRepo);

    const ctx = buildResolveArgs(wsAccess());
    const access = await getResolver("CHANNEL")!.resolve(user, "khong-ton-tai", ctx);
    expect(access.visible).toBe(false);
    expect(access.actions.size).toBe(0);
  });

  it("workspace không visible (không phải thành viên) → channel cũng invisible dù PUBLIC", async () => {
    const channelRepo = new InMemoryChannelRepository();
    channelRepo.seed(makeChannel({ visibility: "PUBLIC" }));
    const grantRepo = new InMemoryChannelGrantRepository();
    registerChannelPermissionResolver(channelRepo, grantRepo);
    mockWorkspaceFindUnique.mockResolvedValue({ status: "ACTIVE" });

    const ctx = buildResolveArgs(wsAccess({ visible: false, role: null }));
    const access = await getResolver("CHANNEL")!.resolve(user, "ch1", ctx);
    expect(access.visible).toBe(false);
  });

  it("kênh PRIVATE, OWNER workspace nhưng KHÔNG có grant → invisible (404), KHÔNG phải forbidden (README §6/PR-02)", async () => {
    const channelRepo = new InMemoryChannelRepository();
    channelRepo.seed(makeChannel({ visibility: "PRIVATE" }));
    const grantRepo = new InMemoryChannelGrantRepository(); // không seed grant nào cho u1
    registerChannelPermissionResolver(channelRepo, grantRepo);
    mockWorkspaceFindUnique.mockResolvedValue({ status: "ACTIVE" });

    const ctx = buildResolveArgs(wsAccess({ role: "OWNER" }));
    const access = await getResolver("CHANNEL")!.resolve(user, "ch1", ctx);
    expect(access.visible).toBe(false);
    expect(access.role).toBeNull();
    expect(access.actions.size).toBe(0);
  });

  it("kênh PRIVATE, ADMIN workspace nhưng KHÔNG có grant → cũng invisible (ADMIN không tự bỏ qua grant)", async () => {
    const channelRepo = new InMemoryChannelRepository();
    channelRepo.seed(makeChannel({ visibility: "PRIVATE" }));
    const grantRepo = new InMemoryChannelGrantRepository();
    registerChannelPermissionResolver(channelRepo, grantRepo);
    mockWorkspaceFindUnique.mockResolvedValue({ status: "ACTIVE" });

    const ctx = buildResolveArgs(wsAccess({ role: "ADMIN" }));
    const access = await getResolver("CHANNEL")!.resolve(user, "ch1", ctx);
    expect(access.visible).toBe(false);
  });

  it("kênh PRIVATE, có grant MEMBER → visible, role MEMBER, không có quyền quản lý", async () => {
    const channelRepo = new InMemoryChannelRepository();
    channelRepo.seed(makeChannel({ visibility: "PRIVATE" }));
    const grantRepo = new InMemoryChannelGrantRepository();
    grantRepo.seed(makeGrant({ level: "MEMBER" }));
    registerChannelPermissionResolver(channelRepo, grantRepo);
    mockWorkspaceFindUnique.mockResolvedValue({ status: "ACTIVE" });

    const ctx = buildResolveArgs(wsAccess({ role: "MEMBER" }));
    const access = await getResolver("CHANNEL")!.resolve(user, "ch1", ctx);
    expect(access.visible).toBe(true);
    expect(access.role).toBe("MEMBER");
    expect(access.actions.has("channel.manage")).toBe(false);
    expect(access.actions.has("channel.read")).toBe(true);
  });

  it("kênh PRIVATE, có grant MANAGER → visible, role MANAGER, có quyền quản lý (bất kể role workspace)", async () => {
    const channelRepo = new InMemoryChannelRepository();
    channelRepo.seed(makeChannel({ visibility: "PRIVATE" }));
    const grantRepo = new InMemoryChannelGrantRepository();
    grantRepo.seed(makeGrant({ level: "MANAGER" }));
    registerChannelPermissionResolver(channelRepo, grantRepo);
    mockWorkspaceFindUnique.mockResolvedValue({ status: "ACTIVE" });

    // Workspace role chỉ MEMBER — MANAGER grant vẫn đủ để quản lý kênh private.
    const ctx = buildResolveArgs(wsAccess({ role: "MEMBER" }));
    const access = await getResolver("CHANNEL")!.resolve(user, "ch1", ctx);
    expect(access.visible).toBe(true);
    expect(access.role).toBe("MANAGER");
    expect(access.actions.has("channel.manage")).toBe(true);
    expect(access.actions.has("channel.grant.manage")).toBe(true);
  });

  it("kênh PUBLIC, workspace role MEMBER → đọc/react/write được, không quản lý", async () => {
    const channelRepo = new InMemoryChannelRepository();
    channelRepo.seed(makeChannel({ visibility: "PUBLIC" }));
    const grantRepo = new InMemoryChannelGrantRepository();
    registerChannelPermissionResolver(channelRepo, grantRepo);
    mockWorkspaceFindUnique.mockResolvedValue({ status: "ACTIVE" });

    const ctx = buildResolveArgs(wsAccess({ role: "MEMBER" }));
    const access = await getResolver("CHANNEL")!.resolve(user, "ch1", ctx);
    expect(access.visible).toBe(true);
    expect(access.role).toBe("MEMBER");
    expect(access.actions.has("channel.message.send")).toBe(true);
    expect(access.actions.has("channel.manage")).toBe(false);
  });

  it("kênh PUBLIC, workspace role ADMIN/OWNER → có quyền quản lý", async () => {
    const channelRepo = new InMemoryChannelRepository();
    channelRepo.seed(makeChannel({ visibility: "PUBLIC" }));
    const grantRepo = new InMemoryChannelGrantRepository();
    registerChannelPermissionResolver(channelRepo, grantRepo);
    mockWorkspaceFindUnique.mockResolvedValue({ status: "ACTIVE" });

    for (const role of ["ADMIN", "OWNER"] as const) {
      const ctx = buildResolveArgs(wsAccess({ role }));
      const access = await getResolver("CHANNEL")!.resolve(user, "ch1", ctx);
      expect(access.role).toBe("ADMIN");
      expect(access.actions.has("channel.manage")).toBe(true);
    }
  });

  it("workspace ARCHIVED (status khác ACTIVE) → writable=false, mất send/react dù kênh ACTIVE", async () => {
    const channelRepo = new InMemoryChannelRepository();
    channelRepo.seed(makeChannel({ visibility: "PUBLIC", status: "ACTIVE" }));
    const grantRepo = new InMemoryChannelGrantRepository();
    registerChannelPermissionResolver(channelRepo, grantRepo);
    mockWorkspaceFindUnique.mockResolvedValue({ status: "ARCHIVED" });

    const ctx = buildResolveArgs(wsAccess({ role: "MEMBER" }));
    const access = await getResolver("CHANNEL")!.resolve(user, "ch1", ctx);
    expect(access.visible).toBe(true);
    expect(access.actions.has("channel.read")).toBe(true);
    expect(access.actions.has("channel.message.send")).toBe(false);
  });

  it("kênh ARCHIVED (status kênh khác ACTIVE) → writable=false dù workspace ACTIVE", async () => {
    const channelRepo = new InMemoryChannelRepository();
    channelRepo.seed(makeChannel({ visibility: "PUBLIC", status: "ARCHIVED" }));
    const grantRepo = new InMemoryChannelGrantRepository();
    registerChannelPermissionResolver(channelRepo, grantRepo);
    mockWorkspaceFindUnique.mockResolvedValue({ status: "ACTIVE" });

    const ctx = buildResolveArgs(wsAccess({ role: "MEMBER" }));
    const access = await getResolver("CHANNEL")!.resolve(user, "ch1", ctx);
    expect(access.actions.has("channel.message.send")).toBe(false);
    expect(access.actions.has("channel.read")).toBe(true);
  });

  it("versionDeps luôn tham chiếu WORKSPACE cha (be.md — bump WORKSPACE tự vô hiệu cache CHANNEL con)", async () => {
    const channelRepo = new InMemoryChannelRepository();
    channelRepo.seed(makeChannel({ workspaceId: "ws-xyz", visibility: "PUBLIC" }));
    const grantRepo = new InMemoryChannelGrantRepository();
    registerChannelPermissionResolver(channelRepo, grantRepo);
    mockWorkspaceFindUnique.mockResolvedValue({ status: "ACTIVE" });

    const ctx = buildResolveArgs(wsAccess({ role: "MEMBER" }));
    const access = await getResolver("CHANNEL")!.resolve(user, "ch1", ctx);
    expect(access.versionDeps).toEqual([{ type: "WORKSPACE", id: "ws-xyz" }]);
    expect(access.parent).toEqual({ type: "WORKSPACE", id: "ws-xyz" });
  });

  it("roomsFor(id) → ch:<id>", () => {
    const channelRepo = new InMemoryChannelRepository();
    const grantRepo = new InMemoryChannelGrantRepository();
    registerChannelPermissionResolver(channelRepo, grantRepo);
    expect(getResolver("CHANNEL")!.roomsFor?.("ch1")).toEqual(["ch:ch1"]);
  });
});

/**
 * p3-04 — grant theo VAI TRÒ: quyền đọc kênh riêng tư = DIRECT ∪ ROLE phủ tới vai trò workspace HIỆN TẠI
 * (`ADMIN` = OWNER+ADMIN, `MEMBER` = OWNER+ADMIN+MEMBER, GUEST không bao giờ), `manage` chỉ từ DIRECT MANAGER.
 */
describe("channel-permission.resolver — role grant (p3-04 §5.2, RB-09/PR-05)", () => {
  afterEach(() => {
    clearScopeRegistry();
    mockWorkspaceFindUnique.mockReset();
  });

  const roleGrant = (roleRef: "ADMIN" | "MEMBER") =>
    makeGrant({ userId: null, source: "ROLE", roleRef, subjectKey: `role:${roleRef}`, level: "MEMBER" });

  async function resolveAs(wsRole: string, grants: ChannelGrant[]) {
    const channelRepo = new InMemoryChannelRepository();
    channelRepo.seed(makeChannel({ visibility: "PRIVATE" }));
    const grantRepo = new InMemoryChannelGrantRepository();
    grants.forEach((g) => grantRepo.seed(g));
    registerChannelPermissionResolver(channelRepo, grantRepo);
    mockWorkspaceFindUnique.mockResolvedValue({ status: "ACTIVE" });
    return getResolver("CHANNEL")!.resolve(user, "ch1", buildResolveArgs(wsAccess({ role: wsRole })));
  }

  it.each([
    ["OWNER", "ADMIN", true],
    ["ADMIN", "ADMIN", true],
    ["MEMBER", "ADMIN", false],
    ["GUEST", "ADMIN", false],
    ["OWNER", "MEMBER", true],
    ["ADMIN", "MEMBER", true],
    ["MEMBER", "MEMBER", true],
    ["GUEST", "MEMBER", false], // khách KHÔNG BAO GIỜ nhận qua vai trò
  ] as const)("vai trò workspace %s × role grant %s → visible=%s", async (wsRole, roleRef, visible) => {
    const access = await resolveAs(wsRole, [roleGrant(roleRef)]);
    expect(access.visible).toBe(visible);
    if (visible) {
      expect(access.role).toBe("MEMBER");
      expect(access.actions.has("channel.read")).toBe(true);
      expect(access.actions.has("channel.message.send")).toBe(true);
      expect(access.actions.has("channel.manage")).toBe(false); // manage chỉ từ DIRECT MANAGER
      expect(access.actions.has("channel.grant.manage")).toBe(false);
    }
  });

  it("role grant KHÔNG cấp MANAGER dù dòng dữ liệu ghi level MANAGER (chỉ DIRECT mới quản lý)", async () => {
    const forged = makeGrant({ userId: null, source: "ROLE", roleRef: "MEMBER", subjectKey: "role:MEMBER", level: "MANAGER" });
    const access = await resolveAs("MEMBER", [forged]);
    expect(access.visible).toBe(true);
    expect(access.actions.has("channel.manage")).toBe(false);
  });

  it("PR-05: DIRECT MANAGER + ROLE MEMBER → vẫn quản lý được (hợp các nguồn); gỡ DIRECT còn ROLE → chỉ thành viên", async () => {
    const both = await resolveAs("MEMBER", [makeGrant({ level: "MANAGER" }), roleGrant("MEMBER")]);
    expect(both.role).toBe("MANAGER");
    expect(both.actions.has("channel.manage")).toBe(true);

    const roleOnly = await resolveAs("MEMBER", [roleGrant("MEMBER")]);
    expect(roleOnly.role).toBe("MEMBER");
    expect(roleOnly.actions.has("channel.manage")).toBe(false);
    expect(roleOnly.visible).toBe(true);
  });

  it("role grant chỉ áp cho kênh PRIVATE của chính nó — grant ROLE của kênh khác không phủ tới", async () => {
    const other = makeGrant({ channelId: "ch-khac", userId: null, source: "ROLE", roleRef: "MEMBER", subjectKey: "role:MEMBER" });
    const access = await resolveAs("MEMBER", [other]);
    expect(access.visible).toBe(false);
  });
});

/**
 * p3-04b §5.1 — KHÁCH chỉ đọc kênh có grant DIRECT cho chính họ ("kênh chỉ định"), KỂ CẢ kênh PUBLIC; không nhận "public =
 * mọi thành viên" và không nhận grant theo vai trò. Kết quả kế thừa `expiresAt` của WORKSPACE cha (cache quyền kênh hết hiệu
 * lực đúng lúc khách hết hạn).
 */
describe("channel-permission.resolver — KHÁCH (p3-04b)", () => {
  async function resolveGuest(visibility: "PUBLIC" | "PRIVATE", grants: ChannelGrant[], expiresAt?: Date) {
    const channelRepo = new InMemoryChannelRepository();
    channelRepo.seed(makeChannel({ visibility }));
    const grantRepo = new InMemoryChannelGrantRepository();
    for (const g of grants) grantRepo.seed(g);
    registerChannelPermissionResolver(channelRepo, grantRepo);
    mockWorkspaceFindUnique.mockResolvedValue({ status: "ACTIVE" });
    return getResolver("CHANNEL")!.resolve(user, "ch1", buildResolveArgs(wsAccess({ role: "GUEST", expiresAt })));
  }

  afterEach(() => clearScopeRegistry());

  it("kênh PUBLIC KHÔNG chỉ định (không grant DIRECT) → invisible (RB-01: 404, không phải \"mọi thành viên đọc được\")", async () => {
    const access = await resolveGuest("PUBLIC", []);
    expect(access.visible).toBe(false);
    expect(access.actions.size).toBe(0);
  });

  it("kênh PUBLIC ĐÃ chỉ định (grant DIRECT MEMBER) → đọc + ghi được, role MEMBER, KHÔNG quản lý", async () => {
    const access = await resolveGuest("PUBLIC", [makeGrant({ level: "MEMBER" })]);
    expect(access.visible).toBe(true);
    expect(access.role).toBe("MEMBER");
    expect(access.actions.has("channel.read")).toBe(true);
    expect(access.actions.has("channel.message.send")).toBe(true);
    expect(access.actions.has("channel.manage")).toBe(false);
    expect(access.actions.has("channel.grant.manage")).toBe(false);
  });

  it("kênh PUBLIC: grant theo VAI TRÒ không bao giờ phủ tới khách (chỉ DIRECT tính)", async () => {
    const roleGrant = makeGrant({ userId: null, source: "ROLE", roleRef: "MEMBER", subjectKey: "role:MEMBER" });
    expect((await resolveGuest("PUBLIC", [roleGrant])).visible).toBe(false);
    expect((await resolveGuest("PRIVATE", [roleGrant])).visible).toBe(false);
  });

  it("kênh PRIVATE + grant DIRECT → thấy (như thành viên có grant)", async () => {
    expect((await resolveGuest("PRIVATE", [makeGrant()])).visible).toBe(true);
  });

  it("kế thừa expiresAt của WORKSPACE để cache quyền kênh tự vô hiệu khi khách hết hạn", async () => {
    const expiresAt = new Date(Date.now() + 3600_000);
    const access = await resolveGuest("PUBLIC", [makeGrant()], expiresAt);
    expect(access.expiresAt).toEqual(expiresAt);
  });

  it("thành viên thường (MEMBER) vẫn đọc kênh PUBLIC không cần grant — không đổi hành vi Phase 1", async () => {
    const channelRepo = new InMemoryChannelRepository();
    channelRepo.seed(makeChannel({ visibility: "PUBLIC" }));
    registerChannelPermissionResolver(channelRepo, new InMemoryChannelGrantRepository());
    mockWorkspaceFindUnique.mockResolvedValue({ status: "ACTIVE" });
    const access = await getResolver("CHANNEL")!.resolve(user, "ch1", buildResolveArgs(wsAccess({ role: "MEMBER" })));
    expect(access.visible).toBe(true);
    expect(access.expiresAt).toBeUndefined();
  });
});
