import { useState } from 'react';

import { getMessageByCode } from '@/core/api/error.handler';
import { useDisclosure } from '@/shared/hooks';
import { showToast } from '@/shared/utils/toast.utils';

import { useResetSystemConfig, useUpdateSystemConfig } from '../service/system-config.queries';
import type { SystemConfigItem } from '../types/system-config.types';
import { configErrorCode } from '../utils/config-errors';

interface UseJsonConfigFieldArgs {
  item: SystemConfigItem;
  /** Form đang có thay đổi chưa lưu — quyết định banner "vừa được người khác thay đổi". */
  isDirty: boolean;
  /** Tải lại danh sách và trả bản mới của khoá này. */
  onReload: (key: string) => Promise<SystemConfigItem | undefined>;
  /** Gọi sau khi lưu/khôi phục THÀNH CÔNG với bản server mới — form nạp lại giá trị. */
  onAdopt: (fresh: SystemConfigItem) => void;
}

/**
 * Vòng đời lưu của MỘT khoá có field `json` (`pm.defaultColumns`, `resource.quotaOverrides`, p3-01/p3-02):
 * hộp thoại lý do, `expectedVersion`, banner xung đột, lưu/khôi phục mặc định. Cùng luật với `useConfigGroup`
 * nhưng KHÔNG dựng form — mỗi khoá tự có trình sửa riêng (danh sách cột, danh sách hạn mức).
 *
 * `baseVersion` là phiên bản mà form đang dựa vào (gửi làm `expectedVersion`). Admin khác lưu xong thì
 * `item.version` nhảy nhưng form đang gõ dở vẫn dựa bản cũ ⇒ banner thay vì lặng lẽ ghi đè; form còn
 * sạch thì tự theo bản mới.
 */
export function useJsonConfigField({ item, isDirty, onReload, onAdopt }: UseJsonConfigFieldArgs) {
  const update = useUpdateSystemConfig();
  const reset = useResetSystemConfig();
  const saveModal = useDisclosure();
  const resetModal = useDisclosure();

  const [baseVersion, setBaseVersion] = useState(item.version);
  const [conflict, setConflict] = useState(false);
  const [pending, setPending] = useState<Record<string, unknown> | null>(null);

  // 'Điều chỉnh state trong lúc render' (không dùng effect) — cùng cách `useConfigGroup`.
  const [seenVersion, setSeenVersion] = useState(item.version);
  if (item.version !== seenVersion) {
    setSeenVersion(item.version);
    if (!isDirty && !conflict) setBaseVersion(item.version);
  }
  const showConflict = conflict || (item.version !== baseVersion && isDirty);

  /** Chạy lời gọi ghi; 409 → banner (trả `null`), lỗi khác ném tiếp để modal giữ mở. */
  const run = async (call: () => Promise<{ data: SystemConfigItem }>): Promise<void> => {
    try {
      const res = await call();
      setBaseVersion(res.data.version);
      setConflict(false);
      onAdopt(res.data);
    } catch (err) {
      const code = configErrorCode(err);
      if (code === 'RES_003') {
        setConflict(true); // đóng modal, banner hiện
        return;
      }
      // `CFG_002` không toast ở hook chung (form thường gắn lỗi vào ô) — khoá json không có ô để gắn.
      if (code === 'CFG_002') showToast('error', getMessageByCode(code));
      throw err; // giữ modal mở; toast chung đã hiện
    }
  };

  /** Mở hộp thoại lý do cho phần `patch` (giá trị field json mới) — form đã qua kiểm tra. */
  const requestSave = (patch: Record<string, unknown>) => {
    setPending(patch);
    saveModal.open();
  };

  const confirmSave = async (reason: string) => {
    if (!pending) return;
    // Giữ nguyên các khoá lạ đã lưu mà form không hiển thị.
    await run(() =>
      update.mutateAsync({
        key: item.key,
        value: { ...item.stored, ...pending },
        expectedVersion: baseVersion,
        reason,
      }),
    );
  };

  const confirmRestore = async (reason: string) => {
    await run(() => reset.mutateAsync({ key: item.key, expectedVersion: baseVersion, reason }));
  };

  const reload = async () => {
    const fresh = await onReload(item.key);
    if (!fresh) return;
    setBaseVersion(fresh.version);
    setConflict(false);
  };

  return {
    saveModal,
    resetModal,
    showConflict,
    isSaving: update.isPending || reset.isPending,
    hasOverride: Object.keys(item.stored).length > 0,
    requestSave,
    confirmSave,
    confirmRestore,
    reload,
  };
}
