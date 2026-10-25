import { useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';

import { showToast } from '@/shared/utils/toast.utils';

import { savedKeys } from './saved.keys';
import { savedMessagesService } from './saved.service';
import { useSavedMessagesStore } from './saved.store';

export interface UseSaveActionsResult {
  /** Lưu/bỏ lưu theo ý muốn. Trả `true` khi server chấp nhận, `false` khi lỗi (đã hoàn tác cờ lạc quan). */
  setSaved: (messageId: string, saved: boolean) => Promise<boolean>;
  /** Đảo trạng thái theo cờ ĐANG biết ở thời điểm gọi (đọc từ store, không từ closure của lần vẽ cũ). */
  toggle: (messageId: string) => Promise<boolean>;
}

/**
 * Lưu/bỏ lưu có LẠC QUAN + hoàn tác (app.md p1-09 §4 `useToggleSave`). Nhãn menu "Lưu"/"Bỏ lưu" đổi ngay khi bấm;
 * server từ chối (tin thu hồi, không đọc được, đủ 1.000 tin, quá nhanh) thì cờ quay lại như cũ — interceptor đã toast
 * lý do, hook này chỉ toast KHI THÀNH CÔNG (menu vừa đóng, người dùng cần một dấu hiệu là đã lưu).
 */
export function useSaveActions(): UseSaveActionsResult {
  const queryClient = useQueryClient();

  const setSaved = useCallback(
    async (messageId: string, saved: boolean): Promise<boolean> => {
      const { mark } = useSavedMessagesStore.getState();
      mark(messageId, saved);
      try {
        if (saved) await savedMessagesService.save(messageId);
        else await savedMessagesService.unsave(messageId);
      } catch {
        mark(messageId, !saved);
        return false;
      }
      showToast('success', saved ? 'Đã lưu tin nhắn' : 'Đã bỏ lưu tin nhắn');
      void queryClient.invalidateQueries({ queryKey: savedKeys.all });
      return true;
    },
    [queryClient],
  );

  const toggle = useCallback(
    (messageId: string) =>
      setSaved(messageId, useSavedMessagesStore.getState().ids[messageId] !== true),
    [setSaved],
  );

  return { setSaved, toggle };
}
