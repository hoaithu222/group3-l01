import type {
  RoadmapLessonSummaryDto,
  RoadmapProgressStatus,
  RoadmapSubjectDetailDto,
} from '../api/roadmap.types';
import type {
  LessonInsight,
  LessonTimelineState,
  PhaseState,
  PhaseStats,
  SubjectInsights,
} from '../types/roadmap-insights.types';
import { dateKeyToDay } from './roadmap-dates';

/**
 * "Đang ở đâu trên lộ trình" — hàm THUẦN suy từ `SubjectDetailDto` (cây buổi + `progress` + `schedule`), không gọi API
 * nào thêm: buổi nên học tiếp, tháng hiện tại, buổi trễ lịch, buổi bị khoá (SEQUENTIAL), ngày dự kiến xong. Kiểu kết quả
 * ở `types/roadmap-insights.types.ts`.
 *
 * ⚠️ `%`/`requiredDone` vẫn lấy từ BỘ ĐẾM của BE (`myEnrollment.requiredDone`, cùng nguồn với thẻ ở tab "Lộ trình") —
 * đếm lại từ `progress` có thể lệch vài buổi so với con số BE đã chốt (bỏ buổi chưa xuất bản, buổi tuỳ chọn).
 */

const isPassed = (status: RoadmapProgressStatus | undefined) =>
  status === 'COMPLETED' || status === 'SKIPPED';

/**
 * Buổi nên mở khi bấm "Học tiếp": buổi đang học dở gần nhất (`lastLessonId`) → buổi BẮT BUỘC đầu tiên chưa qua → buổi
 * tuỳ chọn còn lại. ⚠️ Không lấy `lessons.find(!COMPLETED)` trần như trước: buổi tuỳ chọn/đã bỏ qua ở giữa lộ trình
 * sẽ chặn đường, và người đang học dở buổi 5 lại bị đưa về buổi 3 tuỳ chọn.
 */
function pickNext(
  lessons: readonly RoadmapLessonSummaryDto[],
  progress: Readonly<Record<string, RoadmapProgressStatus>>,
  lastLessonId: string | null | undefined,
): RoadmapLessonSummaryDto | null {
  const last = lastLessonId ? lessons.find((lesson) => lesson.id === lastLessonId) : undefined;
  if (last && progress[last.id] === 'IN_PROGRESS') return last;
  return (
    lessons.find((lesson) => !lesson.optional && !isPassed(progress[lesson.id])) ??
    lessons.find((lesson) => !isPassed(progress[lesson.id])) ??
    null
  );
}

export function computeSubjectInsights(
  subject: RoadmapSubjectDetailDto,
  today: number | null,
): SubjectInsights {
  const enrollment = subject.myEnrollment;
  const lessons = [...subject.lessons].sort((a, b) => a.number - b.number);
  const next = pickNext(lessons, subject.progress, enrollment?.lastLessonId);
  const sequential = subject.unlockMode === 'SEQUENTIAL';

  const lessonInsights: Record<string, LessonInsight> = {};
  let priorRequiredDone = true;
  let behind = 0;
  let finishDay: number | null = null;
  for (const lesson of lessons) {
    const status = subject.progress[lesson.id];
    const day = dateKeyToDay(subject.schedule[lesson.id]);
    const overdue =
      Boolean(enrollment) && !lesson.optional && !isPassed(status) && day !== null && today !== null && day < today;
    // BE khoá (RMAP_006) khi còn buổi BẮT BUỘC số nhỏ hơn chưa COMPLETED — "đã bỏ qua" KHÔNG tính là xong.
    const locked = sequential && !priorRequiredDone && status !== 'COMPLETED';
    let state: LessonTimelineState = 'upcoming';
    if (status === 'COMPLETED') state = 'done';
    else if (status === 'SKIPPED') state = 'skipped';
    else if (locked) state = 'locked';
    else if (status === 'IN_PROGRESS') state = 'in-progress';
    else if (lesson.id === next?.id) state = 'next';
    lessonInsights[lesson.id] = { day, overdue, state };
    if (overdue) behind += 1;
    if (!lesson.optional && day !== null) finishDay = Math.max(finishDay ?? day, day);
    if (!lesson.optional && status !== 'COMPLETED') priorRequiredDone = false;
  }

  const phasesSorted = [...subject.phases].sort((a, b) => a.index - b.index);
  const requiredTotal = subject.requiredLessonCount;
  const requiredDone = enrollment?.requiredDone ?? 0;
  const finished =
    enrollment?.status === 'COMPLETED' || (Boolean(enrollment) && requiredTotal > 0 && requiredDone >= requiredTotal);
  const currentPhaseId =
    next?.phaseId ?? (finished ? phasesSorted[phasesSorted.length - 1]?.id : phasesSorted[0]?.id);

  const phases: Record<string, PhaseStats> = {};
  for (const phase of phasesSorted) {
    const inPhase = lessons.filter((lesson) => lesson.phaseId === phase.id);
    const required = inPhase.filter((lesson) => !lesson.optional);
    const done = inPhase.filter((lesson) => subject.progress[lesson.id] === 'COMPLETED').length;
    const requiredLeft = required.filter((lesson) => subject.progress[lesson.id] !== 'COMPLETED').length;
    const complete = required.length > 0 ? requiredLeft === 0 : done === inPhase.length;
    let state: PhaseState = 'upcoming';
    if (inPhase.length === 0) state = 'empty';
    else if (complete) state = 'done';
    else if (phase.id === currentPhaseId) state = 'current';
    phases[phase.id] = { done, state, total: inPhase.length };
  }

  return {
    behind,
    currentPhaseId,
    enrolled: Boolean(enrollment),
    finishDay,
    finished,
    lessons: lessonInsights,
    nextLesson: next,
    percent: enrollment && requiredTotal > 0 ? Math.min(100, Math.round((requiredDone / requiredTotal) * 100)) : 0,
    phases,
    requiredDone,
    requiredTotal,
    resume: next ? subject.progress[next.id] === 'IN_PROGRESS' : false,
    today,
  };
}
