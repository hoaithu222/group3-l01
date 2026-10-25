/**
 * Kiểu dữ liệu theo dõi sức khoẻ học tập (admin p7-03) — viết tay theo BE thật `be/src/modules/burnout`: `services/burnout-admin.service.ts` (`OverviewDto`, `RulesDto`, `UpdateRulesInput`),
 * `domain/anonymity.ts` (`LevelBucket`), `core/constants/burnout.ts` (`burnoutRuleSchema`). Đổi hợp đồng ở BE thì đối chiếu lại file này.
 *
 * QUYỀN RIÊNG TƯ: admin chỉ nhận SỐ ĐẾM ẨN DANH tổng hợp và cấu hình luật. Không kiểu nào ở đây (và không route nào của phân hệ) mang định danh người dùng; `RulesDto.updatedBy` của BE
 * cố ý không khai vì màn hình không dùng (người sửa xem ở nhật ký quản trị).
 */
import type {
  BurnoutRuleAggregate,
  BurnoutRuleMetric,
  BurnoutRuleOp,
} from '../constants/wellbeing.constants';

export type WellbeingLevel = 'LOW' | 'MEDIUM' | 'HIGH';
/** `OTHER` = các nhóm quá nhỏ bị gộp lại để không nhận ra cá nhân. */
export type LevelGroup = WellbeingLevel | 'OTHER';

export interface LevelBucket {
  level: LevelGroup;
  count: number;
}

export interface AlertsWeek {
  /** Thứ Hai 00:00 UTC của tuần, `YYYY-MM-DD`. */
  weekStart: string;
  /** Số cảnh báo trong tuần; `null` = ô có ít cảnh báo (1–4) bị che để khử nhận dạng; `0` là số thật. */
  alerts: number | null;
}

/** `GET /admin/wellbeing/overview?weeks` — chưa đủ mẫu thì CHỈ có `insufficient` + `minimum`, không con số nào khác. */
export type WellbeingOverview =
  | { insufficient: true; minimum: number }
  | {
      insufficient: false;
      /** Số người đang bật theo dõi, ĐÃ làm tròn tới bội của 10 — hiện kèm "≈". */
      optInApprox: number;
      /** Cũ → mới; phần tử cuối là tuần hiện tại. */
      alertsPerWeek: AlertsWeek[];
      /** `null` khi số người đã được chấm điểm còn quá ít để công bố phân bố. */
      levelDistribution: LevelBucket[] | null;
    };

export interface BurnoutRule {
  id: string;
  label: string;
  metric: BurnoutRuleMetric;
  aggregate: BurnoutRuleAggregate;
  days: number;
  op: BurnoutRuleOp;
  threshold: number;
  points: number;
}

/** `GET|PUT /admin/wellbeing/rules` — `version` do MÁY CHỦ tăng mỗi lần lưu, dùng làm `expectedVersion` (CAS). */
export interface BurnoutRules {
  version: number;
  windowDays: number;
  levels: { medium: number; high: number };
  rules: BurnoutRule[];
  /** `null` khi chưa từng lưu (đang dùng bộ luật mặc định). */
  updatedAt: string | null;
  /** `true` khi chưa từng lưu (hoặc bản lưu hỏng) — đang dùng bộ luật mặc định theo đặc tả. */
  isDefault: boolean;
  /** Bộ luật mặc định theo đặc tả (BE trả kèm để nút "Về mặc định" điền form — KHÔNG chép hằng số sang admin, tránh lệch âm thầm nếu mặc định đổi). */
  defaults: { windowDays: number; levels: { medium: number; high: number }; rules: BurnoutRule[] };
}

/** Thân `PUT /admin/wellbeing/rules`: bộ luật BỎ `version` + `expectedVersion` + `reason` (10–500). */
export interface PutBurnoutRulesPayload {
  windowDays: number;
  levels: { medium: number; high: number };
  rules: BurnoutRule[];
  expectedVersion: number;
  reason: string;
}
