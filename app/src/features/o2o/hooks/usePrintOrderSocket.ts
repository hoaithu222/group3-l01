import { useQueryClient } from '@tanstack/react-query';

import { SocketEvent, useSocketEvent } from '@/core/socket';
import { useAuthStore } from '@/shell/store/slices/auth';

import type { PrintOrderUpdatedPayload, PrintOrderView } from '../api/o2o.types';
import { o2oKeys } from '../queries/o2o.keys';
import { isTerminalStatus } from '../utils/order-status';
import { clearPin } from '../utils/pin-vault';

/** Nút thao tác KHÔNG được đoán ở app (server tính `myActions` từ máy trạng thái) — trong nhịp giữa tin socket và lượt tải lại, ẩn hết cho chắc. */
const NO_ACTIONS = { canEdit: false, canSubmit: false, canCancel: false, canRegeneratePin: false };

/**
 * Đồng bộ đơn in theo `print-order:updated` (app.md §4). Gắn MỘT lần ở `me/o2o/_layout.tsx` nên mọi màn của feature đều được cập nhật.
 *
 *  1. Ghi ngay `status`/`pages`/`version` vào cache `['o2o','order',id]` — màn vé đổi chữ trạng thái tức thì. Chỉ khi phiên bản của tin
 *     KHÔNG cũ hơn bản đang giữ (tin đến trễ/đảo thứ tự không được kéo trạng thái lùi).
 *  2. `invalidate` để lấy phần socket không mang (báo giá, dòng thời gian, `myActions`) — payload cố ý mỏng (không PIN, không tệp).
 *  3. Đơn đã KẾT THÚC (nhận xong/từ chối/huỷ/hết hạn) ⇒ xoá PIN khỏi kho khoá: PIN hết tác dụng, để lại là thừa một bí mật trên máy.
 *
 * ⚠️ Khác `be.md` §6: payload thật KHÔNG có `v:1` và không luôn có `quote` — xem `PrintOrderUpdatedPayload`.
 */
export function usePrintOrderSocket(): void {
  const queryClient = useQueryClient();
  const userId = useAuthStore((state) => state.user?.id);

  useSocketEvent<PrintOrderUpdatedPayload>(SocketEvent.PRINT_ORDER_UPDATED, (payload) => {
    if (!payload?.id) return;

    const key = o2oKeys.order(payload.id);
    const cached = queryClient.getQueryData<PrintOrderView>(key);
    if (cached && payload.version >= cached.version) {
      queryClient.setQueryData<PrintOrderView>(key, {
        ...cached,
        status: payload.status,
        pages: payload.pages ?? cached.pages,
        version: payload.version,
        updatedAt: payload.updatedAt,
        ...(payload.pageCountError !== undefined && { pageCountError: payload.pageCountError }),
        myActions: payload.status === cached.status ? cached.myActions : NO_ACTIONS,
      });
    }
    void queryClient.invalidateQueries({ queryKey: key });
    void queryClient.invalidateQueries({ queryKey: o2oKeys.ordersAll() });

    if (userId && isTerminalStatus(payload.status)) void clearPin(userId, payload.id);
  });
}
