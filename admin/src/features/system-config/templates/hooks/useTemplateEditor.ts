import type { AxiosError } from 'axios';
import { useMemo, useState } from 'react';
import { useWatch } from 'react-hook-form';

import { extractErrorMessage, getMessageByCode } from '@/core/api/error.handler';
import { useDisclosure } from '@/shared/hooks';
import { useServerErrors, useZodForm } from '@/shared/ui';
import { showToast } from '@/shared/utils/toast.utils';

import { templateFormSchema, type TemplateFormValues } from '../schemas/template.schema';
import { useUpdateWorkspaceTemplate } from '../service/templates.queries';
import type { TemplateUpdateFields, WorkspaceTemplate } from '../types/templates.types';
import { serverFieldErrors, templateErrorCode } from '../utils/template-errors';
import { diffTemplate, toTemplateForm } from '../utils/template-form';

interface UseTemplateEditorArgs {
  template: WorkspaceTemplate;
  /** Tải lại danh sách và trả bản mới của mẫu này (`undefined` = mẫu không còn). */
  onReload: () => Promise<WorkspaceTemplate | undefined>;
  /** Mẫu không còn trên máy chủ (`TPL_001`) — đóng ngăn kéo. */
  onMissing: () => void;
}

/**
 * Vòng đời sửa MỘT mẫu trong ngăn kéo: form Zod, phần thay đổi so với bản server, hộp thoại lý do, `expectedVersion`,
 * banner xung đột 409 và lỗi 400 gắn đúng ô. Cùng luật với `useJsonConfigField` của cấu hình chung.
 *
 * `baseVersion` là phiên bản form đang dựa vào (gửi làm `expectedVersion`). Admin khác lưu xong thì `template.version`
 * nhảy nhưng form đang gõ dở vẫn dựa bản cũ ⇒ banner thay vì lặng lẽ ghi đè; form còn sạch thì tự theo bản mới.
 */
export function useTemplateEditor({ template, onReload, onMissing }: UseTemplateEditorArgs) {
  const update = useUpdateWorkspaceTemplate();
  const saveModal = useDisclosure();

  const serverValues = useMemo(() => toTemplateForm(template), [template]);
  // `values` + keepDirtyValues: form THEO server khi chưa sửa; ô đang gõ dở được giữ nguyên.
  const form = useZodForm<TemplateFormValues>(templateFormSchema, {
    defaultValues: serverValues,
    values: serverValues,
    resetOptions: { keepDirtyValues: true },
  });
  const { rootError } = useServerErrors(form);

  const watched = useWatch({ control: form.control }) as TemplateFormValues;
  const patch = useMemo(() => diffTemplate(watched, template), [watched, template]);
  const hasChanges = Object.keys(patch).length > 0;

  const [baseVersion, setBaseVersion] = useState(template.version);
  const [conflict, setConflict] = useState(false);
  const [pending, setPending] = useState<TemplateUpdateFields | null>(null);

  // 'Điều chỉnh state trong lúc render' (không dùng effect) — cùng cách `useJsonConfigField`.
  const [seenVersion, setSeenVersion] = useState(template.version);
  if (template.version !== seenVersion) {
    setSeenVersion(template.version);
    if (!hasChanges && !conflict) setBaseVersion(template.version);
  }
  const showConflict = conflict || (template.version !== baseVersion && hasChanges);

  /** Bấm "Lưu": kiểm Zod rồi mở hộp thoại lý do cho phần thay đổi. */
  const requestSave = form.handleSubmit(() => {
    if (!hasChanges) return;
    setPending(patch);
    saveModal.open();
  });

  /** `VAL_001`: gắn lỗi vào ô tương ứng (BE chỉ báo trường cấp 1); không đọc được thì để lỗi chung ở cuối form. */
  const showServerValidation = (err: unknown) => {
    const fields = serverFieldErrors(err);
    if (fields.length === 0) {
      form.setError('root', { type: 'server', message: extractErrorMessage(err as AxiosError) });
      return;
    }
    for (const { field, message } of fields) form.setError(field, { type: 'server', message });
  };

  const confirmSave = async (reason: string) => {
    if (!pending) return;
    try {
      const res = await update.mutateAsync({
        code: template.code,
        ...pending,
        expectedVersion: baseVersion,
        reason,
      });
      setBaseVersion(res.data.version);
      setConflict(false);
      setPending(null);
      // `resetOptions.keepDirtyValues` của form cũng áp cho `reset()` gọi tay — ô vừa lưu (còn khoảng trắng đầu/cuối người dùng gõ)
      // sẽ bị coi là "đang sửa dở" và giữ nguyên giá trị cũ. Ghi đè tường minh để form khớp đúng bản server vừa trả về.
      form.reset(toTemplateForm(res.data), { keepDirtyValues: false });
    } catch (err) {
      const code = templateErrorCode(err);
      if (code === 'RES_003') {
        setConflict(true); // đóng hộp thoại, banner hiện — giữ nguyên dữ liệu đang nhập
        return;
      }
      if (code === 'TPL_001') {
        showToast('error', getMessageByCode(code));
        onMissing();
        return;
      }
      if (code === 'VAL_001') {
        showServerValidation(err);
        return;
      }
      throw err; // giữ hộp thoại mở để thử lại; toast chung đã hiện
    }
  };

  const reload = async () => {
    const fresh = await onReload();
    if (!fresh) {
      onMissing();
      return;
    }
    setBaseVersion(fresh.version);
    setConflict(false);
  };

  return {
    form,
    patch,
    hasChanges,
    rootError,
    showConflict,
    isSaving: update.isPending,
    saveModal,
    requestSave,
    confirmSave,
    reload,
  };
}
