import type { RoadmapLessonSummaryDto } from '../api/roadmap.types';

/**
 * Kiểu của "đang ở đâu trên lộ trình" — kết quả `computeSubjectInsights` (`utils/roadmap-progress.ts`), dùng chung cho
 * màn tổng quan môn: thẻ tiến độ, dải tháng, đường thời gian các buổi. Tách khỏi file util để hàm tính giữ dưới trần
 * 150 dòng của `check:file-size` (hậu tố `.types.ts` là khai báo, được miễn).
 */

export type LessonTimelineState = 'done' | 'skipped' | 'in-progress' | 'next' | 'locked' | 'upcoming';
export type PhaseState = 'done' | 'current' | 'upcoming' | 'empty';

export interface LessonInsight {
  state: LessonTimelineState;
  /** Ngày dự kiến (day number) — `null` khi chưa đăng ký. */
  day: number | null;
  /** Buổi BẮT BUỘC chưa xong có ngày dự kiến < hôm nay. */
  overdue: boolean;
}

export interface PhaseStats {
  done: number;
  total: number;
  state: PhaseState;
}

export interface SubjectInsights {
  enrolled: boolean;
  finished: boolean;
  percent: number;
  requiredDone: number;
  requiredTotal: number;
  behind: number;
  /** Ngày dự kiến của buổi bắt buộc CUỐI — "Dự kiến xong". */
  finishDay: number | null;
  nextLesson: RoadmapLessonSummaryDto | null;
  /** Buổi tiếp theo đang học dở (`IN_PROGRESS`) ⇒ nút ghi "Tiếp tục", không phải "Học tiếp". */
  resume: boolean;
  currentPhaseId: string | undefined;
  lessons: Record<string, LessonInsight>;
  phases: Record<string, PhaseStats>;
  /** "Hôm nay" (day number) đã dùng để tính — nơi vẽ nhãn "Hôm nay/Ngày mai" dùng lại, khỏi tính lần hai. */
  today: number | null;
}
