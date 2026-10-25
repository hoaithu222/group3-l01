import { useRef, useState } from 'react';

import { useConnectionState } from '@/core/socket';
import { showToast } from '@/shared/utils/toast.utils';

import type { ReviewDecision, SubmitReviewPayload } from '../api/reviews.types';
import { useSubmitReview, useTaskReviews } from '../queries/reviews.queries';
import { getErrorCode, getErrorDetails, getHttpStatus } from '../utils/error-details';
import { newIdempotencyKey } from '../utils/idempotency-key';
import { previewScore, scorePayload, scoreProblems, type ScoreProblem } from '../utils/review-score';
import { reviewErrorMessage } from '../utils/review-text';
import { useReviewDraft } from './useReviewDraft';

/** Câu báo lỗi cấp màn (không thuộc ô nào). `code` để màn chọn dáng hiển thị. */
export interface ReviewFormError {
  code?: string;
  message: string;
}

export type ReviewSubmitState = 'closed' | 'error' | 'loading' | 'notFound' | 'noReview' | 'ready' | 'submitted';

const PROBLEMS: readonly string[] = ['INVALID_STEP', 'MISSING', 'OUT_OF_RANGE'];

/** `REVIEW_002 { criteria: { <id>: PROBLEM }, score10: PROBLEM }` → lỗi tại từng ô (`score10` = ô điểm tự do). */
function problemsFromError(error: unknown): Record<string, ScoreProblem> {
  const details = getErrorDetails(error);
  const out: Record<string, ScoreProblem> = {};
  const criteria = (details?.criteria ?? {}) as Record<string, string>;
  for (const [id, problem] of Object.entries(criteria)) out[id] = PROBLEMS.includes(problem) ? (problem as ScoreProblem) : 'MISSING';
  const free = details?.score10;
  if (typeof free === 'string') out.score10 = PROBLEMS.includes(free) ? (free as ScoreProblem) : 'MISSING';
  return out;
}

/**
 * Logic của màn chấm (app.md §3 `ReviewSubmit`, §4 "Nộp chấm"): nạp lượt của MÌNH, giữ nháp, kiểm điểm/nhận xét TRƯỚC khi gọi API, gửi
 * kèm `Idempotency-Key`, và đọc `REVIEW_001/002/003/006` + `RES_003` thành trạng thái đúng chỗ.
 *
 * ⚠️ `Idempotency-Key`: BE lưu MỌI phản hồi 4xx kết luận trong 24 giờ theo khoá. Dùng lại khoá cho payload ĐÃ SỬA sau một lỗi `REVIEW_002`
 * là nhận lại đúng lỗi cũ — nên chỉ giữ khoá khi thử lại CÙNG payload sau lỗi TẠM (mất mạng/5xx); còn lại sinh khoá mới.
 */
export function useReviewSubmitForm({ boardId, onSubmitted, taskId }: { boardId: string; onSubmitted: () => void; taskId: string }) {
  const reviews = useTaskReviews(taskId);
  const submit = useSubmitReview(taskId);
  const offline = useConnectionState() === 'offline';
  const round = reviews.data?.currentRound ?? null;
  const mine = reviews.data?.myReview ?? null;
  const { clear, draft, update } = useReviewDraft(mine?.id ?? '');
  const [attempted, setAttempted] = useState(false);
  const [closed, setClosed] = useState(false);
  const [error, setError] = useState<ReviewFormError | null>(null);
  const [serverProblems, setServerProblems] = useState<Record<string, ScoreProblem>>({});
  const attempt = useRef<{ key: string; retriable: boolean; signature: string } | null>(null);

  const rubric = round?.rubric ?? [];
  const localProblems = scoreProblems(rubric, draft.score);
  const problems = { ...localProblems, ...serverProblems };
  const feedback = draft.feedback.trim();
  const feedbackMissing = draft.decision === 'REQUEST_CHANGES' && feedback === '';

  let state: ReviewSubmitState = 'ready';
  if (reviews.isPending) state = 'loading';
  else if (getHttpStatus(reviews.error) === 404) state = 'notFound';
  else if (!reviews.data) state = 'error';
  else if (closed || (mine?.status === 'PENDING' && round?.status !== 'OPEN')) state = 'closed';
  else if (!mine || !round) state = 'noReview';
  else if (mine.status !== 'PENDING') state = mine.status === 'CANCELLED' || mine.status === 'REASSIGNED' ? 'closed' : 'submitted';

  const ready = state === 'ready' && !!mine && !!round;
  const canSubmit = ready && draft.decision !== null && Object.keys(problems).length === 0 && !feedbackMissing && !offline;

  const keyFor = (signature: string): string => {
    const last = attempt.current;
    if (last && last.signature === signature && last.retriable) return last.key;
    attempt.current = { key: newIdempotencyKey('rv'), retriable: false, signature };
    return attempt.current.key;
  };

  const onFailure = (failure: unknown) => {
    const code = getErrorCode(failure);
    const status = getHttpStatus(failure);
    if (attempt.current) attempt.current.retriable = status === undefined || status >= 500;
    if (code === 'REVIEW_001') return setClosed(true);
    if (code === 'REVIEW_002') setServerProblems(problemsFromError(failure));
    if (code === 'RES_003') void reviews.refetch();
    setError({ code, message: code === 'RES_003' ? 'Lượt chấm vừa thay đổi ở nơi khác. Đã tải lại — kiểm tra rồi gửi lại.' : reviewErrorMessage(failure) });
  };

  const onSubmit = () => {
    setAttempted(true);
    if (!canSubmit || !mine || !draft.decision || submit.isPending) return;
    setError(null);
    setServerProblems({});
    const payload: SubmitReviewPayload = {
      ...scorePayload(rubric, draft.score),
      expectedVersion: mine.version,
      ...(feedback ? { feedback } : {}),
      status: draft.decision,
    };
    submit.mutate(
      { boardId, idempotencyKey: keyFor(JSON.stringify(payload)), payload, review: mine },
      {
        onError: onFailure,
        onSuccess: () => {
          clear();
          showToast('success', 'Đã gửi kết quả chấm');
          onSubmitted();
        },
      },
    );
  };

  const edit = (patch: Parameters<typeof update>[0]) => {
    setServerProblems({});
    setError(null);
    update(patch);
  };

  return {
    attempted,
    canSubmit,
    decision: draft.decision as ReviewDecision | null,
    draft,
    edit,
    error,
    feedbackMissing,
    isSubmitting: submit.isPending,
    mine,
    offline,
    onSubmit,
    preview: previewScore(rubric, draft.score),
    problems,
    refetch: () => void reviews.refetch(),
    round,
    rubric,
    state,
  };
}
