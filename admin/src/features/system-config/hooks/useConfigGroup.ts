import { useMemo, useState } from 'react';

import { useZodForm } from '@/shared/ui';

import { useResetSystemConfig, useUpdateSystemConfig } from '../service/system-config.queries';
import type { SystemConfigItem } from '../types/system-config.types';
import { configErrorCode, outOfRangeDetails } from '../utils/config-errors';
import { formKeyOf } from '../utils/config-fields';
import {
  buildFormSchema,
  buildOverride,
  formToEffective,
  editableFields,
  toFormValues,
  type ConfigFormValues,
} from '../utils/config-form';

interface UseConfigGroupArgs {
  item: SystemConfigItem;
  /** Tải lại danh sách và trả bản mới của khoá này (để giữ giá trị đang nhập). */
  onReload: (key: string) => Promise<SystemConfigItem | undefined>;
}

/**
 * Trạng thái + hành động của MỘT nhóm `limits.*` (form, phiên bản nền, xung
 * đột, lưu/khôi phục).
 *
 * `baseVersion` là phiên bản mà form đang dựa vào — gửi làm `expectedVersion`.
 * Tách khỏi `item.version`: admin khác lưu xong thì `item.version` nhảy nhưng
 * ô đang nhập vẫn dựa trên bản cũ ⇒ banner "vừa được người khác thay đổi"
 * thay vì lặng lẽ ghi đè; "Tải lại" chuyển `baseVersion` sang bản mới mà KHÔNG
 * xoá giá trị đang gõ.
 */
export function useConfigGroup({ item, onReload }: UseConfigGroupArgs) {
  const fields = useMemo(() => editableFields(item), [item]);
  const schema = useMemo(() => buildFormSchema(fields), [fields]);
  // `values` + keepDirtyValues: form THEO server khi chưa sửa; ô đang gõ dở được giữ nguyên
  // (đúng yêu cầu 'giữ giá trị đang nhập để so' khi admin khác vừa lưu).
  const serverValues = useMemo(() => toFormValues(item), [item]);
  const form = useZodForm<ConfigFormValues>(schema, {
    defaultValues: serverValues,
    values: serverValues,
    resetOptions: { keepDirtyValues: true },
  });
  const update = useUpdateSystemConfig();
  const reset = useResetSystemConfig();

  const [baseVersion, setBaseVersion] = useState(item.version);
  const [conflict, setConflict] = useState(false);
  const [pending, setPending] = useState<ConfigFormValues | null>(null);

  const isDirty = form.formState.isDirty;

  // Admin khác vừa lưu mà form còn sạch → theo bản mới, khỏi bắt bấm 'Tải lại'.
  // 'Điều chỉnh state trong lúc render' (không dùng effect): chỉ so khi phiên bản
  // server đổi, dirty/conflict là điều kiện đọc tại thời điểm đó.
  const [seenVersion, setSeenVersion] = useState(item.version);
  if (item.version !== seenVersion) {
    setSeenVersion(item.version);
    if (!isDirty && !conflict) setBaseVersion(item.version);
  }
  const showConflict = conflict || (item.version !== baseVersion && isDirty);

  const adopt = (fresh: SystemConfigItem) => {
    form.reset(toFormValues(fresh));
    setBaseVersion(fresh.version);
    setConflict(false);
  };

  const reload = async () => {
    const fresh = await onReload(item.key);
    if (!fresh) return;
    form.reset(toFormValues(fresh), { keepDirtyValues: true });
    setBaseVersion(fresh.version);
    setConflict(false);
  };

  const save = async (reason: string) => {
    if (!pending) return;
    try {
      const res = await update.mutateAsync({
        key: item.key,
        value: buildOverride(item, pending),
        expectedVersion: baseVersion,
        reason,
      });
      adopt(res.data);
    } catch (err) {
      const code = configErrorCode(err);
      if (code === 'RES_003') {
        setConflict(true); // đóng modal, banner hiện
        return;
      }
      if (code === 'CFG_002') {
        const d = outOfRangeDetails(err);
        if (d) {
          form.setError(formKeyOf(d.path), {
            type: 'server',
            message: 'Giá trị nằm ngoài giới hạn cho phép',
          });
        }
        return;
      }
      throw err; // giữ modal mở; toast chung đã hiện
    }
  };

  const restoreDefaults = async (reason: string) => {
    try {
      const res = await reset.mutateAsync({ key: item.key, expectedVersion: baseVersion, reason });
      adopt(res.data);
    } catch (err) {
      if (configErrorCode(err) === 'RES_003') {
        setConflict(true);
        return;
      }
      throw err;
    }
  };

  const before = useMemo(() => formToEffective(fields, toFormValues(item)), [fields, item]);
  const after = useMemo(
    () => formToEffective(fields, pending ?? toFormValues(item)),
    [fields, item, pending],
  );

  return {
    form,
    fields,
    isDirty,
    showConflict,
    isSaving: update.isPending,
    hasOverride: Object.keys(item.stored).length > 0,
    before,
    after,
    setPending,
    reload,
    save,
    restoreDefaults,
  };
}
