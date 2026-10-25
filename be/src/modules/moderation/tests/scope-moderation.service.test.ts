/**
 * Unit — `ScopeModerationService` (be.md p1-08 §5.3/§5.4): tập phạm vi kiểm duyệt (OWNER/ADMIN ws, MANAGER kênh private,
 * OWNER/ADMIN nhóm chat) tính TRƯỚC truy vấn; MOD-03 (không thấy báo cáo kênh private không grant); MOD-04 (gỡ tin +
 * đóng nhóm + audit + outbox); MOD-08 (không reporterId); 404/403; MOD_001/MOD_003. Repo in-memory, port/danh bạ giả.
 */
const mockOutboxAdd = jest.fn();
jest.mock("../../../infrastructure/database", () => ({
  withTransaction: (fn: (tx: unknown) => Promise<unknown>) => fn({}),
}));
jest.mock("../../../infrastructure/queue", () => ({
  outbox: { add: (...args: unknown[]) => mockOutboxAdd(...args) },
}));

import { InMemoryReportRepository } from "../repositories/report.repository.inmemory";
import { ReportCloser } from "../services/report-closer";
import { ScopeModerationService } from "../services/scope-moderation.service";
import type { Report } from "../entities/report.interface";
import { AUTHOR, CHANNEL_ID, CONV_ID, MSG_ID, REPORTER, WS, makeDirectory, makeMessagePort, oid, publicChannel } from "./report-fixtures";

const VIEWER = { id: oid("4"), email: "mod@test.local", role: "user" };
type AccessStub = { resolve: jest.Mock };
const adminAccess = (): AccessStub => ({ resolve: jest.fn().mockResolvedValue({ visible: true, role: "ADMIN", actions: new Set() }) });
const memberAccess = (): AccessStub => ({ resolve: jest.fn().mockResolvedValue({ visible: true, role: "MEMBER", actions: new Set() }) });
const audit = { record: jest.fn() };

async function seed(repo: InMemoryReportRepository, over: Partial<Report> = {}): Promise<Report> {
  return repo.create({} as never, {
    reporterId: REPORTER.id,
    targetType: "MESSAGE",
    targetId: MSG_ID,
    groupKey: `MESSAGE:${MSG_ID}`,
    scopeType: "CHANNEL",
    scopeId: CHANNEL_ID,
    scopeIsPrivate: false,
    workspaceId: WS,
    targetAuthorId: AUTHOR,
    handlerLevel: "SCOPE",
    reason: "SPAM",
    description: null,
    ...over,
  });
}

function build(opts: { access?: () => AccessStub; directory?: ReturnType<typeof makeDirectory>; messages?: ReturnType<typeof makeMessagePort> } = {}) {
  const repo = new InMemoryReportRepository();
  const directory = opts.directory ?? makeDirectory();
  const messages = opts.messages ?? makeMessagePort();
  const service = new ScopeModerationService(repo, directory, messages, (opts.access ?? adminAccess)(), new ReportCloser(repo, audit));
  return { repo, directory, messages, service };
}

beforeEach(() => {
  mockOutboxAdd.mockReset();
  audit.record.mockClear();
});

describe("ScopeModerationService.listForWorkspace — phạm vi kiểm duyệt", () => {
  it("MOD-03: OWNER/ADMIN ws thấy báo cáo kênh PUBLIC + USER có ngữ cảnh; KHÔNG thấy báo cáo kênh PRIVATE (không grant) và PLATFORM_ONLY", async () => {
    const { repo, service } = build();
    await seed(repo); // public channel message
    await seed(repo, { reporterId: oid("6"), targetType: "USER", targetId: oid("7"), groupKey: `USER:${oid("7")}`, scopeType: null, scopeId: null }); // USER context ws
    await seed(repo, { targetId: oid("8"), groupKey: `MESSAGE:${oid("8")}`, scopeIsPrivate: true, scopeId: oid("9") }); // kênh private
    await seed(repo, { targetId: oid("b"), groupKey: `MESSAGE:${oid("b")}`, handlerLevel: "PLATFORM_ONLY", scopeIsPrivate: true, scopeType: "CONVERSATION", scopeId: oid("c"), workspaceId: null });

    const res = await service.listForWorkspace(VIEWER, WS, { status: "OPEN", limit: 30 });

    expect(res.data.map((i) => i.groupKey).sort()).toEqual([`MESSAGE:${MSG_ID}`, `USER:${oid("7")}`].sort());
  });

  it("MANAGER kênh private (không phải ws admin) chỉ thấy báo cáo tin trong kênh private CỦA MÌNH", async () => {
    const privateChannel = oid("9");
    const { repo, service } = build({
      access: memberAccess,
      directory: makeDirectory({ listManagedPrivateChannelIds: jest.fn().mockResolvedValue([privateChannel]) }),
    });
    await seed(repo); // public → không thấy
    await seed(repo, { targetId: oid("8"), groupKey: `MESSAGE:${oid("8")}`, scopeIsPrivate: true, scopeId: privateChannel });
    await seed(repo, { targetId: oid("7"), groupKey: `MESSAGE:${oid("7")}`, scopeIsPrivate: true, scopeId: oid("5") }); // kênh private khác

    const res = await service.listForWorkspace(VIEWER, WS, { status: "OPEN", limit: 30 });

    expect(res.data.map((i) => i.groupKey)).toEqual([`MESSAGE:${oid("8")}`]);
  });

  it("OWNER/ADMIN nhóm chat thấy báo cáo trong nhóm của mình", async () => {
    const { repo, service } = build({
      access: memberAccess,
      directory: makeDirectory({ listAdministeredGroupIds: jest.fn().mockResolvedValue([CONV_ID]) }),
    });
    await seed(repo, { scopeType: "CONVERSATION", scopeId: CONV_ID, scopeIsPrivate: true });
    const res = await service.listForWorkspace(VIEWER, WS, { status: "OPEN", limit: 30 });
    expect(res.data).toHaveLength(1);
  });

  it("MEMBER thường không có phạm vi nào → 403 PERM_001", async () => {
    const { service } = build({ access: memberAccess });
    await expect(service.listForWorkspace(VIEWER, WS, { status: "OPEN", limit: 30 })).rejects.toMatchObject({ statusCode: 403, errorCode: "PERM_001" });
  });

  it("MOD-08: response KHÔNG có reporterId ở bất kỳ mức nào; gộp nhiều người báo cáo thành 1 nhóm với reportCount", async () => {
    const { repo, service } = build();
    await seed(repo);
    await seed(repo, { reporterId: oid("6"), reason: "HARASSMENT" });

    const res = await service.listForWorkspace(VIEWER, WS, { status: "OPEN", limit: 30 });

    expect(res.data).toHaveLength(1);
    expect(res.data[0]).toMatchObject({ reportCount: 2, targetType: "MESSAGE", status: "OPEN" });
    expect(JSON.stringify(res)).not.toContain(REPORTER.id);
    expect(JSON.stringify(res)).not.toContain("reporterId");
  });

  it("preview chỉ khi người xem ĐỌC được phạm vi của tin (lọc lại bằng canReadScope)", async () => {
    const ref = { id: MSG_ID, scopeType: "CHANNEL" as const, scopeId: CHANNEL_ID, workspaceId: WS, authorId: AUTHOR, kind: "USER" as const, deleted: false, excerpt: "spam spam", createdAt: new Date() };
    const canRead = jest.fn().mockResolvedValue(true);
    const { repo, service } = build({
      directory: makeDirectory({ findUsers: jest.fn().mockResolvedValue([{ id: AUTHOR, name: "Tác giả" }]), findChannels: jest.fn().mockResolvedValue([publicChannel()]) }),
      messages: makeMessagePort({ findByIds: jest.fn().mockResolvedValue([ref]), canReadScope: canRead }),
    });
    await seed(repo);

    const withRead = await service.listForWorkspace(VIEWER, WS, { status: "OPEN", limit: 30 });
    expect(withRead.data[0].preview).toEqual({ authorName: "Tác giả", excerpt: "spam spam", deleted: false });
    expect(withRead.data[0].scope).toEqual({ type: "CHANNEL", id: CHANNEL_ID, name: "general" });

    canRead.mockResolvedValue(false);
    const withoutRead = await service.listForWorkspace(VIEWER, WS, { status: "OPEN", limit: 30 });
    expect(withoutRead.data[0].preview).toBeUndefined();
  });
});

describe("ScopeModerationService.resolve", () => {
  it("MOD-04: MANAGER gỡ tin có lý do → gọi port removeByModerator(REPORT), đóng CẢ NHÓM CONTENT_REMOVED, audit report.resolve, outbox report.resolved", async () => {
    const messages = makeMessagePort({ canModerateScope: jest.fn().mockResolvedValue(true) });
    const { repo, service } = build({ messages });
    const first = await seed(repo);
    await seed(repo, { reporterId: oid("6") });

    const result = await service.resolve(VIEWER, first.id, { action: "REMOVE_MESSAGE", reason: "Vi phạm nội quy nhóm" });

    expect(messages.removeByModerator).toHaveBeenCalledWith(expect.objectContaining({ messageId: MSG_ID, actorId: VIEWER.id, source: "REPORT", reason: "Vi phạm nội quy nhóm" }));
    expect(result).toEqual({ groupKey: `MESSAGE:${MSG_ID}`, status: "RESOLVED", resolution: "CONTENT_REMOVED", closedCount: 2 });
    expect(repo.reports.every((r) => r.status === "RESOLVED" && r.resolvedAtLevel === "SCOPE" && r.resolvedBy === VIEWER.id)).toBe(true);
    expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({ action: "report.resolve", actorId: VIEWER.id, workspaceId: WS }));

    const resolved = mockOutboxAdd.mock.calls.map((c) => c[1]).find((e) => e.type === "report.resolved");
    expect(resolved.payload).toMatchObject({ event: "resolved", resolution: "CONTENT_REMOVED", authorId: AUTHOR, messageId: MSG_ID });
    expect([...resolved.payload.reporterIds].sort()).toEqual([REPORTER.id, oid("6")].sort());
  });

  it("DISMISS → DISMISSED/NO_ACTION, KHÔNG gỡ tin; WARN_AUTHOR → outbox moderation.author-warned", async () => {
    const messages = makeMessagePort({ canModerateScope: jest.fn().mockResolvedValue(true) });
    const { repo, service } = build({ messages });
    const a = await seed(repo);

    await expect(service.resolve(VIEWER, a.id, { action: "DISMISS", reason: "Không vi phạm" })).resolves.toMatchObject({ status: "DISMISSED", resolution: "NO_ACTION" });
    expect(messages.removeByModerator).not.toHaveBeenCalled();

    const b = await seed(repo, { reporterId: oid("6") });
    await service.resolve(VIEWER, b.id, { action: "WARN_AUTHOR", reason: "Lần đầu vi phạm" });
    expect(mockOutboxAdd.mock.calls.map((c) => c[1].jobName)).toContain("moderation.author-warned");
  });

  it("MOD_001: nhóm đã đóng hết → 409, KHÔNG gỡ tin lần nữa", async () => {
    const messages = makeMessagePort({ canModerateScope: jest.fn().mockResolvedValue(true) });
    const { repo, service } = build({ messages });
    const report = await seed(repo);
    await service.resolve(VIEWER, report.id, { action: "DISMISS", reason: "Không vi phạm" });
    messages.removeByModerator.mockClear();

    await expect(service.resolve(VIEWER, report.id, { action: "REMOVE_MESSAGE", reason: "Vi phạm nội quy nhóm" })).rejects.toMatchObject({ statusCode: 409, errorCode: "MOD_001" });
    expect(messages.removeByModerator).not.toHaveBeenCalled();
  });

  it("MOD_003: REMOVE_MESSAGE trên báo cáo USER; WARN_AUTHOR khi không có tác giả", async () => {
    const { repo, service } = build();
    const user = await seed(repo, { targetType: "USER", targetId: oid("7"), groupKey: `USER:${oid("7")}`, scopeType: null, scopeId: null, targetAuthorId: oid("7") });
    await expect(service.resolve(VIEWER, user.id, { action: "REMOVE_MESSAGE", reason: "Vi phạm nội quy nhóm" })).rejects.toMatchObject({ statusCode: 400, errorCode: "MOD_003" });

    const noAuthor = await seed(repo, { targetType: "CHANNEL", targetId: CHANNEL_ID, groupKey: `CHANNEL:${CHANNEL_ID}`, targetAuthorId: null });
    await expect(service.resolve(VIEWER, noAuthor.id, { action: "WARN_AUTHOR", reason: "Vi phạm nội quy nhóm" })).rejects.toMatchObject({ errorCode: "MOD_003" });
  });

  it("USER/CHANNEL public: OWNER/ADMIN workspace xử lý được (DISMISS)", async () => {
    const { repo, service } = build();
    const user = await seed(repo, { targetType: "USER", targetId: oid("7"), groupKey: `USER:${oid("7")}`, scopeType: null, scopeId: null, targetAuthorId: oid("7") });
    await expect(service.resolve(VIEWER, user.id, { action: "DISMISS", reason: "Không vi phạm" })).resolves.toMatchObject({ closedCount: 1 });
  });

  it("phân quyền: thấy phạm vi nhưng không kiểm duyệt → 403 PERM_006; không thấy → 404; PLATFORM_ONLY → 404 (chỉ nền tảng)", async () => {
    const notModerator = build({ messages: makeMessagePort({ canReadScope: jest.fn().mockResolvedValue(true) }) });
    const r1 = await seed(notModerator.repo);
    await expect(notModerator.service.resolve(VIEWER, r1.id, { action: "DISMISS", reason: "Không vi phạm" })).rejects.toMatchObject({ statusCode: 403, errorCode: "PERM_006" });

    const cannotSee = build();
    const r2 = await seed(cannotSee.repo);
    await expect(cannotSee.service.resolve(VIEWER, r2.id, { action: "DISMISS", reason: "Không vi phạm" })).rejects.toMatchObject({ statusCode: 404 });

    const platformOnly = build({ messages: makeMessagePort({ canModerateScope: jest.fn().mockResolvedValue(true) }) });
    const r3 = await seed(platformOnly.repo, { handlerLevel: "PLATFORM_ONLY" });
    await expect(platformOnly.service.resolve(VIEWER, r3.id, { action: "DISMISS", reason: "Không vi phạm" })).rejects.toMatchObject({ statusCode: 404 });
  });
});

describe("ScopeModerationService.getDetail", () => {
  it("người báo cáo thuần chỉ thấy báo cáo CỦA MÌNH (reportCount 1) và không có hành động; người lạ → 404", async () => {
    const { repo, service } = build();
    const mine = await seed(repo);
    await seed(repo, { reporterId: oid("6") });

    const detail = await service.getDetail(REPORTER, mine.id);
    expect(detail.reportCount).toBe(1);
    expect(detail.myActions).toEqual({ canRemove: false, canDismiss: false, canWarn: false });

    await expect(service.getDetail({ ...VIEWER, id: oid("5") }, mine.id)).rejects.toMatchObject({ statusCode: 404 });
  });

  it("người kiểm duyệt thấy cả nhóm + myActions; canRemove chỉ với MESSAGE còn OPEN", async () => {
    const { repo, service } = build({ messages: makeMessagePort({ canModerateScope: jest.fn().mockResolvedValue(true) }) });
    const a = await seed(repo);
    await seed(repo, { reporterId: oid("6") });

    const detail = await service.getDetail(VIEWER, a.id);
    expect(detail.reportCount).toBe(2);
    expect(detail.myActions).toEqual({ canRemove: true, canDismiss: true, canWarn: true });
    expect(JSON.stringify(detail)).not.toContain("reporterId");
  });
});
