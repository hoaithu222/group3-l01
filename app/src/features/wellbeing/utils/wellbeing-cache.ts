import type { QueryClient } from '@tanstack/react-query';

import type { WellbeingAlertPayload, WellbeingSetting } from '../api/wellbeing.types';
import { wellbeingKeys } from '../queries/wellbeing.keys';

/**
 * Vá cache cài đặt (`GET /me/wellbeing`) — nguồn DUY NHẤT của "đang có cảnh báo chờ" cho cả thẻ nổi lẫn màn Sức khoẻ, nên bấm "Đã hiểu" ở đâu thì
 * chỗ còn lại cũng tắt theo. Không có store riêng (app.md p7-03 §5 tả `wellbeing.store.ts`): cache React Query đã nằm ở bộ nhớ và bị `queryClient.clear()`
 * khi đăng xuất — thêm một store nữa là thêm một chỗ phải khai ở `user-scoped-stores` mà không được gì.
 */
const patchSetting = (
  client: QueryClient,
  patch: (old: WellbeingSetting) => WellbeingSetting,
): void => {
  client.setQueryData<WellbeingSetting>(wellbeingKeys.setting(), (old) => (old ? patch(old) : old));
};

/**
 * Socket `wellbeing:alert` → đặt `pendingAlert` ngay (không đợi một vòng GET). Chỉ khi ĐANG bật và còn cho phép nhắc: sự kiện tới muộn sau khi người dùng
 * đã tắt (ở máy khác) thì không được bật lại thẻ. Cache chưa có ⇒ bỏ qua — lượt làm mới sau đó lấy `pendingAlert` từ BE.
 */
export function applyAlertPayload(client: QueryClient, payload: WellbeingAlertPayload): void {
  patchSetting(client, (old) =>
    old.enabled && old.alertsEnabled
      ? {
          ...old,
          pendingAlert: {
            id: payload.assessmentId,
            level: payload.level,
            suggestion: payload.suggestion,
          },
        }
      : old,
  );
}

/** Gỡ cảnh báo chờ (lạc quan khi bấm "Đã hiểu"/"Nhắc lại sau"). Chỉ gỡ ĐÚNG cảnh báo `id` — cảnh báo mới hơn vừa tới thì giữ. */
export function clearPendingAlert(client: QueryClient, id: string): void {
  patchSetting(client, (old) =>
    old.pendingAlert?.id === id ? { ...old, pendingAlert: null } : old,
  );
}

export function patchAlertsEnabled(client: QueryClient, alertsEnabled: boolean): void {
  patchSetting(client, (old) => ({ ...old, alertsEnabled }));
}

/**
 * Sau khi TẮT theo dõi (BE xoá hết): ghi nhận cài đặt trả về và bỏ mọi lịch sử khỏi bộ nhớ NGAY — dữ liệu đã xoá ở máy chủ không được còn nằm trên máy.
 * `removeQueries` chứ không `invalidate`: invalidate giữ dữ liệu cũ hiện tiếp trong lúc chờ tải lại.
 */
export function applyOptedOut(client: QueryClient, setting: WellbeingSetting): void {
  client.setQueryData<WellbeingSetting>(wellbeingKeys.setting(), setting);
  client.removeQueries({ queryKey: wellbeingKeys.historyAll() });
}

/** Sau khi XOÁ DỮ LIỆU (giữ trạng thái bật): mất đánh giá + cảnh báo chờ + lịch sử; cài đặt còn lại giữ nguyên. */
export function applyDataDeleted(client: QueryClient): void {
  patchSetting(client, (old) => ({ ...old, latest: null, pendingAlert: null }));
  client.removeQueries({ queryKey: wellbeingKeys.historyAll() });
}
