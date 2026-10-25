import { useCallback, useMemo, useState } from 'react';

import { useConnectionState } from '@/core/socket';
import { shouldRotateIdempotencyKey, useIdempotencyKey } from '@/shared/hooks/useIdempotencyKey';
import { hapticSuccess } from '@/shared/utils/haptics';
import type { TemplateApplyResult, TemplateSelection } from '@/shared/workspace-templates';
import { useFeature } from '@/shell/capabilities';

import type { TemplateChannelType } from '../api';
import {
  useApplyTemplate,
  useExistingChannelNames,
  useTemplates,
  useTemplateWorkspaceHead,
} from '../queries/workspace-templates.queries';
import { selectionSignature } from '../utils/selection';
import { planSkips } from '../utils/skip-plan';
import { describeTemplateError, type TemplateErrorInfo } from '../utils/template-errors';

const NO_TYPES: ReadonlySet<TemplateChannelType> = new Set();

/**
 * Toàn bộ logic màn "Áp mẫu cho nhóm" (tách khỏi JSX để màn giữ dưới trần dòng): vai trò/trạng thái nhóm, lựa chọn mẫu + kênh,
 * dự đoán kênh bị bỏ qua, `Idempotency-Key`, lỗi `TPL_*`, kết quả.
 *
 * `Idempotency-Key` sinh khi mở màn (`useIdempotencyKey`) và giữ nguyên cho cùng một lựa chọn — bấm "Áp mẫu" hai lần/mạng chậm chỉ
 * áp MỘT lần. ⚠️ BE lưu cả phản hồi 4xx theo khoá: sau `TPL_003` mà người dùng bỏ bớt kênh rồi áp lại với cùng khoá sẽ nhận lại
 * đúng lỗi cũ — nên khoá đổi sau mỗi phản hồi đã chốt (4xx hoặc thành công) và mỗi khi tập kênh đổi.
 */
export function useApplyTemplateScreen(workspaceId: string) {
  const head = useTemplateWorkspaceHead(workspaceId);
  const templates = useTemplates(true);
  const offline = useConnectionState() === 'offline';
  const voiceOn = useFeature('voice');
  const pomodoroOn = useFeature('pomodoro');

  const [selection, setSelection] = useState<TemplateSelection | null>(null);
  const [result, setResult] = useState<TemplateApplyResult | null>(null);
  const [error, setError] = useState<TemplateErrorInfo | null>(null);
  const { key: idempotencyKey, rotate } = useIdempotencyKey(
    'tpl-apply',
    selectionSignature(selection),
  );
  const apply = useApplyTemplate(workspaceId);

  const role = head.data?.myRole;
  const canApply = role === 'OWNER' || role === 'ADMIN';
  const isArchived = head.data?.status === 'ARCHIVED';
  const template = templates.data?.find((item) => item.code === selection?.code) ?? null;
  const existingNames = useExistingChannelNames(workspaceId, canApply && template !== null);

  // Cờ loại kênh CHƯA biết (`undefined`) thì không đoán "tắt" — chỉ báo khi chắc chắn.
  const disabledTypes = useMemo(() => {
    if (voiceOn !== false && pomodoroOn !== false) return NO_TYPES;
    const types = new Set<TemplateChannelType>();
    if (voiceOn === false) types.add('VOICE');
    if (pomodoroOn === false) types.add('POMODORO');
    return types;
  }, [voiceOn, pomodoroOn]);
  const skips = useMemo(
    () => (template ? planSkips(template, existingNames.data ?? [], disabledTypes) : undefined),
    [template, existingNames.data, disabledTypes],
  );

  const changeSelection = useCallback((next: TemplateSelection | null) => {
    setSelection(next);
    setError(null);
  }, []);

  const { refetch: refetchTemplates } = templates;
  const { mutate: applyMutate } = apply;
  const submit = useCallback(() => {
    if (!selection || selection.channelKeys.length === 0) return;
    setError(null);
    applyMutate(
      { channelKeys: selection.channelKeys, code: selection.code, idempotencyKey },
      {
        onError: (failure) => {
          const info = describeTemplateError(failure);
          setError(info);
          if (shouldRotateIdempotencyKey(failure)) rotate();
          if (info.kind === 'template-gone') {
            setSelection(null);
            void refetchTemplates();
          }
        },
        onSuccess: (data) => {
          hapticSuccess(); // áp mẫu xong — màn kết quả hiện ngay sau đó
          setResult(data);
          rotate();
        },
      },
    );
  }, [applyMutate, idempotencyKey, refetchTemplates, rotate, selection]);

  return {
    canApply,
    changeSelection,
    error,
    head,
    isApplying: apply.isPending,
    isArchived,
    offline,
    result,
    selection,
    skips,
    submit,
    template,
    templates,
  };
}
