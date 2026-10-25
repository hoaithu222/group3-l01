/**
 * Unit — `StaleReportReminderService` (cron `reports.stale-reminder`, be.md p1-08 §7): chỉ nhắc nhóm báo cáo OPEN quá `staleReminderHours`; người xử lý
 * phạm vi theo đúng phạm vi (nhóm chat → admin nhóm, kênh private → manager kênh, còn lại → admin workspace); mỗi nhóm/ngày MỘT thông báo;
 * quản trị nền tảng nhận MỘT thông báo tổng hợp/ngày; refs không lộ danh tính người báo cáo; chạy lại trong ngày không nhắc thêm.
 */
import type { NotifyInput } from "../../notifications/public";
import { LIMITS } from "../../../core/constants/limits";
import { InMemoryReportRepository } from "../repositories/report.repository.inmemory";
import { StaleReportReminderService } from "../services/stale-report-reminder.service";
import { CHANNEL_ID, CONV_ID, makeDirectory, makeReport, oid, REPORTER, WS } from "./report-fixtures";

const HOUR = 3_600_000;
const NOW = new Date(Date.UTC(2026, 8, 25, 2, 0, 0)); // 09:00 ICT
const ago = (hours: number): Date => new Date(NOW.getTime() - hours * HOUR);

function setup(reports: ReturnType<typeof makeReport>[], dirOver: Parameters<typeof makeDirectory>[0] = {}) {
  const repo = new InMemoryReportRepository();
  repo.reports.push(...reports);
  const directory = makeDirectory(dirOver);
  const sent: NotifyInput[] = [];
  const service = new StaleReportReminderService(
    repo,
    directory,
    async (input) => {
      sent.push(input);
    },
    () => NOW
  );
  return { service, directory, sent, repo };
}

describe("StaleReportReminderService", () => {
  it(`chỉ nhóm OPEN quá ${LIMITS.report.staleReminderHours} giờ; báo cáo mới hơn hoặc đã đóng không bị nhắc`, async () => {
    const stale = makeReport({ targetId: oid("1"), groupKey: `MESSAGE:${oid("1")}`, createdAt: ago(LIMITS.report.staleReminderHours + 1) });
    const fresh = makeReport({ targetId: oid("2"), groupKey: `MESSAGE:${oid("2")}`, createdAt: ago(10) });
    const closed = makeReport({
      targetId: oid("3"),
      groupKey: `MESSAGE:${oid("3")}`,
      createdAt: ago(200),
      status: "RESOLVED",
      resolution: "NO_ACTION",
    });
    const { service, sent } = setup([stale, fresh, closed], { listWorkspaceAdminIds: jest.fn().mockResolvedValue([oid("5")]) });

    const result = await service.run();
    expect(result).toEqual({ staleGroups: 1, scopeNotified: 1, platformNotified: false }); // không có moderator nền tảng trong danh bạ giả
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({ type: "moderation.stale-reminder", recipients: [{ userId: oid("5") }] });
    expect(sent[0]!.dedupeKey).toMatch(/^moderation\.stale-reminder:MESSAGE:.+:20260925$/);
  });

  it("không có báo cáo tồn đọng → không gọi danh bạ, không thông báo", async () => {
    const { service, sent, directory } = setup([makeReport({ createdAt: ago(1) })]);
    await expect(service.run()).resolves.toEqual({ staleGroups: 0, scopeNotified: 0, platformNotified: false });
    expect(sent).toHaveLength(0);
    expect(directory.listPlatformModeratorIds).not.toHaveBeenCalled();
  });

  it("người xử lý theo PHẠM VI: nhóm chat → admin nhóm; kênh private → manager kênh; kênh public → admin workspace", async () => {
    const conv = makeReport({
      targetId: oid("1"),
      groupKey: `MESSAGE:${oid("1")}`,
      scopeType: "CONVERSATION",
      scopeId: CONV_ID,
      scopeIsPrivate: true,
      createdAt: ago(100),
    });
    const priv = makeReport({
      targetId: oid("2"),
      groupKey: `MESSAGE:${oid("2")}`,
      scopeType: "CHANNEL",
      scopeId: CHANNEL_ID,
      scopeIsPrivate: true,
      createdAt: ago(100),
    });
    const pub = makeReport({ targetId: oid("3"), groupKey: `MESSAGE:${oid("3")}`, createdAt: ago(100) });
    const { service, sent, directory } = setup([conv, priv, pub], {
      listConversationAdminIds: jest.fn().mockResolvedValue([oid("6")]),
      listChannelManagerIds: jest.fn().mockResolvedValue([oid("7")]),
      listWorkspaceAdminIds: jest.fn().mockResolvedValue([oid("8")]),
    });

    const result = await service.run();
    expect(result.scopeNotified).toBe(3);
    expect(directory.listConversationAdminIds).toHaveBeenCalledWith(CONV_ID);
    expect(directory.listChannelManagerIds).toHaveBeenCalledWith(CHANNEL_ID);
    expect(directory.listWorkspaceAdminIds).toHaveBeenCalledWith(WS);
    const byGroup = new Map(sent.map((s) => [(s.refs as { groupKey: string }).groupKey, s.recipients.map((r) => r.userId)]));
    expect(byGroup.get(conv.groupKey)).toEqual([oid("6")]);
    expect(byGroup.get(priv.groupKey)).toEqual([oid("7")]);
    expect(byGroup.get(pub.groupKey)).toEqual([oid("8")]);
  });

  it("nhóm PLATFORM_ONLY chỉ nhắc quản trị nền tảng (không tìm người xử lý phạm vi); nền tảng nhận MỘT thông báo tổng hợp gồm cả nhóm SCOPE", async () => {
    const platformOnly = makeReport({
      targetType: "USER",
      targetId: oid("1"),
      groupKey: `USER:${oid("1")}`,
      handlerLevel: "PLATFORM_ONLY",
      scopeType: null,
      scopeId: null,
      workspaceId: null,
      createdAt: ago(100),
    });
    const scoped = makeReport({ targetId: oid("2"), groupKey: `MESSAGE:${oid("2")}`, createdAt: ago(100) });
    const { service, sent, directory } = setup([platformOnly, scoped], {
      listWorkspaceAdminIds: jest.fn().mockResolvedValue([oid("8")]),
      listPlatformModeratorIds: jest.fn().mockResolvedValue([oid("a"), oid("b")]),
    });

    const result = await service.run();
    expect(result).toEqual({ staleGroups: 2, scopeNotified: 1, platformNotified: true });
    expect(directory.listWorkspaceAdminIds).toHaveBeenCalledTimes(1); // chỉ nhóm SCOPE
    const platform = sent.find((s) => s.dedupeKey === "moderation.stale-reminder:platform:20260925")!;
    expect(platform.recipients).toEqual([{ userId: oid("a") }, { userId: oid("b") }]);
    expect(platform.refs).toEqual({ staleGroups: 2, staleHours: LIMITS.report.staleReminderHours });
    expect(platform.scope).toBeNull();
  });

  it("IDEMPOTENT theo ngày: dedupeKey đã có (chạy lại/retry) → không thông báo thêm", async () => {
    const { service, sent, directory } = setup([makeReport({ createdAt: ago(100) })], {
      listWorkspaceAdminIds: jest.fn().mockResolvedValue([oid("8")]),
      listPlatformModeratorIds: jest.fn().mockResolvedValue([oid("a")]),
    });
    (directory.notificationExists as jest.Mock).mockResolvedValue(true);

    await expect(service.run()).resolves.toEqual({ staleGroups: 1, scopeNotified: 0, platformNotified: false });
    expect(sent).toHaveLength(0);
  });

  it("KHÔNG lộ người báo cáo: refs/recipients không chứa reporterId, không truyền actorId", async () => {
    const { service, sent } = setup([makeReport({ createdAt: ago(100) })], { listWorkspaceAdminIds: jest.fn().mockResolvedValue([oid("8")]) });
    await service.run();
    for (const s of sent) {
      expect(s.actorId).toBeUndefined();
      expect(JSON.stringify(s)).not.toContain(REPORTER.id);
    }
  });

  it("gộp theo nhóm: nhiều báo cáo cùng đích quá hạn → MỘT thông báo, reportCount + oldestAt là báo cáo cũ nhất", async () => {
    const a = makeReport({ reporterId: oid("c"), createdAt: ago(120) });
    const b = makeReport({ reporterId: oid("d"), createdAt: ago(80) });
    const { service, sent } = setup([a, b], { listWorkspaceAdminIds: jest.fn().mockResolvedValue([oid("8")]) });

    await service.run();
    expect(sent).toHaveLength(1);
    expect(sent[0]!.refs).toMatchObject({ reportCount: 2, oldestAt: a.createdAt.toISOString() });
  });

  it("nhóm SCOPE không có người xử lý (nhóm đã giải tán/không còn admin) → bỏ qua, không lỗi", async () => {
    const { service, sent } = setup([makeReport({ createdAt: ago(100) })]);
    await expect(service.run()).resolves.toEqual({ staleGroups: 1, scopeNotified: 0, platformNotified: false });
    expect(sent).toHaveLength(0);
  });
});
