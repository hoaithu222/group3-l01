import type { MockAttemptDto, MockTagScore } from '../api/mock-attempts.types';
import { tagPercent } from './mock-result-utils';

/**
 * Điểm hiển thị. BE làm tròn `scorePct` tới MỘT chữ số thập phân (`round1`), nên 66,7 là điểm thật — làm tròn thành 67
 * sẽ có lúc hiện "50%" cạnh dòng "Chưa đạt (ngưỡng 50%)" (49,6). Số nguyên → "67"; số lẻ → dấu PHẨY kiểu Việt "66,7"
 * (`screen-layout.md`: dấu phân cách thập phân là phẩy, không phải chấm).
 */
export function formatScore(pct: number): string {
  const rounded = Math.round(pct * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : String(rounded).replace('.', ',');
}

/** Mức nhận xét theo điểm — chỉ để chọn câu chữ, KHÔNG quyết định Đạt/Chưa đạt (server đã quyết: `attempt.passed`). */
export type ScoreTier = 'excellent' | 'good' | 'low' | 'near' | 'pass' | 'perfect';

export interface ScoreVerdict {
  /** Một câu khen/động viên ngắn, đứng dưới vòng điểm. */
  headline: string;
  /** Một câu gợi ý bước tiếp theo. */
  message: string;
  tier: ScoreTier;
}

/** Sát ngưỡng = kém ngưỡng đạt không quá số điểm này — đáng nói "chỉ còn một chút nữa" thay vì "cần ôn thêm". */
export const NEAR_PASS_GAP = 10;

/**
 * Nhận xét ngắn theo điểm. Đạt/Chưa đạt lấy từ server (`passed`) chứ không tự so `scorePct >= passPct`: server đã chốt
 * bằng số chưa làm tròn, và hai bên lệch nhau là người học thấy "Đạt" mà điểm nhỏ hơn ngưỡng.
 */
export function scoreVerdict(scorePct: number, passPct: number, passed: boolean): ScoreVerdict {
  if (passed) {
    if (scorePct >= 100) {
      return {
        headline: 'Điểm tuyệt đối!',
        message: 'Bạn nắm chắc toàn bộ đề này.',
        tier: 'perfect',
      };
    }
    if (scorePct >= 90) {
      return {
        headline: 'Xuất sắc!',
        message: 'Chỉ còn vài chỗ nhỏ nữa là hoàn hảo.',
        tier: 'excellent',
      };
    }
    if (scorePct >= 75) {
      return {
        headline: 'Làm tốt lắm!',
        message: 'Kiến thức khá vững — xem lại các câu sai cho chắc.',
        tier: 'good',
      };
    }
    return {
      headline: 'Bạn đã vượt ngưỡng',
      message: 'Ôn thêm các chủ đề yếu để lên điểm ở lượt sau.',
      tier: 'pass',
    };
  }
  if (scorePct >= passPct - NEAR_PASS_GAP) {
    return {
      headline: 'Chỉ còn một chút nữa',
      message: 'Sát ngưỡng đạt rồi — xem lại các câu sai và thử lại.',
      tier: 'near',
    };
  }
  return {
    headline: 'Cần ôn thêm',
    message: 'Không sao — xem đáp án, ôn các câu sai rồi thi lại.',
    tier: 'low',
  };
}

export interface ScoreBreakdown {
  correct: number;
  unanswered: number;
  wrong: number;
}

/**
 * Đúng / Sai / Bỏ trống từ số liệu server (`total`, `answeredCount`, `correctCount`). Kẹp lại để ba số luôn cộng đúng
 * `total` kể cả khi dữ liệu lệch nhau (`answeredCount` < `correctCount` do đáp án nộp trễ bị bỏ qua).
 */
export function scoreBreakdown(
  attempt: Pick<MockAttemptDto, 'answeredCount' | 'correctCount' | 'total'>,
): ScoreBreakdown {
  const total = Math.max(0, attempt.total);
  const correct = Math.min(Math.max(0, attempt.correctCount ?? 0), total);
  const answered = Math.min(Math.max(attempt.answeredCount, correct), total);
  return { correct, unanswered: total - answered, wrong: answered - correct };
}

/** Dưới mức này (%) một chủ đề được coi là YẾU và được nêu tên ở khối "Nên ôn lại". */
export const WEAK_TAG_PCT = 60;
/** Từ mức này (%) trở lên là vững. */
export const STRONG_TAG_PCT = 80;

export type TagStrength = 'medium' | 'strong' | 'weak';

export function tagStrength(pct: number): TagStrength {
  if (pct >= STRONG_TAG_PCT) return 'strong';
  return pct >= WEAK_TAG_PCT ? 'medium' : 'weak';
}

/** Tối đa `limit` chủ đề yếu nhất (điểm thấp trước; bằng điểm thì chủ đề nhiều câu hơn trước). Không mảng nào bị sửa. */
export function weakTags(scores: readonly MockTagScore[], limit = 3): MockTagScore[] {
  return scores
    .filter((s) => s.total > 0 && tagPercent(s) < WEAK_TAG_PCT)
    .sort((a, b) => tagPercent(a) - tagPercent(b) || b.total - a.total)
    .slice(0, limit);
}

/** Đường cong "số chạy lên": nhanh lúc đầu, chậm dần về đúng số — khoảnh khắc cuối là cái mắt dừng lại đọc. */
export function countUpValue(t: number, target: number): number {
  if (t >= 1) return target;
  if (t <= 0) return 0;
  return Math.round(target * (1 - (1 - t) ** 3));
}
