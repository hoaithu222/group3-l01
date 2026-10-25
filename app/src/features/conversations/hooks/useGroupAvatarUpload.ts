import { useEffect, useRef } from 'react';

import { useDisplayImageUpload, type DisplayImageUpload } from '@/core/uploads/use-display-image-upload';

import { usePatchConversation } from './usePatchConversation';

/**
 * Đổi ảnh NHÓM ĐÃ TỒN TẠI (`GroupAvatarPicker`, dựng trong `GroupInfo` — DIRECT không có avatar riêng nên không
 * dùng hook này, xem `DirectInfo`). Chọn/tải ảnh (`useDisplayImageUpload`, scope `AVATAR`, khoá
 * `group-avatar:<conversationId>` — hai nhóm mở cùng lúc trên `MessagesSplitLayout`, máy tính bảng, không thấy tệp
 * của nhau) rồi PATCH `avatarAssetId` qua `usePatchConversation` — hook đó ĐÃ tự vá `avatarUrl` mới vào mọi cache
 * liên quan khi thành công (danh sách, mục ghim, chi tiết), nên ở đây không cần làm gì thêm ngoài gọi `mutate`.
 *
 * `reset()` gọi ở CẢ HAI nhánh khi PATCH xong (`onSettled`) — cùng hợp đồng với `useAvatarUpload` (ảnh cá nhân):
 * thắng thì `conversation.avatarUrl` mới đã nằm trong cache, thua thì cache giữ ảnh cũ; ảnh cục bộ hết vai trò ở cả
 * hai trường hợp. Lỗi PATCH (mạng, lệch phiên bản…) không tự toast ở đây — `apiClient` đã toast chung MỘT LẦN.
 *
 * `uploadRef` phá vòng phụ thuộc hai chiều: `onSettled` của mutation cần gọi `upload.reset()`, còn `upload` lại cần
 * `mutation.mutate` làm `onReady` — cùng lý do với `useAvatarUpload`. Ghi `ref.current` trong `useEffect`, KHÔNG
 * thẳng lúc render — `react-hooks/refs` (ESLint) chặn ghi ref ngoài effect/handler.
 */
export function useGroupAvatarUpload(conversationId: string, expectedVersion: number): DisplayImageUpload {
  const patch = usePatchConversation(conversationId);
  const uploadRef = useRef<DisplayImageUpload | null>(null);

  const upload = useDisplayImageUpload({
    onReady: (assetId) =>
      patch.mutate(
        { avatarAssetId: assetId, expectedVersion },
        { onSettled: () => uploadRef.current?.reset() },
      ),
    slot: `group-avatar:${conversationId}`,
  });
  useEffect(() => {
    uploadRef.current = upload;
  });

  // Vòng chờ phải phủ suốt từ lúc nén ảnh tới lúc PATCH xong — cùng lý do với `useAvatarUpload.busy`.
  return { ...upload, busy: upload.busy || patch.isPending };
}
