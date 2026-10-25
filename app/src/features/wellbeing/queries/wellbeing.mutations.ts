import { useMutation, useQueryClient } from '@tanstack/react-query';

import { wellbeingService } from '../api/wellbeing.service';
import type {
  AckAction,
  PreferredBreak,
  TakeBreakInput,
  UpdateWellbeingInput,
  WellbeingSetting,
} from '../api/wellbeing.types';
import {
  applyDataDeleted,
  applyOptedOut,
  clearPendingAlert,
  patchAlertsEnabled,
} from '../utils/wellbeing-cache';
import { isGone, isNotEnabled } from '../utils/wellbeing-errors';
import { wellbeingKeys } from './wellbeing.keys';

/**
 * Bật/tắt theo dõi. Tắt (`optIn: false`) ⇒ BE xoá dữ liệu, app bỏ luôn lịch sử khỏi bộ nhớ (`applyOptedOut`). ⚠️ KHÔNG chặn theo cờ `burnout`: rút lại luôn được phép.
 * Bật ⇒ làm mới lịch sử (app.md §4 "PUT opt-in → invalidate setting + assessments"): `setQueryData` cho cài đặt, `invalidate` cho phần còn lại.
 */
export function useUpdateWellbeing() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: UpdateWellbeingInput) => wellbeingService.update(input),
    onSuccess: (setting, input) => {
      if (!input.optIn) {
        applyOptedOut(client, setting);
        return;
      }
      client.setQueryData<WellbeingSetting>(wellbeingKeys.setting(), setting);
      void client.invalidateQueries({ queryKey: wellbeingKeys.historyAll() });
    },
  });
}

/**
 * Công tắc "Nhắc nhẹ khi cần nghỉ": đổi tức thì (lạc quan) và trả lại khi lỗi. Đi qua `PATCH` — lệnh CHỈ sửa cài đặt, không có `optIn`: tài khoản đã tắt ở máy khác thì BE trả 409 `WELL_001` và không
 * ghi gì, nên công tắc này KHÔNG BAO GIỜ bật lại theo dõi (`PUT` mới là đường duy nhất để bật, và chỉ màn giải thích gọi nó).
 * `WELL_001` ⇒ đọc `GET` MỘT lần để lấy trạng thái thật rồi vá cache về "tắt" (màn tự chuyển sang giải thích); lỗi khác ⇒ trả lại giá trị cũ. Không đọc được trạng thái thật (mất mạng ngay lúc đó) ⇒
 * trả giá trị cũ và đánh dấu cài đặt cũ để tải lại — không đoán.
 */
export function useSetAlertsEnabled() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (alertsEnabled: boolean) => wellbeingService.patch({ alertsEnabled }),
    onMutate: async (alertsEnabled) => {
      await client.cancelQueries({ queryKey: wellbeingKeys.setting() });
      const previous = client.getQueryData<WellbeingSetting>(wellbeingKeys.setting());
      patchAlertsEnabled(client, alertsEnabled);
      return { previous };
    },
    onError: async (error, _alertsEnabled, context) => {
      if (isNotEnabled(error)) {
        try {
          const actual = await wellbeingService.setting();
          if (actual.enabled)
            client.setQueryData<WellbeingSetting>(wellbeingKeys.setting(), actual);
          else applyOptedOut(client, actual);
          return;
        } catch {
          void client.invalidateQueries({ queryKey: wellbeingKeys.setting() });
        }
      }
      if (context?.previous) client.setQueryData(wellbeingKeys.setting(), context.previous);
    },
    onSuccess: (setting) => client.setQueryData<WellbeingSetting>(wellbeingKeys.setting(), setting),
  });
}

/** Xoá dữ liệu đã thu thập, GIỮ trạng thái bật (`DELETE /me/wellbeing/data`). Luôn dùng được, kể cả khi cờ `burnout` tắt. */
export function useDeleteWellbeingData() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: () => wellbeingService.deleteData(),
    onSuccess: () => applyDataDeleted(client),
  });
}

export interface AckVariables {
  action: AckAction;
  id: string;
}

/**
 * "Đã hiểu" / "Nhắc lại sau": gỡ cảnh báo khỏi màn NGAY (lạc quan — người đang mệt không phải nhìn vòng quay), lỗi thì trả lại thẻ. 404 (cảnh báo không còn — đã bấm ở máy
 * khác) coi như đã xong: giữ trạng thái đã gỡ. Sau cùng luôn đối chiếu lại với BE.
 */
export function useAckAlert() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ action, id }: AckVariables) => wellbeingService.ack(id, action),
    onMutate: async ({ id }) => {
      await client.cancelQueries({ queryKey: wellbeingKeys.setting() });
      const previous = client.getQueryData<WellbeingSetting>(wellbeingKeys.setting());
      clearPendingAlert(client, id);
      return { previous };
    },
    onError: (error, _variables, context) => {
      if (isGone(error)) return;
      if (context?.previous) client.setQueryData(wellbeingKeys.setting(), context.previous);
    },
    onSettled: () => {
      void client.invalidateQueries({ queryKey: wellbeingKeys.setting() });
    },
  });
}

/**
 * Giờ làm/nghỉ mong muốn (P1, app.md §3 "Cài đặt"). Đi qua `PATCH` như "Nhắc nhẹ" — không bao giờ bật lại theo dõi; `WELL_001` (đã tắt ở
 * máy khác) thì đọc `GET` một lần để về đúng trạng thái tắt, cùng cách `useSetAlertsEnabled`.
 */
export function useSetPreferredBreak() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (preferredBreak: PreferredBreak | null) =>
      wellbeingService.patch({ preferredBreak }),
    onError: async (error) => {
      if (!isNotEnabled(error)) return;
      try {
        const actual = await wellbeingService.setting();
        if (actual.enabled) client.setQueryData<WellbeingSetting>(wellbeingKeys.setting(), actual);
        else applyOptedOut(client, actual);
      } catch {
        void client.invalidateQueries({ queryKey: wellbeingKeys.setting() });
      }
    },
    onSuccess: (setting) => client.setQueryData<WellbeingSetting>(wellbeingKeys.setting(), setting),
  });
}

/** P1 — TakeABreakWidget báo đã nghỉ xong (`POST /me/wellbeing/break`). Không có cache nào để vá — BE không lưu bản ghi riêng. */
export function useTakeBreak() {
  return useMutation({
    mutationFn: (input: TakeBreakInput) => wellbeingService.takeBreak(input),
  });
}

// P1 chia sẻ mức rủi ro với nhóm (`useShareWorkspace`/`useUnshareWorkspace`) nằm ở `wellbeing-share.mutations.ts` — tách để
// mỗi file ≤ 150 dòng (`check:file-size`); hai hook đó chỉ đụng cache `wellbeingKeys.shares()`, không dính cài đặt ở đây.
