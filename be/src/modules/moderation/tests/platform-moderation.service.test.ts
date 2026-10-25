/**
 * Unit — `PlatformModerationService` (be.md p1-08 §5.5/§5.6): D-06 (MOD_004 không phải tin private, MOD_005 hết hạn 24 h,
 * audit `moderation.view-private` ghi TRONG transaction, outbox thông báo), danh sách/chi tiết chỉ metadata với phạm vi
 * private, các hành động PATCH (áp dụng đúng loại đích, LOCK_AUTHOR cần user:update). Repo in-memory, port/danh bạ giả.
 */
const mockOutboxAdd = jest.fn();
jest.mock("../../../infrastructure/database", () => ({
  withTransaction: (fn: (tx: unknown) => Promise<unknown>) => fn({}),
}));
jest.mock("../../../infrastructure/queue", () => ({
  outbox: { add: (...args: unknown[]) => mockOutboxAdd(...args) },
}));

import { LIMITS } from "../../../core/constants/limits";
import { InMemoryReportRepository } from "../repositories/report.repository.inmemory";
import { PlatformModerationService } from "../services/platform-moderation.service";
import { ReportCloser } from "../services/report-closer";
import type { Report } from "../entities/report.interface";
import { AUTHOR, CHANNEL_ID, CONV_ID, MSG_ID, REPORTER, WS, conversation, makeDirectory, makeMessagePort, oid, publicChannel } from "./report-fixtures";

const ADMIN = { id: oid("4"), email: "admin@test.local", role: "admin" };
const MANAGER = { id: oid("5"), email: "manager@test.local", role: "manager" };
const HOUR = 3600 * 1000;

const audit = { record: jest.fn() };

async function seed(repo: InMemoryReportRepository, over: Partial<Report> = {}): Promise<Report> {
  return repo.create({} as never, {
    reporterId: REPORTER.id,
    targetType: "MESSAGE",
    targetId: MSG_ID,
    groupKey: `MESSAGE:${MSG_ID}`,
    scopeType: "CONVERSATION",
    scopeId: CONV_ID,
    scopeIsPrivate: true,
    workspaceId: WS,
    targetAuthorId: AUTHOR,
    handlerLevel: "SCOPE",
    reason: "HARASSMENT",
    description: null,
    ...over,
  });
}

const contextMessages = [
  { id: oid("1"), seq: 9, authorId: AUTHOR, kind: "USER" as const, content: "tin trước", attachments: [], createdAt: new Date(), editedAt: null, deleted: false, deletedAt: null, isTarget: false },
  { id: MSG_ID, seq: 10, authorId: AUTHOR, kind: "USER" as const, content: "tin bị báo cáo", attachments: [], createdAt: new Date(), editedAt: null, deleted: false, deletedAt: null, isTarget: true },
];

function build(opts: { directory?: ReturnType<typeof makeDirectory>; messages?: ReturnType<typeof makeMessagePort> } = {}) {
  const repo = new InMemoryReportRepository();
  const directory = opts.directory ?? makeDirectory({ findUsers: jest.fn().mockResolvedValue([{ id: AUTHOR, name: "Tác giả" }]) });
  const messages = opts.messages ?? makeMessagePort({ contextAround: jest.fn().mockResolvedValue(contextMessages) });
  const users = { lock: jest.fn() };
  const channels = { platformArchive: jest.fn() };
  const conversations = { platformDissolve: jest.fn() };
  const service = new PlatformModerationService(repo, directory, messages, new ReportCloser(repo, audit), users, channels, conversations);
  return { repo, directory, messages, users, channels, conversations, service };
}

beforeEach(() => {
  mockOutboxAdd.mockReset();
  audit.record.mockReset();
});

describe("PlatformModerationService.content — D-06", () => {
  it("MOD-06: nhóm chat → trả ±3 tin + audit moderation.view-private (trong tx) + outbox thông báo; báo cáo OPEN → không hết hạn", async () => {
    const { repo, messages, service } = build();
    const report = await seed(repo);

    const res = await service.content(ADMIN, report.id);

    expect(messages.contextAround).toHaveBeenCalledWith(MSG_ID, LIMITS.report.contentContextSize);
    expect(res.messages.map((m) => m.content)).toEqual(["tin trước", "tin bị báo cáo"]);
    expect(res.messages[0].authorName).toBe("Tác giả");
    expect(res.accessExpiresAt).toBeNull();
    expect(res.scope).toMatchObject({ type: "CONVERSATION", id: CONV_ID });

    expect(repo.audits).toEqual([
      expect.objectContaining({
        actorId: ADMIN.id,
        action: "moderation.view-private",
        targetType: "Report",
        targetId: report.id,
        workspaceId: WS,
        metadata: { scopeType: "CONVERSATION", scopeId: CONV_ID, messageIds: [oid("1"), MSG_ID] },
      }),
    ]);
    const event = mockOutboxAdd.mock.calls[0][1];
    expect(event).toMatchObject({ type: "moderation.private-viewed", jobName: "moderation.private-viewed.notify" });
    expect(event.payload).toMatchObject({ reportId: report.id, workspaceId: WS, isDirect: false, participantIds: [] });
  });

  it("1-1: payload outbox mang 2 người tham gia (thông báo cho cả hai)", async () => {
    const participantIds = [oid("7"), oid("8")];
    const directory = makeDirectory({
      findConversations: jest.fn().mockResolvedValue([conversation({ kind: "DIRECT", workspaceId: null })]),
      listConversationMemberIds: jest.fn().mockResolvedValue(participantIds),
    });
    const { repo, service } = build({ directory, messages: makeMessagePort({ contextAround: jest.fn().mockResolvedValue(contextMessages) }) });
    const report = await seed(repo, { handlerLevel: "PLATFORM_ONLY", workspaceId: null });

    await service.content(ADMIN, report.id);

    expect(mockOutboxAdd.mock.calls[0][1].payload).toMatchObject({ isDirect: true, participantIds });
  });

  it("MOD_004: đích không phải MESSAGE / phạm vi PUBLIC → 403, không audit, không đọc tin", async () => {
    const { repo, messages, service } = build();
    const userReport = await seed(repo, { targetType: "USER", targetId: oid("7"), groupKey: `USER:${oid("7")}`, scopeType: null, scopeId: null, scopeIsPrivate: false });
    const publicMsg = await seed(repo, { targetId: oid("8"), groupKey: `MESSAGE:${oid("8")}`, scopeType: "CHANNEL", scopeId: CHANNEL_ID, scopeIsPrivate: false });

    for (const r of [userReport, publicMsg]) {
      await expect(service.content(ADMIN, r.id)).rejects.toMatchObject({ statusCode: 403, errorCode: "MOD_004" });
    }
    expect(messages.contextAround).not.toHaveBeenCalled();
    expect(repo.audits).toHaveLength(0);
    expect(mockOutboxAdd).not.toHaveBeenCalled();
  });

  it("MOD-07: xem 25 h sau khi đóng báo cáo → 403 MOD_005; 23 h sau vẫn được, kèm accessExpiresAt", async () => {
    const { repo, service } = build();
    const report = await seed(repo);
    const closedAt = (hoursAgo: number) => {
      report.status = "RESOLVED";
      report.resolution = "NO_ACTION";
      report.resolvedAt = new Date(Date.now() - hoursAgo * HOUR);
    };

    closedAt(25);
    await expect(service.content(ADMIN, report.id)).rejects.toMatchObject({ statusCode: 403, errorCode: "MOD_005" });
    expect(repo.audits).toHaveLength(0);

    closedAt(23);
    const res = await service.content(ADMIN, report.id);
    expect(res.accessExpiresAt).toEqual(new Date((report.resolvedAt as Date).getTime() + LIMITS.report.privateViewGraceHours * HOUR));
  });

  it("SystemConfig moderation.privateViewGraceHours: thời hạn xem theo giá trị cấu hình (không cố định 24 h) — hạ còn 2 h thì 3 h sau đã hết hạn, nâng 72 h thì 48 h sau còn xem được", async () => {
    const closedHoursAgo = (report: Awaited<ReturnType<typeof seed>>, hours: number) => {
      report.status = "RESOLVED";
      report.resolution = "NO_ACTION";
      report.resolvedAt = new Date(Date.now() - hours * HOUR);
    };
    const withGrace = (hours: number) => {
      const repo = new InMemoryReportRepository();
      const directory = makeDirectory({ findUsers: jest.fn().mockResolvedValue([{ id: AUTHOR, name: "Tác giả" }]) });
      const messages = makeMessagePort({ contextAround: jest.fn().mockResolvedValue(contextMessages) });
      const service = new PlatformModerationService(
        repo,
        directory,
        messages,
        new ReportCloser(repo, audit),
        { lock: jest.fn() },
        { platformArchive: jest.fn() },
        { platformDissolve: jest.fn() },
        async () => hours
      );
      return { repo, service };
    };

    const short = withGrace(2);
    const shortReport = await seed(short.repo);
    closedHoursAgo(shortReport, 3);
    await expect(short.service.content(ADMIN, shortReport.id)).rejects.toMatchObject({ statusCode: 403, errorCode: "MOD_005" });

    const long = withGrace(72);
    const longReport = await seed(long.repo);
    closedHoursAgo(longReport, 48);
    const res = await long.service.content(ADMIN, longReport.id);
    expect(res.accessExpiresAt).toEqual(new Date((longReport.resolvedAt as Date).getTime() + 72 * HOUR));
  });

  it("nhóm còn báo cáo OPEN mới (dù báo cáo cũ đã đóng > 24 h) → vẫn xem được", async () => {
    const { repo, service } = build();
    const old = await seed(repo);
    old.status = "RESOLVED";
    old.resolvedAt = new Date(Date.now() - 48 * HOUR);
    await seed(repo, { reporterId: oid("6") });

    await expect(service.content(ADMIN, old.id)).resolves.toMatchObject({ accessExpiresAt: null });
  });

  it("không có tin để hiển thị (đã bị xoá vật lý) → 404, không audit", async () => {
    const { repo, service } = build({ messages: makeMessagePort({ contextAround: jest.fn().mockResolvedValue([]) }) });
    const report = await seed(repo);
    await expect(service.content(ADMIN, report.id)).rejects.toMatchObject({ statusCode: 404 });
    expect(repo.audits).toHaveLength(0);
  });
});

describe("PlatformModerationService.list / detail — chỉ metadata", () => {
  it("list gộp theo đích, sort reportCount, tên kênh CHỈ với kênh public, không có nội dung/reporterId", async () => {
    const directory = makeDirectory({
      findUsers: jest.fn().mockResolvedValue([{ id: AUTHOR, name: "Tác giả" }]),
      findWorkspaces: jest.fn().mockResolvedValue([{ id: WS, name: "Nhóm A" }]),
      findChannels: jest.fn().mockResolvedValue([publicChannel()]),
    });
    const { repo, service } = build({ directory });
    await seed(repo, { scopeType: "CHANNEL", scopeId: CHANNEL_ID, scopeIsPrivate: false }); // public, 1 báo cáo
    await seed(repo, { targetId: oid("8"), groupKey: `MESSAGE:${oid("8")}` }); // private, 2 báo cáo
    await seed(repo, { targetId: oid("8"), groupKey: `MESSAGE:${oid("8")}`, reporterId: oid("6") });

    const res = await service.list({ page: 1, limit: 20, status: "OPEN", sort: "reportCount" });

    expect(res.total).toBe(2);
    expect(res.data.map((g) => g.reportCount)).toEqual([2, 1]);
    expect(res.data[0].scope).toEqual({ type: "CONVERSATION", isPrivate: true }); // private → không tên
    expect(res.data[1].scope).toEqual({ type: "CHANNEL", isPrivate: false, name: "general" });
    expect(res.data[0].workspace).toEqual({ id: WS, name: "Nhóm A" });
    expect(JSON.stringify(res)).not.toContain("reporterId");
    expect(JSON.stringify(res)).not.toContain("nội dung");
  });

  it("list lọc theo status/targetType/workspace và phân trang page/limit", async () => {
    const { repo, service } = build();
    await seed(repo);
    await seed(repo, { targetType: "USER", targetId: oid("7"), groupKey: `USER:${oid("7")}` });
    const onlyUsers = await service.list({ page: 1, limit: 20, status: "OPEN", targetType: "USER", sort: "latest" });
    expect(onlyUsers.data.map((g) => g.targetType)).toEqual(["USER"]);
    const page2 = await service.list({ page: 2, limit: 1, status: "OPEN", sort: "latest" });
    expect(page2.total).toBe(2);
    expect(page2.data).toHaveLength(1);
  });

  it("detail phạm vi PRIVATE: có người báo cáo + lịch sử + authorStats nhưng KHÔNG có publicContent (không đọc tin)", async () => {
    const directory = makeDirectory({ findUsers: jest.fn().mockResolvedValue([{ id: REPORTER.id, name: "Người báo cáo" }, { id: AUTHOR, name: "Tác giả" }]) });
    const { repo, messages, service } = build({ directory });
    const report = await seed(repo);

    const detail = await service.detail(report.id);

    expect(detail.publicContent).toBeUndefined();
    expect(messages.contextAround).not.toHaveBeenCalled();
    expect(detail.reports[0].reporter).toEqual({ id: REPORTER.id, name: "Người báo cáo" });
    expect(detail.authorStats).toEqual({ reports30d: 1, removed30d: 0 });
  });

  it("detail kênh PUBLIC: kèm publicContent ±3 (moderation:view)", async () => {
    const { repo, messages, service } = build();
    const report = await seed(repo, { scopeType: "CHANNEL", scopeId: CHANNEL_ID, scopeIsPrivate: false });
    const detail = await service.detail(report.id);
    expect(messages.contextAround).toHaveBeenCalledWith(MSG_ID, LIMITS.report.contentContextSize);
    expect(detail.publicContent).toHaveLength(2);
  });
});

describe("PlatformModerationService.act — PATCH", () => {
  it("REMOVE_CONTENT trên MESSAGE: gỡ tin (PLATFORM) + đóng nhóm CONTENT_REMOVED + audit moderation.remove-content", async () => {
    const { repo, messages, service } = build();
    const report = await seed(repo);

    const res = await service.act(ADMIN, report.id, { action: "REMOVE_CONTENT", reason: "Vi phạm quy định" });

    expect(messages.removeByModerator).toHaveBeenCalledWith(expect.objectContaining({ source: "PLATFORM", messageId: MSG_ID, reportId: report.id }));
    expect(res).toMatchObject({ status: "RESOLVED", resolution: "CONTENT_REMOVED", closedCount: 1 });
    expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({ action: "moderation.remove-content" }));
  });

  it("MOD_003: hành động không hợp loại đích (REMOVE_CONTENT↔USER, ARCHIVE_CHANNEL↔MESSAGE, DISSOLVE↔CHANNEL...)", async () => {
    const { repo, messages, service } = build();
    const user = await seed(repo, { targetType: "USER", targetId: oid("7"), groupKey: `USER:${oid("7")}`, targetAuthorId: oid("7") });
    const message = await seed(repo);
    const channel = await seed(repo, { targetType: "CHANNEL", targetId: CHANNEL_ID, groupKey: `CHANNEL:${CHANNEL_ID}`, targetAuthorId: null, scopeType: "CHANNEL", scopeId: CHANNEL_ID, scopeIsPrivate: false });

    await expect(service.act(ADMIN, user.id, { action: "REMOVE_CONTENT", reason: "Vi phạm quy định" })).rejects.toMatchObject({ errorCode: "MOD_003" });
    await expect(service.act(ADMIN, message.id, { action: "ARCHIVE_CHANNEL", reason: "Vi phạm quy định" })).rejects.toMatchObject({ errorCode: "MOD_003" });
    await expect(service.act(ADMIN, channel.id, { action: "DISSOLVE_CONVERSATION", reason: "Vi phạm quy định" })).rejects.toMatchObject({ errorCode: "MOD_003" });
    await expect(service.act(ADMIN, channel.id, { action: "LOCK_AUTHOR", reason: "Vi phạm quy định" })).rejects.toMatchObject({ errorCode: "MOD_003" });
    expect(messages.removeByModerator).not.toHaveBeenCalled();
  });

  it("LOCK_AUTHOR: admin (có user:update) khoá tài khoản tác giả; manager (KHÔNG có user:update) → 403, không khoá, không đóng nhóm", async () => {
    const { repo, users, service } = build();
    const report = await seed(repo);

    await expect(service.act(MANAGER, report.id, { action: "LOCK_AUTHOR", reason: "Vi phạm nghiêm trọng" })).rejects.toMatchObject({ statusCode: 403 });
    expect(users.lock).not.toHaveBeenCalled();
    expect(repo.reports[0].status).toBe("OPEN");

    await expect(service.act(ADMIN, report.id, { action: "LOCK_AUTHOR", reason: "Vi phạm nghiêm trọng" })).resolves.toMatchObject({ resolution: "USER_LOCKED" });
    expect(users.lock).toHaveBeenCalledWith(AUTHOR, ADMIN.id, "Vi phạm nghiêm trọng");
  });

  it("ARCHIVE_CHANNEL/DISSOLVE_CONVERSATION gọi đúng cổng nền tảng; DISMISS không có tác dụng phụ", async () => {
    const { repo, channels, conversations, messages, service } = build();
    const channel = await seed(repo, { targetType: "CHANNEL", targetId: CHANNEL_ID, groupKey: `CHANNEL:${CHANNEL_ID}`, targetAuthorId: null, scopeType: "CHANNEL", scopeId: CHANNEL_ID, scopeIsPrivate: false });
    const conv = await seed(repo, { targetType: "CONVERSATION", targetId: CONV_ID, groupKey: `CONVERSATION:${CONV_ID}`, targetAuthorId: null });
    const spam = await seed(repo, { targetId: oid("8"), groupKey: `MESSAGE:${oid("8")}` });

    await service.act(ADMIN, channel.id, { action: "ARCHIVE_CHANNEL", reason: "Vi phạm quy định" });
    await service.act(ADMIN, conv.id, { action: "DISSOLVE_CONVERSATION", reason: "Vi phạm quy định" });
    await service.act(ADMIN, spam.id, { action: "DISMISS", reason: "Không vi phạm" });

    expect(channels.platformArchive).toHaveBeenCalledWith(ADMIN.id, CHANNEL_ID, "Vi phạm quy định");
    expect(conversations.platformDissolve).toHaveBeenCalledWith(ADMIN.id, CONV_ID);
    expect(messages.removeByModerator).not.toHaveBeenCalled();
    expect(repo.reports.map((r) => r.resolution).sort()).toEqual(["CHANNEL_ARCHIVED", "CONVERSATION_DISSOLVED", "NO_ACTION"]);
  });

  it("MOD_001: nhóm đã đóng → 409 và KHÔNG khoá tài khoản/gỡ tin lần nữa", async () => {
    const { repo, users, service } = build();
    const report = await seed(repo);
    await service.act(ADMIN, report.id, { action: "DISMISS", reason: "Không vi phạm" });

    await expect(service.act(ADMIN, report.id, { action: "LOCK_AUTHOR", reason: "Vi phạm nghiêm trọng" })).rejects.toMatchObject({ statusCode: 409, errorCode: "MOD_001" });
    expect(users.lock).not.toHaveBeenCalled();
  });

  it("báo cáo không tồn tại → 404", async () => {
    const { service } = build();
    await expect(service.act(ADMIN, oid("f"), { action: "DISMISS", reason: "Không vi phạm" })).rejects.toMatchObject({ statusCode: 404 });
  });
});

describe("PlatformModerationService.removeMessage", () => {
  it("tin đang bị báo cáo → gỡ + đóng nhóm CONTENT_REMOVED (tác giả được báo qua report.resolved)", async () => {
    const { repo, service } = build();
    await seed(repo);
    const res = await service.removeMessage(ADMIN, MSG_ID, { reason: "Vi phạm quy định" });
    expect(res.messageId).toBe(MSG_ID);
    expect(repo.reports[0]).toMatchObject({ status: "RESOLVED", resolution: "CONTENT_REMOVED", resolvedAtLevel: "PLATFORM_ONLY" });
    expect(mockOutboxAdd.mock.calls.map((c) => c[1].jobName)).toEqual(["report.events"]);
  });

  it("tin KHÔNG có báo cáo → vẫn gỡ + outbox `content-removed` để báo tác giả; gỡ lần 2 (alreadyDeleted) không báo lại", async () => {
    const ref = { id: MSG_ID, scopeType: "CHANNEL" as const, scopeId: CHANNEL_ID, workspaceId: WS, authorId: AUTHOR, kind: "USER" as const, deleted: false, excerpt: "", createdAt: new Date() };
    const messages = makeMessagePort({ findByIds: jest.fn().mockResolvedValue([ref]) });
    const { service } = build({ messages });

    await service.removeMessage(ADMIN, MSG_ID, { reason: "Vi phạm quy định" });
    expect(mockOutboxAdd.mock.calls[0][1]).toMatchObject({ jobName: "report.events", payload: { event: "content-removed", authorId: AUTHOR, messageId: MSG_ID } });

    mockOutboxAdd.mockClear();
    messages.removeByModerator.mockResolvedValue({ messageId: MSG_ID, deletedAt: new Date(), alreadyDeleted: true });
    await service.removeMessage(ADMIN, MSG_ID, { reason: "Vi phạm quy định" });
    expect(mockOutboxAdd).not.toHaveBeenCalled();
  });
});
