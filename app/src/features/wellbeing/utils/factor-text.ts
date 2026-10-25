import type { RuleAggregate, RuleMetric, WellbeingFactor } from '../api/wellbeing.types';
import { formatMinutes } from './wellbeing-format';

/**
 * Câu DỊU cho từng nhân tố (app.md p7-03 §7: "khuyến khích, không phán xét"). Dựng theo `metric` × `aggregate` chứ không lấy `label` của luật: nhãn do admin
 * đặt và sửa được ("Làm việc liên tục quá lâu" — có giọng trách), còn câu ở đây chỉ NÊU SỰ VIỆC kèm con số của chính người dùng. `label` chỉ là câu dự phòng khi
 * gặp tổ hợp chưa biết (BE thêm loại luật mới mà app chưa cập nhật). Không bao giờ hiện `points`/điểm.
 */
type Builder = (value: number, days: number) => string;

const count = (value: number): string => String(Math.max(0, Math.round(value)));
const span = (days: number): string => `${String(days)} ngày gần đây`;

/** `CONSECUTIVE_DAYS_OVER`: `value` là SỐ NGÀY liên tiếp (không phải phút/số lần). */
const streak =
  (what: string): Builder =>
  (value) =>
    `${what} ${count(value)} ngày liên tiếp`;

const SENTENCES: Record<RuleMetric, Partial<Record<RuleAggregate, Builder>>> = {
  longestContinuousMinutes: {
    AVG: (value) => `Mỗi ngày bạn thường có một buổi làm việc liền khoảng ${formatMinutes(value)}`,
    MAX: (value, days) =>
      `Có buổi bạn làm việc liên tục khoảng ${formatMinutes(value)} trong ${span(days)}`,
  },
  lateNightEvents: {
    AVG: (value) => `Trung bình mỗi ngày bạn hoạt động vào khuya ${count(value)} lần`,
    CONSECUTIVE_DAYS_OVER: streak('Bạn hoạt động vào khuya'),
    MAX: (value) => `Có ngày bạn hoạt động vào khuya tới ${count(value)} lần`,
    SUM: (value, days) => `Bạn hoạt động vào khuya ${count(value)} lần trong ${span(days)}`,
  },
  lateNightMinutes: {
    AVG: (value) => `Trung bình mỗi ngày bạn hoạt động vào khuya khoảng ${formatMinutes(value)}`,
    CONSECUTIVE_DAYS_OVER: streak('Bạn hoạt động vào khuya'),
    MAX: (value) => `Có ngày bạn hoạt động vào khuya tới ${formatMinutes(value)}`,
    SUM: (value, days) =>
      `Bạn hoạt động vào khuya tổng cộng khoảng ${formatMinutes(value)} trong ${span(days)}`,
  },
  activeMinutes: {
    AVG: (value) => `Trung bình mỗi ngày bạn hoạt động khoảng ${formatMinutes(value)}`,
    CONSECUTIVE_DAYS_OVER: streak('Bạn hoạt động khá nhiều'),
    MAX: (value) => `Có ngày bạn hoạt động tới ${formatMinutes(value)}`,
    SUM: (value, days) =>
      `Bạn hoạt động tổng cộng khoảng ${formatMinutes(value)} trong ${span(days)}`,
  },
  eventsCount: {
    AVG: (value) => `Trung bình mỗi ngày bạn có khoảng ${count(value)} thao tác`,
    CONSECUTIVE_DAYS_OVER: streak('Bạn thao tác khá nhiều'),
    MAX: (value) => `Có ngày bạn có tới ${count(value)} thao tác`,
    SUM: (value, days) => `Bạn có khoảng ${count(value)} thao tác trong ${span(days)}`,
  },
};

/** Câu cho một nhân tố; tổ hợp chưa biết ⇒ nhãn của luật (dự phòng), rỗng nốt thì một câu chung — không bao giờ để trống. */
export function factorSentence(factor: WellbeingFactor): string {
  const build = SENTENCES[factor.metric][factor.aggregate];
  if (build) return build(factor.value, factor.days);
  return factor.label.trim() || 'Nhịp làm việc gần đây của bạn khá dày';
}
