import { LIMITS } from "../../core/constants/limits";
import { readNotificationStats, type NotificationStats, type StatRange } from "../notifications/public";

/**
 * Giới hạn pipeline thông báo (CHỈ ĐỌC, từ `LIMITS.notification` — chưa có khoá `SystemConfig` nên admin không
 * ghi đè được). admin.md p1-07 §2.1 "Giới hạn (chỉ đọc)".
 */
export interface NotificationLimitsView {
  pushBatchWindowSeconds: number;
  inboxRetentionDays: number;
  fanoutChunkSize: number;
  maxDevicesPerUser: number;
  statsRetentionDays: number;
}

export type AdminNotificationStats = NotificationStats & { limits: NotificationLimitsView };

function notificationLimits(): NotificationLimitsView {
  const n = LIMITS.notification;
  return {
    pushBatchWindowSeconds: n.pushBatchWindowSeconds,
    inboxRetentionDays: n.inboxRetentionDays,
    fanoutChunkSize: n.fanoutChunkSize,
    maxDevicesPerUser: n.maxDevicesPerUser,
    statsRetentionDays: n.statsRetentionDays,
  };
}

/**
 * Số liệu THÔNG BÁO tổng hợp cho admin (p1-07 be.md §4, admin.md §2) — CHỈ chỉ số gộp (không định danh người dùng,
 * không tra cứu hộp thư/cài đặt của 1 người). Nguồn: bộ đếm Redis theo giờ/ngày do pipeline fan-out/push ghi
 * (`notifications/services/notification-stats.ts`); Redis không khả dụng → các số về 0, không lỗi.
 * Kèm `limits` (thêm mới, chỉ đọc) để admin hiện khối "Giới hạn".
 */
export class AdminNotificationsService {
  constructor(private readonly read: (range: StatRange) => Promise<NotificationStats> = readNotificationStats) {}

  async getStats(range: StatRange): Promise<AdminNotificationStats> {
    const stats = await this.read(range);
    return { ...stats, limits: notificationLimits() };
  }
}
