import { useState } from 'react';

import { showToast } from '@/shared/utils/toast.utils';

import type { ReviewConfigDto } from '../api/reviews.types';
import { useSaveReviewConfig } from '../queries/reviews.queries';
import type { ReviewLimits } from '../schemas/review.schemas';
import { getErrorCode, getErrorDetails } from '../utils/error-details';
import { buildConfigPayload, configFieldErrors, isConfigDirty, validateReviewConfig } from '../utils/review-config-form';
import { reviewErrorMessage } from '../utils/review-text';
import { toRubricDrafts, type RubricDraft } from '../utils/rubric-draft';

/**
 * Trạng thái + lưu của màn Cài đặt chấm chéo (p4-05 app.md §3 `ReviewSettings`). Nháp khởi tạo MỘT LẦN từ cấu hình đã tải (màn cha dựng
 * component dùng hook này sau khi có dữ liệu) và KHÔNG bị ghi đè khi cấu hình tải lại — `RES_003` chỉ hiện banner + nhờ màn cha tải lại
 * `version` (`onConflict`), giữ nguyên chữ đang sửa. Lưu xong nạp lại nháp từ phản hồi để tiêu chí mới có `id` do BE cấp (lần lưu sau
 * không bị hiểu là "xoá + tạo lại").
 */
export function useReviewSettingsForm({
  boardId,
  config,
  limits,
  onConflict,
}: {
  boardId: string;
  config: ReviewConfigDto;
  limits: ReviewLimits;
  /** Gọi khi `RES_003` — màn cha tải lại cấu hình để lấy `version` mới. */
  onConflict: () => void;
}) {
  const save = useSaveReviewConfig(boardId);
  const [enabled, setEnabled] = useState(config.enabled);
  const [requiredReviews, setRequiredReviews] = useState(config.requiredReviews);
  const [drafts, setDrafts] = useState<RubricDraft[]>(() => toRubricDrafts(config.rubric));
  const [clientError, setClientError] = useState<string | null>(null);
  const [conflict, setConflict] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  /** `REVIEW_004 { rubric }` — câu lỗi hiện NGAY dưới danh sách tiêu chí (app.md §3: "lỗi tại trường"). */
  const [rubricError, setRubricError] = useState<string | null>(null);

  const form = { drafts, enabled, requiredReviews };
  const dirty = isConfigDirty(config, form);

  const onSave = () => {
    const problem = validateReviewConfig(form, limits);
    setClientError(problem);
    if (problem) return;
    setConflict(false);
    setServerError(null);
    setRubricError(null);
    save.mutate(buildConfigPayload(config, form), {
      onError: (error) => {
        const code = getErrorCode(error);
        if (code === 'RES_003') {
          setConflict(true);
          onConflict();
          return;
        }
        const fields = code === 'REVIEW_004' ? configFieldErrors(getErrorDetails(error)) : { other: null, rubric: null };
        setRubricError(fields.rubric);
        setServerError(fields.other ?? (fields.rubric ? null : reviewErrorMessage(error)));
      },
      onSuccess: (saved) => {
        setDrafts(toRubricDrafts(saved.rubric));
        setEnabled(saved.enabled);
        setRequiredReviews(saved.requiredReviews);
        showToast('success', 'Đã lưu cấu hình chấm chéo');
      },
    });
  };

  const edit = <T>(setter: (value: T) => void) => (value: T) => {
    setClientError(null);
    setter(value);
  };

  return {
    clientError,
    conflict,
    dirty,
    drafts,
    enabled,
    isSaving: save.isPending,
    onSave,
    requiredReviews,
    rubricError,
    serverError,
    setDrafts: edit((next: RubricDraft[]) => {
      setRubricError(null);
      setDrafts(next);
    }),
    setEnabled: edit(setEnabled),
    setRequiredReviews: edit(setRequiredReviews),
  };
}
