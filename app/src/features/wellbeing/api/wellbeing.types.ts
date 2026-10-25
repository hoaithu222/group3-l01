/**
 * Kiểu dữ liệu theo dõi sức khoẻ học tập (p7-03) — CHỈ những trường app THỰC SỰ dùng.
 *
 * ⚠️ BE còn trả `riskScore` (0–100), `points` của từng nhân tố, `ruleVersion`, `alertedAt`… nhưng app CỐ Ý không khai và không giữ chúng
 * (`wellbeing.schemas.ts` cắt bỏ lúc đọc phản hồi): kế hoạch không cho phép hiện điểm số — con số "72/100" gây lo âu hơn là giúp ích, và
 * dữ liệu không nằm trong cache thì không thể vô tình lọt lên giao diện, log hay công cụ gỡ lỗi.
 */
export const WELLBEING_LEVELS = ['LOW', 'MEDIUM', 'HIGH'] as const;
export type WellbeingLevel = (typeof WELLBEING_LEVELS)[number];

export const WELLBEING_SUGGESTIONS = ['BREAK', 'SPREAD_TASKS', 'SLEEP'] as const;
export type WellbeingSuggestion = (typeof WELLBEING_SUGGESTIONS)[number];

export const ACK_ACTIONS = ['DISMISS', 'SNOOZE'] as const;
export type AckAction = (typeof ACK_ACTIONS)[number];

export const RULE_METRICS = [
  'longestContinuousMinutes',
  'lateNightEvents',
  'lateNightMinutes',
  'activeMinutes',
  'eventsCount',
] as const;
export type RuleMetric = (typeof RULE_METRICS)[number];

export const RULE_AGGREGATES = ['MAX', 'SUM', 'AVG', 'CONSECUTIVE_DAYS_OVER'] as const;
export type RuleAggregate = (typeof RULE_AGGREGATES)[number];

/** Số ngày màn hình xem lại — BE chỉ nhận 7 hoặc 30 (`assessmentsQuerySchema`). */
export type WellbeingDays = 7 | 30;

/**
 * Một nhân tố ĐÃ KÍCH HOẠT khiến mức đánh giá tăng. `value` = kết quả tổng hợp: phút hoặc số lần; với `CONSECUTIVE_DAYS_OVER` là SỐ NGÀY liên
 * tiếp. `label` do admin đặt (có thể được sửa) — app chỉ dùng làm câu dự phòng, câu chính do `factor-text.ts` dựng theo `metric` + `aggregate`.
 */
export interface WellbeingFactor {
  aggregate: RuleAggregate;
  days: number;
  label: string;
  metric: RuleMetric;
  ruleId: string;
  value: number;
}

export interface WellbeingAssessment {
  /** Đã có cảnh báo gửi cho đánh giá này (kể cả đã bấm "Đã hiểu"). */
  alerted: boolean;
  ackAction: AckAction | null;
  /** Ngày wellbeing `YYYY-MM-DD` (ngày mới bắt đầu lúc 05:00 giờ địa phương). */
  date: string;
  factors: WellbeingFactor[];
  id: string;
  level: WellbeingLevel;
  suggestion: WellbeingSuggestion | null;
}

/** Chỉ số MỘT ngày — không nội dung, chỉ thời điểm và số lần hoạt động. */
export interface WellbeingDaily {
  activeMinutes: number;
  date: string;
  eventsCount: number;
  lateNightEvents: number;
  lateNightMinutes: number;
  longestContinuousMinutes: number;
}

/** Cảnh báo đã gửi mà chưa được bấm "Đã hiểu"/"Nhắc lại sau" — mở app là hiện lại (WELL-05). */
export interface PendingAlert {
  id: string;
  level: WellbeingLevel;
  suggestion: WellbeingSuggestion | null;
}

export interface PreferredBreak {
  breakMinutes: number;
  workMinutes: number;
}

/** `GET`/`PUT /me/wellbeing`. `enabled: false` ⇒ chưa bật (mặc định) — mọi trường còn lại là mặc định, không có dữ liệu nào. */
export interface WellbeingSetting {
  alertsEnabled: boolean;
  enabled: boolean;
  latest: WellbeingAssessment | null;
  optedInAt: string | null;
  pendingAlert: PendingAlert | null;
  /** Lưu sẵn ở BE cho nút nghỉ (P1) — P0 app chưa có màn chỉnh. */
  preferredBreak: PreferredBreak | null;
}

export interface WellbeingHistory {
  assessments: WellbeingAssessment[];
  dailies: WellbeingDaily[];
  days: number;
}

/**
 * `PUT /me/wellbeing` — đường DUY NHẤT để BẬT/TẮT theo dõi; `optIn` LUÔN bắt buộc (BE `.strict()`): `true` bật, `false` tắt VÀ xoá dữ liệu. ⛔ Không dùng để sửa cài đặt:
 * `optIn: true` trên tài khoản đã tắt là BẬT LẠI thu thập — sửa cài đặt đi qua `PatchWellbeingInput`.
 */
export interface UpdateWellbeingInput {
  optIn: boolean;
}

/**
 * `PATCH /me/wellbeing` — CHỈ sửa cài đặt của người ĐANG bật, không có `optIn` nên không bao giờ bật lại: chưa/đã tắt ⇒ `409 WELL_001` và BE không ghi gì. `.strict()`, ít nhất MỘT trường
 * (kiểu hợp ép `tsc` chặn gửi thân rỗng; `preferredBreak` app P0 chưa có màn nhưng hợp đồng đã có). `preferredBreak: null` = xoá giờ nghỉ mong muốn.
 */
export type PatchWellbeingInput =
  | { alertsEnabled: boolean; preferredBreak?: PreferredBreak | null }
  | { alertsEnabled?: boolean; preferredBreak: PreferredBreak | null };

/** Payload socket `wellbeing:alert` (`user:{id}`): không điểm, không phút, không nhân tố — chỉ đủ để mở đúng cảnh báo. */
export interface WellbeingAlertPayload {
  assessmentId: string;
  level: Exclude<WellbeingLevel, 'LOW'>;
  suggestion: WellbeingSuggestion | null;
}

/**
 * P1 — chia sẻ mức rủi ro với trưởng nhóm (`WellbeingShare`, be.md §2/§4/§5). CHỈ id + tên nhóm — KHÔNG điểm/phút/mức (mức chỉ trưởng nhóm
 * thấy, qua `GET /workspaces/:id/wellbeing/indicators`, không phải qua đây).
 */
export interface WellbeingShare {
  workspaceId: string;
  name: string;
}

/**
 * P1 — nhóm tôi ĐANG là thành viên (cho danh sách bật/tắt chia sẻ ở màn Cài đặt). Khai ĐỘC LẬP với feature `workspaces` (module không
 * import chéo module khác — `feature-structure.md`, cùng cách `workspaceMembersPath` của `features/workspaces/api/workspaces.api.ts` khai
 * lại đường dẫn của `features/members`) — CHỈ hai trường app dùng, gọi thẳng `GET /workspaces?status=ACTIVE`.
 */
export interface MyWorkspace {
  id: string;
  name: string;
}

/**
 * `POST /me/wellbeing/break` (P1) — TakeABreakWidget báo đã nghỉ xong. Chỉ đếm qua giới hạn tần suất ở BE (30 lần/ngày), KHÔNG ảnh hưởng
 * điểm rủi ro; BE không lưu bản ghi riêng nên app cũng không có state phái sinh nào từ lời gọi này.
 */
export interface TakeBreakInput {
  durationSeconds: number;
}
