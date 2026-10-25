import { LIMITS } from "../../../core/constants/limits";
import type { NotifyInput } from "../../notifications/public";
import { MODERATION_NOTIFICATION_TYPES } from "../moderation.notification-types";
import type { ReportGroup } from "../entities/report.interface";
import type { IModerationDirectory } from "../repositories/moderation-directory.repository.interface";
import type { IReportRepository } from "../repositories/report.repository.interface";
import { dayKey } from "../jobs/day-key";
import { groupReports } from "./report-grouping";
import { listScopeHandlerIds } from "./report-handlers";

/** Số người vận hành nền tảng tối đa nhận một lượt nhắc (chặn tải nếu vai trò có quyền `moderation:view` đông bất thường). */
const PLATFORM_RECIPIENTS_MAX = 200;
const HOUR_MS = 3_600_000;

export type SendNotification = (input: NotifyInput) => Promise<void>;

export interface StaleReminderResult {
  /** Số nhóm báo cáo OPEN quá hạn tìm thấy. */
  staleGroups: number;
  /** Số nhóm đã nhắc người xử lý phạm vi (bỏ qua nhóm đã nhắc trong ngày, nhóm chỉ nền tảng, nhóm không có người xử lý). */
  scopeNotified: number;
  /** Đã gửi thông báo tổng hợp cho quản trị nền tảng hay chưa. */
  platformNotified: boolean;
}

/**
 * Nhắc báo cáo tồn đọng (be.md p1-08 §7 cron `reports.stale-reminder`, 09:00 hằng ngày): nhóm báo cáo còn OPEN > `LIMITS.report.staleReminderHours`.
 *  - Nhóm xử lý theo PHẠM VI (`handlerLevel = SCOPE`): mỗi nhóm MỘT thông báo/ngày cho người xử lý phạm vi (OWNER/ADMIN nhóm chat/workspace,
 *    MANAGER kênh riêng tư — cùng `listScopeHandlerIds` với thông báo "báo cáo mới").
 *  - Quản trị nền tảng (role có `moderation:view`): MỘT thông báo tổng hợp/ngày (số nhóm tồn đọng, cả nhóm SCOPE lẫn PLATFORM_ONLY) — không
 *    gửi từng nhóm để khỏi ngập hộp thư khi hàng đợi dài.
 * `refs` chỉ chứa id + số đếm — KHÔNG nội dung tin, KHÔNG danh tính người báo cáo. Idempotent: `Notification.dedupeKey` theo (nhóm|platform, ngày) được
 * kiểm trước khi gửi (`notify()` không idempotent với outbox `deliver`), nên cron chạy lại/retry trong ngày không nhắc thêm.
 */
export class StaleReportReminderService {
  constructor(
    private readonly repo: IReportRepository,
    private readonly directory: IModerationDirectory,
    private readonly send: SendNotification,
    private readonly now: () => Date = () => new Date()
  ) {}

  async run(): Promise<StaleReminderResult> {
    const now = this.now();
    const cutoff = new Date(now.getTime() - LIMITS.report.staleReminderHours * HOUR_MS);
    // `scan` chặn ở `groupScanMax` báo cáo (mới nhất trước): quá tải thì bỏ bớt báo cáo cũ nhất của đợt này, đợt sau (hôm sau) quét lại.
    const stale = groupReports(await this.repo.scan({ status: "OPEN", to: cutoff }, LIMITS.report.groupScanMax));
    if (stale.length === 0) return { staleGroups: 0, scopeNotified: 0, platformNotified: false };

    const day = dayKey(now);
    let scopeNotified = 0;
    for (const group of stale) {
      if (group.handlerLevel === "SCOPE" && (await this.remindScope(group, day))) scopeNotified += 1;
    }
    const platformNotified = await this.remindPlatform(stale.length, day);
    return { staleGroups: stale.length, scopeNotified, platformNotified };
  }

  private async remindScope(group: ReportGroup, day: string): Promise<boolean> {
    const recipients = await listScopeHandlerIds(this.directory, group);
    if (recipients.length === 0) return false;
    const dedupeKey = `moderation.stale-reminder:${group.groupKey}:${day}`;
    if (await this.directory.notificationExists(dedupeKey)) return false;
    await this.send({
      type: MODERATION_NOTIFICATION_TYPES.STALE_REMINDER,
      scope: group.workspaceId ? { type: "WORKSPACE", id: group.workspaceId } : null,
      workspaceId: group.workspaceId ?? undefined,
      source: { type: "ReportGroup", id: `${group.groupKey}:${day}` },
      refs: {
        groupKey: group.groupKey,
        targetType: group.targetType,
        scopeType: group.scopeType,
        scopeId: group.scopeId,
        workspaceId: group.workspaceId,
        reportCount: group.reportCount,
        oldestAt: group.firstAt.toISOString(),
      },
      recipients: recipients.map((userId) => ({ userId })),
      dedupeKey,
    });
    return true;
  }

  private async remindPlatform(staleGroups: number, day: string): Promise<boolean> {
    const dedupeKey = `moderation.stale-reminder:platform:${day}`;
    if (await this.directory.notificationExists(dedupeKey)) return false;
    const recipients = await this.directory.listPlatformModeratorIds(PLATFORM_RECIPIENTS_MAX);
    if (recipients.length === 0) return false;
    await this.send({
      type: MODERATION_NOTIFICATION_TYPES.STALE_REMINDER,
      scope: null,
      source: { type: "ReportQueue", id: `platform:${day}` },
      refs: { staleGroups, staleHours: LIMITS.report.staleReminderHours },
      recipients: recipients.map((userId) => ({ userId })),
      dedupeKey,
    });
    return true;
  }
}
