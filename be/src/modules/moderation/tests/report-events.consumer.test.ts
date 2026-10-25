/**
 * Unit — consumer `report.events` / `moderation.private-viewed.notify` / `moderation.author-warned` (be.md p1-08 §5.2/§5.4/§5.5).
 * Bắt processor qua `registerJob` giả; repo/danh bạ/`notify` giả. Kiểm: người xử lý theo phạm vi (không gồm người báo cáo, không lộ
 * actor), 1 thông báo/nhóm/ngày (bỏ qua nếu `Notification.dedupeKey` đã có), socket admin, D-06 thông báo OWNER hoặc 2 người 1-1.
 */
type Handler = (job: { data: unknown }) => Promise<void>;
const handlers: Record<string, Handler> = {};
const mockNotify = jest.fn();
const mockEmitToRoom = jest.fn();
const repoStub = { findById: jest.fn(), findByGroupKey: jest.fn() };
const directoryStub = {
  listConversationAdminIds: jest.fn(),
  listChannelManagerIds: jest.fn(),
  listWorkspaceAdminIds: jest.fn(),
  findWorkspaceOwnerId: jest.fn(),
  notificationExists: jest.fn(),
};

jest.mock("../../../infrastructure/queue", () => ({
  registerJob: (_queue: string, name: string, fn: Handler) => {
    handlers[name] = fn;
  },
}));
jest.mock("../../../infrastructure/database", () => ({
  withTransaction: (fn: (tx: unknown) => Promise<unknown>) => fn({}),
}));
jest.mock("../../../infrastructure/socket", () => ({ ROOM: { admin: (topic: string) => `admin:${topic}` } }));
jest.mock("../../../infrastructure/socket/socket.emit", () => ({ emitToRoom: (...args: unknown[]) => mockEmitToRoom(...args) }));
jest.mock("../../notifications/public", () => ({
  notify: (...args: unknown[]) => mockNotify(...args),
  registerNotificationType: jest.fn(),
}));
jest.mock("../repositories/report.repository.prisma", () => ({ PrismaReportRepository: jest.fn(() => repoStub) }));
jest.mock("../repositories/moderation-directory.repository.prisma", () => ({ PrismaModerationDirectory: jest.fn(() => directoryStub) }));

import "../jobs/report-events.consumer";
import "../jobs/moderation-notify.consumer";
import { makeReport, oid, AUTHOR, CHANNEL_ID, CONV_ID, REPORTER, WS } from "./report-fixtures";

const run = (name: string, data: unknown): Promise<void> => handlers[name]({ data });
const notifyCall = (): { type: string; recipients: Array<{ userId: string }>; dedupeKey: string; actorId?: unknown; source: { id: string }; refs: Record<string, unknown> } =>
  mockNotify.mock.calls[0][1];

describe("report.events — created", () => {
  it("báo cáo tin nhóm chat → thông báo OWNER/ADMIN nhóm (loại người báo cáo), không truyền actorId, emit admin:moderation", async () => {
    const report = makeReport({ scopeType: "CONVERSATION", scopeId: CONV_ID, scopeIsPrivate: true });
    repoStub.findById.mockResolvedValue(report);
    repoStub.findByGroupKey.mockResolvedValue([report, makeReport()]);
    directoryStub.listConversationAdminIds.mockResolvedValue([oid("5"), REPORTER.id]);
    directoryStub.notificationExists.mockResolvedValue(false);

    await run("report.events", { event: "created", reportId: report.id, groupKey: report.groupKey });

    expect(mockEmitToRoom).toHaveBeenCalledWith("admin:moderation", "moderation:report-created", {
      groupKey: report.groupKey,
      targetType: "MESSAGE",
      reportCount: 2,
    });
    const call = notifyCall();
    expect(call.type).toBe("moderation.request");
    expect(call.recipients).toEqual([{ userId: oid("5") }]);
    expect(call.actorId).toBeUndefined();
    expect(call.dedupeKey).toMatch(/^moderation\.request:MESSAGE:.+:\d{8}$/);
    expect(JSON.stringify(call.refs)).not.toContain(REPORTER.id);
  });

  it("kênh PRIVATE → MANAGER kênh; kênh public/USER có ngữ cảnh → OWNER/ADMIN workspace", async () => {
    const privateMsg = makeReport({ scopeType: "CHANNEL", scopeId: CHANNEL_ID, scopeIsPrivate: true });
    repoStub.findById.mockResolvedValue(privateMsg);
    repoStub.findByGroupKey.mockResolvedValue([privateMsg]);
    directoryStub.listChannelManagerIds.mockResolvedValue([oid("6")]);
    directoryStub.notificationExists.mockResolvedValue(false);
    await run("report.events", { event: "created", reportId: privateMsg.id, groupKey: privateMsg.groupKey });
    expect(directoryStub.listChannelManagerIds).toHaveBeenCalledWith(CHANNEL_ID);
    expect(notifyCall().recipients).toEqual([{ userId: oid("6") }]);

    mockNotify.mockClear();
    const publicMsg = makeReport();
    repoStub.findById.mockResolvedValue(publicMsg);
    repoStub.findByGroupKey.mockResolvedValue([publicMsg]);
    directoryStub.listWorkspaceAdminIds.mockResolvedValue([oid("7")]);
    await run("report.events", { event: "created", reportId: publicMsg.id, groupKey: publicMsg.groupKey });
    expect(directoryStub.listWorkspaceAdminIds).toHaveBeenCalledWith(WS);
    expect(notifyCall().recipients).toEqual([{ userId: oid("7") }]);
  });

  it("1 thông báo/nhóm/ngày: Notification.dedupeKey đã có → KHÔNG notify lần nữa (nhưng vẫn emit socket)", async () => {
    const report = makeReport();
    repoStub.findById.mockResolvedValue(report);
    repoStub.findByGroupKey.mockResolvedValue([report]);
    directoryStub.listWorkspaceAdminIds.mockResolvedValue([oid("7")]);
    directoryStub.notificationExists.mockResolvedValue(true);

    await run("report.events", { event: "created", reportId: report.id, groupKey: report.groupKey });

    expect(mockNotify).not.toHaveBeenCalled();
    expect(mockEmitToRoom).toHaveBeenCalledTimes(1);
  });

  it("PLATFORM_ONLY (1-1, kênh private làm đích…) → chỉ socket admin, KHÔNG thông báo ai trong phạm vi", async () => {
    const report = makeReport({ handlerLevel: "PLATFORM_ONLY", scopeType: "CONVERSATION", scopeId: CONV_ID, workspaceId: null });
    repoStub.findById.mockResolvedValue(report);
    repoStub.findByGroupKey.mockResolvedValue([report]);

    await run("report.events", { event: "created", reportId: report.id, groupKey: report.groupKey });

    expect(mockEmitToRoom).toHaveBeenCalledTimes(1);
    expect(mockNotify).not.toHaveBeenCalled();
  });

  it("báo cáo đã biến mất → bỏ qua êm (không ném lỗi, không emit)", async () => {
    repoStub.findById.mockResolvedValue(null);
    await expect(run("report.events", { event: "created", reportId: oid("f"), groupKey: "x" })).resolves.toBeUndefined();
    expect(mockEmitToRoom).not.toHaveBeenCalled();
  });
});

describe("report.events — resolved / content-removed", () => {
  const resolved = (over: Record<string, unknown> = {}) => ({
    event: "resolved",
    groupKey: `MESSAGE:${oid("e")}`,
    targetType: "MESSAGE",
    status: "RESOLVED",
    resolution: "CONTENT_REMOVED",
    resolvedAt: "2026-09-19T10:00:00.000Z",
    reporterIds: [REPORTER.id, oid("6")],
    authorId: AUTHOR,
    messageId: oid("e"),
    reason: "Vi phạm nội quy",
    ...over,
  });

  it("gỡ tin: emit moderation:report-updated, báo TẤT CẢ người báo cáo (không chi tiết) + báo tác giả 'bị gỡ vì …'", async () => {
    directoryStub.notificationExists.mockResolvedValue(false);

    await run("report.events", resolved());

    expect(mockEmitToRoom).toHaveBeenCalledWith("admin:moderation", "moderation:report-updated", {
      groupKey: `MESSAGE:${oid("e")}`,
      status: "RESOLVED",
      resolution: "CONTENT_REMOVED",
    });
    const types = mockNotify.mock.calls.map((c) => c[1].type);
    expect(types).toEqual(["moderation.report-resolved", "moderation.content-removed"]);
    const [reporters, author] = mockNotify.mock.calls.map((c) => c[1]);
    expect(reporters.recipients.map((r: { userId: string }) => r.userId)).toEqual([REPORTER.id, oid("6")]);
    expect(JSON.stringify(reporters.refs)).not.toContain("Vi phạm nội quy"); // người báo cáo không nhận lý do chi tiết
    expect(author.recipients).toEqual([{ userId: AUTHOR }]);
    expect(author.refs).toMatchObject({ messageId: oid("e"), reason: "Vi phạm nội quy" });
  });

  it("bỏ qua (DISMISS/WARN): không báo tác giả 'bị gỡ'; idempotent — thông báo đã tồn tại thì không tạo lại", async () => {
    directoryStub.notificationExists.mockResolvedValue(false);
    await run("report.events", resolved({ status: "DISMISSED", resolution: "NO_ACTION" }));
    expect(mockNotify.mock.calls.map((c) => c[1].type)).toEqual(["moderation.report-resolved"]);

    mockNotify.mockClear();
    directoryStub.notificationExists.mockResolvedValue(true);
    await run("report.events", resolved());
    expect(mockNotify).not.toHaveBeenCalled();
  });

  it("content-removed (gỡ tin không qua báo cáo) → báo tác giả, 1 lần", async () => {
    directoryStub.notificationExists.mockResolvedValue(false);
    await run("report.events", { event: "content-removed", messageId: oid("e"), authorId: AUTHOR, reason: "Vi phạm nội quy" });
    expect(mockNotify).toHaveBeenCalledTimes(1);
    expect(notifyCall()).toMatchObject({ type: "moderation.content-removed", dedupeKey: `moderation.content-removed:${oid("e")}` });
  });
});

describe("moderation.private-viewed.notify (D-06)", () => {
  const payload = (over: Record<string, unknown> = {}) => ({
    reportId: oid("r"),
    scopeType: "CONVERSATION",
    scopeId: CONV_ID,
    workspaceId: WS,
    isDirect: false,
    participantIds: [],
    viewedAt: "2026-09-19T10:00:00.000Z",
    ...over,
  });

  it("nhóm chat/kênh private → thông báo OWNER workspace; refs không có nội dung/danh tính moderator", async () => {
    directoryStub.notificationExists.mockResolvedValue(false);
    directoryStub.findWorkspaceOwnerId.mockResolvedValue(oid("o"));

    await run("moderation.private-viewed.notify", payload());

    const call = notifyCall();
    expect(call).toMatchObject({ type: "moderation.private-viewed", recipients: [{ userId: oid("o") }], dedupeKey: `moderation.private-viewed:${oid("r")}:20260919` });
    expect(call.actorId).toBeUndefined();
    expect(call.refs).toEqual({ scopeType: "CONVERSATION", scopeId: CONV_ID, isDirect: false });
  });

  it("1-1 → thông báo CẢ HAI người trong hội thoại, không tra OWNER", async () => {
    directoryStub.notificationExists.mockResolvedValue(false);
    await run("moderation.private-viewed.notify", payload({ isDirect: true, workspaceId: null, participantIds: [oid("7"), oid("8")] }));
    expect(notifyCall().recipients).toEqual([{ userId: oid("7") }, { userId: oid("8") }]);
    expect(directoryStub.findWorkspaceOwnerId).not.toHaveBeenCalled();
  });

  it("tối đa 1 thông báo/report/ngày (dedupeKey đã có → bỏ qua); không có người nhận → bỏ qua", async () => {
    directoryStub.notificationExists.mockResolvedValue(true);
    await run("moderation.private-viewed.notify", payload());
    expect(mockNotify).not.toHaveBeenCalled();

    directoryStub.notificationExists.mockResolvedValue(false);
    directoryStub.findWorkspaceOwnerId.mockResolvedValue(null);
    await run("moderation.private-viewed.notify", payload());
    expect(mockNotify).not.toHaveBeenCalled();
  });
});

describe("moderation.author-warned", () => {
  it("cảnh cáo → thông báo tác giả `moderation.warning` kèm lý do, KHÔNG nêu người báo cáo, idempotent", async () => {
    directoryStub.notificationExists.mockResolvedValue(false);
    await run("moderation.author-warned", { groupKey: `MESSAGE:${oid("e")}`, authorId: AUTHOR, reason: "Lần đầu vi phạm", resolvedAt: "2026-09-19T10:00:00.000Z" });
    const call = notifyCall();
    expect(call).toMatchObject({ type: "moderation.warning", recipients: [{ userId: AUTHOR }] });
    expect(call.refs).toEqual({ reason: "Lần đầu vi phạm" });

    mockNotify.mockClear();
    directoryStub.notificationExists.mockResolvedValue(true);
    await run("moderation.author-warned", { groupKey: `MESSAGE:${oid("e")}`, authorId: AUTHOR, reason: "Lần đầu vi phạm", resolvedAt: "2026-09-19T10:00:00.000Z" });
    expect(mockNotify).not.toHaveBeenCalled();
  });
});
