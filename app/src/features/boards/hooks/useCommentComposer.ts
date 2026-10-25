import { useMemo, useState } from 'react';

import { toErrorMessage } from '@/core/api/client.helpers';
import { useUploadStore } from '@/core/uploads/upload.store';
import type { PickedFile } from '@/core/uploads/upload.types';
import { useUpload } from '@/core/uploads/use-upload';
import { useAuthStore } from '@/shell/store/slices/auth';
import { showToast } from '@/shared/utils/toast.utils';

import type { CreateCommentPayload } from '../api/task-detail.types';
import { FALLBACK_TASK_LIMITS } from '../constants/task-detail.constants';
import { useSendComment } from '../queries/task-comments.queries';
import { draftKeyOf, EMPTY_DRAFT, useTaskDraftStore } from '../store/task-comment-drafts.store';
import { getErrorCode, getErrorDetails } from '../utils/error-details';
import { newIdempotencyKey } from '../utils/idempotency-key';
import { serializeMentions } from '../utils/mention-compose';
import { useMentionInput } from './useMentionInput';

const SETTLED = new Set(['ready', 'failed', 'cancelled']);

interface Options {
  boardId: string;
  canComment: boolean;
  taskId: string;
}

/**
 * Nghiệp vụ ô soạn bình luận (app.md §2 `TaskCommentComposer`): nháp trong bộ nhớ theo (người, thẻ),
 * nhắc tên `@`, đính kèm `TASK_COMMENT`, gửi optimistic với `clientCommentId` sinh MỘT LẦN lúc bấm Gửi.
 *
 * Gửi xong là xoá nháp + gỡ tệp `READY` khỏi khay NGAY (bong bóng "Đang gửi" đã hiện ở luồng). Riêng
 * `TASK_014` (người được nhắc không thuộc nhóm, PM2-16) là lỗi định danh: NHÉT LẠI nháp + tệp, tô đỏ
 * đúng người bị từ chối và chặn Gửi cho tới khi người dùng bỏ họ khỏi câu.
 */
export function useCommentComposer({ boardId, canComment, taskId }: Options) {
  const userId = useAuthStore((state) => state.user?.id ?? '');
  const key = draftKeyOf(userId, taskId);
  const draft = useTaskDraftStore((state) => state.drafts[key]) ?? EMPTY_DRAFT;
  const sender = useSendComment(taskId);
  const uploads = useUpload('TASK_COMMENT', `task-comment:${taskId}`);
  const [invalidIds, setInvalidIds] = useState<string[]>([]);

  const mention = useMentionInput({
    boardId,
    enabled: canComment,
    state: draft,
    onChange: (next) => useTaskDraftStore.getState().setDraft(key, next),
  });

  const serialized = useMemo(
    () => serializeMentions(draft.text, draft.picks),
    [draft.picks, draft.text],
  );
  const readyItems = uploads.items.filter((item) => item.status === 'ready' && item.assetId);
  const busy = uploads.items.some((item) => !SETTLED.has(item.status));
  // BE đếm giới hạn trên chuỗi ĐÃ có marker `@{u:<24 hex>}`, dài hơn `@Tên` nhiều — đếm theo điểm mã.
  const length = [...serialized.content].length;
  const overLimit = length > FALLBACK_TASK_LIMITS.commentMax;
  const invalidLabels = serialized.used
    .filter((pick) => invalidIds.includes(pick.userId))
    .map((pick) => pick.label);
  const hasContent = draft.text.trim().length > 0 || readyItems.length > 0;
  const canSend = canComment && hasContent && !busy && !overLimit && invalidLabels.length === 0;
  const remaining = Math.max(0, FALLBACK_TASK_LIMITS.commentAttachmentsMax - uploads.items.length);

  const send = () => {
    if (!canSend) return;
    const { content, mentions, used } = serialized;
    const payload: CreateCommentPayload = {
      attachmentAssetIds: readyItems.flatMap((item) => (item.assetId ? [item.assetId] : [])),
      clientCommentId: newIdempotencyKey('cm'),
      content: content.trim(),
      mentions,
    };
    const snapshot = { draft, items: readyItems };
    useTaskDraftStore.getState().clearDraft(key);
    readyItems.forEach((item) => useUploadStore.getState().removeItem(item.localId));
    setInvalidIds([]);

    sender
      .mutateAsync({
        mentions: used.map((pick) => ({
          label: pick.label,
          targetId: pick.userId,
          type: 'USER' as const,
        })),
        payload,
      })
      .catch((error: unknown) => {
        if (getErrorCode(error) !== 'TASK_014') {
          // Bong bóng đã thành "Lỗi" với nút Thử lại; nói thêm LÝ DO (mạng, hạn mức 10/phút…).
          showToast('error', toErrorMessage(error));
          return;
        }
        // Chỉ nhét lại khi người dùng chưa gõ nháp mới trong lúc chờ — không ghi đè chữ mới.
        if (useTaskDraftStore.getState().drafts[key] === undefined) {
          useTaskDraftStore.getState().setDraft(key, snapshot.draft);
        }
        snapshot.items.forEach((item) => useUploadStore.getState().addItem(item));
        const ids = getErrorDetails(error)?.invalidMentions;
        setInvalidIds(
          Array.isArray(ids)
            ? ids.filter((id): id is string => typeof id === 'string')
            : used.map((pick) => pick.userId),
        );
      });
  };

  const addFiles = (files: PickedFile[]) => {
    if (files.length === 0) return;
    if (files.length > remaining) {
      showToast(
        'warning',
        `Mỗi bình luận tối đa ${FALLBACK_TASK_LIMITS.commentAttachmentsMax} tệp`,
      );
    }
    uploads.enqueue(files.slice(0, remaining));
  };

  return {
    addFiles,
    busy,
    canSend,
    draft,
    invalidLabels,
    length,
    mention,
    overLimit,
    send,
    uploads: {
      cancel: uploads.cancel,
      items: uploads.items,
      remove: (localId: string) => useUploadStore.getState().removeItem(localId),
      retry: uploads.retry,
    },
  };
}
