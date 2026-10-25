import type { WellbeingLevel } from "../domain/burnout-rules";
import type { RuleFactor } from "../domain/rule-evaluator";

/** Thời gian làm/nghỉ mong muốn của người dùng (P1 dùng cho nút nghỉ; lưu sẵn ở cài đặt). */
export interface PreferredBreak {
  workMinutes: number;
  breakMinutes: number;
}

export const ACK_ACTIONS = ["DISMISS", "SNOOZE"] as const;
export type AckAction = (typeof ACK_ACTIONS)[number];

/**
 * Cài đặt theo dõi của MỘT người. KHÔNG có dòng nào = chưa từng bật = TẮT (mặc định, không tạo dòng khi chỉ xem). Đang bật ⇔ `optedInAt ≠ null` và `optedOutAt = null`.
 */
export interface WellbeingSettingEntity {
  id: string;
  userId: string;
  optedInAt: Date | null;
  optedOutAt: Date | null;
  alertsEnabled: boolean;
  preferredBreak: PreferredBreak | null;
  lastAlertAt: Date | null;
  /** "Nhắc lại sau": không cảnh báo tới mốc này. */
  snoozedUntil: Date | null;
  updatedAt: Date;
}

export const isTrackingEnabled = (s: Pick<WellbeingSettingEntity, "optedInAt" | "optedOutAt"> | null): boolean => s !== null && s.optedInAt !== null && s.optedOutAt === null;

export interface SettingPatch {
  alertsEnabled?: boolean;
  /** `null` = xoá giờ nghỉ mong muốn. */
  preferredBreak?: PreferredBreak | null;
}

/** Chỉ số MỘT ngày wellbeing của một người đã bật theo dõi (không nội dung). */
export interface WellbeingDailyEntity {
  id: string;
  userId: string;
  /** Ngày wellbeing `YYYY-MM-DD` (theo múi giờ của người dùng lúc tổng hợp; ngày mới bắt đầu 05:00). */
  date: string;
  timezone: string;
  activeMinutes: number;
  longestContinuousMinutes: number;
  lateNightMinutes: number;
  eventsCount: number;
  lateNightEvents: number;
  createdAt: Date;
}

export type WellbeingDailyInput = Omit<WellbeingDailyEntity, "id" | "createdAt">;

export interface BurnoutAssessmentEntity {
  id: string;
  userId: string;
  date: string;
  riskScore: number;
  level: WellbeingLevel;
  factors: RuleFactor[];
  ruleVersion: number;
  alerted: boolean;
  alertedAt: Date | null;
  ackAction: AckAction | null;
  ackAt: Date | null;
  createdAt: Date;
}

export interface AssessmentScoreInput {
  userId: string;
  date: string;
  riskScore: number;
  level: WellbeingLevel;
  factors: RuleFactor[];
  ruleVersion: number;
}

/** Người dùng tối thiểu cho job: múi giờ (đã kiểm hợp lệ) — KHÔNG email/tên/điện thoại. */
export interface BurnoutUser {
  timezone: string;
}

/** Chia sẻ mức rủi ro với trưởng nhóm (P1) — CHỈ `userId` + `workspaceId` + thời điểm bật; KHÔNG có `level`/`riskScore` (đọc động từ `BurnoutAssessment` lúc trưởng nhóm gọi indicators). */
export interface WellbeingShareEntity {
  id: string;
  userId: string;
  workspaceId: string;
  createdAt: Date;
}
